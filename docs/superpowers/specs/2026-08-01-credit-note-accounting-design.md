# Credit-note accounting, employer payroll cost, and money-math test backfill

**Date:** 2026-08-01
**Status:** Approved, ready for implementation

Three findings from the 2026-08-01 audit, delivered as three sequential PRs.
They share a theme — report figures that disagree with reality — but have very
different blast radii, so they do not share a branch.

## Problem

### 1. Credit notes are inert

The credit-note feature ships end-to-end in the UI (list page, detail page,
`NewCreditNoteModal`, `CRN` numbering prefix, `credit_notes` +
`credit_note_lines` tables from migration 0029) and has **no effect on any
figure anywhere in the app**. The only SQL that reads `credit_notes` lives in
`app/stores/credit_notes.ts`, serving that page's own header count.

| Surface | Credit notes included today |
|---|---|
| VAT report output VAT | No — `Σ invoices.tax_cents` only |
| P&L income | No — `Σ invoices.subtotal_cents` only |
| Aged receivables | No |
| Customer statement PDF | No |
| Invoice derived balance / status | No |
| Dashboard receivables tile | No |

The consequence is regulatory. Issuing a credit note for a returned sale still
declares the original output VAT to the IRD.

**The code also documents behaviour that does not exist.**
`app/stores/credit_notes.ts:38` says of `source_invoice_id`: *"When set, the
invoice's derived balance subtracts this credit note's total"*, and the file
header defers the offset to the invoices store. No such code exists —
`invoices.ts:236` is `total_cents - paidCentsFor(id)`, and `paidCentsFor` sums
receipt vouchers exclusively. These comments must be corrected even if the
wiring were deferred, because they will mislead the next reader.

### 2. P&L understates payroll by employer contributions

`app/pages/reports/profit-loss.vue:755` computes
`payroll = Σ payslips.earnings_cents` (gross). Employer EPF (12%) and ETF (3%)
live on the payslip row as `epf_employer_cents` / `etf_cents` (migration 0035)
and are genuine employer expenses, but are excluded. Profit is overstated by up
to ~15% of EPF-liable payroll.

The correct figure already exists in the codebase:
`app/lib/payslip-pdf.ts:96` computes
`total_cost_display = earnings + epf_employer_cents + etf_cents` and prints it
on every payslip PDF. Only the reports disagree.

### 3. Test coverage is inverted

