# MCP Server Testing Instructions

## Prerequisites

1. **Build the plugin:**
   ```bash
   bun run build
   ```

2. **Install the plugin in Obsidian:**
   - Copy `main.js`, `styles.css`, and `manifest.json` to your vault's `.obsidian/plugins/obsidian-claude-code/` folder
   - Enable the plugin in Obsidian Settings → Community Plugins

3. **Install test dependencies:**
   ```bash
   npm install eventsource
   ```

## Testing Methods

### 1. Automated MCP Tests

Run comprehensive tests of all MCP endpoints:

```bash
node test-mcp-client.js
```

**What it tests:**
- HTTP POST endpoints (`/mcp` and `/messages`)
- SSE connections (`/sse` and `/mcp` GET)
- WebSocket connection (if Claude Code lock file exists)
- All MCP methods: initialize, tools/list, getWorkspaceInfo, listFiles, ping

**Expected output:**
```
🚀 Starting MCP Server Tests...
Testing server at http://localhost:8080
=== HTTP POST TESTS ===
Testing /mcp endpoint...
✅ Initialize: 200 - {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26",...}}
✅ List Tools: 200 - {"jsonrpc":"2.0","id":2,"result":{"tools":[...]}}
...
=== TEST SUMMARY ===
Total tests: 15
✅ Passed: 15
❌ Failed: 0
```

### 2. Manual Request Testing

Interactive testing with custom requests:

```bash
node test-manual-requests.js
```

**Features:**
- Choose between `/mcp` and `/messages` endpoints
- Send predefined MCP requests (initialize, readFile, etc.)
- Send custom requests with your own method/params
- See full request/response JSON

### 3. Custom Port Testing

All test scripts support custom ports via command line arguments:

```bash
node test-simple.js 9090          # Test on port 9090
node test-mcp-client.js 9090      # Full test suite on port 9090  
node test-manual-requests.js 9090 # Manual testing on port 9090
```

### 4. Browser Testing

Open browser to test SSE directly:

1. Navigate to: `http://localhost:22360/sse` (or your configured port)
2. Should see Server-Sent Events stream
3. Or test: `http://localhost:22360/mcp` (newer endpoint)

### 5. Claude Desktop Testing

**Setup Claude Desktop configuration:**

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\\Claude\\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "obsidian": {
      "url": "http://localhost:22360/mcp",
      "env": {}
    }
  }
}
```

**Test steps:**
1. Restart Claude Desktop after config change
2. Open new conversation
3. Type: "What files are in my Obsidian vault?"
4. Should see Obsidian MCP server responding

### 6. Claude Code Testing

**Test WebSocket integration:**

1. Run `claude` in terminal
2. Use `/ide` command
3. Select "Obsidian" from the list
4. Should connect automatically via WebSocket

## Debugging

### Check Plugin Status

In Obsidian Developer Console (Ctrl+Shift+I):

```javascript
// Should see startup messages like:
[MCP Dual] WebSocket server started on port 12345
[MCP Dual] HTTP server started on port 8080
```

### Check Server Responses

```bash
curl -X POST http://localhost:22360/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'
```

Expected response:
```json
{"jsonrpc":"2.0","id":1,"result":"pong"}
```

### Check SSE Stream

```bash
curl -N http://localhost:22360/sse
```

Should show:
```
data: {"jsonrpc":"2.0","method":"notifications/initialized","params":{"sessionId":"session_..."}}
```

## Common Issues

1. **Port 22360 in use:**
   - Change the port in Obsidian Settings → Community Plugins → Claude Code → Settings
   - Update Claude Desktop config accordingly

2. **Plugin not starting:**
   - Check Obsidian console for errors
   - Verify plugin is enabled
   - Try rebuilding: `bun run build`

3. **Claude Desktop not connecting:**
   - Verify config file path and syntax
   - Restart Claude Desktop
   - Check if MCP server is listed in Claude settings

4. **WebSocket issues:**
   - Check `~/.claude/ide/` for `.lock` files
   - Verify Claude Code can find the lock file
   - Check Obsidian console for WebSocket errors

## Success Indicators

✅ **HTTP/SSE Server Working:**
- Browser shows SSE stream at `http://localhost:22360/sse`
- POST requests return valid JSON responses
- Test script shows all tests passing

✅ **Claude Desktop Working:**
- Claude responds to Obsidian-related questions
- Can read vault files through conversation
- MCP tools show up in Claude interface

✅ **Claude Code Working:**
- `/ide` command shows Obsidian option
- Connection established automatically
- File context shared with Claude Code

✅ **All Features Working:**
- File read/write operations
- Workspace information retrieval
- Tool listing and execution
- Real-time notifications