/***********************************************************************
 * Claude MCP for Obsidian – main.ts
 *
 * 1. `npm i ws node-pty @types/ws @types/node --save`
 * 2. Compile with the normal Obsidian plugin build pipeline
 **********************************************************************/
import { Plugin, Notice, WorkspaceLeaf, addIcon } from "obsidian";
import { McpDualServer } from "./src/mcp/dual-server";
import { WorkspaceManager } from "./src/obsidian/workspace-manager";
import {
	ClaudeCodeSettings,
	DEFAULT_SETTINGS,
	ClaudeCodeSettingTab,
} from "./src/settings";
// Terminal and icon imports commented out until those modules are available
// import {
// 	ClaudeTerminalView,
// 	TERMINAL_VIEW_TYPE,
// } from "./src/terminal/terminal-view";
// import claudeLogo from "./assets/claude-logo.png";

export default class ClaudeMcpPlugin extends Plugin {
	private mcpServer!: McpDualServer;
	private workspaceManager!: WorkspaceManager;
	public settings!: ClaudeCodeSettings;

	/* ---------------- core lifecycle ---------------- */

	async onload() {
		// Load settings
		await this.loadSettings();

		// Register custom Claude icon (commented out until claudeLogo is available)
		// addIcon(
		// 	"claude-logo",
		// 	`<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
		// 		<image href="${claudeLogo}" width="16" height="16" />
		// 	</svg>`
		// );

		// Register terminal view (commented out until terminal modules are available)
		// this.registerView(
		// 	TERMINAL_VIEW_TYPE,
		// 	(leaf) => new ClaudeTerminalView(leaf, this)
		// );

		// Add ribbon button for terminal toggle (commented out until terminal is available)
		// this.addRibbonIcon("claude-logo", "Toggle Claude Terminal", () => {
		// 	this.toggleClaudeTerminal();
		// });

		// Add settings tab
		this.addSettingTab(new ClaudeCodeSettingTab(this.app, this));

		// Initialize workspace manager first
		this.workspaceManager = new WorkspaceManager(this.app, this, {
			onSelectionChange: (notification) => {
				this.mcpServer?.broadcast(notification);
			},
		});

		// Initialize dual server (WebSocket + HTTP/SSE)
		await this.initializeMcpServer();

		this.workspaceManager.setupListeners();

		// Register commands (commented out until terminal is available)
		// this.addCommand({
		// 	id: "toggle-claude-terminal",
		// 	name: "Toggle Claude Terminal",
		// 	callback: () => this.toggleClaudeTerminal(),
		// 	hotkeys: [{ modifiers: ["Ctrl"], key: "`" }],
		// });

	}

	onunload() {
		this.mcpServer?.stop();
	}

	async initializeMcpServer(): Promise<void> {
		try {
			// Initialize dual server (WebSocket + HTTP/SSE)
			this.mcpServer = new McpDualServer({
				app: this.app,
				workspaceManager: this.workspaceManager,
				wsPort: undefined, // Use random port for WebSocket
				httpPort: this.settings.mcpHttpPort,
				enableWebSocket: this.settings.enableWebSocketServer,
				enableHttp: this.settings.enableHttpServer,
			});

			// Start services
			const serverInfo = await this.mcpServer.start();
			console.debug(`[MCP] Dual server started:`, serverInfo);

			// Update lock file with workspace path
			const basePath =
				(this.app.vault.adapter as any).getBasePath?.() || process.cwd();
			console.debug(`[MCP] Vault base path: ${basePath}`);
			this.mcpServer.updateWorkspaceFolders(basePath);

			// Show success notification
			const wsStatus = serverInfo.wsPort ? `WebSocket: ${serverInfo.wsPort}` : 'WebSocket: disabled';
			const httpStatus = serverInfo.httpPort ? `HTTP: ${serverInfo.httpPort}` : 'HTTP: disabled';
			new Notice(`Claude MCP running - ${wsStatus}, ${httpStatus}`);

		} catch (error) {
			console.error('[MCP] Failed to start server:', error);
			
			// Handle specific error types
			if (error.message?.includes('EADDRINUSE')) {
				new Notice(`Port ${this.settings.mcpHttpPort} is already in use. Please choose a different port in settings.`, 8000);
			} else if (error.message?.includes('EACCES')) {
				new Notice(`Permission denied for port ${this.settings.mcpHttpPort}. Try using a port above 1024.`, 8000);
			} else {
				new Notice(`Failed to start MCP server: ${error.message}`, 8000);
			}
		}
	}

	async restartMcpServer(): Promise<void> {
		try {
			// Stop existing server
			if (this.mcpServer) {
				console.debug('[MCP] Stopping server for restart...');
				this.mcpServer.stop();
			}

			// Small delay to ensure clean shutdown
			await new Promise(resolve => setTimeout(resolve, 500));

			// Restart server with new settings
			await this.initializeMcpServer();

		} catch (error) {
			console.error('[MCP] Failed to restart server:', error);
			new Notice(`Failed to restart MCP server: ${error.message}`, 8000);
		}
	}

	/* ---------------- terminal management (commented out until terminal modules are available) ---- */

	// private async toggleClaudeTerminal(): Promise<void> {
	// 	try {
	// 		// Check if terminal is already open
	// 		const existingLeaf =
	// 			this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)[0];
	// 		if (existingLeaf) {
	// 			// Check if the terminal leaf is currently active
	// 			const isActive = this.app.workspace.activeLeaf === existingLeaf;
	// 			if (isActive) {
	// 				// Terminal is active - close it
	// 				existingLeaf.detach();
	// 				return;
	// 			} else {
	// 				// Terminal exists but isn't active - focus it
	// 				this.app.workspace.revealLeaf(existingLeaf);
	// 				setTimeout(() => {
	// 					const terminalView =
	// 						existingLeaf.view as ClaudeTerminalView;
	// 					if (
	// 						terminalView &&
	// 						typeof terminalView.focusTerminal === "function"
	// 					) {
	// 						terminalView.focusTerminal();
	// 					}
	// 				}, 50);
	// 				return;
	// 			}
	// 		}

	// 		// Create new terminal
	// 		const leaf = this.app.workspace.getLeaf("split");
	// 		await leaf.setViewState({ type: TERMINAL_VIEW_TYPE });
	// 		this.app.workspace.revealLeaf(leaf);

	// 		// Focus the terminal after a brief delay to ensure it's ready
	// 		setTimeout(() => {
	// 			const terminalView = leaf.view as ClaudeTerminalView;
	// 			if (
	// 				terminalView &&
	// 				typeof terminalView.focusTerminal === "function"
	// 			) {
	// 				terminalView.focusTerminal();
	// 			}
	// 		}, 150);
	// 	} catch (error) {
	// 		console.error("[Terminal] Failed to toggle terminal:", error);
	// 		new Notice("Failed to toggle Claude Terminal");
	// 	}
	// }

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
