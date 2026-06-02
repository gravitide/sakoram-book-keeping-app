# PAYE / APIT auto-compute on payslips — design

**Date:** 2026-06-02
**Status:** Approved (design)
**Scope:** Sri Lankan PAYE / APIT (Advance Personal Income Tax) auto-compute
on payslips, monthly tax-table method. Builds on the EPF/ETF statutory
foundation (migration 0035, `app/lib/statutory.ts`).

---

## Goal

Auto-compute monthly PAYE (APIT) withholding on payslips using a
configurable progressive bracket table, as a managed deduction line —
mirroring the EPF/ETF managed-line architecture. This closes the last
remaining payroll gap (EPF/ETF already auto-compute).

## Domain model (Sri Lanka, 2025/2026)

APIT is monthly income tax the employer withholds and remits to the IRD.
The **monthly tax-table method** (IRD Table 1, regular profits) applies a
progressive table to each month's taxable remuneration, each payslip
standalone.

Current table (effective 2025-04-01):
- **Personal relief:** Rs 150,000 / month (Rs 1.8M / year).
- **Bands (annual → monthly):** 6% on first 1M (83,333.33/mo) · 18% next
  500k (41,666.67/mo) · 24% next 500k · 30% next 500k · 36% on the
  balance. (The pre-2025 12% slab was removed; first slab widened to 1M.)

**These rates change with national budgets**, so the table is
user-editable — never hardcoded.

## Decisions (from brainstorming)

1. **Method:** monthly tax-table (Table 1). Cumulative/YTD (Table 5) is
   out of scope.
2. **Table config:** editable relief + bands stored as JSON on
   `company_settings`, edited via a bracket-editor UI at
   `/settings/payroll`. Pre-seeded with the current SL table.
3. **PAYE base:** all earnings (gross). No per-line PAYE-exempt flag in v1.
4. **EPF deductibility:** configurable toggle "Deduct employee EPF before
   PAYE" (**default ON** — matches current SL calculator practice). SL
   guidance is contested, so the user matches their accountant.
5. **Master toggle default OFF** (PAYE withholding is employer/threshold
   specific — opt-in, unlike near-universal EPF which defaults on).
6. **Representation:** managed deduction line tagged `auto_source = 'paye'`
   (reuses the existing column; no new line column), live-recomputed.

---

## Architecture

### 1. Schema — migration 0036 (`SCHEMA_VERSION` → 36)

```sql
-- company_settings
ALTER TABLE company_settings ADD COLUMN paye_auto_compute INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN paye_relief_cents INTEGER NOT NULL DEFAULT 15000000;
ALTER TABLE company_settings ADD COLUMN paye_deduct_epf   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_settings ADD COLUMN paye_brackets     TEXT NOT NULL DEFAULT '[{"upToCents":8333333,"rateBp":600},{"upToCents":12500000,"rateBp":1800},{"upToCents":16666667,"rateBp":2400},{"upToCents":20833333,"rateBp":3000},{"upToCents":null,"rateBp":3600}]';

-- payslips
ALTER TABLE payslips ADD COLUMN paye_cents   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN paye_enabled INTEGER NOT NULL DEFAULT 0;
```

`paye_brackets` seed JSON (taxable-income upper bounds in cents; `null` =
open top band):

```json
[
  { "upToCents": 8333333,  "rateBp": 600 },
  { "upToCents": 12500000, "rateBp": 1800 },
  { "upToCents": 16666667, "rateBp": 2400 },
  { "upToCents": 20833333, "rateBp": 3000 },
  { "upToCents": null,     "rateBp": 3600 }
]
```

`payslip_lines` reuses `auto_source` (new value `'paye'`) — no new column.

Pre-1.0 additive `ALTER`s, no backfill. Register `0036_*.sql` in
`tenants.rs` MIGRATIONS, bump `SCHEMA_VERSION` → 36 in `data_io.rs`.
Existing payslips get `paye_cents 0` / `paye_enabled 0` (correct — no
PAYE line). No `TABLES` change (PRAGMA picks up new columns).

### 2. `app/lib/statutory.ts` — `computePaye`

Pure, no Vue/Pinia deps. Banker's rounding via shared `roundHalfEven`.

```ts
export interface PayeBracket {
  upToCents: number | null   // upper bound of TAXABLE income for this band; null = open top band
  rateBp: number
}
export interface PayeConfig {
  reliefCents: number
  brackets: PayeBracket[]
}

// baseCents is the PAYE base the caller already net of EPF if applicable
// (gross earnings − (deductEpf ? epfEmployeeCents : 0)). Returns tax cents.
export function computePaye(baseCents: number, config: PayeConfig): number
```

