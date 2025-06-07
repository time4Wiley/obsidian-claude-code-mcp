import { App, Editor, Plugin } from "obsidian";
import {
	McpNotification,
	SelectionChangedParams,
	SelectionRange,
} from "../mcp/types";
import { getAbsolutePath } from "./utils";

export interface WorkspaceManagerConfig {
	onSelectionChange: (notification: McpNotification) => void;
}

export class WorkspaceManager {
	private config: WorkspaceManagerConfig;

	constructor(
		private app: App,
		private plugin: Plugin,
		config: WorkspaceManagerConfig
	) {
		this.config = config;
	}

	setupListeners(): void {
		// Listen for active file changes
		this.plugin.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.sendCurrentFileContext();
			})
		);

		// Listen for file opens
		this.plugin.registerEvent(
			this.app.workspace.on("file-open", () => {
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
		const activeLeaf = this.app.workspace.activeLeaf;
		const view = activeLeaf?.view;
		const editor = (view as any)?.editor;

		if (editor) {
			this.sendSelectionContext(editor);
		}
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
}
