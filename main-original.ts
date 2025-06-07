/***********************************************************************
 * Claude MCP for Obsidian – main.ts
 *
 * 1. `npm i ws node-pty @types/ws @types/node --save`
 * 2. Compile with the normal Obsidian plugin build pipeline
 **********************************************************************/
import { Plugin, Notice, WorkspaceLeaf, Editor } from "obsidian";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import * as path from "path";

interface McpRequest {
	jsonrpc: "2.0";
	id: string | number;
	method: string;
	params?: any;
}

interface McpResponse {
	jsonrpc: "2.0";
	id: string | number;
	result?: any;
	error?: { code: number; message: string };
}

export default class ClaudeMcpPlugin extends Plugin {
	private wss!: WebSocketServer;
	private lockFilePath = "";
	private connectedClients: Set<WebSocket> = new Set();

	/* ---------------- core lifecycle ---------------- */

	async onload() {
		await this.startMcpServer();
		this.setupWorkspaceListeners();
		await this.launchClaudeTerminal(); // optional
		new Notice(
			"Claude MCP stub running. Open a terminal and run `claude`."
		);
	}

	onunload() {
		this.stopMcpServer();
	}

	/* ---------------- MCP server bootstrap ---------------- */

	private async startMcpServer() {
		// 0 = choose a random free port
		this.wss = new WebSocketServer({ port: 0 });

		// address() is cast-safe once server is listening
		const port = (this.wss.address() as any).port as number;

		this.wss.on("connection", (sock: WebSocket) => {
			this.connectedClients.add(sock);

			sock.on("message", (data) => {
				this.handleMcpMessage(sock, data.toString());
			});
			sock.on("close", () => {
				this.connectedClients.delete(sock);
			});
			sock.on("error", (error) => {
				this.connectedClients.delete(sock);
			});

			// Send initial file context when Claude connects
			this.sendCurrentFileContext();
		});

		this.wss.on("error", (error) => {});

		// Write the discovery lock-file Claude looks for
		const ideDir = path.join(
			process.env.HOME || process.env.USERPROFILE || ".",
			".claude",
			"ide"
		);
		fs.mkdirSync(ideDir, { recursive: true });

		this.lockFilePath = path.join(ideDir, `${port}.lock`);
		const basePath =
			(this.app.vault.adapter as any).getBasePath?.() || process.cwd();
		const lockFileContent = {
			pid: process.pid,
			workspaceFolders: [basePath],
			ideName: "Obsidian",
			transport: "ws",
		};
		fs.writeFileSync(this.lockFilePath, JSON.stringify(lockFileContent));

		// Set environment variables that Claude Code CLI expects
		process.env.CLAUDE_CODE_SSE_PORT = port.toString();
		process.env.ENABLE_IDE_INTEGRATION = "true";
	}

	private stopMcpServer() {
		this.wss?.close();
		if (this.lockFilePath && fs.existsSync(this.lockFilePath))
			fs.unlinkSync(this.lockFilePath);
	}

	/* ---------------- MCP message handler ---------------- */

