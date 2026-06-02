# PAYE / APIT auto-compute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-compute monthly Sri Lankan PAYE (APIT) on payslips via a configurable progressive bracket table, surfaced as a managed deduction line — mirroring the EPF/ETF architecture.

**Architecture:** A pure `computePaye()` in `app/lib/statutory.ts` walks a relief + progressive bracket table. PAYE is a real `payslip_lines` row tagged `auto_source='paye'` (reusing the existing column), live-recomputed in `PayslipLineEditor` alongside the EPF line. The bracket table + relief + an "deduct EPF first" flag + a master toggle live on `company_settings` (JSON for the brackets), edited at `/settings/payroll`. PAYE flows into `net_cents`/PDF/bulk automatically because it's a normal deduction line.

**Tech Stack:** Nuxt 4 (SSG), Pinia, NuxtUI 4, TypeScript strict, SQLite via tauri-plugin-sql, Vitest, Typst. Package manager **bun**. Shell: bash on Windows.

**Spec:** `docs/superpowers/specs/2026-06-02-payslip-paye-apit-design.md`

**Conventions (load-bearing — see CLAUDE.md):**
- Money is integer cents; rates are basis points (18% = 1800). Banker's rounding via `roundHalfEven` (exported from `app/lib/money.ts`).
- Tabs for indentation; `bun run lint` auto-fixes most style.
- A new migration must be registered in `tenants.rs` MIGRATIONS **and** bump `SCHEMA_VERSION` in `data_io.rs`, or it silently never runs.
- DB INTEGER 0/1 booleans are read as `number` in TS.
- `UCheckbox`/`USwitch` v-model is a **boolean** (ignores `:true-value`); bridge to 0/1 with a handler (see the existing `setEpfLiable`).
- A running `tauri:dev` can't be used by subagents — manual verification steps are the controller's job.

---

## File Structure

- `app/lib/statutory.ts` — add `PayeBracket`, `PayeConfig`, `computePaye()`. (Existing `computeStatutory` untouched.)
- `app/lib/statutory.test.ts` — add PAYE test cases.
- `src-tauri/migrations/0036_payslip_paye.sql` — NEW columns + seed JSON.
- `src-tauri/src/tenants.rs` — register migration 36.
- `src-tauri/src/data_io.rs` — `SCHEMA_VERSION` → 36.
- `app/stores/settings.ts` — 4 new columns on `CompanySettingsRow` + `UPDATABLE_COLUMNS`.
- `app/pages/settings/payroll.vue` — PAYE card + bracket editor.
- `app/stores/payslips.ts` — `PayslipRow` cols, `createPayslip` seed, `UPDATABLE`.
- `app/components/PayslipLineEditor.vue` — second managed line (`paye`) + props.
- `app/pages/payslips/[id].vue` — PAYE toggle + config props + persist.
- `CLAUDE.md`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` — docs + version 0.102.2 → 0.103.0.

---

### Task 1: `computePaye` pure module + tests

**Files:**
- Modify: `app/lib/statutory.ts`
- Test: `app/lib/statutory.test.ts`

TDD — test first.

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/statutory.test.ts` (it already imports from `./statutory` and `vitest`):

```ts
import { computePaye, type PayeConfig } from "./statutory";

// Current SL 2025/26 monthly table: relief 150,000; taxable bands
// 6% / 18% / 24% / 30% / 36%.
const SL_PAYE: PayeConfig = {
	reliefCents: 15_000_000,
	brackets: [
		{ upToCents: 8_333_333, rateBp: 600 },
		{ upToCents: 12_500_000, rateBp: 1800 },
		{ upToCents: 16_666_667, rateBp: 2400 },
		{ upToCents: 20_833_333, rateBp: 3000 },
		{ upToCents: null, rateBp: 3600 }
	]
};

describe("computePaye", () => {
	it("is zero below and at the relief threshold", () => {
		expect(computePaye(14_000_000, SL_PAYE)).toBe(0); // Rs 140k < relief
		expect(computePaye(15_000_000, SL_PAYE)).toBe(0); // exactly at relief
	});

	it("taxes only the first band when taxable income is small", () => {
		// base 200,000 → taxable 50,000 → all @6% → 3,000.00
		expect(computePaye(20_000_000, SL_PAYE)).toBe(300_000);
	});

	it("spans multiple bands progressively", () => {
		// base 300,000 → taxable 150,000:
		//  83,333.33 @6% + 41,666.67 @18% + 25,000 @24%
		//  = 5,000,000,? scaled → 1,850,000 cents (Rs 18,500.00)
		expect(computePaye(30_000_000, SL_PAYE)).toBe(1_850_000);
	});

	it("applies the top open band above the last bound", () => {
		// base 500,000 → taxable 350,000, well into the 36% band.
		const tax = computePaye(50_000_000, SL_PAYE);
		expect(tax).toBeGreaterThan(0);
		// sanity: more than the 30%-band-cap tax, less than 36% of full taxable
		expect(tax).toBeLessThan(Math.round(35_000_000 * 3600 / 10000));
	});

	it("returns 0 for empty brackets or zero base", () => {
		expect(computePaye(0, SL_PAYE)).toBe(0);
		expect(computePaye(50_000_000, { reliefCents: 15_000_000, brackets: [] })).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run app/lib/statutory.test.ts`
