import { App, TFile, View } from 'obsidian';
import type { 
    CanvasData, 
    AllCanvasNodeData, 
    CanvasEdgeData,
    CanvasGroupData,
    CanvasTextData,
    CanvasFileData,
    CanvasLinkData
} from '../../obsidian-api/canvas';

export interface CanvasSelection {
    nodes: Set<string>;
    edges: Set<string>;
}

export interface CanvasNodeRelations {
    nodeId: string;
    incomingEdges: CanvasEdgeData[];
    outgoingEdges: CanvasEdgeData[];
    connectedNodes: Set<string>;
    parentGroup?: string;
}

export interface CanvasState {
    activeFile: TFile | null;
    canvasData: CanvasData | null;
    selection: CanvasSelection;
    selectedText: string | null;
    nodeRelations: Map<string, CanvasNodeRelations>;
    groupHierarchy: Map<string, Set<string>>;
}

export class CanvasStateManager {
    private app: App;
    private state: CanvasState;
    private canvasView: any;
    private selectionHandler: (() => void) | null = null;
    private clickHandler: (() => void) | null = null;

    constructor(app: App) {
        this.app = app;
        this.state = {
            activeFile: null,
            canvasData: null,
            selection: { nodes: new Set(), edges: new Set() },
            selectedText: null,
            nodeRelations: new Map(),
            groupHierarchy: new Map()
        };
    }

    async updateCanvasState(view: View): Promise<void> {
        if (!this.isCanvasView(view)) {
            this.clearState();
            return;
        }

        this.canvasView = view;
        const file = (view as any).file;
        
        if (!file) {
            this.clearState();
            return;
        }

        this.state.activeFile = file;

        // Read canvas data from file
        const content = await this.app.vault.read(file);
        try {
            this.state.canvasData = JSON.parse(content) as CanvasData;
            this.buildNodeRelations();
            this.buildGroupHierarchy();
            this.updateSelection();
            this.registerCanvasEventListeners();
        } catch (e) {
            console.error('Failed to parse canvas data:', e);
            this.state.canvasData = null;
        }
    }

    private isCanvasView(view: View): boolean {
        return (view as any)?.canvas !== undefined;
    }

    private buildNodeRelations(): void {
        if (!this.state.canvasData) return;

        this.state.nodeRelations.clear();

        // Initialize relations for all nodes
        for (const node of this.state.canvasData.nodes) {
            this.state.nodeRelations.set(node.id, {
                nodeId: node.id,
                incomingEdges: [],
                outgoingEdges: [],
                connectedNodes: new Set(),
                parentGroup: this.findParentGroup(node)
            });
        }

        // Build edge relationships
        for (const edge of this.state.canvasData.edges) {
            const fromRelation = this.state.nodeRelations.get(edge.fromNode);
            const toRelation = this.state.nodeRelations.get(edge.toNode);

            if (fromRelation) {
                fromRelation.outgoingEdges.push(edge);
                fromRelation.connectedNodes.add(edge.toNode);
            }

            if (toRelation) {
                toRelation.incomingEdges.push(edge);
                toRelation.connectedNodes.add(edge.fromNode);
            }
        }
    }

    private findParentGroup(node: AllCanvasNodeData): string | undefined {
        if (!this.state.canvasData) return undefined;

        for (const candidate of this.state.canvasData.nodes) {
            if (candidate.type === 'group') {
                const group = candidate as CanvasGroupData;
                if (this.isNodeInsideGroup(node, group)) {
                    return group.id;
                }
            }
        }
        return undefined;
    }

    private isNodeInsideGroup(node: AllCanvasNodeData, group: CanvasGroupData): boolean {
        return node.x >= group.x &&
               node.y >= group.y &&
               node.x + node.width <= group.x + group.width &&
               node.y + node.height <= group.y + group.height &&
               node.id !== group.id;
    }

    private buildGroupHierarchy(): void {
        if (!this.state.canvasData) return;

        this.state.groupHierarchy.clear();

        for (const node of this.state.canvasData.nodes) {
            if (node.type === 'group') {
                const group = node as CanvasGroupData;
                const children = new Set<string>();

                for (const candidate of this.state.canvasData.nodes) {
                    if (candidate.id !== group.id && this.isNodeInsideGroup(candidate, group)) {
                        children.add(candidate.id);
                    }
                }

                this.state.groupHierarchy.set(group.id, children);
            }
        }
    }

    private updateSelection(): void {
        if (!this.canvasView?.canvas) return;

        const canvas = this.canvasView.canvas;
        const selection = canvas.selection;

        if (!selection) return;

        this.state.selection.nodes.clear();
        this.state.selection.edges.clear();

        // Get selected nodes
        const selectedNodes = selection.nodes || selection;
        if (selectedNodes && typeof selectedNodes[Symbol.iterator] === 'function') {
            for (const node of selectedNodes) {
                if (node?.id) {
                    this.state.selection.nodes.add(node.id);
                }
            }
        }

        // Get selected edges
        const selectedEdges = selection.edges;
        if (selectedEdges && typeof selectedEdges[Symbol.iterator] === 'function') {
            for (const edge of selectedEdges) {
                if (edge?.id) {
                    this.state.selection.edges.add(edge.id);
                }
            }
        }

        // Extract selected text from selected nodes
        this.updateSelectedText();
    }

