# Dashboard date-range control — design

**Date:** 2026-07-11
**Status:** Approved

## Problem

Every dashboard flow widget is pinned to a hardcoded recent window (Net
cash = this calendar month, Monthly cash flow = trailing 12 months,
Expenses by category = last 90 days, Top clients = last 12 months). A
user back-filling historical records (or reviewing an earlier period)
sees Rs 0.00 everywhere even though the ledger has data — the dashboard
offers no way to look at any other period. The reports pages already
solve this with preset date chips; the dashboard should offer the same
lens.

## Decision summary

- **One global range control** — a chip row directly above the KPI
  strip, styled like the P&L / list-page preset chips:
  `Last 12 months · This month · Last month · This quarter · This year ·
  Last year · Fiscal year · All time`. Exactly one chip active.
- **Default: Last 12 months** (matches today's behaviour).
- **Persistence: per business** — the selected preset id is stored in
  localStorage keyed by the active tenant id and restored on relaunch.
- **Presets only** — no custom from/to fields; P&L exists for precise
  custom-range analysis.
- **Only flow widgets follow the range**: Net cash tile, Monthly cash
  flow chart, Expenses by category, Top clients. Snapshot widgets
  (Receivables outstanding, Payables outstanding, Open quotes,
  Receivables aging, Upcoming calendar, Recent activity) answer "what
  is true today" and are deliberately unaffected.

## Components

### `app/lib/dashboard-range.ts` (new, pure, unit-tested)

```ts
export type DashboardRangePreset =
	| "last12" | "thisMonth" | "lastMonth" | "thisQuarter"
	| "thisYear" | "lastYear" | "fiscalYear" | "allTime";

export interface ResolvedDashboardRange {
	from: string | null   // ISO YYYY-MM-DD inclusive; null = unbounded
	to: string | null     // ISO YYYY-MM-DD inclusive; null = unbounded
	label: string         // short human label, e.g. "This year", "All time"
}

export function resolveDashboardRange(
	preset: DashboardRangePreset,
	today: string,                 // ISO YYYY-MM-DD
	fiscalYearStartMonth: number   // 1-12, from company_settings (4 = April)
): ResolvedDashboardRange
```

Rules:
- `last12`: from = first day of the month 11 months before today's
  month, to = today. (12 monthly buckets ending in the current month —
  identical to today's chart window.)
- `thisMonth` / `lastMonth`: calendar month bounds.
- `thisQuarter`: calendar quarter (Jan–Mar, Apr–Jun, …) containing today.
- `thisYear` / `lastYear`: calendar year bounds.
- `fiscalYear`: the fiscal year containing today, starting on
  `fiscalYearStartMonth` (April → this FY runs YYYY-04-01 to
  YYYY+1-03-31).
- `allTime`: `{ from: null, to: null }`.
- Resolution happens at read time so "This month" can never go stale
  across a month boundary while the app stays open.

### `app/composables/useDashboardRange.ts` (new)

Owns the selected preset (`ref<DashboardRangePreset>`), hydrated from
`localStorage["sakoram.dashboard.range.<tenantId>"]` (invalid/missing →
`last12`), written back on change. Exposes:
- `preset` (writable ref)
- `range` (computed `ResolvedDashboardRange`; re-resolves on preset
  change — the dashboard re-reads it on every activation so date
  staleness is bounded by navigation, same as the KPI refresh)
- `presets` (ordered list of `{ id, label }` for the chip row)

Reads `fiscal_year_start_month` via the settings store (`ensureLoaded`
— already cheap and loaded by most sessions).

### `app/lib/dashboard-data.ts` (edit)

`getCashFlowThisMonth()` → `getCashFlowForRange(from: string | null,
to: string | null)`: same single-row aggregate with optional
`voucher_date >= ?` / `voucher_date <= ?` bounds. `loadDashboardKpis`
takes the resolved range and threads it through; the other three KPI
queries are snapshots and unchanged.

### `app/pages/index.vue` (edit)

- Chip row above the KPI strip (wraps on narrow widths). Clicking a
  chip sets the preset; a watcher on the resolved range re-runs
  `refreshKpis()` (already cheap) — charts react via props.
- Net cash tile title becomes `Net cash · {{ range.label }}`.
- Chart bindings gain `:from="range.from" :to="range.to"`
  (+ `:range-label="range.label"` where the subtitle shows it).
- The KPI-staleness fix (KPIs reload in `onActivated`) already on this
  branch stays as-is; range changes are an additional refresh trigger.

### Chart components (edit ×3)

- **`MonthlyCashFlowChart.vue`** — replaces its internal "trailing
  N months from today" window with "months intersecting [from, to]",
  still capped at the width-driven bucket count (12 wide / 6 narrow),
  keeping the **most recent** months of the range when it spans more
  than the cap. `from = null` (All time) starts from the earliest
  voucher date in the data; `to = null` ends at today's month.
- **`ExpensesByCategoryChart.vue`** — filters bills by issue date
  within [from, to] instead of the hardcoded last-90-days; subtitle
  text comes from the range label.
- **`TopClientsChart.vue`** — filters invoices by issue date within
  [from, to] instead of the hardcoded last-12-months.

Card subtitles on the dashboard that currently say "last 12 months" /
"last 90 days" switch to the range label.

## Out of scope

- Custom from/to date fields on the dashboard.
- Applying the range to snapshot widgets or the payroll dashboard.
- Persisting the range anywhere but localStorage (not in the DB, not in
  export bundles).

## Testing

- Vitest for `resolveDashboardRange`: month/quarter/year boundaries,
  December→January rollovers, fiscal April–March both before and after
  April, leap-February, All-time nulls, last12 window start.
- Hands-on in `tauri:dev`: back-filled 2025 vouchers appear under
  "All time" / "Last year" and disappear under "This month"; chip
  choice survives an app restart; per-business isolation (switch
  tenant → that tenant's own remembered chip).

## Versioning

Rides with the dashboard KPI-staleness fix already on this branch.
Minor feature bump → `0.144.0` → since main is already 0.144.0 via
PR #304's resolution, this PR bumps to `0.145.0`.
