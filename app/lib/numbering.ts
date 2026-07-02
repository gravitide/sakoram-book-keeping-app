// Atomic, gapless document number allocation.
//
// Sri Lankan tax law requires invoice numbers be gapless within a fiscal year.
// We hold a counter row per (document_type, fiscal_year) and increment it
// inside a transaction. The visible number is `{PREFIX}-{YYYY}-{NNNN}` —
// never the row id.
//
// `allocateDocumentNumber` is the ONLY path that mints a number. Once a
// document is issued the number is immutable.

import { execute, select, selectOne } from "./db";

export type DocumentType = "quote" | "invoice" | "bill" | "voucher" | "payslip" | "credit_note";

const PREFIX: Record<DocumentType, string> = {
	quote: "QUO",
	invoice: "INV",
	bill: "BIL",
	voucher: "VCH",
	payslip: "PSL",
	credit_note: "CRN"
};

// Which document table holds the visible (formatted) number for each type.
// Used by peekNextSequence / allocateSpecificDocumentNumber to verify a
// user-picked sequence isn't already taken — covers the "delete leaves a
// gap, then user wants to reuse that gap" workflow.
const TABLE_FOR_TYPE: Record<DocumentType, string> = {
	quote: "quotes",
	invoice: "invoices",
	bill: "bills",
	voucher: "vouchers",
	payslip: "payslips",
	credit_note: "credit_notes"
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

// Parse a formatted number ("QUO-2026-0003") back into its fiscal year +
// sequence. Returns null for anything that doesn't match the shape.
export const parseDocumentNumber = (
	number: string
): { fiscalYear: number, sequence: number } | null => {
	const m = /^[A-Z]+-(\d{4})-(\d+)$/.exec(number);
	if (!m) return null;
	return { fiscalYear: Number(m[1]), sequence: Number(m[2]) };
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

// Read-only — returns what the next auto-allocated number would be for
// (type, fy). Doesn't touch the counter. Used by the New modals to
// preview the default number so the user can either accept it or
// override it to fill a gap left by a deletion.
export const peekNextSequence = async (
	type: DocumentType,
	issueDate: string
): Promise<AllocationResult> => {
	const settings = await selectOne<{ fiscal_year_start_month: number }>(
		"SELECT fiscal_year_start_month FROM company_settings WHERE id = 1"
	);
	const startMonth = settings?.fiscal_year_start_month ?? 1;
	const fy = computeFiscalYear(issueDate, startMonth);
	const row = await selectOne<{ last_number: number }>(
		"SELECT last_number FROM document_counters WHERE document_type = ? AND fiscal_year = ?",
		[type, fy]
	);
	const next = (row?.last_number ?? 0) + 1;
	return {
		number: formatDocumentNumber(type, fy, next),
		fiscalYear: fy,
		sequence: next
	};
};

// Is the (type, fy, sequence) free of any existing document?
//
// Numbers are stored on the document tables as the full formatted
// string ("QUO-2026-0003"), so we compose the candidate and look it up
// directly. Used as a pre-flight check from modal inputs so the user
// gets a "this number is already in use" warning before submit.
export const isDocumentNumberAvailable = async (
	type: DocumentType,
	issueDate: string,
	sequence: number
): Promise<boolean> => {
	if (!Number.isInteger(sequence) || sequence < 1) return false;
	const settings = await selectOne<{ fiscal_year_start_month: number }>(
		"SELECT fiscal_year_start_month FROM company_settings WHERE id = 1"
	);
	const startMonth = settings?.fiscal_year_start_month ?? 1;
	const fy = computeFiscalYear(issueDate, startMonth);
	const formatted = formatDocumentNumber(type, fy, sequence);
	const table = TABLE_FOR_TYPE[type];
	const existing = await selectOne<{ id: number }>(
		`SELECT id FROM ${table} WHERE number = ? LIMIT 1`,
		[formatted]
	);
	return existing === null;
};

// User-picked number variant of allocateDocumentNumber. Validates the
// requested sequence isn't already in the corresponding document table
// (so two clicks of the same modal can't both land on the same number),
// then bumps the counter to MAX(current, requested) so subsequent
// auto-allocations stay ahead. If the user picked a gap below current
// (e.g. requested 3 when counter is 7), the counter stays at 7.
//
// NOT atomic across the SELECT-then-UPSERT — acceptable for a
// single-user offline app where the user can't collide with themselves.
// If that changes, fold the uniqueness check into a single statement.
export const allocateSpecificDocumentNumber = async (
	type: DocumentType,
	issueDate: string,
	sequence: number
): Promise<AllocationResult> => {
	if (!Number.isInteger(sequence) || sequence < 1) {
		throw new Error(`allocateSpecificDocumentNumber: bad sequence ${sequence}`);
	}
	const settings = await selectOne<{ fiscal_year_start_month: number }>(
		"SELECT fiscal_year_start_month FROM company_settings WHERE id = 1"
	);
	const startMonth = settings?.fiscal_year_start_month ?? 1;
	const fy = computeFiscalYear(issueDate, startMonth);
	const formatted = formatDocumentNumber(type, fy, sequence);
	const table = TABLE_FOR_TYPE[type];
	const existing = await selectOne<{ id: number }>(
		`SELECT id FROM ${table} WHERE number = ? LIMIT 1`,
		[formatted]
	);
	if (existing) {
		throw new Error(`Number ${formatted} is already in use`);
	}
	await execute(
		`INSERT INTO document_counters (document_type, fiscal_year, last_number)
		 VALUES (?, ?, ?)
		 ON CONFLICT(document_type, fiscal_year)
		 DO UPDATE SET last_number = MAX(document_counters.last_number, excluded.last_number)`,
		[type, fy, sequence]
	);
	return {
		number: formatted,
		fiscalYear: fy,
		sequence
	};
};

// Re-derive a DRAFT's number when its issue date moves to a different fiscal
// year (back-dating a historical document). Returns the new number — and
// bumps the counter — or null when the year is unchanged (nothing to do).
//
// Collision-safe by construction: it first tries to KEEP the current sequence
// in the target year via allocateSpecificDocumentNumber (which throws if that
// exact number already exists); on that throw it falls back to the next free
// number for the year. The `UNIQUE(number)` constraint on the document table
// is the final backstop, so a duplicate can never be written.
//
// Callers must only use this on drafts — issued documents keep their number.
export const renumberForIssueDate = async (
	type: DocumentType,
	currentNumber: string,
	newIssueDate: string
): Promise<string | null> => {
	const settings = await selectOne<{ fiscal_year_start_month: number }>(
		"SELECT fiscal_year_start_month FROM company_settings WHERE id = 1"
	);
	const startMonth = settings?.fiscal_year_start_month ?? 1;
	const targetFy = computeFiscalYear(newIssueDate, startMonth);

	const parsed = parseDocumentNumber(currentNumber);
	if (parsed && parsed.fiscalYear === targetFy) return null;

	// Try to keep the same sequence in the new year; fall back to next free.
	if (parsed) {
		try {
			return (await allocateSpecificDocumentNumber(type, newIssueDate, parsed.sequence)).number;
		} catch {
			/* sequence already taken in the target year — take the next free */
		}
	}
	return (await allocateDocumentNumber(type, newIssueDate)).number;
};
