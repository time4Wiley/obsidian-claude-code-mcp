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

### Core Components

- **main.ts** - Entry point containing `ClaudeMcpPlugin` class with MCP server implementation
- **manifest.json** - Plugin metadata (ID: claude-code-terminal, name: Claude Code Terminal)
- **esbuild.config.mjs** - Bundles TypeScript to main.js with watch mode for development

### MCP Server Implementation

The plugin implements a WebSocket-based MCP server that:

1. **Discovery Mechanism** - Creates lock files in `~/.claude/ide/` for Claude Code auto-discovery
2. **WebSocket Server** - Serves MCP protocol on random port for secure communication
3. **Obsidian API Bridge** - Maps MCP calls to Obsidian's native vault operations
4. **File Operations** - Handles read, write, and workspace context operations

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
bun install
npm i ws @types/ws @types/node  # Additional dependencies for MCP server
```

### Testing
1. Build plugin: `bun run build`
2. Copy to test vault: `.obsidian/plugins/claude-code-terminal/`
3. Enable plugin in Obsidian
4. Run `claude` in terminal and use `/ide` to select Obsidian
5. If connection issues occur, check Obsidian Developer Console and see [PROTOCOL.md](./PROTOCOL.md)

### Plugin Installation

For manual testing, copy `main.js`, `styles.css`, and `manifest.json` to your vault's `.obsidian/plugins/claude-code-terminal/` folder.

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

### File Path Handling

- All file operations use vault-relative paths
- Absolute paths are converted using `app.vault.adapter.getBasePath()`
- Path validation prevents directory traversal attacks

### Error Handling

- WebSocket connection errors are logged but don't crash plugin
- Invalid MCP requests return proper JSON-RPC error responses
- File system errors are caught and returned as MCP errors

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