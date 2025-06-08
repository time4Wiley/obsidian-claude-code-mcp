#!/usr/bin/env node
/**
 * Manual MCP Request Tester
 * Interactive script to send custom MCP requests
 */

const http = require('http');
const readline = require('readline');

class ManualMcpTester {
    constructor(port = 8080) {
        this.HTTP_PORT = port;
        this.requestId = 0;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    nextId() {
        return ++this.requestId;
    }

    async sendRequest(endpoint, method, params = {}) {
        const request = {
            jsonrpc: "2.0",
            id: this.nextId(),
            method: method,
            params: params
        };

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(request);
            const options = {
                hostname: 'localhost',
                port: this.HTTP_PORT,
                path: endpoint,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
            };

            console.log(`\n📤 Sending to ${endpoint}:`);
            console.log(JSON.stringify(request, null, 2));

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    console.log(`\n📥 Response (${res.statusCode}):`);
                    try {
                        const response = JSON.parse(body);
                        console.log(JSON.stringify(response, null, 2));
                        resolve(response);
                    } catch (error) {
                        console.log(body);
                        reject(new Error(`Invalid JSON: ${body}`));
                    }
                });
            });

            req.on('error', (error) => {
                console.log(`❌ Request failed: ${error.message}`);
                reject(error);
            });

            req.write(data);
            req.end();
        });
    }

    async showMenu() {
        console.log('\n=== MCP Manual Tester ===');
        console.log('1. Initialize');
        console.log('2. List Tools');
        console.log('3. Get Workspace Info');
        console.log('4. List Files');
        console.log('5. Read File (enter path)');
        console.log('6. Write File (enter path and content)');
        console.log('7. Get Current File');
        console.log('8. Ping');
        console.log('9. Custom Request');
        console.log('0. Exit');
        console.log('\nEndpoints: /mcp (new) or /messages (legacy)');
    }

    async promptChoice() {
        return new Promise((resolve) => {
            this.rl.question('\nChoice: ', resolve);
        });
    }

    async promptInput(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }

    async handleChoice(choice) {
        const endpoint = await this.promptInput('Endpoint (/mcp or /messages): ') || '/mcp';

        switch (choice) {
            case '1':
                await this.sendRequest(endpoint, 'initialize', {
                    protocolVersion: "2025-03-26",
                    capabilities: {},
                    clientInfo: { name: "manual-tester", version: "1.0.0" }
                });
                break;

            case '2':
                await this.sendRequest(endpoint, 'tools/list');
                break;

            case '3':
                await this.sendRequest(endpoint, 'getWorkspaceInfo');
                break;

            case '4':
                const pattern = await this.promptInput('File pattern (optional): ');
                await this.sendRequest(endpoint, 'listFiles', pattern ? { pattern } : {});
                break;

            case '5':
                const readPath = await this.promptInput('File path: ');
                await this.sendRequest(endpoint, 'readFile', { path: readPath });
                break;

            case '6':
                const writePath = await this.promptInput('File path: ');
                const content = await this.promptInput('Content: ');
                await this.sendRequest(endpoint, 'writeFile', { path: writePath, content });
                break;

            case '7':
                await this.sendRequest(endpoint, 'getCurrentFile');
                break;

            case '8':
                await this.sendRequest(endpoint, 'ping');
                break;

            case '9':
                const method = await this.promptInput('Method name: ');
                const paramsStr = await this.promptInput('Params (JSON, empty for {}): ');
                let params = {};
                if (paramsStr.trim()) {
                    try {
                        params = JSON.parse(paramsStr);
                    } catch (error) {
                        console.log('❌ Invalid JSON params, using empty object');
                    }
                }
                await this.sendRequest(endpoint, method, params);
                break;

            case '0':
                console.log('Goodbye!');
                this.rl.close();
                return false;

            default:
                console.log('Invalid choice');
        }

        return true;
    }

    async run() {
        console.log('🔧 Manual MCP Request Tester');
        console.log(`Make sure Obsidian plugin is running on localhost:${this.HTTP_PORT}\n`);

        let running = true;
        while (running) {
            await this.showMenu();
            const choice = await this.promptChoice();
            running = await this.handleChoice(choice);
        }
    }
}

const port = process.argv[2] || 8080;
console.log(`Using port: ${port} (override with: node test-manual-requests.js [port])`);
const tester = new ManualMcpTester(parseInt(port));
tester.run().catch(console.error);