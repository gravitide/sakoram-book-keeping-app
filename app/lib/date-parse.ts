// Statement-date parsing. SL banks export dates in wildly different
// formats; the reconcile-import flow lets the user pick which format
// applies to the column they mapped to "Date". This function turns
// the format key + raw string into ISO YYYY-MM-DD (the canonical
// format the rest of the codebase uses) or null on parse failure.

export type StatementDateFormat
	= | "YYYY-MM-DD"
		| "DD/MM/YYYY"
		| "DD-MM-YYYY"
		| "DD-MMM-YYYY";

const MONTH_ABBR: Record<string, number> = {
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	may: 5,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	oct: 10,
	nov: 11,
	dec: 12
};

const isValidYmd = (y: number, m: number, d: number): boolean => {
	if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
	if (m < 1 || m > 12 || d < 1 || d > 31) return false;
	// Cross-check via Date constructor — it normalises invalid combos
	// (e.g. Feb 31 → Mar 3). If the constructed date roundtrips back
	// to the same y/m/d, the input was valid.
	const dt = new Date(y, m - 1, d);
	return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

const pad = (n: number): string => String(n).padStart(2, "0");

const toIso = (y: number, m: number, d: number): string =>
	`${y}-${pad(m)}-${pad(d)}`;

export const parseStatementDate = (
	raw: string,
	format: StatementDateFormat
): string | null => {
	const s = raw.trim();
	if (!s) return null;

	switch (format) {
		case "YYYY-MM-DD": {
			const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
			if (!m) return null;
			const y = Number(m[1]);
			const mo = Number(m[2]);
			const d = Number(m[3]);
			return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
		}
		case "DD/MM/YYYY": {
			const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
			if (!m) return null;
			const d = Number(m[1]);
			const mo = Number(m[2]);
			const y = Number(m[3]);
			return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
		}
		case "DD-MM-YYYY": {
			const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
			if (!m) return null;
			const d = Number(m[1]);
			const mo = Number(m[2]);
			const y = Number(m[3]);
			return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
		}
		case "DD-MMM-YYYY": {
			const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})$/i.exec(s);
			if (!m) return null;
			const d = Number(m[1]);
			const mo = MONTH_ABBR[m[2]!.toLowerCase()];
			const y = Number(m[3]);
			if (!mo) return null;
			return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
		}
	}
};
