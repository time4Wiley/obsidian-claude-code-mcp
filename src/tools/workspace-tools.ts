import { App } from "obsidian";
import { McpRequest, McpReplyFunction, Tool, WorkspaceInfo } from "../mcp/types";

export class WorkspaceTools {
	constructor(private app: App) {}

	getToolDefinitions(): Tool[] {
		return [
			{
				name: "get_current_file",
				description: "Get the currently active file in Obsidian",
				inputSchema: {
					type: "object",
					properties: {},
				},
			},
			{
				name: "get_workspace_files",
				description: "List all files in the Obsidian vault",
				inputSchema: {
					type: "object",
					properties: {
						pattern: {
							type: "string",
							description: "Optional pattern to filter files",
						},
					},
				},
			},
		];
	}

	async handleToolCall(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		try {
			const { name, arguments: args } = req.params || {};

			switch (name) {
				case "get_current_file":
					const activeFile = this.app.workspace.getActiveFile();
					return reply({
						result: {
							content: [
								{
									type: "text",
									text: activeFile
										? `Current file: ${activeFile.path}`
										: "No file currently active",
								},
							],
						},
					});

				case "get_workspace_files":
					const { pattern } = args || {};
					const allFiles = this.app.vault.getFiles();
					let filteredFiles = allFiles.map((file) => file.path);

					if (pattern && typeof pattern === "string") {
						const regex = new RegExp(pattern);
						filteredFiles = filteredFiles.filter((path) =>
							regex.test(path)
						);
					}

					return reply({
						result: {
							content: [
								{
									type: "text",
									text: `Files in vault:\n${filteredFiles.join(
										"\n"
									)}`,
								},
							],
						},
					});

				default:
					return reply({
						error: { code: -32601, message: "tool not found" },
					});
			}
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to call tool: ${error.message}`,
				},
			});
		}
	}

	async handleGetWorkspaceInfo(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		try {
			const vaultName = this.app.vault.getName();
			const basePath =
				(this.app.vault.adapter as any).getBasePath?.() || "unknown";
			const fileCount = this.app.vault.getFiles().length;

			const workspaceInfo: WorkspaceInfo = {
				name: vaultName,
				path: basePath,
				fileCount,
				type: "obsidian-vault",
			};

			reply({ result: workspaceInfo });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to get workspace info: ${error.message}`,
				},
			});
		}
	}
}