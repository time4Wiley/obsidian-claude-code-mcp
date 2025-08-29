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
import { CanvasTools, CANVAS_TOOL_DEFINITIONS } from "../tools/canvas-tools";

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
	private wsToolRegistry: ToolRegistry;  // For WebSocket/IDE tools
	private httpToolRegistry: ToolRegistry; // For HTTP/MCP tools

	constructor(config: DualServerConfig) {
		this.config = config;
		
		// Initialize separate tool registries
		this.wsToolRegistry = new ToolRegistry();
		this.httpToolRegistry = new ToolRegistry();
		this.registerTools();
		
		// Initialize handlers with both tool registries
		this.handlers = new McpHandlers(
			config.app,
			this.wsToolRegistry,
			this.httpToolRegistry,
			config.workspaceManager
		);
	}

	private registerTools(): void {
		// Register general tools to BOTH registries (available for both IDE and MCP)
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
			
			// Register to both WebSocket and HTTP registries
			this.wsToolRegistry.register(definition, implementation);
			this.httpToolRegistry.register(definition, implementation);
		}

		// Register canvas tools to BOTH registries if workspace manager is available
		if (this.config.workspaceManager) {
			const canvasTools = new CanvasTools(this.config.app, this.config.workspaceManager);
			const canvasImplementations = canvasTools.createImplementations();
			
			for (let i = 0; i < CANVAS_TOOL_DEFINITIONS.length; i++) {
				const definition = CANVAS_TOOL_DEFINITIONS[i];
				const implementation = canvasImplementations[i];
				
				if (!implementation || definition.name !== implementation.name) {
					throw new Error(
						`Tool definition and implementation mismatch for ${definition.name}`
					);
				}
				
				// Register to both WebSocket and HTTP registries
				this.wsToolRegistry.register(definition, implementation);
				this.httpToolRegistry.register(definition, implementation);
			}
		}

		// Register IDE-specific tools ONLY to WebSocket registry
		const ideTools = new IdeTools(this.config.app, this.config.workspaceManager);
		const ideImplementations = ideTools.createImplementations();
		
		for (let i = 0; i < IDE_TOOL_DEFINITIONS.length; i++) {
			const definition = IDE_TOOL_DEFINITIONS[i];
			const implementation = ideImplementations[i];
			
			if (!implementation || definition.name !== implementation.name) {
				throw new Error(
					`Tool definition and implementation mismatch for ${definition.name}`
				);
			}
			
			// Only register to WebSocket registry (IDE-specific)
			this.wsToolRegistry.register(definition, implementation);
		}

		// Log registered tools for debugging
		console.debug(
			"[McpDualServer] WebSocket/IDE tools:",
			this.wsToolRegistry.getRegisteredToolNames()
		);
		console.debug(
			"[McpDualServer] HTTP/MCP tools:",
			this.httpToolRegistry.getRegisteredToolNames()
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
	getToolsByCategory(category: string, serverType: "ws" | "http" = "ws"): import("./types").Tool[] {
		const registry = serverType === "ws" ? this.wsToolRegistry : this.httpToolRegistry;
		return registry.getToolDefinitions(category);
	}

	/**
	 * Check if all tools are properly registered
	 */
	validateToolRegistration(): void {
		console.log("[McpDualServer] Tool validation:");
		console.log("  WebSocket/IDE tools:", {
			total: this.wsToolRegistry.getRegisteredToolNames().length,
			general: this.wsToolRegistry.getToolDefinitions("general").length + 
					 this.wsToolRegistry.getToolDefinitions("file").length + 
					 this.wsToolRegistry.getToolDefinitions("workspace").length,
			ideSpecific: this.wsToolRegistry.getToolDefinitions("ide-specific").length,
		});
		console.log("  HTTP/MCP tools:", {
			total: this.httpToolRegistry.getRegisteredToolNames().length,
			general: this.httpToolRegistry.getToolDefinitions("general").length + 
					 this.httpToolRegistry.getToolDefinitions("file").length + 
					 this.httpToolRegistry.getToolDefinitions("workspace").length,
			ideSpecific: this.httpToolRegistry.getToolDefinitions("ide-specific").length,
		});
	}
}