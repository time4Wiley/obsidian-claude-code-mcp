export function normalizePath(path: string): string | null {
	// Normalize Windows backslashes to forward slashes
	let normalized = path.replace(/\\/g, '/');
	
	// Remove leading slash if present (vault-relative paths)
	const cleaned = normalized.startsWith("/") ? normalized.slice(1) : normalized;

	// Basic validation - no directory traversal
	if (cleaned.includes("..") || cleaned.includes("~")) {
		return null;
	}

	return cleaned;
}

export function getAbsolutePath(relativePath: string, basePath: string): string {
	// Use forward slashes for consistency across platforms
	const normalizedBase = basePath.replace(/\\/g, '/');
	const normalizedRelative = relativePath.replace(/\\/g, '/');
	return `${normalizedBase}/${normalizedRelative}`;
}