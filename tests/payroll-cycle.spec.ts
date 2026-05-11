// Coverage for the payroll-cycle resolver. The straddle case + month-
// length clamp are the two places it would be easy to get subtly wrong.

import { describe, expect, it } from "vitest";
import { nextPayrollCycle, resolvePayrollCycle } from "../app/lib/payroll-cycle";

describe("resolvePayrollCycle", () => {
	it("models the default 1/31/31 cycle as full calendar month", () => {
		const cfg = { payroll_period_start_day: 1, payroll_period_end_day: 31, payroll_pay_day: 31 };
		expect(resolvePayrollCycle(2026, 5, cfg)).toEqual({
			periodStart: "2026-05-01",
			periodEnd: "2026-05-31",
			payDate: "2026-05-31"
		});
	});

	it("clamps a 31 end-day in shorter months (April → 30, February → 28)", () => {
		const cfg = { payroll_period_start_day: 1, payroll_period_end_day: 31, payroll_pay_day: 31 };
		expect(resolvePayrollCycle(2026, 4, cfg).periodEnd).toBe("2026-04-30");
		expect(resolvePayrollCycle(2026, 2, cfg).periodEnd).toBe("2026-02-28");
	});

	it("respects leap years (Feb 2024 → 29)", () => {
		const cfg = { payroll_period_start_day: 1, payroll_period_end_day: 31, payroll_pay_day: 31 };
		expect(resolvePayrollCycle(2024, 2, cfg).periodEnd).toBe("2024-02-29");
	});

	it("supports a fixed pay-day independent of the period (e.g. 25th)", () => {
		const cfg = { payroll_period_start_day: 1, payroll_period_end_day: 31, payroll_pay_day: 25 };
		expect(resolvePayrollCycle(2026, 5, cfg).payDate).toBe("2026-05-25");
	});

	it("straddles months when end_day < start_day (26→25 cycle)", () => {
		const cfg = { payroll_period_start_day: 26, payroll_period_end_day: 25, payroll_pay_day: 30 };
		expect(resolvePayrollCycle(2026, 4, cfg)).toEqual({
			periodStart: "2026-03-26",
			periodEnd: "2026-04-25",
			payDate: "2026-04-30"
		});
	});

	it("handles the straddle case across a year boundary (running January)", () => {
		const cfg = { payroll_period_start_day: 26, payroll_period_end_day: 25, payroll_pay_day: 30 };
		expect(resolvePayrollCycle(2026, 1, cfg)).toEqual({
			periodStart: "2025-12-26",
			periodEnd: "2026-01-25",
			payDate: "2026-01-30"
		});
	});
});

describe("nextPayrollCycle", () => {
	const cfg = { payroll_period_start_day: 1, payroll_period_end_day: 31, payroll_pay_day: 31 };

	it("returns the current month when today is before the pay date", () => {
		const next = nextPayrollCycle("2026-05-15", cfg);
		expect(next.year).toBe(2026);
		expect(next.month).toBe(5);
		expect(next.cycle.payDate).toBe("2026-05-31");
		expect(next.daysUntilPay).toBe(16);
	});

	it("returns the current month when today *is* the pay date (inclusive)", () => {
		const next = nextPayrollCycle("2026-05-31", cfg);
		expect(next.month).toBe(5);
		expect(next.daysUntilPay).toBe(0);
	});

	it("rolls to next month once pay date has passed", () => {
		const next = nextPayrollCycle("2026-06-01", cfg);
		expect(next.year).toBe(2026);
		expect(next.month).toBe(6);
		expect(next.cycle.payDate).toBe("2026-06-30");
	});

	it("rolls across the year boundary (December → January)", () => {
		const next = nextPayrollCycle("2026-12-31", cfg);
		expect(next.month).toBe(12); // last day of dec — still current
		const after = nextPayrollCycle("2027-01-01", cfg);
		expect(after.year).toBe(2027);
		expect(after.month).toBe(1);
	});
});
