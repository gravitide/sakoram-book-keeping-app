// Executes the REAL shipped SQL builders against a REAL SQLite database
// built from the actual migration files. Not a mock: every migration in
// src-tauri/migrations runs in order, then a fixture is inserted, then the
// exact query strings the app ships are executed.
//
// Fixture (the plan's acceptance scenario):
//   Client A: invoice INV-0001 for 10,000.00 (1,000,000 cents), sent
//             linked credit note CRN-0001 for 4,000.00, issued
//             standalone credit note CRN-0002 for 1,000.00, issued
//   Expected: invoice balance 600,000 · status partial
//             client outstanding 500,000 (600,000 − 100,000 unapplied)
//             dashboard outstanding 600,000 (invoice-level only)
//
// Run: bun run verify:sql
//
// Why this isn't a vitest test: it needs a real SQLite engine, and the
// suite runs under vitest's node environment where `bun:sqlite` isn't
// available. Keeping it as a standalone bun script is the cheap way to
// exercise the actual SQL rather than asserting on query strings.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { billDerivedFrom, clientDerivedFrom, invoiceDerivedFrom } from "../app/lib/derived-status.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(REPO, "src-tauri/migrations");

const db = new Database(":memory:");
db.exec("PRAGMA foreign_keys = ON;");

const files = readdirSync(MIGRATIONS).filter((f: string) => f.endsWith(".sql")).sort();
for (const f of files) {
	try {
		db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
	} catch (e) {
		console.error(`MIGRATION FAILED: ${f}\n${(e as Error).message}`);
		process.exit(1);
	}
}
console.log(`✓ applied ${files.length} migrations`);

const snap = JSON.stringify({ name: "Client A" });
db.exec(`INSERT INTO clients (id, name) VALUES (1, 'Client A'), (2, 'Client B')`);
db.exec(`
	INSERT INTO invoices (id, number, client_id, client_snapshot, client_name, issue_date, due_date, status, total_cents, subtotal_cents, tax_cents)
	VALUES (1, 'INV-0001', 1, '${snap}', 'Client A', '2026-01-01', '2026-12-31', 'sent', 1000000, 1000000, 0)
`);
db.exec(`
	INSERT INTO credit_notes (id, number, client_id, client_snapshot, client_name, source_invoice_id, issue_date, status, total_cents, subtotal_cents, tax_cents)
	VALUES
		(1, 'CRN-0001', 1, '${snap}', 'Client A', 1,    '2026-02-01', 'issued', 400000, 400000, 0),
		(2, 'CRN-0002', 1, '${snap}', 'Client A', NULL, '2026-02-01', 'issued', 100000, 100000, 0),
		(3, 'CRN-0003', 1, '${snap}', 'Client A', 1,    '2026-02-01', 'draft',  900000, 900000, 0)
`);

const TODAY = "2026-06-01";
let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
	const ok = actual === expected;
	if (!ok) failures++;
	console.log(`${ok ? "✓" : "✗"} ${label}: got ${actual}${ok ? "" : `, expected ${expected}`}`);
};

// --- 1. invoiceDerivedFrom: the real shipped SQL -----------------------
const inv = db.query(`SELECT _paid, _credited, _balance, _status FROM ${invoiceDerivedFrom(TODAY)} WHERE id = 1`).get() as Record<string, unknown>;
console.log("\n-- invoiceDerivedFrom --");
check("_paid", inv._paid, 0);
check("_credited (issued only, draft CRN-0003 ignored)", inv._credited, 400000);
check("_balance", inv._balance, 600000);
check("_status", inv._status, "partial");

// --- 2. clientDerivedFrom --------------------------------------------
const cli = db.query(`SELECT _outstanding FROM ${clientDerivedFrom()} WHERE id = 1`).get() as Record<string, unknown>;
console.log("\n-- clientDerivedFrom --");
check("_outstanding (600,000 − 100,000 unapplied)", cli._outstanding, 500000);

// --- 3. dashboard-data.ts query (copied verbatim from source) ---------
const dashSql = readFileSync(join(REPO, "app/lib/dashboard-data.ts"), "utf8");
const m = dashSql.match(/const row = await selectOne<InvoiceKpis>\(`([\s\S]*?)`\);/);
if (!m) {
	console.error("✗ could not extract dashboard SQL — has the query in getInvoiceKpis been reshaped?");
	process.exit(1);
}
const dash = db.query(m[1]!).get() as Record<string, unknown>;
console.log("\n-- dashboard getInvoiceKpis (SQL read from source) --");
check("outstanding_cents", dash.outstanding_cents, 600000);
check("open_count", dash.open_count, 1);

// --- 4. fully-credited invoice flips to `credited` --------------------
db.exec(`UPDATE credit_notes SET total_cents = 1000000 WHERE id = 1`);
const inv2 = db.query(`SELECT _balance, _status FROM ${invoiceDerivedFrom(TODAY)} WHERE id = 1`).get() as Record<string, unknown>;
console.log("\n-- fully credited --");
check("_balance floors at 0", inv2._balance, 0);
check("_status", inv2._status, "credited");

// --- 5. over-credited never goes negative -----------------------------
db.exec(`UPDATE credit_notes SET total_cents = 5000000 WHERE id = 1`);
const inv3 = db.query(`SELECT _balance, _status FROM ${invoiceDerivedFrom(TODAY)} WHERE id = 1`).get() as Record<string, unknown>;
const cli3 = db.query(`SELECT _outstanding FROM ${clientDerivedFrom()} WHERE id = 1`).get() as Record<string, unknown>;
console.log("\n-- over credited --");
check("_balance still 0", inv3._balance, 0);
check("_status", inv3._status, "credited");
check("client _outstanding floors at 0", cli3._outstanding, 0);

