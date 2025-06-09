#!/usr/bin/env node
/**
 * MCP Client Test Script
 * Tests both HTTP/SSE and WebSocket endpoints
 */

const http = require("http");
const { EventSource } = require("eventsource");
const WebSocket = require("ws");

class McpTester {
	constructor(port = 22360) {
		this.HTTP_PORT = port;
		this.BASE_URL = `http://localhost:${port}`;
		this.testResults = [];
		this.requestId = 0;
	}

	log(message, type = "INFO") {
		const timestamp = new Date().toISOString();
		console.log(`[${timestamp}] [${type}] ${message}`);
	}

	async delay(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	nextId() {
		return ++this.requestId;
	}

	async testHttpPost(endpoint, request) {
		return new Promise((resolve, reject) => {
			const data = JSON.stringify(request);
			const options = {
				hostname: "localhost",
				port: this.HTTP_PORT,
				path: endpoint,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(data),
				},
			};

			const req = http.request(options, (res) => {
				let body = "";
				res.on("data", (chunk) => (body += chunk));
				res.on("end", () => {
					try {
						const response = JSON.parse(body);
						resolve({ statusCode: res.statusCode, response });
					} catch (error) {
						reject(new Error(`Invalid JSON response: ${body}`));
					}
				});
			});

			req.on("error", reject);
			req.write(data);
			req.end();
		});
	}

