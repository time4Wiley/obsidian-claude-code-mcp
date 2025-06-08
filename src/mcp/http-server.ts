export class McpHttpServer {
	constructor() {}

	/** returns port number */
	async start(port: number = 22360): Promise<number> {}

	stop(): void {}

	get clientCount(): number {}

	get serverPort(): number {}
}