Expected: FAIL — `computePaye is not exported` / not a function.

- [ ] **Step 3: Implement `computePaye`**

In `app/lib/statutory.ts`, append after `computeStatutory` (the file already imports `roundHalfEven` and declares `const BP_DENOM = 10000`):

```ts
export interface PayeBracket {
	// Upper bound (inclusive-progressive) of TAXABLE income for this band,
	// in cents. null = the open top band. Bands MUST be ascending with the
	// null band last.
	upToCents: number | null
	rateBp: number
}

export interface PayeConfig {
	reliefCents: number
	brackets: PayeBracket[]
}

// Monthly tax-table (IRD Table 1) PAYE. baseCents is the PAYE base the
// caller has already netted of EPF if applicable. Relief is applied here.
// Tax is accumulated exactly across bands and rounded (half-even) once,
// matching IRD's per-band-formula result more closely than per-band rounding.
export function computePaye(baseCents: number, config: PayeConfig): number {
	const base = Math.max(0, Math.trunc(baseCents));
	const relief = Math.max(0, Math.trunc(config.reliefCents));
	const taxable = Math.max(0, base - relief);
	if (taxable <= 0) return 0;
	let prev = 0;
	let scaled = 0; // Σ width × rateBp, divided by BP_DENOM at the end
	for (const band of config.brackets) {
		const cap = band.upToCents == null ? Infinity : band.upToCents;
		const width = Math.min(taxable, cap) - prev;
		if (width > 0) scaled += width * band.rateBp;
		prev = cap;
		if (taxable <= cap) break;
	}
	return roundHalfEven(scaled / BP_DENOM);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run app/lib/statutory.test.ts`
Expected: PASS (existing EPF tests + 5 new PAYE tests).

- [ ] **Step 5: Lint + commit**

```bash
bun run lint
git add app/lib/statutory.ts app/lib/statutory.test.ts
git commit -m "feat(payroll): pure progressive PAYE (APIT) computation"
```

---

### Task 2: Migration 0036

**Files:**
- Create: `src-tauri/migrations/0036_payslip_paye.sql`
- Modify: `src-tauri/src/tenants.rs`
- Modify: `src-tauri/src/data_io.rs`

- [ ] **Step 1: Write the migration**

Create `src-tauri/migrations/0036_payslip_paye.sql`:

```sql
-- Phase: payroll — PAYE / APIT auto-compute (monthly tax-table method).
--
-- Configurable progressive table on company_settings: a tax-free relief,
-- a JSON bracket array (taxable-income upper bounds in cents + basis-point
-- rates; null upper bound = open top band), and a "deduct employee EPF
-- before PAYE" flag. Master toggle defaults OFF (PAYE withholding is
-- employer/threshold-specific — opt-in, unlike near-universal EPF).
--
-- Seed = current SL 2025/26 monthly table: relief Rs 150,000; bands
-- 6% / 18% / 24% / 30% / 36%.
--
-- payslips store the frozen paye figure + a per-payslip enable flag (seeded
-- from settings). payslip_lines reuse auto_source with the new value 'paye'
-- — no new line column. Pre-1.0 additive ALTERs; no backfill.

ALTER TABLE company_settings ADD COLUMN paye_auto_compute INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN paye_relief_cents INTEGER NOT NULL DEFAULT 15000000;
ALTER TABLE company_settings ADD COLUMN paye_deduct_epf   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_settings ADD COLUMN paye_brackets     TEXT NOT NULL DEFAULT '[{"upToCents":8333333,"rateBp":600},{"upToCents":12500000,"rateBp":1800},{"upToCents":16666667,"rateBp":2400},{"upToCents":20833333,"rateBp":3000},{"upToCents":null,"rateBp":3600}]';

ALTER TABLE payslips ADD COLUMN paye_cents   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN paye_enabled INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Register in tenants.rs**

In `src-tauri/src/tenants.rs`, the `MIGRATIONS` array ends with the `(35, "payslip statutory", ...)` line before `];`. Add after it:

```rust
	(36, "payslip paye", include_str!("../migrations/0036_payslip_paye.sql")),
