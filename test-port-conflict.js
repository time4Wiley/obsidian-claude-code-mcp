#!/usr/bin/env node
/**
 * Port Conflict Test
 * Simulates multiple vault scenario by occupying a port and testing conflict detection
 */

const http = require('http');

class PortConflictTester {
    constructor(port = 22360) {
        this.port = port;
        this.servers = [];
    }

    async startMockServer() {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Mock server occupying port for testing');
            });

            server.listen(this.port, '127.0.0.1', () => {
                console.log(`✅ Mock server started on port ${this.port}`);
                this.servers.push(server);
                resolve(server);
            });

            server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.log(`❌ Port ${this.port} is already in use (this is expected if testing conflict)`);
                    resolve(null);
                } else {
                    reject(error);
                }
            });
        });
    }

    async testPortConflict() {
        console.log('🧪 Testing port conflict scenario...');
        console.log(`This simulates what happens when multiple Obsidian vaults try to use port ${this.port}`);
        
        // Start first "vault" server
        const server1 = await this.startMockServer();
        
        if (!server1) {
            console.log('Port already in use, cannot run test');
            return;
        }

        // Try to start second "vault" server (this should fail)
        console.log('\n🔄 Attempting to start second server on same port...');
        const server2 = await this.startMockServer();
        
        if (!server2) {
            console.log('✅ Second server correctly failed with EADDRINUSE');
            console.log('\n📝 When this happens in Obsidian:');
            console.log('   The user will see a notification explaining:');
            console.log('   • Port is already in use');
            console.log('   • Might be another vault running the plugin');
            console.log('   • Instructions to configure a different port');
        } else {
            console.log('❌ Unexpected: Second server started (should have failed)');
        }

        // Clean up
        this.cleanup();
    }

    async testMcpConnection() {
        console.log('\n🔗 Testing actual MCP connection to running server...');
        
        const data = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "ping",
            params: {}
        });

        const options = {
            hostname: 'localhost',
            port: this.port,
            path: '/mcp',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        };

        return new Promise((resolve) => {
            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        console.log('✅ MCP server is responding');
                        try {
                            const response = JSON.parse(body);
                            console.log('📥 Response:', JSON.stringify(response, null, 2));
                        } catch (e) {
                            console.log('📥 Response (non-JSON):', body);
                        }
                    } else {
                        console.log(`❌ MCP server returned ${res.statusCode}: ${body}`);
                    }
                    resolve();
                });
            });

            req.on('error', (error) => {
                console.log(`❌ MCP connection failed: ${error.message}`);
                resolve();
            });

            req.write(data);
            req.end();
        });
    }

    cleanup() {
        this.servers.forEach(server => {
            if (server) {
                server.close();
            }
        });
        this.servers = [];
        console.log('\n🧹 Cleanup completed');
    }

    async run() {
        console.log('🚀 Port Conflict Tester');
        console.log('=' .repeat(50));
        
        try {
            // Test if port is available or if Obsidian MCP is already running
            await this.testMcpConnection();
            
            // Test port conflict simulation
            await this.testPortConflict();
            
        } catch (error) {
            console.error('Test failed:', error);
        } finally {
            this.cleanup();
        }
    }
}

// Run the test
const port = process.argv[2] || 22360;
console.log(`Using port: ${port} (override with: node test-port-conflict.js [port])`);
const tester = new PortConflictTester(parseInt(port));
tester.run().catch(console.error);