Algorithm: `taxable = max(0, trunc(baseCents) − reliefCents)`. Walk
brackets in order accumulating `Σ (min(taxable, upTo) − prevUpTo) × rateBp`
over bands the taxable income reaches (treat `null` upTo as `Infinity`),
in exact arithmetic, then `roundHalfEven(total / 10000)` **once** at the
end (closest to IRD's per-band formula; avoids per-band rounding drift).

Unit tests (`statutory.test.ts`): below relief → 0; exactly at relief → 0;
into first band; spanning several bands; into top open band; the
EPF-deduction effect (smaller base → smaller tax, verified via the base
the caller passes); custom brackets; empty brackets → 0.

### 3. Editor — `app/components/PayslipLineEditor.vue`

`syncManagedLine` extends from one managed line to **two**, in order:
1. EPF employee (`auto_source = 'epf_employee'`) — unchanged logic.
2. PAYE (`auto_source = 'paye'`) — base = Σ earning lines − (`payeDeductEpf`
   ? the EPF line amount : 0); `computePaye(base, payeConfig)`; upsert /
   remove the locked `'paye'` deduction line (label "PAYE (APIT)").

New props: `payeEnabled?: boolean`, `payeConfig?: { reliefCents, brackets,
deductEpf }`. Both managed lines are read-only (lock icon, no delete),
recompute on any earning/flag/rate/toggle change, and no-op while
`disabled` (immutability). PAYE is employee-only → the employer-
contributions block is unchanged.

Recompute order matters: EPF must be synced before PAYE (PAYE base may
subtract the EPF amount). `syncManagedLine` computes EPF first, reads the
resulting EPF line amount, then computes PAYE.

### 4. Store — `app/stores/payslips.ts`

- `PayslipRow` gains `paye_cents: number`, `paye_enabled: number`.
- `createPayslip`: seed `paye_enabled` from `settings.paye_auto_compute`;
  if enabled, compute PAYE on the seeded Basic earning (minus seeded EPF
  if `paye_deduct_epf`), insert the managed `'paye'` deduction line, store
  `paye_cents`, fold into the seeded `deductions_cents` / `net_cents`.
- `replaceLines`: already persists `auto_source` generically — no change.
- `PayslipUpdate` / `UPDATABLE`: add `paye_cents`, `paye_enabled`.
- The store reads PAYE settings via `useSettingsStore()` inside
  `createPayslip` (same pattern EPF uses).

### 5. Detail page — `app/pages/payslips/[id].vue`

- `payeEnabled` ref (seeded from `row.paye_enabled`, kept in sync in
  `hydrate`); `payeConfig` computed from the settings row (parse
  `paye_brackets` JSON, `paye_relief_cents`, `paye_deduct_epf`).
- Pass `:paye-enabled` + `:paye-config` to `PayslipLineEditor`.
- A second header toggle "Apply PAYE" (next to "Apply EPF/ETF"), shown
  only when editable; `formSnapshot` includes `payeEnabled` for dirty
  tracking.
- `onSave` (not-locked branch): compute PAYE from the same base and
  persist `paye_cents` + `paye_enabled` alongside the existing EPF
  columns. `deductions_cents`/`net_cents` already include the PAYE line
  via `replaceLines`.

### 6. Settings UI — `app/pages/settings/payroll.vue`

New "PAYE (APIT)" `UCard` below the statutory card:
- Master `USwitch` (`paye_auto_compute`).
- Relief `MoneyInput` (`paye_relief_cents`).
- "Deduct employee EPF before PAYE" `UCheckbox` (`paye_deduct_epf`).
- **Bracket editor**: a list of rows "Taxable income up to [MoneyInput] →
  [% input]"; the last band is "Balance → [%]" (its `upToCents` is null
  and not editable as an amount). Add / remove row buttons. Bands kept
  sorted by `upToCents`.
- Live preview: "On Rs 250,000 gross → PAYE Rs N" via `computePaye`.
- Persisted through the settings store (`paye_brackets` serialized to
  JSON on save). New columns added to `CompanySettingsRow` +
  `UPDATABLE_COLUMNS`.

### 7. PDF — no change

PAYE is a real deduction line, so it already renders in the payslip PDF's
Deductions table. No `payslip-pdf.ts` / `payslip.typ` change.

### 8. Bulk flow — no change

`createPayslip` seeds PAYE when enabled; bulk auto-pay already reads the
payslip's real `net_cents` (fixed earlier), which now includes the PAYE
deduction.

---

## Files touched

| File | Change |
|---|---|
| `src-tauri/migrations/0036_payslip_paye.sql` | new — columns + seed JSON |
| `src-tauri/src/tenants.rs` | register migration 36 |
| `src-tauri/src/data_io.rs` | `SCHEMA_VERSION` → 36 |
| `app/lib/statutory.ts` | add `computePaye` + types |
| `app/lib/statutory.test.ts` | PAYE unit tests |
| `app/stores/settings.ts` | 4 new columns on row + UPDATABLE |
| `app/pages/settings/payroll.vue` | PAYE card + bracket editor |
| `app/stores/payslips.ts` | seed/persist PAYE; row type + UPDATABLE |
| `app/components/PayslipLineEditor.vue` | two managed lines; PAYE props |
| `app/pages/payslips/[id].vue` | PAYE toggle + config props + persist |
| `CLAUDE.md` | document migration 0036 + PAYE feature |
| version files | minor bump |

## Out of scope (explicit)

- Cumulative / YTD APIT (IRD Table 5).
- Lump-sum / bonus tables (Table 2+).
- Per-line PAYE-exempt flags.
- Multi-employment / primary-vs-secondary relief apportionment.
- Tax on non-cash benefits beyond what the user enters as earning lines.
