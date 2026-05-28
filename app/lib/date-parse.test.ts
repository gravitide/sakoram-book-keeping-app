import type { StatementDateFormat } from "./date-parse";
import { describe, expect, it } from "vitest";
import { parseStatementDate } from "./date-parse";

const cases: { format: StatementDateFormat, input: string, expected: string | null }[] = [
	{ format: "YYYY-MM-DD", input: "2026-05-27", expected: "2026-05-27" },
	{ format: "DD/MM/YYYY", input: "27/05/2026", expected: "2026-05-27" },
	{ format: "DD-MM-YYYY", input: "27-05-2026", expected: "2026-05-27" },
	{ format: "DD-MMM-YYYY", input: "27-MAY-2026", expected: "2026-05-27" },
	{ format: "DD-MMM-YYYY", input: "27-may-2026", expected: "2026-05-27" },
	{ format: "DD-MMM-YYYY", input: "01-Jan-2026", expected: "2026-01-01" }
];

describe("parseStatementDate", () => {
	for (const c of cases) {
		it(`parses ${c.input} (${c.format})`, () => {
			expect(parseStatementDate(c.input, c.format)).toBe(c.expected);
		});
	}

	it("returns null for empty input", () => {
		expect(parseStatementDate("", "YYYY-MM-DD")).toBe(null);
	});

	it("returns null for malformed input", () => {
		expect(parseStatementDate("not-a-date", "DD/MM/YYYY")).toBe(null);
		expect(parseStatementDate("32/13/2026", "DD/MM/YYYY")).toBe(null);
		expect(parseStatementDate("27/XX/2026", "DD/MM/YYYY")).toBe(null);
	});

	it("returns null for unknown month abbreviation", () => {
		expect(parseStatementDate("27-XYZ-2026", "DD-MMM-YYYY")).toBe(null);
	});

	it("trims whitespace before parsing", () => {
		expect(parseStatementDate("  2026-05-27  ", "YYYY-MM-DD")).toBe("2026-05-27");
	});
});
