# Reusable DB-side List Pagination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in server-side pagination mode to `ResizableDataTable` + a reusable `useServerTable` engine, and convert the quotes list as the reference — leaving every other list untouched.

**Architecture:** `ResizableDataTable` flips into PrimeVue lazy mode only when given a `total` prop (absent for all current callers = zero behavior change). A `useServerTable` composable owns page/sort state and runs page + COUNT + SUM queries (debounced, race-guarded). The quotes store contributes a pure `buildQuoteWhere` + a sort-column allowlist; the quotes page wires them together.

**Tech Stack:** Nuxt 4 / Vue 3 `<script setup>`, Pinia, PrimeVue DataTable (lazy mode), `tauri-plugin-sql` (`select` from `app/lib/db.ts`), Vitest (node env, pure modules).

**Reference spec:** `docs/superpowers/specs/2026-06-16-list-pagination-engine-design.md`

---

## Task 1: Pure `buildQuoteWhere` + sort allowlist (store helpers)

**Files:**
- Modify: `app/stores/quotes.ts`
- Test: `app/stores/quotes.test.ts` (create)

These are pure free functions (no Pinia/Vue) so they unit-test in the node env.

- [ ] **Step 1: Write the failing test**

`app/stores/quotes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildQuoteWhere, resolveQuoteSortColumn } from "./quotes";

const empty = {
	search: "",
	statusFilters: [] as string[],
	clientFilter: "all" as const,
	issuedFrom: null,
	issuedTo: null,
	validFrom: null,
	validTo: null,
};

describe("buildQuoteWhere", () => {
	it("returns an empty clause when no filters are set", () => {
		expect(buildQuoteWhere(empty)).toEqual({ sql: "", params: [] });
	});

	it("builds a status IN clause with one param per status", () => {
		const r = buildQuoteWhere({ ...empty, statusFilters: ["draft", "sent"] });
		expect(r.sql).toBe("status IN (?, ?)");
		expect(r.params).toEqual(["draft", "sent"]);
	});

	it("filters by client_id only when not 'all'", () => {
		expect(buildQuoteWhere({ ...empty, clientFilter: 7 })).toEqual({
			sql: "client_id = ?",
			params: [7],
		});
	});

	it("builds inclusive date bounds for issue + valid", () => {
		const r = buildQuoteWhere({
			...empty,
			issuedFrom: "2026-01-01",
			issuedTo: "2026-03-31",
			validFrom: "2026-02-01",
			validTo: "2026-04-30",
		});
		expect(r.sql).toBe("issue_date >= ? AND issue_date <= ? AND valid_until >= ? AND valid_until <= ?");
		expect(r.params).toEqual(["2026-01-01", "2026-03-31", "2026-02-01", "2026-04-30"]);
	});

	it("builds a 3-column LIKE for search with %q% params", () => {
		const r = buildQuoteWhere({ ...empty, search: "  Acme  " });
		expect(r.sql).toBe("(LOWER(number) LIKE ? OR LOWER(project_title) LIKE ? OR LOWER(client_name) LIKE ?)");
		expect(r.params).toEqual(["%acme%", "%acme%", "%acme%"]);
	});

	it("ANDs multiple predicates and orders params to match", () => {
		const r = buildQuoteWhere({ ...empty, statusFilters: ["sent"], clientFilter: 3, search: "x" });
		expect(r.sql).toBe("status IN (?) AND client_id = ? AND (LOWER(number) LIKE ? OR LOWER(project_title) LIKE ? OR LOWER(client_name) LIKE ?)");
		expect(r.params).toEqual(["sent", 3, "%x%", "%x%", "%x%"]);
	});
});

describe("resolveQuoteSortColumn", () => {
	it("maps synthetic fields to real columns", () => {
		expect(resolveQuoteSortColumn("_client")).toBe("client_name");
		expect(resolveQuoteSortColumn("_status")).toBe("status");
	});
	it("passes real columns through", () => {
		expect(resolveQuoteSortColumn("issue_date")).toBe("issue_date");
		expect(resolveQuoteSortColumn("total_cents")).toBe("total_cents");
	});
	it("returns null for unknown / null fields", () => {
		expect(resolveQuoteSortColumn("hacky; DROP TABLE")).toBeNull();
		expect(resolveQuoteSortColumn(null)).toBeNull();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- quotes`
Expected: FAIL — `buildQuoteWhere`/`resolveQuoteSortColumn` are not exported.

