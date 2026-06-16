# Reusable DB-side List Pagination — Design

**Date**: 2026-06-16
**Branch**: `perf/list-pagination-engine`
**Roadmap tier**: Performance / deferred-items ("DB-side pagination"). Follows the calendar-windowing slice (PR #250). This is the general, reusable engine + the quotes reference conversion.

---

## Goal

Build a **reusable, opt-in** server-side pagination capability into `ResizableDataTable` so any list page can page / sort / filter against the DB instead of loading every row and doing it in memory. Convert the **quotes** list as the reference implementation; leave every other list untouched and working.

Today every list page calls `store.load()` (`SELECT * FROM <table>`) and binds `:rows="store.filtered"` — PrimeVue paginates/sorts/filters the full in-memory array. Fine at low-thousands; the goal is to make the *mechanism* exist and prove it on one page so future lists (and large tenants) can adopt it incrementally.

## Non-goals (v1)

- Converting the other six list pages (clients, vendors, employees, categories, bills, vouchers, payslips, invoices). They stay client-side, unchanged.
- **Derived-status lists** (invoices / bills / payslips). Their user-facing `unpaid / partial / paid / overdue` filters are computed in JS from summed payment vouchers + due date — not a column. SQL-side filtering on those needs a voucher-join `buildWhere`, a deliberate follow-up. Quotes filters on **persisted** status only, which is why it's the clean reference.
- Removing the quotes store's `load()` / `quotes` / `filtered`. Kept intact for backward-compat (other consumers, and as the client-mode fallback shape).
- Global search across tables, server-side column-width persistence, virtual scroll. Out of scope.

---

## Architecture

### Opt-in via a `total` prop — the backward-compat hinge

`ResizableDataTable` flips between two modes based on whether the parent supplies a `total` prop:

- **Client mode** (`total` undefined — today's behavior, all current callers): `:value="rows"` is the full array; PrimeVue does paging / sorting / the page-size picker in memory. **Zero change** for the six unconverted lists.
- **Server mode** (`total` is a number): PrimeVue lazy mode. `rows` becomes *the current page only*; the component emits a `request` event whenever the user pages or sorts, and the parent (through `useServerTable`) runs the query and feeds back the next page + new `total`.

This is the central safety property: no existing caller passes `total`, so nothing changes for them.

### PrimeVue lazy mode mechanics

In lazy mode PrimeVue does **not** slice `:value` — it renders exactly the rows given and uses `:totalRecords` to draw the paginator. The controlled bits:

```
:lazy="true"
:value="rows"            // current page rows only
:total-records="total"   // DB COUNT
:first="first"           // controlled row offset (two-way via @page)
@page="onLazyRequest"
@sort="onLazyRequest"
```

`@page` / `@sort` both carry `{ first, rows, sortField, sortOrder }`; we normalise them into one `request` emit.

---

## Components & files

### 1. `app/components/ResizableDataTable.vue` — opt-in lazy mode

New prop:

```ts
// When provided, the table runs in SERVER mode: `rows` is the current
// page only, `total` is the full DB row count, and the component emits
// `request` whenever the user pages or sorts so the parent can fetch the
// next page. When undefined (default), the table stays in CLIENT mode and
// paginates/sorts the full `rows` array in memory exactly as before.
total?: number
```

New emit:

```ts
request: [payload: { first: number; rows: number; sortField: string | null; sortOrder: 1 | -1 }]
```

Template changes (all gated on `server` = `props.total !== undefined`):

- `:lazy="server"`
- `:total-records="server ? total : undefined"` (client mode lets PrimeVue derive it from `rows.length`)
- `:first` controlled in server mode (a local `first` ref synced from the `request` payload); untouched in client mode.
- `@page` / `@sort` → emit normalised `request` **only in server mode**.
- The **page-size picker**: `effectiveRows` already drives `:rows`. In server mode, a `pageSizeChoice` change must also emit a `request` (reset to first page). Add a `watch(effectiveRows)` that, in server mode, fires a `request` with `first: 0`.
- The **localStorage `first`/`rows` stripping** block: keep for client mode. In server mode `first` is controlled and PrimeVue's state-restore for `first`/`rows` is already stripped — no conflict. Sort persistence (`sortField`/`sortOrder` in PrimeVue state) is harmless to keep; the initial `request` reads them via the `@sort`/mount path (see "Initial load").

**Initial load:** on mount in server mode, emit one `request` with the current `first` (0), `effectiveRows`, and `defaultSortField`/`defaultSortOrder` so the parent fetches page 1 without the user touching anything. (Client mode does nothing extra on mount.)

> The drag-to-scroll, context menu, selection column, row-click-first-cell, and `autoFit()` all work identically in both modes — they operate on whatever rows are rendered.

### 2. `app/composables/useServerTable.ts` — the engine

```ts
export interface ServerTableQuery {
  /** FROM clause incl. table + any joins. e.g. "quotes". */
  from: string
  /** SELECT column list for page rows. e.g. "*". */
  columns?: string            // default "*"
  /** WHERE fragment (without the "WHERE" keyword) + its params. Empty sql = no filter. */
  where: { sql: string; params: unknown[] }
  /** Optional aggregate expression for the StatChip total, e.g. "SUM(total_cents)". */
  sumExpr?: string
}

export interface UseServerTableOptions<Row> {
  /** Recomputes whenever a filter ref changes — drives refetch. */
  query: () => ServerTableQuery
  /** Maps a (possibly synthetic) sort field to a real column; returns null to fall back to default. */
  resolveSortColumn: (field: string | null) => string | null
  /** Default ORDER BY when no/!resolvable sort field. e.g. "datetime(created_at) DESC". */
  defaultOrderBy: string
  /** Reactive deps that should trigger a refetch (filter refs, search). */
  deps: () => unknown
  /** Debounce ms for refetch (search typing). Default 200. */
  debounceMs?: number
}
```

Returns:

```ts
{
  rows: Ref<Row[]>          // current page
  total: Ref<number>        // COUNT(*) over the filter
  sumCents: Ref<number>     // SUM(sumExpr) over the filter (0 if no sumExpr)
  loading: Ref<boolean>
  first: Ref<number>        // current offset (for the StatChip "showing" math)
  pageSize: Ref<number>
  onRequest: (e: { first: number; rows: number; sortField: string | null; sortOrder: 1 | -1 }) => void
}
```

Behavior:

- `onRequest` stores `first` / `pageSize` / sort, then fetches.
- A `watch(deps, …)` (debounced) **resets `first` to 0** and refetches — a filter change should land you on page 1.
- `fetchPage()` assembles and runs, in parallel:
  - `SELECT <columns> FROM <from> [WHERE <sql>] ORDER BY <orderBy> LIMIT ? OFFSET ?` (params: `...where.params, pageSize, first`)
  - `SELECT COUNT(*) AS n FROM <from> [WHERE <sql>]` (params: `where.params`)
  - if `sumExpr`: `SELECT COALESCE(<sumExpr>, 0) AS s FROM <from> [WHERE <sql>]`
- `orderBy` = `resolveSortColumn(sortField)` + direction (`ASC`/`DESC`), else `defaultOrderBy`.
- Race guard: a monotonically-increasing request id; ignore a resolved fetch if a newer one started (search typing fires several).
- Uses the `select` helper from `~/lib/db`.

> **Why a composable, not store methods:** the page/sort/loading state is view state, not domain state; keeping it in a composable means each list page owns its own paging cursor and the store stays a pure data/filter layer. The store contributes only the pure `buildWhere` + sort allowlist.

### 3. `app/stores/quotes.ts` — pure `buildWhere` + sort allowlist

Add two pure, exported helpers (testable, no Pinia/Vue needed if written as free functions taking the filter values):

```ts
export interface QuoteListFilters {
  search: string
  statusFilters: QuoteStatus[]
  clientFilter: number | "all"
  issuedFrom: string | null
  issuedTo: string | null
  validFrom: string | null
  validTo: string | null
}

// Mirrors the existing `filtered` computed, 1:1, as SQL.
export function buildQuoteWhere(f: QuoteListFilters): { sql: string; params: unknown[] }

// Synthetic list sort fields -> real columns. null = use default order.
export const QUOTE_SORT_COLUMNS: Record<string, string>  // { number, _client: "client_name", _status: "status", issue_date, valid_until, total_cents }
export function resolveQuoteSortColumn(field: string | null): string | null
```

`buildQuoteWhere` predicates (exact mirror of `filtered`):

| Filter | SQL |
|---|---|
| `statusFilters.length > 0` | `status IN (?, ?, …)` |
| `clientFilter !== "all"` | `client_id = ?` |
| `issuedFrom` | `issue_date >= ?` |
| `issuedTo` | `issue_date <= ?` |
| `validFrom` | `valid_until >= ?` |
| `validTo` | `valid_until <= ?` |
| `search` (trimmed, non-empty) | `(LOWER(number) LIKE ? OR LOWER(project_title) LIKE ? OR LOWER(client_name) LIKE ?)` with `%q%` ×3 |

Joined with ` AND `. All columns exist and are indexed (`status`, `client_id`, `issue_date`, `valid_until`, denormalized `client_name` from migration 0028).

The store keeps `search`, `statusFilters`, `clientFilter`, `issued*`, `valid*` refs exactly where they are (cross-doc navigation sets them). It additionally exposes `listFilters` (a computed packaging the seven values into `QuoteListFilters`) for the page to feed into `buildQuoteWhere`.

### 4. `app/pages/quotes/index.vue` — reference conversion

- Replace `const rows = computed(() => store.filtered)` + `onMounted(store.load)` with a `useServerTable` instance:

```ts
const table = useServerTable<QuoteRow>({
  query: () => ({
    from: "quotes",
    where: buildQuoteWhere(store.listFilters),
    sumExpr: "SUM(total_cents)",
  }),
  resolveSortColumn: resolveQuoteSortColumn,
  defaultOrderBy: "datetime(created_at) DESC",
  deps: () => store.listFilters,           // refetch when any filter changes
});
```

- Template: `<ResizableDataTable :rows="table.rows.value" :total="table.total.value" @request="table.onRequest" default-sort-field="issue_date" :default-sort-order="-1" … >`.
- StatChip: total = `formatLKR(table.sumCents.value)`; "X of Y shown" → `Y = table.total.value`, X = `table.rows.value.length` (current page) — wording adjusted to "Showing N of Y" since with paging "X of Y shown" loses meaning. Keep the `TOTAL · Rs N` sum chip.
- The filter strip / status chips / client picker / date popover all stay — they bind the same store refs; their changes flow through `deps` → refetch.
- A `loading` indicator (reuse the spinner-in-header pattern) bound to `table.loading.value`.

> The quotes store's `load()` / `quotes` / `filtered` are **not** removed — left for any other consumer and as documentation of the client-mode shape.

### 5. Tests

`app/stores/quotes.test.ts` (new) — pure, node env:

- `buildQuoteWhere`: empty filters → `{ sql: "", params: [] }`; each predicate individually (status IN with N params, client_id, each date bound, search → 3 LIKE params with `%q%`); combined → ANDed sql + ordered params.
- `resolveQuoteSortColumn`: `_client → client_name`, `_status → status`, real columns pass through, unknown → null.

(`useServerTable`'s SQL assembly is integration-tested via manual QA; its only pure-testable seam is the ORDER BY building, which can be a small exported helper if we want — optional.)

---

## Risks / call-outs

- **Two sources of truth for filtering (SQL `buildQuoteWhere` vs JS `filtered`).** They must stay in lock-step or the converted page disagrees with the old one. Mitigation: `buildQuoteWhere` is a literal table-driven mirror of `filtered`, unit-tested predicate-by-predicate; a comment in each points at the other.
- **Sort field trust.** Never interpolate the raw PrimeVue `sortField` into SQL — only emit columns from the allowlist (`resolveQuoteSortColumn`), default otherwise. This is both correctness (synthetic `_client`) and injection safety.
- **Search debounce.** Each keystroke triggers a refetch; 200 ms debounce + the race-id guard keep it from hammering / racing.
- **`first` overshoot.** If a filter change shrinks `total` below the current `first`, the page query returns empty. The `deps` watch resets `first` to 0 on any filter change, so this only matters for the rare page-then-filter; PrimeVue also clamps. Acceptable; reset-to-0 covers it.
- **Page-size "Fit".** Works unchanged — it's just the `LIMIT`. Switching it resets to page 1 (emit `request` with `first: 0`).

## Files touched

- `app/components/ResizableDataTable.vue` — add `total` prop + `request` emit + lazy-mode wiring + initial-load + page-size-change emit (all gated on server mode).
- `app/composables/useServerTable.ts` — new engine composable.
- `app/stores/quotes.ts` — add `buildQuoteWhere`, `QUOTE_SORT_COLUMNS`/`resolveQuoteSortColumn`, `listFilters` computed.
- `app/pages/quotes/index.vue` — convert to `useServerTable`.
- `app/stores/quotes.test.ts` — new pure tests.
