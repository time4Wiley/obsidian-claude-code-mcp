import { App, PluginSettingTab, Setting } from "obsidian";
import ClaudeMcpPlugin from "../main";

export interface ClaudeCodeSettings {
	autoCloseTerminalOnClaudeExit: boolean;
	startupCommand: string;
}

export const DEFAULT_SETTINGS: ClaudeCodeSettings = {
	autoCloseTerminalOnClaudeExit: true,
	startupCommand: "claude -c",
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
