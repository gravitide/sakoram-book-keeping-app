// Single source of truth for voucher-derived document status, in two forms:
//   1. Pure `deriveX` functions — the stores' `derivedStatus` calls these.
//   2. `xDerivedFrom(today)` builders — a SQL FROM subquery exposing
//      `_paid` / `_balance` / `_status` so the server-paginated list pages can
//      filter / sort / sum on derived state via `useServerTable`.
//
// The SQL CASE in each builder MUST mirror the matching pure function exactly,
// including precedence. `today` is inlined as a literal (our own value, never
// user input) to avoid a param-ordering issue in the FROM subquery.

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "credited" | "overdue" | "cancelled";
export type BillStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled";
export type PayslipStatus = "draft" | "unpaid" | "partial" | "paid" | "cancelled";

export function deriveInvoiceStatus(
	persisted: "draft" | "sent" | "cancelled",
	paid: number,
	credited: number,
	total: number,
	dueDate: string,
	today: string
): InvoiceStatus {
	if (persisted === "draft") return "draft";
	if (persisted === "cancelled") return "cancelled";
	// Cash alone covering the total wins: "paid" means money actually arrived.
	if (paid >= total && total > 0) return "paid";
	// Settled, but a credit note was needed to close it. A mixed
	// cash-plus-credit settlement lands here too — surfacing that the
	// invoice was not collected in full is the point of the state.
	if (paid + credited >= total && total > 0) return "credited";
	if (dueDate < today) return "overdue";
	if (paid > 0 || credited > 0) return "partial";
	return "sent";
}

export function deriveBillStatus(
	persisted: "open" | "cancelled",
	paid: number,
	total: number,
	dueDate: string,
	today: string
): BillStatus {
	if (persisted === "cancelled") return "cancelled";
	if (paid >= total && total > 0) return "paid";
	if (dueDate < today) return "overdue";
	if (paid > 0) return "partial";
	return "unpaid";
}

export function derivePayslipStatus(
	persisted: "draft" | "issued" | "cancelled",
	paid: number,
	net: number
): PayslipStatus {
	if (persisted === "cancelled") return "cancelled";
	if (persisted === "draft") return "draft";
	if (paid >= net && net > 0) return "paid";
	if (paid > 0) return "partial";
	return "unpaid";
}

// --- SQL FROM builders -------------------------------------------------
// Each LEFT JOINs a single grouped voucher-sum (runs once, not per-row), so
// `COALESCE(vp.paid, 0)` is a cheap column reference wherever it repeats.

function paidJoinOn(fk: string, type: "receipt" | "payment"): string {
	return `LEFT JOIN (SELECT ${fk}, SUM(amount_cents) AS paid FROM vouchers `
		+ `WHERE voucher_type = '${type}' AND ${fk} IS NOT NULL GROUP BY ${fk}) vp ON vp.${fk} = `;
}

// Issued credit notes summed per source invoice. Mirrors paidJoinOn's shape.
// Drafts aren't real yet and cancelled are void, so only 'issued' counts.
function creditJoinOn(): string {
	return `LEFT JOIN (SELECT source_invoice_id, SUM(total_cents) AS credited FROM credit_notes `
		+ `WHERE status = 'issued' AND source_invoice_id IS NOT NULL GROUP BY source_invoice_id) cn `
		+ `ON cn.source_invoice_id = `;
}

export function invoiceDerivedFrom(today: string): string {
	const paid = "COALESCE(vp.paid, 0)";
	const credited = "COALESCE(cn.credited, 0)";
	return `(SELECT i.*, ${paid} AS _paid, ${credited} AS _credited, `
		+ `MAX(0, i.total_cents - ${paid} - ${credited}) AS _balance, `
		+ `CASE WHEN i.status = 'draft' THEN 'draft' `
		+ `WHEN i.status = 'cancelled' THEN 'cancelled' `
		+ `WHEN ${paid} >= i.total_cents AND i.total_cents > 0 THEN 'paid' `
		+ `WHEN ${paid} + ${credited} >= i.total_cents AND i.total_cents > 0 THEN 'credited' `
		+ `WHEN i.due_date < '${today}' THEN 'overdue' `
		+ `WHEN ${paid} > 0 OR ${credited} > 0 THEN 'partial' ELSE 'sent' END AS _status `
		+ `FROM invoices i ${paidJoinOn("related_invoice_id", "receipt")}i.id `
		+ `${creditJoinOn()}i.id) sub`;
}

export function billDerivedFrom(today: string): string {
	const paid = "COALESCE(vp.paid, 0)";
	return `(SELECT b.*, ${paid} AS _paid, MAX(0, b.total_cents - ${paid}) AS _balance, `
		+ `CASE WHEN b.status = 'cancelled' THEN 'cancelled' `
		+ `WHEN ${paid} >= b.total_cents AND b.total_cents > 0 THEN 'paid' `
		+ `WHEN b.due_date < '${today}' THEN 'overdue' `
		+ `WHEN ${paid} > 0 THEN 'partial' ELSE 'unpaid' END AS _status `
		+ `FROM bills b ${paidJoinOn("related_bill_id", "payment")}b.id) sub`;
}

// Clients with a computed `_outstanding` = Σ open-invoice balances (matches the
// clients page: invoices with persisted status 'sent' and a positive balance —
// i.e. derived sent / partial / overdue), net of credit notes. Two deductions:
// credit notes linked to an invoice reduce that invoice's balance, and credit
// notes with no source invoice are subtracted from the client total as an
// unapplied credit. Must agree with /reports/aged-receivables and the customer
// statement — they read the same books.
export function clientDerivedFrom(): string {
	const paid = "COALESCE(vp.paid, 0)";
	const credited = "COALESCE(cn.credited, 0)";
	const openBalance = `(i.total_cents - ${paid} - ${credited})`;
	return `(SELECT c.*, MAX(0, COALESCE((`
		+ `SELECT SUM(${openBalance}) FROM invoices i `
		+ `${paidJoinOn("related_invoice_id", "receipt")}i.id `
		+ `${creditJoinOn()}i.id `
		+ `WHERE i.client_id = c.id AND i.status = 'sent' AND ${openBalance} > 0`
		+ `), 0) - COALESCE((`
		+ `SELECT SUM(total_cents) FROM credit_notes `
		+ `WHERE client_id = c.id AND status = 'issued' AND source_invoice_id IS NULL`
		+ `), 0)) AS _outstanding FROM clients c) sub`;
}

export function payslipDerivedFrom(_today: string): string {
	const paid = "COALESCE(vp.paid, 0)";
	return `(SELECT p.*, ${paid} AS _paid, MAX(0, p.net_cents - ${paid}) AS _balance, `
		+ `CASE WHEN p.status = 'cancelled' THEN 'cancelled' `
		+ `WHEN p.status = 'draft' THEN 'draft' `
		+ `WHEN ${paid} >= p.net_cents AND p.net_cents > 0 THEN 'paid' `
		+ `WHEN ${paid} > 0 THEN 'partial' ELSE 'unpaid' END AS _status `
		+ `FROM payslips p ${paidJoinOn("related_payslip_id", "payment")}p.id) sub`;
}
