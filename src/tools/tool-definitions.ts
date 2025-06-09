import { Tool } from "../mcp/types";

export const WORKSPACE_TOOL_DEFINITIONS: Tool[] = [
	{
		name: "get_current_file",
		description: "Get the currently active file in Obsidian",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
	{
		name: "get_workspace_files",
		description: "List all files in the Obsidian vault",
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
	{
		name: "getDiagnostics",
		description: "Get system and vault diagnostic information",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
	{
		name: "openDiff",
		description: "Open a diff view (stub implementation for Obsidian compatibility)",
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
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
];

// Helper function to get tool names from definitions
export function getDefinedToolNames(): string[] {
	return WORKSPACE_TOOL_DEFINITIONS.map((tool) => tool.name);
}
