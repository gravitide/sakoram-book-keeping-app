// Pure matching algorithm extracted for testability. Stays free of
// Pinia / Vue / store imports — pass plain data in, get a Map back.
// The bank_statements store wraps this in suggestMatchesFor(bankId)
// by filtering rows + vouchers to that bank first.

export interface MatchableRow {
	id: number
	business_bank_id: number
	statement_date: string // ISO YYYY-MM-DD
	amount_cents: number // signed: + receipt, - payment
	reference: string | null
	matched_voucher_id: number | null
}

export interface MatchableVoucher {
	id: number
	business_bank_id: number | null
	voucher_type: "receipt" | "payment"
	voucher_date: string // ISO YYYY-MM-DD
	amount_cents: number // always positive (voucher's own amount)
	reference: string | null
	reconciled_at: string | null
}

export interface MatchInputs {
	rows: MatchableRow[]
	vouchers: MatchableVoucher[]
}

export interface MatchCandidate {
	voucher: MatchableVoucher
	score: number
}

const dayDiff = (aIso: string, bIso: string): number => {
	const a = new Date(`${aIso}T00:00:00`).getTime();
	const b = new Date(`${bIso}T00:00:00`).getTime();
	return Math.round(Math.abs(a - b) / 86400000);
};

const sharesSubstring = (a: string | null, b: string | null): boolean => {
	if (!a || !b) return false;
	// Tokenise both, then check for any 3+ char token overlap. Prevents
	// single-letter matches; "the reference contains the voucher
	// number" style hits get the bonus.
	const tokens = (s: string) =>
		s.split(/[^A-Z0-9]+/i).filter((t) => t.length >= 3).map((t) => t.toLowerCase());
	const at = new Set(tokens(a));
	const bt = tokens(b);
	return bt.some((t) => at.has(t));
};

export const suggestMatches = (inputs: MatchInputs): Map<number, MatchCandidate[]> => {
	const result = new Map<number, MatchCandidate[]>();

	for (const row of inputs.rows) {
		if (row.matched_voucher_id !== null) continue;

		const wantType: "receipt" | "payment" = row.amount_cents > 0 ? "receipt" : "payment";
		const wantAmount = Math.abs(row.amount_cents);

		const candidates: MatchCandidate[] = [];
		for (const voucher of inputs.vouchers) {
			if (voucher.reconciled_at !== null) continue;
			if (voucher.business_bank_id !== row.business_bank_id) continue;
			if (voucher.voucher_type !== wantType) continue;
			if (voucher.amount_cents !== wantAmount) continue;

			const diff = dayDiff(row.statement_date, voucher.voucher_date);
			if (diff > 3) continue;

			let score = 0;
			if (diff <= 1) score = 100;
			else if (diff === 2) score = 90;
			else score = 80;

			if (sharesSubstring(row.reference, voucher.reference)) score += 20;

			candidates.push({ voucher, score });
		}

		// Sort: score desc, then date proximity asc, then voucher id asc.
		candidates.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			const da = dayDiff(row.statement_date, a.voucher.voucher_date);
			const db = dayDiff(row.statement_date, b.voucher.voucher_date);
			if (da !== db) return da - db;
			return a.voucher.id - b.voucher.id;
		});

		result.set(row.id, candidates);
	}

	return result;
};
