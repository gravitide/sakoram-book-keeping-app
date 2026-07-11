import { describe, expect, it } from "vitest";
import { DASHBOARD_RANGE_PRESETS, resolveDashboardRange } from "./dashboard-range";

// Fiscal year starts April (Sri Lanka government FY) unless stated.
const FY_APRIL = 4;

describe("resolveDashboardRange", () => {
	it("last12 spans 12 monthly buckets ending today", () => {
		const r = resolveDashboardRange("last12", "2026-07-11", FY_APRIL);
		expect(r).toEqual({ from: "2025-08-01", to: "2026-07-11", label: "Last 12 months" });
	});

	it("last12 rolls across January", () => {
		const r = resolveDashboardRange("last12", "2026-01-05", FY_APRIL);
		expect(r.from).toBe("2025-02-01");
		expect(r.to).toBe("2026-01-05");
	});

	it("thisMonth covers the calendar month", () => {
		const r = resolveDashboardRange("thisMonth", "2026-07-11", FY_APRIL);
		expect(r).toEqual({ from: "2026-07-01", to: "2026-07-31", label: "This month" });
	});

	it("lastMonth rolls back across January", () => {
		const r = resolveDashboardRange("lastMonth", "2026-01-15", FY_APRIL);
		expect(r.from).toBe("2025-12-01");
		expect(r.to).toBe("2025-12-31");
	});

	it("lastMonth handles leap February", () => {
		const r = resolveDashboardRange("lastMonth", "2024-03-05", FY_APRIL);
		expect(r.from).toBe("2024-02-01");
		expect(r.to).toBe("2024-02-29");
	});

	it("thisQuarter picks the calendar quarter containing today", () => {
		expect(resolveDashboardRange("thisQuarter", "2026-07-11", FY_APRIL).from).toBe("2026-07-01");
		expect(resolveDashboardRange("thisQuarter", "2026-07-11", FY_APRIL).to).toBe("2026-09-30");
		expect(resolveDashboardRange("thisQuarter", "2026-02-10", FY_APRIL).from).toBe("2026-01-01");
		expect(resolveDashboardRange("thisQuarter", "2026-02-10", FY_APRIL).to).toBe("2026-03-31");
	});

	it("thisYear / lastYear cover calendar years", () => {
		expect(resolveDashboardRange("thisYear", "2026-07-11", FY_APRIL)).toEqual({
			from: "2026-01-01",
			to: "2026-12-31",
			label: "This year"
		});
		expect(resolveDashboardRange("lastYear", "2026-07-11", FY_APRIL)).toEqual({
			from: "2025-01-01",
			to: "2025-12-31",
			label: "Last year"
		});
	});

	it("fiscalYear (April start) after April uses the FY that began this year", () => {
		const r = resolveDashboardRange("fiscalYear", "2026-07-11", FY_APRIL);
		expect(r.from).toBe("2026-04-01");
		expect(r.to).toBe("2027-03-31");
	});

	it("fiscalYear (April start) before April uses the FY that began last year", () => {
		const r = resolveDashboardRange("fiscalYear", "2026-02-10", FY_APRIL);
		expect(r.from).toBe("2025-04-01");
		expect(r.to).toBe("2026-03-31");
	});

	it("fiscalYear with a January start degenerates to the calendar year", () => {
		const r = resolveDashboardRange("fiscalYear", "2026-07-11", 1);
		expect(r.from).toBe("2026-01-01");
		expect(r.to).toBe("2026-12-31");
	});

	it("allTime is unbounded", () => {
		expect(resolveDashboardRange("allTime", "2026-07-11", FY_APRIL)).toEqual({
			from: null,
			to: null,
			label: "All time"
		});
	});

	it("preset list is ordered with last12 first (the default)", () => {
		expect(DASHBOARD_RANGE_PRESETS[0]!.id).toBe("last12");
		expect(DASHBOARD_RANGE_PRESETS.map((p) => p.id)).toContain("allTime");
	});
});
