import { App } from "obsidian";
import * as obsidian from "obsidian";
import {
	McpRequest,
	McpReplyFunction,
	Tool,
	WorkspaceInfo,
} from "../mcp/types";
import { normalizePath } from "../obsidian/utils";
import {
	WORKSPACE_TOOL_DEFINITIONS,
	getDefinedToolNames,
} from "./tool-definitions";

export class WorkspaceTools {
	constructor(private app: App) {
		// Sanity check: ensure all implemented tool handlers have corresponding definitions
		this.validateToolImplementations();
	}

	private validateToolImplementations(): void {
		const definedToolNames = new Set(getDefinedToolNames());
		const implementedToolNames = new Set([
			"get_current_file",
			"get_workspace_files",
			"view",
			"str_replace",
			"create",
			"insert",
			"obsidian_api",
		]);

		// Check for missing definitions
		const missingDefinitions = Array.from(implementedToolNames).filter(
			(name) => !definedToolNames.has(name)
		);

		// Check for missing implementations
		const missingImplementations = Array.from(definedToolNames).filter(
			(name) => !implementedToolNames.has(name)
		);

		if (missingDefinitions.length > 0) {
			console.error(
				"Tools with implementations but no definitions:",
				missingDefinitions
			);
			throw new Error(
				`Missing tool definitions for: ${missingDefinitions.join(", ")}`
			);
		}

		if (missingImplementations.length > 0) {
			console.error(
				"Tools with definitions but no implementations:",
				missingImplementations
			);
			throw new Error(
				`Missing tool implementations for: ${missingImplementations.join(
					", "
				)}`
			);
		}
	}

	getToolDefinitions(): Tool[] {
		return WORKSPACE_TOOL_DEFINITIONS;
	}

