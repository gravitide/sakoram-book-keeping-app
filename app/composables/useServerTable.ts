// Reusable server-side pagination engine for list pages running
// `ResizableDataTable` in server mode. Owns page / sort state and runs three
// scoped queries (page rows + COUNT + optional SUM) against the active tenant
// DB, debounced on filter changes and race-guarded against out-of-order
// responses (search typing fires several in flight).
//
// The page supplies a `query()` (FROM + WHERE + optional SUM expr) that
// recomputes from its filter refs, a `resolveSortColumn` allowlist, and a
// `defaultOrderBy`. The store stays a pure data/filter layer; paging is view
// state and lives here.

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
	/**
	 * ORDER BY used when no/unresolvable sort field. A function is re-read on
	 *  every fetch, so it can depend on reactive filter state (e.g. clients'
	 *  "outstanding only" toggle flipping the default sort).
	 */
	defaultOrderBy: string | (() => string)
	deps: () => unknown
	/**
	 * Optional callback fired alongside the automatic refetch when the host
	 * list page is re-activated from the `<NuxtPage keepalive>` cache. Use it
	 * to refresh page-owned derived data that isn't part of the table query —
	 * e.g. header status counts / summary stats — so they don't go stale after
	 * a row is created / deleted / edited on a detail page and the user
	 * navigates back.
	 */
	onReactivate?: () => void
	debounceMs?: number
	initialPageSize?: number
	initialSortField?: string | null
	initialSortOrder?: 1 | -1
}

// `Row` is unconstrained so concrete row interfaces (e.g. QuoteRow, which has
// no index signature) can be passed directly — matching how the list pages
// type their rows. The DB `select<Row>` accepts any shape.
export function useServerTable<Row>(opts: UseServerTableOptions) {
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
		if (!col) return typeof opts.defaultOrderBy === "function" ? opts.defaultOrderBy() : opts.defaultOrderBy;
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
		} finally {
			if (seq === requestSeq) loading.value = false;
		}
	}

	// PrimeVue page/sort events are normalised by ResizableDataTable into one
	// `request`. Store the new cursor, then fetch.
	function onRequest(e: ServerTableRequest) {
		first.value = e.first;
		pageSize.value = e.rows;
		sortField.value = e.sortField;
		sortOrder.value = e.sortOrder;
		fetchPage();
	}

	// Filter changes reset to page 1 and refetch (debounced for search typing).
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	watch(opts.deps, () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			first.value = 0;
			fetchPage();
		}, opts.debounceMs ?? 200);
	}, { deep: true });

	// Eager initial fetch (page 1), undebounced — the data is available
	// independent of whether the consuming `ResizableDataTable` is mounted
	// yet, so a page can keep the table behind a `v-if total > 0` and still
	// resolve to its empty state. Subsequent filter changes go through the
	// debounced watch above; page/sort/page-size changes go through onRequest.
	fetchPage();

	// List pages render under `<NuxtPage keepalive>` (see app.vue), so they
	// mount ONCE and are reused — navigating to a detail page and back does
	// NOT re-run the host page's setup/onMounted. Without this, a row deleted
	// / created / edited on a detail page (or the New modal) would linger in
	// the cached table until an unrelated `deps` change forced a refetch.
	// Refetch (and let the page refresh its own header stats via
	// `onReactivate`) each time the page is re-activated from the cache.
	//
	// onActivated also fires on the initial mount, which the eager fetch above
	// already covered — skip that first one to avoid a double fetch. The hook
	// is a no-op when the component isn't kept alive, so this is inert for any
	// non-keepalive consumer.
	let activatedOnce = false;
	onActivated(() => {
		if (!activatedOnce) {
			activatedOnce = true;
			return;
		}
		fetchPage();
		opts.onReactivate?.();
	});

	return {
		rows,
		total,
		sumCents,
		loading,
		first,
		pageSize,
		onRequest,
		reload: fetchPage
	};
}
