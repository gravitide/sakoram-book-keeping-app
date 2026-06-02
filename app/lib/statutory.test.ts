import type { PayeConfig, StatutoryRates } from "./statutory";
import { describe, expect, it } from "vitest";
import { computePaye, computeStatutory } from "./statutory";

const SL: StatutoryRates = { epfEmployeeBp: 800, epfEmployerBp: 1200, etfBp: 300 };

describe("computeStatutory", () => {
	it("computes SL defaults on Rs 100,000 (10,000,000 cents)", () => {
		const r = computeStatutory(10_000_000, SL);
		expect(r.baseCents).toBe(10_000_000);
		expect(r.epfEmployeeCents).toBe(800_000); // 8%
		expect(r.epfEmployerCents).toBe(1_200_000); // 12%
		expect(r.etfCents).toBe(300_000); // 3%
	});

	it("returns all zeros for a zero base", () => {
		const r = computeStatutory(0, SL);
		expect(r).toEqual({ baseCents: 0, epfEmployeeCents: 0, epfEmployerCents: 0, etfCents: 0 });
	});

	it("uses banker's (half-even) rounding on exact .5 ties", () => {
		// ETF 3% on an integer base that lands exactly on a .5 cent tie.
		// 50 * 300 / 10000 = 1.5  -> nearest even = 2
		expect(computeStatutory(50, { epfEmployeeBp: 0, epfEmployerBp: 0, etfBp: 300 }).etfCents).toBe(2);
		// 150 * 300 / 10000 = 4.5  -> nearest even = 4
		expect(computeStatutory(150, { epfEmployeeBp: 0, epfEmployerBp: 0, etfBp: 300 }).etfCents).toBe(4);
		// 250 * 300 / 10000 = 7.5  -> nearest even = 8
		expect(computeStatutory(250, { epfEmployeeBp: 0, epfEmployerBp: 0, etfBp: 300 }).etfCents).toBe(8);
	});

	it("honours custom rates", () => {
		const r = computeStatutory(1_000_000, { epfEmployeeBp: 1000, epfEmployerBp: 0, etfBp: 0 });
		expect(r.epfEmployeeCents).toBe(100_000);
		expect(r.epfEmployerCents).toBe(0);
		expect(r.etfCents).toBe(0);
	});
});

// Current SL 2025/26 monthly table: relief 150,000; taxable bands
// 6% / 18% / 24% / 30% / 36%.
const SL_PAYE: PayeConfig = {
	reliefCents: 15_000_000,
	brackets: [
		{ upToCents: 8_333_333, rateBp: 600 },
		{ upToCents: 12_500_000, rateBp: 1800 },
		{ upToCents: 16_666_667, rateBp: 2400 },
		{ upToCents: 20_833_333, rateBp: 3000 },
		{ upToCents: null, rateBp: 3600 }
	]
};

describe("computePaye", () => {
	it("is zero below and at the relief threshold", () => {
		expect(computePaye(14_000_000, SL_PAYE)).toBe(0); // Rs 140k < relief
		expect(computePaye(15_000_000, SL_PAYE)).toBe(0); // exactly at relief
	});

	it("taxes only the first band when taxable income is small", () => {
		// base 200,000 → taxable 50,000 → all @6% → 3,000.00
		expect(computePaye(20_000_000, SL_PAYE)).toBe(300_000);
	});

	it("spans multiple bands progressively", () => {
		// base 300,000 → taxable 150,000:
		//  83,333.33 @6% + 41,666.67 @18% + 25,000 @24% → 1,850,000 cents
		expect(computePaye(30_000_000, SL_PAYE)).toBe(1_850_000);
	});

	it("applies the top open band above the last bound", () => {
		// base 500,000 → taxable 350,000, well into the 36% band.
		const tax = computePaye(50_000_000, SL_PAYE);
		expect(tax).toBeGreaterThan(0);
		expect(tax).toBeLessThan(Math.round(35_000_000 * 3600 / 10000));
	});

	it("returns 0 for empty brackets or zero base", () => {
		expect(computePaye(0, SL_PAYE)).toBe(0);
		expect(computePaye(50_000_000, { reliefCents: 15_000_000, brackets: [] })).toBe(0);
	});
});