	async testSseConnection(endpoint) {
		return new Promise((resolve, reject) => {
			const eventSource = new EventSource(`${this.BASE_URL}${endpoint}`);
			const events = [];
			let timeout;

			eventSource.onopen = () => {
				this.log(`SSE connection opened to ${endpoint}`);
			};

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					events.push(data);
					this.log(`SSE message received: ${JSON.stringify(data)}`);
				} catch (error) {
					this.log(`Invalid SSE JSON: ${event.data}`, "ERROR");
				}
			};

			eventSource.onerror = (error) => {
				this.log(`SSE error: ${error.message}`, "ERROR");
				clearTimeout(timeout);
				eventSource.close();
				reject(error);
			};

			// Close after 2 seconds and return received events
			timeout = setTimeout(() => {
				eventSource.close();
				resolve(events);
			}, 2000);
		});
	}

	async runHttpTests() {
		this.log("=== HTTP POST TESTS ===");

		const tests = [
			{
				name: "Initialize",
				endpoint: "/messages",
				request: {
					jsonrpc: "2.0",
					id: this.nextId(),
					method: "initialize",
					params: {
						protocolVersion: "2025-03-26",
						capabilities: {},
						clientInfo: { name: "test-client", version: "1.0.0" },
					},
				},
			},
			{
				name: "List Tools",
				endpoint: "/messages",
				request: {
					jsonrpc: "2.0",
					id: this.nextId(),
					method: "tools/list",
					params: {},
				},
			},
			{
				name: "Get Workspace Info",
				endpoint: "/messages",
				request: {
					jsonrpc: "2.0",
					id: this.nextId(),
					method: "getWorkspaceInfo",
					params: {},
				},
			},
			{
				name: "List Files",
				endpoint: "/messages",
				request: {
					jsonrpc: "2.0",
					id: this.nextId(),
					method: "listFiles",
					params: {},
				},
			},
			{
				name: "Ping",
				endpoint: "/messages",
				request: {
					jsonrpc: "2.0",
					id: this.nextId(),
					method: "ping",
					params: {},
				},
			},
		];

		// Test new streamable HTTP endpoint
		this.log("Testing /mcp endpoint...");
		for (const test of tests) {
			try {
				const result = await this.testHttpPost("/mcp", test.request);
				this.log(
					`✅ ${test.name}: ${result.statusCode} - ${JSON.stringify(
						result.response
					)}`
				);
				this.testResults.push({
					test: test.name,
					endpoint: "/mcp",
					success: true,
					result,
				});
			} catch (error) {
				this.log(`❌ ${test.name}: ${error.message}`, "ERROR");
				this.testResults.push({
					test: test.name,
					endpoint: "/mcp",
					success: false,
					error: error.message,
				});
			}
			await this.delay(100);
		}

		// Test legacy /messages endpoint
		this.log("Testing /messages endpoint...");
		for (const test of tests) {
			try {
				const result = await this.testHttpPost(
					"/messages",
					test.request
				);
				this.log(
					`✅ ${test.name}: ${result.statusCode} - ${JSON.stringify(
						result.response
					)}`
				);
				this.testResults.push({
					test: test.name,
					endpoint: "/messages",
					success: true,
					result,
				});
			} catch (error) {
				this.log(`❌ ${test.name}: ${error.message}`, "ERROR");
				this.testResults.push({
					test: test.name,
					endpoint: "/messages",
					success: false,
					error: error.message,
				});
			}
			await this.delay(100);
		}
	}

	async runSseTests() {
		this.log("=== SSE CONNECTION TESTS ===");

		const sseEndpoints = ["/sse"];

		for (const endpoint of sseEndpoints) {
			try {
				this.log(`Testing SSE connection to ${endpoint}...`);
				const events = await this.testSseConnection(endpoint);
				this.log(
					`✅ SSE ${endpoint}: Received ${events.length} events`
				);
				this.testResults.push({
					test: "SSE Connection",
					endpoint,
					success: true,
					events,
				});
			} catch (error) {
				this.log(`❌ SSE ${endpoint}: ${error.message}`, "ERROR");
				this.testResults.push({
					test: "SSE Connection",
					endpoint,
					success: false,
					error: error.message,
				});
			}
		}
	}

	async testWebSocket() {
		this.log("=== WEBSOCKET TESTS ===");

		// Try to find WebSocket port from lock files
		const fs = require("fs");
		const path = require("path");
		const os = require("os");

		const ideDir = path.join(os.homedir(), ".claude", "ide");

		try {
			if (fs.existsSync(ideDir)) {
				const files = fs.readdirSync(ideDir);
				const lockFiles = files.filter((f) => f.endsWith(".lock"));

				if (lockFiles.length > 0) {
					const lockFile = lockFiles[0];
					const port = lockFile.replace(".lock", "");

					this.log(`Found WebSocket port ${port} from lock file`);

					return new Promise((resolve) => {
						const ws = new WebSocket(`ws://localhost:${port}`);

						ws.on("open", () => {
							this.log("✅ WebSocket connection established");

							// Send ping
							const pingRequest = {
								jsonrpc: "2.0",
								id: this.nextId(),
								method: "ping",
								params: {},
							};

							ws.send(JSON.stringify(pingRequest));
						});

						ws.on("message", (data) => {
							const response = JSON.parse(data.toString());
							this.log(
								`WebSocket response: ${JSON.stringify(
									response
								)}`
							);
							ws.close();
							resolve(true);
						});

						ws.on("error", (error) => {
							this.log(
								`❌ WebSocket error: ${error.message}`,
								"ERROR"
							);
							resolve(false);
						});

						setTimeout(() => {
							ws.close();
							resolve(false);
						}, 3000);
					});
				}
			}

			this.log("❌ No WebSocket lock files found", "ERROR");
			return false;
		} catch (error) {
			this.log(`❌ WebSocket test failed: ${error.message}`, "ERROR");
			return false;
		}
	}

	async runAllTests() {
		this.log("🚀 Starting MCP Server Tests...");
		this.log(`Testing server at ${this.BASE_URL}`);

		// Test if server is running
		try {
			await this.testHttpPost("/mcp", { test: true });
		} catch (error) {
			this.log(
				"❌ Server not responding. Make sure Obsidian plugin is running!",
				"ERROR"
			);
			return;
		}

		await this.runHttpTests();
		await this.runSseTests();
		await this.testWebSocket();

		this.log("=== TEST SUMMARY ===");
		const total = this.testResults.length;
		const passed = this.testResults.filter((r) => r.success).length;
		const failed = total - passed;

		this.log(`Total tests: ${total}`);
		this.log(`✅ Passed: ${passed}`);
		this.log(`❌ Failed: ${failed}`);

		if (failed > 0) {
			this.log("Failed tests:");
			this.testResults
				.filter((r) => !r.success)
				.forEach((r) => {
					this.log(`  - ${r.test} (${r.endpoint}): ${r.error}`);
				});
		}
	}
}

// Check if EventSource is available
if (typeof EventSource === "undefined") {
	console.log("Installing eventsource dependency...");
	require("child_process").execSync("npm install eventsource", {
		stdio: "inherit",
	});
	process.exit(1);
}

// Run tests
const port = process.argv[2] || 22360;
console.log(
	`Using port: ${port} (override with: node test-mcp-client.js [port])`
);
const tester = new McpTester(parseInt(port));
tester.runAllTests().catch(console.error);
