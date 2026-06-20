// Generic SQL-fragment helpers for server-paginated list pages.
//
// Vue-free and Tauri-free so they're unit-testable in the node vitest env.
// Each list page composes its WHERE from these instead of hand-rolling a
// bespoke buildWhere — the quotes page predates this and keeps its own
// `buildQuoteWhere`, but every list converted after uses these.

export interface SqlFragment {
	sql: string
	params: unknown[]
}

/**
 * Case-insensitive substring search across several columns, OR-ed together:
 *   (LOWER(col1) LIKE ? OR LOWER(col2) LIKE ? ...)
 * Returns an empty fragment when the (trimmed) search is blank.
 */
export function likeClause(search: string, columns: string[]): SqlFragment {
	const q = search.trim().toLowerCase();
	if (!q || columns.length === 0) return { sql: "", params: [] };
	const like = `%${q}%`;
	const sql = `(${columns.map((c) => `LOWER(${c}) LIKE ?`).join(" OR ")})`;
	return { sql, params: columns.map(() => like) };
}

/**
 * AND together a list of fragments, dropping the empty ones, and concatenating
 * their params in clause order. An all-empty input yields `{ sql: "", params: [] }`.
 */
export function andClauses(parts: SqlFragment[]): SqlFragment {
	const active = parts.filter((p) => p.sql);
	return {
		sql: active.map((p) => p.sql).join(" AND "),
		params: active.flatMap((p) => p.params)
	};
}

/**
 * `column IN (?, ?, ...)` for a multi-select filter. Empty values = no filter
 * (an empty fragment), matching the list-page convention that an empty filter
 * set means "show everything".
 */
export function inClause(column: string, values: Array<string | number>): SqlFragment {
	if (values.length === 0) return { sql: "", params: [] };
	return { sql: `${column} IN (${values.map(() => "?").join(", ")})`, params: [...values] };
}

/**
 * `column = ?` for a single-select FK filter that uses the `"all"` sentinel
 * for "no narrowing" (and treats null the same). Anything else binds as-is.
 */
export function eqClause(column: string, value: number | "all" | null): SqlFragment {
	if (value === "all" || value === null) return { sql: "", params: [] };
	return { sql: `${column} = ?`, params: [value] };
}

/**
 * Inclusive bounds: `column >= ? AND column <= ?`, each side optional
 * (null = unbounded). Both null = empty fragment.
 */
export function rangeClause(column: string, from: string | null, to: string | null): SqlFragment {
	const parts: SqlFragment[] = [];
	if (from) parts.push({ sql: `${column} >= ?`, params: [from] });
	if (to) parts.push({ sql: `${column} <= ?`, params: [to] });
	return andClauses(parts);
}

/**
 * Build a sort-field resolver from an allow-list. Pass either:
 *   - a `string[]` of column names (each maps to itself), or
 *   - a `Record<field, expression>` when the ORDER-BY expression differs from
 *     the field name (e.g. `{ name: "name COLLATE NOCASE" }` for a
 *     case-insensitive text sort).
 * Returns the resolved expression when allow-listed, else null (caller falls
 * back to its default ORDER BY). This is the SQL-injection guard for
 * `ORDER BY`: only allow-listed entries can ever reach the query.
 */
export function makeSortResolver(
	columns: string[] | Record<string, string>
): (field: string | null) => string | null {
	if (Array.isArray(columns)) {
		const set = new Set(columns);
		return (field: string | null) => (field && set.has(field) ? field : null);
	}
	return (field: string | null) => (field ? columns[field] ?? null : null);
}
