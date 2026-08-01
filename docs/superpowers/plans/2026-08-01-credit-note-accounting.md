# Credit-note accounting, employer payroll cost, and money-math tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make credit notes actually affect the books (VAT, P&L, receivables, statements, invoice balance), include employer EPF/ETF in payroll expense, and pin the untested money/date invariants with unit tests.

**Architecture:** Credit enters the system as a *second numeric input* alongside the existing `paid`, everywhere `paid` already flows — the pure `deriveInvoiceStatus` function and its mirrored SQL builder in `app/lib/derived-status.ts`. No schema migration: every column already exists, and the new `credited` status is derived, never persisted. Unlinked credit notes aggregate separately at client level.

**Tech Stack:** Nuxt 4 SSG + TypeScript strict, Pinia, Vitest, SQLite via `tauri-plugin-sql`, Typst templates.

**Source spec:** `docs/superpowers/specs/2026-08-01-credit-note-accounting-design.md`

## Global Constraints

- **Package manager is `bun` only.** `bun run lint`, `bun run test`. `npm`/`yarn`/`pnpm` are blocked by a `preinstall` hook.
- **Money is integer cents.** Never floats. Use `formatMoney` / `toCents` from `app/lib/money.ts`.
- **Dates are ISO `YYYY-MM-DD` strings** everywhere — DB, state, payloads, function args.
- **Indentation is tabs.** `bun run lint` auto-fixes most style issues; run it before every commit.
- **Pure, unit-testable logic lives in `app/lib/`, never in a store.** Vitest runs in node; importing a Pinia store drags in Tauri and fails to resolve.
- **The pure `deriveX` function and its `xDerivedFrom` SQL builder must stay exactly equivalent in precedence.** This rule is stated in `app/lib/derived-status.ts`'s header comment and is the reason that file exists.
- **Branch from `main` for each PR:** `git checkout main && git pull --ff-only && git checkout -b <type>/<slug>`. Never work on `main`.
- **Bump the version in all three files on every PR** — `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`. Commit `src-tauri/Cargo.lock` alongside. Current version after the spec commit: **0.158.3**.
- **No Claude Code footer in commit messages.**
- **Do not push or open a PR without explicit user confirmation.**

---

# Phase 1 — PR 1: test backfill (`test/money-math-coverage`, v0.158.4)

No production code changes. Purely additive. Land this first so `money.ts` is pinned before Phase 2/3 touch money-adjacent report math.

Branch: `git checkout main && git pull --ff-only && git checkout -b test/money-math-coverage`

**All expected values below were verified empirically against the current implementation.** They are the real outputs, not guesses.

### Task 1: Unit tests for `app/lib/money.ts`

**Files:**
- Create: `app/lib/money.test.ts`

**Interfaces:**
- Consumes: `roundHalfEven`, `toCents`, `computeLineTotals`, `formatMoney`, `formatRate`, `formatQty` from `./money`
- Produces: nothing (test-only)

- [ ] **Step 1: Write the failing test**

