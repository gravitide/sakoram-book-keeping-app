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

	it("uses banker's (half-even) rounding", () => {
		// 156.25 cents * 800 / 10000 = 12.5 -> round half to even = 12
		expect(computeStatutory(156.25, SL).epfEmployeeCents).toBe(12);
		// 187.5 cents * 800 / 10000 = 15.0 -> 15 (exact, sanity)
		expect(computeStatutory(187.5, SL).epfEmployeeCents).toBe(15);
	});

	it("honours custom rates", () => {
		const r = computeStatutory(1_000_000, { epfEmployeeBp: 1000, epfEmployerBp: 0, etfBp: 0 });
		expect(r.epfEmployeeCents).toBe(100_000);
		expect(r.epfEmployerCents).toBe(0);
		expect(r.etfCents).toBe(0);
	});
});
