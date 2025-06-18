import { App } from "obsidian";
import { WebSocket } from "ws";
import { McpRequest, McpReplyFunction } from "./types";
import { FileTools } from "../tools/file-tools";
import { WorkspaceManager } from "../obsidian/workspace-manager";
import { ToolRegistry } from "../shared/tool-registry";
import { IdeHandler } from "../ide/ide-handler";

// HTTP-compatible reply function type
export interface HttpMcpReplyFunction {
	(msg: Omit<import("./types").McpResponse, "jsonrpc" | "id">): void;
}

export class McpHandlers {
	private fileTools: FileTools;
	private wsToolRegistry: ToolRegistry;  // WebSocket/IDE tools
	private httpToolRegistry: ToolRegistry; // HTTP/MCP tools
	private ideHandler: IdeHandler;

	constructor(
		private app: App,
		wsToolRegistry: ToolRegistry,
		httpToolRegistry: ToolRegistry,
		workspaceManager?: WorkspaceManager
	) {
		this.fileTools = new FileTools(app);
		this.wsToolRegistry = wsToolRegistry;
		this.httpToolRegistry = httpToolRegistry;
		this.ideHandler = new IdeHandler(app, workspaceManager);
	}

	async handleRequest(sock: WebSocket, req: McpRequest): Promise<void> {
		console.debug(`[MCP] Handling request: ${req.method}`, req.params);
		const reply: McpReplyFunction = (msg) => {
			const response = JSON.stringify({
				jsonrpc: "2.0",
				id: req.id,
				...msg,
			});
			console.debug(
				`[MCP] Sending response for ${req.method}:`,
				response
			);
			sock.send(response);
		};

		// WebSocket requests use the WebSocket tool registry
		return this.handleRequestGeneric(req, reply, "ws");
	}

	async handleHttpRequest(
		req: McpRequest,
		reply: HttpMcpReplyFunction
	): Promise<void> {
		console.debug(`[MCP HTTP] Handling request: ${req.method}`, req.params);
		// HTTP requests use the HTTP tool registry
		return this.handleRequestGeneric(req, reply, "http");
	}

	private async handleRequestGeneric(
		req: McpRequest,
		reply: McpReplyFunction | HttpMcpReplyFunction,
		source: "ws" | "http"
	): Promise<void> {
		// First check if it's an IDE-specific method
		if (this.ideHandler.isIdeMethod(req.method)) {
			const handled = await this.ideHandler.handleRequest(req, reply);
			if (handled) return;
		}

		// Handle standard MCP methods
		switch (req.method) {
			case "initialize":
				return this.handleInitialize(req, reply);

			case "tools/list":
				return this.handleToolsList(req, reply, source);

			case "prompts/list":
				return this.handlePromptsList(req, reply);

			case "ping":
				return reply({ result: "pong" });

			// Legacy file operation methods (for backward compatibility)
			case "readFile":
				return this.fileTools.handleReadFile(req, reply);

			case "writeFile":
				return this.fileTools.handleWriteFile(req, reply);

			case "getOpenFiles":
				return this.fileTools.handleGetOpenFiles(req, reply);

			case "listFiles":
				return this.fileTools.handleListFiles(req, reply);

			case "getCurrentFile":
				return this.fileTools.handleGetCurrentFile(req, reply);

			case "getWorkspaceInfo":
				return this.handleGetWorkspaceInfo(req, reply);

			// Standard MCP tool call
			case "tools/call":
				// Use the appropriate tool registry based on request source
				const toolRegistry = source === "ws" ? this.wsToolRegistry : this.httpToolRegistry;
				return toolRegistry.handleToolCall(req, reply);

			case "resources/list":
				return this.handleResourcesList(req, reply);

			default:
				console.error(`[MCP] Unknown method called: ${req.method}`, req.params);
				return reply({
					error: { code: -32601, message: "method not implemented" },
				});
		}
	}

	private async handleInitialize(
		req: McpRequest,
		reply: McpReplyFunction | HttpMcpReplyFunction
	): Promise<void> {
		try {
			const { protocolVersion, capabilities, clientInfo } =
				req.params || {};

			// Respond with server capabilities
			reply({
				result: {
					protocolVersion: "2024-11-05",
					capabilities: {
						roots: {
							listChanged: false,
						},
						tools: {
							listChanged: false,
						},
						resources: {
							subscribe: false,
							listChanged: false,
						},
						prompts: {
							listChanged: false,
						},
					},
					serverInfo: {
						name: "obsidian-claude-code-mcp",
						version: "1.0.0",
					},
				},
			});
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to initialize: ${error.message}`,
				},
			});
		}
	}


	private async handleToolsList(
		req: McpRequest,
		reply: McpReplyFunction | HttpMcpReplyFunction,
		source: "ws" | "http"
	): Promise<void> {
		try {
			// Use the appropriate tool registry based on request source
			const toolRegistry = source === "ws" ? this.wsToolRegistry : this.httpToolRegistry;
			const tools = toolRegistry.getToolDefinitions();
			reply({
				result: {
					tools: tools,
				},
			});
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to list tools: ${error.message}`,
				},
			});
		}
	}

	private async handlePromptsList(
		req: McpRequest,
		reply: McpReplyFunction | HttpMcpReplyFunction
	): Promise<void> {
		try {
			reply({
				result: {
					prompts: [],
				},
			});
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to list prompts: ${error.message}`,
				},
			});
		}
	}

	private async handleResourcesList(
		req: McpRequest,
		reply: McpReplyFunction | HttpMcpReplyFunction
	): Promise<void> {
		try {
			// Obsidian doesn't have the same resource concept as other IDEs
			// Return empty resources list
			console.debug(`[MCP] Resources list requested`);
			reply({
				result: {
					resources: [],
				},
			});
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to list resources: ${error.message}`,
				},
			});
		}
	}

	private async handleGetWorkspaceInfo(
		req: McpRequest,
		reply: McpReplyFunction | HttpMcpReplyFunction
	): Promise<void> {
		try {
			const vaultName = this.app.vault.getName();
			const basePath =
				(this.app.vault.adapter as any).getBasePath?.() || "unknown";
			const fileCount = this.app.vault.getFiles().length;

			reply({
				result: {
					name: vaultName,
					path: basePath,
					fileCount,
					type: "obsidian-vault",
				},
			});
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to get workspace info: ${error.message}`,
				},
			});
		}
	}
}
