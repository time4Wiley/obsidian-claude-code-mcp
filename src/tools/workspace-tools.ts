import { App } from "obsidian";
import {
	McpRequest,
	McpReplyFunction,
	WorkspaceInfo,
} from "../mcp/types";

// This class is now deprecated in favor of the tool registry approach
// Keeping only for getWorkspaceInfo which is not a tool
export class WorkspaceTools {
	constructor(private app: App) {}


	async handleGetWorkspaceInfo(
		req: McpRequest,
		reply: McpReplyFunction
	): Promise<void> {
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