Create `app/lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	computeLineTotals,
	formatMoney,
	formatQty,
	formatRate,
	roundHalfEven,
	toCents
} from "./money";

describe("roundHalfEven", () => {
	it("rounds normally away from ties", () => {
		expect(roundHalfEven(2.4)).toBe(2);
		expect(roundHalfEven(2.6)).toBe(3);
		expect(roundHalfEven(-2.4)).toBe(-2);
		expect(roundHalfEven(-2.6)).toBe(-3);
	});

	it("breaks exact .5 ties toward the even integer", () => {
		expect(roundHalfEven(2.5)).toBe(2);
		expect(roundHalfEven(3.5)).toBe(4);
		expect(roundHalfEven(0.5)).toBe(0);
		expect(roundHalfEven(1.5)).toBe(2);
	});

	it("breaks ties toward even for negatives too", () => {
		expect(roundHalfEven(-2.5)).toBe(-2);
		expect(roundHalfEven(-1.5)).toBe(-2);
		expect(roundHalfEven(-0.5)).toBe(0);
	});
});

describe("toCents", () => {
	it("parses numbers and strings to integer cents", () => {
		expect(toCents(1234.5)).toBe(123450);
		expect(toCents("12.34")).toBe(1234);
		expect(toCents(".5")).toBe(50);
		expect(toCents("7")).toBe(700);
	});

	it("strips thousands separators", () => {
		expect(toCents("1,234.56")).toBe(123456);
	});

	it("treats blank-ish input as zero", () => {
		expect(toCents("")).toBe(0);
		expect(toCents("-")).toBe(0);
	});

	it("applies half-even at the sub-cent boundary", () => {
		// 0.005 rupees = 0.5 cents; ties to even => 0
		expect(toCents("-0.005")).toBe(0);
		expect(toCents("0.005")).toBe(0);
		// 0.015 rupees = 1.5 cents; ties to even => 2
		expect(toCents("0.015")).toBe(2);
	});

	it("preserves sign", () => {
		expect(toCents("-12.34")).toBe(-1234);
	});

	it("throws on non-numeric input", () => {
		expect(() => toCents("abc")).toThrow(/invalid numeric input/);
		expect(() => toCents("1.2.3")).toThrow(/invalid numeric input/);
	});
});

describe("computeLineTotals", () => {
	it("rounds at the line level using integer math", () => {
		// qty 1.5 x Rs 3.33 = Rs 4.995 -> 500 cents (half-even on .5)
		// tax 18% of 500 = 90
		expect(computeLineTotals(1500, 333, 1800)).toEqual({
			line_subtotal_cents: 500,
			line_tax_cents: 90,
			line_total_cents: 590
		});
	});

	it("handles a zero tax rate", () => {
		expect(computeLineTotals(1000, 100, 0)).toEqual({
			line_subtotal_cents: 100,
			line_tax_cents: 0,
			line_total_cents: 100
		});
	});

	it("rejects non-integer inputs", () => {
		expect(() => computeLineTotals(1000.5, 100, 0)).toThrow(/integer inputs/);
		expect(() => computeLineTotals(1000, 100.5, 0)).toThrow(/integer inputs/);
	});
});

describe("formatMoney", () => {
	it("formats with the requested currency symbol and grouping", () => {
		expect(formatMoney(123456, { code: "LKR" })).toBe("Rs 1,234.56");
	});

	it("can drop the symbol", () => {
		expect(formatMoney(123456, { code: "LKR", withSymbol: false })).toBe("1,234.56");
	});

	it("always renders two minor digits", () => {
		expect(formatMoney(5, { code: "LKR", withSymbol: false })).toBe("0.05");
		expect(formatMoney(100, { code: "LKR", withSymbol: false })).toBe("1.00");
	});

	// Documents current behaviour: the sign lands after the symbol, not
	// before it. Pinned deliberately so a future change is a conscious one.
	it("places the minus sign after the currency symbol", () => {
		expect(formatMoney(-5, { code: "USD" })).toBe("$ -0.05");
	});

	it("rejects non-integer cents", () => {
		expect(() => formatMoney(1.5, { code: "LKR" })).toThrow(/integer cents/);
	});
});

describe("formatRate", () => {
	it("renders basis points as a percentage", () => {
		expect(formatRate(1800)).toBe("18%");
		expect(formatRate(1850)).toBe("18.5%");
		expect(formatRate(0)).toBe("0%");
		expect(formatRate(12345)).toBe("123.45%");
	});
});

describe("formatQty", () => {
	it("trims trailing zeros from the milli quantity", () => {
		expect(formatQty(1000)).toBe("1");
		expect(formatQty(1500)).toBe("1.5");
		expect(formatQty(1234)).toBe("1.234");
	});
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `bunx vitest run app/lib/money.test.ts`
Expected: PASS, all assertions green. These pin existing correct behaviour — they should pass immediately. **If any assertion fails, stop and report it rather than editing the expectation**: a failure here means `money.ts` behaves differently than the audit measured, which is itself a finding.

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: clean (auto-fixes tabs/spacing).

- [ ] **Step 4: Commit**

```bash
git add app/lib/money.test.ts
git commit -m "test: cover money.ts rounding, parsing, and formatting"
```

### Task 2: Unit tests for `app/lib/payroll-cycle.ts`

**Files:**
- Create: `app/lib/payroll-cycle.test.ts`

**Interfaces:**
- Consumes: `resolvePayrollCycle`, `nextPayrollCycle` from `./payroll-cycle`
- Produces: nothing (test-only)

- [ ] **Step 1: Write the failing test**

Create `app/lib/payroll-cycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextPayrollCycle, resolvePayrollCycle } from "./payroll-cycle";

const simple = { payroll_period_start_day: 1, payroll_period_end_day: 31, payroll_pay_day: 25 };

describe("resolvePayrollCycle", () => {
	it("clamps day 31 to the last day of a short month", () => {
		expect(
			resolvePayrollCycle(2026, 2, {
				payroll_period_start_day: 31,
				payroll_period_end_day: 31,
				payroll_pay_day: 31
			})
		).toEqual({
			periodStart: "2026-02-28",
			periodEnd: "2026-02-28",
			payDate: "2026-02-28"
		});
	});

	it("clamps to 29 in a leap February", () => {
		expect(
			resolvePayrollCycle(2024, 2, {
				payroll_period_start_day: 1,
				payroll_period_end_day: 31,
				payroll_pay_day: 31
			})
		).toEqual({
			periodStart: "2024-02-01",
			periodEnd: "2024-02-29",
			payDate: "2024-02-29"
		});
	});

	it("straddles months when the end day is before the start day", () => {
		expect(
			resolvePayrollCycle(2026, 4, {
				payroll_period_start_day: 26,
				payroll_period_end_day: 25,
				payroll_pay_day: 30
			})
		).toEqual({
			periodStart: "2026-03-26",
			periodEnd: "2026-04-25",
			payDate: "2026-04-30"
		});
	});

	it("rolls the straddled start back into the previous year in January", () => {
		expect(
			resolvePayrollCycle(2026, 1, {
				payroll_period_start_day: 26,
				payroll_period_end_day: 25,
				payroll_pay_day: 5
			})
		).toEqual({
			periodStart: "2025-12-26",
			periodEnd: "2026-01-25",
			payDate: "2026-01-05"
		});
	});

	it("zero-pads month and day", () => {
		const c = resolvePayrollCycle(2026, 3, { ...simple, payroll_pay_day: 5 });
		expect(c.periodStart).toBe("2026-03-01");
		expect(c.payDate).toBe("2026-03-05");
	});
});

