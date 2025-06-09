# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that implements an MCP (Model Context Protocol) server to enable Claude Code integration with Obsidian. The plugin allows Claude Code to interact with Obsidian vaults similar to how it integrates with VS Code and other IDEs.

## Development Commands

- `bun install` - Install dependencies  
- `bun run dev` - Start compilation in watch mode (outputs main.js from main.ts)
- `bun run build` - Type check and build for production
- `bun run version patch|minor|major` - Bump version in manifest.json, package.json, and versions.json
- `eslint main.ts` - Run linting (requires global eslint installation)

## Architecture

### Modular Structure

The codebase has been refactored into a clean modular architecture:

- **main.ts** (77 lines) - Thin orchestration layer that initializes and connects all components
- **src/mcp/** - MCP protocol implementation
  - **types.ts** - All MCP interfaces and type definitions
  - **server.ts** - WebSocket server management and client connection handling
  - **handlers.ts** - MCP request/response routing and processing
- **src/obsidian/** - Obsidian integration layer  
  - **workspace-manager.ts** - File context and selection tracking using DOM events
  - **utils.ts** - Path normalization and utility functions
- **src/tools/** - MCP tool implementations
  - **file-tools.ts** - File operations (read, write, list, current file)
  - **workspace-tools.ts** - Workspace info and tool definitions

### Core Design Patterns

- **Dependency Injection**: Components receive their dependencies through constructors
- **Event-Driven**: Uses DOM `selectionchange` events instead of polling for selection tracking
- **Separation of Concerns**: Each module has a single, well-defined responsibility
- **Plugin Integration**: Uses Obsidian's `registerEvent` and `registerDomEvent` for proper cleanup

### Dual Transport MCP Server Implementation

The plugin implements both WebSocket and HTTP/SSE MCP servers for maximum compatibility:

#### WebSocket Server (for Claude Code IDE integration):
1. **Discovery Mechanism** - Creates lock files in `~/.claude/ide/` for Claude Code auto-discovery
2. **WebSocket Protocol** - Serves MCP protocol on random port for secure communication
3. **Auto-Discovery** - Claude Code automatically finds and connects to the plugin

#### HTTP/SSE Server (for Claude Desktop and other MCP clients):
1. **HTTP/SSE Protocol** - Serves MCP protocol on port 22360 by default
2. **Manual Configuration** - Requires manual setup in client configuration
3. **Legacy SSE Transport** - Uses the older MCP spec (2024-11-05) for broader compatibility with MCP clients that haven't updated to the newer streamable HTTP transport
4. **CORS Support** - Includes proper CORS headers for browser-based clients

#### Shared Features:
- **Obsidian API Bridge** - Maps MCP calls to Obsidian's native vault operations
- **File Operations** - Handles read, write, and workspace context operations
- **Unified Broadcasting** - Notifications sent to all connected clients across both transports

### Key Features

- **File Operations**: Read and write vault files through MCP protocol
- **Workspace Context**: Provide current active file and vault structure to Claude
- **Auto-Discovery**: Claude Code automatically finds and connects to the plugin
- **Security**: Validates file paths and enforces vault boundaries

### MCP Methods Supported

- `readFile` - Read file contents from vault
- `writeFile` - Write content to vault files  
- `getOpenFiles` - Return currently active file
- `listFiles` - List files in vault with optional filtering
- `getWorkspaceInfo` - Return vault metadata and structure

## Development Workflow

### Setup
```bash
bun install  # Installs all dependencies including ws and @types/ws
```

### Testing
1. Build plugin: `bun run build`
2. Copy to test vault: `.obsidian/plugins/claude-code-terminal/`
3. Enable plugin in Obsidian
4. Run `claude` in terminal and use `/ide` to select Obsidian
5. If connection issues occur, check Obsidian Developer Console and see [PROTOCOL.md](./PROTOCOL.md)

### Plugin Installation

For manual testing, copy `main.js`, `styles.css`, and `manifest.json` to your vault's `.obsidian/plugins/claude-code-terminal/` folder.

### Claude Desktop Configuration

To connect Claude Desktop to the Obsidian MCP server, add the following configuration to your Claude Desktop settings:

**For macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**For Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

**Alternative endpoints supported:**
- `http://localhost:22360/sse` - Legacy SSE endpoint (2024-11-05 spec)
- `http://localhost:22360/mcp` - Same endpoint, different path alias

**MCP Specification Version**: This plugin uses the older MCP specification (2024-11-05) documented at https://modelcontextprotocol.io/specification/2024-11-05/basic/transports#http-with-sse for maximum compatibility. While the newer streamable HTTP transport (2025-03-26) is available, many MCP clients have not yet been updated to support it. We will continue to support the older version indefinitely until the broader ecosystem becomes more compatible.

**Port Configuration**: The HTTP/SSE server runs on port 22360 by default to avoid conflicts with common development services. This can be changed in the plugin settings. If you change the port, update your Claude Desktop configuration accordingly.

**Multiple Vaults**: If you run multiple Obsidian vaults with this plugin, each vault needs a unique port. The plugin will automatically detect port conflicts and display a helpful notification guiding you to configure a different port in Settings → Community Plugins → Claude Code.

**Configuring the Port**:
1. Go to Obsidian Settings → Community Plugins → Claude Code → Settings
2. In the "MCP Server Configuration" section, change the "HTTP Server Port"
3. The server will automatically restart on the new port
4. Update your Claude Desktop configuration to use the new port URL

## Technical Details

### MCP Protocol Implementation

The plugin uses JSON-RPC 2.0 over WebSocket for MCP communication. **For detailed protocol specification, debugging, and troubleshooting connection issues, see [PROTOCOL.md](./PROTOCOL.md)**.

```typescript
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
```

### Critical Implementation Notes

- **Lock File Naming**: MUST be named `[port].lock` not `[pid].lock`
- **Discovery**: Claude Code CLI discovers IDEs by scanning `~/.claude/ide/` directory  
- **WebSocket Binding**: Server must bind to localhost for security
- **Event Handling**: Uses DOM `selectionchange` event instead of polling for better performance
- **Component Lifecycle**: All event listeners are properly cleaned up via Obsidian's registration system

### File Path Handling

- All file operations use vault-relative paths via `normalizePath()` utility
- Absolute paths are converted using `app.vault.adapter.getBasePath()`
- Path validation prevents directory traversal attacks in `src/obsidian/utils.ts`

### Error Handling

- WebSocket connection errors are handled gracefully in `McpServer`
- Invalid MCP requests return proper JSON-RPC error responses via `McpHandlers`
- File system errors are caught and returned as MCP errors in `FileTools`

## Release Process

1. Update `minAppVersion` in manifest.json
2. Run `bun run version patch/minor/major` to bump versions
3. Test with sample vault and Claude Code CLI
4. Create GitHub release with exact version number as tag
5. Upload manifest.json, main.js, and styles.css as release assets

## Security Considerations

- File operations are restricted to vault boundaries
- User consent should be implemented for write operations
- Lock files contain only necessary connection information
- WebSocket server binds to localhost only

## Future Enhancements

- Diff preview integration with Obsidian
- File watching for live updates
- Plugin settings panel
- Integration with other Obsidian plugins
- Enhanced workspace context (frontmatter, links, etc.)