290 tests pass across 30 files, all pure functions in `app/lib`. The gaps land
exactly on the golden rules: `money.ts` (Rule #1, integer cents + half-even
rounding), `numbering.ts` (Rule #6, atomic allocation), and `payroll-cycle.ts`
(31 → last-day-of-month clamping). Meanwhile `license.rs` — dead code — has
tests.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Effect on a linked invoice | **Reduce balance; add a new derived `credited` status** | A credit genuinely reduces what is receivable. Reusing `paid` would make a written-off invoice indistinguishable from a collected one. |
| Status precedence when both apply | `paid >= total` → **paid**; else `paid + credited >= total` → **credited** | Only a fully cash-covered invoice earns `paid`. A mixed 40-cash/60-credit settlement reads as `credited`, surfacing that a credit was required to close it. |
| Which credit-note statuses count | **`issued` only** | Mirrors invoices requiring `sent`. Drafts are not yet real; cancelled are void. |
| VAT period attribution | **The credit note's own `issue_date`** | Standard treatment — the credit lands in the period it was issued, not the original invoice's period. Also matches how the report already filters. |
| Unlinked credit notes (`source_invoice_id IS NULL`) | **Client-level unapplied credit**, shown as a separate line | The tax and revenue effect is real regardless of linkage, and the client genuinely owes that much less. Never mixed into per-invoice rows. |
| Schema changes | **None** | Every column needed already exists. `credited` is a derived status, never persisted. |
| Delivery | **Three sequential PRs**, tests first | PR 3 rewrites money-adjacent report math; `money.ts` should be pinned by tests before that happens. |

## Changes

### PR 1 — test backfill (no production code)

- `app/lib/money.test.ts` — `roundHalfEven` across positives, negatives, and
  exact-`.5` ties (`-2.5 → -2`, `-1.5 → -2`, `-0.5 → 0`); `toCents` string
  parsing, comma stripping, the invalid-input throw, and 3-decimal truncation;
  `computeLineTotals` line-level rounding; `formatMoney` symbol/locale and the
  `registerCurrency` custom-currency path.
- `app/lib/payroll-cycle.test.ts` — `resolvePayrollCycle` / `nextPayrollCycle`
  clamping, especially day 31 in February and in 30-day months, and leap years.
- `app/lib/numbering.test.ts` — `formatDocumentNumber` across all seven
  `DocumentType` values. `numbering.ts` imports `~/lib/db`, so this needs
  `vi.mock("~/lib/db")`. **Confirm the mock resolves before committing to
  this file**; if it does not, restrict the test to whatever is reachable and
  note the limitation rather than reshaping `numbering.ts` for testability.

### PR 2 — employer contributions in P&L

- `app/pages/reports/profit-loss.vue` — payroll expense becomes
  `Σ (earnings_cents + epf_employer_cents + etf_cents)` over issued payslips in
  range. The payroll KPI tile and breakdown row follow automatically; the
  payslips drill-down table gains an employer-cost column so the tile reconciles
  against the rows.
- `app/lib/report-pdf.ts` — the P&L payload builder carries the same figure.
- `app/pages/reports/payroll-register.vue` — same treatment, so the two reports
  agree.

### PR 3 — credit-note wiring

**Core — `app/lib/derived-status.ts`**

- `InvoiceStatus` gains `"credited"`.
- `deriveInvoiceStatus(persisted, paid, credited, total, dueDate, today)` — new
  second numeric parameter, precedence exactly as in the Decisions table.
- `invoiceDerivedFrom(today)` gains a second `LEFT JOIN` summing issued credit
  notes grouped by `source_invoice_id`, structurally mirroring the existing
  `paidJoinOn` helper. `_balance` becomes `total_cents - _paid - _credited`,
  and `_credited` is exposed alongside `_paid`.
- `clientDerivedFrom()` — `_outstanding` subtracts credits, **including
  unapplied client-level credits**. Without this the clients list disagrees
  with the receivables report, which is precisely the drift the pure/SQL mirror
  exists to prevent.

The SQL `CASE` and the pure function must stay byte-for-byte equivalent in
precedence, per the rule stated in that file's header comment.

**Stores**

- `app/stores/credit_notes.ts` — add `creditedCentsFor(invoiceId)` and
  `unappliedCreditFor(clientId)`, both counting `issued` only. **Correct the
  misleading comments at the file header, at `source_invoice_id` (line ~38),
  in `create` (~line 226), and in `createFromInvoice` (~line 272).**
- `app/stores/invoices.ts` — thread credit through `balanceCentsFor`,
  `derivedStatus`, and `outstandingTotal`; add `credited` to the status-filter
  union.

**Reports**

- `app/pages/reports/vat.vue` — output VAT becomes
  `Σ invoices.tax_cents − Σ issued credit_notes.tax_cents` over the range by
  each document's own `issue_date`. New "Credit notes" drill-down tab. Tile
  copy and the existing net-VAT narrative strings need review for the case
  where credits push output VAT negative.
- `app/pages/reports/profit-loss.vue` — income becomes
  `Σ invoices.subtotal_cents − Σ issued credit_notes.subtotal_cents`. New
  drill-down tab.
- `app/pages/reports/aged-receivables.vue` — per-client rows use the
  credit-reduced balance; unapplied credits appear as a separate line rather
  than being distributed across buckets.
- `app/lib/report-pdf.ts` — payload builders for all three.
- `app/lib/statement-pdf.ts` + `src-tauri/templates/statement.typ` — invoice
  rows use credit-reduced balances; an unapplied-credit line sits above the
  total.

**UI**

- `app/components/StatusBadge.vue` — a `credited` colour. Must be a
  theme-stable semantic colour, never `primary`, per the existing rule in that
  component.
- `app/pages/invoices/index.vue` — `credited` status filter chip, coloured to
  match the badge.
- `app/pages/invoices/[id].vue` — a linked-credit-notes section showing any
  credit notes against this invoice, each routing to its detail page.

## Testing

- `app/lib/derived-status.test.ts` extends to cover the full new precedence
  table: cash-only settlement, credit-only settlement, the mixed
  cash-plus-credit case, credit on an overdue invoice, and credit exceeding the
  invoice total (balance must floor at zero, never go negative).
- PR 1's three new test files as described above.
- Manual verification for PR 3: issue an invoice, issue a partial credit note
  against it, and confirm the invoice detail page, the invoices list, aged
  receivables, the statement PDF, the VAT report, and the clients list all
  report the same balance. Cross-surface agreement is the actual acceptance
  criterion — any two disagreeing means the mirror drifted.

## Out of scope

- **Double-entry / chart of accounts.** Confirmed absent by the audit and
  deliberately so. A derived balance sheet — a pure `app/lib/` function mapping
  existing documents and vouchers onto implied postings at report time — is the
  recommended future path, and is its own spec.
- **Inter-bank transfers and owner capital / drawings**, which currently
  distort cash flow and P&L because they have nowhere to go. Real, but
  independent of credit notes.
- **Dead licensing surface** (`license.rs`, `mint_license.rs`, `licensing.ts`,
  `FeatureLock`, `UpgradeButton` — 539 LOC, three still-registered Tauri
  commands). Already tracked as known debt in `CLAUDE.md`.
- **Credit-note PDF**, still unimplemented and unrelated to these figures.
