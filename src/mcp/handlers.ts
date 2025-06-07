import { App } from "obsidian";
import { WebSocket } from "ws";
import { McpRequest, McpReplyFunction } from "./types";
import { FileTools } from "../tools/file-tools";
import { WorkspaceTools } from "../tools/workspace-tools";

export class McpHandlers {
	private fileTools: FileTools;
	private workspaceTools: WorkspaceTools;

	constructor(private app: App) {
		this.fileTools = new FileTools(app);
		this.workspaceTools = new WorkspaceTools(app);
	}

	async handleRequest(sock: WebSocket, req: McpRequest): Promise<void> {
		const reply: McpReplyFunction = (msg) =>
			sock.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, ...msg }));

		switch (req.method) {
			case "initialize":
				return this.handleInitialize(req, reply);

			case "notifications/initialized":
				return this.handleInitialized(req, reply);

			case "ide_connected":
				return this.handleIdeConnected(req, reply);

			case "tools/list":
				return this.handleToolsList(req, reply);

			case "prompts/list":
				return this.handlePromptsList(req, reply);

			case "ping":
				return reply({ result: "pong" });

			case "readFile":
				return this.fileTools.handleReadFile(req, reply);

			case "writeFile":
				return this.fileTools.handleWriteFile(req, reply);

			case "getOpenFiles":
				return this.fileTools.handleGetOpenFiles(req, reply);

			case "listFiles":
				return this.fileTools.handleListFiles(req, reply);

			case "getWorkspaceInfo":
				return this.workspaceTools.handleGetWorkspaceInfo(req, reply);

			case "getCurrentFile":
				return this.fileTools.handleGetCurrentFile(req, reply);

			case "tools/call":
				return this.workspaceTools.handleToolCall(req, reply);

			default:
				return reply({
					error: { code: -32601, message: "method not implemented" },
				});
		}
	}

	private async handleInitialize(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		try {
			const { protocolVersion, capabilities, clientInfo } =
				req.params || {};

			// Respond with server capabilities
			reply({
				result: {
					protocolVersion: "2025-03-26",
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
						name: "obsidian-claude-code",
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

	private async handleInitialized(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		// No response needed for notifications
	}

	private async handleIdeConnected(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		const { pid } = req.params || {};
		// No response needed for notifications
	}

	private async handleToolsList(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		try {
			const tools = this.workspaceTools.getToolDefinitions();
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

	private async handlePromptsList(req: McpRequest, reply: McpReplyFunction): Promise<void> {
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
}