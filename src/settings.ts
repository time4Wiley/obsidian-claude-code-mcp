import { App, PluginSettingTab, Setting } from "obsidian";
import ClaudeMcpPlugin from "../main";

export interface ClaudeCodeSettings {
	autoCloseTerminalOnClaudeExit: boolean;
	startupCommand: string;
	mcpHttpPort: number;
	enableWebSocketServer: boolean;
	enableHttpServer: boolean;
}

export const DEFAULT_SETTINGS: ClaudeCodeSettings = {
	autoCloseTerminalOnClaudeExit: true,
	startupCommand: "claude -c",
	mcpHttpPort: 22360,
	enableWebSocketServer: true,
	enableHttpServer: true,
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
					})
			);

		new Setting(containerEl)
			.setName("HTTP Server Port")
			.setDesc(
				"Port for the HTTP/SSE MCP server. Default is 22360 to avoid conflicts with common dev services. The server will restart automatically when changed."
			)
			.addText((text) =>
				text
					.setPlaceholder("22360")
					.setValue(this.plugin.settings.mcpHttpPort.toString())
					.onChange(async (value) => {
						const port = parseInt(value);
						if (isNaN(port) || port < 1024 || port > 65535) {
							text.setValue(this.plugin.settings.mcpHttpPort.toString());
							return;
						}
						this.plugin.settings.mcpHttpPort = port;
						await this.plugin.saveSettings();
						await this.plugin.restartMcpServer();
					})
			);

		// Terminal Configuration Section
		containerEl.createEl("h3", { text: "Terminal Configuration" });

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
					.setPlaceholder("claude -c")
					.setValue(this.plugin.settings.startupCommand)
					.onChange(async (value) => {
						this.plugin.settings.startupCommand = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
