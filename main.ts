/***********************************************************************
 * Claude MCP for Obsidian – main.ts
 *
 * 1. `npm i ws node-pty @types/ws @types/node --save`
 * 2. Compile with the normal Obsidian plugin build pipeline
 **********************************************************************/
import { Plugin, Notice, WorkspaceLeaf } from "obsidian";
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

	/* ---------------- core lifecycle ---------------- */

	async onload() {
		await this.startMcpServer();
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

		this.wss.on("connection", (sock: WebSocket) =>
			sock.on("message", (data) =>
				this.handleMcpMessage(sock, data.toString())
			)
		);

		// Write the discovery lock-file Claude looks for
		const ideDir = path.join(
			process.env.HOME || process.env.USERPROFILE || ".",
			".claude",
			"ide"
		);
		fs.mkdirSync(ideDir, { recursive: true });

		this.lockFilePath = path.join(ideDir, `${process.pid}.lock`);
		const basePath =
			(this.app.vault.adapter as any).getBasePath?.() || process.cwd();
		fs.writeFileSync(
			this.lockFilePath,
			JSON.stringify({
				pid: process.pid,
				workspaceFolders: [basePath],
				ideName: "Obsidian",
				transport: "ws",
				port,
			})
		);
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

			default:
				return reply({
					error: { code: -32601, message: "method not implemented" },
				});
		}
	}

	/* ---------------- MCP method implementations ---------------- */

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