describe("nextPayrollCycle", () => {
	it("treats the pay date itself as still the current cycle", () => {
		const r = nextPayrollCycle("2026-06-25", simple);
		expect(r.year).toBe(2026);
		expect(r.month).toBe(6);
		expect(r.daysUntilPay).toBe(0);
		expect(r.cycle.payDate).toBe("2026-06-25");
	});

	it("moves to next month once the pay date has passed", () => {
		const r = nextPayrollCycle("2026-06-26", simple);
		expect(r.year).toBe(2026);
		expect(r.month).toBe(7);
		expect(r.cycle.payDate).toBe("2026-07-25");
		expect(r.daysUntilPay).toBe(29);
	});

	it("rolls over the year from December", () => {
		const r = nextPayrollCycle("2026-12-26", simple);
		expect(r.year).toBe(2027);
		expect(r.month).toBe(1);
		expect(r.cycle.payDate).toBe("2027-01-25");
		expect(r.daysUntilPay).toBe(30);
	});
});
```

- [ ] **Step 2: Run the test**

Run: `bunx vitest run app/lib/payroll-cycle.test.ts`
Expected: PASS. Same rule as Task 1 — a failure is a finding, not an expectation to edit.

- [ ] **Step 3: Commit**

```bash
bun run lint
git add app/lib/payroll-cycle.test.ts
git commit -m "test: cover payroll cycle clamping and month rollover"
```

### Task 3: Unit tests for `app/lib/numbering.ts`

**Files:**
- Create: `app/lib/numbering.test.ts`

**Interfaces:**
- Consumes: `formatDocumentNumber`, `computeFiscalYear`, type `DocumentType` from `./numbering`
- Produces: nothing (test-only)

**Note:** `numbering.ts` imports `./db` at module level, which pulls in `@tauri-apps/plugin-sql`. **This was verified to import cleanly under vitest's node environment — no `vi.mock` is needed.** The Tauri dependency only fails when a DB function is actually *called*, and these tests call only pure functions. Do not add a mock; it is unnecessary.

- [ ] **Step 1: Write the failing test**

Create `app/lib/numbering.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeFiscalYear, formatDocumentNumber, type DocumentType } from "./numbering";

describe("formatDocumentNumber", () => {
	it("uses the right prefix for every document type", () => {
		const cases: Array<[DocumentType, string]> = [
			["quote", "QUO-0001"],
			["invoice", "INV-0001"],
			["bill", "BIL-0001"],
			["voucher", "VCH-0001"],
			["payslip", "PSL-0001"],
			["credit_note", "CRN-0001"],
			["letter", "LET-0001"]
		];
		for (const [type, expected] of cases) {
			expect(formatDocumentNumber(type, 1)).toBe(expected);
		}
	});

	it("pads to four digits and grows past them", () => {
		expect(formatDocumentNumber("invoice", 42)).toBe("INV-0042");
		expect(formatDocumentNumber("invoice", 9999)).toBe("INV-9999");
		expect(formatDocumentNumber("invoice", 12345)).toBe("INV-12345");
	});

	it("carries no fiscal year (continuous numbering, migration 0047)", () => {
		expect(formatDocumentNumber("quote", 4)).toBe("QUO-0004");
	});

	it("rejects non-positive or non-integer sequences", () => {
		expect(() => formatDocumentNumber("quote", 0)).toThrow(/bad sequence/);
		expect(() => formatDocumentNumber("quote", -1)).toThrow(/bad sequence/);
		expect(() => formatDocumentNumber("quote", 1.5)).toThrow(/bad sequence/);
	});
});

describe("computeFiscalYear", () => {
	it("labels an April-start fiscal year by its opening calendar year", () => {
		expect(computeFiscalYear("2026-04-01", 4)).toBe(2026);
		expect(computeFiscalYear("2026-12-31", 4)).toBe(2026);
		expect(computeFiscalYear("2027-03-31", 4)).toBe(2026);
	});

	it("puts pre-start months in the previous fiscal year", () => {
		expect(computeFiscalYear("2026-03-15", 4)).toBe(2025);
	});

	it("is an identity mapping for a January start", () => {
		expect(computeFiscalYear("2026-01-01", 1)).toBe(2026);
		expect(computeFiscalYear("2026-12-31", 1)).toBe(2026);
	});

	it("rejects an invalid date or start month", () => {
		expect(() => computeFiscalYear("not-a-date", 4)).toThrow(TypeError);
		expect(() => computeFiscalYear("2026-04-01", 0)).toThrow(/bad start month/);
		expect(() => computeFiscalYear("2026-04-01", 13)).toThrow(/bad start month/);
	});
});
```

- [ ] **Step 2: Run the test**

Run: `bunx vitest run app/lib/numbering.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the full suite**

Run: `bun run test`
Expected: 33 test files pass (was 30). Test count rises from 290.

- [ ] **Step 4: Bump version and commit**

Edit `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` from `0.158.3` to `0.158.4`.

```bash
bun run lint
git add app/lib/numbering.test.ts package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "test: cover document numbering and fiscal year (v0.158.4)"
```

- [ ] **Step 5: Stop and report to the user.** Do not push or open a PR without explicit confirmation.

---

# Phase 2 — PR 2: employer contributions in payroll expense (`fix/employer-payroll-cost`, v0.158.5)

Branch from a freshly pulled `main` **after PR 1 merges**: `git checkout main && git pull --ff-only && git checkout -b fix/employer-payroll-cost`

### Task 4: Include employer EPF + ETF in the P&L payroll expense

**Files:**
- Modify: `app/pages/reports/profit-loss.vue` (the `totals` computed, ~line 753; the payslips drill-down table, ~line 513-545)
- Modify: `app/lib/report-pdf.ts` (P&L payload builder)

**Interfaces:**
- Consumes: `PayslipRow` fields `earnings_cents`, `epf_employer_cents`, `etf_cents` (all `number`, all non-null with DB defaults, added in migration 0035)
- Produces: `totals.payroll` now means *total employer cost*, not gross earnings. `totals.employerContrib` is new and exposed for the drill-down column and the PDF payload.

- [ ] **Step 1: Update the totals computed**

In `app/pages/reports/profit-loss.vue`, replace the `payroll` line inside `totals` (currently `const payroll = filtered.value.payslips.reduce((s, r) => s + r.earnings_cents, 0);`) with:

