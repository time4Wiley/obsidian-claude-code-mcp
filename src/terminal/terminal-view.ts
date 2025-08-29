import { ItemView, WorkspaceLeaf, Notice, App } from "obsidian";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { spawn, ChildProcess } from "child_process";
import {
	Pseudoterminal,
	UnixPseudoterminal,
	ChildProcessPseudoterminal,
} from "./pseudoterminal";
import { PythonManager } from "./python-detection";
import type ClaudeMcpPlugin from "main";

export const TERMINAL_VIEW_TYPE = "claude-terminal-view";

export class ClaudeTerminalView extends ItemView {
	private terminal: Terminal;
	private fitAddon: FitAddon;
	private shell: ChildProcess | null = null;
	private pseudoterminal: Pseudoterminal | null = null;
	private pythonManager = new PythonManager();
	private isDestroyed = false;
	public app: App;
	private plugin: ClaudeMcpPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: ClaudeMcpPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.app = this.leaf.view.app;
		this.terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: "Monaco, Menlo, 'Ubuntu Mono', monospace",
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
		return "claude-logo";
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

		// Initialize Python detection but defer shell start
		await this.pythonManager.initialize();

		// Set up shell process - now includes environment setup
		await this.startShell();

		// Add custom key handler for Shift+Enter to insert a newline
		this.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
			// We only care about keydown events.
			if (event.type !== "keydown") {
				return true;
			}

			// Check for Shift+Enter without other modifiers
			if (
				event.key === "Enter" &&
				event.shiftKey &&
				!event.altKey &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				// Ensure we have a pseudoterminal with a shell property
				if (this.pseudoterminal?.shell) {
					// Prevent the default Enter behavior (sending \r)
					event.preventDefault();

					// Manually send a newline character to the PTY's stdin
					this.pseudoterminal.shell
						.then((shell) => {
							if (shell?.stdin?.writable) {
								shell.stdin.write("\n");
							}
						})
						.catch((error) => {
							console.error(
								"[Terminal] Failed to write newline to PTY stdin:",
								error
							);
						});

					// Stop xterm.js from processing the event further
					return false;
				}
			}

