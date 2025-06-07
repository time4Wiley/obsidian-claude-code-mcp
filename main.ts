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

export default class ClaudeMcpPlugin extends Plugin {
	private mcpServer!: McpServer;
	private mcpHandlers!: McpHandlers;
	private workspaceManager!: WorkspaceManager;

	/* ---------------- core lifecycle ---------------- */

	async onload() {
		// Register terminal view
		this.registerView(
			TERMINAL_VIEW_TYPE,
			(leaf) => new ClaudeTerminalView(leaf)
		);

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
			id: "open-claude-terminal",
			name: "Open Claude Terminal",
			callback: () => this.openClaudeTerminal(),
			hotkeys: [{ modifiers: ["Ctrl"], key: "`" }],
		});

		// Auto-launch terminal
		await this.openClaudeTerminal();

		new Notice(
			"Claude MCP running with integrated terminal."
		);
	}

	onunload() {
		this.mcpServer?.stop();
	}

	/* ---------------- terminal management ---- */

	private async openClaudeTerminal(): Promise<void> {
		try {
			// Check if terminal is already open
			const existingLeaf = this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)[0];
			if (existingLeaf) {
				this.app.workspace.revealLeaf(existingLeaf);
				(existingLeaf.view as ClaudeTerminalView).focusTerminal();
				return;
			}

			// Create new terminal
			const leaf = this.app.workspace.getLeaf("split");
			await leaf.setViewState({
				type: TERMINAL_VIEW_TYPE,
			});
			this.app.workspace.revealLeaf(leaf);
		} catch (error) {
			console.error("[Terminal] Failed to open terminal:", error);
		}
	}
}