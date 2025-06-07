/***********************************************************************
 * Claude MCP for Obsidian – main.ts
 *
 * 1. `npm i ws node-pty @types/ws @types/node --save`
 * 2. Compile with the normal Obsidian plugin build pipeline
 **********************************************************************/
import { Plugin, Notice, WorkspaceLeaf, addIcon } from "obsidian";
import { WebSocket } from "ws";
import { McpServer } from "./src/mcp/server";
import { McpHandlers } from "./src/mcp/handlers";
import { WorkspaceManager } from "./src/obsidian/workspace-manager";
import { McpRequest } from "./src/mcp/types";
import {
	ClaudeTerminalView,
	TERMINAL_VIEW_TYPE,
} from "./src/terminal/terminal-view";
import {
	ClaudeCodeSettings,
	DEFAULT_SETTINGS,
	ClaudeCodeSettingTab,
} from "./src/settings";
import claudeLogo from "./assets/claude-logo.png";

export default class ClaudeMcpPlugin extends Plugin {
	private mcpServer!: McpServer;
	private mcpHandlers!: McpHandlers;
	private workspaceManager!: WorkspaceManager;
	public settings!: ClaudeCodeSettings;

	/* ---------------- core lifecycle ---------------- */

	async onload() {
		// Load settings
		await this.loadSettings();

		// Register custom Claude icon
		addIcon(
			"claude-logo",
			`<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
				<image href="${claudeLogo}" width="16" height="16" />
			</svg>`
		);

		// Register terminal view
		this.registerView(
			TERMINAL_VIEW_TYPE,
			(leaf) => new ClaudeTerminalView(leaf, this)
		);

		// Add ribbon button for terminal toggle
		this.addRibbonIcon("claude-logo", "Toggle Claude Terminal", () => {
			this.toggleClaudeTerminal();
		});

		// Add settings tab
		this.addSettingTab(new ClaudeCodeSettingTab(this.app, this));

		// Initialize workspace manager first
		this.workspaceManager = new WorkspaceManager(this.app, this, {
			onSelectionChange: (notification) => {
				this.mcpServer?.broadcast(notification);
			},
		});

		// Initialize components with workspace manager
		this.mcpHandlers = new McpHandlers(this.app, this.workspaceManager);

		this.mcpServer = new McpServer({
			onMessage: (ws: WebSocket, req: McpRequest) => {
				this.mcpHandlers.handleRequest(ws, req);
			},
		});

		// Start services
		const port = await this.mcpServer.start();
		console.debug(`[MCP] Server started on port ${port}`);

		// Update lock file with workspace path
		const basePath =
			(this.app.vault.adapter as any).getBasePath?.() || process.cwd();
		console.debug(`[MCP] Vault base path: ${basePath}`);
		this.mcpServer.updateWorkspaceFolders(basePath);

		this.workspaceManager.setupListeners();

		// Register commands
		this.addCommand({
			id: "toggle-claude-terminal",
			name: "Toggle Claude Terminal",
			callback: () => this.toggleClaudeTerminal(),
			hotkeys: [{ modifiers: ["Ctrl"], key: "`" }],
		});

		new Notice("Claude MCP running with integrated terminal.");
	}

	onunload() {
		this.mcpServer?.stop();
	}

	/* ---------------- terminal management ---- */

	private async toggleClaudeTerminal(): Promise<void> {
		try {
			// Check if terminal is already open
			const existingLeaf =
				this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)[0];
			if (existingLeaf) {
				// Check if the terminal leaf is currently active
				const isActive = this.app.workspace.activeLeaf === existingLeaf;
				if (isActive) {
					// Terminal is active - close it
					existingLeaf.detach();
					return;
				} else {
					// Terminal exists but isn't active - focus it
					this.app.workspace.revealLeaf(existingLeaf);
					setTimeout(() => {
						const terminalView =
							existingLeaf.view as ClaudeTerminalView;
						if (
							terminalView &&
							typeof terminalView.focusTerminal === "function"
						) {
							terminalView.focusTerminal();
						}
					}, 50);
					return;
				}
			}

			// Create new terminal
			const leaf = this.app.workspace.getLeaf("split");
			await leaf.setViewState({ type: TERMINAL_VIEW_TYPE });
			this.app.workspace.revealLeaf(leaf);

			// Focus the terminal after a brief delay to ensure it's ready
			setTimeout(() => {
				const terminalView = leaf.view as ClaudeTerminalView;
				if (
					terminalView &&
					typeof terminalView.focusTerminal === "function"
				) {
					terminalView.focusTerminal();
				}
			}, 150);
		} catch (error) {
			console.error("[Terminal] Failed to toggle terminal:", error);
			new Notice("Failed to toggle Claude Terminal");
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
