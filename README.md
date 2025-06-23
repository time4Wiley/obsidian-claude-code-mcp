# Obsidian Claude Code

An Obsidian plugin that implements an MCP (Model Context Protocol) server to enable Claude Code integration with Obsidian vaults.

This plugin allows Claude Code and other MCP clients (like Claude Desktop) to interact with your Obsidian vault, providing AI-powered assistance with direct access to your notes and files.

## Features

-   **Dual Transport MCP Server**: Supports both WebSocket (for Claude Code) and HTTP/SSE (for Claude Desktop)
-   **Auto-Discovery**: Claude Code automatically finds and connects to your vault
-   **File Operations**: Read and write vault files through MCP protocol
-   **Workspace Context**: Provides current active file and vault structure to Claude
-   **Multiple Client Support**: Connect both Claude Code and Claude Desktop simultaneously
-   **Configurable Ports**: Avoid conflicts when running multiple vaults

## MCP Client Configuration

This plugin serves as an MCP server that various Claude clients can connect to. Here's how to configure different clients:

### Claude Desktop (as of 2025-06-09)

Claude Desktop requires a special configuration to connect to the Obsidian MCP server because it does not directly support HTTP transports. We will use `mcp-remote`, a tool that creates a local `stdio` bridge to the server's HTTP endpoint.

**Configuration Steps:**

1.  **Install and enable** this plugin in Obsidian.
2.  **Make sure you have Node.js installed**, as `npx` (which comes with Node.js) is used to run the bridge tool.
3.  **Locate your Claude Desktop config file**:
    -   **macOS**: `$HOME/Library/Application Support/Claude/claude_desktop_config.json`
    -   **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
4.  **Add the Obsidian MCP server** to your config using the `mcp-remote` command. `npx` will automatically download and run it for you.

    ```json
    {
    	"mcpServers": {
    		"obsidian": {
    			"command": "npx",
    			"args": ["mcp-remote", "http://localhost:22360/sse"],
    			"env": {}
    		}
    	}
    }
    ```

5.  **Restart Claude Desktop** after making the configuration change.
6.  **Test the connection** by asking Claude about your vault: "What files are in my Obsidian vault?"

### Other MCP Clients (with direct HTTP support)

If you are using an MCP client that directly supports the legacy "HTTP with SSE" transport, you can use a simpler configuration without the `mcp-remote` bridge.

**Example Configuration:**

```json
{
	"mcpServers": {
		"obsidian": {
			"url": "http://localhost:22360/sse",
			"env": {}
		}
	}
}
```

### Claude Code CLI

Claude Code automatically discovers and connects to Obsidian vaults through WebSocket.

**Usage Steps:**

1. **Install and enable** this plugin in Obsidian
2. **Run Claude Code** in your terminal: `claude`
3. **Select your vault** using the `/ide` command
4. **Choose "Obsidian"** from the IDE list
5. Claude Code will automatically connect via WebSocket

### Port Configuration

**Default Port**: The plugin uses port `22360` by default to avoid conflicts with common development services.

**Custom Port Setup:**

1.  Go to **Obsidian Settings** → **Community Plugins** → **Claude Code** → **Settings**
2.  Change the **"HTTP Server Port"** in the MCP Server Configuration section
3.  **Update your Claude Desktop config** to use the new port:
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
        NOTE: You can change the port in the settings.
4.  **Restart Claude Desktop** to apply the changes

**Multiple Vaults**: If you run multiple Obsidian vaults with this plugin, each vault needs a unique port. The plugin will automatically detect port conflicts and guide you to configure different ports.

### A Note on MCP Specification Version

_As of 2025-06-09_

> [!IMPORTANT]
> This plugin intentionally uses an older MCP specification for HTTP transport. The latest ["Streamable HTTP" protocol (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) is not yet supported by most MCP clients, including Claude Code and Claude Desktop.
>
> To ensure compatibility, we use the legacy ["HTTP with SSE" protocol (2024-11-05)](https://modelcontextprotocol.io/specification/2024-11-05/basic/transports#http-with-sse). Adhering to the newest specification will lead to connection failures with current tools.

### Troubleshooting

**Claude Desktop not connecting:**

-   Verify the config file path and JSON syntax
-   Ensure Obsidian is running with the plugin enabled
-   Check that the port (22360) isn't blocked by firewall
-   Restart Claude Desktop after config changes

**Claude Code not finding vault:**

-   Verify the plugin is enabled in Obsidian
-   Check for `.lock` files in Claude config directory:
    -   `$CLAUDE_CONFIG_DIR/ide/` if environment variable is set
    -   `~/.config/claude/ide/` (default since Claude Code v1.0.30)
    -   `~/.claude/ide/` (legacy location)
-   Restart Obsidian if the vault doesn't appear in `/ide` list

**Port conflicts:**

-   Configure a different port in plugin settings
-   Update client configurations to match the new port
-   Common alternative ports: 22361, 22362, 8080, 9090

## Tool Architecture

This plugin implements a flexible tool system that allows different tools to be exposed to different MCP clients:

### Tool Categories

1. **Shared Tools** (available to both IDE and MCP clients):
   - File operations: `view`, `str_replace`, `create`, `insert`
   - Workspace operations: `get_current_file`, `get_workspace_files`
   - Obsidian API access: `obsidian_api`

2. **IDE-specific Tools** (only available via Claude Code WebSocket):
   - `getDiagnostics` - System and vault diagnostics
   - `openDiff` - Diff view operations (stub for Obsidian)
   - `close_tab` - Tab management (stub for Obsidian)
   - `closeAllDiffTabs` - Bulk tab operations (stub for Obsidian)

3. **MCP-only Tools** (only available via HTTP/SSE):
   - Currently none, but the architecture supports adding them

### Adding New Tools

To add a new tool to the plugin:

#### For Shared Tools (available to both IDE and MCP):
1. Add the tool definition to `src/tools/general-tools.ts` in the `GENERAL_TOOL_DEFINITIONS` array
2. Add the implementation in the `createImplementations()` method of `GeneralTools` class
3. The tool will automatically be available to both WebSocket and HTTP clients

#### For IDE-specific Tools:
1. Add the tool definition to `src/ide/ide-tools.ts` in the `IDE_TOOL_DEFINITIONS` array
2. Add the implementation in the `createImplementations()` method of `IdeTools` class
3. The tool will only be available to Claude Code via WebSocket

#### For MCP-only Tools:
1. Add the tool definition to `src/tools/mcp-only-tools.ts` in the `MCP_ONLY_TOOL_DEFINITIONS` array
2. Create an implementation class similar to `GeneralTools` or `IdeTools`
3. Update `src/mcp/dual-server.ts` to register the tools only to the HTTP registry

### Tool Registration Flow

The plugin uses a dual registry system:
- **WebSocket Registry**: Contains shared tools + IDE-specific tools
- **HTTP Registry**: Contains shared tools + MCP-only tools

This separation ensures that:
- Claude Code gets access to IDE-specific functionality
- Standard MCP clients only see appropriate tools
- Shared functionality is available to all clients

## Development

This project uses TypeScript to provide type checking and documentation.
The repo depends on the latest plugin API (obsidian.d.ts) in TypeScript Definition format, which contains TSDoc comments describing what it does.

### Releasing new releases

-   Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
-   Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
-   Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
-   Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
-   Publish the release.
