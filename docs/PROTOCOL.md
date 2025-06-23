# Claude Code WebSocket Protocol Documentation

This document describes the WebSocket-based Model Context Protocol (MCP) that Claude Code uses to communicate with IDE integrations.

## Overview

Claude Code uses a custom WebSocket-based variant of the Model Context Protocol (MCP) for IDE integration. This protocol enables real-time communication between the Claude CLI and running IDE instances.

## Discovery Mechanism

### Lock File System

Claude Code discovers IDE instances through lock files stored in the Claude configuration directory's `ide` subdirectory. The config directory is resolved in the following order:

1. `$CLAUDE_CONFIG_DIR/ide/` (if CLAUDE_CONFIG_DIR env var is set)
2. `$XDG_CONFIG_HOME/claude/ide/` or `~/.config/claude/ide/` (new default since v1.0.30)
3. `~/.claude/ide/` (legacy location, used as fallback)

The actual location depends on which directory exists or which Claude Code creates:

1. **Lock File Location**: `<claude-config-dir>/ide/[port].lock`
2. **Naming Convention**: The filename MUST be the WebSocket port number
3. **File Format**: JSON containing connection metadata

### Lock File Structure

```json
{
  "pid": process_id,
  "workspaceFolders": ["/absolute/path/to/workspace"],
  "ideName": "IDE Name",
  "transport": "ws"
}
```

**Critical Implementation Notes:**
- Lock file MUST be named `[port].lock` where `port` is the WebSocket server port
- Claude Code CLI scans this directory to discover available IDE connections
- The `workspaceFolders` array should contain absolute paths to workspace roots

## WebSocket Server Configuration

### Server Setup

```javascript
const server = new WebSocketServer({ 
  port: 0,           // Random available port
  host: 'localhost'  // Bind to localhost only for security
});

const port = server.address().port;
```

### Connection Flow

1. IDE creates WebSocket server on random port (typically 10000-65535)
2. IDE writes lock file to `<claude-config-dir>/ide/[port].lock`
3. Claude Code CLI scans lock files and discovers available connections
4. User selects IDE via `/ide` command in Claude
5. Claude CLI connects to WebSocket server on discovered port

## Message Protocol

### Transport Details

- **Protocol**: WebSocket (RFC 6455 compliant)
- **Message Format**: JSON-RPC 2.0
- **Security**: Localhost-only binding (127.0.0.1)

### Message Structure

All messages follow JSON-RPC 2.0 specification:

```typescript
interface McpRequest {
  jsonrpc: "2.0";
  method: string;
  params?: any;
  id: string | number;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: { code: number; message: string };
}
```

## Supported MCP Methods

### Core File Operations

#### `readFile`
Read file contents from workspace.

```json
{
  "jsonrpc": "2.0",
  "method": "readFile",
  "params": { "path": "relative/path/to/file.txt" },
  "id": 1
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "file contents here"
}
```

#### `writeFile`
Write content to workspace file.

```json
{
  "jsonrpc": "2.0",
  "method": "writeFile",
  "params": { 
    "path": "relative/path/to/file.txt",
    "content": "new file contents"
  },
  "id": 2
}
```

#### `listFiles`
List files in workspace with optional pattern filtering.

```json
{
  "jsonrpc": "2.0",
  "method": "listFiles",
  "params": { "pattern": "*.js" },  // Optional
  "id": 3
}
```

### Workspace Context

#### `getWorkspaceInfo`
Get metadata about the current workspace.

```json
{
  "jsonrpc": "2.0",
  "method": "getWorkspaceInfo",
  "params": {},
  "id": 4
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "name": "workspace-name",
    "path": "/absolute/path/to/workspace",
    "fileCount": 150,
    "type": "obsidian-vault"
  }
}
```

#### `getOpenFiles`
Get list of currently open/active files.

```json
{
  "jsonrpc": "2.0",
  "method": "getOpenFiles",
  "params": {},
  "id": 5
}
```

#### `getCurrentFile`
Get the currently active/focused file.

```json
{
  "jsonrpc": "2.0",
  "method": "getCurrentFile",
  "params": {},
  "id": 6
}
```

## Error Handling

### Standard JSON-RPC Error Codes

- `-32700`: Parse error (Invalid JSON)
- `-32600`: Invalid Request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

### Custom Error Responses

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "failed to read file: File not found"
  }
}
```

## Security Considerations

### Network Security
- WebSocket server MUST bind to localhost only (`127.0.0.1`)
- No external network access should be allowed
- Use random ports to avoid conflicts

### File System Security
- Validate all file paths to prevent directory traversal
- Restrict operations to workspace boundaries
- Sanitize user input in file operations

### Path Validation Example

```javascript
function normalizePath(path) {
  // Remove leading slash for vault-relative paths
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  
  // Prevent directory traversal
  if (cleaned.includes("..") || cleaned.includes("~")) {
    return null;
  }
  
  return cleaned;
}
```

## Implementation Reference

This protocol specification is based on the implementation found in:
- **coder/claudecode.nvim**: Reference Neovim implementation
- **Source**: https://github.com/coder/claudecode.nvim/blob/main/PROTOCOL.md

For troubleshooting IDE connection issues, refer to this protocol documentation and ensure:
1. Lock file is named correctly (`[port].lock`)
2. WebSocket server is bound to localhost
3. JSON-RPC message format is followed exactly
4. File paths are properly validated and normalized

## Debugging Connection Issues

### Common Problems

1. **"IDE disconnected" error**:
   - Check lock file naming convention
   - Verify WebSocket server is actually listening
   - Ensure port number in filename matches server port

2. **Claude can't discover IDE**:
   - Verify lock file exists in the correct config directory's `ide/` subdirectory
   - Check which config directory Claude Code is using (see discovery mechanism above)
   - Check lock file JSON format
   - Ensure `workspaceFolders` contains absolute paths

3. **WebSocket connection fails**:
   - Confirm server binds to localhost
   - Check for port conflicts
   - Verify firewall/security software isn't blocking localhost connections

### Debug Tools

```bash
# Check lock files (try each possible location)
# Modern location
ls -la ~/.config/claude/ide/
# Legacy location
ls -la ~/.claude/ide/
# Or if CLAUDE_CONFIG_DIR is set
ls -la "$CLAUDE_CONFIG_DIR/ide/"

# Verify lock file content (use the directory that exists)
cat ~/.config/claude/ide/[port].lock  # or
cat ~/.claude/ide/[port].lock

# Test WebSocket connectivity
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" \
  http://localhost:[port]/
```