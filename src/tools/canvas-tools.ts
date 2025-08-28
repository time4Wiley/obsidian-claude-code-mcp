import { App } from "obsidian";
import { WorkspaceManager } from "../obsidian/workspace-manager";
import { ToolDefinition, ToolImplementation } from "../shared/tool-registry";
import { McpReplyFunction } from "../mcp/types";
import { 
    AllCanvasNodeData, 
    CanvasEdgeData,
    CanvasGroupData,
    CanvasTextData,
    CanvasFileData,
    CanvasLinkData
} from "../../obsidian-api/canvas";

// Canvas tool definitions
export const CANVAS_TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        name: "getCanvasState",
        description: "Get the current canvas state including selected nodes, edges, groups, and text",
        category: "canvas",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "getSelectedCanvasNodes",
        description: "Get detailed information about currently selected canvas nodes including their connections and parent groups",
        category: "canvas",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "getCanvasNodeRelations",
        description: "Get relationships and connections for canvas nodes",
        category: "canvas",
        inputSchema: {
            type: "object",
            properties: {
                nodeId: {
                    type: "string",
                    description: "Optional specific node ID to get relations for. If not provided, gets relations for selected nodes",
                },
            },
        },
    },
    {
        name: "getCanvasGroups",
        description: "Get all groups in the canvas and their child nodes",
        category: "canvas",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "findCanvasNodes",
        description: "Find canvas nodes by content search",
        category: "canvas",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query to find in node content",
                },
                type: {
                    type: "string",
                    description: "Optional node type filter (text, file, link, group)",
                    enum: ["text", "file", "link", "group"],
                },
            },
        },
    },
    {
        name: "getCanvasEdges",
        description: "Get canvas edges (connections between nodes)",
        category: "canvas",
        inputSchema: {
            type: "object",
            properties: {
                nodeId: {
                    type: "string",
                    description: "Optional node ID to get edges connected to that specific node",
                },
            },
        },
    },
];

// Tool to get the current canvas state
export async function getCanvasState(args: {}, reply: McpReplyFunction, app: App, workspaceManager?: WorkspaceManager) {
    if (!workspaceManager) {
        return reply({
            error: { code: -32603, message: "Workspace manager not available" },
        });
    }

    const state = workspaceManager.getCanvasState();
    const manager = workspaceManager.getCanvasStateManager();

    if (!state.activeFile) {
        return reply({
            result: {
                content: [{
                    type: "text",
                    text: JSON.stringify({ 
                        isCanvas: false,
                        message: "No active canvas file" 
                    }, null, 2),
                }],
            },
        });
    }

    if (!state.activeFile.extension || state.activeFile.extension !== 'canvas') {
        return reply({
            result: {
                content: [{
                    type: "text",
                    text: JSON.stringify({ 
                        isCanvas: false,
                        activeFile: state.activeFile.path,
                        message: "Active file is not a canvas" 
                    }, null, 2),
                }],
            },
        });
    }

    const selectedNodes = manager.getSelectedNodes();
    const selectedEdges = manager.getSelectedEdges();

    // Build comprehensive canvas state information
    const canvasInfo = {
        isCanvas: true,
        activeFile: state.activeFile.path,
        canvasData: state.canvasData,
        selection: {
            nodes: selectedNodes.map(formatNodeInfo),
            edges: selectedEdges.map(formatEdgeInfo),
            selectedText: state.selectedText
        },
        stats: {
            totalNodes: state.canvasData?.nodes?.length || 0,
            totalEdges: state.canvasData?.edges?.length || 0,
            selectedNodes: selectedNodes.length,
            selectedEdges: selectedEdges.length
        }
    };

    return reply({
        result: {
            content: [{
                type: "text",
                text: JSON.stringify(canvasInfo, null, 2),
            }],
        },
    });
}

// Tool to get details about selected canvas nodes
export async function getSelectedCanvasNodes(args: {}, reply: McpReplyFunction, app: App, workspaceManager?: WorkspaceManager) {
    if (!workspaceManager) {
        return reply({
            error: { code: -32603, message: "Workspace manager not available" },
        });
    }

    const manager = workspaceManager.getCanvasStateManager();
    const selectedNodes = manager.getSelectedNodes();

    if (selectedNodes.length === 0) {
        return reply({
            result: {
                content: [{
                    type: "text",
                    text: JSON.stringify({ 
                        selectedNodes: [],
                        message: "No canvas nodes selected" 
                    }, null, 2),
                }],
            },
        });
    }

    return reply({
        result: {
            content: [{
                type: "text",
                text: JSON.stringify({
                    selectedNodes: selectedNodes.map(node => ({
                        ...formatNodeInfo(node),
                        parentGroup: manager.getParentGroup(node.id),
                        connectedNodes: manager.getConnectedNodes(node.id).map(formatNodeInfo),
                        relations: manager.getNodeRelations(node.id)
                    }))
                }, null, 2),
            }],
        },
    });
}

