// Pure Sri Lankan statutory contribution math (EPF + ETF).
//
// No Pinia / Vue deps so it is trivially unit-testable — same shape as
// reconcile-match.ts and payroll-cycle.ts. Rates are basis points
// (golden rule #3): 8% = 800. All amounts are integer cents computed
// with banker's (half-even) rounding, mirroring computeLineTotals in
// money.ts. PAYE/APIT is deliberately out of scope.

import { roundHalfEven } from "./money";

const BP_DENOM = 10000;

export interface StatutoryRates {
	epfEmployeeBp: number
	epfEmployerBp: number
	etfBp: number
}

export interface StatutoryResult {
	baseCents: number
	epfEmployeeCents: number
	epfEmployerCents: number
	etfCents: number
}

// liableEarningCents = Σ of earning lines flagged EPF-liable.
export function computeStatutory(
	liableEarningCents: number,
	rates: StatutoryRates
): StatutoryResult {
	const base = Math.max(0, Math.trunc(liableEarningCents));
	const pct = (bp: number) => roundHalfEven((base * bp) / BP_DENOM);
	return {
		baseCents: base,
		epfEmployeeCents: pct(rates.epfEmployeeBp),
		epfEmployerCents: pct(rates.epfEmployerBp),
		etfCents: pct(rates.etfBp)
	};
}
