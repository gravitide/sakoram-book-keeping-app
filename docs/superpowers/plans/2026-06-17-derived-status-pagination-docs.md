# Derived-status Pagination (PR-A: invoices / bills / payslips) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Server-paginate the invoices, bills, and payslips lists, whose status/sum/sort depend on voucher-derived state, by wrapping each base table in a derived-status subquery and feeding it to the existing `useServerTable`.

**Architecture:** A new pure `app/lib/derived-status.ts` owns (a) `deriveX` status functions — the three stores' `derivedStatus` is refactored to call them — and (b) `xDerivedFrom(today)` builders that return a `(SELECT … LEFT JOIN grouped-voucher-sum …) sub` FROM clause exposing `_paid`, `_balance`, `_status`. Pages filter/sort/sum on those aliases via `useServerTable`. `today` is inlined as a literal.

**Tech Stack:** Nuxt 4 / Vue 3, Pinia, `tauri-plugin-sql` (`select` from `app/lib/db.ts`), Vitest (node, pure modules). Reuses `app/lib/list-query.ts` + `app/composables/useServerTable.ts`.

**Reference spec:** `docs/superpowers/specs/2026-06-17-derived-status-pagination-design.md`
**Reference conversions:** quotes (`app/pages/quotes/index.vue`), credit-notes (`app/pages/credit-notes/index.vue`).

---

## Task 1: `app/lib/derived-status.ts` — pure derivation + SQL FROM builders

**Files:** Create `app/lib/derived-status.ts`, `app/lib/derived-status.test.ts`.

- [ ] **Step 1: Write the failing test**

`app/lib/derived-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	billDerivedFrom,
	deriveBillStatus,
	deriveInvoiceStatus,
	derivePayslipStatus,
	invoiceDerivedFrom,
	payslipDerivedFrom,
} from "./derived-status";

const TODAY = "2026-06-16";

describe("deriveInvoiceStatus", () => {
	it("honours persisted draft/cancelled first", () => {
		expect(deriveInvoiceStatus("draft", 0, 1000, "2020-01-01", TODAY)).toBe("draft");
		expect(deriveInvoiceStatus("cancelled", 0, 1000, "2020-01-01", TODAY)).toBe("cancelled");
	});
	it("paid beats overdue beats partial beats sent (precedence)", () => {
		expect(deriveInvoiceStatus("sent", 1000, 1000, "2020-01-01", TODAY)).toBe("paid"); // fully paid even if past due
		expect(deriveInvoiceStatus("sent", 400, 1000, "2020-01-01", TODAY)).toBe("overdue"); // partly paid + past due
		expect(deriveInvoiceStatus("sent", 400, 1000, "2030-01-01", TODAY)).toBe("partial"); // partly paid, not due
		expect(deriveInvoiceStatus("sent", 0, 1000, "2020-01-01", TODAY)).toBe("overdue"); // unpaid + past due
		expect(deriveInvoiceStatus("sent", 0, 1000, "2030-01-01", TODAY)).toBe("sent"); // unpaid, not due
	});
	it("zero-total never reads as paid", () => {
		expect(deriveInvoiceStatus("sent", 0, 0, "2030-01-01", TODAY)).toBe("sent");
	});
});

describe("deriveBillStatus", () => {
	it("mirrors invoices minus the draft state", () => {
		expect(deriveBillStatus("cancelled", 0, 1000, "2020-01-01", TODAY)).toBe("cancelled");
		expect(deriveBillStatus("open", 1000, 1000, "2020-01-01", TODAY)).toBe("paid");
		expect(deriveBillStatus("open", 400, 1000, "2020-01-01", TODAY)).toBe("overdue");
		expect(deriveBillStatus("open", 400, 1000, "2030-01-01", TODAY)).toBe("partial");
		expect(deriveBillStatus("open", 0, 1000, "2030-01-01", TODAY)).toBe("unpaid");
	});
});

describe("derivePayslipStatus", () => {
	it("has no overdue concept", () => {
		expect(derivePayslipStatus("cancelled", 0, 1000)).toBe("cancelled");
		expect(derivePayslipStatus("draft", 0, 1000)).toBe("draft");
		expect(derivePayslipStatus("issued", 1000, 1000)).toBe("paid");
		expect(derivePayslipStatus("issued", 400, 1000)).toBe("partial");
		expect(derivePayslipStatus("issued", 0, 1000)).toBe("unpaid");
	});
});

describe("FROM builders", () => {
	it("invoice FROM exposes _paid/_balance/_status and inlines today", () => {
		const sql = invoiceDerivedFrom(TODAY);
		expect(sql).toContain("AS _paid");
		expect(sql).toContain("AS _balance");
		expect(sql).toContain("AS _status");
		expect(sql).toContain(`i.due_date < '${TODAY}'`);
		expect(sql).toContain("FROM invoices i");
		expect(sql).toContain("voucher_type = 'receipt'");
		expect(sql.trim().endsWith(") sub")).toBe(true);
	});
	it("bill FROM uses payment vouchers and has no draft branch", () => {
		const sql = billDerivedFrom(TODAY);
		expect(sql).toContain("FROM bills b");
		expect(sql).toContain("voucher_type = 'payment'");
		expect(sql).not.toContain("'draft'");
	});
	it("payslip FROM has no overdue/due_date branch", () => {
		const sql = payslipDerivedFrom(TODAY);
		expect(sql).toContain("FROM payslips p");
		expect(sql).not.toContain("overdue");
		expect(sql).not.toContain("due_date");
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- derived-status`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

