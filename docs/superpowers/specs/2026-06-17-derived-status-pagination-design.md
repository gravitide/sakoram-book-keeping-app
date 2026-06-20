# Derived-status List Pagination — Design

**Date**: 2026-06-17
**Branches**: `perf/list-pagination-derived-docs` (PR-A: invoices/bills/payslips), `perf/list-pagination-clients` (PR-B: clients)
**Roadmap tier**: Performance — the final, highest-value slice of the DB-side pagination rollout (the biggest tables live here).

---

## Goal

Server-paginate the four lists whose filters/sorts/sums depend on **voucher-derived** state rather than stored columns: **invoices**, **bills**, **payslips**, and **clients** ("Outstanding only"). These hold the largest per-tenant volumes (invoices ~800, bills ~1000 in the demo), so this is where the in-memory load actually hurts.

Builds on the shipped engine (`useServerTable`, PR #251) and the reusable clause helpers (`app/lib/list-query.ts`, PRs #253/#254). **No engine changes** are required.

## Non-goals

- recurring-invoices / recurring-bills — deliberately left client-mode (tiny + coupled to the bulk-generate flow).
- Changing any store's `load()` / `filtered` (kept for detail pages, dashboard, calendar, and as the client-mode fallback).
- Any schema/migration change. The voucher FK indexes already exist.

---

## The core mechanism: a derived-status computed-column subquery

The engine's `from` accepts any SQL. Each derived-status list wraps its base table in a subquery that computes the voucher paid-sum, balance, and the **derived status** as a `CASE` — then filters / sorts / sums on those aliases:

```sql
FROM (
  SELECT i.*,
    COALESCE((SELECT SUM(v.amount_cents) FROM vouchers v
              WHERE v.related_invoice_id = i.id AND v.voucher_type = 'receipt'), 0) AS _paid,
    i.total_cents
      - COALESCE((SELECT SUM(v.amount_cents) FROM vouchers v
                  WHERE v.related_invoice_id = i.id AND v.voucher_type = 'receipt'), 0) AS _balance,
    CASE
      WHEN i.status = 'draft' THEN 'draft'
      WHEN i.status = 'cancelled' THEN 'cancelled'
      WHEN (<_paid>) >= i.total_cents AND i.total_cents > 0 THEN 'paid'
      WHEN i.due_date < '<today>' THEN 'overdue'
      WHEN (<_paid>) > 0 THEN 'partial'
      ELSE 'sent'
    END AS _status
  FROM invoices i
) sub
WHERE _status IN (?, ?, ...) AND client_id = ? AND issue_date BETWEEN ? AND ? AND (search…)
ORDER BY <allowlisted column or alias> LIMIT ? OFFSET ?
```

Notes:
- **`today` is inlined as a string literal**, not a bound param. It's our own `todayISO()`, never user input, so there's no injection risk — and it avoids a parameter-ordering problem (the `FROM` subquery's `?` would otherwise precede the `WHERE` params that `useServerTable` binds).
- SQLite forbids referencing a SELECT alias inside the same SELECT list, so `_paid` is repeated inline where needed (in `_balance` and the `CASE`). A generator function builds the SQL so the repetition isn't hand-maintained.
- The status chip filter is `inClause("_status", statusFilters)`. The StatChip/header sums are `SUM(total_cents)` (or `SUM(_balance)`), wrapping the same subquery in the `COUNT`/`SUM` queries the engine already issues.
- Sorting on `_status` / `_balance` uses the aliases via the sort allowlist; base columns sort as usual.

### Performance
The correlated voucher SUM runs per row that passes the base filter, then the outer query filters on `_status`, sorts, and `LIMIT`s. With the existing `vouchers(related_invoice_id|related_bill_id|related_payslip_id)` indexes, this is fine at ~1–2k rows. The `COUNT`/`SUM` header queries wrap the same subquery (O(rows) sums) — acceptable at this scale; revisit only if a tenant crosses ~10k.

---

## `app/lib/derived-status.ts` (new) — the parity safeguard

The SQL `CASE` must match each store's JS `derivedStatus` **exactly**, including precedence. To prevent drift, one module owns both representations:

```ts
// Pure status derivation — the single source of truth the stores also use.
export function deriveInvoiceStatus(persisted: "draft"|"sent"|"cancelled", paid: number, total: number, dueDate: string, today: string): InvoiceStatus
export function deriveBillStatus(persisted: "open"|"cancelled", paid: number, total: number, dueDate: string, today: string): BillStatus
export function derivePayslipStatus(persisted: "draft"|"issued"|"cancelled", paid: number, net: number): PayslipStatus

// SQL CASE generators — mirror the pure fns; `paidExpr` is the inlined paid-sum
// subquery, `totalCol`/`dueCol` the column names, `today` the literal date.
export function invoiceStatusCaseSql(paidExpr: string, totalCol: string, dueCol: string, today: string): string
export function billStatusCaseSql(paidExpr: string, totalCol: string, dueCol: string, today: string): string
export function payslipStatusCaseSql(paidExpr: string, netCol: string): string
```

Exact precedence (transcribed from the stores):

| Type | Order of checks |
|---|---|
| invoice | draft → cancelled → (paid≥total ∧ total>0)=paid → (due<today)=overdue → (paid>0)=partial → sent |
| bill | cancelled → (paid≥total ∧ total>0)=paid → (due<today)=overdue → (paid>0)=partial → unpaid |
| payslip | cancelled → draft → (paid≥net ∧ net>0)=paid → (paid>0)=partial → unpaid |

**Store refactor:** `invoices.ts` / `bills.ts` / `payslips.ts` `derivedStatus` becomes a thin wrapper calling the pure fn with `paidCentsFor(id)`. This guarantees the badges/detail pages/dashboard stay in lock-step with the pure logic; the SQL generators are transcriptions verified by unit tests (string assertions) + manual QA.

**Tests** (`derived-status.test.ts`): fixture table per type covering each precedence branch (e.g. invoice: draft; cancelled; fully-paid; partly-paid-and-overdue→overdue; partly-paid-not-overdue→partial; unpaid-overdue; unpaid→sent; zero-total edge). Plus a string-shape assertion per `*CaseSql`.

---

## PR-A — invoices, bills, payslips

Each page converts to `useServerTable` exactly like the clean lists, with the derived-status subquery as `from` and a `buildDerivedFrom()` helper assembling it. Per-list specifics:

### invoices
- **from**: invoices subquery (above).
- **filters**: `_status IN` (draft/sent/partial/paid/overdue/cancelled) · `client_id=?` · `issue_date` range · `due_date` range · search `(number, project_title, client_name)`.
- **sort allowlist**: number, client_name (NOCASE), project_title (NOCASE), issue_date, due_date, total_cents, `_status`, `_balance` (whichever the columns expose). Default `datetime(created_at) DESC`.
- **StatChip Total** = `SUM(total_cents)` over filter. **Header** = grand `COUNT(*)` + outstanding `SUM(_balance)` where `_status IN ('sent','partial','overdue')` — via a `fetchHeaderStats()` store method (one wrapped query).
- Row actions mutate (record payment routes away; status transitions stay) → `table.reload()` + stats refresh after in-page mutations; reload on New-modal close.

### bills
- **from**: bills subquery (payment vouchers on `related_bill_id`; no draft state).
- **filters**: `_status IN` (unpaid/partial/paid/overdue/cancelled) · `vendor_id=?` · category (`category_id IS NULL` when "uncategorised", else `category_id=?`) · `issue_date` range · `due_date` range · search `(number, vendor_name, vendor_invoice_number, category_name)`.
- **sort/sums/header**: mirror invoices (`SUM(total_cents)`; outstanding `SUM(_balance)` where `_status IN ('unpaid','partial','overdue')`).

### payslips
- **from**: payslips subquery (payment vouchers on `related_payslip_id`; **no overdue / due_date** in the CASE).
- **filters**: `_status IN` (draft/unpaid/partial/paid/cancelled) · `employee_id=?` · `period_start` range (`periodFrom`/`periodTo`) · search (employee_name/number — confirm columns at impl).
- **StatChip Total** = `SUM(net_cents)`. **Header** outstanding = `SUM(_balance)` where `_status IN ('unpaid','partial')`.
- Bulk-select / bulk-PDF column stays (operates on the current page's rows — acceptable; note it in QA).

---

## PR-B — clients ("Outstanding only")

`clients` is an address-book list (search + archived toggle) **plus** a per-client outstanding aggregation. The subquery computes `_outstanding` = Σ open-invoice balances for that client:

```sql
FROM (
  SELECT c.*,
    COALESCE((
      SELECT SUM(i.total_cents
                 - COALESCE((SELECT SUM(v.amount_cents) FROM vouchers v
                             WHERE v.related_invoice_id = i.id AND v.voucher_type='receipt'),0))
      FROM invoices i
      WHERE i.client_id = c.id AND i.status='sent'
        AND (i.total_cents - <paid>) > 0
    ), 0) AS _outstanding
  FROM clients c
) sub
WHERE is_archived = ? [AND _outstanding > 0] AND (search…)
```

- **filters**: archived toggle (`is_archived=?`) · `outstandingOnly` → `_outstanding > 0` · search (name/email/contact_person/phone/tax_id).
- **sort**: name (NOCASE) default; `_outstanding` when the outstanding view is active (the page already switches `default-sort-field` to `_outstanding`).
- **header / page total**: active/archived counts (grouped query, as the address books) + `filteredOutstanding` = `SUM(_outstanding)` over the filter.
- Reuses `app/lib/list-query.ts` for the archived + search clauses; the outstanding subquery is inlined in `from`.

> Definition match: `_outstanding`'s "open invoice" predicate (`status='sent'` AND balance>0) must match the clients page's current `invoicesStore`-based computation. Confirm against the page's `_outstanding` builder at implementation and mirror it exactly.

---

## Risks / call-outs

- **SQL↔JS parity** (the main risk): mitigated by the shared `derived-status.ts` (stores use the pure fn; SQL generators sit beside it) + fixture tests + manual QA comparing each converted page to current behavior.
- **`today` inlined**: safe (our value), and recomputed per query build; an app left open across midnight refreshes `today` on the next fetch.
- **Header "outstanding" sums** stay **global** (over all rows, like today) — they use the same subquery without the status-chip filter, via `fetchHeaderStats()`.
- **payslips bulk-select** acts on the visible page only (same as other paginated multi-select lists); call out in QA.
- **No new index needed** — voucher FK + date indexes already exist.

## Files

PR-A:
- `app/lib/derived-status.ts` (+ `.test.ts`) — pure derive fns + SQL CASE generators.
- `app/stores/{invoices,bills,payslips}.ts` — `derivedStatus` → pure fn; add `listFilters` + `fetchHeaderStats`.
- `app/pages/{invoices,bills,payslips}/index.vue` — convert to `useServerTable`.

PR-B:
- `app/stores/clients.ts` — `listFilters` (+ outstanding flag) + `fetchArchivedCounts` + outstanding header sum.
- `app/pages/clients/index.vue` — convert to `useServerTable` with the outstanding subquery.
