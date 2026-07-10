// Atomic document number allocation — continuous per type.
//
// One counter row per `document_type`, incremented atomically. The visible
// number is `{PREFIX}-{NNNN}` (e.g. QUO-0004, INV-0032) — no fiscal year, and
// never the row id. The sequence never resets, so converting a quote to an
// invoice just takes the next invoice number regardless of dates.
//
// `allocateDocumentNumber` is the ONLY path that mints a number. Once a
// document is issued the number is immutable.

import { execute, select, selectOne } from "./db";

export type DocumentType = "quote" | "invoice" | "bill" | "voucher" | "payslip" | "credit_note" | "letter";

const PREFIX: Record<DocumentType, string> = {
	quote: "QUO",
	invoice: "INV",
	bill: "BIL",
	voucher: "VCH",
	payslip: "PSL",
	credit_note: "CRN",
	letter: "LET"
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
	credit_note: "credit_notes",
	letter: "letters"
};

// Fiscal year for an ISO date + the configured start month (1 = Jan, 4 = Apr).
//
// No longer part of document NUMBERING (numbers are year-less now), but payroll
// still stamps a fiscal year on each payslip for annual grouping, so the helper
// stays. Rule: if the issue month is >= start month, the FY label is the issue
// year; otherwise the previous calendar year (FY 2026 starting Apr runs
// Apr 2026 → Mar 2027).
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
	seq: number
): string => {
	if (!Number.isInteger(seq) || seq < 1) {
		throw new Error(`formatDocumentNumber: bad sequence ${seq}`);
	}
	return `${PREFIX[type]}-${seq.toString().padStart(4, "0")}`;
};

export interface AllocationResult {
	number: string
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
// First call for a type → inserts row with last_number = 1.
// Subsequent calls → upserts, incrementing last_number by 1.
export const allocateDocumentNumber = async (
	type: DocumentType
): Promise<AllocationResult> => {
	const rows = await select<{ last_number: number }>(
		`INSERT INTO document_counters (document_type, last_number)
		 VALUES (?, 1)
		 ON CONFLICT(document_type)
		 DO UPDATE SET last_number = document_counters.last_number + 1
		 RETURNING last_number`,
		[type]
	);
	const row = rows[0];
	if (!row) throw new Error("allocateDocumentNumber: counter row missing");
	return {
		number: formatDocumentNumber(type, row.last_number),
		sequence: row.last_number
	};
};

// Read-only — returns what the next auto-allocated number would be for `type`.
// Doesn't touch the counter. Used by the New modals to preview the default
// number so the user can either accept it or override it to fill a gap left by
// a deletion.
export const peekNextSequence = async (
	type: DocumentType
): Promise<AllocationResult> => {
	const row = await selectOne<{ last_number: number }>(
		"SELECT last_number FROM document_counters WHERE document_type = ?",
		[type]
	);
	const next = (row?.last_number ?? 0) + 1;
	return {
		number: formatDocumentNumber(type, next),
		sequence: next
	};
};

// Is the (type, sequence) free of any existing document?
//
// Numbers are stored on the document tables as the full formatted string
// ("QUO-0003"), so we compose the candidate and look it up directly. Used as a
// pre-flight check from modal inputs so the user gets a "this number is already
// in use" warning before submit.
export const isDocumentNumberAvailable = async (
	type: DocumentType,
	sequence: number
): Promise<boolean> => {
	if (!Number.isInteger(sequence) || sequence < 1) return false;
	const formatted = formatDocumentNumber(type, sequence);
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
	sequence: number
): Promise<AllocationResult> => {
	if (!Number.isInteger(sequence) || sequence < 1) {
		throw new Error(`allocateSpecificDocumentNumber: bad sequence ${sequence}`);
	}
	const formatted = formatDocumentNumber(type, sequence);
	const table = TABLE_FOR_TYPE[type];
	const existing = await selectOne<{ id: number }>(
		`SELECT id FROM ${table} WHERE number = ? LIMIT 1`,
		[formatted]
	);
	if (existing) {
		throw new Error(`Number ${formatted} is already in use`);
	}
	await execute(
		`INSERT INTO document_counters (document_type, last_number)
		 VALUES (?, ?)
		 ON CONFLICT(document_type)
		 DO UPDATE SET last_number = MAX(document_counters.last_number, excluded.last_number)`,
		[type, sequence]
	);
	return {
		number: formatted,
		sequence
	};
};
