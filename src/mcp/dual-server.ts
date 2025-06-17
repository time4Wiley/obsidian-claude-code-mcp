import { App } from "obsidian";
import { WebSocket } from "ws";
import { McpServer, McpServerConfig } from "./server";
import { McpHttpServer, McpHttpServerConfig } from "./http-server";
import { McpHandlers } from "./handlers";
import { McpRequest, McpNotification } from "./types";
import { WorkspaceManager } from "../obsidian/workspace-manager";
import { ToolRegistry } from "../shared/tool-registry";
import { GeneralTools, GENERAL_TOOL_DEFINITIONS } from "../tools/general-tools";
import { IdeTools, IDE_TOOL_DEFINITIONS } from "../ide/ide-tools";

export interface DualServerConfig {
	app: App;
	workspaceManager?: WorkspaceManager;
	wsPort?: number;
	httpPort?: number;
	enableWebSocket?: boolean;
	enableHttp?: boolean;
}

export class McpDualServer {
	private wsServer?: McpServer;
	private httpServer?: McpHttpServer;
	private handlers: McpHandlers;
	private config: DualServerConfig;
	private toolRegistry: ToolRegistry;

	constructor(config: DualServerConfig) {
		this.config = config;
		
		// Initialize tool registry
		this.toolRegistry = new ToolRegistry();
		this.registerTools();
		
		// Initialize handlers with the tool registry
		this.handlers = new McpHandlers(
			config.app,
			this.toolRegistry,
			config.workspaceManager
		);
	}

	private registerTools(): void {
		// Register general tools
		const generalTools = new GeneralTools(this.config.app);
		const generalImplementations = generalTools.createImplementations();

		for (let i = 0; i < GENERAL_TOOL_DEFINITIONS.length; i++) {
			const definition = GENERAL_TOOL_DEFINITIONS[i];
			const implementation = generalImplementations[i];
			
			if (!implementation || definition.name !== implementation.name) {
				throw new Error(
					`Tool definition and implementation mismatch for ${definition.name}`
				);
			}
			
			this.toolRegistry.register(definition, implementation);
		}

		// Register IDE-specific tools
		const ideTools = new IdeTools(this.config.app);
		const ideImplementations = ideTools.createImplementations();
		
		for (let i = 0; i < IDE_TOOL_DEFINITIONS.length; i++) {
			const definition = IDE_TOOL_DEFINITIONS[i];
			const implementation = ideImplementations[i];
			
			if (!implementation || definition.name !== implementation.name) {
				throw new Error(
					`Tool definition and implementation mismatch for ${definition.name}`
				);
			}
			
			this.toolRegistry.register(definition, implementation);
		}

		// Log registered tools for debugging
		console.debug(
			"[McpDualServer] Registered tools:",
			this.toolRegistry.getRegisteredToolNames()
		);
	}

	async start(): Promise<{ wsPort?: number; httpPort?: number }> {
		const result: { wsPort?: number; httpPort?: number } = {};

		// Start WebSocket server (for Claude Code)
		if (this.config.enableWebSocket !== false) {
			try {
				const wsConfig: McpServerConfig = {
					onMessage: (ws: WebSocket, request: McpRequest) => {
						this.handlers.handleRequest(ws, request);
					},
					onConnection: (ws: WebSocket) => {
						console.debug("[MCP Dual] WebSocket client connected");
					},
					onDisconnection: (ws: WebSocket) => {
						console.debug("[MCP Dual] WebSocket client disconnected");
					},
				};

				this.wsServer = new McpServer(wsConfig);
				result.wsPort = await this.wsServer.start();
				console.debug(`[MCP Dual] WebSocket server started on port ${result.wsPort}`);

				// Update lock file with workspace folders
				if (this.config.workspaceManager) {
					const basePath = (this.config.app.vault.adapter as any).getBasePath?.() || process.cwd();
					this.wsServer.updateWorkspaceFolders(basePath);
				}
			} catch (error) {
				console.error("[MCP Dual] Failed to start WebSocket server:", error);
			}
		}

		// Start HTTP/SSE server (for Claude Desktop and other MCP clients)
		if (this.config.enableHttp !== false) {
			try {
				const httpConfig: McpHttpServerConfig = {
					onMessage: (request: McpRequest, reply) => {
						this.handlers.handleHttpRequest(request, reply);
					},
					onConnection: () => {
						console.debug(`[MCP Dual] HTTP client connected`);
					},
					onDisconnection: () => {
						console.debug(`[MCP Dual] HTTP client disconnected`);
					},
				};

				this.httpServer = new McpHttpServer(httpConfig);
				result.httpPort = await this.httpServer.start(this.config.httpPort || 22360);
				console.debug(`[MCP Dual] HTTP server started on port ${result.httpPort}`);
			} catch (error) {
				console.error("[MCP Dual] Failed to start HTTP server:", error);
				// Re-throw port-related errors so they can be handled by the main plugin
				if (error.name === 'PortInUseError' || error.name === 'PermissionError' || 
					error.message?.includes('EADDRINUSE') || error.message?.includes('EACCES')) {
					throw error;
				}
			}
		}

		return result;
	}

	stop(): void {
		console.debug("[MCP Dual] Stopping servers...");
		
		if (this.wsServer) {
			this.wsServer.stop();
			this.wsServer = undefined;
		}

		if (this.httpServer) {
			this.httpServer.stop();
			this.httpServer = undefined;
		}
	}

	broadcast(message: McpNotification): void {
		// Broadcast to both WebSocket and HTTP/SSE clients
		if (this.wsServer) {
			this.wsServer.broadcast(message);
		}

		if (this.httpServer) {
			this.httpServer.broadcast(message);
		}
	}

	get clientCount(): number {
		const wsCount = this.wsServer?.clientCount || 0;
		const httpCount = this.httpServer?.clientCount || 0;
		return wsCount + httpCount;
	}

	get wsClientCount(): number {
		const count = this.wsServer?.clientCount || 0;
		console.debug(`[MCP Dual] WebSocket client count: ${count}`);
		return count;
	}

	get httpClientCount(): number {
		const count = this.httpServer?.clientCount || 0;
		console.debug(`[MCP Dual] HTTP client count: ${count}`);
		return count;
	}

	updateWorkspaceFolders(basePath: string): void {
		if (this.wsServer) {
			this.wsServer.updateWorkspaceFolders(basePath);
		}
	}

	getServerInfo(): { wsPort?: number; httpPort?: number; wsClients: number; httpClients: number } {
		return {
			wsPort: this.wsServer ? this.wsServer.serverPort : undefined,
			httpPort: this.httpServer ? this.httpServer.serverPort : undefined,
			wsClients: this.wsClientCount,
			httpClients: this.httpClientCount,
		};
	}

	/**
	 * Get tool definitions for a specific category
	 */
	getToolsByCategory(category: string): import("./types").Tool[] {
		return this.toolRegistry.getToolDefinitions(category);
	}

	/**
	 * Check if all tools are properly registered
	 */
	validateToolRegistration(): void {
		const registeredNames = this.toolRegistry.getRegisteredToolNames();
		console.log("[McpDualServer] Tool validation:", {
			totalRegistered: registeredNames.length,
			generalTools: this.toolRegistry.getToolDefinitions("general").length + 
						  this.toolRegistry.getToolDefinitions("file").length + 
						  this.toolRegistry.getToolDefinitions("workspace").length,
			ideTools: this.toolRegistry.getToolDefinitions("ide-specific").length,
		});
	}
}