```

- [ ] **Step 3: Bump SCHEMA_VERSION**

In `src-tauri/src/data_io.rs`, change `const SCHEMA_VERSION: i32 = 35;` to:

```rust
const SCHEMA_VERSION: i32 = 36;
```

(No `TABLES` change — no new tables.)

- [ ] **Step 4: Verify Rust compiles**

Run: `cd src-tauri && cargo check && cd ..`
Expected: compiles clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/migrations/0036_payslip_paye.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs
git commit -m "feat(payroll): migration 0036 — PAYE config + payslip columns"
```

---

### Task 3: Settings store + PAYE settings card with bracket editor

**Files:**
- Modify: `app/stores/settings.ts`
- Modify: `app/pages/settings/payroll.vue`

- [ ] **Step 1: Add columns to the settings row type**

In `app/stores/settings.ts`, in `CompanySettingsRow`, after the four statutory fields (`etf_rate_bp: number`), add:

```ts
	// PAYE / APIT (monthly tax-table). paye_brackets is a JSON array of
	// { upToCents: number|null, rateBp } — taxable-income bands. See
	// app/lib/statutory.ts computePaye. Master toggle defaults off.
	paye_auto_compute: number
	paye_relief_cents: number
	paye_deduct_epf: number
	paye_brackets: string
```

- [ ] **Step 2: Add columns to the UPDATABLE whitelist**

In `UPDATABLE_COLUMNS`, after `"etf_rate_bp",`, add:

```ts
	"paye_auto_compute",
	"paye_relief_cents",
	"paye_deduct_epf",
	"paye_brackets",
```

- [ ] **Step 2b: Add a bracket-row type to statutory.ts re-export usage**

No new file. The settings page imports `computePaye`, `type PayeBracket`, `type PayeConfig` from `~/lib/statutory` (already defined in Task 1).

- [ ] **Step 3: Add the PAYE card to the payroll settings page (template)**

In `app/pages/settings/payroll.vue`, add a new `UCard` immediately after the existing statutory `UCard`'s closing `</UCard>` (the one ending at ~line 114), still inside `<div class="space-y-6 max-w-2xl mx-auto">`:

```vue
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<div class="font-medium">
							PAYE (APIT)
						</div>
						<USwitch v-model="payeOn" />
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Monthly income-tax withholding. When on, new payslips auto-add a
						PAYE deduction computed from the bracket table below. Rates change
						with the national budget — edit them here when they do.
					</div>
				</template>

				<div class="space-y-5" :class="payeOn ? '' : 'opacity-50 pointer-events-none'">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<UFormField label="Monthly tax-free relief" help="Income below this is untaxed.">
							<MoneyInput v-model="payeReliefCents" />
						</UFormField>
						<UFormField label="Deduct employee EPF first" help="Subtract the 8% EPF before taxing.">
							<UCheckbox
								:model-value="payeDeductEpf"
								label="EPF reduces taxable income"
								:true-value="1"
								:false-value="0"
								@update:model-value="(v) => payeDeductEpf = v === true ? 1 : 0"
							/>
						</UFormField>
					</div>

					<div class="space-y-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
							Tax bands (on taxable income, after relief)
						</div>
						<div
							v-for="(band, i) in payeBands"
							:key="i"
							class="grid grid-cols-[1fr_auto_6rem_auto] gap-2 items-center"
						>
							<MoneyInput
								v-if="band.upToCents !== null"
								v-model="band.upToCents"
							/>
							<div v-else class="text-sm text-(--ui-text-muted) italic">
								Balance (everything above)
							</div>
							<span class="text-xs text-(--ui-text-muted)">→</span>
							<UInputNumber v-model="band.ratePct" :min="0" :max="100" :step="0.1" class="w-full" />
							<UButton
								icon="i-lucide-trash-2"
								variant="ghost"
								color="neutral"
								size="xs"
								:disabled="band.upToCents === null"
								aria-label="Remove band"
								@click="removeBand(i)"
							/>
						</div>
						<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-plus" @click="addBand">
							Add band
						</UButton>
					</div>

					<div class="rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-3 text-sm">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) mb-1">
							Preview — on {{ formatMoney(payePreviewBase) }} gross
						</div>
						<div class="tabular-nums">
							PAYE <span class="font-medium">{{ formatMoney(payePreview) }}</span>
						</div>
					</div>
				</div>
			</UCard>
```