`app/lib/derived-status.ts`:

```ts
// Single source of truth for voucher-derived document status, in two forms:
//   1. Pure `deriveX` functions — the stores' `derivedStatus` calls these.
//   2. `xDerivedFrom(today)` builders — a SQL FROM subquery exposing
//      `_paid` / `_balance` / `_status` so the server-paginated list pages can
//      filter / sort / sum on derived state via `useServerTable`.
//
// The SQL CASE in each builder MUST mirror the matching pure function exactly,
// including precedence. `today` is inlined as a literal (our own value, never
// user input) to avoid a param-ordering issue in the FROM subquery.

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
export type BillStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled";
export type PayslipStatus = "draft" | "unpaid" | "partial" | "paid" | "cancelled";

export function deriveInvoiceStatus(
	persisted: "draft" | "sent" | "cancelled",
	paid: number,
	total: number,
	dueDate: string,
	today: string
): InvoiceStatus {
	if (persisted === "draft") return "draft";
	if (persisted === "cancelled") return "cancelled";
	if (paid >= total && total > 0) return "paid";
	if (dueDate < today) return "overdue";
	if (paid > 0) return "partial";
	return "sent";
}

export function deriveBillStatus(
	persisted: "open" | "cancelled",
	paid: number,
	total: number,
	dueDate: string,
	today: string
): BillStatus {
	if (persisted === "cancelled") return "cancelled";
	if (paid >= total && total > 0) return "paid";
	if (dueDate < today) return "overdue";
	if (paid > 0) return "partial";
	return "unpaid";
}

export function derivePayslipStatus(
	persisted: "draft" | "issued" | "cancelled",
	paid: number,
	net: number
): PayslipStatus {
	if (persisted === "cancelled") return "cancelled";
	if (persisted === "draft") return "draft";
	if (paid >= net && net > 0) return "paid";
	if (paid > 0) return "partial";
	return "unpaid";
}

// --- SQL FROM builders -------------------------------------------------
// Each LEFT JOINs a single grouped voucher-sum (runs once, not per-row), so
// `COALESCE(vp.paid, 0)` is a cheap column reference wherever it repeats.

function paidJoin(table: "vouchers", fk: string, type: "receipt" | "payment"): string {
	return `LEFT JOIN (SELECT ${fk}, SUM(amount_cents) AS paid FROM ${table} `
		+ `WHERE voucher_type = '${type}' AND ${fk} IS NOT NULL GROUP BY ${fk}) vp ON vp.${fk} = `;
}

export function invoiceDerivedFrom(today: string): string {
	const paid = "COALESCE(vp.paid, 0)";
	return `(SELECT i.*, ${paid} AS _paid, (i.total_cents - ${paid}) AS _balance, `
		+ `CASE WHEN i.status = 'draft' THEN 'draft' `
		+ `WHEN i.status = 'cancelled' THEN 'cancelled' `
		+ `WHEN ${paid} >= i.total_cents AND i.total_cents > 0 THEN 'paid' `
		+ `WHEN i.due_date < '${today}' THEN 'overdue' `
		+ `WHEN ${paid} > 0 THEN 'partial' ELSE 'sent' END AS _status `
		+ `FROM invoices i ${paidJoin("vouchers", "related_invoice_id", "receipt")}i.id) sub`;
}

export function billDerivedFrom(today: string): string {
	const paid = "COALESCE(vp.paid, 0)";
	return `(SELECT b.*, ${paid} AS _paid, (b.total_cents - ${paid}) AS _balance, `
		+ `CASE WHEN b.status = 'cancelled' THEN 'cancelled' `
		+ `WHEN ${paid} >= b.total_cents AND b.total_cents > 0 THEN 'paid' `
		+ `WHEN b.due_date < '${today}' THEN 'overdue' `
		+ `WHEN ${paid} > 0 THEN 'partial' ELSE 'unpaid' END AS _status `
		+ `FROM bills b ${paidJoin("vouchers", "related_bill_id", "payment")}b.id) sub`;
}

export function payslipDerivedFrom(_today: string): string {
	const paid = "COALESCE(vp.paid, 0)";
	return `(SELECT p.*, ${paid} AS _paid, (p.net_cents - ${paid}) AS _balance, `
		+ `CASE WHEN p.status = 'cancelled' THEN 'cancelled' `
		+ `WHEN p.status = 'draft' THEN 'draft' `
		+ `WHEN ${paid} >= p.net_cents AND p.net_cents > 0 THEN 'paid' `
		+ `WHEN ${paid} > 0 THEN 'partial' ELSE 'unpaid' END AS _status `
		+ `FROM payslips p ${paidJoin("vouchers", "related_payslip_id", "payment")}p.id) sub`;
}
```