	private handleMcpMessage(sock: WebSocket, raw: string) {
		let req: McpRequest;
		try {
			req = JSON.parse(raw);
		} catch {
			return; // ignore invalid JSON
		}

		const reply = (msg: Omit<McpResponse, "jsonrpc" | "id">) =>
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
				return this.handleReadFile(req, reply);

			case "writeFile":
				return this.handleWriteFile(req, reply);

			case "getOpenFiles":
				return this.handleGetOpenFiles(req, reply);

			case "listFiles":
				return this.handleListFiles(req, reply);

			case "getWorkspaceInfo":
				return this.handleGetWorkspaceInfo(req, reply);

			case "getCurrentFile":
				return this.handleGetCurrentFile(req, reply);

			case "tools/call":
				return this.handleToolCall(req, reply);

			default:
				return reply({
					error: { code: -32601, message: "method not implemented" },
				});
		}
	}

	/* ---------------- MCP method implementations ---------------- */

	private async handleInitialize(req: McpRequest, reply: (msg: any) => void) {
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

	private async handleInitialized(
		req: McpRequest,
		reply: (msg: any) => void
	) {
		// No response needed for notifications
	}

	private async handleIdeConnected(
		req: McpRequest,
		reply: (msg: any) => void
	) {
		const { pid } = req.params || {};
		// No response needed for notifications
	}

	private async handleToolsList(req: McpRequest, reply: (msg: any) => void) {
		try {
			const tools = [
				{
					name: "get_current_file",
					description: "Get the currently active file in Obsidian",
					inputSchema: {
						type: "object",
						properties: {},
					},
				},
				{
					name: "get_workspace_files",
					description: "List all files in the Obsidian vault",
					inputSchema: {
						type: "object",
						properties: {
							pattern: {
								type: "string",
								description: "Optional pattern to filter files",
							},
						},
					},
				},
			];

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
		reply: (msg: any) => void
	) {
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

	private async handleToolCall(req: McpRequest, reply: (msg: any) => void) {
		try {
			const { name, arguments: args } = req.params || {};

			switch (name) {
				case "get_current_file":
					const activeFile = this.app.workspace.getActiveFile();
					return reply({
						result: {
							content: [
								{
									type: "text",
									text: activeFile
										? `Current file: ${activeFile.path}`
										: "No file currently active",
								},
							],
						},
					});

				case "get_workspace_files":
					const { pattern } = args || {};
					const allFiles = this.app.vault.getFiles();
					let filteredFiles = allFiles.map((file) => file.path);

					if (pattern && typeof pattern === "string") {
						const regex = new RegExp(pattern);
						filteredFiles = filteredFiles.filter((path) =>
							regex.test(path)
						);
					}

					return reply({
						result: {
							content: [
								{
									type: "text",
									text: `Files in vault:\n${filteredFiles.join(
										"\n"
									)}`,
								},
							],
						},
					});

				default:
					return reply({
						error: { code: -32601, message: "tool not found" },
					});
			}
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to call tool: ${error.message}`,
				},
			});
		}
	}

	private async handleReadFile(req: McpRequest, reply: (msg: any) => void) {
		try {
			const { path } = req.params || {};
			if (!path || typeof path !== "string") {
				return reply({
					error: { code: -32602, message: "invalid path parameter" },
				});
			}

			const normalizedPath = this.normalizePath(path);
			if (!normalizedPath) {
				return reply({
					error: { code: -32603, message: "invalid file path" },
				});
			}

			const content = await this.app.vault.adapter.read(normalizedPath);
			reply({ result: content });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to read file: ${error.message}`,
				},
			});
		}
	}

	private async handleWriteFile(req: McpRequest, reply: (msg: any) => void) {
		try {
			const { path, content } = req.params || {};
			if (
				!path ||
				typeof path !== "string" ||
				typeof content !== "string"
			) {
				return reply({
					error: { code: -32602, message: "invalid parameters" },
				});
			}

			const normalizedPath = this.normalizePath(path);
			if (!normalizedPath) {
				return reply({
					error: { code: -32603, message: "invalid file path" },
				});
			}

			await this.app.vault.adapter.write(normalizedPath, content);
			reply({ result: true });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to write file: ${error.message}`,
				},
			});
		}
	}

	private async handleGetOpenFiles(
		req: McpRequest,
		reply: (msg: any) => void
	) {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			const openFiles = activeFile ? [activeFile.path] : [];
			reply({ result: openFiles });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to get open files: ${error.message}`,
				},
			});
		}
	}

	private async handleGetCurrentFile(
		req: McpRequest,
		reply: (msg: any) => void
	) {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			reply({ result: activeFile ? activeFile.path : null });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to get current file: ${error.message}`,
				},
			});
		}
	}

	private async handleListFiles(req: McpRequest, reply: (msg: any) => void) {
		try {
			const { pattern } = req.params || {};
			const allFiles = this.app.vault.getFiles();

			let filteredFiles = allFiles.map((file) => file.path);

			if (pattern && typeof pattern === "string") {
				const regex = new RegExp(pattern);
				filteredFiles = filteredFiles.filter((path) =>
					regex.test(path)
				);
			}

			reply({ result: filteredFiles });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to list files: ${error.message}`,
				},
			});
		}
	}

	private async handleGetWorkspaceInfo(
		req: McpRequest,
		reply: (msg: any) => void
	) {
		try {
			const vaultName = this.app.vault.getName();
			const basePath =
				(this.app.vault.adapter as any).getBasePath?.() || "unknown";
			const fileCount = this.app.vault.getFiles().length;

			const workspaceInfo = {
				name: vaultName,
				path: basePath,
				fileCount,
				type: "obsidian-vault",
			};

			reply({ result: workspaceInfo });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to get workspace info: ${error.message}`,
				},
			});
		}
	}

	/* ---------------- workspace event handling ---------------- */

	private setupWorkspaceListeners() {
		// Listen for active file changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.sendCurrentFileContext();
			})
		);

		// Listen for file opens
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.sendCurrentFileContext();
			})
		);

		// Listen for DOM selection changes (replaces editor-change polling)
		this.registerDomEvent(document, "selectionchange", () => {
			this.checkAndSendSelection();
		});
	}

	private checkAndSendSelection() {
		const activeLeaf = this.app.workspace.activeLeaf;
		const view = activeLeaf?.view;
		const editor = (view as any)?.editor;

		if (editor) {
			this.sendSelectionContext(editor);
		}
	}

	private sendCurrentFileContext() {
		if (this.connectedClients.size === 0) return;

		const activeFile = this.app.workspace.getActiveFile();

		// Try to get the active editor for cursor/selection info
		const activeLeaf = this.app.workspace.activeLeaf;
		const view = activeLeaf?.view;
		const editor = (view as any)?.editor;

		if (editor && activeFile) {
			this.sendSelectionContext(editor);
		} else {
			// Fallback to basic file context
			const message = {
				jsonrpc: "2.0",
				method: "selection_changed",
				params: {
					text: "",
					filePath: activeFile ? activeFile.path : null,
					fileUrl: activeFile
						? `file://${this.getAbsolutePath(activeFile.path)}`
						: null,
					selection: {
						start: { line: 0, character: 0 },
						end: { line: 0, character: 0 },
						isEmpty: true,
					},
				},
			};

			this.broadcastToClients(message);
		}
	}

	private sendSelectionContext(editor: Editor) {
		if (this.connectedClients.size === 0) return;

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		// Get cursor position and selection
		const cursor = editor.getCursor();
		const selection = editor.getSelection();
		const hasSelection = selection.length > 0;

		// Get selection range if text is selected
		let selectionRange;
		if (hasSelection) {
			const from = editor.getCursor("from");
			const to = editor.getCursor("to");
			selectionRange = {
				start: { line: from.line, character: from.ch },
				end: { line: to.line, character: to.ch },
				isEmpty: false,
			};
		} else {
			selectionRange = {
				start: { line: cursor.line, character: cursor.ch },
				end: { line: cursor.line, character: cursor.ch },
				isEmpty: true,
			};
		}

		const message = {
			jsonrpc: "2.0",
			method: "selection_changed",
			params: {
				text: selection,
				filePath: activeFile.path,
				fileUrl: `file://${this.getAbsolutePath(activeFile.path)}`,
				selection: selectionRange,
			},
		};

		this.broadcastToClients(message);
	}

	private broadcastToClients(message: any) {
		const messageStr = JSON.stringify(message);
		for (const client of this.connectedClients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(messageStr);
			}
		}
	}

	private getAbsolutePath(relativePath: string): string {
		const basePath =
			(this.app.vault.adapter as any).getBasePath?.() || process.cwd();
		return `${basePath}/${relativePath}`;
	}

	/* ---------------- utility methods ---------------- */

	private normalizePath(path: string): string | null {
		// Remove leading slash if present (vault-relative paths)
		const cleaned = path.startsWith("/") ? path.slice(1) : path;

		// Basic validation - no directory traversal
		if (cleaned.includes("..") || cleaned.includes("~")) {
			return null;
		}

		return cleaned;
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
