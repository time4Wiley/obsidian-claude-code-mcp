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
		fs.writeFileSync(
			this.lockFilePath,
			JSON.stringify({
				name: "obsidian",
				pid: process.pid,
				port,
				proto: "ws",
			})
		);
	}

	private stopMcpServer() {
		this.wss?.close();
		if (this.lockFilePath && fs.existsSync(this.lockFilePath))
			fs.unlinkSync(this.lockFilePath);
	}

	/* ---------------- MCP message handler (stub) ---------------- */

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

			/* TODO: wire these into Obsidian’s API                *
			 * case "readFile":   …                                *
			 * case "writeFile":  …                                *
			 * case "getOpenFiles": …                              */

			default:
				return reply({
					error: { code: -32601, message: "method not implemented" },
				});
		}
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
