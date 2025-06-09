#!/usr/bin/env node

/**
 * Quick test to see if the HTTP MCP server is running
 */

async function testServerRunning() {
    const baseUrl = 'http://localhost:22360/mcp';
    
    console.log('🔍 Checking if HTTP MCP server is running...\n');

    try {
        // Simple GET request to see if server responds
        console.log('Testing basic connectivity...');
        const response = await fetch(baseUrl, {
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream'
            }
        });

        console.log('Response status:', response.status, response.statusText);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (response.ok) {
            console.log('✅ Server is running and responding!');
            response.body?.cancel(); // Close the SSE stream
        } else {
            console.log('❌ Server responded with error');
        }

    } catch (error) {
        console.error('❌ Cannot connect to server:', error.message);
        console.log('\n💡 Make sure:');
        console.log('   1. Obsidian is running');
        console.log('   2. Claude Code plugin is enabled');
        console.log('   3. HTTP server is enabled in plugin settings');
        console.log('   4. Server is running on port 22360');
    }
}

testServerRunning();