```ts
		// Payroll expense is the employer's TOTAL cost, not the gross on
		// the payslip: employer EPF (12%) and ETF (3%) are real expenses
		// that never appear in earnings_cents. app/lib/payslip-pdf.ts has
		// always printed this figure on the payslip itself — the reports
		// were the ones disagreeing.
		const payrollGross = filtered.value.payslips.reduce((s, r) => s + r.earnings_cents, 0);
		const employerContrib = filtered.value.payslips.reduce(
			(s, r) => s + r.epf_employer_cents + r.etf_cents,
			0
		);
		const payroll = payrollGross + employerContrib;
```

Then add both new figures to the returned object, alongside the existing keys:

```ts
			payrollGross,
			employerContrib,
```

- [ ] **Step 2: Add an employer-cost column to the payslips drill-down**

So the tile reconciles against the rows. In the payslips `<ResizableDataTable>` block (around line 513), after the existing `earnings_cents` column, add:

```vue
					<Column header="Employer EPF + ETF" :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap">
								{{ formatLKR(data.epf_employer_cents + data.etf_cents) }}
							</div>
						</template>
					</Column>
```

- [ ] **Step 3: Thread the figure into the PDF payload**

In `app/lib/report-pdf.ts`, the P&L builder's breakdown rows use the shape
`{ label, sublabel, amount, percent }` (see the Income / Bills / Payroll rows
around lines 184-205).

The Payroll row's sublabel currently reads **"Issued payslips, gross earnings
(before deductions)"**, which becomes factually wrong once the figure includes
employer contributions. Update it to:

```ts
					sublabel: "Issued payslips, gross earnings plus employer EPF and ETF",
```

The `amount` and `percent` already read from `input.totals.payroll`, so they
follow automatically once Step 1 widens that value. Also widen the builder's
`totals` interface (~line 126) to carry `employerContrib: number` for the
detail section.

- [ ] **Step 4: Verify by hand**

Run `bun run tauri:dev`, open a business with payroll data, go to `/reports/profit-loss`, pick a range containing issued payslips with statutory amounts. Confirm:
- The Payroll tile equals gross + employer EPF + ETF.
- The breakdown table's payroll row matches the tile.
- The sum of the drill-down's `Earnings` + `Employer EPF + ETF` columns equals the tile.
- Net profit drops by exactly the employer contribution total.

- [ ] **Step 5: Commit**

```bash
bun run lint && bun run test
git add app/pages/reports/profit-loss.vue app/lib/report-pdf.ts
git commit -m "fix: count employer EPF and ETF as payroll expense in P&L"
```

### Task 5: Mirror the same figure in the payroll register

**Files:**
- Modify: `app/pages/reports/payroll-register.vue` (`employeeRows` accumulator ~line 585, `totals` computed ~line 594)
- Modify: `app/lib/report-pdf.ts` (payroll-register payload builder)

**Interfaces:**
- Consumes: same three `PayslipRow` fields as Task 4
- Produces: each employee row gains `employerContrib: number`; `totals` gains `employerContrib: number`

- [ ] **Step 1: Accumulate employer contributions per employee**

In the `employeeRows` reducer, add `employerContrib: 0` to the initial row object (next to `earnings: 0`), then inside the accumulation block add:

```ts
			row.employerContrib += p.epf_employer_cents + p.etf_cents;
```

- [ ] **Step 2: Add it to the totals computed**

Add `let employerContrib = 0;` alongside the other accumulators and `employerContrib += r.employerContrib;` inside the loop, then include it in the returned object.

- [ ] **Step 3: Surface it as a column**

Add an "Employer EPF + ETF" column to the register table, following the exact shape of the existing `earnings_cents` column in that file.

- [ ] **Step 4: Verify the two reports agree**

With the same date range, the P&L payroll tile must equal the payroll register's (gross + employer contributions) total. If they disagree, one of the two filters differs — P&L filters payslips on `period_end`, so check the register uses the same date field before changing any arithmetic.

- [ ] **Step 5: Bump version and commit**

Edit the three version files from `0.158.4` to `0.158.5`.

```bash
bun run lint && bun run test
git add app/pages/reports/payroll-register.vue app/lib/report-pdf.ts package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "fix: show employer contributions in the payroll register (v0.158.5)"
```

- [ ] **Step 6: Stop and report to the user.**

---

# Phase 3 — PR 3: credit-note wiring (`feat/credit-note-accounting`, v0.159.0)

Branch from a freshly pulled `main` **after PR 2 merges**: `git checkout main && git pull --ff-only && git checkout -b feat/credit-note-accounting`

This is the large one. Tasks 6–8 are the correctness core and must land before any report task.

### Task 6: Thread credit through `derived-status.ts`

**Files:**
- Modify: `app/lib/derived-status.ts`
- Modify: `app/lib/derived-status.test.ts`

