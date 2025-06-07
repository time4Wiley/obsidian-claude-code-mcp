/***********************************************************************
 * Claude MCP for Obsidian – main.ts
 *
 * 1. `npm i ws node-pty @types/ws @types/node --save`
 * 2. Compile with the normal Obsidian plugin build pipeline
 **********************************************************************/
import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
import { WebSocket } from "ws";
import { McpServer } from "./src/mcp/server";
import { McpHandlers } from "./src/mcp/handlers";
import { WorkspaceManager } from "./src/obsidian/workspace-manager";
import { McpRequest } from "./src/mcp/types";
import { ClaudeTerminalView, TERMINAL_VIEW_TYPE } from "./src/terminal/terminal-view";
import { ClaudeCodeSettings, DEFAULT_SETTINGS, ClaudeCodeSettingTab } from "./src/settings";
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

		// Register terminal view
		this.registerView(
			TERMINAL_VIEW_TYPE,
			(leaf) => new ClaudeTerminalView(leaf, this)
		);

		// Add ribbon button for terminal toggle
		const ribbonButton = this.addRibbonIcon("cpu", "Toggle Claude Terminal", () => {
			this.toggleClaudeTerminal();
		});
		// Replace the default icon with Claude logo
		ribbonButton.innerHTML = `<img src="${claudeLogo}" style="width: 16px; height: 16px;" alt="Claude" />`;

		// Add settings tab
		this.addSettingTab(new ClaudeCodeSettingTab(this.app, this));

		// Initialize components
		this.mcpHandlers = new McpHandlers(this.app);
		
		this.mcpServer = new McpServer({
			onMessage: (ws: WebSocket, req: McpRequest) => {
				this.mcpHandlers.handleRequest(ws, req);
			},
			onConnection: (ws: WebSocket) => {
				// Send initial file context when Claude connects
				this.workspaceManager?.sendInitialContext();
			},
		});

		this.workspaceManager = new WorkspaceManager(
			this.app,
			this,
			{
				onSelectionChange: (notification) => {
					this.mcpServer?.broadcast(notification);
				},
			}
		);

		// Start services
		const port = await this.mcpServer.start();
		console.debug(`[MCP] Server started on port ${port}`);
		
		// Update lock file with workspace path
		const basePath = (this.app.vault.adapter as any).getBasePath?.() || process.cwd();
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

		// Auto-launch terminal
		await this.toggleClaudeTerminal();

		new Notice(
			"Claude MCP running with integrated terminal."
		);
	}

	onunload() {
		this.mcpServer?.stop();
	}

	/* ---------------- terminal management ---- */

	private async toggleClaudeTerminal(): Promise<void> {
		try {
			// Check if terminal is already open
			const existingLeaf = this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)[0];
			if (existingLeaf) {
				// Terminal exists - close it
				existingLeaf.detach();
				return;
			}

			// Create new terminal
			const leaf = this.app.workspace.getLeaf("split");
			await leaf.setViewState({
				type: TERMINAL_VIEW_TYPE,
			});
			this.app.workspace.revealLeaf(leaf);
		} catch (error) {
			console.error("[Terminal] Failed to toggle terminal:", error);
			new Notice("Failed to toggle Claude Terminal");
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}