// Pure calendar-event logic shared by `useCalendarEvents` + the calendar UI.
//
// Kept Vue-free and Tauri-free so it's unit-testable in the node vitest env.
// The composable owns the month cursor + the DB queries; this module owns the
// grid-window math, the row -> CalendarEvent builders, and the kind metadata.

export type CalendarEventKind = "invoice" | "bill" | "quote" | "payslip";

export interface CalendarEvent {
	/** Stable id; kind + source row id, unique across kinds. */
	id: string
	/** ISO YYYY-MM-DD — due date / valid-until / pay date. */
	date: string
	kind: CalendarEventKind
	/** Document number, e.g. "INV-2026-0012". */
	title: string
	/** Counterparty name from the denormalised column. */
	party: string
	/** Document total in cents. */
	amountCents: number
	/** Outstanding balance in cents — 0 when nothing's left to settle. */
	balanceCents: number
	/** Detail-page route for click-through. */
	href: string
	/** due-date before today AND balance > 0. */
	overdue: boolean
}

export interface EventKindMeta {
	label: string
	icon: string
	color: "success" | "warning" | "info" | "primary"
}

export const EVENT_KIND_META: Record<CalendarEventKind, EventKindMeta> = {
	invoice: { label: "Receivable", icon: "i-lucide-receipt", color: "success" },
	bill: { label: "Payable", icon: "i-lucide-file-input", color: "warning" },
	quote: { label: "Quote expires", icon: "i-lucide-file-text", color: "info" },
	payslip: { label: "Payslip", icon: "i-lucide-file-spreadsheet", color: "primary" }
};

export const CALENDAR_EVENT_KINDS: CalendarEventKind[] = ["invoice", "bill", "quote", "payslip"];

const toISO = (d: Date): string =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayISO = (): string => toISO(new Date());

/**
 * The 42-cell month grid window: from the Sunday on/before the 1st through
 * 41 days later (6 rows x 7 cols). `month0` is 0-based (0 = January). Local
 * date components only — DST-safe for date-only values.
 */
export function computeGridWindow(year: number, month0: number): { from: string, to: string } {
	const firstOfMonth = new Date(year, month0, 1);
	const startDow = firstOfMonth.getDay(); // 0 = Sunday
	const start = new Date(year, month0, 1 - startDow);
	const end = new Date(year, month0, 1 - startDow + 41);
	return { from: toISO(start), to: toISO(end) };
}

// --- raw row shapes returned by the per-source queries ------------------

export interface InvoiceEventRow {
	id: number
	number: string
	due_date: string
	client_name: string | null
	total_cents: number
	paid_cents: number
	/** Issued credit notes with source_invoice_id = this invoice. */
	credited_cents: number
}
export interface BillEventRow {
	id: number
	number: string
	due_date: string
	vendor_name: string | null
	total_cents: number
	paid_cents: number
}
export interface QuoteEventRow {
	id: number
	number: string
	valid_until: string
	client_name: string | null
	total_cents: number
}
export interface PayslipEventRow {
	id: number
	number: string
	pay_date: string
	employee_name: string | null
	net_cents: number
	paid_cents: number
}

// --- builders: row -> CalendarEvent (null = not shown) -------------------

export function buildInvoiceEvent(row: InvoiceEventRow, today: string): CalendarEvent | null {
	// Mirrors the invoice balance rule (total − receipts − issued credit
	// notes) — one of the sites listed in CLAUDE.md that must move together.
	const balance = row.total_cents - row.paid_cents - row.credited_cents;
	if (balance <= 0) return null;
	return {
		id: `invoice:${row.id}`,
		date: row.due_date,
		kind: "invoice",
		title: row.number,
		party: row.client_name || "—",
		amountCents: row.total_cents,
		balanceCents: balance,
		href: `/invoices/${row.id}`,
		overdue: row.due_date < today
	};
}

export function buildBillEvent(row: BillEventRow, today: string): CalendarEvent | null {
	const balance = row.total_cents - row.paid_cents;
	if (balance <= 0) return null;
	return {
		id: `bill:${row.id}`,
		date: row.due_date,
		kind: "bill",
		title: row.number,
		party: row.vendor_name || "—",
		amountCents: row.total_cents,
		balanceCents: balance,
		href: `/bills/${row.id}`,
		overdue: row.due_date < today
	};
}

export function buildQuoteEvent(row: QuoteEventRow, today: string): CalendarEvent {
	return {
		id: `quote:${row.id}`,
		date: row.valid_until,
		kind: "quote",
		title: row.number,
		party: row.client_name || "—",
		amountCents: row.total_cents,
		balanceCents: row.total_cents,
		href: `/quotes/${row.id}`,
		overdue: row.valid_until < today
	};
}

export function buildPayslipEvent(row: PayslipEventRow, today: string): CalendarEvent | null {
	const balance = row.net_cents - row.paid_cents;
	if (balance <= 0) return null;
	return {
		id: `payslip:${row.id}`,
		date: row.pay_date,
		kind: "payslip",
		title: row.number,
		party: row.employee_name || "—",
		amountCents: row.net_cents,
		balanceCents: balance,
		href: `/payslips/${row.id}`,
		overdue: row.pay_date < today
	};
}
