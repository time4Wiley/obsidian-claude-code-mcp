import { ToolDefinition } from "../shared/tool-registry";

// MCP-only tool definitions (not available for IDE)
// Currently empty, but this is where you would add tools that should
// only be available via the standard MCP server and not through the IDE integration
export const MCP_ONLY_TOOL_DEFINITIONS: ToolDefinition[] = [
	// Example:
	// {
	//     name: "mcp_specific_tool",
	//     description: "A tool only available via MCP",
	//     category: "mcp-only",
	//     inputSchema: {
	//         type: "object",
	//         properties: {}
	//     }
	// }
];