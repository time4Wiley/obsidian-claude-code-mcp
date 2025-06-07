export interface McpRequest {
	jsonrpc: "2.0";
	id: string | number;
	method: string;
	params?: any;
}

export interface McpResponse {
	jsonrpc: "2.0";
	id: string | number;
	result?: any;
	error?: { code: number; message: string };
}

export interface McpNotification {
	jsonrpc: "2.0";
	method: string;
	params?: any;
}

export interface SelectionRange {
	start: { line: number; character: number };
	end: { line: number; character: number };
	isEmpty: boolean;
}

export interface SelectionChangedParams {
	text: string;
	filePath: string | null;
	fileUrl: string | null;
	selection: SelectionRange;
}

export interface Tool {
	name: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, any>;
	};
}

export interface WorkspaceInfo {
	name: string;
	path: string;
	fileCount: number;
	type: string;
}

export type McpReplyFunction = (msg: Omit<McpResponse, "jsonrpc" | "id">) => void;