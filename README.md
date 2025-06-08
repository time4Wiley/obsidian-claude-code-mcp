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

### Claude Desktop

Claude Desktop can connect to your Obsidian vault through the HTTP/SSE MCP server.

**Configuration Steps:**

1. **Install and enable** this plugin in Obsidian
2. **Locate your Claude Desktop config file**:
    - **macOS**: `$HOME/Library/Application Support/Claude/claude_desktop_config.json`
    - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
3. **Add the Obsidian MCP server** to your config:

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

4. **Restart Claude Desktop** after making the configuration change
5. **Test the connection** by asking Claude about your vault: "What files are in my Obsidian vault?"

**Alternative Endpoints:**

-   `http://localhost:22360/sse` - Legacy SSE endpoint
-   `http://localhost:22360/mcp` - New streamable HTTP endpoint (recommended)

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

1. Go to **Obsidian Settings** → **Community Plugins** → **Claude Code** → **Settings**
2. Change the **"HTTP Server Port"** in the MCP Server Configuration section
3. **Update your Claude Desktop config** to use the new port:
    ```json
    {
    	"mcpServers": {
    		"obsidian": {
    			"url": "http://localhost:YOUR_NEW_PORT/mcp",
    			"env": {}
    		}
    	}
    }
    ```
4. **Restart Claude Desktop** to apply the changes

**Multiple Vaults**: If you run multiple Obsidian vaults with this plugin, each vault needs a unique port. The plugin will automatically detect port conflicts and guide you to configure different ports.

### Troubleshooting

**Claude Desktop not connecting:**

-   Verify the config file path and JSON syntax
-   Ensure Obsidian is running with the plugin enabled
-   Check that the port (22360) isn't blocked by firewall
-   Restart Claude Desktop after config changes

**Claude Code not finding vault:**

-   Verify the plugin is enabled in Obsidian
-   Check for `.lock` files in `~/.claude/ide/`
-   Restart Obsidian if the vault doesn't appear in `/ide` list

**Port conflicts:**

-   Configure a different port in plugin settings
-   Update client configurations to match the new port
-   Common alternative ports: 22361, 22362, 8080, 9090

## Development

This project uses TypeScript to provide type checking and documentation.
The repo depends on the latest plugin API (obsidian.d.ts) in TypeScript Definition format, which contains TSDoc comments describing what it does.

### First time developing plugins?

Quick starting guide for new plugin devs:

-   Check if [someone already developed a plugin for what you want](https://obsidian.md/plugins)! There might be an existing plugin similar enough that you can partner up with.
-   Clone your repo to a local development folder. For convenience, you can place this folder in your `.obsidian/plugins/claude-code-terminal` folder.
-   Install NodeJS, then run `npm i` in the command line under your repo folder.
-   Run `npm run dev` to compile your plugin from `main.ts` to `main.js`.
-   Make changes to `main.ts` (or create new `.ts` files). Those changes should be automatically compiled into `main.js`.
-   Reload Obsidian to load the new version of your plugin.
-   Enable plugin in settings window.
-   For updates to the Obsidian API run `npm update` in the command line under your repo folder.

### Releasing new releases

-   Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
-   Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
-   Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
-   Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
-   Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

### Adding your plugin to the community plugin list

-   Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
-   Publish an initial version.
-   Make sure you have a `README.md` file in the root of your repo.
-   Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## How to use

-   Clone this repo.
-   Make sure your NodeJS is at least v16 (`node --version`).
-   `npm i` or `yarn` to install dependencies.
-   `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

-   Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/claude-code-terminal/`.

## Improve code quality with eslint (optional)

-   [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code.
-   To use eslint with this project, make sure to install eslint from terminal:
    -   `npm install -g eslint`
-   To use eslint to analyze this project use this command:
    -   `eslint main.ts`
    -   eslint will then create a report with suggestions for code improvement by file and line number.
-   If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder:
    -   `eslint .\src\`

## API Documentation

See https://github.com/obsidianmd/obsidian-api
