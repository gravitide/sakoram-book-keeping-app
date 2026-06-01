import type { StatutoryRates } from "./statutory";
import { describe, expect, it } from "vitest";
import { computeStatutory } from "./statutory";

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
