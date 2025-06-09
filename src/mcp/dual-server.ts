import { App } from "obsidian";
import { WebSocket } from "ws";
import { McpServer, McpServerConfig } from "./server";
import { McpHttpServer, McpHttpServerConfig } from "./http-server";
import { McpHandlers } from "./handlers";
import { McpRequest, McpNotification } from "./types";
import { WorkspaceManager } from "../obsidian/workspace-manager";

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

	constructor(config: DualServerConfig) {
		this.config = config;
		this.handlers = new McpHandlers(config.app, config.workspaceManager);
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
}