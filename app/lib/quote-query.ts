// Pure SQL-query helpers for the server-paginated quotes list.
//
// Kept Vue-free and Tauri-free so it's unit-testable in the node vitest env
// (importing the quotes store would drag in `~/lib/db` and the Tauri plugin
// chain). `buildQuoteWhere` is a 1:1 SQL mirror of the in-memory `filtered`
// computed in `app/stores/quotes.ts` — if you change one, change the other.

export interface QuoteListFilters {
	search: string
	/** Persisted quote statuses to include. Empty = all. */
	statusFilters: string[]
	clientFilter: number | "all"
	issuedFrom: string | null
	issuedTo: string | null
	validFrom: string | null
	validTo: string | null
}

/**
 * Build the WHERE fragment (without the `WHERE` keyword) + its bound params
 * for the quotes list query. Empty `sql` means no filter is active.
 */
export function buildQuoteWhere(f: QuoteListFilters): { sql: string, params: unknown[] } {
	const clauses: string[] = [];
	const params: unknown[] = [];

	if (f.statusFilters.length > 0) {
		clauses.push(`status IN (${f.statusFilters.map(() => "?").join(", ")})`);
		params.push(...f.statusFilters);
	}
	if (f.clientFilter !== "all") {
		clauses.push("client_id = ?");
		params.push(f.clientFilter);
	}
	if (f.issuedFrom) {
		clauses.push("issue_date >= ?");
		params.push(f.issuedFrom);
	}
	if (f.issuedTo) {
		clauses.push("issue_date <= ?");
		params.push(f.issuedTo);
	}
	if (f.validFrom) {
		clauses.push("valid_until >= ?");
		params.push(f.validFrom);
	}
	if (f.validTo) {
		clauses.push("valid_until <= ?");
		params.push(f.validTo);
	}
	const q = f.search.trim().toLowerCase();
	if (q) {
		clauses.push("(LOWER(number) LIKE ? OR LOWER(project_title) LIKE ? OR LOWER(client_name) LIKE ?)");
		const like = `%${q}%`;
		params.push(like, like, like);
	}

	return { sql: clauses.join(" AND "), params };
}

// Sortable list columns -> the real DB column to ORDER BY. The quotes list
// columns bind real field names (client_name / status / project_title are all
// columns post-migration 0028), so this is mostly an identity map — but it
// doubles as the SQL-injection guard: only allow-listed names ever reach the
// ORDER BY clause; anything else falls back to the default order.
export const QUOTE_SORT_COLUMNS: Record<string, string> = {
	number: "number",
	client_name: "client_name",
	project_title: "project_title",
	issue_date: "issue_date",
	valid_until: "valid_until",
	total_cents: "total_cents",
	status: "status"
};

export function resolveQuoteSortColumn(field: string | null): string | null {
	if (!field) return null;
	return QUOTE_SORT_COLUMNS[field] ?? null;
}
