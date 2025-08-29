import { spawn, ChildProcess } from "child_process";
import { Terminal } from "@xterm/xterm";
import { Writable } from "stream";
import * as fs from "fs";
import unixPseudoterminalPy from "./unix_pseudoterminal.py";

// Dynamic import for node-pty to handle potential build issues
let nodePty: any = null;
try {
	// Try to load node-pty dynamically
	// This will work in development and when node-pty is available in production
	nodePty = require("node-pty");
	console.debug("[Terminal] node-pty loaded successfully");
} catch (error) {
	console.warn("[Terminal] node-pty not available (this is expected if not on Windows or module not installed):", error);
}

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
    
    // On Windows, use the provided executable (which will be PowerShell 7, PowerShell 5.1, or cmd.exe)
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

/**
 * Node-pty based pseudoterminal implementation for Windows
 * Provides proper PTY support using ConPTY on Windows
 */
export class NodePtyPseudoterminal implements Pseudoterminal {
  private ptyProcess: any; // IPty from node-pty
  private _onExit: Promise<NodeJS.Signals | number>;
  
  public get shell(): Promise<ChildProcess> | undefined {
    // node-pty doesn't expose a ChildProcess, return undefined
    return undefined;
  }
  
  public get onExit(): Promise<NodeJS.Signals | number> {
    return this._onExit;
  }
  
  // Public method to write directly to the PTY
  public write(data: string): void {
    this.ptyProcess.write(data);
  }
  
  constructor(args: PseudoterminalArgs) {
    if (!nodePty) {
      throw new Error("node-pty is not available");
    }
    
    const cols = 80; // Default columns
    const rows = 24; // Default rows
    
    // Create the PTY process
    this.ptyProcess = nodePty.spawn(args.executable, args.args || [], {
      name: args.terminal || "xterm-256color",
      cols,
      rows,
      cwd: args.cwd,
      env: args.env || process.env,
      useConpty: process.platform === "win32", // Use ConPTY on Windows
    });
    
    // Set up exit promise
    this._onExit = new Promise((resolve) => {
      this.ptyProcess.onExit(({ exitCode, signal }: any) => {
        resolve(exitCode ?? signal ?? NaN);
      });
    });
    
    console.debug(`[Terminal] Created node-pty process with PID: ${this.ptyProcess.pid}`);
  }
  
  async pipe(terminal: Terminal): Promise<void> {
    // Pipe PTY output to terminal
    this.ptyProcess.onData((data: string) => {
      try {
        terminal.write(data);
      } catch (error) {
        console.error("[Terminal] Write error:", error);
      }
    });
    
    // Pipe terminal input to PTY
    const disposable = terminal.onData((data: string) => {
      try {
        this.ptyProcess.write(data);
      } catch (error) {
        console.error("[Terminal] Input error:", error);
      }
    });
    
    // Handle terminal resize
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      try {
        this.ptyProcess.resize(cols, rows);
      } catch (error) {
        console.warn("[Terminal] Resize failed:", error);
      }
    });
    
    // Clean up on exit
    this._onExit.catch(() => {}).finally(() => {
      disposable.dispose();
      resizeDisposable.dispose();
    });
  }
  
  async resize(columns: number, rows: number): Promise<void> {
    try {
      this.ptyProcess.resize(columns, rows);
    } catch (error) {
      console.warn("[Terminal] Resize failed:", error);
    }
  }
  
  async kill(): Promise<void> {
    try {
      this.ptyProcess.kill();
    } catch (error) {
      console.error("[Terminal] Kill failed:", error);
      throw error;
    }
  }
}

/**
 * Helper functions for Windows terminal setup
 */
export function findGitBash(): string | undefined {
  const candidates = [
    process.env.CLAUDE_CODE_GIT_BASH_PATH,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ].filter(Boolean) as string[];
  
  for (const path of candidates) {
    try {
      if (fs.existsSync(path)) {
        console.debug(`[Terminal] Found Git Bash at: ${path}`);
        return path;
      }
    } catch {
      // Continue to next candidate
    }
  }
  
  console.debug("[Terminal] Git Bash not found");
  return undefined;
}

export function makeEnvForTerminal(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  
  // Add terminal identification
  env.TERM_PROGRAM = "obsidian";
  env.COLORTERM = "truecolor";
  
  // On Windows, help Claude find a POSIX shell
  if (process.platform === "win32") {
    const bash = findGitBash();
    if (bash) {
      env.SHELL = bash;
      env.CLAUDE_CODE_GIT_BASH_PATH = bash;
      console.debug(`[Terminal] Set CLAUDE_CODE_GIT_BASH_PATH to: ${bash}`);
    }
  }
  
  return env;
}