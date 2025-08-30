import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import ClaudeMcpPlugin from "../main";
import { getClaudeConfigDir } from "./claude-config";

export interface ClaudeCodeSettings {
	autoCloseTerminalOnClaudeExit: boolean;
	startupCommand: string;
	mcpHttpPort: number;
	enableWebSocketServer: boolean;
	enableHttpServer: boolean;
	enableEmbeddedTerminal: boolean;
}

export const DEFAULT_SETTINGS: ClaudeCodeSettings = {
	autoCloseTerminalOnClaudeExit: true,
	startupCommand: "cl",
	mcpHttpPort: 22360,
	enableWebSocketServer: true,
	enableHttpServer: true,
	enableEmbeddedTerminal: true,
};

export class ClaudeCodeSettingTab extends PluginSettingTab {
	plugin: ClaudeMcpPlugin;

	constructor(app: App, plugin: ClaudeMcpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Claude Code Settings" });

		// MCP Server Status Section
		this.displayServerStatus(containerEl);

		// MCP Server Configuration Section
		containerEl.createEl("h3", { text: "MCP Server Configuration" });

		new Setting(containerEl)
			.setName("Enable WebSocket Server")
			.setDesc(
				"Enable WebSocket server for Claude Code IDE integration. This allows auto-discovery via lock files."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableWebSocketServer)
					.onChange(async (value) => {
						this.plugin.settings.enableWebSocketServer = value;
						await this.plugin.saveSettings();
						await this.plugin.restartMcpServer();
						// Refresh the display to show updated status
						this.display();
					})
			);