> `payslipDerivedFrom` takes `_today` (unused) so all three builders share one signature for the page code; eslint may want it prefixed `_` (already done) or the arg dropped — match the linter.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- derived-status`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/derived-status.ts app/lib/derived-status.test.ts
git commit -m "feat(lib): derived-status pure fns + SQL FROM builders (invoices/bills/payslips)"
```

---

## Task 2: Refactor stores to the pure fns + add listFilters / fetchHeaderStats

**Files:** Modify `app/stores/invoices.ts`, `app/stores/bills.ts`, `app/stores/payslips.ts`.

For each store:

- [ ] **Step 1: Point `derivedStatus` at the pure fn**

invoices.ts — replace the body of `derivedStatus`:

```ts
import { deriveInvoiceStatus } from "~/lib/derived-status";
// …
const derivedStatus = (inv: InvoiceRow, now: string = todayISO()): InvoiceStatus =>
	deriveInvoiceStatus(inv.status, paidCentsFor(inv.id), inv.total_cents, inv.due_date, now);
```

bills.ts:

```ts
import { deriveBillStatus } from "~/lib/derived-status";
const derivedStatus = (bill: BillRow, now: string = todayISO()): BillStatus =>
	deriveBillStatus(bill.status, paidCentsFor(bill.id), bill.total_cents, bill.due_date, now);
```

payslips.ts:

```ts
import { derivePayslipStatus } from "~/lib/derived-status";
const derivedStatus = (row: PayslipRow): PayslipStatus =>
	derivePayslipStatus(row.status, paidCentsFor(row.id), row.net_cents);
```

