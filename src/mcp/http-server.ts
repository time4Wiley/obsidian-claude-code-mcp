import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse } from "url";
import { McpRequest, McpNotification, McpResponse } from "./types";

export interface HttpServerConfig {
	onMessage: (request: McpRequest, reply: (response: Omit<McpResponse, "jsonrpc" | "id">) => void) => void;
	onConnection?: (sessionId: string) => void;
	onDisconnection?: (sessionId: string) => void;
}

interface SseConnection {
	response: ServerResponse;
	sessionId: string;
	lastEventId?: string;
}

export class McpHttpServer {
	private server: any;
	private connections: Map<string, SseConnection> = new Map();
	private config: HttpServerConfig;
	private port: number = 22360;

	constructor(config: HttpServerConfig) {
		this.config = config;
	}

	async start(port: number = 22360): Promise<number> {
		this.port = port;
		
		this.server = createServer((req, res) => {
			this.handleRequest(req, res);
		});

		return new Promise((resolve, reject) => {
			this.server.listen(port, '127.0.0.1', () => {
				console.debug(`[MCP HTTP] Server listening on http://127.0.0.1:${port}`);
				resolve(port);
			});

			this.server.on('error', (error: Error) => {
				console.error('[MCP HTTP] Server error:', error);
				
				// Enhance error messages for common issues
				if ((error as any).code === 'EADDRINUSE') {
					const enhancedError = new Error(`Port ${port} is already in use. Please choose a different port.`);
					enhancedError.name = 'PortInUseError';
					(enhancedError as any).code = 'EADDRINUSE';
					reject(enhancedError);
				} else if ((error as any).code === 'EACCES') {
					const enhancedError = new Error(`Permission denied for port ${port}. Try using a port above 1024.`);
					enhancedError.name = 'PermissionError';
					(enhancedError as any).code = 'EACCES';
					reject(enhancedError);
				} else {
					reject(error);
				}
			});
		});
	}

	stop(): void {
		if (this.server) {
			// Close all SSE connections
			for (const connection of this.connections.values()) {
				connection.response.end();
			}
			this.connections.clear();

			this.server.close();
		}
	}

	broadcast(message: McpNotification): void {
		const eventData = JSON.stringify(message);
		const eventId = Date.now().toString();
		
		console.debug('[MCP HTTP] Broadcasting notification:', eventData);
		
		for (const connection of this.connections.values()) {
			if (!connection.response.destroyed) {
				this.sendSseEvent(connection.response, eventData, eventId);
			}
		}
	}

	get clientCount(): number {
		return this.connections.size;
	}

	private handleRequest(req: IncomingMessage, res: ServerResponse): void {
		const url = parse(req.url || '', true);
		const pathname = url.pathname || '';
		
		// Set CORS headers
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID');

		if (req.method === 'OPTIONS') {
			res.writeHead(200);
			res.end();
			return;
		}

		console.debug(`[MCP HTTP] ${req.method} ${pathname}`);

		if (pathname === '/sse' || pathname === '/sse/') {
			this.handleSseConnection(req, res);
		} else if (pathname === '/messages' || pathname === '/messages/') {
			this.handleMessagePost(req, res);
		} else if (pathname === '/mcp') {
			// New streamable HTTP endpoint
			if (req.method === 'GET') {
				this.handleSseConnection(req, res);
			} else if (req.method === 'POST') {
				this.handleMessagePost(req, res);
			} else {
				res.writeHead(405, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Method not allowed' }));
			}
		} else {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
		}
	}

	private handleSseConnection(req: IncomingMessage, res: ServerResponse): void {
		const sessionId = this.generateSessionId();
		const lastEventId = req.headers['last-event-id'] as string;

		console.debug(`[MCP HTTP] SSE connection established: ${sessionId}`);

		// Set SSE headers
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Last-Event-ID',
		});

		// Store connection
		const connection: SseConnection = {
			response: res,
			sessionId,
			lastEventId,
		};
		this.connections.set(sessionId, connection);

		// Handle client disconnect
		req.on('close', () => {
			console.debug(`[MCP HTTP] SSE connection closed: ${sessionId}`);
			this.connections.delete(sessionId);
			this.config.onDisconnection?.(sessionId);
		});

		req.on('error', (error) => {
			console.debug(`[MCP HTTP] SSE connection error: ${sessionId}`, error);
			this.connections.delete(sessionId);
		});

		// Send initial connection event
		this.sendSseEvent(res, JSON.stringify({
			jsonrpc: "2.0",
			method: "notifications/initialized",
			params: { sessionId }
		}), Date.now().toString());

		this.config.onConnection?.(sessionId);
	}

	private handleMessagePost(req: IncomingMessage, res: ServerResponse): void {
		let body = '';

		req.on('data', (chunk) => {
			body += chunk.toString();
		});

		req.on('end', () => {
			try {
				const mcpRequest: McpRequest = JSON.parse(body);
				console.debug('[MCP HTTP] Received message:', mcpRequest);

				const reply = (response: Omit<McpResponse, "jsonrpc" | "id">) => {
					const mcpResponse: McpResponse = {
						jsonrpc: "2.0",
						id: mcpRequest.id,
						...response,
					};

					res.setHeader('Content-Type', 'application/json');
					res.writeHead(200);
					res.end(JSON.stringify(mcpResponse));
				};

				this.config.onMessage(mcpRequest, reply);

			} catch (error) {
				console.error('[MCP HTTP] Error parsing request:', error);
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: { code: -32700, message: "Parse error" }
				}));
			}
		});

		req.on('error', (error) => {
			console.error('[MCP HTTP] Request error:', error);
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				jsonrpc: "2.0",
				id: null,
				error: { code: -32603, message: "Internal error" }
			}));
		});
	}

	private sendSseEvent(res: ServerResponse, data: string, id?: string): void {
		if (res.destroyed) return;

		try {
			if (id) {
				res.write(`id: ${id}\n`);
			}
			res.write(`data: ${data}\n\n`);
		} catch (error) {
			console.error('[MCP HTTP] Error sending SSE event:', error);
		}
	}

	private generateSessionId(): string {
		return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}