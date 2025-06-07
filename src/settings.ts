import { App, PluginSettingTab, Setting } from "obsidian";
import ClaudeMcpPlugin from "../main";

export interface ClaudeCodeSettings {
	autoCloseTerminalOnClaudeExit: boolean;
}

export const DEFAULT_SETTINGS: ClaudeCodeSettings = {
	autoCloseTerminalOnClaudeExit: true,
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
			.setDesc("Automatically close the terminal view when the Claude command exits. If disabled, the terminal will remain open as a regular shell.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoCloseTerminalOnClaudeExit)
				.onChange(async (value) => {
					this.plugin.settings.autoCloseTerminalOnClaudeExit = value;
					await this.plugin.saveSettings();
				}));
	}
}