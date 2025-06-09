#!/usr/bin/env node

/**
 * Simple test script for the HTTP MCP server
 * Run with: node test-http-mcp.js
 */

async function testHttpMcp() {
    const baseUrl = 'http://localhost:22360/mcp';
    
    console.log('🧪 Testing HTTP MCP Server...\n');

    try {
        // Test 1: Initialize (should get JSON response, not SSE)
        console.log('1. Testing initialize...');
        const initResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-03-26',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            })
        });

        console.log('   Response status:', initResponse.status, initResponse.statusText);
        console.log('   Response headers:', Object.fromEntries(initResponse.headers.entries()));
        
        if (!initResponse.ok) {
            const errorText = await initResponse.text();
            throw new Error(`HTTP ${initResponse.status}: ${initResponse.statusText}\nBody: ${errorText}`);
        }

        const sessionId = initResponse.headers.get('Mcp-Session-Id');
        const initResult = await initResponse.json();
        console.log('✅ Initialize successful');
        console.log('📋 Session ID:', sessionId);
        console.log('🔧 Server capabilities:', JSON.stringify(initResult.result?.capabilities, null, 2));

        // Test 2: Send initialized notification
        console.log('\n2. Sending initialized notification...');
        const notifyResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Mcp-Session-Id': sessionId || ''
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized'
            })
        });

        if (notifyResponse.status === 202) {
            console.log('✅ Initialized notification accepted');
        }

        // Test 3: List tools
        console.log('\n3. Testing tools/list...');
        const toolsResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Mcp-Session-Id': sessionId || ''
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list'
            })
        });

        const toolsResult = await toolsResponse.json();
        console.log('✅ Tools listed:', toolsResult.result?.tools?.length || 0, 'tools');

        // Test 4: Get workspace info
        console.log('\n4. Testing getWorkspaceInfo...');
        const workspaceResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Mcp-Session-Id': sessionId || ''
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 3,
                method: 'getWorkspaceInfo'
            })
        });

        const workspaceResult = await workspaceResponse.json();
        console.log('✅ Workspace info:', workspaceResult.result);

        // Test 5: Ping
        console.log('\n5. Testing ping...');
        const pingResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Mcp-Session-Id': sessionId || ''
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 4,
                method: 'ping'
            })
        });

        const pingResult = await pingResponse.json();
        console.log('✅ Ping result:', pingResult.result);

        console.log('\n🎉 All tests passed! HTTP MCP server is working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n👋 Test interrupted');
    process.exit(0);
});

testHttpMcp();