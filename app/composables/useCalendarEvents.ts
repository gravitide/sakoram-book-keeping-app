// Range-driven calendar event aggregation for `UpcomingCalendar.vue`.
//
// Owns the visible month cursor and fetches ONLY the events whose date falls
// in the 42-cell grid window via per-source date-bounded queries (each with a
// correlated voucher-sum subquery for paid-state). No store arrays are read,
// so the calendar no longer needs invoices/bills/quotes/payslips/vouchers
// bulk-loaded. Pure logic (grid math, builders, kind meta) lives in
// `~/lib/calendar-events`.
//
// Kind filtering is applied JS-side over the already-fetched window, so toggling
// filter chips is instant and never re-queries. A month navigation changes the
// window range and triggers a refetch.

import type {
	BillEventRow,
	CalendarEvent,
	CalendarEventKind,
	InvoiceEventRow,
	PayslipEventRow,
	QuoteEventRow
} from "~/lib/calendar-events";
import {
	buildBillEvent,
	buildInvoiceEvent,
	buildPayslipEvent,
	buildQuoteEvent,
	computeGridWindow,
	todayISO
} from "~/lib/calendar-events";
import { select } from "~/lib/db";

// Re-export so existing importers (`UpcomingCalendar.vue`, `calendar.vue`)
// keep resolving these from the composable.
export type { CalendarEvent, CalendarEventKind, EventKindMeta } from "~/lib/calendar-events";
export { CALENDAR_EVENT_KINDS, EVENT_KIND_META } from "~/lib/calendar-events";

async function fetchInvoiceEvents(from: string, to: string, today: string): Promise<CalendarEvent[]> {
	const rows = await select<InvoiceEventRow>(
		`SELECT i.id, i.number, i.due_date, i.client_name, i.total_cents,
		        COALESCE((SELECT SUM(v.amount_cents) FROM vouchers v
		                  WHERE v.related_invoice_id = i.id AND v.voucher_type = 'receipt'), 0) AS paid_cents,
		        COALESCE((SELECT SUM(cn.total_cents) FROM credit_notes cn
		                  WHERE cn.source_invoice_id = i.id AND cn.status = 'issued'), 0) AS credited_cents
		 FROM invoices i
		 WHERE i.status = 'sent' AND i.due_date BETWEEN ? AND ?`,
		[from, to]
	);
	return rows.map((r) => buildInvoiceEvent(r, today)).filter((e): e is CalendarEvent => e !== null);
}

async function fetchBillEvents(from: string, to: string, today: string): Promise<CalendarEvent[]> {
	const rows = await select<BillEventRow>(
		`SELECT b.id, b.number, b.due_date, b.vendor_name, b.total_cents,
		        COALESCE((SELECT SUM(v.amount_cents) FROM vouchers v
		                  WHERE v.related_bill_id = b.id AND v.voucher_type = 'payment'), 0) AS paid_cents
		 FROM bills b
		 WHERE b.status = 'open' AND b.due_date BETWEEN ? AND ?`,
		[from, to]
	);
	return rows.map((r) => buildBillEvent(r, today)).filter((e): e is CalendarEvent => e !== null);
}

async function fetchQuoteEvents(from: string, to: string, today: string): Promise<CalendarEvent[]> {
	const rows = await select<QuoteEventRow>(
		`SELECT q.id, q.number, q.valid_until, q.client_name, q.total_cents
		 FROM quotes q
		 WHERE q.status = 'sent' AND q.valid_until BETWEEN ? AND ?`,
		[from, to]
	);
	return rows.map((r) => buildQuoteEvent(r, today));
}

