import { describe, expect, it } from "vitest";
import { cycleForPeriodStart, nextPayrollCycle, resolvePayrollCycle } from "./payroll-cycle";

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

// NewPayslipModal used to snap period_end to the CALENDAR month of whatever
// period_start it saw — including the value it had just seeded from the cycle
// template. A 26th→25th business got 26 Mar → 31 Mar instead of → 25 Apr.
describe("cycleForPeriodStart", () => {
	const straddling = { payroll_period_start_day: 26, payroll_period_end_day: 25, payroll_pay_day: 25 };
	const calendar = { payroll_period_start_day: 1, payroll_period_end_day: 31, payroll_pay_day: 31 };

	it("keeps a cross-month cycle intact", () => {
		expect(cycleForPeriodStart("2026-03-26", straddling)).toEqual({
			periodStart: "2026-03-26",
			periodEnd: "2026-04-25",
			payDate: "2026-04-25"
		});
	});

	it("rolls a cross-month cycle over the year boundary", () => {
		expect(cycleForPeriodStart("2026-12-26", straddling)).toEqual({
			periodStart: "2026-12-26",
			periodEnd: "2027-01-25",
			payDate: "2027-01-25"
		});
	});

	it("uses calendar-month bounds for a calendar-month template", () => {
		expect(cycleForPeriodStart("2026-04-01", calendar)).toEqual({
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			payDate: "2026-04-30"
		});
	});

	it("keeps an off-template start the user picked, ending at the template's end", () => {
		const c = cycleForPeriodStart("2026-04-10", { ...calendar, payroll_pay_day: 5 });
		expect(c.periodStart).toBe("2026-04-10");
		expect(c.periodEnd).toBe("2026-04-30");
		// Pay day 5 falls before the chosen start — clamp into the period.
		expect(c.payDate).toBe("2026-04-10");
	});

	it("never returns a period that ends before it starts", () => {
		const half = { payroll_period_start_day: 1, payroll_period_end_day: 15, payroll_pay_day: 15 };
		const c = cycleForPeriodStart("2026-04-20", half);
		expect(c.periodEnd >= c.periodStart).toBe(true);
		expect(c.payDate >= c.periodStart && c.payDate <= c.periodEnd).toBe(true);
	});
});
