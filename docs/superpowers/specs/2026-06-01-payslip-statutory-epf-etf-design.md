# Statutory auto-compute (EPF / ETF) on payslips — design

**Date:** 2026-06-01
**Status:** Approved (pending spec review)
**Scope:** Sri Lankan EPF + ETF auto-compute on payslips. PAYE/APIT
explicitly deferred.

---

## Goal

Replace the manual entry of EPF/ETF lines on payslips with a
configurable auto-compute. Today every statutory deduction is a
hand-typed `deduction` line; this makes the employee EPF 8% a managed,
live-recomputed line and surfaces employer EPF 12% + ETF 3% as stored,
displayed contributions.

This is the highest-leverage remaining payroll feature for the SL
audience (see roadmap in `CLAUDE.md` — "statutory auto-compute" is
called out as the next biggest gap).

## Sri Lankan statutory model (the domain)

- **EPF** — Employee contributes **8%** of total liable earnings (a
  *deduction* that reduces net pay). Employer contributes **12%** (a
  business cost, NOT deducted from the employee).
- **ETF** — Employer contributes **3%** (business cost only, no
  employee deduction).
- **PAYE / APIT** — progressive income tax. **Out of scope** for this
  version.

## Decisions (from brainstorming)

1. **Components:** EPF + ETF only. No PAYE.
2. **EPF base:** per-line "EPF liable" flag. EPF/ETF compute on the sum
   of liable earning lines (some allowances are EPF-exempt in SL
   practice). Default: liable.
3. **Rate config:** stored on `company_settings`, editable, pre-seeded
   with SL defaults, auto-compute **on by default** for new payslips.
4. **Editor behavior:** managed EPF deduction line with **live
   recompute** as earnings / liable flags change. Amount not
   hand-editable.
5. **Employer side:** **store + show** on payslip + PDF
   (`epf_employer_cents`, `etf_cents`). No auto-expense / voucher /
   P&L integration in this version.
6. **Managed-line representation:** **real tagged `payslip_lines`
   row** (`auto_source = 'epf_employee'`) so totals + PDF flow through
   the existing single code path. (Approach A.)

---

## Architecture

### 1. Rates & config — `company_settings`

Migration **0035** adds (all basis points, per golden rule #3, seeded
with SL defaults):

| Column | Default | Meaning |
|---|---|---|
| `statutory_auto_compute` | `1` | master toggle (seeds new payslips) |
| `epf_employee_rate_bp` | `800` | 8% |
| `epf_employer_rate_bp` | `1200` | 12% |
| `etf_rate_bp` | `300` | 3% |

Surfaced on `/settings/payroll` as a new "Statutory contributions"
`UCard` below the cycle template:
- master switch (`statutory_auto_compute`)
- three rate inputs displayed as % / stored as bp (reuse `formatRate`
  for display; convert on save)
- a one-line live preview: "On Rs 100,000 liable earnings: EPF
  employee Rs 8,000, employer Rs 12,000, ETF Rs 3,000" computed via
  `lib/statutory.ts`.

Wired through the existing settings store `save()`. Extend the settings
Zod schema in `app/lib/validation.ts` to cover the four columns
(non-negative integers; rates 0–10000 bp).

### 2. Per-line & per-payslip storage

Migration **0035** also adds:

- `payslip_lines.epf_liable INTEGER NOT NULL DEFAULT 1` — meaningful on
  earning lines; EPF/ETF base = Σ liable earnings.
- `payslip_lines.auto_source TEXT` — `NULL` = manual line,
  `'epf_employee'` = the managed deduction line. The editor uses this
  to render the row read-only and to know which row to recompute.
- `payslips.epf_employee_cents INTEGER NOT NULL DEFAULT 0`
- `payslips.epf_employer_cents INTEGER NOT NULL DEFAULT 0`
- `payslips.etf_cents INTEGER NOT NULL DEFAULT 0`
  (frozen at save; report-friendly without parsing the lines table.
  `epf_employee_cents` mirrors the managed line and is stored for
  symmetry / future payroll-register columns.)
- `payslips.statutory_enabled INTEGER NOT NULL DEFAULT 1` —
  per-payslip override, seeded from `company_settings.statutory_auto_compute`
  at create time.

Pre-1.0 → additive `ALTER`s with defaults, **no backfill** (golden
rule for pre-1.0 status). Existing demo payslips get `epf_liable=1`,
`auto_source=NULL`, employer cols `0`, `statutory_enabled=1` — correct
(they simply carry no managed line until re-saved as a draft, and
issued ones are immutable).

Migration housekeeping:
- bump `SCHEMA_VERSION` → 35 in `src-tauri/src/data_io.rs`
- register `0035_*.sql` in the `MIGRATIONS` array in
  `src-tauri/src/tenants.rs`
- no new tables → no `TABLES` change in `data_io.rs` (the dynamic
  `PRAGMA table_info` picks up the new columns automatically for
  export).

### 3. `app/lib/statutory.ts` — pure module

No Pinia / Vue deps (mirrors `reconcile-match.ts`, `payroll-cycle.ts`)
so it's trivially unit-tested.

```ts
export interface StatutoryRates {
  epfEmployeeBp: number
  epfEmployerBp: number
  etfBp: number
}

export interface StatutoryResult {
  baseCents: number          // Σ liable earnings
  epfEmployeeCents: number
  epfEmployerCents: number
  etfCents: number
}

export function computeStatutory(
  liableEarningCents: number,
  rates: StatutoryRates
): StatutoryResult
```