		new Setting(containerEl)
			.setName("Enable HTTP/SSE Server")
			.setDesc(
				"Enable HTTP/SSE server for Claude Desktop and other MCP clients. Required for manual MCP client configuration."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableHttpServer)
					.onChange(async (value) => {
						this.plugin.settings.enableHttpServer = value;
						await this.plugin.saveSettings();
						await this.plugin.restartMcpServer();
						// Refresh the display to show updated status
						this.display();
					})
			);

		new Setting(containerEl)
			.setName("HTTP Server Port")
			.setDesc(
				"Port for the HTTP/SSE MCP server. Default is 22360 to avoid conflicts with common dev services. Changes will apply when you leave this field."
			)
			.addText((text) => {
				text
					.setPlaceholder("22360")
					.setValue(this.plugin.settings.mcpHttpPort.toString())
					.onChange(async (value) => {
						const port = parseInt(value);
						if (isNaN(port) || port < 1024 || port > 65535) {
							return;
						}
						// Only save the setting, don't restart the server yet
						this.plugin.settings.mcpHttpPort = port;
						await this.plugin.saveSettings();
					});
				
				// Restart server only on blur
				text.inputEl.addEventListener("blur", async () => {
					const value = text.getValue();
					const port = parseInt(value);
					if (isNaN(port) || port < 1024 || port > 65535) {
						text.setValue(this.plugin.settings.mcpHttpPort.toString());
						return;
					}
					// Only restart if the server is enabled
					if (this.plugin.settings.enableHttpServer) {
						await this.plugin.restartMcpServer();
						// Refresh the display to show updated status
						this.display();
					}
				});
			});

		// Terminal Configuration Section
		containerEl.createEl("h3", { text: "Terminal Configuration" });

		new Setting(containerEl)
			.setName("Enable Embedded Terminal")
			.setDesc(
				"Enable the built-in terminal feature within Obsidian. When disabled, you can still use external MCP clients like Claude Desktop or Claude Code IDE. Requires plugin reload to take effect."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableEmbeddedTerminal)
					.onChange(async (value) => {
						this.plugin.settings.enableEmbeddedTerminal = value;
						await this.plugin.saveSettings();

						// Dynamically manage ribbon icon
						if (value) {
							this.plugin.addTerminalRibbonIcon();
						} else {
							this.plugin.removeTerminalRibbonIcon();
						}

						new Notice(
							"Terminal setting changed. Please reload the plugin for full changes to take effect.",
							5000
						);
					})
			);

		if (this.plugin.settings.enableEmbeddedTerminal) {
			new Setting(containerEl)
				.setName("Auto-close terminal when Claude exits")
				.setDesc(
					"Automatically close the terminal view when the Claude command exits. If disabled, the terminal will remain open as a regular shell."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(
							this.plugin.settings.autoCloseTerminalOnClaudeExit
						)
						.onChange(async (value) => {
							this.plugin.settings.autoCloseTerminalOnClaudeExit =
								value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Startup command")
				.setDesc(
					"Command to run automatically when the terminal opens. Use an empty string to disable auto-launch."
				)
				.addText((text) =>
					text
						.setPlaceholder("cl -c")
						.setValue(this.plugin.settings.startupCommand)
						.onChange(async (value) => {
							this.plugin.settings.startupCommand = value;
							await this.plugin.saveSettings();
						})
				);
		}
	}

	private displayServerStatus(containerEl: HTMLElement): void {
		const statusSection = containerEl.createEl("div", {
			cls: "mcp-server-status",
		});
		statusSection.createEl("h3", { text: "MCP Server Status" });

		// Get server info from the plugin
		const serverInfo = this.plugin.mcpServer?.getServerInfo() || {};

		// WebSocket Server Status
		const wsContainer = statusSection.createEl("div", {
			cls: "server-status-item",
		});
		wsContainer.createEl("h4", { text: "WebSocket Server (Claude Code)" });

		const wsStatus = wsContainer.createEl("div", { cls: "status-line" });
		if (this.plugin.settings.enableWebSocketServer && serverInfo.wsPort) {
			wsStatus.innerHTML = `
				<span class="status-indicator status-running">●</span>
				<span class="status-text">Running on port ${serverInfo.wsPort}</span>
				<span class="status-clients">(${serverInfo.wsClients || 0} clients)</span>
			`;

			const wsDetails = wsContainer.createEl("div", {
				cls: "status-details",
			});
			const configDir = getClaudeConfigDir();
			wsDetails.innerHTML = `
				<div>• Auto-discovery enabled via lock files</div>
				<div>• Lock file: <code>${configDir}/ide/${serverInfo.wsPort}.lock</code></div>
				<div>• Use <code>cl</code> CLI and select "Obsidian" from <code>/ide</code> list</div>
			`;
		} else if (!this.plugin.settings.enableWebSocketServer) {
			wsStatus.innerHTML = `
				<span class="status-indicator status-disabled">●</span>
				<span class="status-text">Disabled</span>
			`;
		} else {
			wsStatus.innerHTML = `
				<span class="status-indicator status-error">●</span>
				<span class="status-text">Failed to start</span>
			`;
		}

		// HTTP/SSE Server Status
		const httpContainer = statusSection.createEl("div", {
			cls: "server-status-item",
		});
		httpContainer.createEl("h4", {
			text: "MCP Server (HTTP/SSE transport)",
		});

		const httpStatus = httpContainer.createEl("div", {
			cls: "status-line",
		});
		if (this.plugin.settings.enableHttpServer && serverInfo.httpPort) {
			httpStatus.innerHTML = `
				<span class="status-indicator status-running">●</span>
				<span class="status-text">Running on port ${serverInfo.httpPort}</span>
				<span class="status-clients">(${serverInfo.httpClients || 0} clients)</span>
			`;

			const httpDetails = httpContainer.createEl("div", {
				cls: "status-details",
			});
			httpDetails.innerHTML = `
				<div>• SSE Stream: <code>http://localhost:${serverInfo.httpPort}/sse</code></div>
				<div>• Add to Claude Desktop config: <code>"url": "http://localhost:${serverInfo.httpPort}/sse"</code></div>
			`;
		} else if (!this.plugin.settings.enableHttpServer) {
			httpStatus.innerHTML = `
				<span class="status-indicator status-disabled">●</span>
				<span class="status-text">Disabled</span>
			`;
		} else {
			httpStatus.innerHTML = `
				<span class="status-indicator status-error">●</span>
				<span class="status-text">Failed to start</span>
			`;
		}

		// Add refresh button
		const refreshContainer = statusSection.createEl("div", {
			cls: "status-refresh",
		});
		const refreshButton = refreshContainer.createEl("button", {
			text: "Refresh Status",
			cls: "mod-cta",
		});
		refreshButton.addEventListener("click", () => {
			this.display(); // Refresh the entire settings display
		});
	}
}
