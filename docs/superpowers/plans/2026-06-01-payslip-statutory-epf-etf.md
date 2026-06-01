# Statutory auto-compute (EPF / ETF) on payslips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-compute Sri Lankan EPF (employee 8% deduction; employer 12%) and ETF (employer 3%) on payslips, configurable from settings, with a live-recomputed managed deduction line and stored/printed employer contributions.

**Architecture:** A pure `lib/statutory.ts` module does the math (basis-point rates × liable-earnings base, banker's rounding). The employee EPF deduction is a real, tagged `payslip_lines` row (`auto_source='epf_employee'`) so existing totals/PDF paths need no special-casing. Employer EPF/ETF are stored as columns on the payslip row and rendered on the PDF. Rates + a master toggle live on `company_settings`, edited at `/settings/payroll`.

**Tech Stack:** Nuxt 4 (SSG), Pinia, NuxtUI 4, TypeScript strict, SQLite via tauri-plugin-sql, Vitest, Typst (PDF). Package manager: **bun**. Shell: bash on Windows.

**Spec:** `docs/superpowers/specs/2026-06-01-payslip-statutory-epf-etf-design.md`

**Conventions (load-bearing — see CLAUDE.md):**
- Money is integer cents; rates are basis points (8% = 800).
- Tabs for indentation; `bun run lint` auto-fixes most style.
- Branch already created: `feat/payslip-statutory-epf-etf`. Commit frequently.
- A new migration must be registered in `tenants.rs` MIGRATIONS **and** bump `SCHEMA_VERSION` in `data_io.rs`, or it silently never runs.
- DB INTEGER 0/1 booleans are read as `number` in TS.

---

## File Structure

- `app/lib/money.ts` — export the existing private `roundHalfEven`. (`BP_DENOM` stays private; `statutory.ts` declares its own `10000` constant.)
- `app/lib/statutory.ts` — NEW. Pure `computeStatutory()`.
- `app/lib/statutory.test.ts` — NEW. Vitest.
- `src-tauri/migrations/0035_payslip_statutory.sql` — NEW.
- `src-tauri/src/tenants.rs` — register migration 35.
- `src-tauri/src/data_io.rs` — bump `SCHEMA_VERSION` → 35.
- `app/stores/settings.ts` — 4 new columns on row type + UPDATABLE list.
- `app/pages/settings/payroll.vue` — statutory config card.
- `app/stores/payslips.ts` — line/row types, createPayslip seed, replaceLines persists new line cols, statutory columns persisted.
- `app/components/PayslipLineEditor.vue` — EPF checkbox per earning, managed line, live recompute, employer block; new props.
- `app/pages/payslips/[id].vue` — pass rates + statutory_enabled to editor; persist statutory columns on save.
- `app/lib/payslip-pdf.ts` — employer-contribution payload fields.
- `src-tauri/templates/payslip.typ` — employer-contribution section.
- `CLAUDE.md` — mark shipped + document migration 0035.
- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` — version 0.98.0 → 0.99.0.

---

### Task 1: Pure statutory math module (`lib/statutory.ts`)

**Files:**
- Modify: `app/lib/money.ts` (export `roundHalfEven`)
- Create: `app/lib/statutory.ts`
- Test: `app/lib/statutory.test.ts`

- [ ] **Step 1: Export `roundHalfEven` from money.ts**

In `app/lib/money.ts`, change the private declaration (around line 83) from:

```ts
const roundHalfEven = (n: number): number => {
```

to:

```ts
export const roundHalfEven = (n: number): number => {
```

Leave `BP_DENOM` private (statutory.ts uses its own constant).

- [ ] **Step 2: Write the failing test**

Create `app/lib/statutory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeStatutory, type StatutoryRates } from "~/lib/statutory";

const SL: StatutoryRates = { epfEmployeeBp: 800, epfEmployerBp: 1200, etfBp: 300 };

describe("computeStatutory", () => {
	it("computes SL defaults on Rs 100,000 (10,000,000 cents)", () => {
		const r = computeStatutory(10_000_000, SL);
		expect(r.baseCents).toBe(10_000_000);
		expect(r.epfEmployeeCents).toBe(800_000); // 8%
		expect(r.epfEmployerCents).toBe(1_200_000); // 12%
		expect(r.etfCents).toBe(300_000); // 3%
	});

	it("returns all zeros for a zero base", () => {
		const r = computeStatutory(0, SL);
		expect(r).toEqual({ baseCents: 0, epfEmployeeCents: 0, epfEmployerCents: 0, etfCents: 0 });
	});

	it("uses banker's (half-even) rounding", () => {
		// base where 8% lands on a .5 cent boundary: 12.5 cents -> round half to even = 12
		// 156.25 cents * 800 / 10000 = 12.5 -> 12 (even)
		expect(computeStatutory(15_625, SL).epfEmployeeCents).toBe(12);
		// 187.5 cents * 800 / 10000 = 15.0 -> 15 (exact, sanity)
		expect(computeStatutory(18_750, SL).epfEmployeeCents).toBe(15);
	});

	it("honours custom rates", () => {
		const r = computeStatutory(1_000_000, { epfEmployeeBp: 1000, epfEmployerBp: 0, etfBp: 0 });
		expect(r.epfEmployeeCents).toBe(100_000);
		expect(r.epfEmployerCents).toBe(0);
		expect(r.etfCents).toBe(0);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test app/lib/statutory.test.ts`
Expected: FAIL — `Cannot find module '~/lib/statutory'` / `computeStatutory is not a function`.

- [ ] **Step 4: Write the implementation**

Create `app/lib/statutory.ts`:

```ts
// Pure Sri Lankan statutory contribution math (EPF + ETF).
//
// No Pinia / Vue deps so it is trivially unit-testable — same shape as
// reconcile-match.ts and payroll-cycle.ts. Rates are basis points
// (golden rule #3): 8% = 800. All amounts are integer cents computed
// with banker's (half-even) rounding, mirroring computeLineTotals in
// money.ts. PAYE/APIT is deliberately out of scope.

import { roundHalfEven } from "~/lib/money";

const BP_DENOM = 10000;

export interface StatutoryRates {
	epfEmployeeBp: number
	epfEmployerBp: number
	etfBp: number
}

export interface StatutoryResult {
	baseCents: number
	epfEmployeeCents: number
	epfEmployerCents: number
	etfCents: number
}

// liableEarningCents = Σ of earning lines flagged EPF-liable.
export function computeStatutory(
	liableEarningCents: number,
	rates: StatutoryRates
): StatutoryResult {
	const base = Math.max(0, Math.trunc(liableEarningCents));
	const pct = (bp: number) => roundHalfEven((base * bp) / BP_DENOM);
	return {
		baseCents: base,
		epfEmployeeCents: pct(rates.epfEmployeeBp),
		epfEmployerCents: pct(rates.epfEmployerBp),
		etfCents: pct(rates.etfBp)
	};
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test app/lib/statutory.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Lint + commit**

```bash
bun run lint
git add app/lib/money.ts app/lib/statutory.ts app/lib/statutory.test.ts
git commit -m "feat(payroll): pure EPF/ETF statutory math module"
```

---

### Task 2: Migration 0035 (schema columns)

**Files:**
- Create: `src-tauri/migrations/0035_payslip_statutory.sql`
- Modify: `src-tauri/src/tenants.rs` (MIGRATIONS array, ~line 79)
- Modify: `src-tauri/src/data_io.rs` (SCHEMA_VERSION, line 37)

- [ ] **Step 1: Write the migration SQL**

Create `src-tauri/migrations/0035_payslip_statutory.sql`:

```sql
-- Phase: payroll — statutory auto-compute (EPF + ETF).
--
-- Adds the per-business rate config + master toggle to company_settings,
-- a per-line EPF-liable flag + auto-source tag on payslip_lines, and
-- the stored employer-contribution figures + per-payslip enable flag on
-- payslips. Rates are basis points (golden rule #3): 8% = 800.
--
-- Pre-1.0 additive ALTERs with SL-default seeds; no backfill. Existing
-- payslips keep auto_source NULL / epf_liable 1 / employer cols 0, which
-- is correct — they simply carry no managed EPF line.

ALTER TABLE company_settings ADD COLUMN statutory_auto_compute INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_settings ADD COLUMN epf_employee_rate_bp   INTEGER NOT NULL DEFAULT 800;
ALTER TABLE company_settings ADD COLUMN epf_employer_rate_bp   INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE company_settings ADD COLUMN etf_rate_bp            INTEGER NOT NULL DEFAULT 300;

ALTER TABLE payslip_lines ADD COLUMN epf_liable  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE payslip_lines ADD COLUMN auto_source TEXT;

ALTER TABLE payslips ADD COLUMN epf_employee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN epf_employer_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN etf_cents          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN statutory_enabled  INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 2: Register the migration in tenants.rs**

In `src-tauri/src/tenants.rs`, in the `MIGRATIONS` array, add after the `(34, ...)` line (currently line 79, before the closing `];`):

```rust
	(35, "payslip statutory", include_str!("../migrations/0035_payslip_statutory.sql")),
```

- [ ] **Step 3: Bump SCHEMA_VERSION**

In `src-tauri/src/data_io.rs` line 37, change:

```rust
const SCHEMA_VERSION: i32 = 34;
```

to:

```rust
const SCHEMA_VERSION: i32 = 35;
```

(No `TABLES` change — no new tables; `PRAGMA table_info` picks up new columns for export automatically.)

- [ ] **Step 4: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles clean (warnings OK). Then `cd ..`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/migrations/0035_payslip_statutory.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs
git commit -m "feat(payroll): migration 0035 — statutory rate config + payslip columns"
```

---

### Task 3: Settings store + payroll settings UI

**Files:**
- Modify: `app/stores/settings.ts` (`CompanySettingsRow`, `UPDATABLE_COLUMNS`)
- Modify: `app/pages/settings/payroll.vue` (statutory config card)

- [ ] **Step 1: Add columns to the settings row type**

In `app/stores/settings.ts`, in `CompanySettingsRow`, add after `payroll_pay_day: number` (line 44):

```ts
	// Statutory auto-compute (EPF + ETF). Rates are basis points
	// (8% = 800). statutory_auto_compute is the master toggle that seeds
	// each new payslip's statutory_enabled. See app/lib/statutory.ts.
	statutory_auto_compute: number
	epf_employee_rate_bp: number
	epf_employer_rate_bp: number
	etf_rate_bp: number
```

- [ ] **Step 2: Add columns to the UPDATABLE whitelist**

In the same file, in `UPDATABLE_COLUMNS`, add after `"payroll_pay_day",` (line 86):

```ts
	"statutory_auto_compute",
	"epf_employee_rate_bp",
	"epf_employer_rate_bp",
	"etf_rate_bp",
```

- [ ] **Step 3: Add the statutory config card to the payroll settings page**

In `app/pages/settings/payroll.vue`, add a new `UCard` inside the `<div class="space-y-6 max-w-2xl mx-auto">` block, after the existing "Cycle template" `UCard` (after line 73's `</UCard>`):

```vue
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<div class="font-medium">
							Statutory contributions (EPF / ETF)
						</div>
						<USwitch v-model="statutoryOn" />
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						When on, new payslips auto-add the employee EPF deduction and
						show employer EPF + ETF contributions. Rates are percentages of
						EPF-liable earnings. Sri Lankan defaults: EPF 8% / 12%, ETF 3%.
					</div>
				</template>

				<div class="space-y-5" :class="statutoryOn ? '' : 'opacity-50 pointer-events-none'">
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<UFormField label="EPF — employee" help="Deducted from net pay.">
							<UInputNumber v-model="epfEmployeePct" :min="0" :max="100" :step="0.1" />
						</UFormField>
						<UFormField label="EPF — employer" help="Business cost, not deducted.">
							<UInputNumber v-model="epfEmployerPct" :min="0" :max="100" :step="0.1" />
						</UFormField>
						<UFormField label="ETF — employer" help="Business cost, not deducted.">
							<UInputNumber v-model="etfPct" :min="0" :max="100" :step="0.1" />
						</UFormField>
					</div>

					<div class="rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-3 text-sm">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) mb-1">
							Preview — on {{ formatMoney(previewBase) }} liable earnings
						</div>
						<div class="tabular-nums">
							EPF employee <span class="font-medium">{{ formatMoney(previewStatutory.epfEmployeeCents) }}</span>
							· EPF employer <span class="font-medium">{{ formatMoney(previewStatutory.epfEmployerCents) }}</span>
							· ETF <span class="font-medium">{{ formatMoney(previewStatutory.etfCents) }}</span>
						</div>
					</div>
				</div>
			</UCard>
```

- [ ] **Step 4: Wire the statutory refs + save in the script**

In `app/pages/settings/payroll.vue` `<script setup>`:

Add imports — change the existing import line:

```ts
	import { formatMonthLabel, resolvePayrollCycle } from "~/lib/payroll-cycle";
```

to also import money + statutory:

```ts
	import { formatMonthLabel, resolvePayrollCycle } from "~/lib/payroll-cycle";
	import { formatMoney } from "~/lib/money";
	import { computeStatutory } from "~/lib/statutory";
```

After the existing `payDay` ref (line 91), add:

```ts
	// Statutory config. Percentages in the UI, basis points in the DB
	// (8% <-> 800). Round on the bp boundary so 8.1% survives the trip.
	const statutoryOn = ref<boolean>((store.settings?.statutory_auto_compute ?? 1) === 1);
	const epfEmployeePct = ref<number>((store.settings?.epf_employee_rate_bp ?? 800) / 100);
	const epfEmployerPct = ref<number>((store.settings?.epf_employer_rate_bp ?? 1200) / 100);
	const etfPct = ref<number>((store.settings?.etf_rate_bp ?? 300) / 100);

	const toBp = (pct: number) => Math.round((pct || 0) * 100);

	const previewBase = 10_000_000; // Rs 100,000 in cents
	const previewStatutory = computed(() => computeStatutory(previewBase, {
		epfEmployeeBp: toBp(epfEmployeePct.value),
		epfEmployerBp: toBp(epfEmployerPct.value),
		etfBp: toBp(etfPct.value)
	}));
```

Replace the `initial` ref (lines 93-97) to also track statutory state:

```ts
	const initial = ref({
		start: periodStart.value,
		end: periodEnd.value,
		pay: payDay.value,
		on: statutoryOn.value,
		epfEmp: epfEmployeePct.value,
		epfEr: epfEmployerPct.value,
		etf: etfPct.value
	});
```

Replace the `dirty` computed (lines 99-103):

```ts
	const dirty = computed(() =>
		periodStart.value !== initial.value.start
		|| periodEnd.value !== initial.value.end
		|| payDay.value !== initial.value.pay
		|| statutoryOn.value !== initial.value.on
		|| epfEmployeePct.value !== initial.value.epfEmp
		|| epfEmployerPct.value !== initial.value.epfEr
		|| etfPct.value !== initial.value.etf
	);
```

In `onSave`, extend the `store.save({...})` call (lines 123-127) to include the statutory fields:

```ts
			await store.save({
				payroll_period_start_day: periodStart.value,
				payroll_period_end_day: periodEnd.value,
				payroll_pay_day: payDay.value,
				statutory_auto_compute: statutoryOn.value ? 1 : 0,
				epf_employee_rate_bp: toBp(epfEmployeePct.value),
				epf_employer_rate_bp: toBp(epfEmployerPct.value),
				etf_rate_bp: toBp(etfPct.value)
			});
```

And extend the `initial.value = {...}` reset right after (lines 128-132):

```ts
			initial.value = {
				start: periodStart.value,
				end: periodEnd.value,
				pay: payDay.value,
				on: statutoryOn.value,
				epfEmp: epfEmployeePct.value,
				epfEr: epfEmployerPct.value,
				etf: etfPct.value
			};
```

And extend the `reset()` fn (lines 146-150):

```ts
	const reset = () => {
		periodStart.value = initial.value.start;
		periodEnd.value = initial.value.end;
		payDay.value = initial.value.pay;
		statutoryOn.value = initial.value.on;
		epfEmployeePct.value = initial.value.epfEmp;
		epfEmployerPct.value = initial.value.epfEr;
		etfPct.value = initial.value.etf;
	};
```

- [ ] **Step 5: Lint + manual smoke (dev)**

Run: `bun run lint`
Then run the app (`bun run tauri:dev`), open `/settings/payroll`, confirm the Statutory card renders, the preview updates as you type, the switch disables the inputs, and Save persists (reload page → values stick).

- [ ] **Step 6: Commit**

```bash
git add app/stores/settings.ts app/pages/settings/payroll.vue
git commit -m "feat(payroll): statutory rate config on settings/payroll"
```

---

### Task 4: Payslips store — types, seed, persist

**Files:**
- Modify: `app/stores/payslips.ts`

- [ ] **Step 1: Extend line + row types**

In `app/stores/payslips.ts`:

In `PayslipLineRow` (after `amount_cents: number`, line 81) add:

```ts
	// EPF-liable flag (0/1) — meaningful on earning lines; the EPF/ETF
	// base is the sum of liable earnings. auto_source tags machine-owned
	// lines: NULL = manual, 'epf_employee' = the managed EPF deduction.
	epf_liable: number
	auto_source: string | null
```

In `PayslipRow` (after `net_cents: number`, line 47) add:

```ts
	// Frozen statutory figures (cents). epf_employee_cents mirrors the
	// managed EPF deduction line; the employer figures are not deducted
	// from net. statutory_enabled is the per-payslip toggle, seeded from
	// company_settings.statutory_auto_compute at create.
	epf_employee_cents: number
	epf_employer_cents: number
	etf_cents: number
	statutory_enabled: number
```

- [ ] **Step 2: Seed statutory on createPayslip**

In `createPayslip`, add a settings import at top of file (after the existing store imports near line 21):

```ts
import { useSettingsStore } from "~/stores/settings";
```

Inside `createPayslip`, after computing `snap` (line 269), resolve the statutory seed:

```ts
		const settings = useSettingsStore();
		await settings.ensureLoaded();
		const statutoryOn = (settings.settings?.statutory_auto_compute ?? 1) === 1;
		const basic = input.employee.basic_salary_cents;
		const stat = statutoryOn
			? computeStatutory(basic, {
				epfEmployeeBp: settings.settings?.epf_employee_rate_bp ?? 800,
				epfEmployerBp: settings.settings?.epf_employer_rate_bp ?? 1200,
				etfBp: settings.settings?.etf_rate_bp ?? 300
			})
			: { baseCents: 0, epfEmployeeCents: 0, epfEmployerCents: 0, etfCents: 0 };
		const deductionsSeed = stat.epfEmployeeCents;
		const netSeed = Math.max(0, basic - deductionsSeed);
```

Add the statutory import alongside the existing `sumCents` import (line 19):

```ts
import { computeStatutory } from "~/lib/statutory";
```

Replace the `INSERT INTO payslips (...)` statement (lines 273-291) so it persists the statutory columns + seeded deductions/net:

```ts
		const result = await execute(
			`INSERT INTO payslips (
				number, fiscal_year, employee_id, employee_snapshot, employee_name,
				period_start, period_end, pay_date,
				earnings_cents, deductions_cents, net_cents, status,
				epf_employee_cents, epf_employer_cents, etf_cents, statutory_enabled
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
			[
				allocation.number,
				allocation.fiscalYear,
				input.employee.id,
				snap,
				input.employee.full_name,
				input.periodStart,
				input.periodEnd,
				input.payDate,
				basic,
				deductionsSeed,
				netSeed,
				stat.epfEmployeeCents,
				stat.epfEmployerCents,
				stat.etfCents,
				statutoryOn ? 1 : 0
			]
		);
```

After getting `id` and inserting the Basic earning line (the existing block lines 294-301), add the managed EPF deduction line when statutory is on and there is something to deduct:

```ts
		if (statutoryOn && stat.epfEmployeeCents > 0) {
			const epfPct = (settings.settings?.epf_employee_rate_bp ?? 800) / 100;
			await execute(
				`INSERT INTO payslip_lines (
					payslip_id, sort_order, kind, label, amount_cents, epf_liable, auto_source
				) VALUES (?, 1, 'deduction', ?, ?, 0, 'epf_employee')`,
				[id, `EPF (${epfPct}%)`, stat.epfEmployeeCents]
			);
		}
```

Note: the existing Basic earning INSERT (lines 296-300) must also set the new columns. Change it to:

```ts
			await execute(
				`INSERT INTO payslip_lines (
					payslip_id, sort_order, kind, label, amount_cents, epf_liable, auto_source
				) VALUES (?, 0, 'earning', 'Basic', ?, 1, NULL)`,
				[id, input.employee.basic_salary_cents]
			);
```

- [ ] **Step 3: Persist new line columns in replaceLines**

In `replaceLines`, change the per-line INSERT (lines 341-346) to include the two new columns:

```ts
			await execute(
				`INSERT INTO payslip_lines (
					payslip_id, sort_order, kind, label, amount_cents, epf_liable, auto_source
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[payslipId, i, l.kind, l.label, l.amount_cents, l.epf_liable ?? 1, l.auto_source ?? null]
			);
```

- [ ] **Step 4: Add statutory columns to PayslipLineDraft + UPDATABLE**

`PayslipLineDraft` is `Omit<PayslipLineRow, "id" | "payslip_id">` (line 84) — it now includes `epf_liable` + `auto_source` automatically. No change needed there.

Extend `PayslipUpdate` (lines 306-307) and `UPDATABLE` (lines 309-317) to allow persisting the statutory figures + enable flag:

```ts
	type PayslipUpdate = Partial<Pick<PayslipRow, | "period_start" | "period_end" | "pay_date"
		| "earnings_cents" | "deductions_cents" | "net_cents" | "notes"
		| "epf_employee_cents" | "epf_employer_cents" | "etf_cents" | "statutory_enabled">>;

	const UPDATABLE: ReadonlyArray<keyof PayslipUpdate> = [
		"period_start",
		"period_end",
		"pay_date",
		"earnings_cents",
		"deductions_cents",
		"net_cents",
		"notes",
		"epf_employee_cents",
		"epf_employer_cents",
		"etf_cents",
		"statutory_enabled"
	];
```

- [ ] **Step 5: Verify the project type-checks / lints**

Run: `bun run lint`
Expected: no errors. (Type errors here would surface as eslint/tsc failures.)

- [ ] **Step 6: Commit**

```bash
git add app/stores/payslips.ts
git commit -m "feat(payroll): seed + persist statutory figures in payslips store"
```

---

### Task 5: Line editor (managed line + live recompute) and detail-page wiring

**Files:**
- Modify: `app/components/PayslipLineEditor.vue`
- Modify: `app/pages/payslips/[id].vue`

- [ ] **Step 1: Add props + statutory plumbing to PayslipLineEditor**

In `app/components/PayslipLineEditor.vue` `<script setup>`, replace the `Props` block + emits (lines 135-140) with:

```ts
	import type { PayslipLineDraft } from "~/stores/payslips";
	import { formatMoney } from "~/lib/money";
	import { computeStatutory, type StatutoryRates } from "~/lib/statutory";

	interface Props {
		modelValue: PayslipLineDraft[]
		disabled?: boolean
		statutoryEnabled?: boolean
		rates?: StatutoryRates
		epfEmployeeRateBp?: number
	}
	const props = withDefaults(defineProps<Props>(), {
		disabled: false,
		statutoryEnabled: false,
		rates: () => ({ epfEmployeeBp: 800, epfEmployerBp: 1200, etfBp: 300 }),
		epfEmployeeRateBp: 800
	});
	const emit = defineEmits<{ "update:modelValue": [value: PayslipLineDraft[]] }>();
```

(Remove the now-duplicated `import { formatMoney }` line further down at line 133.)

- [ ] **Step 2: Add the recompute helper and call it from onChange + a watcher**

Still in `<script setup>`, after the `onChange` function (line 162), add the managed-line recompute. The base is the sum of EPF-liable earning lines; the managed deduction line is upserted/removed in place:

```ts
	// EPF-liable earnings base = Σ earning lines flagged epf_liable.
	const liableBase = () =>
		lines
			.filter((l) => l.kind === "earning" && (l.epf_liable ?? 1) === 1)
			.reduce((s, l) => s + (l.amount_cents || 0), 0);

	// Insert / update / remove the machine-owned EPF deduction line so it
	// always reflects current liable earnings. Manual lines are untouched.
	// No-op while disabled (issued/cancelled payslips are immutable).
	const syncManagedLine = () => {
		if (props.disabled) return;
		const idx = lines.findIndex((l) => l.auto_source === "epf_employee");
		if (!props.statutoryEnabled) {
			if (idx !== -1) lines.splice(idx, 1);
			return;
		}
		const stat = computeStatutory(liableBase(), props.rates);
		const label = `EPF (${props.epfEmployeeRateBp / 100}%)`;
		if (stat.epfEmployeeCents <= 0) {
			if (idx !== -1) lines.splice(idx, 1);
			return;
		}
		if (idx === -1) {
			lines.push({ sort_order: lines.length, kind: "deduction", label, amount_cents: stat.epfEmployeeCents, epf_liable: 0, auto_source: "epf_employee" });
		} else {
			lines[idx]!.label = label;
			lines[idx]!.amount_cents = stat.epfEmployeeCents;
		}
	};

	// Employer-side figures (display only — not part of net).
	const employer = computed(() =>
		props.statutoryEnabled
			? computeStatutory(liableBase(), props.rates)
			: { baseCents: 0, epfEmployeeCents: 0, epfEmployerCents: 0, etfCents: 0 }
	);
```

Then make `onChange` resync before emitting. Replace `onChange` (lines 156-162) with:

```ts
	const onChange = () => {
		syncManagedLine();
		// Reassign sort_order so the persisted positions match what's on screen.
		lines.forEach((l, i) => {
			l.sort_order = i;
		});
		emit("update:modelValue", lines.map((l) => ({ ...l })));
	};
```

Add a watcher so toggling statutory on/off or changing rates from the parent recomputes too. After the existing `watch(() => props.modelValue, ...)` block (lines 151-154), add:

```ts
	watch(() => [props.statutoryEnabled, props.rates] as const, () => {
		onChange();
	}, { deep: true });
```

- [ ] **Step 2b: Ensure addLine seeds the new fields**

Replace `addLine` (lines 164-167) so new lines carry the columns:

```ts
	const addLine = (kind: "earning" | "deduction") => {
		lines.push({ sort_order: lines.length, kind, label: "", amount_cents: 0, epf_liable: kind === "earning" ? 1 : 0, auto_source: null });
		onChange();
	};
```

And the local `lines` init (lines 145-147) — map the incoming drafts preserving the new fields (spread already copies them, but be explicit about defaults for older drafts):

```ts
	const lines = reactive<PayslipLineDraft[]>(
		props.modelValue.map((l, i) => ({ ...l, sort_order: i, epf_liable: l.epf_liable ?? 1, auto_source: l.auto_source ?? null }))
	);
```

Do the same inside the `watch` that resyncs from the parent (line 153):

```ts
		lines.splice(0, lines.length, ...next.map((l, i) => ({ ...l, sort_order: i, epf_liable: l.epf_liable ?? 1, auto_source: l.auto_source ?? null })));
```

- [ ] **Step 3: Render the EPF checkbox per earning + lock the managed line**

In the earnings row grid (template lines 30-55), change the grid to add an EPF checkbox column and bind it. Replace the earnings `v-for` block with:

```vue
				<div
					v-for="(line, idx) in earningLines"
					:key="`earn-${earningIndices[idx]}`"
					class="grid grid-cols-[1fr_auto_180px_auto] gap-2 items-center"
				>
					<UInput
						v-model="line.label"
						placeholder="e.g. Basic, Travel allowance, Overtime"
						:disabled="disabled"
						@input="onChange"
					/>
					<UCheckbox
						v-model="line.epf_liable"
						:disabled="disabled || !statutoryEnabled"
						:true-value="1"
						:false-value="0"
						label="EPF"
						title="Include this earning in the EPF/ETF base"
						@update:model-value="onChange"
					/>
					<MoneyInput
						v-model="line.amount_cents"
						:disabled="disabled"
						@update:model-value="onChange"
					/>
					<UButton
						icon="i-lucide-trash-2"
						variant="ghost"
						color="neutral"
						size="xs"
						:disabled="disabled"
						aria-label="Remove line"
						@click="removeAt(earningIndices[idx]!)"
					/>
				</div>
```

In the deductions `v-for` block (template lines 90-114), make the managed line read-only: disable its inputs and swap the trash button for a lock badge. Replace that block with:

```vue
				<div
					v-for="(line, idx) in deductionLines"
					:key="`ded-${deductionIndices[idx]}`"
					class="grid grid-cols-[1fr_180px_auto] gap-2 items-center"
				>
					<UInput
						v-model="line.label"
						placeholder="e.g. EPF (8%), PAYE, Salary advance"
						:disabled="disabled || line.auto_source === 'epf_employee'"
						@input="onChange"
					/>
					<MoneyInput
						v-model="line.amount_cents"
						:disabled="disabled || line.auto_source === 'epf_employee'"
						@update:model-value="onChange"
					/>
					<div v-if="line.auto_source === 'epf_employee'" class="flex items-center justify-center" title="Auto-computed from EPF-liable earnings">
						<UIcon name="i-lucide-lock" class="size-4 text-(--ui-text-muted)" />
					</div>
					<UButton
						v-else
						icon="i-lucide-trash-2"
						variant="ghost"
						color="neutral"
						size="xs"
						:disabled="disabled"
						aria-label="Remove line"
						@click="removeAt(deductionIndices[idx]!)"
					/>
				</div>
```

- [ ] **Step 4: Render the employer-contributions block**

After the Net pay block (template lines 123-127), add the employer block:

```vue
			<!-- Employer contributions — not deducted from net; shown for the
				true cost of employment. -->
			<div
				v-if="statutoryEnabled && (employer.epfEmployerCents > 0 || employer.etfCents > 0)"
				class="border-t border-(--ui-border) pt-4 space-y-1 text-sm tabular-nums"
			>
				<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
					Employer contributions (not deducted)
				</div>
				<div class="flex justify-between">
					<span class="text-(--ui-text-muted)">EPF (employer)</span>
					<span>{{ formatMoney(employer.epfEmployerCents) }}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-(--ui-text-muted)">ETF (employer)</span>
					<span>{{ formatMoney(employer.etfCents) }}</span>
				</div>
				<div class="flex justify-between font-medium pt-1">
					<span>Total cost of employment</span>
					<span>{{ formatMoney(earningsTotal + employer.epfEmployerCents + employer.etfCents) }}</span>
				</div>
			</div>
```

- [ ] **Step 5: Wire the detail page — pass props + persist statutory on save**

In `app/pages/payslips/[id].vue`:

Add the statutory import near the other lib imports (line 371):

```ts
	import { computeStatutory } from "~/lib/statutory";
```

Add computed rates + enabled, after `locked` (line 457):

```ts
	const statRates = computed(() => ({
		epfEmployeeBp: settingsStore.settings?.epf_employee_rate_bp ?? 800,
		epfEmployerBp: settingsStore.settings?.epf_employer_rate_bp ?? 1200,
		etfBp: settingsStore.settings?.etf_rate_bp ?? 300
	}));
	// Per-payslip toggle, defaulting to the row value (seeded from settings
	// at create). A local ref so the editor toggle can flip it live.
	const statutoryEnabled = ref<boolean>((row.value?.statutory_enabled ?? 0) === 1);
```

In `hydrate`, after `form.lines = linesToDrafts(lines);` (line 444) keep the ref in sync:

```ts
		statutoryEnabled.value = (r.statutory_enabled ?? 0) === 1;
```

Pass the props to the editor — replace the `<PayslipLineEditor ... />` line (147):

```vue
					<PayslipLineEditor
						v-model="form.lines"
						:disabled="locked"
						:statutory-enabled="statutoryEnabled"
						:rates="statRates"
						:epf-employee-rate-bp="statRates.epfEmployeeBp"
					/>
```

Add a header toggle above the editor card so the user can switch statutory off for this payslip. Replace the "Earnings & deductions" card header (template lines 137-146) with:

```vue
					<template #header>
						<div class="flex items-center justify-between">
							<h2 class="font-semibold">
								Earnings & deductions
							</h2>
							<div class="flex items-center gap-3">
								<label v-if="!locked" class="flex items-center gap-2 text-xs text-(--ui-text-muted)">
									Apply EPF / ETF
									<USwitch v-model="statutoryEnabled" />
								</label>
								<span class="text-xs text-(--ui-text-muted)">
									{{ locked ? `Locked — payslip is ${row?.status}` : "Edit until you mark it issued" }}
								</span>
							</div>
						</div>
					</template>
```

In `onSave`, the not-locked branch must persist statutory columns. Replace the `else { ... }` branch (lines 497-507) with:

```ts
			} else {
				const totals = await store.replaceLines(row.value.id, form.lines);
				const liableBase = form.lines
					.filter((l) => l.kind === "earning" && (l.epf_liable ?? 1) === 1)
					.reduce((s, l) => s + l.amount_cents, 0);
				const stat = statutoryEnabled.value
					? computeStatutory(liableBase, statRates.value)
					: { baseCents: 0, epfEmployeeCents: 0, epfEmployerCents: 0, etfCents: 0 };
				await store.update(row.value.id, {
					period_start: form.period_start ?? row.value.period_start,
					period_end: form.period_end ?? row.value.period_end,
					pay_date: form.pay_date ?? row.value.pay_date,
					notes: form.notes.trim() || null,
					earnings_cents: totals.earnings_cents,
					deductions_cents: totals.deductions_cents,
					net_cents: totals.net_cents,
					epf_employee_cents: stat.epfEmployeeCents,
					epf_employer_cents: stat.epfEmployerCents,
					etf_cents: stat.etfCents,
					statutory_enabled: statutoryEnabled.value ? 1 : 0
				});
			}
```

Make `statutoryEnabled` part of the dirty tracking so toggling it enables the save bar. The `dirty` computed compares `formSnapshot` (a JSON of `form`). Add `statutoryEnabled` into the form-reactive instead: in `FormState` (lines 411-417) add `statutory_enabled: boolean` and seed it. Simpler: extend `formSnapshot` to include the toggle. Replace `formSnapshot` (line 449):

```ts
	const formSnapshot = computed(() => JSON.stringify({ ...form, statutoryEnabled: statutoryEnabled.value }));
```

- [ ] **Step 6: Lint**

Run: `bun run lint`
Expected: clean.

- [ ] **Step 7: Manual verification (dev)**

Run `bun run tauri:dev`. With statutory on in settings:
1. Create a new payslip → an `EPF (8%)` locked deduction line is present; employer block shows EPF 12% + ETF 3%; net = basic − EPF.
2. Add an allowance earning with EPF ticked → EPF line + employer figures grow; untick it → they shrink. Live.
3. Toggle "Apply EPF / ETF" off → managed line + employer block disappear, save bar lights up; save; reload → stays off.
4. Toggle back on → managed line returns.
5. Issue the payslip → editor locks, figures frozen, no recompute.

- [ ] **Step 8: Commit**

```bash
git add app/components/PayslipLineEditor.vue app/pages/payslips/[id].vue
git commit -m "feat(payroll): managed EPF line + live recompute + employer block"
```

---

### Task 6: PDF — employer contributions on the payslip

**Files:**
- Modify: `app/lib/payslip-pdf.ts`
- Modify: `src-tauri/templates/payslip.typ`

- [ ] **Step 1: Add employer fields to the PDF payload**

In `app/lib/payslip-pdf.ts`, the EPF deduction already flows through `deductions` (it's a real line). Add employer figures from the row. In the returned object (after `balance_display`, line 87), add:

```ts
		statutory_enabled: (row.statutory_enabled ?? 0) === 1,
		epf_employer_display: row.epf_employer_cents > 0 ? formatLKR(row.epf_employer_cents, { withSymbol: false }) : null,
		etf_display: row.etf_cents > 0 ? formatLKR(row.etf_cents, { withSymbol: false }) : null,
		total_cost_display: formatLKR(earningsTotal + row.epf_employer_cents + row.etf_cents, { withSymbol: false }),
```

- [ ] **Step 2: Render the employer section in the template**

In `src-tauri/templates/payslip.typ`, after the Paid/balance block (ends line 223) and before the Bank details block (line 225), add:

```typst
// ============================================================
// Employer contributions (not deducted from net)
// ============================================================
#if data.statutory_enabled == true and (data.epf_employer_display != none or data.etf_display != none) [
  #v(14pt)
  #block(breakable: false)[
    #label("Employer contributions (not deducted)")
    #v(4pt)
    #grid(
      columns: (auto, auto),
      column-gutter: 16pt,
      row-gutter: 4pt,
      align: (left, right),
      ..if data.epf_employer_display != none { (faint("EPF (employer)"), [#data.currency_symbol #data.epf_employer_display]) } else { () },
      ..if data.etf_display != none { (faint("ETF (employer)"), [#data.currency_symbol #data.etf_display]) } else { () },
      text(weight: "semibold")[Total cost of employment],
      text(weight: "bold")[#data.currency_symbol #data.total_cost_display],
    )
  ]
]
```

- [ ] **Step 3: Manual verification (dev)**

In `bun run tauri:dev`, open a statutory payslip → PDF & Print. Confirm:
- The EPF deduction appears in the Deductions table.
- An "Employer contributions (not deducted)" block shows EPF employer + ETF + total cost of employment.
- A payslip with statutory off shows neither.

- [ ] **Step 4: Lint + commit**

```bash
bun run lint
git add app/lib/payslip-pdf.ts src-tauri/templates/payslip.typ
git commit -m "feat(payroll): print employer EPF/ETF contributions on payslip PDF"
```

---

### Task 7: Docs + version bump

**Files:**
- Modify: `CLAUDE.md`
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

- [ ] **Step 1: Bump the version to 0.99.0 in all three files**

- `package.json`: `"version": "0.98.0"` → `"version": "0.99.0"`
- `src-tauri/Cargo.toml`: `version = "0.98.0"` → `version = "0.99.0"` (the `[package]` one near the top)
- `src-tauri/tauri.conf.json`: `"version": "0.98.0"` → `"version": "0.99.0"`

- [ ] **Step 2: Update CLAUDE.md**

In the Migrations list, add after the `0034_bank_reconciliation.sql` line:

```
0035_payslip_statutory.sql              ← EPF/ETF statutory auto-compute. company_settings gains statutory_auto_compute (master toggle) + epf_employee_rate_bp (800) / epf_employer_rate_bp (1200) / etf_rate_bp (300). payslip_lines gains epf_liable (0/1) + auto_source ('epf_employee' tags the managed EPF deduction line). payslips gains epf_employee_cents / epf_employer_cents / etf_cents (frozen figures) + statutory_enabled (per-payslip toggle, seeded from settings). Pure math in app/lib/statutory.ts.
```

In the "Adding a migration" note region, no change beyond the list. In the "Deferred / open items" list, remove the "Statutory auto-compute (EPF 8% / ETF 3% / PAYE)" bullet's EPF/ETF coverage — reword it to PAYE-only:

Find:
```
- **Statutory auto-compute** — EPF (8% employee), ETF (3% employer),
  PAYE on payslips. Currently manual line entry.
```
Replace with:
```
- **Statutory auto-compute — PAYE/APIT** — EPF (employee 8%) + ETF/EPF
  employer (3%/12%) now auto-compute on payslips (migration 0035 +
  app/lib/statutory.ts). PAYE/APIT progressive tax tables remain manual.
```

In the roadmap "Status" paragraph near the end, update the "Next biggest gap is statutory auto-compute…" sentence to reflect that EPF/ETF shipped and PAYE is what's left. Find the sentence beginning "Next biggest gap is **statutory auto-compute on payslips**" and replace its statutory clause with:
```
EPF/ETF statutory auto-compute shipped (migration 0035). The remaining
payroll gap is **PAYE/APIT progressive tax tables**. After that, the
**Cmd/Ctrl+K command palette** is the next "feels native" win.
```

In the "What's done" Payroll bullet list, add a sub-bullet:
```
  - **Statutory auto-compute (EPF/ETF)** — employee EPF 8% as a
    live-recomputed managed deduction line; employer EPF 12% + ETF 3%
    stored + printed. Rates + master toggle on /settings/payroll;
    per-payslip override. PAYE still manual. Pure math in
    app/lib/statutory.ts.
```

- [ ] **Step 3: Lint + full test run**

```bash
bun run lint
bun run test
```
Expected: lint clean, all Vitest suites pass (including `statutory.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "docs(claude.md): EPF/ETF statutory shipped + bump to 0.99.0"
```

(`Cargo.lock` updates when `cargo check`/build runs; include it if changed.)

---

## Self-review notes

- **Spec coverage:** rates/config (Task 3) ✓; per-line EPF flag (Tasks 2,4,5) ✓; managed line live recompute (Task 5) ✓; employer store + show (Tasks 2,4,5,6) ✓; pure lib + tests (Task 1) ✓; migration + SCHEMA_VERSION (Task 2) ✓; PDF (Task 6) ✓; immutability guard (Task 5 `syncManagedLine` no-op while disabled; store update only via not-locked branch) ✓. The spec's `validation.ts` change is intentionally dropped — that schema is stale (lists removed bank fields, omits payroll cycle) and isn't on the payroll save path; input `:min`/`:max` constraints cover it. This is a documented deviation.
- **Type consistency:** `StatutoryRates` / `StatutoryResult` / `computeStatutory` names match across Tasks 1, 3, 4, 5. `epf_liable: number`, `auto_source: string | null` consistent in store type + editor + INSERTs. `statutory_enabled` 0/1 in DB, `boolean` ref in UI, converted at the save/seed boundaries.
- **No placeholders:** every code step shows real content.
