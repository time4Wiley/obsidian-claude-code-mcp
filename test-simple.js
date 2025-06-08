#!/usr/bin/env node
/**
 * Simple HTTP test to check if MCP server responds
 */

const http = require('http');

function testPing() {
    const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
        params: {}
    };

    const data = JSON.stringify(request);
    const port = process.argv[2] || 8080;
    const options = {
        hostname: 'localhost',
        port: parseInt(port),
        path: '/mcp',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
        },
    };

    console.log('🔍 Testing MCP server...');
    console.log(`📤 Sending ping to http://localhost:${port}/mcp`);

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log(`📥 Response (${res.statusCode}):`);
            try {
                const response = JSON.parse(body);
                console.log(JSON.stringify(response, null, 2));
                
                if (response.result === 'pong') {
                    console.log('✅ MCP server is working correctly!');
                } else {
                    console.log('⚠️  Unexpected response from MCP server');
                }
            } catch (error) {
                console.log('❌ Invalid JSON response:', body);
            }
        });
    });

    req.on('error', (error) => {
        console.log('❌ Connection failed:', error.message);
        console.log('\n💡 Make sure:');
        console.log('   1. Obsidian is running');
        console.log('   2. The plugin is installed and enabled');
        console.log('   3. The plugin built successfully (bun run build)');
    });

    req.write(data);
    req.end();
}

testPing();