- [ ] **Step 4: Wire PAYE state in the script**

In `app/pages/settings/payroll.vue` `<script setup>`:

(a) Extend the lib import line:
```ts
	import { computeStatutory, computePaye, type PayeBracket } from "~/lib/statutory";
```

(b) After the existing statutory refs (`const etfPct = ...`), add the PAYE refs + helpers:
```ts
	// PAYE config. Bands are edited as { upToCents, ratePct }; converted to
	// basis points for storage / compute. The last band has upToCents null
	// (the open "balance" band) and is never removable.
	interface PayeBandEdit { upToCents: number | null, ratePct: number }
	const parsePayeBands = (json: string | undefined): PayeBandEdit[] => {
		try {
			const arr = JSON.parse(json ?? "[]") as PayeBracket[];
			if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty");
			return arr.map((b) => ({ upToCents: b.upToCents, ratePct: b.rateBp / 100 }));
		} catch {
			return [{ upToCents: null, ratePct: 0 }];
		}
	};

	const payeOn = ref<boolean>((store.settings?.paye_auto_compute ?? 0) === 1);
	const payeReliefCents = ref<number>(store.settings?.paye_relief_cents ?? 15_000_000);
	const payeDeductEpf = ref<number>(store.settings?.paye_deduct_epf ?? 1);
	const payeBands = ref<PayeBandEdit[]>(parsePayeBands(store.settings?.paye_brackets));

	const bandsToBrackets = (bands: PayeBandEdit[]): PayeBracket[] =>
		bands.map((b) => ({ upToCents: b.upToCents, rateBp: Math.round((b.ratePct || 0) * 100) }));
	const payeBracketsJson = () => JSON.stringify(bandsToBrackets(payeBands.value));

	const addBand = () => {
		// Insert a new finite band just before the open "balance" band.
		const lastFinite = payeBands.value.filter((b) => b.upToCents !== null).at(-1);
		const seed = (lastFinite?.upToCents ?? payeReliefCents.value) + 5_000_000;
		payeBands.value.splice(payeBands.value.length - 1, 0, { upToCents: seed, ratePct: 0 });
	};
	const removeBand = (i: number) => {
		if (payeBands.value[i]?.upToCents === null) return; // never remove the balance band
		payeBands.value.splice(i, 1);
	};

	const payePreviewBase = 25_000_000; // Rs 250,000 gross
	const payePreview = computed(() => computePaye(payePreviewBase, {
		reliefCents: payeReliefCents.value,
		brackets: bandsToBrackets(payeBands.value)
	}));
```

(c) Extend `initial` (the dirty baseline) — add PAYE keys to the object literal:
```ts
		on: statutoryOn.value,
		epfEmp: epfEmployeePct.value,
		epfEr: epfEmployerPct.value,
		etf: etfPct.value,
		payeOn: payeOn.value,
		payeRelief: payeReliefCents.value,
		payeDeductEpf: payeDeductEpf.value,
		payeBrackets: payeBracketsJson()
```
(Do this in BOTH the initial `ref({...})` and the `initial.value = {...}` reassignment inside `onSave`.)

(d) Extend `dirty`:
```ts
		|| etfPct.value !== initial.value.etf
		|| payeOn.value !== initial.value.payeOn
		|| payeReliefCents.value !== initial.value.payeRelief
		|| payeDeductEpf.value !== initial.value.payeDeductEpf
		|| payeBracketsJson() !== initial.value.payeBrackets
```

(e) Extend the `store.save({...})` call in `onSave`:
```ts
				etf_rate_bp: toBp(etfPct.value),
				paye_auto_compute: payeOn.value ? 1 : 0,
				paye_relief_cents: payeReliefCents.value,
				paye_deduct_epf: payeDeductEpf.value,
				paye_brackets: payeBracketsJson()
```

(f) Extend `reset()`:
```ts
		etfPct.value = initial.value.etf;
		payeOn.value = initial.value.payeOn;
		payeReliefCents.value = initial.value.payeRelief;
		payeDeductEpf.value = initial.value.payeDeductEpf;
		payeBands.value = parsePayeBands(initial.value.payeBrackets);
```

- [ ] **Step 5: Lint + manual smoke (dev)**