// Tool to get canvas node relationships
export async function getCanvasNodeRelations(args: { nodeId?: string }, reply: McpReplyFunction, app: App, workspaceManager?: WorkspaceManager) {
    if (!workspaceManager) {
        return reply({
            error: { code: -32603, message: "Workspace manager not available" },
        });
    }

    const manager = workspaceManager.getCanvasStateManager();
    const state = workspaceManager.getCanvasState();

    if (!state.canvasData) {
        return reply({
            error: { code: -32603, message: "No active canvas" },
        });
    }

    // If nodeId is provided, get specific node relations
    if (args.nodeId) {
        const relations = manager.getNodeRelations(args.nodeId);
        if (!relations) {
            return reply({
                error: { code: -32603, message: `Node ${args.nodeId} not found` },
            });
        }

        const node = state.canvasData.nodes.find(n => n.id === args.nodeId);
        return reply({
            result: {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        node: node ? formatNodeInfo(node) : null,
                        relations: relations,
                        connectedNodes: manager.getConnectedNodes(args.nodeId).map(formatNodeInfo),
                        parentGroup: manager.getParentGroup(args.nodeId)
                    }, null, 2),
                }],
            },
        });
    }

    // Otherwise, get all selected nodes' relations
    const selectedNodes = manager.getSelectedNodes();
    if (selectedNodes.length === 0) {
        return reply({
            result: {
                content: [{
                    type: "text",
                    text: JSON.stringify({ 
                        message: "No nodes selected. Provide a nodeId parameter or select nodes in the canvas." 
                    }, null, 2),
                }],
            },
        });
    }

    return reply({
        result: {
            content: [{
                type: "text",
                text: JSON.stringify({
                    nodeRelations: selectedNodes.map(node => ({
                        node: formatNodeInfo(node),
                        relations: manager.getNodeRelations(node.id),
                        connectedNodes: manager.getConnectedNodes(node.id).map(formatNodeInfo),
                        parentGroup: manager.getParentGroup(node.id)
                    }))
                }, null, 2),
            }],
        },
    });
}

// Tool to get canvas groups and their contents
export async function getCanvasGroups(args: {}, reply: McpReplyFunction, app: App, workspaceManager?: WorkspaceManager) {
    if (!workspaceManager) {
        return reply({
            error: { code: -32603, message: "Workspace manager not available" },
        });
    }

    const manager = workspaceManager.getCanvasStateManager();
    const state = workspaceManager.getCanvasState();

    if (!state.canvasData) {
        return reply({
            error: { code: -32603, message: "No active canvas" },
        });
    }

    const groups = state.canvasData.nodes.filter(n => n.type === 'group') as CanvasGroupData[];

    return reply({
        result: {
            content: [{
                type: "text",
                text: JSON.stringify({
                    groups: groups.map(group => ({
                        ...formatNodeInfo(group),
                        children: manager.getNodesInGroup(group.id).map(formatNodeInfo),
                        childCount: state.groupHierarchy.get(group.id)?.size || 0
                    }))
                }, null, 2),
            }],
        },
    });
}

// Tool to find canvas nodes by content
export async function findCanvasNodes(args: { query: string, type?: string }, reply: McpReplyFunction, app: App, workspaceManager?: WorkspaceManager) {
    if (!workspaceManager) {
        return reply({
            error: { code: -32603, message: "Workspace manager not available" },
        });
    }

    const state = workspaceManager.getCanvasState();
    if (!state.canvasData) {
        return reply({
            error: { code: -32603, message: "No active canvas" },
        });
    }

    const query = args.query.toLowerCase();
    const typeFilter = args.type?.toLowerCase();

    const matches = state.canvasData.nodes.filter(node => {
        // Type filter
        if (typeFilter && node.type !== typeFilter) {
            return false;
        }

        // Content search based on node type
        switch (node.type) {
            case 'text':
                const textNode = node as CanvasTextData;
                return textNode.text.toLowerCase().includes(query);
            case 'file':
                const fileNode = node as CanvasFileData;
                return fileNode.file.toLowerCase().includes(query) ||
                       (fileNode.subpath && fileNode.subpath.toLowerCase().includes(query));
            case 'link':
                const linkNode = node as CanvasLinkData;
                return linkNode.url.toLowerCase().includes(query);
            case 'group':
                const groupNode = node as CanvasGroupData;
                return groupNode.label?.toLowerCase().includes(query) || false;
            default:
                return false;
        }
    });

    return reply({
        result: {
            content: [{
                type: "text",
                text: JSON.stringify({
                    matches: matches.map(formatNodeInfo),
                    count: matches.length
                }, null, 2),
            }],
        },
    });
}

