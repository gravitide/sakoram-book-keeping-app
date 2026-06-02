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

export interface PayeBracket {
	// Upper bound (inclusive-progressive) of TAXABLE income for this band,
	// in cents. null = the open top band. Bands MUST be ascending with the
	// null band last.
	upToCents: number | null
	rateBp: number
}

export interface PayeConfig {
	reliefCents: number
	brackets: PayeBracket[]
}

// Monthly tax-table (IRD Table 1) PAYE / APIT. baseCents is the PAYE base
// the caller has already netted of EPF if applicable. Relief is applied
// here. Tax is accumulated exactly across bands and rounded (half-even)
// once at the end — matching IRD's per-band-formula result more closely
// than per-band rounding.
export function computePaye(baseCents: number, config: PayeConfig): number {
	const base = Math.max(0, Math.trunc(baseCents));
	const relief = Math.max(0, Math.trunc(config.reliefCents));
	const taxable = Math.max(0, base - relief);
	if (taxable <= 0) return 0;
	let prev = 0;
	let scaled = 0; // Σ width × rateBp, divided by BP_DENOM at the end
	for (const band of config.brackets) {
		const cap = band.upToCents == null ? Number.POSITIVE_INFINITY : band.upToCents;
		const width = Math.min(taxable, cap) - prev;
		if (width > 0) scaled += width * band.rateBp;
		prev = cap;
		if (taxable <= cap) break;
	}
	return roundHalfEven(scaled / BP_DENOM);
}