			// Allow xterm.js to process all other key events
			return true;
		});

		// Set up terminal resizing
		this.terminal.onResize(({ cols, rows }) => {
			if (this.pseudoterminal?.resize) {
				this.pseudoterminal
					.resize(cols, rows)
					.catch((error: unknown) => {
						console.warn("[Terminal] Resize failed:", error);
					});
			}
		});

		// Fit terminal to container and focus after a brief delay
		setTimeout(() => {
			this.fitAddon.fit();
			this.focusTerminal();
		}, 100);
	}

	// Called when the view becomes active/visible
	onShow(): void {
		console.debug("[Terminal] Terminal view shown");
		// Focus the terminal when the view becomes active
		setTimeout(() => {
			this.focusTerminal();
		}, 50);
	}

	async onClose(): Promise<void> {
		console.debug("[Terminal] Closing terminal view");
		this.isDestroyed = true;

		if (this.pseudoterminal) {
			this.pseudoterminal.kill().catch((error: unknown) => {
				console.error(
					"[Terminal] Failed to kill pseudoterminal:",
					error
				);
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
			// Get vault root directory for PWD
			const vaultPath =
				(this.app.vault.adapter as any).basePath ||
				(this.app.vault.adapter as any).getBasePath?.() ||
				process.cwd();

			// Determine shell command based on platform
			const isWindows = process.platform === "win32";
			let shell: string;
			let args: string[];
			
			if (isWindows) {
				// Try PowerShell first, fallback to cmd.exe
				// PowerShell provides a better terminal experience on Windows
				shell = process.env.COMSPEC || "cmd.exe";
				
				// Check if PowerShell is available
				const powershellPath = process.env.SystemRoot 
					? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
					: "powershell.exe";
				
				try {
					// Try to use PowerShell if available
					const fs = require('fs');
					if (fs.existsSync(powershellPath)) {
						shell = powershellPath;
						args = ["-NoLogo", "-NoProfile"];
					} else {
						args = [];
					}
				} catch {
					// Fallback to cmd.exe
					args = [];
				}
			} else {
				shell = process.env.SHELL || "/bin/zsh";
				args = ["-l"];
			}

			console.debug(`[Terminal] Starting shell: ${shell}`, args);
			console.debug(`[Terminal] Working directory: ${vaultPath}`);

			// Try Python PTY approach first (Unix-like systems only)
			if (this.pythonManager.isAvailable() && !isWindows) {
				try {
					console.debug("[Terminal] Using Python PTY approach");
					await this.startPythonPTY(shell, args, vaultPath);
					return;
				} catch (error) {
					console.warn(
						"[Terminal] Python PTY failed, falling back to child_process:",
						error
					);
					new Notice("Terminal: Python PTY failed, using basic mode");
				}
			} else {
				if (!this.pythonManager.isAvailable()) {
					console.debug(
						"[Terminal] Python not available, using child_process fallback"
					);
				}
				if (isWindows) {
					console.debug(
						"[Terminal] Windows platform, using child_process fallback"
					);
				}
			}
			
			// Fallback to ChildProcessPseudoterminal for Windows or when Python is not available
			try {
				console.debug("[Terminal] Using child_process fallback approach");
				await this.startChildProcessPTY(shell, args, vaultPath);
			} catch (error) {
				console.error("[Terminal] Child process fallback failed:", error);
				this.terminal.write(`Failed to start terminal: ${error.message}\r\n`);
			}
		} catch (error: any) {
			console.error("[Terminal] Failed to start shell:", error);
			this.terminal.write(`Failed to start shell: ${error.message}\r\n`);
		}
	}

	private async startPythonPTY(
		shell: string,
		args: string[],
		vaultPath: string
	): Promise<void> {
		const pythonExecutable = this.pythonManager.getExecutable();
		if (!pythonExecutable) {
			throw new Error("Python executable not available");
		}

		this.pseudoterminal = new UnixPseudoterminal({
			executable: shell,
			args,
			cwd: vaultPath,
			pythonExecutable,
			terminal: "xterm-256color",
			env: this.getTerminalEnv(),
		});

		// Pipe pseudoterminal to xterm
		await this.pseudoterminal.pipe(this.terminal);

		// Handle exit
		this.pseudoterminal.onExit
			.then((exitCode) => {
				console.debug(`[Terminal] PTY exited with code ${exitCode}`);
				if (!this.isDestroyed) {
					this.terminal.write(
						`\r\n\r\nShell exited with code ${exitCode}\r\n`
					);
				}
			})
			.catch((error: unknown) => {
				console.error("[Terminal] PTY error:", error);
			});

		// Auto-launch claude command after a brief delay
		setTimeout(() => this.launchClaude(), 100);
	}

	private async startChildProcessPTY(
		shell: string,
		args: string[],
		vaultPath: string
	): Promise<void> {
		console.debug("[Terminal] Starting ChildProcessPseudoterminal");
		
		this.pseudoterminal = new ChildProcessPseudoterminal({
			executable: shell,
			args,
			cwd: vaultPath,
			terminal: "xterm-256color",
			env: this.getTerminalEnv(),
		});

		// Pipe pseudoterminal to xterm
		await this.pseudoterminal.pipe(this.terminal);

		// Handle exit
		this.pseudoterminal.onExit
			.then((exitCode) => {
				console.debug(`[Terminal] Child process exited with code ${exitCode}`);
				if (!this.isDestroyed) {
					this.terminal.write(
						`\r\n\r\nShell exited with code ${exitCode}\r\n`
					);
				}
			})
			.catch((error: unknown) => {
				console.error("[Terminal] Child process error:", error);
			});

		// Auto-launch claude command after a brief delay (Windows doesn't support Claude CLI yet)
		const isWindows = process.platform === "win32";
		if (!isWindows) {
			setTimeout(() => this.launchClaude(), 100);
		}
	}

	private getTerminalEnv(): NodeJS.ProcessEnv {
		return {
			...process.env,

			// These are just taken from the nvim plugin: https://github.com/coder/claudecode.nvim/blob/c1cdcd5a61d5a18f262d5c8c53929e3a27cb7821/lua/claudecode/terminal.lua#L346
			// Since none of this is officially documented it may change.
			CLAUDE_CODE_SSE_PORT: process.env.CLAUDE_CODE_SSE_PORT || "",
			ENABLE_IDE_INTEGRATION:
				process.env.ENABLE_IDE_INTEGRATION || "true",
			FORCE_CODE_TERMINAL: "true",

			TERM_PROGRAM: "obsidian-claude-terminal", // Identifies this as integrated terminal
			TERM_PROGRAM_VERSION: "1.0.0",
			VSCODE_GIT_ASKPASS_NODE: process.env.VSCODE_GIT_ASKPASS_NODE || "", // VSCode compat
			VSCODE_GIT_ASKPASS_EXTRA_ARGS:
				process.env.VSCODE_GIT_ASKPASS_EXTRA_ARGS || "",

			// Alternative: Set a specific IDE integration flag
			CLAUDE_CODE_IDE_INTEGRATION: "obsidian",
			CLAUDE_CODE_INTEGRATED_TERMINAL: "true",
		};
	}

	private async launchClaude(): Promise<void> {
		if (!this.isDestroyed && this.pseudoterminal) {
			const startupCommand = this.plugin.settings.startupCommand.trim();

			// Skip if no startup command is configured
			if (!startupCommand) {
				console.debug(
					"[Terminal] Startup command is empty, skipping auto-launch"
				);
				return;
			}

			console.debug(
				`[Terminal] Auto-launching startup command: ${startupCommand}`
			);
			try {
				const shell = await this.pseudoterminal.shell;
				if (shell && shell.stdin) {
					// Launch the configured startup command
					shell.stdin.write(`${startupCommand}\n`);
				}
			} catch (error) {
				console.warn(
					"[Terminal] Failed to auto-launch startup command:",
					error
				);
			}
		}
	}

	public focusTerminal(): void {
		if (this.terminal && !this.isDestroyed) {
			// Ensure the terminal is properly loaded and visible
			if (
				this.containerEl.isConnected &&
				this.containerEl.offsetParent !== null
			) {
				this.terminal.focus();
				console.debug("[Terminal] Terminal focused");
			} else {
				// Retry focus after a short delay if terminal isn't ready
				setTimeout(() => {
					if (this.terminal && !this.isDestroyed) {
						this.terminal.focus();
						console.debug("[Terminal] Terminal focused (delayed)");
					}
				}, 100);
			}
		}
	}
}