    private updateSelectedText(): void {
        this.state.selectedText = null;

        if (!this.canvasView?.canvas) return;

        const canvas = this.canvasView.canvas;
        const selection = window.getSelection();

        // Try to get selected text from the DOM
        if (selection && selection.toString().trim()) {
            this.state.selectedText = selection.toString().trim();
            return;
        }

        // If only one text node is selected, get its content
        if (this.state.selection.nodes.size === 1 && this.state.canvasData) {
            const nodeId = Array.from(this.state.selection.nodes)[0];
            const node = this.state.canvasData.nodes.find(n => n.id === nodeId);

            if (node?.type === 'text') {
                const textNode = node as CanvasTextData;
                // Check if there's a text selection within the canvas node element
                const canvasNode = canvas.nodes?.get?.(nodeId);
                if (canvasNode?.contentEl) {
                    const nodeSelection = canvasNode.contentEl.ownerDocument.getSelection();
                    if (nodeSelection && nodeSelection.toString().trim()) {
                        this.state.selectedText = nodeSelection.toString().trim();
                    }
                }
            }
        }

        // Check for selected edge labels
        if (this.state.selection.edges.size === 1 && this.state.canvasData) {
            const edgeId = Array.from(this.state.selection.edges)[0];
            const edge = this.state.canvasData.edges.find(e => e.id === edgeId);
            if (edge?.label) {
                this.state.selectedText = edge.label;
            }
        }
    }

    private registerCanvasEventListeners(): void {
        if (!this.canvasView?.canvas) return;

        this.unregisterCanvasEventListeners();

        const canvas = this.canvasView.canvas;
        const canvasEl = canvas.canvasEl || canvas.containerEl;

        if (canvasEl) {
            // Listen for selection changes
            this.selectionHandler = () => {
                this.updateSelection();
            };

            this.clickHandler = () => {
                // Delay to ensure selection is updated
                setTimeout(() => this.updateSelection(), 50);
            };

            canvasEl.addEventListener('mouseup', this.selectionHandler);
            canvasEl.addEventListener('click', this.clickHandler);
            
            // Listen for text selection changes
            document.addEventListener('selectionchange', this.selectionHandler);
        }

        // Register for canvas data changes
        if (canvas.on) {
            canvas.on('node-added', () => this.refreshCanvasData());
            canvas.on('node-removed', () => this.refreshCanvasData());
            canvas.on('node-changed', () => this.refreshCanvasData());
            canvas.on('edge-added', () => this.refreshCanvasData());
            canvas.on('edge-removed', () => this.refreshCanvasData());
            canvas.on('edge-changed', () => this.refreshCanvasData());
        }
    }

    private unregisterCanvasEventListeners(): void {
        if (this.selectionHandler) {
            const canvas = this.canvasView?.canvas;
            const canvasEl = canvas?.canvasEl || canvas?.containerEl;
            if (canvasEl) {
                canvasEl.removeEventListener('mouseup', this.selectionHandler);
                canvasEl.removeEventListener('click', this.clickHandler);
            }
            document.removeEventListener('selectionchange', this.selectionHandler);
            this.selectionHandler = null;
            this.clickHandler = null;
        }
    }

    private async refreshCanvasData(): Promise<void> {
        if (!this.state.activeFile) return;

        try {
            const content = await this.app.vault.read(this.state.activeFile);
            this.state.canvasData = JSON.parse(content) as CanvasData;
            this.buildNodeRelations();
            this.buildGroupHierarchy();
        } catch (e) {
            console.error('Failed to refresh canvas data:', e);
        }
    }

    private clearState(): void {
        this.unregisterCanvasEventListeners();
        this.state = {
            activeFile: null,
            canvasData: null,
            selection: { nodes: new Set(), edges: new Set() },
            selectedText: null,
            nodeRelations: new Map(),
            groupHierarchy: new Map()
        };
        this.canvasView = null;
    }

    getState(): CanvasState {
        return this.state;
    }

    getSelectedNodes(): AllCanvasNodeData[] {
        if (!this.state.canvasData) return [];
        
        return this.state.canvasData.nodes.filter(node => 
            this.state.selection.nodes.has(node.id)
        );
    }

    getSelectedEdges(): CanvasEdgeData[] {
        if (!this.state.canvasData) return [];
        
        return this.state.canvasData.edges.filter(edge => 
            this.state.selection.edges.has(edge.id)
        );
    }

    getNodeRelations(nodeId: string): CanvasNodeRelations | undefined {
        return this.state.nodeRelations.get(nodeId);
    }

    getConnectedNodes(nodeId: string): AllCanvasNodeData[] {
        const relations = this.state.nodeRelations.get(nodeId);
        if (!relations || !this.state.canvasData) return [];

        return this.state.canvasData.nodes.filter(node => 
            relations.connectedNodes.has(node.id)
        );
    }

    getNodesInGroup(groupId: string): AllCanvasNodeData[] {
        const children = this.state.groupHierarchy.get(groupId);
        if (!children || !this.state.canvasData) return [];

        return this.state.canvasData.nodes.filter(node => 
            children.has(node.id)
        );
    }

    getParentGroup(nodeId: string): CanvasGroupData | undefined {
        const relations = this.state.nodeRelations.get(nodeId);
        if (!relations?.parentGroup || !this.state.canvasData) return undefined;

        const group = this.state.canvasData.nodes.find(n => 
            n.id === relations.parentGroup && n.type === 'group'
        );

        return group as CanvasGroupData | undefined;
    }

    destroy(): void {
        this.clearState();
    }
}