async function fetchPayslipEvents(from: string, to: string, today: string): Promise<CalendarEvent[]> {
	const rows = await select<PayslipEventRow>(
		`SELECT p.id, p.number, p.pay_date, p.employee_name, p.net_cents,
		        COALESCE((SELECT SUM(v.amount_cents) FROM vouchers v
		                  WHERE v.related_payslip_id = p.id AND v.voucher_type = 'payment'), 0) AS paid_cents
		 FROM payslips p
		 WHERE p.status = 'issued' AND p.pay_date BETWEEN ? AND ?`,
		[from, to]
	);
	return rows.map((r) => buildPayslipEvent(r, today)).filter((e): e is CalendarEvent => e !== null);
}

/**
 * Range-driven calendar events. Owns the month cursor; fetches only the
 * visible 42-day window. `kindFilter` is reactive — pass a Set ref to drive
 * filter chips. When omitted (or empty), every kind shows.
 */
export const useCalendarEvents = (kindFilter?: Ref<Set<CalendarEventKind>>) => {
	const now = new Date();
	const cursorYear = ref(now.getFullYear());
	const cursorMonth = ref(now.getMonth()); // 0-based

	const shiftMonth = (delta: number) => {
		const d = new Date(cursorYear.value, cursorMonth.value + delta, 1);
		cursorYear.value = d.getFullYear();
		cursorMonth.value = d.getMonth();
	};
	const goToday = () => {
		const n = new Date();
		cursorYear.value = n.getFullYear();
		cursorMonth.value = n.getMonth();
	};

	const monthLabel = computed(() =>
		new Date(cursorYear.value, cursorMonth.value, 1)
			.toLocaleDateString("en-US", { month: "long", year: "numeric" })
	);
	const isCurrentMonth = computed(() => {
		const n = new Date();
		return cursorYear.value === n.getFullYear() && cursorMonth.value === n.getMonth();
	});

	const windowRange = computed(() => computeGridWindow(cursorYear.value, cursorMonth.value));

	const windowEvents = ref<CalendarEvent[]>([]);
	const loading = ref(false);

	async function fetchWindow() {
		const { from, to } = windowRange.value;
		const today = todayISO();
		loading.value = true;
		try {
			const [inv, bill, quote, pay] = await Promise.all([
				fetchInvoiceEvents(from, to, today),
				fetchBillEvents(from, to, today),
				fetchQuoteEvents(from, to, today),
				fetchPayslipEvents(from, to, today)
			]);
			windowEvents.value = [...inv, ...bill, ...quote, ...pay];
		} finally {
			loading.value = false;
		}
	}

	watch(windowRange, fetchWindow, { immediate: true });

	// --- kind filtering: JS-side over the fetched window (no re-query) ---
	const allEvents = computed<CalendarEvent[]>(() => {
		const allow = kindFilter?.value;
		const skip = (k: CalendarEventKind) => allow && allow.size > 0 && !allow.has(k);
		return windowEvents.value.filter((e) => !skip(e.kind));
	});

	const invoiceEvents = computed(() => windowEvents.value.filter((e) => e.kind === "invoice"));
	const billEvents = computed(() => windowEvents.value.filter((e) => e.kind === "bill"));
	const quoteEvents = computed(() => windowEvents.value.filter((e) => e.kind === "quote"));
	const payslipEvents = computed(() => windowEvents.value.filter((e) => e.kind === "payslip"));

	const eventsByDate = computed<Map<string, CalendarEvent[]>>(() => {
		const m = new Map<string, CalendarEvent[]>();
		for (const e of allEvents.value) {
			const list = m.get(e.date);
			if (list) list.push(e);
			else m.set(e.date, [e]);
		}
		for (const list of m.values()) {
			list.sort((a, b) => {
				if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
				return b.balanceCents - a.balanceCents;
			});
		}
		return m;
	});

	return {
		// data (window-scoped)
		eventsByDate,
		allEvents,
		invoiceEvents,
		billEvents,
		quoteEvents,
		payslipEvents,
		// month cursor + nav
		cursorYear,
		cursorMonth,
		shiftMonth,
		goToday,
		monthLabel,
		isCurrentMonth,
		windowRange,
		// status
		loading,
		reload: fetchWindow
	};
};
