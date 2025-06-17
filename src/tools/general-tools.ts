import { App } from "obsidian";
import * as obsidian from "obsidian";
import { McpReplyFunction } from "../mcp/types";
import { ToolImplementation, ToolDefinition } from "../shared/tool-registry";
import { normalizePath } from "../obsidian/utils";

// General tool definitions (non-IDE specific)
export const GENERAL_TOOL_DEFINITIONS: ToolDefinition[] = [
	{
		name: "get_current_file",
		description: "Get the currently active file in Obsidian",
		category: "workspace",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
	{
		name: "get_workspace_files",
		description: "List all files in the Obsidian vault",
		category: "workspace",
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
	{
		name: "view",
		description:
			"View the contents of a file or list the contents of a directory in the Obsidian vault",
		category: "file",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"Path to the file or directory to view (relative to vault root)",
				},
				view_range: {
					type: "array",
					description:
						"Optional array of two integers [start_line, end_line] to view specific lines (1-indexed, -1 for end means read to end of file)",
					items: {
						type: "integer",
					},
				},
			},
		},
	},
	{
		name: "str_replace",
		description: "Replace specific text in a file with new text",
		category: "file",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"Path to the file to modify (relative to vault root)",
				},
				old_str: {
					type: "string",
					description:
						"The exact text to replace (must match exactly, including whitespace and indentation)",
				},
				new_str: {
					type: "string",
					description:
						"The new text to insert in place of the old text",
				},
			},
		},
	},
	{
		name: "create",
		description:
			"Create a new file with specified content in the Obsidian vault",
		category: "file",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"Path where the new file should be created (relative to vault root)",
				},
				file_text: {
					type: "string",
					description: "The content to write to the new file",
				},
			},
		},
	},
	{
		name: "insert",
		description: "Insert text at a specific line number in a file",
		category: "file",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"Path to the file to modify (relative to vault root)",
				},
				insert_line: {
					type: "integer",
					description:
						"Line number after which to insert the text (0 for beginning of file, 1-indexed)",
				},
				new_str: {
					type: "string",
					description: "The text to insert",
				},
			},
		},
	},
	{
		name: "obsidian_api",
		description: `Use the Obsidian API directly. This is an experimental tool and should be used with caution. Only use this tool when the other Obsidian tools are insufficient.

IMPORTANT: Be very careful when using this tool. It provides full, unrestricted access to the Obsidian API, which allows destructive actions.

Definitions:
- \`app\` is the Obsidian App instance.
- \`obsidian\` is the 'obsidian' module import. I.e. the result of \`require('obsidian')\` or \`import * as obsidian from 'obsidian'\`.

How to use:
- Write a function body as a string that takes the Obsidian \`app\` instance as the first argument and the \`obsidian\` module as the second argument.
  - Example: \`"return typeof app === undefined;"\`. This will return \`false\`, since \`app\` is the first argument and is defined.
  - The string will be evaluated using the \`new Function\` constructor. \`new Function('app', 'obsidian', yourCode)\`.
  - The App object is documented here: https://docs.obsidian.md/Reference/TypeScript+API/App. Make use of your expertise with Obsidian plugins to utilise this API.
- Pass the function definition as a string to this tool.
- The function will be called with the Obsidian \`app\` instance as the first argument, and the \`obsidian\` module as the second argument.
- The return value of your function will be returned as the result of this tool.
- NOTE: The \`obsidian\` module is provided as an argument so that you do not need to \`require\` or \`import\` it in your function body. Neither of these are available in the global scope and will not be available to the function.
- NOTE: A return value is not required. If your function has a return statement we will attempt to serialize the value using JSON.stringify.
- NOTE: Any error thrown by your function will be caught and returned as an error object.`,
		category: "general",
		inputSchema: {
			type: "object",
			properties: {
				functionBody: {
					type: "string",
					description:
						"The full function body, as a plain string, to be called with the Obsidian `app` instance as the first argument and `obsidian` module as the second argument.",
				},
			},
		},
	},
];

// General tool implementations
export class GeneralTools {
	constructor(private app: App) {}

	createImplementations(): ToolImplementation[] {
		return [
			{
				name: "get_current_file",
				handler: async (args: any, reply: McpReplyFunction) => {
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
				},
			},
			{
				name: "get_workspace_files",
				handler: async (args: any, reply: McpReplyFunction) => {
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
				},
			},
			{
				name: "view",
				handler: async (args: any, reply: McpReplyFunction) => {
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
				},
			},
			{
				name: "str_replace",
				handler: async (args: any, reply: McpReplyFunction) => {
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
				},
			},
			{
				name: "create",
				handler: async (args: any, reply: McpReplyFunction) => {
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
				},
			},
			{
				name: "insert",
				handler: async (args: any, reply: McpReplyFunction) => {
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
				},
			},
			{
				name: "obsidian_api",
				handler: async (args: any, reply: McpReplyFunction) => {
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
				},
			},
		];
	}
}