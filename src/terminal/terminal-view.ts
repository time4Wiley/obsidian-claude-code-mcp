import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { spawn, ChildProcess } from "child_process";
import { Pseudoterminal, UnixPseudoterminal, ChildProcessPseudoterminal } from "./pseudoterminal";
import { PythonManager } from "./python-detection";

export const TERMINAL_VIEW_TYPE = "claude-terminal-view";

export class ClaudeTerminalView extends ItemView {
	private terminal: Terminal;
	private fitAddon: FitAddon;
	private shell: ChildProcess | null = null;
	private pseudoterminal: Pseudoterminal | null = null;
	private pythonManager = new PythonManager();
	private isDestroyed = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: "Monaco, Menlo, 'Ubuntu Mono', monospace",
			theme: {
				background: "#1e1e1e",
				foreground: "#d4d4d4",
				cursor: "#ffffff",
				selectionBackground: "#264f78",
			},
		});
		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);
	}

	getViewType(): string {
		return TERMINAL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Claude Terminal";
	}

	getIcon(): string {
		return "terminal";
	}

	async onOpen(): Promise<void> {
		console.debug("[Terminal] Opening terminal view");

		const container = this.containerEl.children[1];
		container.empty();

		// Create terminal container
		const terminalEl = container.createDiv({
			cls: "claude-terminal-container",
		});
		terminalEl.style.width = "100%";
		terminalEl.style.height = "100%";
		terminalEl.style.padding = "8px";

		// Open terminal in DOM
		this.terminal.open(terminalEl);

		// Initialize Python detection
		await this.pythonManager.initialize();

		// Set up shell process
		await this.startShell();

		// Set up terminal resizing
		this.terminal.onResize(({ cols, rows }) => {
			if (this.pseudoterminal?.resize) {
				this.pseudoterminal.resize(cols, rows).catch((error: unknown) => {
					console.warn("[Terminal] Resize failed:", error);
				});
			}
		});

		// Fit terminal to container
		setTimeout(() => {
			this.fitAddon.fit();
		}, 100);
	}

	async onClose(): Promise<void> {
		console.debug("[Terminal] Closing terminal view");
		this.isDestroyed = true;

		if (this.pseudoterminal) {
			this.pseudoterminal.kill().catch((error: unknown) => {
				console.error("[Terminal] Failed to kill pseudoterminal:", error);
			});
			this.pseudoterminal = null;
		}

		if (this.shell) {
			this.shell.kill("SIGTERM");
			this.shell = null;
		}

		if (this.terminal) {
			this.terminal.dispose();
		}
	}

	onResize(): void {
		if (this.fitAddon && !this.isDestroyed) {
			setTimeout(() => {
				this.fitAddon.fit();
				// Note: child_process doesn't support resize like node-pty
				// For proper terminal resizing, we'd need a PTY library
			}, 100);
		}
	}

	private async startShell(): Promise<void> {
		try {
			// Determine shell command based on platform
			const isWindows = process.platform === "win32";
			const shell = isWindows
				? "cmd.exe"
				: process.env.SHELL || "/bin/zsh";
			const args = isWindows ? [] : ["-l"];

			console.debug(`[Terminal] Starting shell: ${shell}`, args);

			// Try Python PTY approach first
			if (this.pythonManager.isAvailable() && !isWindows) {
				try {
					console.debug("[Terminal] Using Python PTY approach");
					await this.startPythonPTY(shell, args);
					return;
				} catch (error) {
					console.warn("[Terminal] Python PTY failed, falling back to child_process:", error);
					new Notice("Terminal: Python PTY failed, using basic mode");
				}
			} else {
				if (!this.pythonManager.isAvailable()) {
					console.debug("[Terminal] Python not available, using child_process fallback");
				}
				if (isWindows) {
					console.debug("[Terminal] Windows platform, using child_process fallback");
				}
			}

			// Fallback to child_process approach
			await this.startChildProcessFallback(shell, args);

		} catch (error: any) {
			console.error("[Terminal] Failed to start shell:", error);
			this.terminal.write(`Failed to start shell: ${error.message}\r\n`);
		}
	}

	private async startPythonPTY(shell: string, args: string[]): Promise<void> {
		const pythonExecutable = this.pythonManager.getExecutable();
		if (!pythonExecutable) {
			throw new Error("Python executable not available");
		}

		this.pseudoterminal = new UnixPseudoterminal({
			executable: shell,
			args,
			cwd: process.cwd(),
			pythonExecutable,
			terminal: "xterm-256color"
		});

		// Pipe pseudoterminal to xterm
		await this.pseudoterminal.pipe(this.terminal);

		// Handle exit
		this.pseudoterminal.onExit.then((exitCode) => {
			console.debug(`[Terminal] PTY exited with code ${exitCode}`);
			if (!this.isDestroyed) {
				this.terminal.write(`\r\n\r\nShell exited with code ${exitCode}\r\n`);
			}
		}).catch((error: unknown) => {
			console.error("[Terminal] PTY error:", error);
		});
	}

	private async startChildProcessFallback(shell: string, args: string[]): Promise<void> {
		this.pseudoterminal = new ChildProcessPseudoterminal({
			executable: shell,
			args,
			cwd: process.cwd(),
			terminal: "xterm-256color"
		});

		// Pipe pseudoterminal to xterm
		await this.pseudoterminal.pipe(this.terminal);

		// Handle exit
		this.pseudoterminal.onExit.then((exitCode) => {
			console.debug(`[Terminal] Child process exited with code ${exitCode}`);
			if (!this.isDestroyed) {
				this.terminal.write(`\r\n\r\nShell exited with code ${exitCode}\r\n`);
			}
		}).catch((error: unknown) => {
			console.error("[Terminal] Child process error:", error);
		});
	}

	private launchClaude(): void {
		if (!this.isDestroyed) {
			console.debug("[Terminal] Auto-launching Claude Code");
			this.terminal.write("claude\r");
		}
	}

	public focusTerminal(): void {
		if (this.terminal && !this.isDestroyed) {
			this.terminal.focus();
		}
	}
}
