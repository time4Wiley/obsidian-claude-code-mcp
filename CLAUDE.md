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
  - **dual-server.ts** - Manages both WebSocket and HTTP servers with tool registry
  - **server.ts** - WebSocket server for Claude Code CLI integration
  - **http-server.ts** - HTTP/SSE server for Claude Desktop (uses MCP spec 2024-11-05)
  - **handlers.ts** - Request routing with separation of IDE/MCP concerns
  - **types.ts** - TypeScript interfaces for MCP protocol
- **src/ide/** - Claude Code IDE-specific functionality
  - **ide-handler.ts** - Handles IDE-specific requests (ide_connected, etc.)
  - **ide-tools.ts** - IDE-specific tool implementations (openDiff, close_tab, etc.)
- **src/shared/** - Common functionality
  - **tool-registry.ts** - Automatic tool registration and validation system
- **src/obsidian/** - Obsidian API integration
  - **workspace-manager.ts** - Tracks active file and selection using DOM events
  - **utils.ts** - Path normalization and validation utilities
- **src/tools/** - MCP tool implementations
  - **file-tools.ts** - File read/write operations
  - **general-tools.ts** - General workspace and file manipulation tools
- **src/terminal/** - Optional embedded terminal feature
  - **terminal-view.ts** - Terminal UI implementation using xterm.js
  - **pseudoterminal.ts** - Platform-specific terminal spawning
  - **python-detection.ts** - Python environment detection

### MCP Tools Implemented

**Available for both IDE and MCP:**
- `readFile` - Read file contents from vault
- `writeFile` - Write content to vault files
- `getOpenFiles` - Return currently active file
- `listFiles` - List files in vault with filtering
- `getWorkspaceInfo` - Return vault metadata
- `obsidian_api` - Execute Obsidian API commands
- `view` - View file contents with optional line ranges
- `str_replace` - Replace text in files
- `create` - Create new files
- `insert` - Insert text at specific line numbers
- `get_current_file` - Get the currently active file
- `get_workspace_files` - List all files in vault

**IDE-specific tools (WebSocket only):**
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
- **Tool Registry** - Automatic tool registration with runtime validation
- **Separation of Concerns** - IDE-specific code isolated from standard MCP protocol
- **Dual Tool Registries** - Separate tool sets for WebSocket/IDE vs HTTP/MCP servers

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

- **Lock Files**: WebSocket server creates `[port].lock` files in the Claude config directory for auto-discovery:
  - Uses `CLAUDE_CONFIG_DIR` environment variable if set
  - Otherwise `$XDG_CONFIG_HOME/claude/ide/` or `~/.config/claude/ide/` (new default since Claude Code v1.0.30)
  - Falls back to `~/.claude/ide/` (legacy location)
- **Path Handling**: All paths normalized via `normalizePath()` utility
- **Security**: File operations restricted to vault boundaries
- **Multi-Vault Support**: Each vault needs unique HTTP port
- **MCP Spec Version**: HTTP server uses 2024-11-05 spec for compatibility

## Release Process

### Patch Releases (Bug Fixes)
For patch releases, use the automated process:
1. Commit your changes with conventional commit messages
2. Run `npm version patch` (handles version bumping and tagging)
3. Run `bun run build` to create production build
4. Push with `git push && git push --tags`
5. Create GitHub release with `gh release create` including the three required files

See `docs/AUTOMATED_PATCH_RELEASE.md` for detailed steps.

### Minor/Major Releases
For minor and major releases, follow the manual process in `docs/RELEASE_CHECKLIST.md`:
1. Run `bun run version minor/major`
2. Test thoroughly with both Claude Code and Claude Desktop
3. Create GitHub release with version tag
4. Upload `manifest.json`, `main.js`, and `styles.css` as assets

## Coding Guidelines and Best Practices

- When refactoring, don't create files with a -refactored suffix, carry out the refactoring as a senior engineer would

## Memories

- be sure to read patch release process from CLAUDE.md prior to creating a new release