// Human-readable byte size (B / KB / MB), rounded to one decimal for KB+.
// Pure + db-free so it stays unit-testable (importing anything that pulls in
// ~/lib/db drags Tauri into the vitest node env and breaks the test).
export const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