Run: `bun run lint`. Then in `bun run tauri:dev`, open `/settings/payroll`: PAYE card renders, toggle enables/disables, preview updates as you edit relief/bands, Add/Remove band works (balance row not removable), Save persists (reload → values stick).

- [ ] **Step 6: Commit**

```bash
git add app/stores/settings.ts app/pages/settings/payroll.vue
git commit -m "feat(payroll): PAYE config + bracket editor on settings/payroll"
```

---

### Task 4: Payslips store — row type, seed, persist

**Files:**
- Modify: `app/stores/payslips.ts`

- [ ] **Step 1: Add columns to PayslipRow**

In `app/stores/payslips.ts`, in `PayslipRow`, after the statutory fields (`statutory_enabled: number`), add:

```ts
	// PAYE / APIT (monthly tax-table). Frozen figure + per-payslip enable
	// (seeded from company_settings.paye_auto_compute at create).
	paye_cents: number
	paye_enabled: number
```

- [ ] **Step 2: Import computePaye**

The file already imports `computeStatutory` from `~/lib/statutory`. Change that import to also bring in the PAYE helpers:

```ts
import { computePaye, computeStatutory, type PayeBracket } from "~/lib/statutory";
```

- [ ] **Step 3: Seed PAYE in createPayslip**

In `createPayslip`, the existing EPF seed block computes `stat` (EPF/ETF) from the basic and reads settings. After that block (after `const netSeed = Math.max(0, basic - deductionsSeed);`), add PAYE seeding:

```ts
		const payeOn = (settings.settings?.paye_auto_compute ?? 0) === 1;
		let payeBrackets: PayeBracket[] = [];
		try {
			payeBrackets = JSON.parse(settings.settings?.paye_brackets ?? "[]") as PayeBracket[];
		} catch {
			payeBrackets = [];
		}
		const payeDeductEpf = (settings.settings?.paye_deduct_epf ?? 1) === 1;
		const payeBase = basic - (payeDeductEpf ? stat.epfEmployeeCents : 0);
		const payeSeed = payeOn
			? computePaye(payeBase, {
				reliefCents: settings.settings?.paye_relief_cents ?? 15_000_000,
				brackets: payeBrackets
			})
			: 0;
		const totalDeductionsSeed = deductionsSeed + payeSeed;
		const netSeed2 = Math.max(0, basic - totalDeductionsSeed);
```

Then update the `INSERT INTO payslips (...)` statement to include the PAYE columns and use the combined deductions/net. Change the column list + values:
- add `paye_cents, paye_enabled` to the column list (after `statutory_enabled`),
- change the `deductions_cents` bind from `deductionsSeed` to `totalDeductionsSeed`,
- change `net_cents` bind from `netSeed` to `netSeed2`,
- add binds `payeSeed` and `payeOn ? 1 : 0` at the end.

The resulting execute call:

```ts
		const result = await execute(
			`INSERT INTO payslips (
				number, fiscal_year, employee_id, employee_snapshot, employee_name,
				period_start, period_end, pay_date,
				earnings_cents, deductions_cents, net_cents, status,
				epf_employee_cents, epf_employer_cents, etf_cents, statutory_enabled,
				paye_cents, paye_enabled
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
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
				totalDeductionsSeed,
				netSeed2,
				stat.epfEmployeeCents,
				stat.epfEmployerCents,
				stat.etfCents,
				statutoryOn ? 1 : 0,
				payeSeed,
				payeOn ? 1 : 0
			]
		);
```

After the managed EPF line insert block (the `if (statutoryOn && stat.epfEmployeeCents > 0) { ... }`), add the managed PAYE line insert:

```ts
		if (payeOn && payeSeed > 0) {
			await execute(
				`INSERT INTO payslip_lines (
					payslip_id, sort_order, kind, label, amount_cents, epf_liable, auto_source
				) VALUES (?, 2, 'deduction', 'PAYE (APIT)', ?, 0, 'paye')`,
				[id, payeSeed]
			);
		}
```

- [ ] **Step 4: Extend PayslipUpdate + UPDATABLE**

Extend the `PayslipUpdate` Pick to add `"paye_cents" | "paye_enabled"`, and add those two to the `UPDATABLE` array (after `"statutory_enabled"`):

```ts
	type PayslipUpdate = Partial<Pick<PayslipRow, | "period_start" | "period_end" | "pay_date"
		| "earnings_cents" | "deductions_cents" | "net_cents" | "notes"
		| "epf_employee_cents" | "epf_employer_cents" | "etf_cents" | "statutory_enabled"
		| "paye_cents" | "paye_enabled">>;
