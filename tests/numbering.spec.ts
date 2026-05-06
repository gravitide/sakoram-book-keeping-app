// Tests for the pure parts of numbering. The DB-backed allocator is
// integration-tested at runtime via the app, since vitest in node can't load
// the Tauri SQL plugin.

import { describe, expect, it } from "vitest";
import { computeFiscalYear, formatDocumentNumber } from "../app/lib/numbering";

describe("computeFiscalYear", () => {
	it("calendar fiscal year (Jan start)", () => {
		expect(computeFiscalYear("2026-01-15", 1)).toBe(2026);
		expect(computeFiscalYear("2026-12-31", 1)).toBe(2026);
	});

	it("april-start fiscal year", () => {
		// SL gov fiscal year: Apr–Mar
		expect(computeFiscalYear("2026-03-31", 4)).toBe(2025); // FY 25/26
		expect(computeFiscalYear("2026-04-01", 4)).toBe(2026); // FY 26/27
		expect(computeFiscalYear("2026-12-31", 4)).toBe(2026);
	});

	it("rejects bad input", () => {
		expect(() => computeFiscalYear("not-a-date", 1)).toThrow();
		expect(() => computeFiscalYear("2026-01-01", 0)).toThrow();
		expect(() => computeFiscalYear("2026-01-01", 13)).toThrow();
	});
});

describe("formatDocumentNumber", () => {
	it("zero-pads to 4 digits", () => {
		expect(formatDocumentNumber("invoice", 2026, 1)).toBe("INV-2026-0001");
		expect(formatDocumentNumber("invoice", 2026, 42)).toBe("INV-2026-0042");
		expect(formatDocumentNumber("quote", 2026, 9999)).toBe("QUO-2026-9999");
	});

	it("does not truncate at 5+ digits", () => {
		expect(formatDocumentNumber("bill", 2026, 12345)).toBe("BIL-2026-12345");
	});

	it("uses correct prefixes", () => {
		expect(formatDocumentNumber("quote", 2026, 1)).toMatch(/^QUO-/);
		expect(formatDocumentNumber("invoice", 2026, 1)).toMatch(/^INV-/);
		expect(formatDocumentNumber("bill", 2026, 1)).toMatch(/^BIL-/);
		expect(formatDocumentNumber("voucher", 2026, 1)).toMatch(/^VCH-/);
	});

	it("rejects invalid sequence", () => {
		expect(() => formatDocumentNumber("invoice", 2026, 0)).toThrow();
		expect(() => formatDocumentNumber("invoice", 2026, -1)).toThrow();
		expect(() => formatDocumentNumber("invoice", 2026, 1.5)).toThrow();
	});
});