Each amount = `roundHalfEven(baseCents * rateBp / 10000)` — the exact
pattern `computeLineTotals` already uses for tax. Requires **exporting
`roundHalfEven`** (and reusing `BP_DENOM`) from `app/lib/money.ts`;
both are currently module-private.

Vitest coverage: zero base, banker's-rounding edges (half-to-even),
varied rates, large values.

### 4. Editor — `PayslipLineEditor.vue`

- Each **earning** row gains a compact "EPF" checkbox bound to
  `epf_liable` (default checked). Layout shifts to
  `[1fr_auto_180px_auto]` (label · EPF check · amount · delete).
- The managed `auto_source = 'epf_employee'` deduction renders as a
  **locked** row: label "EPF (8%)" (rate pulled from settings), amount
  read-only, no delete button, with a subtle lock icon + "auto" chip.
- A section header toggle "Apply EPF / ETF" mirrors `statutory_enabled`.
  Off → managed line removed, employer figures zeroed.
- **Live recompute:** a watcher over (liable earnings, toggle, rates)
  calls `computeStatutory`, then upserts or removes the managed line in
  the local `lines` array and re-emits `update:modelValue`. Manual
  deduction lines are never touched.
- New **"Employer contributions (not deducted)"** info block below Net:
  EPF employer 12%, ETF 3%, and a "Total cost of employment" figure
  (gross earnings + employer contributions). Display-only — does not
  affect net.

The component needs the rates + enabled flag as props (passed from the
detail page, sourced from the settings store + payslip row) so it stays
free of store imports, consistent with its current pure-props design.

### 5. Store — `app/stores/payslips.ts`

- `createPayslip`: read `statutory_auto_compute` from settings → seed
  `statutory_enabled`. If enabled, seed the managed EPF line +
  `epf_employee_cents`/`epf_employer_cents`/`etf_cents` from the Basic
  earning (the only liable line at create).
- `replaceLines`: already sums earnings/deductions — the managed line
  flows in via the normal path. Extend it to (a) accept/persist
  `epf_liable` + `auto_source` per line, and (b) compute & return the
  three statutory cents columns from the liable-earning base using
  `computeStatutory` (single source of truth: the lib). Detail page
  persists those onto the payslip row via `update`.
- Add `epf_liable`, `auto_source` to the `payslip_lines` INSERT; add
  the three statutory columns + `statutory_enabled` to `PayslipRow`,
  the `payslips` INSERT, and `UPDATABLE`.
- **Immutability guard:** the managed line is only (re)written while
  `status === 'draft'`. Issued/cancelled payslips are immutable
  (golden rule #5) — recompute is a no-op there.
- `PayslipLineRow` / `PayslipLineDraft` gain `epf_liable: number`
  (0/1, matching the DB INTEGER convention used elsewhere in the
  codebase) and `auto_source: string | null`.

### 6. PDF — `app/lib/payslip-pdf.ts` + `src-tauri/templates/payslip.typ`

- The EPF deduction already renders via the real line — no change
  needed for the deduction side.
- Payload gains `epf_employer_cents`, `etf_cents`, `total_cost_cents`,
  and a `statutory_enabled` flag.
- `payslip.typ` gains an "Employer contributions (not deducted)"
  mini-section rendered only when `statutory_enabled` and amounts > 0:
  EPF 12%, ETF 3%, total cost of employment.

### 7. Testing & verification

- Vitest unit tests for `lib/statutory.ts`.
- `bun run lint` (tabs, strict eslint) and `bun run test` green.
- Manual (via `tauri:dev`):
  1. Create a draft payslip → EPF (8%) line appears auto, employer
     block shows 12% + 3%.
  2. Add an allowance, untick its EPF box → EPF + employer figures drop
     to exclude it, live.
  3. Toggle "Apply EPF/ETF" off → managed line + employer block vanish.
  4. Issue the payslip → form locks, figures frozen.
  5. Generate PDF → deduction shows EPF, employer-contributions section
     renders.
  6. Change rates in `/settings/payroll` → a new payslip picks up the
     new rates; existing issued ones unchanged.

---

## Out of scope (explicit)

- PAYE / APIT progressive tax tables.
- Auto-creating expenses / vouchers / bills for employer contributions
  (P&L + cash-flow integration). Employer figures are stored + shown
  only.
- Per-employee rate overrides (business-wide rates only).
- Bulk payslip flow changes beyond inheriting the settings default.
- Backfilling statutory figures onto historical payslips.

## Files touched

| File | Change |
|---|---|
| `src-tauri/migrations/0035_payslip_statutory.sql` | new — columns above |
| `src-tauri/src/tenants.rs` | register migration |
| `src-tauri/src/data_io.rs` | bump `SCHEMA_VERSION` → 35 |
| `app/lib/money.ts` | export `roundHalfEven` |
| `app/lib/statutory.ts` | new — `computeStatutory` |
| `app/lib/statutory.test.ts` | new — Vitest |
| `app/lib/validation.ts` | extend settings schema |
| `app/stores/payslips.ts` | seed/recompute/persist statutory |
| `app/stores/settings.ts` | surface new columns (if typed) |
| `app/components/PayslipLineEditor.vue` | EPF checkbox, managed line, employer block |
| `app/pages/payslips/[id].vue` | pass rates/flag props; persist cols |
| `app/pages/settings/payroll.vue` | statutory config card |
| `app/lib/payslip-pdf.ts` | employer-contribution payload |
| `src-tauri/templates/payslip.typ` | employer-contribution section |
| `CLAUDE.md` | mark feature shipped; document migration 0035 |
