import { App } from "obsidian";
import { McpRequest, McpReplyFunction } from "../mcp/types";
import { normalizePath } from "../obsidian/utils";

export class FileTools {
	constructor(private app: App) {}

	async handleReadFile(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		try {
			const { path } = req.params || {};
			if (!path || typeof path !== "string") {
				return reply({
					error: { code: -32602, message: "invalid path parameter" },
				});
			}

			const normalizedPath = normalizePath(path);
			if (!normalizedPath) {
				return reply({
					error: { code: -32603, message: "invalid file path" },
				});
			}

			const content = await this.app.vault.adapter.read(normalizedPath);
			reply({ result: content });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to read file: ${error.message}`,
				},
			});
		}
	}

	async handleWriteFile(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		try {
			const { path, content } = req.params || {};
			if (
				!path ||
				typeof path !== "string" ||
				typeof content !== "string"
			) {
				return reply({
					error: { code: -32602, message: "invalid parameters" },
				});
			}

			const normalizedPath = normalizePath(path);
			if (!normalizedPath) {
				return reply({
					error: { code: -32603, message: "invalid file path" },
				});
			}

			await this.app.vault.adapter.write(normalizedPath, content);
			reply({ result: true });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to write file: ${error.message}`,
				},
			});
		}
	}

	async handleListFiles(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		try {
			const { pattern } = req.params || {};
			const allFiles = this.app.vault.getFiles();

			let filteredFiles = allFiles.map((file) => file.path);

			if (pattern && typeof pattern === "string") {
				const regex = new RegExp(pattern);
				filteredFiles = filteredFiles.filter((path) =>
					regex.test(path)
				);
			}

			reply({ result: filteredFiles });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to list files: ${error.message}`,
				},
			});
		}
	}

	async handleGetOpenFiles(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			const openFiles = activeFile ? [activeFile.path] : [];
			reply({ result: openFiles });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to get open files: ${error.message}`,
				},
			});
		}
	}

	async handleGetCurrentFile(req: McpRequest, reply: McpReplyFunction): Promise<void> {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			reply({ result: activeFile ? activeFile.path : null });
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to get current file: ${error.message}`,
				},
			});
		}
	}
}