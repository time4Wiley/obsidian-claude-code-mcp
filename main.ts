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

export default class ClaudeMcpPlugin extends Plugin {
	private mcpServer!: McpServer;
	private mcpHandlers!: McpHandlers;
	private workspaceManager!: WorkspaceManager;

	/* ---------------- core lifecycle ---------------- */

	async onload() {
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
		await this.launchClaudeTerminal(); // optional

		new Notice(
			"Claude MCP stub running. Open a terminal and run `claude`."
		);
	}

	onunload() {
		this.mcpServer?.stop();
	}

	/* ---------------- optional: spawn Claude in terminal pane ---- */

	private async launchClaudeTerminal() {
		try {
			const leaf: WorkspaceLeaf = this.app.workspace.getLeaf("split");
			await leaf.setViewState({
				type: "terminal-view", // provided by your terminal plugin
				state: { cmd: "claude", args: [] }, // CLI must be in PATH
			});
		} catch {
			// terminal plugin not installed – silently ignore
		}
	}
}