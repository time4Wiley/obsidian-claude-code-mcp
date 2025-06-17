# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that implements MCP (Model Context Protocol) servers to enable Claude Code and Claude Desktop integration with Obsidian vaults. The plugin provides both WebSocket (for Claude Code CLI) and HTTP/SSE (for Claude Desktop) transports for maximum compatibility.

## Development Commands

- `bun install` - Install dependencies
- `bun run dev` - Start compilation in watch mode
- `bun run build` - Type check and build for production  
- `bun run version patch|minor|major` - Bump version and update manifest files
- `eslint main.ts` - Run linting

## Architecture

### Core Components

- **main.ts** - Plugin entry point that orchestrates initialization, settings management, and server lifecycle
- **src/settings.ts** - Comprehensive settings management with real-time server status display
- **src/mcp/** - MCP protocol implementation
  - **dual-server.ts** - Manages both WebSocket and HTTP servers concurrently
  - **server.ts** - WebSocket server for Claude Code CLI integration
  - **http-server.ts** - HTTP/SSE server for Claude Desktop (uses MCP spec 2024-11-05)
  - **handlers.ts** - Request routing and response handling
  - **types.ts** - TypeScript interfaces for MCP protocol
- **src/obsidian/** - Obsidian API integration
  - **workspace-manager.ts** - Tracks active file and selection using DOM events
  - **utils.ts** - Path normalization and validation utilities
- **src/tools/** - MCP tool implementations
  - **file-tools.ts** - File read/write operations
  - **workspace-tools.ts** - Workspace info and vault operations
  - **tool-definitions.ts** - Tool metadata and parameter schemas
- **src/terminal/** - Optional embedded terminal feature
  - **terminal-view.ts** - Terminal UI implementation using xterm.js
  - **pseudoterminal.ts** - Platform-specific terminal spawning
  - **python-detection.ts** - Python environment detection

### MCP Tools Implemented

- `readFile` - Read file contents from vault
- `writeFile` - Write content to vault files
- `getOpenFiles` - Return currently active file
- `listFiles` - List files in vault with filtering
- `getWorkspaceInfo` - Return vault metadata
- `obsidian_api` - Execute Obsidian API commands
- `getDiagnostics` - Return file diagnostics
- `openDiff` - Open diff view for file changes
- `close_tab` - Close specific tabs
- `closeAllDiffTabs` - Close all diff views

### Key Design Patterns

- **Event-Driven Architecture** - Uses DOM `selectionchange` events instead of polling
- **Lazy Loading** - Terminal features loaded only when needed
- **Proper Cleanup** - All event listeners registered via Obsidian's system
- **Error Boundaries** - Graceful error handling with user notifications
- **Port Conflict Detection** - Automatic detection with guidance for resolution

## Building and Testing

### Build System
- Uses esbuild with custom configuration (esbuild.config.mjs)
- Bundles to single main.js file (CommonJS format)
- PNG files bundled as data URLs
- Python scripts bundled as text

### Testing Workflow
1. Build: `bun run build`
2. Copy output to test vault: `.obsidian/plugins/claude-code-terminal/`
3. Enable plugin in Obsidian settings
4. For Claude Code: Run `claude` in terminal and use `/ide` command
5. For Claude Desktop: Configure in settings (see README)

### Manual Testing Scripts
- `test-manual-requests.js` - Interactive MCP request tester
- `test-mcp-client.js` - Full MCP client implementation

## Configuration

### Claude Desktop Setup
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
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

### Plugin Settings
- Enable/disable WebSocket and HTTP servers independently
- Configure HTTP server port (default: 22360)
- Enable/disable terminal feature
- Real-time server status display

## Important Implementation Notes

- **Lock Files**: WebSocket server creates `[port].lock` files in `~/.claude/ide/` for auto-discovery
- **Path Handling**: All paths normalized via `normalizePath()` utility
- **Security**: File operations restricted to vault boundaries
- **Multi-Vault Support**: Each vault needs unique HTTP port
- **MCP Spec Version**: HTTP server uses 2024-11-05 spec for compatibility

## Release Process

1. Run `bun run version patch/minor/major`
2. Test thoroughly with both Claude Code and Claude Desktop
3. Create GitHub release with version tag
4. Upload `manifest.json`, `main.js`, and `styles.css` as assets