```
```ts
		"statutory_enabled",
		"paye_cents",
		"paye_enabled"
```

- [ ] **Step 5: Lint**

Run: `bun run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/stores/payslips.ts
git commit -m "feat(payroll): seed + persist PAYE figures in payslips store"
```

---

### Task 5: Editor (two managed lines) + detail-page wiring

**Files:**
- Modify: `app/components/PayslipLineEditor.vue`
- Modify: `app/pages/payslips/[id].vue`

#### Part A — PayslipLineEditor.vue

- [ ] **Step A1: Add PAYE props + imports**

In `<script setup>`, change the statutory import to add PAYE:
```ts
	import { computePaye, computeStatutory, type PayeConfig, type StatutoryRates } from "~/lib/statutory";
```
(Keep `formatMoney`, `formatRate` imports as they are.)

Extend the `Props` interface (which currently has `modelValue`, `disabled`, `statutoryEnabled`, `rates`, `epfEmployeeRateBp`) with:
```ts
		payeEnabled?: boolean
		payeConfig?: PayeConfig
		payeDeductEpf?: boolean
```
And extend `withDefaults`:
```ts
		payeEnabled: false,
		payeConfig: () => ({ reliefCents: 15_000_000, brackets: [] }),
		payeDeductEpf: true
```

- [ ] **Step A2: Add gross-earnings helper + extend syncManagedLine**

After the existing `liableBase` helper, add a gross-earnings helper:
```ts
	// Gross = Σ all earning lines (PAYE base, before optional EPF subtraction).
	const grossEarnings = () =>
		lines
			.filter((l) => l.kind === "earning")
			.reduce((s, l) => s + (l.amount_cents || 0), 0);
```

Replace the body of `syncManagedLine` so it manages BOTH lines (EPF first, then PAYE which may depend on the EPF amount). New `syncManagedLine`:
```ts
	const syncManagedLine = () => {
		if (props.disabled) return;

		// --- EPF (employee) managed deduction line ---
		const epfIdx = lines.findIndex((l) => l.auto_source === "epf_employee");
		let epfEmployeeCents = 0;
		if (props.statutoryEnabled) {
			const stat = computeStatutory(liableBase(), props.rates);
			epfEmployeeCents = stat.epfEmployeeCents;
		}
		if (epfEmployeeCents > 0) {
			const label = `EPF (${formatRate(props.epfEmployeeRateBp)})`;
			if (epfIdx === -1) {
				lines.push({ sort_order: lines.length, kind: "deduction", label, amount_cents: epfEmployeeCents, epf_liable: 0, auto_source: "epf_employee" });
			} else {
				lines[epfIdx]!.label = label;
				lines[epfIdx]!.amount_cents = epfEmployeeCents;
			}
		} else if (epfIdx !== -1) {
			lines.splice(epfIdx, 1);
		}

		// --- PAYE (APIT) managed deduction line ---
		const payeIdx = lines.findIndex((l) => l.auto_source === "paye");
		let payeCents = 0;
		if (props.payeEnabled) {
			const payeBase = grossEarnings() - (props.payeDeductEpf ? epfEmployeeCents : 0);
			payeCents = computePaye(payeBase, props.payeConfig);
		}
		if (payeCents > 0) {
			if (payeIdx === -1) {
				lines.push({ sort_order: lines.length, kind: "deduction", label: "PAYE (APIT)", amount_cents: payeCents, epf_liable: 0, auto_source: "paye" });
			} else {
				lines[payeIdx]!.amount_cents = payeCents;
			}
		} else if (payeIdx !== -1) {
			lines.splice(payeIdx, 1);
		}
	};
```

- [ ] **Step A3: Recompute on PAYE prop changes**

Extend the existing `watch(() => [props.statutoryEnabled, props.rates] as const, ...)` to also watch PAYE inputs. Replace it with:
```ts
	watch(
		() => [props.statutoryEnabled, props.rates, props.payeEnabled, props.payeConfig, props.payeDeductEpf] as const,
		() => { onChange(); },
		{ deep: true }
	);
