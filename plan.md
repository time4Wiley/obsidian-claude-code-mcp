# Claude Code MCP Integration for Obsidian - Implementation Plan

## Project Overview

This Obsidian plugin creates an MCP (Model Context Protocol) server that enables Claude Code to integrate with Obsidian similar to its VS Code integration. The plugin exposes vault operations through WebSocket-based MCP endpoints, allowing Claude Code to read files, make edits, and understand workspace context.

## Technical Architecture

### Core Components

1. **MCP Server** - WebSocket server implementing Model Context Protocol
2. **Lock File Discovery** - Claude Code discovery mechanism via `~/.claude/ide/*.lock`
3. **Obsidian API Bridge** - Maps MCP calls to Obsidian's native API
4. **File Operations** - Read, write, and edit operations on vault files
5. **Workspace Context** - Active file tracking and vault structure awareness
6. **Integrated Terminal** - Built-in xterm.js + node-pty terminal view for Claude Code

### Implementation Phases

#### Phase 1: Core MCP Server (Week 1)

-   [x] Basic WebSocket server setup
-   [x] Lock file creation for Claude discovery
-   [ ] Implement core MCP methods:
    -   `readFile` - Read file contents from vault
    -   `writeFile` - Write file contents to vault
    -   `getOpenFiles` - Return currently active file
    -   `listFiles` - List files in vault (with filtering)
    -   `getWorkspaceInfo` - Return vault metadata
-   [ ] Integrate terminal view:
    -   Bundle xterm.js + node-pty dependencies
    -   Create TerminalView extending ItemView
    -   Auto-launch Claude Code in terminal on startup

#### Phase 2: Advanced Operations (Week 2)

-   [ ] File watching for live updates
-   [ ] Diff support and preview
-   [ ] Multi-file operations
-   [ ] Workspace navigation
-   [ ] Error handling and recovery

#### Phase 3: User Experience (Week 3)

-   [ ] Plugin settings panel:
    -   Shell command configuration (default: `/bin/zsh -l`)
    -   Auto-start Claude toggle
    -   Terminal theme and appearance
-   [ ] Security warnings and permissions
-   [ ] Command palette integration:
    -   "Open Claude Terminal" command
    -   "Focus Terminal" with Ctrl+` hotkey
-   [ ] Status indicators
-   [ ] Performance optimization

#### Phase 4: Extended Features (Week 4)

-   [ ] Frontmatter awareness
-   [ ] Link and reference tracking
-   [ ] Vault-specific configurations
-   [ ] Plugin ecosystem integration

## Technical Implementation Details

### MCP Methods to Implement

```typescript
interface McpMethods {
	// Core file operations
	readFile(path: string): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;
	listFiles(pattern?: string): Promise<string[]>;

	// Workspace context
	getOpenFiles(): Promise<string[]>;
	getWorkspaceInfo(): Promise<WorkspaceInfo>;
	getCurrentFile(): Promise<string | null>;

