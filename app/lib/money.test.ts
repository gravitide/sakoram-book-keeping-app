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
		expect(toCents("0.005")).toBe(0);
		// 0.015 rupees = 1.5 cents; ties to even => 2
		expect(toCents("0.015")).toBe(2);
	});

	// A negative input that rounds to zero returns JavaScript's -0, because
	// the sign is re-applied after rounding (`negative ? -cents : cents`).
	// Harmless downstream: -0 === 0 is true, and formatMoney's `cents < 0`
	// sign test is false for -0, so it prints as "0.00" with no sign.
	// Pinned here so the quirk is documented rather than surprising.
	it("returns negative zero for a negative amount that rounds to zero", () => {
		expect(Object.is(toCents("-0.005"), -0)).toBe(true);
		expect(toCents("-0.005") === 0).toBe(true);
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