**Interfaces:**
- Produces:
  - `InvoiceStatus` gains the `"credited"` member.
  - `deriveInvoiceStatus(persisted: "draft"|"sent"|"cancelled", paid: number, credited: number, total: number, dueDate: string, today: string): InvoiceStatus` — **note the new third parameter; every existing caller must be updated.**
  - `invoiceDerivedFrom(today: string)` now exposes `_credited` in addition to `_paid` / `_balance` / `_status`.
  - `clientDerivedFrom()` `_outstanding` nets out both linked and unapplied credits.

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/derived-status.test.ts`:

```ts
describe("deriveInvoiceStatus with credit notes", () => {
	it("still reports paid when cash alone covers the total", () => {
		expect(deriveInvoiceStatus("sent", 1000, 0, 1000, "2026-07-01", TODAY)).toBe("paid");
		// Credit on top of full cash payment doesn't downgrade it.
		expect(deriveInvoiceStatus("sent", 1000, 500, 1000, "2026-07-01", TODAY)).toBe("paid");
	});

	it("reports credited when credit alone closes the invoice", () => {
		expect(deriveInvoiceStatus("sent", 0, 1000, 1000, "2026-07-01", TODAY)).toBe("credited");
	});

	it("reports credited when cash plus credit close the invoice", () => {
		expect(deriveInvoiceStatus("sent", 400, 600, 1000, "2026-07-01", TODAY)).toBe("credited");
	});

	it("reports credited even when the invoice is past due", () => {
		expect(deriveInvoiceStatus("sent", 0, 1000, 1000, "2020-01-01", TODAY)).toBe("credited");
	});

	it("reports partial when credit only covers part of the total", () => {
		expect(deriveInvoiceStatus("sent", 0, 400, 1000, "2026-07-01", TODAY)).toBe("partial");
	});

	it("still reports overdue when a part-credited invoice is past due", () => {
		expect(deriveInvoiceStatus("sent", 0, 400, 1000, "2020-01-01", TODAY)).toBe("overdue");
	});

	it("keeps draft and cancelled sticky regardless of credit", () => {
		expect(deriveInvoiceStatus("draft", 0, 5000, 1000, "2020-01-01", TODAY)).toBe("draft");
		expect(deriveInvoiceStatus("cancelled", 0, 5000, 1000, "2020-01-01", TODAY)).toBe("cancelled");
	});

	it("handles over-crediting without breaking", () => {
		expect(deriveInvoiceStatus("sent", 0, 5000, 1000, "2026-07-01", TODAY)).toBe("credited");
	});
});