> Keep each store's existing `InvoiceStatus`/`BillStatus`/`PayslipStatus` exported type. If they're structurally identical to the lib's, re-export the lib type or leave the store's local type (the pure fn's return type is assignable). Pick whichever keeps existing imports working; verify with `bun run lint`.

- [ ] **Step 2: Add `listFilters` + `fetchHeaderStats`**

invoices.ts (place near the existing filter refs / `outstandingTotal`):

```ts
const listFilters = computed(() => ({
	search: search.value,
	statusFilters: statusFilters.value,
	clientFilter: clientFilter.value,
	issuedFrom: issuedFrom.value,
	issuedTo: issuedTo.value,
	dueFrom: dueFrom.value,
	dueTo: dueTo.value,
}));

// Grand total count + global outstanding (matches outstandingTotal) in one
// wrapped query, so the paginated page needn't load every row.
const fetchHeaderStats = async (): Promise<{ total: number, outstandingCents: number }> => {
	const today = todayISO();
	const rows = await select<{ total: number, outstanding: number }>(
		`SELECT COUNT(*) AS total,
		        COALESCE(SUM(CASE WHEN _status IN ('sent','partial','overdue') THEN _balance ELSE 0 END), 0) AS outstanding
		 FROM ${invoiceDerivedFrom(today)}`
	);
	return { total: rows[0]?.total ?? 0, outstandingCents: rows[0]?.outstanding ?? 0 };
};
```

Import `invoiceDerivedFrom` from `~/lib/derived-status`. Add both to the store's return.

bills.ts — same shape; `listFilters` carries `{ search, statusFilters, vendorFilter, categoryFilter, issuedFrom, issuedTo, dueFrom, dueTo }`; `fetchHeaderStats` uses `billDerivedFrom(today)` and `_status IN ('unpaid','partial','overdue')`.

payslips.ts — `listFilters` carries `{ search, statusFilters, employeeFilter, periodFrom, periodTo }`; `fetchHeaderStats` uses `payslipDerivedFrom(today)` and `_status IN ('unpaid','partial')`.

- [ ] **Step 3: Lint + commit**

Run: `bun run lint && bun run test`
Expected: green (the store change keeps all existing `derivedStatus` callers working; tests unchanged).

```bash
git add app/stores/invoices.ts app/stores/bills.ts app/stores/payslips.ts
git commit -m "refactor(stores): derivedStatus via pure fn; add listFilters + fetchHeaderStats"
```

---

## Task 3: Convert the invoices page

**Files:** Modify `app/pages/invoices/index.vue`.

- [ ] **Step 1: Read the page** to locate the data source (`store.filtered` / `ensureLoaded`), the `filteredTotal`, the header line, and the `<ResizableDataTable>` + columns.

- [ ] **Step 2: Replace the data source with `useServerTable`**

```ts
import { andClauses, eqClause, inClause, likeClause, makeSortResolver, rangeClause } from "~/lib/list-query";
import { invoiceDerivedFrom } from "~/lib/derived-status";
import { todayISO } from "~/lib/calendar-events"; // or store's today; one source

const table = useServerTable<InvoiceRow & { _status: string, _balance: number }>({
	query: () => ({
		from: invoiceDerivedFrom(todayISO()),
		where: andClauses([
			inClause("_status", store.statusFilters),
			eqClause("client_id", store.clientFilter),
			rangeClause("issue_date", store.issuedFrom, store.issuedTo),
			rangeClause("due_date", store.dueFrom, store.dueTo),
			likeClause(store.search, ["number", "project_title", "client_name"]),
		]),
		sumExpr: "SUM(total_cents)",
	}),
	resolveSortColumn: makeSortResolver({
		number: "number",
		client_name: "client_name COLLATE NOCASE",
		project_title: "project_title COLLATE NOCASE",
		issue_date: "issue_date",
		due_date: "due_date",
		total_cents: "total_cents",
		_status: "_status",
		_balance: "_balance",
	}),
	defaultOrderBy: "datetime(created_at) DESC",
	deps: () => store.listFilters,
	initialSortField: "issue_date",
	initialSortOrder: -1,
});

const headerStats = ref({ total: 0, outstandingCents: 0 });
const refreshStats = async () => { headerStats.value = await store.fetchHeaderStats(); };
```

> Map the page's actual sort `field=` values to the allowlist. If the Status column uses `field="_status"` (it does on payslips; confirm on invoices) and Client uses `field="client_name"` / `field="_client"`, include exactly those keys. Anything omitted falls back to default order.

- [ ] **Step 3: Rewire mount, header, StatChip, empty states, table, mutations** — mirror the credit-notes conversion exactly:
  - mount `runLoad`: drop `store.ensureLoaded()`; keep clients/settings loads needed for pickers/PDF; `await refreshStats()`.
  - header `{{ store.invoices.length }} total · {{ formatLKR(store.outstandingTotal) }}` → `{{ headerStats.total }} total · {{ formatLKR(headerStats.outstandingCents) }} outstanding`.
  - action bar gate → `!isLoading && table.total.value > 0`; "Showing N of M"; `StatChip :value="formatLKR(table.sumCents.value)"`.
  - loading / empty branches → `table.loading.value` / `table.total.value === 0` (+ `hasAnyFilter`).
  - `<ResizableDataTable :rows="table.rows.value" :total="table.total.value" @request="table.onRequest" …>` (keep columns, `:row-actions`, sort defaults).
  - after any in-page mutation (status transition, record-payment that stays, New-modal close): `await table.reload(); await refreshStats();`.

- [ ] **Step 4: Lint + manual QA**

Run: `bun run lint`. Then `bun run tauri:dev`, `/invoices`: status chips (incl. overdue/partial/paid) filter via SQL; client + issue/due ranges + search work; sort by status/balance/total; Total chip + header outstanding match the old values on the same data; record-payment then return reflects new status.

- [ ] **Step 5: Commit** — `perf(invoices): server-side pagination via derived-status subquery`.

---

## Task 4: Convert the bills page

**Files:** Modify `app/pages/bills/index.vue`. Same as Task 3 with:

- `from: billDerivedFrom(todayISO())`.
- where: `inClause("_status", store.statusFilters)`, `eqClause("vendor_id", store.vendorFilter)`, the **category** clause (`store.categoryFilter === "uncategorised" ? { sql: "category_id IS NULL", params: [] } : eqClause("category_id", store.categoryFilter)`), `rangeClause("issue_date", …)`, `rangeClause("due_date", …)`, `likeClause(store.search, ["number", "vendor_name", "vendor_invoice_number", "category_name"])`.
- sort allowlist: number, vendor_name (NOCASE), category_name (NOCASE), issue_date, due_date, total_cents, `_status`, `_balance` (match the page's `field=`s).
- header outstanding `_status IN ('unpaid','partial','overdue')`; StatChip `SUM(total_cents)`.
- bills has the same record-payment/cancel mutations + bulk-PDF selection (selection operates on the visible page — fine).

- [ ] Lint + QA (mirror Task 3) + commit `perf(bills): server-side pagination via derived-status subquery`.

---

## Task 5: Convert the payslips page

**Files:** Modify `app/pages/payslips/index.vue`. Same pattern with:

- `from: payslipDerivedFrom(todayISO())`.
- where: `inClause("_status", store.statusFilters)`, `eqClause("employee_id", store.employeeFilter)`, period bounds — **asymmetric**: `{ sql: "period_start >= ?", params:[periodFrom] }` when set and `{ sql: "period_end <= ?", params:[periodTo] }` when set (use two explicit fragments via `andClauses`, NOT `rangeClause` on one column), `likeClause(store.search, ["number", "employee_name"])`.
- sort allowlist: number, employee_name (NOCASE), period_start, pay_date, `_status`, net_cents.
- default sort `period_start` desc.
- StatChip `SUM(net_cents)`; header outstanding `_status IN ('unpaid','partial')`.
- payslips list has the multi-select + bulk-PDF column (`selectable`); keep it. Selection acts on the current page — note in QA. Mutations: record-payment/issue/cancel → `table.reload()` + `refreshStats()`.

- [ ] Lint + QA + commit `perf(payslips): server-side pagination via derived-status subquery`.

---

## Task 6: Verify, version bump, finalize

- [ ] **Step 1:** `bun run test && bun run lint` (all green; new `derived-status` suite passes).
- [ ] **Step 2:** `bunx nuxi typecheck 2>&1 | grep -E "derived-status|invoices/index|bills/index|payslips/index|stores/(invoices|bills|payslips)"` — only the codebase-wide ResizableDataTable `:rows`/`:row-actions` generic-constraint pattern is acceptable; anything else must be fixed.
- [ ] **Step 3:** `bun run generate` exits 0 (the real gate).
- [ ] **Step 4:** Version bump minor `0.117.0 → 0.118.0` across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`; refresh `Cargo.lock` (`cd src-tauri && cargo update -p sakoram_billing --precise 0.118.0`).
- [ ] **Step 5:** Commit bump + the spec/plan docs. Push `perf/list-pagination-derived-docs`; summarise; **wait for explicit "open the PR"**.

---

## Self-review notes
- Spec §"core mechanism" + §PR-A fully covered: derived FROM builders (Task 1), store refactor + stats (Task 2), three page conversions (Tasks 3-5).
- Parity safeguard: pure fns unit-tested + stores call them (Task 2) + FROM builders transcribe the same precedence (Task 1 tests assert shape; manual QA confirms values).
- Performance refinement over the spec: `LEFT JOIN` grouped voucher-sum (once) instead of repeated correlated subqueries.
- `today` inlined literal — Task 1 builders + Task 2 stats.
- clients (PR-B) is a separate plan/branch — not in scope here.