// --- 6. cash-paid invoice still reads `paid`, not `credited` ----------
db.exec(`UPDATE credit_notes SET total_cents = 400000 WHERE id = 1`);
db.exec(`INSERT INTO vouchers (id, number, voucher_type, voucher_date, party_name, amount_cents, related_invoice_id) VALUES (1, 'VCH-0001', 'receipt', '2026-03-01', 'Client A', 1000000, 1)`);
const inv4 = db.query(`SELECT _paid, _status FROM ${invoiceDerivedFrom(TODAY)} WHERE id = 1`).get() as Record<string, unknown>;
console.log("\n-- cash covers full total, credit also present --");
check("_paid", inv4._paid, 1000000);
check("_status is paid (cash wins over credited)", inv4._status, "paid");

// --- 7. invoice lifecycle guard counts (invoices.assertMutable) --------
// Read out of the store source so the asserted SQL is the shipped SQL.
// Fixture at this point: invoice 1 has ONE receipt voucher, ONE issued
// linked credit note (CRN-0001) and one DRAFT linked note (CRN-0003 — must
// not count). CRN-0002 is issued but unlinked (must not count either).
const invSrc = readFileSync(join(REPO, "app/stores/invoices.ts"), "utf8");
const guardSql = invSrc.match(/const links = await selectOne<[^(]*\(\s*`([\s\S]*?)`,/);
if (!guardSql) {
	console.error("✗ could not locate the assertMutable SQL in app/stores/invoices.ts");
	process.exit(1);
}
const links = db.query(guardSql[1]!).get(1, 1) as Record<string, unknown>;
console.log("\n-- invoice lifecycle guard (SQL read from source) --");
check("receipts", links.receipts, 1);
check("issued linked credit notes only", links.credit_notes, 1);

// --- 8. calendar due-date query (useCalendarEvents.fetchInvoiceEvents) --
// A fifth balance site that used to subtract receipts only. Same fixture:
// receipt 1,000,000; issued linked credit 400,000; draft + unlinked ignored.
const calSrc = readFileSync(join(REPO, "app/composables/useCalendarEvents.ts"), "utf8");
const calSql = calSrc.match(/select<InvoiceEventRow>\(\s*`([\s\S]*?)`,/);
if (!calSql) {
	console.error("✗ could not locate the invoice events SQL in app/composables/useCalendarEvents.ts");
	process.exit(1);
}
const cal = db.query(calSql[1]!).get("2026-01-01", "2026-12-31") as Record<string, unknown>;
console.log("\n-- calendar invoice events (SQL read from source) --");
check("paid_cents", cal.paid_cents, 1000000);
check("credited_cents (issued + linked only)", cal.credited_cents, 400000);

// --- 9. letter counter advance (numbering.advanceDocumentCounter) -------
// The stuck state: a letter hand-numbered AHEAD to LET-0010 with the counter
// at 9. The old path refused to bump onto an in-use number, so LET-0010 was
// suggested forever. The statement must move the counter onto 10 regardless,
// and must never move it backwards.
const numSrc = readFileSync(join(REPO, "app/lib/numbering.ts"), "utf8");
const bumpSql = numSrc.match(/export const advanceDocumentCounter = [\s\S]*?await execute\(\s*`([\s\S]*?)`,/);
if (!bumpSql) {
	console.error("✗ could not locate the advanceDocumentCounter SQL in app/lib/numbering.ts");
	process.exit(1);
}
db.exec(`INSERT INTO letters (number, letter_date, subject, body_json) VALUES ('LET-0010', '2026-04-01', 'ahead', '')`);
db.exec(`INSERT INTO document_counters (document_type, last_number) VALUES ('letter', 9)`);
const lastLetter = () => (db.query(`SELECT last_number FROM document_counters WHERE document_type = 'letter'`).get() as Record<string, unknown>).last_number;
db.query(bumpSql[1]!).run("letter", 10);
console.log("\n-- letter counter advance (SQL read from source) --");
check("advances onto a reference already in use", lastLetter(), 10);
db.query(bumpSql[1]!).run("letter", 4);
check("never moves backwards", lastLetter(), 10);

// --- 10. bill balance floors at zero (billDerivedFrom) -----------------
// Overpaying a bill is only a WARNING on /vouchers/new, so it is reachable.
// invoiceDerivedFrom floored its balance; the bill + payslip mirrors did not,
// and the /bills row showed a negative balance ("Rs -50.00").
db.exec(`INSERT INTO vendors (id, name) VALUES (1, 'Vendor A')`);
db.exec(`
	INSERT INTO bills (id, number, vendor_id, vendor_snapshot, vendor_name, issue_date, due_date, status, total_cents, subtotal_cents, tax_cents)
	VALUES (1, 'BIL-0001', 1, '{"name":"Vendor A"}', 'Vendor A', '2026-01-01', '2026-12-31', 'open', 1000000, 1000000, 0)
`);
db.exec(`INSERT INTO vouchers (id, number, voucher_type, voucher_date, party_name, amount_cents, related_bill_id) VALUES (2, 'VCH-0002', 'payment', '2026-03-01', 'Vendor A', 1005000, 1)`);
const bill = db.query(`SELECT _paid, _balance, _status FROM ${billDerivedFrom(TODAY)} WHERE id = 1`).get() as Record<string, unknown>;
console.log("\n-- overpaid bill --");
check("_paid", bill._paid, 1005000);
check("_balance floors at 0 (was -5000)", bill._balance, 0);
check("_status", bill._status, "paid");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