describe("invoiceDerivedFrom", () => {
	it("joins issued credit notes and floors the balance at zero", () => {
		const sql = invoiceDerivedFrom(TODAY);
		expect(sql).toContain("credit_notes");
		expect(sql).toContain("status = 'issued'");
		expect(sql).toContain("source_invoice_id");
		expect(sql).toContain("_credited");
		expect(sql).toContain("MAX(0,");
		expect(sql).toContain("'credited'");
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run app/lib/derived-status.test.ts`
Expected: FAIL — the new tests pass the wrong arity, and `'credited'` isn't in the SQL yet. Existing tests will also fail to compile against the new signature until Step 3 lands.

- [ ] **Step 3: Implement**

In `app/lib/derived-status.ts`:

Widen the type:

```ts
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "credited" | "overdue" | "cancelled";
```

Replace `deriveInvoiceStatus` with:

```ts
export function deriveInvoiceStatus(
	persisted: "draft" | "sent" | "cancelled",
	paid: number,
	credited: number,
	total: number,
	dueDate: string,
	today: string
): InvoiceStatus {
	if (persisted === "draft") return "draft";
	if (persisted === "cancelled") return "cancelled";
	// Cash alone covering the total wins: "paid" means money arrived.
	if (paid >= total && total > 0) return "paid";
	// Settled, but a credit note was needed to close it.
	if (paid + credited >= total && total > 0) return "credited";
	if (dueDate < today) return "overdue";
	if (paid > 0 || credited > 0) return "partial";
	return "sent";
}
```

Add the credit-join helper immediately **below** `paidJoinOn` and **above** `invoiceDerivedFrom`:

```ts
// Issued credit notes summed per source invoice. Mirrors paidJoinOn's shape.
// Drafts aren't real yet and cancelled are void, so only 'issued' counts.
function creditJoinOn(): string {
	return `LEFT JOIN (SELECT source_invoice_id, SUM(total_cents) AS credited FROM credit_notes `
		+ `WHERE status = 'issued' AND source_invoice_id IS NOT NULL GROUP BY source_invoice_id) cn `
		+ `ON cn.source_invoice_id = `;
}
```

Replace `invoiceDerivedFrom`:

```ts
export function invoiceDerivedFrom(today: string): string {
	const paid = "COALESCE(vp.paid, 0)";
	const credited = "COALESCE(cn.credited, 0)";
	return `(SELECT i.*, ${paid} AS _paid, ${credited} AS _credited, `
		+ `MAX(0, i.total_cents - ${paid} - ${credited}) AS _balance, `
		+ `CASE WHEN i.status = 'draft' THEN 'draft' `
		+ `WHEN i.status = 'cancelled' THEN 'cancelled' `
		+ `WHEN ${paid} >= i.total_cents AND i.total_cents > 0 THEN 'paid' `
		+ `WHEN ${paid} + ${credited} >= i.total_cents AND i.total_cents > 0 THEN 'credited' `
		+ `WHEN i.due_date < '${today}' THEN 'overdue' `
		+ `WHEN ${paid} > 0 OR ${credited} > 0 THEN 'partial' ELSE 'sent' END AS _status `
		+ `FROM invoices i ${paidJoinOn("related_invoice_id", "receipt")}i.id `
		+ `${creditJoinOn()}i.id) sub`;
}
```

Note `MAX(0, …)` is SQLite's two-argument scalar `max()`. This also fixes a pre-existing inconsistency: the SQL `_balance` never floored at zero while the TS `balanceCentsFor` always did.

Replace `clientDerivedFrom`:

```ts
// Clients with `_outstanding` = Σ open-invoice balances (net of linked
// credit notes) minus any unapplied client-level credits. Must agree with
// /reports/aged-receivables — the two read the same books.
export function clientDerivedFrom(): string {
	const paid = "COALESCE(vp.paid, 0)";
	const credited = "COALESCE(cn.credited, 0)";
	const openBalance = `(i.total_cents - ${paid} - ${credited})`;
	return `(SELECT c.*, MAX(0, COALESCE((`
		+ `SELECT SUM(${openBalance}) FROM invoices i `
		+ `${paidJoinOn("related_invoice_id", "receipt")}i.id `
		+ `${creditJoinOn()}i.id `
		+ `WHERE i.client_id = c.id AND i.status = 'sent' AND ${openBalance} > 0`
		+ `), 0) - COALESCE((`
		+ `SELECT SUM(total_cents) FROM credit_notes `
		+ `WHERE client_id = c.id AND status = 'issued' AND source_invoice_id IS NULL`
		+ `), 0)) AS _outstanding FROM clients c) sub`;
}
```

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run app/lib/derived-status.test.ts`
Expected: the new tests PASS. **Pre-existing `deriveInvoiceStatus` tests will fail on arity** — update each existing call to pass `0` as the new third argument (they were written before credit existed, so zero credit is the correct translation).

- [ ] **Step 5: Commit**

```bash
bun run lint && bun run test
git add app/lib/derived-status.ts app/lib/derived-status.test.ts
git commit -m "feat: thread credit notes through invoice status derivation"
```

### Task 7: Credit aggregates in the credit-notes store, and fix the false comments

**Files:**
- Modify: `app/stores/credit_notes.ts`

**Interfaces:**
- Produces:
  - `creditedCentsFor(invoiceId: number): number` — Σ `total_cents` of issued credit notes whose `source_invoice_id` is `invoiceId`
  - `unappliedCreditFor(clientId: number): number` — Σ `total_cents` of issued credit notes for that client with `source_invoice_id === null`
  - Both must be returned from the store's setup so `useInvoicesStore` can consume them.

- [ ] **Step 1: Delete the comments that describe non-existent behaviour**

Four sites currently claim the offset already works. Correct them to describe what the code does **after** this PR — that the offset is computed by `derived-status.ts` from these aggregates:

- The file header block (~lines 12-15)
- The `source_invoice_id` field doc (~lines 38-41)
- The `create` parameter doc (~lines 226-229)
- The `createFromInvoice` doc (~line 272)

This step is not optional. The audit found these comments actively misleading; leaving them stale after wiring the real behaviour would be a second bug.

- [ ] **Step 2: Add the aggregates**

```ts
	/// Σ issued credit notes settled against this invoice, in cents.
	/// Drafts aren't real yet; cancelled are void. Mirrors the SQL in
	/// `creditJoinOn()` in app/lib/derived-status.ts — keep them in step.
	const creditedCentsFor = (invoiceId: number): number =>
		creditNotes.value
			.filter((c) => c.status === "issued" && c.source_invoice_id === invoiceId)
			.reduce((sum, c) => sum + c.total_cents, 0);

	/// Σ issued credit notes for this client that aren't tied to any
	/// invoice. These reduce what the client owes overall but can't be
	/// attributed to a specific document, so receivables and statements
	/// show them as a separate unapplied-credit line.
	const unappliedCreditFor = (clientId: number): number =>
		creditNotes.value
			.filter((c) => c.status === "issued" && c.client_id === clientId && c.source_invoice_id === null)
			.reduce((sum, c) => sum + c.total_cents, 0);
```

Add both to the store's return object.

- [ ] **Step 3: Commit**

```bash
bun run lint && bun run test
git add app/stores/credit_notes.ts
git commit -m "feat: add credit aggregates to the credit-notes store"
```

### Task 8: Consume credit in the invoices store

**Files:**
- Modify: `app/stores/invoices.ts` (`balanceCentsFor` ~line 236, `derivedStatus` ~line 246, `outstandingTotal` ~line 272, status filter typing)

**Interfaces:**
- Consumes: `creditedCentsFor` from `useCreditNotesStore`
- Produces: `creditedCentsFor(invoiceId: number): number` re-exported from the invoices store for detail-page use; `balanceCentsFor` now nets credit.

- [ ] **Step 1: Wire the store dependency**

Follow the existing pattern by which this store already reaches `useVouchersStore` — mirror it exactly for `useCreditNotesStore`. Read the top of the file first; do not introduce a different wiring style.

- [ ] **Step 2: Update the three consumers**

```ts
	const creditedCentsFor = (invoiceId: number): number =>
		creditNotes.creditedCentsFor(invoiceId);

	const balanceCentsFor = (inv: InvoiceRow): number =>
		Math.max(0, inv.total_cents - paidCentsFor(inv.id) - creditedCentsFor(inv.id));

	const derivedStatus = (inv: InvoiceRow, now: string = todayISO()): InvoiceStatus =>
		deriveInvoiceStatus(
			inv.status,
			paidCentsFor(inv.id),
			creditedCentsFor(inv.id),
			inv.total_cents,
			inv.due_date,
			now
		);
```

In `outstandingTotal`, add `"credited"` to the set of statuses that are **excluded** from the outstanding sum — a credited invoice is closed and must not count as receivable. The existing condition keeps `sent | partial | overdue`, so `credited` is excluded automatically; **verify this rather than assuming**, and add a comment recording it.

- [ ] **Step 3: Update the docblock**

The precedence comment above `derivedStatus` (~lines 239-245) lists the old five states. Rewrite it to include `credited` and its position in the precedence order.

- [ ] **Step 4: Verify by hand**

`bun run tauri:dev`. Create an invoice for 10,000, issue it, create a credit note for 4,000 linked to it, mark the credit note issued. The invoice detail page and `/invoices` must both show a 6,000 balance and `partial`. Raise the credit note to 10,000 → status `credited`, balance 0.

- [ ] **Step 5: Commit**

```bash
bun run lint && bun run test
git add app/stores/invoices.ts
git commit -m "feat: net credit notes out of invoice balances"
```

### Task 9: Credit notes in the VAT report

**Files:**
- Modify: `app/pages/reports/vat.vue` (`filtered` ~line 586, `totals` ~line 602, narrative strings ~line 618-623, drill-down tabs ~line 300-430)
- Modify: `app/lib/report-pdf.ts` (VAT payload builder)

**Interfaces:**
- Consumes: `useCreditNotesStore().creditNotes`
- Produces: `totals.creditVat: number`; `outputVat` becomes net of credits

- [ ] **Step 1: Add credit notes to the filtered set**

Mirror the existing invoice filter exactly, keyed on the credit note's **own** `issue_date` (per the spec's period-attribution decision):

```ts
		const creditNotes = creditNotesStore.creditNotes
			.filter((row) => row.status === "issued" && inRange(row.issue_date))
			.sort((a, b) => a.issue_date.localeCompare(b.issue_date));
```

- [ ] **Step 2: Net credits out of output VAT**

```ts
		const grossOutputVat = filtered.value.invoices.reduce((s, r) => s + r.tax_cents, 0);
		const creditVat = filtered.value.creditNotes.reduce((s, r) => s + r.tax_cents, 0);
		const outputVat = grossOutputVat - creditVat;
```

Keep `inputVat` and `netVat = outputVat - inputVat` as they are. Expose `grossOutputVat` and `creditVat` in the returned object so the tile can show the deduction.

- [ ] **Step 3: Add a Credit notes drill-down tab**

Follow the existing Invoices/Bills tab shape in this file exactly — same `TABS` entry pattern, same `tabCounts` wiring, same `ResizableDataTable` columns (number, date, client, subtotal, VAT).

- [ ] **Step 4: Review the narrative strings**

The existing summary strings (~lines 618-623) assume `outputVat >= 0`. Credits can now push it negative. Read each string and add a case for net-negative output VAT. Do not leave a string that would read nonsensically.

- [ ] **Step 5: Verify by hand**

Issue an invoice with VAT, note the output VAT figure, then issue a credit note against it with VAT. Output VAT must drop by exactly the credit note's `tax_cents`.

- [ ] **Step 6: Commit**

```bash
bun run lint && bun run test
git add app/pages/reports/vat.vue app/lib/report-pdf.ts
git commit -m "fix: deduct issued credit notes from output VAT"
```

### Task 10: Credit notes in the P&L

**Files:**
- Modify: `app/pages/reports/profit-loss.vue`
- Modify: `app/lib/report-pdf.ts`

**Interfaces:**
- Produces: `totals.creditNotes: number`; `income` becomes net of credits

- [ ] **Step 1: Filter and subtract**

Add the same `creditNotes` filter as Task 9 Step 1 (issued, by own `issue_date`), then:

```ts
		const grossIncome = filtered.value.invoices.reduce((s, r) => s + r.subtotal_cents, 0);
		const creditNotes = filtered.value.creditNotes.reduce((s, r) => s + r.subtotal_cents, 0);
		const income = grossIncome - creditNotes;
```

`subtotal_cents` (not `total_cents`) — VAT is a pass-through, matching how invoice income is already counted in this file.

- [ ] **Step 2: Add a Credit notes drill-down tab** following the file's existing tab pattern.

- [ ] **Step 3: Check the margin label**

`marginLabel` divides by `totals.income`. Credits can now drive income to zero or negative. Verify the guard at `if (totals.value.income === 0)` still produces sensible copy for a negative income, and extend it if not.

- [ ] **Step 4: Commit**

```bash
bun run lint && bun run test
git add app/pages/reports/profit-loss.vue app/lib/report-pdf.ts
git commit -m "fix: deduct issued credit notes from P&L income"
```

### Task 11: Credit notes in aged receivables and the customer statement

**Files:**
- Modify: `app/pages/reports/aged-receivables.vue`
- Modify: `app/lib/statement-pdf.ts`
- Modify: `src-tauri/templates/statement.typ`
- Modify: `app/lib/report-pdf.ts` (aged-receivables payload)

**Interfaces:**
- Consumes: `balanceCentsFor` (now credit-netted, from Task 8), `unappliedCreditFor` (Task 7)
- Produces: per-client rows carry `unappliedCredit: number`

- [ ] **Step 1: Aged receivables**

Per-invoice bucketing already routes through `invoicesStore.balanceCentsFor()`, which nets linked credits after Task 8 — so buckets need **no arithmetic change**. Verify this by reading the file before editing.

Add `unappliedCredit: unappliedCreditFor(clientId)` to each per-client row, render it as its own column, and subtract it from the client's total. **Do not distribute unapplied credit across the aging buckets** — it has no due date, so it belongs to no bucket.

- [ ] **Step 2: Statement PDF payload**

In `app/lib/statement-pdf.ts`, invoice rows pick up credit-netted balances automatically. Add an `unapplied_credit_display` field to the payload, populated only when non-zero.

- [ ] **Step 3: Statement template**

In `src-tauri/templates/statement.typ`, render an unapplied-credit line above the total when the field is present. Follow the template's existing conditional-field idiom (`#if data.field != none`).

**Typst landmine:** helper functions resolve in *definition order* — a `#let` can only call something defined above it. If you add a helper, place it above its caller, and render at least one PDF that actually exercises the new branch (i.e. a client with an unapplied credit). A render with the field absent proves nothing.

- [ ] **Step 4: Verify by hand**

Generate a statement for a client who has both a linked credit note and a standalone one. Confirm the invoice rows are reduced, the unapplied line appears, and the closing total equals the aged-receivables figure for that client. Then check `/clients` shows the same outstanding number — that's the `clientDerivedFrom` change from Task 6 proving out.

- [ ] **Step 5: Commit**

```bash
bun run lint && bun run test
git add app/pages/reports/aged-receivables.vue app/lib/statement-pdf.ts src-tauri/templates/statement.typ app/lib/report-pdf.ts
git commit -m "fix: net credit notes into aged receivables and statements"
```

### Task 12: Net credits into the dashboard receivables tile

**Files:**
- Modify: `app/lib/dashboard-data.ts` (`fetchInvoiceKpis`, ~lines 20-55)

**Why this is its own task:** `dashboard-data.ts` carries a **third independent
copy** of the invoice-balance logic — hand-rolled SQL that joins only the
voucher receipts subquery, entirely separate from both `derived-status.ts`'s
builder and the store's TS path. Its own header comment claims it "mirrors the
store's `outstandingTotal` + `overdueCount` computeds", so after Task 8 that
claim goes stale and the dashboard tile silently disagrees with `/invoices`.

**Interfaces:**
- Produces: `InvoiceKpis.outstanding_cents` and `overdue_count` net of credits

- [ ] **Step 1: Add the credit-notes join**

In the invoice KPI query, add a second `LEFT JOIN` alongside the existing
receipts subquery, matching the shape used by `creditJoinOn()` in Task 6:

```sql
			LEFT JOIN (
				SELECT source_invoice_id, SUM(total_cents) AS credited
				FROM credit_notes
				WHERE status = 'issued' AND source_invoice_id IS NOT NULL
				GROUP BY source_invoice_id
			) cn ON cn.source_invoice_id = i.id
```

Then change the `balance` expression in that query to subtract
`COALESCE(cn.credited, 0)` as well as the paid total. Read the full query
before editing — the `balance` alias is referenced by three separate
aggregate expressions (`outstanding_cents`, `open_count`, `overdue_count`),
and all three must pick up the change.

- [ ] **Step 2: Fix the stale header comment**

Lines 20-21 claim this mirrors the store's computeds. Extend it to name the
credit-note join explicitly, so the next person knows there are now **three**
places invoice balance is computed and that they must move together.

- [ ] **Step 3: Verify**

The dashboard Receivables tile must equal the `/invoices` filtered total and
the aged-receivables total for the same books. Use the same fixture as Task 13
Step 4.

- [ ] **Step 4: Commit**

```bash
bun run lint && bun run test
git add app/lib/dashboard-data.ts
git commit -m "fix: net credit notes into the dashboard receivables tile"
```

### Task 13: Surface `credited` in the UI

**Files:**
- Modify: `app/components/StatusBadge.vue`
- Modify: `app/pages/invoices/index.vue` (status filter chips)
- Modify: `app/pages/invoices/[id].vue` (linked credit notes section)

- [ ] **Step 1: Badge colour**

Add a `credited` case to `StatusBadge.vue`. **Must be a theme-stable semantic colour, never `primary`** — that rule is stated in the component and exists because `primary` is user-configurable. `info` (blue) reads as "settled, but not by cash" and is not already taken by an invoice status; confirm against the existing map before picking.

- [ ] **Step 2: Filter chip**

Add a `credited` chip to the invoices list status filters, coloured to match the badge. The chip set is multi-select with empty-means-all — follow the existing `toggleStatusFilter` pattern.

- [ ] **Step 3: Linked credit notes on the invoice detail page**

Add a section listing credit notes whose `source_invoice_id` is this invoice: number, date, total, status, each routing to `/credit-notes/{id}`. Render nothing when the list is empty.

**Keep-alive landmine:** every page is `<NuxtPage keepalive>`, so `ref`s survive navigation. Any flag this section introduces must be reset in a `finally`, not left to unmount — this bug class has shipped twice in this codebase already.

- [ ] **Step 4: Full verification sweep**

This is the acceptance criterion for the whole PR. With one invoice of 10,000, a linked credit note of 4,000, and a standalone credit note of 1,000 for the same client, confirm **all seven surfaces agree**:

| Surface | Expected |
|---|---|
| `/invoices` row | balance 6,000, status `partial` |
| `/invoices/[id]` | balance 6,000, credit note listed |
| `/reports/aged-receivables` | client total 5,000 (6,000 − 1,000 unapplied) |
| Statement PDF | invoice row 6,000, unapplied credit 1,000, total 5,000 |
| `/clients` outstanding | 5,000 |
| Dashboard Receivables tile | 5,000 |
| `/reports/vat` | output VAT down by the credit notes' `tax_cents` |

Invoice balance is now computed in **three** places — the pure function in
`derived-status.ts`, its mirrored SQL builder, and `dashboard-data.ts`'s
hand-rolled query. Any two surfaces disagreeing means one of those three
drifted; fix the drift, not the symptom.

Then raise the linked credit note to 10,000 and confirm the invoice flips to
`credited` with a zero balance, and drops out of receivables entirely.

- [ ] **Step 5: Bump version and commit**

Edit the three version files from `0.158.5` to `0.159.0` (minor — new feature).

```bash
bun run lint && bun run test
git add app/components/StatusBadge.vue app/pages/invoices/index.vue "app/pages/invoices/[id].vue" package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "feat: surface the credited invoice status (v0.159.0)"
```

- [ ] **Step 6: Stop and report to the user.** Do not push or open a PR without explicit confirmation.

---

## Post-implementation

Update `CLAUDE.md`:
- The invoices status FSM section — add `credited` to the derived states and its precedence.
- The credit-notes bullet under "Schema overview" — it currently implies the feature is complete; note that credits now flow into VAT / P&L / receivables / statements.
- The "Deferred / open items" list — credit-note PDF is still outstanding.
