import { App } from "obsidian";
import { McpReplyFunction } from "../mcp/types";
import { ToolImplementation, ToolDefinition } from "../shared/tool-registry";

// IDE-specific tool definitions
export const IDE_TOOL_DEFINITIONS: ToolDefinition[] = [
	{
		name: "openDiff",
		description: "Open a diff view (stub implementation for Obsidian compatibility)",
		category: "ide-specific",
		inputSchema: {
			type: "object",
			properties: {
				old_file_path: {
					type: "string",
					description: "Path to the old version of the file",
				},
				new_file_path: {
					type: "string",
					description: "Path to the new version of the file",
				},
				new_file_contents: {
					type: "string",
					description: "Contents of the new file version",
				},
				tab_name: {
					type: "string",
					description: "Name of the tab to open",
				},
			},
		},
	},
	{
		name: "close_tab",
		description: "Close a tab (stub implementation for Obsidian compatibility)",
		category: "ide-specific",
		inputSchema: {
			type: "object",
			properties: {
				tab_name: {
					type: "string",
					description: "Name of the tab to close",
				},
			},
		},
	},
	{
		name: "closeAllDiffTabs",
		description: "Close all diff tabs (stub implementation for Obsidian compatibility)",
		category: "ide-specific",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
	{
		name: "getDiagnostics",
		description: "Get system and vault diagnostic information",
		category: "ide-specific",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
];

// IDE-specific tool implementations
export class IdeTools {
	constructor(private app: App) {}

	createImplementations(): ToolImplementation[] {
		return [
			{
				name: "openDiff",
				handler: async (args: any, reply: McpReplyFunction) => {
					// Claude Code is trying to open a diff view, but Obsidian doesn't have built-in diff functionality
					// Just acknowledge the request successfully to prevent errors
					const { old_file_path, new_file_path, new_file_contents, tab_name } = args || {};
					
					console.debug(`[MCP] OpenDiff requested for ${old_file_path} (tab: ${tab_name})`);
					
					return reply({
						result: {
							content: [
								{
									type: "text",
									text: "Diff view opened in Obsidian (no visual diff available)",
								},
							],
						},
					});
				},
			},
			{
				name: "close_tab",
				handler: async (args: any, reply: McpReplyFunction) => {
					// Claude Code is trying to close a tab, but Obsidian doesn't have the same tab concept
					// Just acknowledge the request successfully
					const { tab_name } = args || {};
					
					console.debug(`[MCP] CloseTab requested for ${tab_name}`);
					
					return reply({
						result: {
							content: [
								{
									type: "text",
									text: "Tab closed successfully",
								},
							],
						},
					});
				},
			},
			{
				name: "closeAllDiffTabs",
				handler: async (args: any, reply: McpReplyFunction) => {
					// Claude Code is trying to close all diff tabs, but Obsidian doesn't have the same tab concept
					// Just acknowledge the request successfully
					console.debug(`[MCP] CloseAllDiffTabs requested`);
					
					return reply({
						result: {
							content: [
								{
									type: "text",
									text: "All diff tabs closed successfully",
								},
							],
						},
					});
				},
			},
			{
				name: "getDiagnostics",
				handler: async (args: any, reply: McpReplyFunction) => {
					try {
						// For Obsidian, we don't have traditional LSP diagnostics
						// but we can provide basic system/vault diagnostic information
						const diagnostics = {
							vaultName: this.app.vault.getName(),
							fileCount: this.app.vault.getFiles().length,
							activeFile: this.app.workspace.getActiveFile()?.path || null,
							timestamp: new Date().toISOString(),
						};

						return reply({
							result: {
								diagnostics: [],
								systemInfo: diagnostics,
							},
						});
					} catch (error) {
						reply({
							error: {
								code: -32603,
								message: `failed to get diagnostics: ${error.message}`,
							},
						});
					}
				},
			},
		];
	}
}