import { describe, expect, it } from "vitest";
import { advanceDate, anchorDayOf } from "./recurring-schedule";

describe("advanceDate — without an anchor (unchanged behaviour)", () => {
	it("steps weekly / monthly / quarterly / yearly", () => {
		expect(advanceDate("2026-01-10", "weekly")).toBe("2026-01-17");
		expect(advanceDate("2026-01-10", "monthly")).toBe("2026-02-10");
		expect(advanceDate("2026-01-10", "quarterly")).toBe("2026-04-10");
		expect(advanceDate("2026-01-10", "yearly")).toBe("2027-01-10");
	});

	it("clamps into a short month", () => {
		expect(advanceDate("2026-01-31", "monthly")).toBe("2026-02-28");
	});

	it("rolls over a year boundary", () => {
		expect(advanceDate("2026-12-15", "monthly")).toBe("2027-01-15");
	});
});

// The bug: each step was computed from the PREVIOUS next_issue_date with no
// memory of the intended day. "Rent on the 31st" became the 28th after
// February — permanently. Jan 31 → Feb 28 → Mar 28 → Apr 28 …
describe("advanceDate — anchored to the template's start day", () => {
	it("springs back to the 31st after a short month", () => {
		const feb = advanceDate("2026-01-31", "monthly", 31);
		expect(feb).toBe("2026-02-28");
		const mar = advanceDate(feb, "monthly", 31);
		expect(mar).toBe("2026-03-31");
		expect(advanceDate(mar, "monthly", 31)).toBe("2026-04-30");
	});

	it("keeps a 30th schedule on the 30th through February", () => {
		expect(advanceDate("2026-02-28", "monthly", 30)).toBe("2026-03-30");
	});

	it("restores Feb 29 on the next leap year for a yearly schedule", () => {
		expect(advanceDate("2024-02-29", "yearly", 29)).toBe("2025-02-28");
		expect(advanceDate("2027-02-28", "yearly", 29)).toBe("2028-02-29");
	});

	it("quarterly on the 31st doesn't decay to the 30th", () => {
		const apr = advanceDate("2026-01-31", "quarterly", 31);
		expect(apr).toBe("2026-04-30");
		expect(advanceDate(apr, "quarterly", 31)).toBe("2026-07-31");
	});

	// The user can edit next_issue_date by hand. A deliberately chosen day is
	// NOT a clamp artefact and must be respected, not yanked back to the anchor.
	it("respects a manually chosen day that isn't a month-end clamp", () => {
		expect(advanceDate("2026-03-15", "monthly", 31)).toBe("2026-04-15");
	});

	it("weekly ignores the anchor entirely", () => {
		expect(advanceDate("2026-02-28", "weekly", 31)).toBe("2026-03-07");
	});
});

describe("anchorDayOf", () => {
	it("reads the day of month from an ISO date", () => {
		expect(anchorDayOf("2026-01-31")).toBe(31);
		expect(anchorDayOf("2026-02-05")).toBe(5);
	});

	it("is undefined for a malformed date", () => {
		expect(anchorDayOf("")).toBeUndefined();
		expect(anchorDayOf("nope")).toBeUndefined();
	});
});
