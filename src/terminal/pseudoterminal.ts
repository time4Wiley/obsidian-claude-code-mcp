import { spawn, ChildProcess } from "child_process";
import { Terminal } from "xterm";
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
    const shell = isWindows ? "cmd.exe" : args.executable;
    const shellArgs = isWindows ? [] : (args.args || []);

    return spawn(shell, shellArgs, {
      cwd: args.cwd,
      env: {
        ...process.env,
        ...args.env,
        TERM: args.terminal || "xterm-256color",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
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