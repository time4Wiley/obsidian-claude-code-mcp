import { App } from "obsidian";
import { McpReplyFunction } from "../mcp/types";
import { ToolImplementation, ToolDefinition } from "../shared/tool-registry";
import { WorkspaceManager } from "../obsidian/workspace-manager";

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
	constructor(
		private app: App,
		private workspaceManager?: WorkspaceManager
	) {}

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
						// Get basic vault information
						const activeFile = this.app.workspace.getActiveFile();
						const diagnostics: any = {
							vaultName: this.app.vault.getName(),
							fileCount: this.app.vault.getFiles().length,
							activeFile: activeFile?.path || null,
							timestamp: new Date().toISOString(),
						};

						// Add canvas-specific diagnostics if a canvas is active
						if (activeFile && activeFile.extension === 'canvas' && this.workspaceManager) {
							const canvasState = this.workspaceManager.getCanvasState();
							const canvasManager = this.workspaceManager.getCanvasStateManager();
							
							if (canvasState.canvasData) {
								const selectedNodes = canvasManager.getSelectedNodes();
								const selectedEdges = canvasManager.getSelectedEdges();
								
								diagnostics.canvas = {
									isActive: true,
									file: activeFile.path,
									stats: {
										totalNodes: canvasState.canvasData.nodes?.length || 0,
										totalEdges: canvasState.canvasData.edges?.length || 0,
										selectedNodes: selectedNodes.length,
										selectedEdges: selectedEdges.length,
									},
									selection: {
										nodes: selectedNodes.map(node => ({
											id: node.id,
											type: node.type,
											content: this.getNodeContent(node),
										})),
										edges: selectedEdges.map(edge => ({
											id: edge.id,
											from: edge.fromNode,
											to: edge.toNode,
											label: edge.label,
										})),
										selectedText: canvasState.selectedText,
									},
									nodeTypes: this.countNodeTypes(canvasState.canvasData.nodes),
									groups: canvasState.groupHierarchy.size,
								};

								// Add node relationships for selected nodes
								if (selectedNodes.length > 0) {
									diagnostics.canvas.selectedNodeRelations = selectedNodes.map(node => {
										const relations = canvasManager.getNodeRelations(node.id);
										return {
											nodeId: node.id,
											type: node.type,
											connectedNodes: relations?.connectedNodes ? Array.from(relations.connectedNodes) : [],
											parentGroup: relations?.parentGroup,
											incomingEdges: relations?.incomingEdges?.length || 0,
											outgoingEdges: relations?.outgoingEdges?.length || 0,
										};
									});
								}
							} else {
								diagnostics.canvas = {
									isActive: true,
									file: activeFile.path,
									error: "Canvas data not yet loaded",
								};
							}
						} else {
							diagnostics.canvas = {
								isActive: false,
							};
						}

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

	private getNodeContent(node: any): string {
		switch (node.type) {
			case 'text':
				const text = (node as any).text;
				return text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : '';
			case 'file':
				return (node as any).file || '';
			case 'link':
				return (node as any).url || '';
			case 'group':
				return (node as any).label || 'Untitled Group';
			default:
				return '';
		}
	}

	private countNodeTypes(nodes: any[]): Record<string, number> {
		const counts: Record<string, number> = {};
		if (!nodes) return counts;
		
		for (const node of nodes) {
			counts[node.type] = (counts[node.type] || 0) + 1;
		}
		return counts;
	}
}