```

- [ ] **Step A4: Lock the PAYE line in the deductions template**

The deductions `v-for` renders a lock icon for `line.auto_source === 'epf_employee'`. Broaden the managed-line checks to cover PAYE too. In the deductions row block, change the two `=== 'epf_employee'` comparisons (the `:disabled` on the label `UInput` and `MoneyInput`, and the `v-if` on the lock-icon button) to also match `'paye'`. Concretely, replace each `line.auto_source === 'epf_employee'` in that block with `(line.auto_source === 'epf_employee' || line.auto_source === 'paye')`.

(There are three occurrences in the deductions row: label `:disabled`, MoneyInput `:disabled`, and the lock `<UButton v-if=...>` / trash `v-else`.)

- [ ] **Step A5: Lint**

Run: `bun run lint`. Expected: clean.

#### Part B — payslips/[id].vue

- [ ] **Step B1: Imports + config**

Add to the lib imports (near `import { computeStatutory } from "~/lib/statutory";` — change it):
```ts
	import { computeStatutory, computePaye, type PayeBracket, type PayeConfig } from "~/lib/statutory";
```

After the existing `statRates` computed, add PAYE state + config:
```ts
	// PAYE config from settings (parsed once per settings change).
	const payeConfig = computed<PayeConfig>(() => {
		let brackets: PayeBracket[] = [];
		try {
			brackets = JSON.parse(settingsStore.settings?.paye_brackets ?? "[]") as PayeBracket[];
		} catch {
			brackets = [];
		}
		return { reliefCents: settingsStore.settings?.paye_relief_cents ?? 15_000_000, brackets };
	});
	const payeDeductEpf = computed(() => (settingsStore.settings?.paye_deduct_epf ?? 1) === 1);
	const payeEnabled = ref<boolean>((row.value?.paye_enabled ?? 0) === 1);
```

- [ ] **Step B2: Keep payeEnabled in sync in hydrate**

In `hydrate`, after the line `statutoryEnabled.value = (r.statutory_enabled ?? 0) === 1;`, add:
```ts
		payeEnabled.value = (r.paye_enabled ?? 0) === 1;
```

- [ ] **Step B3: formSnapshot includes payeEnabled**

The `formSnapshot` computed currently is `JSON.stringify({ ...form, statutoryEnabled: statutoryEnabled.value })`. Change to:
```ts
	const formSnapshot = computed(() => JSON.stringify({ ...form, statutoryEnabled: statutoryEnabled.value, payeEnabled: payeEnabled.value }));
```

- [ ] **Step B4: Pass PAYE props to the editor (template)**

The `<PayslipLineEditor>` currently has `v-model`, `:disabled`, `:statutory-enabled`, `:rates`, `:epf-employee-rate-bp`. Add three props:
```vue
						:paye-enabled="payeEnabled"
						:paye-config="payeConfig"
						:paye-deduct-epf="payeDeductEpf"
```

- [ ] **Step B5: Add the "Apply PAYE" header toggle**

In the "Earnings & deductions" card header, the existing `<label v-if="!locked">Apply EPF / ETF <USwitch v-model="statutoryEnabled" /></label>` sits in a `flex items-center gap-3` div. Add a second label before the status `<span>`:
```vue
								<label v-if="!locked" class="flex items-center gap-2 text-xs text-(--ui-text-muted)">
									Apply PAYE
									<USwitch v-model="payeEnabled" />
								</label>
```

- [ ] **Step B6: Persist PAYE on save**

In `onSave`'s not-locked branch, after the EPF `stat` is computed and before/within the `store.update(...)`, compute PAYE from the same base and persist it. Add after the `const stat = ...` line:
```ts
				const grossEarnings = form.lines
					.filter((l) => l.kind === "earning")
					.reduce((s, l) => s + l.amount_cents, 0);
				const payeBase = grossEarnings - (payeDeductEpf.value ? stat.epfEmployeeCents : 0);
				const payeCents = payeEnabled.value ? computePaye(payeBase, payeConfig.value) : 0;
```
Then add to the `store.update(row.value.id, { ... })` object (after `statutory_enabled: statutoryEnabled.value ? 1 : 0`):
```ts
					paye_cents: payeCents,
					paye_enabled: payeEnabled.value ? 1 : 0
