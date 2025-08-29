import { App, Editor, Plugin } from "obsidian";
import {
	McpNotification,
	SelectionChangedParams,
	SelectionRange,
} from "../mcp/types";
import { getAbsolutePath } from "./utils";
import { CanvasStateManager } from "../canvas/canvas-state-manager";

export interface WorkspaceManagerConfig {
	onSelectionChange: (notification: McpNotification) => void;
}

export class WorkspaceManager {
	private config: WorkspaceManagerConfig;
	private canvasStateManager: CanvasStateManager;

	constructor(
		private app: App,
		private plugin: Plugin,
		config: WorkspaceManagerConfig
	) {
		this.config = config;
		this.canvasStateManager = new CanvasStateManager(app);
	}

	setupListeners(): void {
		// Listen for active file changes
		this.plugin.registerEvent(
			this.app.workspace.on("active-leaf-change", async () => {
				const activeLeaf = this.app.workspace.activeLeaf;
				if (activeLeaf?.view) {
					await this.canvasStateManager.updateCanvasState(activeLeaf.view);
				}
				this.sendCurrentFileContext();
			})
		);

		// Listen for file opens
		this.plugin.registerEvent(
			this.app.workspace.on("file-open", async () => {
				const activeLeaf = this.app.workspace.activeLeaf;
				if (activeLeaf?.view) {
					await this.canvasStateManager.updateCanvasState(activeLeaf.view);
				}
				this.sendCurrentFileContext();
			})
		);

		// Listen for DOM selection changes (replaces editor-change polling)
		this.plugin.registerDomEvent(document, "selectionchange", () => {
			this.checkAndSendSelection();
		});
	}

	sendInitialContext(): void {
		this.sendCurrentFileContext();
	}

	private checkAndSendSelection(): void {
		// Check if the selection is within an editable note view
		if (!this.isSelectionInEditableNote()) {
			return;
		}

		const activeLeaf = this.app.workspace.activeLeaf;
		const view = activeLeaf?.view;
		const editor = (view as any)?.editor;

		if (editor) {
			this.sendSelectionContext(editor);
		}
	}

	private isSelectionInEditableNote(): boolean {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return false;
		}

		// Get the anchor node of the selection
		const anchorNode = selection.anchorNode;
		if (!anchorNode) {
			return false;
		}

		// Traverse up the DOM tree to find if we're within an editor
		let element =
			anchorNode.nodeType === Node.ELEMENT_NODE
				? (anchorNode as Element)
				: anchorNode.parentElement;

		while (element) {
			// Check for Obsidian editor containers
			// The main editor area has class 'cm-editor' (CodeMirror 6)
			// or 'CodeMirror' (CodeMirror 5) depending on version
			if (
				element.classList.contains("cm-editor") ||
				element.classList.contains("CodeMirror") ||
				element.classList.contains("markdown-source-view") ||
				element.classList.contains("markdown-preview-view")
			) {
				// Additional check: ensure we're in the main workspace, not a modal or settings
				const workspaceElement = element.closest(".workspace");
				const modalElement = element.closest(".modal");
				const settingsElement = element.closest(
					".vertical-tab-content"
				);

				// Return true only if we're in the workspace and not in a modal/settings
				return (
					workspaceElement !== null &&
					modalElement === null &&
					settingsElement === null
				);
			}

			element = element.parentElement;
		}

		return false;
	}

	private sendCurrentFileContext(): void {
		const activeFile = this.app.workspace.getActiveFile();

		// Try to get the active editor for cursor/selection info
		const activeLeaf = this.app.workspace.activeLeaf;
		const view = activeLeaf?.view;
		const editor = (view as any)?.editor;

		if (editor && activeFile) {
			this.sendSelectionContext(editor);
		} else {
			// Fallback to basic file context
			const params: SelectionChangedParams = {
				text: "",
				filePath: activeFile ? activeFile.path : null,
				fileUrl: activeFile
					? `file://${this.getAbsolutePath(activeFile.path)}`
					: null,
				selection: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
					isEmpty: true,
				},
			};

			this.broadcastSelectionChange(params);
		}
	}

	private sendSelectionContext(editor: Editor): void {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		// Get cursor position and selection
		const cursor = editor.getCursor();
		const selection = editor.getSelection();
		const hasSelection = selection.length > 0;

		// Get selection range if text is selected
		let selectionRange: SelectionRange;
		if (hasSelection) {
			const from = editor.getCursor("from");
			const to = editor.getCursor("to");
			selectionRange = {
				start: { line: from.line, character: from.ch },
				end: { line: to.line, character: to.ch },
				isEmpty: false,
			};
		} else {
			selectionRange = {
				start: { line: cursor.line, character: cursor.ch },
				end: { line: cursor.line, character: cursor.ch },
				isEmpty: true,
			};
		}

		const params: SelectionChangedParams = {
			text: selection,
			filePath: activeFile.path,
			fileUrl: `file://${this.getAbsolutePath(activeFile.path)}`,
			selection: selectionRange,
		};

		this.broadcastSelectionChange(params);
	}

	private broadcastSelectionChange(params: SelectionChangedParams): void {
		const message: McpNotification = {
			jsonrpc: "2.0",
			method: "selection_changed",
			params,
		};

		this.config.onSelectionChange(message);
	}

	private getAbsolutePath(relativePath: string): string {
		const basePath =
			(this.app.vault.adapter as any).getBasePath?.() || process.cwd();
		return getAbsolutePath(relativePath, basePath);
	}

	getCanvasState() {
		return this.canvasStateManager.getState();
	}

	getCanvasStateManager() {
		return this.canvasStateManager;
	}

	destroy(): void {
		this.canvasStateManager.destroy();
	}
}
