// Atomic, gapless document number allocation.
//
// Sri Lankan tax law requires invoice numbers be gapless within a fiscal year.
// We hold a counter row per (document_type, fiscal_year) and increment it
// inside a transaction. The visible number is `{PREFIX}-{YYYY}-{NNNN}` —
// never the row id.
//
// `allocateDocumentNumber` is the ONLY path that mints a number. Once a
// document is issued the number is immutable.

import { select, selectOne } from "./db";

export type DocumentType = "quote" | "invoice" | "bill" | "voucher";

const PREFIX: Record<DocumentType, string> = {
	quote: "QUO",
	invoice: "INV",
	bill: "BIL",
	voucher: "VCH"
};

// Compute the fiscal year for a given ISO date string and the configured
// fiscal-year-start month (1 = Jan, 4 = Apr).
//
// Rule: if the issue month is >= start month, the FY label is the issue year.
// Otherwise it's the previous calendar year. (i.e. FY 2026 starting in Apr
// runs Apr 2026 → Mar 2027.)
export const computeFiscalYear = (
	issueDate: string,
	fiscalYearStartMonth: number
): number => {
	const d = new Date(issueDate);
	if (Number.isNaN(d.getTime())) {
		throw new TypeError(`computeFiscalYear: invalid date ${issueDate}`);
	}
	const month = d.getMonth() + 1;
	const year = d.getFullYear();
	if (fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
		throw new Error(`computeFiscalYear: bad start month ${fiscalYearStartMonth}`);
	}
	return month >= fiscalYearStartMonth ? year : year - 1;
};

export const formatDocumentNumber = (
	type: DocumentType,
	fiscalYear: number,
	seq: number
): string => {
	if (!Number.isInteger(seq) || seq < 1) {
		throw new Error(`formatDocumentNumber: bad sequence ${seq}`);
	}
	return `${PREFIX[type]}-${fiscalYear}-${seq.toString().padStart(4, "0")}`;
};

export interface AllocationResult {
	number: string
	fiscalYear: number
	sequence: number
}

// Allocates the next number atomically using a single SQL statement.
//
// We can't use BEGIN/COMMIT from the JS side: tauri-plugin-sql uses a
// connection pool, so an explicit transaction on connection A doesn't
// block writes on connection B — leading to spurious "database is locked"
// errors. Instead we lean on SQLite's INSERT...ON CONFLICT...DO UPDATE...
// RETURNING form, which is intrinsically atomic at the storage layer.
//
// First call for a (type, fy) pair → inserts row with last_number = 1.
// Subsequent calls → upserts, incrementing last_number by 1.
// In both cases RETURNING gives us the new sequence number in one shot.
export const allocateDocumentNumber = async (
	type: DocumentType,
	issueDate: string
): Promise<AllocationResult> => {
	const settings = await selectOne<{ fiscal_year_start_month: number }>(
		"SELECT fiscal_year_start_month FROM company_settings WHERE id = 1"
	);
	const startMonth = settings?.fiscal_year_start_month ?? 1;
	const fy = computeFiscalYear(issueDate, startMonth);

	const rows = await select<{ last_number: number }>(
		`INSERT INTO document_counters (document_type, fiscal_year, last_number)
		 VALUES (?, ?, 1)
		 ON CONFLICT(document_type, fiscal_year)
		 DO UPDATE SET last_number = document_counters.last_number + 1
		 RETURNING last_number`,
		[type, fy]
	);
	const row = rows[0];
	if (!row) throw new Error("allocateDocumentNumber: counter row missing");
	return {
		number: formatDocumentNumber(type, fy, row.last_number),
		fiscalYear: fy,
		sequence: row.last_number
	};
};
