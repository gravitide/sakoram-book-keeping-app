// Thin SQLite wrapper, multi-tenant aware.
//
// The DB URL is resolved lazily from the tenants store: every getDb()
// call asks the active tenant for its DB URL, opens once, and caches.
// When the user switches business, we close the cached connection and
// reset the cache so the next call opens the new tenant's DB.
//
// Why a connection POOL caveat still applies: tauri-plugin-sql uses a
// pool under the hood, so we cannot run "BEGIN; ...; COMMIT" from JS —
// sequential execute() calls may land on different pool connections.
// Every atomic operation must therefore be expressible as a SINGLE
// statement (e.g. `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`
// for our gapless document counter).

import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;
let currentUrl: string | null = null;

/// Internal — the tenants store calls this when switching active tenant
/// so the next getDb() opens the new DB.
export const resetDbCache = async (): Promise<void> => {
	if (dbPromise) {
		try {
			const db = await dbPromise;
			await db.close();
		} catch { /* best-effort */ }
	}
	dbPromise = null;
	currentUrl = null;
};

export const getDb = async (): Promise<Database> => {
	const tenants = useTenantsStore();
	const url = tenants.dbUrl;
	if (!url) {
		throw new Error("No active business — pick one on the welcome screen first.");
	}
	if (dbPromise && currentUrl === url) return dbPromise;
	if (dbPromise) await resetDbCache();
	currentUrl = url;
	dbPromise = Database.load(url);
	return dbPromise;
};

export const select = async <T = unknown>(
	sql: string,
	params: unknown[] = []
): Promise<T[]> => {
	const db = await getDb();
	return db.select<T[]>(sql, params);
};

export const selectOne = async <T = unknown>(
	sql: string,
	params: unknown[] = []
): Promise<T | null> => {
	const rows = await select<T>(sql, params);
	return rows[0] ?? null;
};

export interface ExecuteResult {
	rowsAffected: number
	lastInsertId?: number
}

export const execute = async (
	sql: string,
	params: unknown[] = []
): Promise<ExecuteResult> => {
	const db = await getDb();
	const r = await db.execute(sql, params);
	return {
		rowsAffected: r.rowsAffected,
		lastInsertId: typeof r.lastInsertId === "number" ? r.lastInsertId : undefined
	};
};
