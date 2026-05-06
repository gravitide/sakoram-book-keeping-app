// Money helpers. Always integer cents of LKR — never floats.
//
// - toCents: parse a user-entered rupee value (e.g. 1234.5) into integer cents.
//   Uses banker's rounding (half-even) on the final cent to avoid systematic bias.
// - formatLKR: present integer cents as 'Rs 12,345.50'.
// - sumCents: simple integer addition.
// - computeLineTotals: rounds at the line level. Document totals must always
//   be the sum of already-rounded line totals — never recomputed from raw qty.

export type Cents = number;
export type Milli = number;
export type BasisPoints = number;

const CENTS_PER_RUPEE = 100;
const MILLI = 1000;
const BP_DENOM = 10000;

const isInt = (n: number): boolean => Number.isInteger(n);

const roundHalfEven = (n: number): number => {
	const floor = Math.floor(n);
	const diff = n - floor;
	if (diff < 0.5) return floor;
	if (diff > 0.5) return floor + 1;
	// exactly .5 → round to even
	return floor % 2 === 0 ? floor : floor + 1;
};

export const toCents = (value: number | string): Cents => {
	if (value === "" || value == null) return 0;
	const s = typeof value === "string" ? value.trim().replace(/,/g, "") : String(value);
	if (s === "" || s === "-") return 0;
	if (!/^-?\d*(?:\.\d+)?$/.test(s)) {
		throw new Error(`toCents: invalid numeric input ${JSON.stringify(value)}`);
	}
	const negative = s.startsWith("-");
	const abs = negative ? s.slice(1) : s;
	const [intPart, fracRaw = ""] = abs.split(".");
	const frac = (`${fracRaw}00`).slice(0, 3); // keep 3 digits for half-even rounding
	const exact = Number(intPart) * 1000 + Number(frac); // value * 1000 (mille-rupees)
	const cents = roundHalfEven(exact / 10); // mille → cents
	return negative ? -cents : cents;
};

export const formatLKR = (cents: Cents, opts: { withSymbol?: boolean } = {}): string => {
	if (!isInt(cents)) throw new Error("formatLKR requires integer cents");
	const negative = cents < 0;
	const abs = Math.abs(cents);
	const rupees = Math.floor(abs / CENTS_PER_RUPEE);
	const cs = abs % CENTS_PER_RUPEE;
	const grouped = rupees.toLocaleString("en-LK");
	const body = `${grouped}.${cs.toString().padStart(2, "0")}`;
	const signed = negative ? `-${body}` : body;
	return opts.withSymbol === false ? signed : `Rs ${signed}`;
};

export const sumCents = (...values: Cents[]): Cents => values.reduce((a, b) => a + b, 0);

// Convert a user-entered quantity (e.g. 2.5) to quantity_milli (qty * 1000).
export const toMilli = (qty: number | string): Milli => {
	if (qty === "" || qty == null) return 0;
	const s = typeof qty === "string" ? qty.trim() : String(qty);
	if (s === "") return 0;
	if (!/^-?\d*(?:\.\d+)?$/.test(s)) {
		throw new Error(`toMilli: invalid numeric input ${JSON.stringify(qty)}`);
	}
	const negative = s.startsWith("-");
	const abs = negative ? s.slice(1) : s;
	const [intPart, fracRaw = ""] = abs.split(".");
	const frac = (`${fracRaw}0000`).slice(0, 4);
	const exact = Number(intPart) * 10000 + Number(frac);
	const milli = roundHalfEven(exact / 10);
	return negative ? -milli : milli;
};

export const formatQty = (milli: Milli): string => {
	if (!isInt(milli)) throw new Error("formatQty requires integer milli");
	const negative = milli < 0;
	const abs = Math.abs(milli);
	const intPart = Math.floor(abs / MILLI);
	const frac = abs % MILLI;
	if (frac === 0) return (negative ? "-" : "") + intPart.toString();
	const fracStr = frac.toString().padStart(3, "0").replace(/0+$/, "");
	return `${negative ? "-" : ""}${intPart}.${fracStr}`;
};

export interface LineTotals {
	line_subtotal_cents: Cents
	line_tax_cents: Cents
	line_total_cents: Cents
}

// Compute line totals using ONLY integer arithmetic.
//   subtotal = round(qty_milli * unit_price_cents / 1000)
//   tax      = round(subtotal * tax_bp / 10000)
//   total    = subtotal + tax
// Rounding only occurs at the line level. Document totals are sums of these.
export const computeLineTotals = (
	qtyMilli: Milli,
	unitPriceCents: Cents,
	taxRateBp: BasisPoints
): LineTotals => {
	if (!isInt(qtyMilli) || !isInt(unitPriceCents) || !isInt(taxRateBp)) {
		throw new Error("computeLineTotals requires integer inputs");
	}
	const subtotal = roundHalfEven((qtyMilli * unitPriceCents) / MILLI);
	const tax = roundHalfEven((subtotal * taxRateBp) / BP_DENOM);
	return {
		line_subtotal_cents: subtotal,
		line_tax_cents: tax,
		line_total_cents: subtotal + tax
	};
};

export const formatRate = (bp: BasisPoints): string => {
	if (!isInt(bp)) throw new Error("formatRate requires integer basis points");
	const whole = Math.floor(bp / 100);
	const frac = bp % 100;
	if (frac === 0) return `${whole}%`;
	return `${whole}.${frac.toString().padStart(2, "0").replace(/0+$/, "")}%`;
};
