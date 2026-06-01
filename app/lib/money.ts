// Money helpers. Always integer cents (minor units), never floats.
//
// - toCents: parse a user-entered major-unit value (e.g. 1234.5) into integer cents.
//   Uses banker's rounding (half-even) on the final cent to avoid systematic bias.
// - formatMoney: present integer cents using the active currency's symbol + locale.
//   formatLKR is kept as a backward-compat alias.
// - sumCents: simple integer addition.
// - computeLineTotals: rounds at the line level. Document totals must always
//   be the sum of already-rounded line totals — never recomputed from raw qty.
//
// Currency model: a business picks one ISO 4217 code (CURRENCIES map below).
// We only support 100-minor-unit currencies for now — JPY, KRW, KWD, BHD,
// OMR would require revisiting the cents math everywhere.

export type Cents = number;
export type Milli = number;
export type BasisPoints = number;

const CENTS_PER_RUPEE = 100;
const MILLI = 1000;
const BP_DENOM = 10000;

export interface CurrencyMeta {
	/** ISO 4217 alpha code, e.g. "LKR". */
	code: string
	/** Human label for pickers, e.g. "Sri Lankan Rupee". */
	label: string
	/** Symbol printed before the amount, e.g. "Rs", "$", "€". */
	symbol: string
	/** BCP-47 locale used for grouping separators. */
	locale: string
}

// Curated list. Extending this is cheap; just add a row.
//
// Businesses can also use a code that isn't here via the "Custom
// currency" option in onboarding / Business details — the settings
// store calls registerCurrency() on load to slot the user-supplied
// symbol into this same map, so callers don't need to branch on
// built-in vs custom.
export const CURRENCIES: Record<string, CurrencyMeta> = {
	LKR: { code: "LKR", label: "Sri Lankan Rupee", symbol: "Rs", locale: "en-LK" },
	USD: { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US" },
	EUR: { code: "EUR", label: "Euro", symbol: "€", locale: "en-IE" },
	GBP: { code: "GBP", label: "British Pound", symbol: "£", locale: "en-GB" },
	INR: { code: "INR", label: "Indian Rupee", symbol: "₹", locale: "en-IN" },
	AED: { code: "AED", label: "UAE Dirham", symbol: "AED", locale: "en-AE" },
	AUD: { code: "AUD", label: "Australian Dollar", symbol: "A$", locale: "en-AU" },
	SGD: { code: "SGD", label: "Singapore Dollar", symbol: "S$", locale: "en-SG" }
};

// Snapshot of which codes ship in the curated set, separate from
// CURRENCIES (which can be mutated at runtime by registerCurrency).
// Useful when the UI needs to ask "is this code a built-in or a user-
// registered custom one?" without losing track once we've registered.
const BUILTIN_CODES: ReadonlySet<string> = new Set(Object.keys(CURRENCIES));

export const isBuiltinCurrency = (code: string): boolean => BUILTIN_CODES.has(code);

// Slot a user-supplied currency into the in-memory map so the rest of
// the app (formatMoney, getActiveCurrency, etc.) treats it identically
// to a built-in. Idempotent — calling repeatedly with the same code
// overwrites the prior registration, which is what we want when the
// user edits the symbol in settings.
export const registerCurrency = (meta: CurrencyMeta): void => {
	CURRENCIES[meta.code] = meta;
};

// Module-level cache. The settings store calls setActiveCurrency() once
// the company_settings row has loaded so formatMoney() / formatLKR() pick
// up the right symbol without every caller having to thread it through.
let _activeCode = "LKR";

export const setActiveCurrency = (code: string): void => {
	_activeCode = CURRENCIES[code] ? code : "LKR";
};

export const getActiveCurrency = (): CurrencyMeta =>
	CURRENCIES[_activeCode] ?? CURRENCIES.LKR!;

const isInt = (n: number): boolean => Number.isInteger(n);

export const roundHalfEven = (n: number): number => {
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

export interface FormatMoneyOpts {
	/** Override the active currency (e.g. for PDF preview before save). */
	code?: string
	/** Drop the leading currency symbol — useful when the symbol lives in a sibling element. */
	withSymbol?: boolean
}

export const formatMoney = (cents: Cents, opts: FormatMoneyOpts = {}): string => {
	if (!isInt(cents)) throw new Error("formatMoney requires integer cents");
	const meta = (opts.code && CURRENCIES[opts.code]) || getActiveCurrency();
	const negative = cents < 0;
	const abs = Math.abs(cents);
	const major = Math.floor(abs / CENTS_PER_RUPEE);
	const minor = abs % CENTS_PER_RUPEE;
	const grouped = major.toLocaleString(meta.locale);
	const body = `${grouped}.${minor.toString().padStart(2, "0")}`;
	const signed = negative ? `-${body}` : body;
	return opts.withSymbol === false ? signed : `${meta.symbol} ${signed}`;
};

// Backward-compat alias. Older callsites call formatLKR(cents) — they keep
// working but now respect whatever currency the active business picked.
export const formatLKR = formatMoney;

// Compact money formatter for cramped UI (dashboard KPI tiles at lg,
// donut centres, etc.). Same currency symbol as formatMoney, but the
// number collapses to K / M / B with one decimal — "Rs 3.6M" instead
// of "Rs 3,553,600.00". Sub-1000 values fall through to a plain
// integer (no decimal) since K-formatting them is pointless.
export const formatMoneyCompact = (cents: Cents, opts: FormatMoneyOpts = {}): string => {
	if (!isInt(cents)) throw new Error("formatMoneyCompact requires integer cents");
	const meta = (opts.code && CURRENCIES[opts.code]) || getActiveCurrency();
	const v = cents / CENTS_PER_RUPEE;
	const abs = Math.abs(v);
	const sign = v < 0 ? "-" : "";
	const trim = (n: number, suffix: string): string =>
		`${n.toFixed(1).replace(/\.0$/, "")}${suffix}`;
	let body: string;
	if (abs >= 1e9) body = trim(abs / 1e9, "B");
	else if (abs >= 1e6) body = trim(abs / 1e6, "M");
	else if (abs >= 1e3) body = trim(abs / 1e3, "K");
	else body = abs.toFixed(0);
	const signed = `${sign}${body}`;
	return opts.withSymbol === false ? signed : `${meta.symbol} ${signed}`;
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
