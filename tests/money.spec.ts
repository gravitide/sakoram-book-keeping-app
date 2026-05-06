import { describe, expect, it } from "vitest";
import {
	computeLineTotals,
	formatLKR,
	formatQty,
	formatRate,
	sumCents,
	toCents,
	toMilli
} from "../app/lib/money";

describe("toCents", () => {
	it("converts whole rupees", () => {
		expect(toCents(1234)).toBe(123400);
		expect(toCents("1234")).toBe(123400);
	});

	it("converts two-decimal rupees exactly", () => {
		expect(toCents(12.34)).toBe(1234);
		expect(toCents("12.34")).toBe(1234);
		expect(toCents("0.01")).toBe(1);
		expect(toCents("0.05")).toBe(5);
	});

	it("uses banker's rounding on the third decimal", () => {
		expect(toCents("0.005")).toBe(0); // .5 → even → 0
		expect(toCents("0.015")).toBe(2); // .5 → even → 2
		expect(toCents("0.025")).toBe(2); // .5 → even → 2
		expect(toCents("0.035")).toBe(4); // .5 → even → 4
	});

	it("handles negatives", () => {
		expect(toCents(-12.34)).toBe(-1234);
		expect(toCents("-0.01")).toBe(-1);
	});

	it("strips commas", () => {
		expect(toCents("1,234.56")).toBe(123456);
	});

	it("rejects garbage", () => {
		expect(() => toCents("abc")).toThrow();
		expect(() => toCents("1.2.3")).toThrow();
	});

	it("treats empty as zero", () => {
		expect(toCents("")).toBe(0);
		expect(toCents(null as unknown as string)).toBe(0);
	});
});

describe("formatLKR", () => {
	it("formats with two decimals", () => {
		expect(formatLKR(0)).toBe("Rs 0.00");
		expect(formatLKR(1)).toBe("Rs 0.01");
		expect(formatLKR(12345)).toBe("Rs 123.45");
		expect(formatLKR(1234567)).toBe("Rs 12,345.67");
	});

	it("handles negatives", () => {
		expect(formatLKR(-12345)).toBe("Rs -123.45");
	});

	it("can suppress the symbol", () => {
		expect(formatLKR(12345, { withSymbol: false })).toBe("123.45");
	});

	it("rejects non-integer cents", () => {
		expect(() => formatLKR(1.5)).toThrow();
	});
});

describe("toMilli / formatQty", () => {
	it("round-trips integers", () => {
		expect(toMilli(2)).toBe(2000);
		expect(formatQty(2000)).toBe("2");
	});

	it("supports up to 3 decimals", () => {
		expect(toMilli("2.5")).toBe(2500);
		expect(toMilli("0.125")).toBe(125);
		expect(formatQty(2500)).toBe("2.5");
		expect(formatQty(125)).toBe("0.125");
	});

	it("rounds the 4th decimal half-even", () => {
		expect(toMilli("0.0005")).toBe(0);
		expect(toMilli("0.0015")).toBe(2);
	});
});

describe("sumCents", () => {
	it("adds with no float drift", () => {
		// canonical floating-point trap: 0.1 + 0.2 ≠ 0.3
		expect(sumCents(toCents("0.1"), toCents("0.2"))).toBe(toCents("0.3"));
	});
	it("handles many", () => {
		const inputs = Array.from({ length: 1000 }, () => 1);
		expect(sumCents(...inputs)).toBe(1000);
	});
});

describe("computeLineTotals", () => {
	it("computes a basic line", () => {
		// 2 units * Rs 100.00 with 18% VAT
		const r = computeLineTotals(2000, 10000, 1800);
		expect(r.line_subtotal_cents).toBe(20000);
		expect(r.line_tax_cents).toBe(3600);
		expect(r.line_total_cents).toBe(23600);
	});

	it("rounds at the line level", () => {
		// 1.333 units * Rs 10.00 = Rs 13.33 exact
		const r = computeLineTotals(1333, 1000, 0);
		expect(r.line_subtotal_cents).toBe(1333);
	});

	it("handles fractional VAT cents (half-even)", () => {
		// subtotal Rs 1.23, 15% = 0.1845 → rounds to 18 cents (even)
		const r = computeLineTotals(1000, 123, 1500);
		expect(r.line_subtotal_cents).toBe(123);
		expect(r.line_tax_cents).toBe(18);
		expect(r.line_total_cents).toBe(141);
	});

	it("handles zero tax", () => {
		const r = computeLineTotals(1000, 5000, 0);
		expect(r).toEqual({
			line_subtotal_cents: 5000,
			line_tax_cents: 0,
			line_total_cents: 5000
		});
	});

	it("rejects non-integer inputs", () => {
		expect(() => computeLineTotals(1.5, 100, 0)).toThrow();
		expect(() => computeLineTotals(1, 100.5, 0)).toThrow();
	});

	it("document totals are sum of rounded line totals (no recomputation)", () => {
		const lines = [
			computeLineTotals(1000, 333, 1800),
			computeLineTotals(1000, 333, 1800),
			computeLineTotals(1000, 333, 1800)
		];
		const subtotal = sumCents(...lines.map((l) => l.line_subtotal_cents));
		const tax = sumCents(...lines.map((l) => l.line_tax_cents));
		const total = sumCents(...lines.map((l) => l.line_total_cents));
		// Critically: total === subtotal + tax always, even if you wouldn't get
		// the same number from recomputing tax on the summed subtotal.
		expect(total).toBe(subtotal + tax);
	});
});

describe("formatRate", () => {
	it("renders whole percents", () => {
		expect(formatRate(1800)).toBe("18%");
		expect(formatRate(0)).toBe("0%");
	});
	it("renders fractional percents", () => {
		expect(formatRate(1850)).toBe("18.5%");
		expect(formatRate(1825)).toBe("18.25%");
	});
});