```

- [ ] **Step B7: Lint**

Run: `bun run lint`. Expected: clean.

- [ ] **Step B8: Manual verification (dev)**

In `bun run tauri:dev` with PAYE enabled in settings (and a high enough salary to exceed the relief):
1. New payslip → a locked "PAYE (APIT)" deduction appears alongside EPF; net = gross − EPF − PAYE.
2. Toggle "Deduct employee EPF first" in settings → PAYE on a new payslip changes accordingly.
3. On the payslip, "Apply PAYE" off → PAYE line vanishes, net rises; on → returns. Editing an earning recomputes PAYE live.
4. Below-relief salary → no PAYE line.
5. Issue → figures freeze; PDF shows PAYE in deductions; bulk run pays the PAYE-reduced net.

- [ ] **Step B9: Commit**

```bash
git add app/components/PayslipLineEditor.vue "app/pages/payslips/[id].vue"
git commit -m "feat(payroll): managed PAYE deduction line + per-payslip toggle"
```

---

### Task 6: Docs + version bump

**Files:**
- Modify: `CLAUDE.md`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

- [ ] **Step 1: Bump version 0.102.2 → 0.103.0**
- `package.json`: `"version": "0.102.2"` → `"version": "0.103.0"`
- `src-tauri/Cargo.toml`: `version = "0.102.2"` → `version = "0.103.0"`
- `src-tauri/tauri.conf.json`: `"version": "0.102.2"` → `"version": "0.103.0"`

- [ ] **Step 2: Refresh Cargo.lock**

Run: `cd src-tauri && cargo check && cd ..`

- [ ] **Step 3: Update CLAUDE.md**

In the Migrations list, after the `0035_payslip_statutory.sql` line, add:
```
0036_payslip_paye.sql                   ← PAYE/APIT monthly tax-table auto-compute. company_settings gains paye_auto_compute (master toggle, default off) + paye_relief_cents (15000000) + paye_deduct_epf (1) + paye_brackets (JSON: taxable-income bands, seeded with the SL 2025/26 table). payslips gain paye_cents (frozen) + paye_enabled (per-payslip, seeded from settings). payslip_lines reuse auto_source = 'paye' for the managed PAYE deduction line. Progressive math in app/lib/statutory.ts computePaye().
```

In the "Deferred / open items" list, find the `**Statutory auto-compute — PAYE/APIT**` bullet and replace it with:
```
- **Statutory auto-compute — cumulative/YTD APIT** — EPF/ETF (migration
  0035) and monthly-table PAYE/APIT (migration 0036, app/lib/statutory.ts
  `computePaye`) now auto-compute on payslips. Cumulative (IRD Table 5),
  lump-sum/bonus tables, and per-line PAYE-exempt flags remain future work.
```

In the "Done" Payroll sub-list, after the EPF/ETF sub-bullet, add:
```
  - **PAYE / APIT auto-compute** — monthly tax-table method: a
    configurable relief + progressive bracket table on /settings/payroll
    (pre-seeded with the SL 2025/26 table; editable when budgets change),
    an optional "deduct employee EPF first" flag, and a managed
    `auto_source='paye'` deduction line that recomputes live. Per-payslip
    "Apply PAYE" toggle, master toggle defaults off. Pure math in
    app/lib/statutory.ts.
```

In the roadmap "Status" paragraph, update the sentence naming PAYE as the remaining gap — replace "The remaining payroll gap is **PAYE/APIT progressive tax tables**." with:
```
Monthly-table PAYE/APIT also shipped (migration 0036). The remaining
payroll niceties are cumulative/YTD APIT + lump-sum tables.
```

- [ ] **Step 4: Lint + full test run**

```bash
bun run lint
bun run test
```
Expected: lint clean, all Vitest suites pass (EPF + PAYE).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "docs(claude.md): PAYE/APIT shipped + bump to 0.103.0"
```

---

## Self-review notes

- **Spec coverage:** computePaye + tests (Task 1) ✓; migration 0036 + columns + seed JSON + SCHEMA_VERSION (Task 2) ✓; settings columns + bracket editor + relief + deduct-EPF toggle + master toggle + preview (Task 3) ✓; store seed/persist + row type + UPDATABLE (Task 4) ✓; two managed lines + recompute order EPF→PAYE + props + lock + Apply-PAYE toggle + persist (Task 5) ✓; PDF/bulk unchanged (noted, no task needed) ✓; docs + version (Task 6) ✓.
- **Type consistency:** `PayeBracket {upToCents:number|null, rateBp}` / `PayeConfig {reliefCents, brackets}` / `computePaye(baseCents, config)` consistent across lib, settings, store, editor, detail page. Editor prop `payeConfig: PayeConfig`, `payeDeductEpf: boolean`, `payeEnabled: boolean`. DB 0/1 ↔ boolean conversions at the settings/detail boundaries.
- **No placeholders:** every step shows real content. The bracket-editor `grid-cols-[1fr_auto_6rem_auto]` + `MoneyInput`/`UInputNumber` bindings are concrete.
- **Ordering landmine called out:** EPF is synced before PAYE inside `syncManagedLine` because PAYE's base may subtract the EPF amount.
