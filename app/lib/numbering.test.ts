// Note: numbering.ts imports ./db (Tauri plugin-sql) at module level. That
// import resolves fine under vitest's node environment — the Tauri boundary
// only fails when a DB function is actually called, and everything tested
// here is pure. No vi.mock is needed.

import type { DocumentType } from "./numbering";
import { describe, expect, it } from "vitest";
import { computeFiscalYear, formatDocumentNumber } from "./numbering";

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
