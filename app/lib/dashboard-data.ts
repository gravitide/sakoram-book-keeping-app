// Dashboard SQL aggregates.
//
// The dashboard's KPI tiles used to require loading every invoice /
// bill / quote / voucher into memory and then reducing in JS. At the
// new demo-seed scale that meant ~3400 rows × ~2KB each pulled across
// the IPC bridge, JSON-deserialised, and traversed five different
// ways — multiple seconds on first load before anything painted.
//
// These helpers push the aggregation into SQLite where it belongs:
// the dashboard's headline numbers fall out of four small queries
// that return a single row each. None of them need the snapshot JSON
// columns, so we never pay to ship those bytes around.
//
// Each helper runs against the active tenant's DB via the shared
// `selectOne` from app/lib/db.ts — same connection pool the stores
// use, so no race with concurrent reads / writes.

import { selectOne } from "./db";

/// Outstanding invoices (status = 'sent', balance > 0). Mirrors the
/// store's `outstandingTotal` + `overdueCount` computeds — "overdue"
/// is derived from due_date < today AND balance > 0 (drafts /
/// cancelled never count). Balance is total minus the sum of linked
/// receipt vouchers.
export interface InvoiceKpis {
	outstanding_cents: number
	open_count: number
	overdue_count: number
}

export async function getInvoiceKpis(): Promise<InvoiceKpis> {
	// The inner SELECT computes per-invoice balance via a LEFT JOIN to
	// the receipt-vouchers-sum subquery. Outer aggregates over those
	// balances — single round trip. CASE expressions on the outer SUM
	// keep all three numbers tied to the same row scan.
	const row = await selectOne<InvoiceKpis>(`
		SELECT
			COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS outstanding_cents,
			COALESCE(SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END), 0) AS open_count,
			COALESCE(SUM(CASE WHEN balance > 0 AND due_date < date('now') THEN 1 ELSE 0 END), 0) AS overdue_count
		FROM (
			SELECT
				i.due_date,
				i.total_cents - COALESCE(p.paid, 0) AS balance
			FROM invoices i
			LEFT JOIN (
				SELECT related_invoice_id, SUM(amount_cents) AS paid
				FROM vouchers
				WHERE voucher_type = 'receipt' AND related_invoice_id IS NOT NULL
				GROUP BY related_invoice_id
			) p ON p.related_invoice_id = i.id
			WHERE i.status = 'sent'
		)
	`);
	return row ?? { outstanding_cents: 0, open_count: 0, overdue_count: 0 };
}

/// Outstanding bills (status != 'cancelled', balance > 0). Same shape
/// as invoices — overdue mirrors `bills.derivedStatus()` ("overdue"
/// = open + due_date < today + balance > 0). Balance is total minus
/// the sum of linked payment vouchers.
export interface BillKpis {
	outstanding_cents: number
	open_count: number
	overdue_count: number
}

export async function getBillKpis(): Promise<BillKpis> {
	const row = await selectOne<BillKpis>(`
		SELECT
			COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) AS outstanding_cents,
			COALESCE(SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END), 0) AS open_count,
			COALESCE(SUM(CASE WHEN balance > 0 AND due_date < date('now') THEN 1 ELSE 0 END), 0) AS overdue_count
		FROM (
			SELECT
				b.due_date,
				b.total_cents - COALESCE(p.paid, 0) AS balance
			FROM bills b
			LEFT JOIN (
				SELECT related_bill_id, SUM(amount_cents) AS paid
				FROM vouchers
				WHERE voucher_type = 'payment' AND related_bill_id IS NOT NULL
				GROUP BY related_bill_id
			) p ON p.related_bill_id = b.id
			WHERE b.status <> 'cancelled'
		)
	`);
	return row ?? { outstanding_cents: 0, open_count: 0, overdue_count: 0 };
}

/// Open quotes — anything currently "live" in the sales pipeline.
/// `sent` and `accepted` both count as open; once a quote converts
/// it transitions to `converted` and drops out. Value = sum of
/// totals (no payment concept on quotes).
export interface QuoteKpis {
	open_value_cents: number
	open_count: number
	accepted_count: number
}

export async function getQuoteKpis(): Promise<QuoteKpis> {
	const row = await selectOne<QuoteKpis>(`
		SELECT
			COALESCE(SUM(CASE WHEN status IN ('sent', 'accepted') THEN total_cents ELSE 0 END), 0) AS open_value_cents,
			COALESCE(SUM(CASE WHEN status IN ('sent', 'accepted') THEN 1 ELSE 0 END), 0) AS open_count,
			COALESCE(SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END), 0) AS accepted_count
		FROM quotes
	`);
	return row ?? { open_value_cents: 0, open_count: 0, accepted_count: 0 };
}

/// Cash flow over the dashboard's picked range — receipts vs payments
/// between the (inclusive) ISO bounds. Null bound = unbounded, so
/// "All time" is (null, null). voucher_date is a local-date ISO string
/// and ISO strings compare lexicographically, so plain >= / <= work.
export interface CashFlowKpis {
	receipts_cents: number
	payments_cents: number
}

export async function getCashFlowForRange(
	from: string | null,
	to: string | null
): Promise<CashFlowKpis> {
	const clauses: string[] = [];
	const params: string[] = [];
	if (from) {
		clauses.push("voucher_date >= ?");
		params.push(from);
	}
	if (to) {
		clauses.push("voucher_date <= ?");
		params.push(to);
	}
	const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
	const row = await selectOne<CashFlowKpis>(`
		SELECT
			COALESCE(SUM(CASE WHEN voucher_type = 'receipt' THEN amount_cents ELSE 0 END), 0) AS receipts_cents,
			COALESCE(SUM(CASE WHEN voucher_type = 'payment' THEN amount_cents ELSE 0 END), 0) AS payments_cents
		FROM vouchers
		${where}
	`, params);
	return row ?? { receipts_cents: 0, payments_cents: 0 };
}

/// Shape returned by `loadDashboardKpis()` — bundles all four KPI
/// query results so the dashboard can pull them in a single
/// `Promise.all`. Pages should treat null fields as "still loading".
/// Only the cash KPI follows the picked range; invoices / bills /
/// quotes are point-in-time snapshots by design.
export interface DashboardKpis {
	invoices: InvoiceKpis
	bills: BillKpis
	quotes: QuoteKpis
	cash: CashFlowKpis
}

export async function loadDashboardKpis(
	range: { from: string | null, to: string | null }
): Promise<DashboardKpis> {
	const [invoices, bills, quotes, cash] = await Promise.all([
		getInvoiceKpis(),
		getBillKpis(),
		getQuoteKpis(),
		getCashFlowForRange(range.from, range.to)
	]);
	return { invoices, bills, quotes, cash };
}
