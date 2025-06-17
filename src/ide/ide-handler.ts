import { App } from "obsidian";
import { McpRequest, McpReplyFunction } from "../mcp/types";
import { WorkspaceManager } from "../obsidian/workspace-manager";

/**
 * Handles IDE-specific requests that are not part of the standard MCP protocol
 */
export class IdeHandler {
	constructor(
		private app: App,
		private workspaceManager?: WorkspaceManager
	) {}

	/**
	 * Check if a method is IDE-specific
	 */
	isIdeMethod(method: string): boolean {
		return [
			"ide_connected",
			"notifications/initialized",
		].includes(method);
	}

	/**
	 * Handle IDE-specific requests
	 */
	async handleRequest(
		req: McpRequest,
		reply: McpReplyFunction
	): Promise<boolean> {
		switch (req.method) {
			case "ide_connected":
				return this.handleIdeConnected(req, reply);

			case "notifications/initialized":
				return this.handleInitialized(req, reply);

			default:
				return false; // Not an IDE-specific method
		}
	}

	private async handleIdeConnected(
		req: McpRequest,
		reply: McpReplyFunction
	): Promise<boolean> {
		const { pid } = req.params || {};
		console.debug(`[IDE] Claude Code connected with PID: ${pid}`);
		// No response needed for notifications
		return true;
	}

	private async handleInitialized(
		req: McpRequest,
		reply: McpReplyFunction
	): Promise<boolean> {
		// Send initial file context when Claude connects
		setTimeout(() => {
			console.debug("[IDE] Sending initial file context");
			this.workspaceManager?.sendInitialContext();
		}, 200);
		// No response needed for notifications
		return true;
	}
}