	async handleToolCall(
		req: McpRequest,
		reply: McpReplyFunction
	): Promise<void> {
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

				case "view":
					return this.handleViewTool(args, reply);

				case "str_replace":
					return this.handleStrReplaceTool(args, reply);

				case "create":
					return this.handleCreateTool(args, reply);

				case "insert":
					return this.handleInsertTool(args, reply);

				case "getDiagnostics":
					return this.handleGetDiagnostics(args, reply);

				case "obsidian_api":
					return this.handleObsidianApiTool(args, reply);

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

	private async handleGetDiagnostics(
		args: any,
		reply: McpReplyFunction
	): Promise<void> {
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
	}

	private async handleViewTool(
		args: any,
		reply: McpReplyFunction
	): Promise<void> {
		try {
			const { path, view_range } = args || {};
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

			// Check if path is a directory by trying to list files
			const allFiles = this.app.vault.getFiles();
			const isDirectory = allFiles.some(
				(file) =>
					file.path.startsWith(normalizedPath + "/") ||
					(normalizedPath.endsWith("/") &&
						file.path.startsWith(normalizedPath))
			);

			if (isDirectory || normalizedPath.endsWith("/")) {
				// List directory contents
				const dirFiles = allFiles
					.filter((file) => {
						const dirPath = normalizedPath.endsWith("/")
							? normalizedPath
							: normalizedPath + "/";
						return (
							file.path.startsWith(dirPath) &&
							!file.path.substring(dirPath.length).includes("/")
						);
					})
					.map((file) => file.path);

				return reply({
					result: {
						content: [
							{
								type: "text",
								text:
									dirFiles.length > 0
										? `Directory contents:\n${dirFiles.join(
												"\n"
										  )}`
										: "Directory is empty or does not exist",
							},
						],
					},
				});
			} else {
				// Read file contents
				const content = await this.app.vault.adapter.read(
					normalizedPath
				);

				let displayContent = content;
				if (
					view_range &&
					Array.isArray(view_range) &&
					view_range.length === 2
				) {
					const [startLine, endLine] = view_range;
					const lines = content.split("\n");
					const start = Math.max(0, startLine - 1); // Convert to 0-indexed
					const end =
						endLine === -1
							? lines.length
							: Math.min(lines.length, endLine);

					displayContent = lines
						.slice(start, end)
						.map((line, index) => `${start + index + 1}: ${line}`)
						.join("\n");
				} else {
					// Add line numbers to all content
					displayContent = content
						.split("\n")
						.map((line, index) => `${index + 1}: ${line}`)
						.join("\n");
				}

				return reply({
					result: {
						content: [
							{
								type: "text",
								text: displayContent,
							},
						],
					},
				});
			}
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to view file/directory: ${error.message}`,
				},
			});
		}
	}

	private async handleStrReplaceTool(
		args: any,
		reply: McpReplyFunction
	): Promise<void> {
		try {
			const { path, old_str, new_str } = args || {};
			if (
				!path ||
				typeof path !== "string" ||
				typeof old_str !== "string" ||
				typeof new_str !== "string"
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

			const content = await this.app.vault.adapter.read(normalizedPath);

			// Check for exact matches
			const matches = content.split(old_str).length - 1;
			if (matches === 0) {
				return reply({
					error: {
						code: -32603,
						message: "No match found for replacement text",
					},
				});
			} else if (matches > 1) {
				return reply({
					error: {
						code: -32603,
						message: `Found ${matches} matches for replacement text. Please provide more specific text to match exactly one location.`,
					},
				});
			}

			const newContent = content.replace(old_str, new_str);
			await this.app.vault.adapter.write(normalizedPath, newContent);

			return reply({
				result: {
					content: [
						{
							type: "text",
							text: "Successfully replaced text at exactly one location.",
						},
					],
				},
			});
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to replace text: ${error.message}`,
				},
			});
		}
	}

	private async handleCreateTool(
		args: any,
		reply: McpReplyFunction
	): Promise<void> {
		try {
			const { path, file_text } = args || {};
			if (
				!path ||
				typeof path !== "string" ||
				typeof file_text !== "string"
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

			// Check if file already exists
			try {
				await this.app.vault.adapter.read(normalizedPath);
				return reply({
					error: {
						code: -32603,
						message:
							"File already exists. Use str_replace to modify existing files.",
					},
				});
			} catch (error) {
				// File doesn't exist, which is what we want for create
			}

			await this.app.vault.adapter.write(normalizedPath, file_text);

			return reply({
				result: {
					content: [
						{
							type: "text",
							text: `Successfully created file: ${path}`,
						},
					],
				},
			});
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to create file: ${error.message}`,
				},
			});
		}
	}

	private async handleInsertTool(
		args: any,
		reply: McpReplyFunction
	): Promise<void> {
		try {
			const { path, insert_line, new_str } = args || {};
			if (
				!path ||
				typeof path !== "string" ||
				typeof insert_line !== "number" ||
				typeof new_str !== "string"
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

			const content = await this.app.vault.adapter.read(normalizedPath);
			const lines = content.split("\n");

			// Validate insert_line
			if (insert_line < 0 || insert_line > lines.length) {
				return reply({
					error: {
						code: -32603,
						message: `Invalid insert_line ${insert_line}. Must be between 0 and ${lines.length}`,
					},
				});
			}

			// Insert the new text
			const newLines = new_str.split("\n");
			lines.splice(insert_line, 0, ...newLines);

			const newContent = lines.join("\n");
			await this.app.vault.adapter.write(normalizedPath, newContent);

			return reply({
				result: {
					content: [
						{
							type: "text",
							text: `Successfully inserted text at line ${insert_line} in ${path}`,
						},
					],
				},
			});
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `failed to insert text: ${error.message}`,
				},
			});
		}
	}

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

	private async handleObsidianApiTool(
		args: any,
		reply: McpReplyFunction
	): Promise<void> {
		try {
			const { functionBody } = args || {};
			if (!functionBody || typeof functionBody !== "string") {
				return reply({
					error: {
						code: -32602,
						message:
							"functionBody parameter is required and must be a string",
					},
				});
			}

			// Create and execute the function
			const fn = new Function("app", "obsidian", functionBody);
			let result = fn(this.app, obsidian);

			// Check if the result is a Promise and await it if so
			const isThenable =
				typeof result === "object" &&
				result !== null &&
				typeof result.then === "function";
			if (result instanceof Promise || isThenable) {
				result = await result;
			}

			// Serialize the result
			let serializedResult: string;
			try {
				serializedResult =
					result !== undefined
						? JSON.stringify(result, null, 2)
						: "undefined";
			} catch (serializationError) {
				serializedResult = `[Non-serializable result: ${typeof result}]`;
			}

			return reply({
				result: {
					content: [
						{
							type: "text",
							text: `Function executed successfully.\nResult: ${serializedResult}`,
						},
					],
				},
			});
		} catch (error) {
			reply({
				error: {
					code: -32603,
					message: `Error executing function: ${
						error.message || error
					}`,
				},
			});
		}
	}
}
