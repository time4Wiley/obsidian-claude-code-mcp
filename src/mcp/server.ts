import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import * as path from "path";
import { McpRequest, McpNotification } from "./types";

export interface McpServerConfig {
	onMessage: (ws: WebSocket, request: McpRequest) => void;
	onConnection?: (ws: WebSocket) => void;
	onDisconnection?: (ws: WebSocket) => void;
}

export class McpServer {
	private wss!: WebSocketServer;
	private lockFilePath = "";
	private connectedClients: Set<WebSocket> = new Set();
	private config: McpServerConfig;

	constructor(config: McpServerConfig) {
		this.config = config;
	}

	async start(): Promise<number> {
		// 0 = choose a random free port
		this.wss = new WebSocketServer({ port: 0 });

		// address() is cast-safe once server is listening
		const port = (this.wss.address() as any).port as number;

		this.wss.on("connection", (sock: WebSocket) => {
			console.debug("[MCP] Client connected");
			this.connectedClients.add(sock);

			sock.on("message", (data) => {
				this.handleMessage(sock, data.toString());
			});

			sock.on("close", () => {
				console.debug("[MCP] Client disconnected");
				this.connectedClients.delete(sock);
				this.config.onDisconnection?.(sock);
			});

			sock.on("error", (error) => {
				console.debug("[MCP] Client error:", error);
				this.connectedClients.delete(sock);
			});

			this.config.onConnection?.(sock);
		});

		this.wss.on("error", (error) => {
			console.error("WebSocket server error:", error);
		});

		// Write the discovery lock-file Claude looks for
		await this.createLockFile(port);

		// Set environment variables that Claude Code CLI expects
		process.env.CLAUDE_CODE_SSE_PORT = port.toString();
		process.env.ENABLE_IDE_INTEGRATION = "true";

		return port;
	}

	stop(): void {
		this.wss?.close();
		if (this.lockFilePath && fs.existsSync(this.lockFilePath)) {
			fs.unlinkSync(this.lockFilePath);
		}
	}

	broadcast(message: McpNotification): void {
		const messageStr = JSON.stringify(message);
		console.debug("[MCP] Broadcasting message:", messageStr);
		for (const client of this.connectedClients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(messageStr);
			}
		}
	}

	get clientCount(): number {
		return this.connectedClients.size;
	}

	private async createLockFile(port: number): Promise<void> {
		const ideDir = path.join(
			process.env.HOME || process.env.USERPROFILE || ".",
			".claude",
			"ide"
		);
		fs.mkdirSync(ideDir, { recursive: true });

		this.lockFilePath = path.join(ideDir, `${port}.lock`);
		
		// We'll get the base path from the caller
		const lockFileContent = {
			pid: process.pid,
			workspaceFolders: [], // Will be populated by caller
			ideName: "Obsidian",
			transport: "ws",
		};
		fs.writeFileSync(this.lockFilePath, JSON.stringify(lockFileContent));
	}

	updateWorkspaceFolders(basePath: string): void {
		if (this.lockFilePath && fs.existsSync(this.lockFilePath)) {
			const lockContent = JSON.parse(fs.readFileSync(this.lockFilePath, 'utf8'));
			lockContent.workspaceFolders = [basePath];
			fs.writeFileSync(this.lockFilePath, JSON.stringify(lockContent));
		}
	}

	private handleMessage(sock: WebSocket, raw: string): void {
		console.debug("[MCP] Received message:", raw);
		let req: McpRequest;
		try {
			req = JSON.parse(raw);
		} catch {
			console.debug("[MCP] Invalid JSON received:", raw);
			return; // ignore invalid JSON
		}

		this.config.onMessage(sock, req);
	}
}