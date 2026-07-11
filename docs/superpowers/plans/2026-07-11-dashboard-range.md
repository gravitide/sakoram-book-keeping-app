# Dashboard Date-Range Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A P&L-style preset chip row on the dashboard that drives the four flow widgets (Net cash tile, Monthly cash flow, Expenses by category, Top clients) over a user-picked period, persisted per business.

**Architecture:** Pure range math in `app/lib/dashboard-range.ts` (unit-tested); a `useDashboardRange()` composable owning preset state + localStorage persistence; `dashboard-data.ts`'s cash query parametrised by range; three chart components gain `from`/`to`/`rangeLabel` props replacing their hardcoded windows.

**Tech Stack:** Nuxt 4 / Vue 3 / Pinia / NuxtUI 4 / SQLite via `~/lib/db` / vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-dashboard-range-design.md`

## Global Constraints

- Default preset `last12`; persistence key `sakoram.dashboard.range.<tenantId>`; presets only (no custom fields).
- Snapshot widgets (receivables / payables / open quotes / aging / calendar / recent activity) unchanged.
- Ranges resolve at read time; `null` bound = unbounded (All time).
- Dates are ISO `YYYY-MM-DD` strings; comparisons are lexicographic.
- Gates: `bun run lint` + `bun run test`. Version → `0.145.0`.

---

### Task 1: `resolveDashboardRange` (TDD)

**Files:**
- Create: `app/lib/dashboard-range.ts`
- Test: `app/lib/dashboard-range.test.ts`

**Interfaces:**
- Produces: `DashboardRangePreset` union, `ResolvedDashboardRange { from, to, label }`, `DASHBOARD_RANGE_PRESETS: { id, label }[]`, `resolveDashboardRange(preset, today, fiscalYearStartMonth)`.

- [ ] **Step 1: Write failing tests** covering: last12 window start (2026-07-11 → from 2025-08-01), thisMonth/lastMonth bounds incl. January rollover, thisQuarter, thisYear/lastYear, fiscalYear April-start both before April (2026-02-10 → 2025-04-01..2026-03-31) and after (2026-07-11 → 2026-04-01..2027-03-31), fiscal January-start, allTime nulls, month-end `to` for lastMonth (leap Feb: 2024-03-05 lastMonth → 2024-02-01..2024-02-29).
- [ ] **Step 2: Run** `bun run test dashboard-range` → FAIL (module missing).
- [ ] **Step 3: Implement** — pure date math on ISO strings via `Date(y, m, d)` local constructors; `label` values: "Last 12 months", "This month", "Last month", "This quarter", "This year", "Last year", "Fiscal year", "All time".
- [ ] **Step 4: Run tests** → PASS. Full `bun run test` stays green.
- [ ] **Step 5: Commit** `feat: dashboard-range preset resolver (pure + tested)`.

### Task 2: `useDashboardRange` composable

**Files:**
- Create: `app/composables/useDashboardRange.ts`

**Interfaces:**
- Consumes: Task 1 exports; `useTenantsStore().activeTenantId`; `useSettingsStore()` for `fiscal_year_start_month`.
- Produces: `useDashboardRange()` → `{ preset: Ref<DashboardRangePreset>, range: ComputedRef<ResolvedDashboardRange>, presets }`.

- [ ] **Step 1: Implement** — hydrate preset from `localStorage["sakoram.dashboard.range.<tenantId>"]` (validate against the preset list, fall back `last12`); `watch(preset)` writes back; `range` computed calls `resolveDashboardRange(preset, todayISO(), settings?.fiscal_year_start_month ?? 4)`. Local `todayISO()` helper (same non-UTC pattern used across pages).
- [ ] **Step 2: Lint.** Commit `feat: useDashboardRange composable (persisted per business)`.

### Task 3: Range-parametrised cash KPI

**Files:**
- Modify: `app/lib/dashboard-data.ts`

**Interfaces:**
- Produces: `getCashFlowForRange(from: string | null, to: string | null)` (replaces `getCashFlowThisMonth`); `loadDashboardKpis(range: { from: string | null, to: string | null })`.

- [ ] **Step 1:** Rewrite the cash query: base `FROM vouchers` with `WHERE 1=1` + `AND voucher_date >= ?` / `AND voucher_date <= ?` appended per non-null bound (params array built alongside). Rename interface `CashFlowThisMonth` → `CashFlowKpis`. Thread `range` through `loadDashboardKpis`.
- [ ] **Step 2:** Lint + full test run. Commit `feat: range-parametrised dashboard cash KPI`.

### Task 4: Chart components accept the range

**Files:**
- Modify: `app/components/MonthlyCashFlowChart.vue`
- Modify: `app/components/ExpensesByCategoryChart.vue`
- Modify: `app/components/TopClientsChart.vue`

**Interfaces:**
- All three gain optional props `from?: string | null`, `to?: string | null`, `rangeLabel?: string`. Absent props preserve current behaviour (trailing windows) so any other caller is unaffected.

- [ ] **Step 1: MonthlyCashFlowChart** — `monthsBack` becomes the bar-count CAP (name kept). Month series: `endMonth` = month of `to` (else current month); `startMonth` = month of `from`; for `from == null` use the earliest `voucher_date` ≤ endMonth in the data (no vouchers → endMonth). If the span exceeds the cap, keep the most recent `cap` months. Bucket loop additionally skips vouchers outside `[from, to]` (full-date lexicographic compare). Bar/column geometry derives from the actual emitted month count, not the cap.
- [ ] **Step 2: ExpensesByCategoryChart** — replace `cutoffISO` filter with `[from, to]` bounds (absent → keep 90-day cutoff). Subtitle + empty-state copy use `rangeLabel ?? "Last 90 days"`.
- [ ] **Step 3: TopClientsChart** — same swap for the 365-day cutoff; copy uses `rangeLabel ?? "Last 12 months"`.
- [ ] **Step 4:** Lint. Commit `feat: dashboard charts accept an explicit date range`.

### Task 5: Dashboard page wiring

**Files:**
- Modify: `app/pages/index.vue`

**Interfaces:**
- Consumes: Tasks 1–4.

- [ ] **Step 1:** Instantiate `useDashboardRange()`. Chip row above the KPI grid: `v-for="p in presets"` UButton chips (xs, `variant="soft"`, active = `color="primary"` / inactive `color="neutral"` + `variant="ghost"` — match the list pages' date-preset chips' look), `@click="preset = p.id"`.
- [ ] **Step 2:** `refreshKpis` passes `{ from: range.value.from, to: range.value.to }` to `loadDashboardKpis`; add `watch(() => range.value, refreshKpis)` (deep not needed — computed returns fresh object; watch by reference of `from`+`to`+`label` via `watch(range, …)`).
- [ ] **Step 3:** Net cash tile: title `Net cash · {{ range.label }}` (drop `monthLabel` usage there); rename `receiptsThisMonth`/`paymentsThisMonth`/`netCashThisMonth` → `receiptsInRange`/`paymentsInRange`/`netCashInRange`.
- [ ] **Step 4:** Thread `:from="range.from" :to="range.to" :range-label="range.label"` into the three charts; update the two card subtitles that hardcode "last 12 months" / "last 90 days" to `{{ range.label }}`.
- [ ] **Step 5:** Lint + tests. Commit `feat: dashboard range chip row drives the flow widgets`.

### Task 6: Version + docs + verification

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock` → `0.145.0`
- Modify: `CLAUDE.md` — dashboard line in the pages tree mentions the range chips.

- [ ] **Step 1:** Bump + docs line. `bun run lint && bun run test` → green. Commit `chore: bump version to 0.145.0 + docs`.
- [ ] **Step 2: Hands-on** in `tauri:dev`: 2025-dated vouchers appear under All time / Last year, disappear under This month; chip persists across restart; per-tenant isolation.
