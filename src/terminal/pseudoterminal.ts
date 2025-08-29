import { spawn, ChildProcess } from "child_process";
import { Terminal } from "@xterm/xterm";
import { Writable } from "stream";
import unixPseudoterminalPy from "./unix_pseudoterminal.py";

export interface Pseudoterminal {
  readonly shell?: Promise<ChildProcess> | undefined;
  readonly kill: () => Promise<void>;
  readonly onExit: Promise<NodeJS.Signals | number>;
  readonly pipe: (terminal: Terminal) => Promise<void>;
  readonly resize?: (columns: number, rows: number) => Promise<void>;
}

export interface PseudoterminalArgs {
  executable: string;
  args?: string[];
  cwd?: string;
  pythonExecutable?: string;
  terminal?: string;
  env?: NodeJS.ProcessEnv;
}

async function writePromise(stream: Writable, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(data, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export class UnixPseudoterminal implements Pseudoterminal {
  private static readonly CMDIO_FD = 3;
  public readonly shell: Promise<ChildProcess>;
  public readonly onExit: Promise<NodeJS.Signals | number>;

  constructor(args: PseudoterminalArgs) {
    this.shell = this.spawnPythonHelper(args);
    this.onExit = this.shell.then(shell => 
      new Promise(resolve => {
        shell.once("exit", (code, signal) => {
          resolve(code ?? signal ?? NaN);
        });
      })
    );
  }

  private async spawnPythonHelper(args: PseudoterminalArgs): Promise<ChildProcess> {
    const python = args.pythonExecutable || "python3";
    
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...args.env,
      PYTHONIOENCODING: "utf-8",
    };
    
    if (args.terminal) {
      env["TERM"] = args.terminal;
    }

    const child = spawn(
      python,
      ["-c", unixPseudoterminalPy, args.executable, ...(args.args || [])],
      {
        cwd: args.cwd,
        env,
        stdio: ["pipe", "pipe", "pipe", "pipe"], // stdin, stdout, stderr, cmdio
        windowsHide: true,
      }
    );

    // Log stderr for debugging
    child.stderr?.on("data", (chunk: Buffer) => {
      console.error("[PTY stderr]", chunk.toString());
    });

    return child;
  }

  async pipe(terminal: Terminal): Promise<void> {
    const shell = await this.shell;
    
    const reader = (chunk: Buffer | string): void => {
      try {
        terminal.write(chunk.toString());
      } catch (error: unknown) {
        console.error("[Terminal] Write error:", error);
      }
    };

    // Pipe shell output to terminal
    shell.stdout?.on("data", reader);
    shell.stderr?.on("data", reader);
    
    // Pipe terminal input to shell
    const disposable = terminal.onData(async (data: string) => {
      try {
        if (shell.stdin) {
          await writePromise(shell.stdin, data);
        }
      } catch (error) {
        console.error("[Terminal] Input error:", error);
      }
    });

    // Clean up on exit
    this.onExit.catch(() => {}).finally(() => {
      shell.stdout?.removeListener("data", reader);
      shell.stderr?.removeListener("data", reader);
      disposable.dispose();
    });
  }

  async resize(columns: number, rows: number): Promise<void> {
    try {
      const shell = await this.shell;
      const cmdio = shell.stdio[UnixPseudoterminal.CMDIO_FD] as Writable;
      
      if (cmdio) {
        await writePromise(cmdio, `${columns}x${rows}\n`);
      }
    } catch (error) {
      console.warn("[Terminal] Resize failed:", error);
    }
  }

  async kill(): Promise<void> {
    try {
      const shell = await this.shell;
      if (!shell.kill("SIGTERM")) {
        throw new Error("Failed to kill pseudoterminal");
      }
    } catch (error) {
      console.error("[Terminal] Kill failed:", error);
      throw error;
    }
  }
}

export class ChildProcessPseudoterminal implements Pseudoterminal {
  public readonly shell: Promise<ChildProcess>;
  public readonly onExit: Promise<NodeJS.Signals | number>;

  constructor(args: PseudoterminalArgs) {
    this.shell = this.spawnChildProcess(args);
    this.onExit = this.shell.then(shell => 
      new Promise(resolve => {
        shell.once("exit", (code, signal) => {
          resolve(code ?? signal ?? NaN);
        });
      })
    );
  }

  private async spawnChildProcess(args: PseudoterminalArgs): Promise<ChildProcess> {
    const isWindows = process.platform === "win32";
    
    // On Windows, use the provided executable (which will be PowerShell or cmd.exe)
    // On Unix, use the provided executable
    const shell = args.executable;
    const shellArgs = args.args || [];

    const child = spawn(shell, shellArgs, {
      cwd: args.cwd,
      env: {
        ...process.env,
        ...args.env,
        TERM: isWindows ? undefined : (args.terminal || "xterm-256color"),
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: false, // Show the window on Windows for debugging
    });

    // Set encoding for Windows to handle output properly
    if (isWindows) {
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
    }

    return child;
  }

  async pipe(terminal: Terminal): Promise<void> {
    const shell = await this.shell;
    const isWindows = process.platform === "win32";
    
    const reader = (chunk: Buffer | string): void => {
      try {
        let output = chunk.toString();
        
        // On Windows, normalize line endings for proper display
        if (isWindows) {
          // Convert standalone CR to CRLF, and ensure we don't double-convert
          output = output.replace(/\r(?!\n)/g, "\r\n");
        }
        
        terminal.write(output);
      } catch (error: unknown) {
        console.error("[Terminal] Write error:", error);
      }
    };

    // Pipe shell output to terminal
    shell.stdout?.on("data", reader);
    shell.stderr?.on("data", reader);
    
    // Pipe terminal input to shell
    const disposable = terminal.onData(async (data: string) => {
      try {
        if (shell.stdin) {
          // On Windows, convert Enter key (CR) to CRLF for proper command execution
          if (isWindows && data === "\r") {
            data = "\r\n";
          }
          await writePromise(shell.stdin, data);
        }
      } catch (error) {
        console.error("[Terminal] Input error:", error);
      }
    });

    // Clean up on exit
    this.onExit.catch(() => {}).finally(() => {
      shell.stdout?.removeListener("data", reader);
      shell.stderr?.removeListener("data", reader);
      disposable.dispose();
    });
  }

  async kill(): Promise<void> {
    try {
      const shell = await this.shell;
      if (!shell.kill("SIGTERM")) {
        throw new Error("Failed to kill child process");
      }
    } catch (error) {
      console.error("[Terminal] Kill failed:", error);
      throw error;
    }
  }
}