// Tool to get canvas edge information
export async function getCanvasEdges(args: { nodeId?: string }, reply: McpReplyFunction, app: App, workspaceManager?: WorkspaceManager) {
    if (!workspaceManager) {
        return reply({
            error: { code: -32603, message: "Workspace manager not available" },
        });
    }

    const state = workspaceManager.getCanvasState();
    const manager = workspaceManager.getCanvasStateManager();

    if (!state.canvasData) {
        return reply({
            error: { code: -32603, message: "No active canvas" },
        });
    }

    // If nodeId is provided, get edges connected to that node
    if (args.nodeId) {
        const relations = manager.getNodeRelations(args.nodeId);
        if (!relations) {
            return reply({
                error: { code: -32603, message: `Node ${args.nodeId} not found` },
            });
        }

        return reply({
            result: {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        nodeId: args.nodeId,
                        incomingEdges: relations.incomingEdges.map(formatEdgeInfo),
                        outgoingEdges: relations.outgoingEdges.map(formatEdgeInfo)
                    }, null, 2),
                }],
            },
        });
    }

    // Get selected edges
    const selectedEdges = manager.getSelectedEdges();
    
    return reply({
        result: {
            content: [{
                type: "text",
                text: JSON.stringify({
                    selectedEdges: selectedEdges.map(formatEdgeInfo),
                    allEdges: state.canvasData.edges.map(formatEdgeInfo),
                    stats: {
                        totalEdges: state.canvasData.edges.length,
                        selectedEdges: selectedEdges.length
                    }
                }, null, 2),
            }],
        },
    });
}

// Helper function to format node information
function formatNodeInfo(node: AllCanvasNodeData): any {
    const baseInfo = {
        id: node.id,
        type: node.type,
        position: { x: node.x, y: node.y },
        size: { width: node.width, height: node.height },
        color: node.color
    };

    switch (node.type) {
        case 'text':
            const textNode = node as CanvasTextData;
            return {
                ...baseInfo,
                text: textNode.text,
                preview: textNode.text.substring(0, 100) + (textNode.text.length > 100 ? '...' : '')
            };
        case 'file':
            const fileNode = node as CanvasFileData;
            return {
                ...baseInfo,
                file: fileNode.file,
                subpath: fileNode.subpath
            };
        case 'link':
            const linkNode = node as CanvasLinkData;
            return {
                ...baseInfo,
                url: linkNode.url
            };
        case 'group':
            const groupNode = node as CanvasGroupData;
            return {
                ...baseInfo,
                label: groupNode.label,
                background: groupNode.background,
                backgroundStyle: groupNode.backgroundStyle
            };
        default:
            return baseInfo;
    }
}

// Helper function to format edge information
function formatEdgeInfo(edge: CanvasEdgeData): any {
    return {
        id: edge.id,
        from: {
            nodeId: edge.fromNode,
            side: edge.fromSide,
            end: edge.fromEnd
        },
        to: {
            nodeId: edge.toNode,
            side: edge.toSide,
            end: edge.toEnd
        },
        color: edge.color,
        label: edge.label
    };
}

// Canvas tools class
export class CanvasTools {
    constructor(
        private app: App,
        private workspaceManager?: WorkspaceManager
    ) {}

    createImplementations(): ToolImplementation[] {
        return [
            {
                name: "getCanvasState",
                handler: async (args: any, reply: McpReplyFunction) => getCanvasState(args, reply, this.app, this.workspaceManager),
            },
            {
                name: "getSelectedCanvasNodes",
                handler: async (args: any, reply: McpReplyFunction) => getSelectedCanvasNodes(args, reply, this.app, this.workspaceManager),
            },
            {
                name: "getCanvasNodeRelations",
                handler: async (args: any, reply: McpReplyFunction) => getCanvasNodeRelations(args, reply, this.app, this.workspaceManager),
            },
            {
                name: "getCanvasGroups",
                handler: async (args: any, reply: McpReplyFunction) => getCanvasGroups(args, reply, this.app, this.workspaceManager),
            },
            {
                name: "findCanvasNodes",
                handler: async (args: any, reply: McpReplyFunction) => findCanvasNodes(args, reply, this.app, this.workspaceManager),
            },
            {
                name: "getCanvasEdges",
                handler: async (args: any, reply: McpReplyFunction) => getCanvasEdges(args, reply, this.app, this.workspaceManager),
            },
        ];
    }
}