- [ ] **Step 3: Add the helpers + types to `app/stores/quotes.ts`**

Near the top of the file (after the existing type imports, outside `defineStore`), add:

```ts
// --- Server-side list query helpers ------------------------------------
// `buildQuoteWhere` is a 1:1 SQL mirror of the in-memory `filtered`
// computed below. If you change one, change the other — the converted
// list page (server mode) and any client-mode consumer must agree.

export interface QuoteListFilters {
	search: string
	statusFilters: QuoteStatus[]
	clientFilter: number | "all"
	issuedFrom: string | null
	issuedTo: string | null
	validFrom: string | null
	validTo: string | null
}

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

// Synthetic list sort fields -> real columns. Anything not in here falls
// back to the default ORDER BY — this is also the SQL-injection guard:
// only allow-listed column names ever reach the ORDER BY.
export const QUOTE_SORT_COLUMNS: Record<string, string> = {
	number: "number",
	_client: "client_name",
	_status: "status",
	issue_date: "issue_date",
	valid_until: "valid_until",
	total_cents: "total_cents",
};

export function resolveQuoteSortColumn(field: string | null): string | null {
	if (!field) return null;
	return QUOTE_SORT_COLUMNS[field] ?? null;
}
```

> `QuoteStatus` and `QuoteRow` already exist in this file — reuse them. If `QuoteStatus` is declared below this insertion point, move the insertion to after its declaration (the type must be in scope).

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- quotes`
Expected: PASS (9 cases).

- [ ] **Step 5: Expose `listFilters` from the store**

Inside the store's `defineStore` setup, after the seven filter refs are declared (`search`, `statusFilters`, `clientFilter`, `issuedFrom`, `issuedTo`, `validFrom`, `validTo`) and before the `return`, add:

```ts
// Packaged filter snapshot for the server-side list query (buildQuoteWhere).
const listFilters = computed<QuoteListFilters>(() => ({
	search: search.value,
	statusFilters: statusFilters.value,
	clientFilter: clientFilter.value,
	issuedFrom: issuedFrom.value,
	issuedTo: issuedTo.value,
	validFrom: validFrom.value,
	validTo: validTo.value,
}));
```

Then add `listFilters` to the store's returned object.

- [ ] **Step 6: Lint + commit**

Run: `bun run lint`

```bash
git add app/stores/quotes.ts app/stores/quotes.test.ts
git commit -m "feat(quotes): pure buildQuoteWhere + sort allowlist + listFilters"
```

---

## Task 2: `useServerTable` engine composable

**Files:**
- Create: `app/composables/useServerTable.ts`

No unit test (it's DB glue; the pure seams are tested in Task 1). Covered by manual QA in Task 4.

- [ ] **Step 1: Write the composable**

`app/composables/useServerTable.ts`:

```ts
// Reusable server-side pagination engine for list pages running
// `ResizableDataTable` in server mode. Owns page / sort state and runs
// three scoped queries (page rows + COUNT + optional SUM) against the
// active tenant DB, debounced on filter changes and race-guarded against
// out-of-order responses (search typing fires several in flight).
//
// The page supplies a `query()` (FROM + WHERE + optional SUM expr) that
// recomputes from its filter refs, a `resolveSortColumn` allowlist, and a
// `defaultOrderBy`. The store stays a pure data/filter layer; paging is
// view state and lives here.

import { select } from "~/lib/db";

export interface ServerTableQuery {
	/** FROM clause incl. table + joins, e.g. "quotes". */
	from: string
	/** SELECT column list for page rows. Default "*". */
	columns?: string
	/** WHERE fragment (no "WHERE" keyword) + its params. Empty sql = no filter. */
	where: { sql: string, params: unknown[] }
	/** Aggregate for the summary chip, e.g. "SUM(total_cents)". Omit for none. */
	sumExpr?: string
}

export interface ServerTableRequest {
	first: number
	rows: number
	sortField: string | null
	sortOrder: 1 | -1
}

export interface UseServerTableOptions {
	query: () => ServerTableQuery
	resolveSortColumn: (field: string | null) => string | null
	defaultOrderBy: string
	deps: () => unknown
	debounceMs?: number
	initialPageSize?: number
	initialSortField?: string | null
	initialSortOrder?: 1 | -1
}

