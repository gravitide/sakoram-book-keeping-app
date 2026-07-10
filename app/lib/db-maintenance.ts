// Database maintenance helpers for the active business DB.
//
// All three operations are SINGLE SQL statements, so they're safe with the
// tauri-plugin-sql connection pool (no multi-statement transaction — see the
// connection-pool caveat in CLAUDE.md). They act on whichever business is
// currently open (`getDb()` resolves the active tenant's `business.db`), and
// work on an unlocked encrypted tenant too since the working file is plaintext
// while unlocked.
//
// Kept out of a store: no reactive state to hold — the page calls these
// directly and shows the result in a toast / inline.

import { execute, select } from "~/lib/db";

// SQLite reports its size as page_count × page_size. This is the logical DB
// size (the main file); it ignores any WAL sidecar, which is fine as a
// user-facing "how big is my data" number and for measuring what VACUUM frees.
export const getDatabaseSizeBytes = async (): Promise<number> => {
	const pc = await select<{ page_count: number }>("PRAGMA page_count");
	const ps = await select<{ page_size: number }>("PRAGMA page_size");
	return (pc[0]?.page_count ?? 0) * (ps[0]?.page_size ?? 0);
};

export interface OptimizeResult {
	before: number
	after: number
	reclaimed: number
}

// VACUUM rebuilds the file, repacking free pages left by deletes; PRAGMA
// optimize refreshes the query-planner statistics. `reclaimed` is measured
// after VACUUM but before `optimize` (which may add a few small stat pages) so
// it reflects the space the compaction actually freed.
export const optimizeDatabase = async (): Promise<OptimizeResult> => {
	const before = await getDatabaseSizeBytes();
	await execute("VACUUM");
	const after = await getDatabaseSizeBytes();
	await execute("PRAGMA optimize");
	return { before, after, reclaimed: Math.max(0, before - after) };
};

export interface IntegrityResult {
	ok: boolean
	messages: string[]
}

// PRAGMA integrity_check returns a single "ok" row when healthy, or one row per
// problem found. Anything other than "ok" is surfaced to the user.
export const checkDatabaseIntegrity = async (): Promise<IntegrityResult> => {
	const rows = await select<{ integrity_check: string }>("PRAGMA integrity_check");
	const messages = rows
		.map((r) => r.integrity_check)
		.filter((m): m is string => Boolean(m) && m !== "ok");
	return { ok: messages.length === 0, messages };
};