	// Advanced operations
	applyEdit(edit: TextEdit): Promise<void>;
	showDiff(before: string, after: string): Promise<void>;
	watchFile(path: string): Promise<void>;
}
```

### Security Considerations

-   **Explicit user consent** for file write operations
-   **Path validation** to prevent directory traversal
-   **Vault boundaries** enforcement
-   **Rate limiting** for file operations
-   **Activity logging** for audit trails

### Error Handling

-   Graceful WebSocket connection handling
-   File system error recovery
-   Invalid path handling
-   Permission denial responses
-   Network timeout management

### Performance Optimization

-   **Lazy loading** of large files
-   **Caching** for frequently accessed files
-   **Debounced** file watching
-   **Streaming** for large file transfers
-   **Connection pooling** for multiple Claude instances

## Integration Points

### Obsidian API Usage

-   `app.vault.adapter` - File system operations
-   `app.workspace.getActiveFile()` - Current file context
-   `app.metadataCache` - File metadata and links
-   `app.vault.getFiles()` - Vault file enumeration

### Claude Code Integration

-   Lock file format: `~/.claude/ide/{pid}.lock`
-   WebSocket protocol on random port
-   MCP JSON-RPC 2.0 messaging
-   Auto-discovery and connection

## Development Workflow

### Setup

```bash
bun install
bun run dev  # Watch mode compilation
```

### Testing

-   Manual testing with Claude Code CLI
-   Unit tests for MCP handlers
-   Integration tests with sample vaults
-   Performance benchmarking

### Deployment

-   Community plugin store submission
-   Documentation and examples
-   Video demonstrations
-   Community feedback integration

## Success Criteria

1. **Seamless Integration** - Claude Code recognizes and connects to Obsidian
2. **File Operations** - Read, write, and edit vault files through Claude
3. **Context Awareness** - Claude understands current file and workspace
4. **Performance** - Responsive operations even with large vaults
5. **Security** - Safe operation with user consent and validation
6. **Reliability** - Stable connection and error recovery

## Risk Mitigation

-   **Backup strategies** for file operations
-   **Fallback modes** when MCP server fails
-   **User education** on security implications
-   **Gradual rollout** to community
-   **Monitoring and logging** for issues

## Future Enhancements

-   **Multi-vault support** for complex workflows
-   **Plugin ecosystem integration** (dataview, templater, etc.)
-   **Advanced diff viewers** with syntax highlighting
-   **Collaborative features** for team workflows
-   **Mobile support** (if technically feasible)

## Terminal Integration Strategy

### Integrated vs External Terminal Plugin

**Decision: Bundle integrated terminal view within the Claude plugin**

#### Why Not External Dependency
- **No formal dependency mechanism** - Users can disable/uninstall terminal plugins without warning
- **Version drift risk** - No ability to pin external plugin versions, API changes break integration
- **Poor distribution UX** - Community store doesn't support "requires X" flags
- **Support burden** - External plugin bugs become our support tickets

#### Integrated Terminal Benefits
- **Single plugin install** - Clean UX with predictable behavior
- **Minimal overhead** - xterm.js (~350kb) + node-pty (~400kb) well under 5MB limit
- **Complete control** - Own the terminal behavior, theming, and keyboard shortcuts
- **Unified settings** - All configuration in one place

### Implementation Details

#### Terminal View Architecture
```typescript
class ClaudeTerminalView extends ItemView {
  private terminal: Terminal;
  private shell: IPty;
  
  // Standard Obsidian view lifecycle
  onOpen() { /* initialize xterm + pty */ }
  onClose() { /* cleanup shell process */ }
  onResize() { /* resize terminal */ }
}
```

#### Bundle Strategy
- Fork MIT-licensed terminal plugin core (~120 LOC)
- Strip unnecessary features (profiles, persistence)
- Integrate into main plugin namespace
- Auto-launch Claude Code on terminal creation

#### User Experience Flow
1. **Single install** - "Claude Code" plugin includes everything
2. **First run detection** - Check for `claude` CLI in PATH
3. **Setup guidance** - Modal with platform-specific install commands
4. **Seamless operation** - Ctrl+` opens/focuses Claude terminal
5. **Integrated settings** - Shell config, auto-start, themes in one panel

### Technical Specifications

#### Dependencies
```bash
npm install xterm @xterm/node-pty @types/node
```

#### Bundle Size Impact
- xterm.js: ~350kb minified
- node-pty: ~400kb (platform binaries)
- Total overhead: <1MB (well within Obsidian guidelines)

#### Cross-Platform Support
- macOS/Linux: `/bin/zsh -l` or `/bin/bash -l`
- Windows: `pwsh.exe` or WSL integration
- Mobile: Graceful degradation (terminal features disabled)

This approach ensures reliable, maintainable Claude Code integration without external dependencies or fragile plugin coordination.