export function useServerTable<Row extends Record<string, unknown>>(opts: UseServerTableOptions) {
	const rows = ref<Row[]>([]) as Ref<Row[]>;
	const total = ref(0);
	const sumCents = ref(0);
	const loading = ref(false);

	const first = ref(0);
	const pageSize = ref(opts.initialPageSize ?? 15);
	const sortField = ref<string | null>(opts.initialSortField ?? null);
	const sortOrder = ref<1 | -1>(opts.initialSortOrder ?? -1);

	let requestSeq = 0;

	const buildOrderBy = (): string => {
		const col = opts.resolveSortColumn(sortField.value);
		if (!col) return opts.defaultOrderBy;
		return `${col} ${sortOrder.value === 1 ? "ASC" : "DESC"}`;
	};

	async function fetchPage() {
		const seq = ++requestSeq;
		loading.value = true;
		try {
			const q = opts.query();
			const cols = q.columns ?? "*";
			const whereSql = q.where.sql ? ` WHERE ${q.where.sql}` : "";
			const orderBy = buildOrderBy();

			const pagePromise = select<Row>(
				`SELECT ${cols} FROM ${q.from}${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
				[...q.where.params, pageSize.value, first.value]
			);
			const countPromise = select<{ n: number }>(
				`SELECT COUNT(*) AS n FROM ${q.from}${whereSql}`,
				q.where.params
			);
			const sumPromise = q.sumExpr
				? select<{ s: number }>(
					`SELECT COALESCE(${q.sumExpr}, 0) AS s FROM ${q.from}${whereSql}`,
					q.where.params
				)
				: Promise.resolve([{ s: 0 }]);

			const [pageRows, countRows, sumRows] = await Promise.all([pagePromise, countPromise, sumPromise]);

			// Drop stale responses — a newer fetch started after this one.
			if (seq !== requestSeq) return;

			rows.value = pageRows;
			total.value = countRows[0]?.n ?? 0;
			sumCents.value = sumRows[0]?.s ?? 0;
		}
		finally {
			if (seq === requestSeq) loading.value = false;
		}
	}

	// PrimeVue page/sort events normalised by ResizableDataTable into one
	// `request`. Store the new cursor, then fetch.
	function onRequest(e: ServerTableRequest) {
		first.value = e.first;
		pageSize.value = e.rows;
		sortField.value = e.sortField;
		sortOrder.value = e.sortOrder;
		fetchPage();
	}

	// Filter changes reset to page 1 and refetch (debounced for search).
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	watch(opts.deps, () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			first.value = 0;
			fetchPage();
		}, opts.debounceMs ?? 200);
	}, { deep: true });

	return {
		rows,
		total,
		sumCents,
		loading,
		first,
		pageSize,
		onRequest,
		reload: fetchPage,
	};
}
```

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: clean (`ref`/`watch`/`Ref`/`computed` via Nuxt auto-imports).

- [ ] **Step 3: Commit**

```bash
git add app/composables/useServerTable.ts
git commit -m "feat(table): useServerTable engine (page + count + sum, debounced, race-guarded)"
```

---

## Task 3: `ResizableDataTable` opt-in server (lazy) mode

**Files:**
- Modify: `app/components/ResizableDataTable.vue`

All changes gated on `server = props.total !== undefined`, so client mode is byte-for-byte unchanged.

- [ ] **Step 1: Add the `total` prop + `request` emit**

In the `Props` interface, add:

```ts
	// When provided, the table runs in SERVER mode: `rows` is the current
	// page only, `total` is the full DB row count, and the table emits
	// `request` whenever the user pages or sorts. Undefined (default) =
	// CLIENT mode: paginate/sort the full `rows` array in memory as before.
	total?: number
```

Add to `withDefaults`: `total: undefined`.

In `defineEmits`, add the `request` line:

```ts
	const emit = defineEmits<{
		rowClick: [row: T]
		"update:selection": [rows: T[]]
		request: [payload: { first: number, rows: number, sortField: string | null, sortOrder: 1 | -1 }]
	}>();
```

- [ ] **Step 2: Add the server-mode state + helpers in `<script setup>`**

After the `emit` declaration, add:

```ts
	// Server (lazy) mode is opt-in: a `total` prop means the parent owns the
	// data via useServerTable and we just surface PrimeVue's page/sort events.
	const server = computed(() => props.total !== undefined);

	// Controlled row offset for lazy mode. Two-way with PrimeVue's paginator.
	const lazyFirst = ref(0);

	// Normalise PrimeVue's @page / @sort event into our single `request`.
	function emitRequest(e: { first?: number, rows?: number, sortField?: string | null, sortOrder?: number | null }) {
		lazyFirst.value = e.first ?? 0;
		emit("request", {
			first: e.first ?? 0,
			rows: e.rows ?? effectiveRows.value,
			sortField: (e.sortField as string | null) ?? props.defaultSortField ?? null,
			sortOrder: (e.sortOrder === 1 ? 1 : -1),
		});
	}

	function onPage(e: { first: number, rows: number }) {
		if (server.value) emitRequest(e);
	}
	function onSort(e: { sortField: string | null, sortOrder: number | null }) {
		if (server.value) emitRequest({ ...e, first: 0, rows: effectiveRows.value });
	}

	// In server mode, a page-size change must reset to page 1 and refetch.
	watch(effectiveRows, (n) => {
		if (!server.value) return;
		emitRequest({ first: 0, rows: n, sortField: props.defaultSortField ?? null, sortOrder: props.defaultSortOrder });
	});

	// Initial page fetch on mount in server mode (client mode does nothing).
	onMounted(() => {
		if (server.value) {
			emit("request", {
				first: 0,
				rows: effectiveRows.value,
				sortField: props.defaultSortField ?? null,
				sortOrder: props.defaultSortOrder ?? -1,
			});
		}
	});
```

> `effectiveRows`, `props.defaultSortField`, `props.defaultSortOrder` are already defined in this component (page-size computed + props). This block must sit **after** the `effectiveRows` computed (around line 313) — place it just below that computed, not above. Adjust ordering if the linter flags use-before-define.

- [ ] **Step 3: Wire the DataTable template for lazy mode**

In the `<DataTable …>` opening tag, add/adjust these bindings (keep all existing ones):

```vue
			:lazy="server"
			:total-records="server ? total : undefined"
			:first="server ? lazyFirst : undefined"
			@page="onPage"
			@sort="onSort"
```

Leave `:value="rows"` as-is — in client mode it's the full array; in server mode the parent passes the current page.

- [ ] **Step 4: Lint + client-mode regression check**

Run: `bun run lint`
Then `bun run tauri:dev` and open any **unconverted** list (e.g. `/invoices` or `/bills`): paging, sorting, the Fit page-size, and row context menus must all behave exactly as before (no `total` prop → client mode).

- [ ] **Step 5: Commit**

```bash
git add app/components/ResizableDataTable.vue
git commit -m "feat(table): opt-in server (lazy) mode in ResizableDataTable via total prop"
```

---

## Task 4: Convert the quotes list page

**Files:**
- Modify: `app/pages/quotes/index.vue`

- [ ] **Step 1: Read the current page first**

Read `app/pages/quotes/index.vue` in full to locate: the `rows` computed, the `onMounted(store.load)` (or `ensureLoaded`) call, the `<ResizableDataTable>` usage, and the StatChip `filteredTotal` / "X of Y shown" wiring.

- [ ] **Step 2: Replace the data source with `useServerTable`**

In `<script setup>`, import the helpers and create the table. Replace the existing `const rows = computed(() => store.filtered)` and the mount-time `store.load()`/`ensureLoaded()` with:

```ts
	import { buildQuoteWhere, resolveQuoteSortColumn } from "~/stores/quotes";

	const table = useServerTable<QuoteRow>({
		query: () => ({
			from: "quotes",
			where: buildQuoteWhere(store.listFilters),
			sumExpr: "SUM(total_cents)",
		}),
		resolveSortColumn: resolveQuoteSortColumn,
		defaultOrderBy: "datetime(created_at) DESC",
		deps: () => store.listFilters,
		initialSortField: "issue_date",
		initialSortOrder: -1,
	});
```

> `QuoteRow` is already imported on this page (it types the columns). `store` is the existing `useQuotesStore()` instance. If the page currently also needs the full list for something else (e.g. a count), use `table.total` instead.

- [ ] **Step 3: Rebind the table in the template**

Change the `<ResizableDataTable …>` usage:

```vue
		<ResizableDataTable
			:rows="table.rows.value"
			:total="table.total.value"
			state-key="quotes-list"
			default-sort-field="issue_date"
			:default-sort-order="-1"
			:row-actions="itemsFor"
			@request="table.onRequest"
			@row-click="(row) => router.push(`/quotes/${row.id}`)"
		>
			<!-- existing <Column> children unchanged -->
		</ResizableDataTable>
```

> Keep every existing prop (`state-key`, `:row-actions`, `default-sort-*`, selection if present) and all `<Column>` children verbatim. Only add `:total` + `@request` and switch `:rows` to `table.rows.value`.

- [ ] **Step 4: Repoint the StatChip + add a loading indicator**

- Replace the in-memory `filteredTotal` sum with `formatLKR(table.sumCents.value)`.
- Replace `{{ store.filtered.length }} of {{ store.quotes.length }} shown` with a paging-aware label, e.g. `Showing {{ table.rows.value.length }} of {{ table.total.value }}`.
- Bind the existing header spinner (or add one) to `table.loading.value`.

Delete any now-unused imports/computeds (`filteredTotal`, the in-memory sum helper) if nothing else references them. Grep before deleting.

- [ ] **Step 5: Lint + manual QA**

Run: `bun run lint`
Then `bun run tauri:dev`, open `/quotes` on the demo dataset:
- Opens fast; only one page of rows loads.
- Status chips / client picker / date popover / search all refilter against the DB (search debounced) and reset to page 1.
- Sorting by Number / Client / Status / Issued / Valid / Total orders correctly across the **whole** set (not just the current page).
- Pager Next/Prev/First/Last fetch the right pages; the Fit / numeric page-size picker re-pages.
- StatChip shows the SQL-summed total; "Showing N of M" reads right.
- Row context menu + row-click nav still work.
- Cross-doc: from a client detail page, "View quotes" pre-filters `/quotes` by that client (the store `clientFilter` ref still drives `buildQuoteWhere`).

- [ ] **Step 6: Commit**

```bash
git add app/pages/quotes/index.vue
git commit -m "perf(quotes): server-side pagination via useServerTable (reference conversion)"
```

---

## Task 5: Verify, bump version, finalize

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (+ `Cargo.lock`)

- [ ] **Step 1: Full test + lint**

Run: `bun run test && bun run lint`
Expected: all green; the new `quotes` pure suite passes.

- [ ] **Step 2: Typecheck the changed files only**

Run: `bunx nuxi typecheck 2>&1 | grep -E "useServerTable|quotes/index|ResizableDataTable|stores/quotes"`
Expected: empty (the repo has pre-existing typecheck noise elsewhere — only the four changed files must be clean).

- [ ] **Step 3: Bump version (minor — new reusable capability)**

`0.114.3` → `0.115.0`. Edit all three:
- `package.json` → `"version": "0.115.0"`
- `src-tauri/Cargo.toml` → `version = "0.115.0"`
- `src-tauri/tauri.conf.json` → `"version": "0.115.0"`

Refresh the lock:

```bash
cd src-tauri && cargo update -p sakoram_billing --precise 0.115.0 2>/dev/null; cd ..
```

(If the dev build holds the lock, edit the `sakoram_billing` version line in `Cargo.lock` by hand.)

- [ ] **Step 4: Commit the bump + plan doc**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock docs/superpowers/plans/2026-06-16-list-pagination-engine.md
git commit -m "chore: bump version to 0.115.0 + list-pagination plan"
```

- [ ] **Step 5: Push, stop for confirmation**

```bash
git push -u origin perf/list-pagination-engine
```

Summarise what shipped and **wait for explicit "open the PR"** before `gh pr create`.

---

## Self-review notes (author)

- **Spec coverage:** §1 ResizableDataTable opt-in → Task 3; §2 useServerTable → Task 2; §3 buildQuoteWhere + allowlist + listFilters → Task 1; §4 quotes page → Task 4; §5 tests → Task 1. Risks (two-sources-of-truth, sort trust, debounce, first-overshoot, Fit) addressed in the relevant tasks.
- **Backward compat:** `total` defaults to `undefined`; all server-mode wiring is gated on `server`. No existing caller passes `total`, so client mode is unchanged — Task 3 Step 4 regression check enforces it.
- **Type consistency:** `ServerTableRequest` `{ first, rows, sortField, sortOrder }` matches the `request` emit payload in Task 3 and `onRequest` in Task 2. `QuoteListFilters` shape is identical in Task 1's helper, store `listFilters`, and the page `query()`. `resolveQuoteSortColumn` signature matches `resolveSortColumn` in `UseServerTableOptions`.
- **Placeholder scan:** none — every step has concrete code or a concrete grep/QA action.
