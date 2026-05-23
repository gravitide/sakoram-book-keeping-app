// Calendar event aggregation for `UpcomingCalendar.vue`.
//
// Pulls due dates from the invoice / bill / quote / payslip stores
// and surfaces them as a unified list of `CalendarEvent` objects
// keyed by ISO date. The calendar component reads
// `eventsByDate.get('YYYY-MM-DD')` to render per-day pills.
//
// Extending: each event source is a small function that takes nothing
// and returns `CalendarEvent[]`. Adding a new source = write the
// function + push it into the `sources` array. The kind discriminator
// + EVENT_KIND_META table cover labelling, colours and icons.

import { useBillsStore } from "~/stores/bills";
import { useInvoicesStore } from "~/stores/invoices";
import { usePayslipsStore } from "~/stores/payslips";
import { useQuotesStore } from "~/stores/quotes";

export type CalendarEventKind = "invoice" | "bill" | "quote" | "payslip";

export interface CalendarEvent {
	/**
	 * Stable id; combines kind + source row id so it stays unique
	 * across kinds (e.g. invoice 12 vs bill 12).
	 */
	id: string
	/** ISO YYYY-MM-DD — the due date / valid-until / pay date. */
	date: string
	kind: CalendarEventKind
	/** Document number, e.g. "INV-2026-0012". */
	title: string
	/** Counterparty name from the snapshot — client / vendor / employee. */
	party: string
	/** Document total in cents (for display in the day modal). */
	amountCents: number
	/** Outstanding balance in cents — 0 when nothing's left to settle. */
	balanceCents: number
	/** Detail-page route for click-through. */
	href: string
	/** Convenience: due-date is before today AND balance > 0. */
	overdue: boolean
}

export interface EventKindMeta {
	label: string
	icon: string
	/** CSS-variable name suffix on `--ui-<color>` — drives pill bg + text. */
	color: "success" | "warning" | "info" | "primary"
}

export const EVENT_KIND_META: Record<CalendarEventKind, EventKindMeta> = {
	invoice: { label: "Receivable", icon: "i-lucide-receipt", color: "success" },
	bill: { label: "Payable", icon: "i-lucide-file-input", color: "warning" },
	quote: { label: "Quote expires", icon: "i-lucide-file-text", color: "info" },
	payslip: { label: "Payslip", icon: "i-lucide-file-spreadsheet", color: "primary" }
};

export const CALENDAR_EVENT_KINDS: CalendarEventKind[] = ["invoice", "bill", "quote", "payslip"];

const partyNameFromSnapshot = (snap: string): string => {
	try {
		const obj = JSON.parse(snap) as { name?: string, full_name?: string };
		return obj.name ?? obj.full_name ?? "—";
	} catch {
		return "—";
	}
};

const todayISO = (): string => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Returns events from all sources, optionally filtered by kind.
 * `kindFilter` is reactive — pass a Set ref to drive filter chips.
 * When omitted (or empty), every kind shows.
 */
export const useCalendarEvents = (kindFilter?: Ref<Set<CalendarEventKind>>) => {
	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();
	const quotesStore = useQuotesStore();
	const payslipsStore = usePayslipsStore();

	const today = computed(() => todayISO());

	// --- Per-source emitters -------------------------------------------
	// Each one inspects its store, drops paid / cancelled items, and
	// emits CalendarEvent rows. Wrapped as plain computeds so Pinia
	// reactivity flows through to the calendar UI.

	const invoiceEvents = computed<CalendarEvent[]>(() => {
		const out: CalendarEvent[] = [];
		for (const i of invoicesStore.invoices) {
			const ds = invoicesStore.derivedStatus(i, today.value);
			// Drop draft / cancelled / paid — those don't need attention.
			if (ds !== "sent" && ds !== "partial" && ds !== "overdue") continue;
			const balance = invoicesStore.balanceCentsFor(i);
			if (balance <= 0) continue;
			out.push({
				id: `invoice:${i.id}`,
				date: i.due_date,
				kind: "invoice",
				title: i.number,
				party: partyNameFromSnapshot(i.client_snapshot),
				amountCents: i.total_cents,
				balanceCents: balance,
				href: `/invoices/${i.id}`,
				overdue: ds === "overdue"
			});
		}
		return out;
	});

	const billEvents = computed<CalendarEvent[]>(() => {
		const out: CalendarEvent[] = [];
		for (const b of billsStore.bills) {
			const ds = billsStore.derivedStatus(b, today.value);
			if (ds !== "unpaid" && ds !== "partial" && ds !== "overdue") continue;
			const balance = billsStore.balanceCentsFor(b);
			if (balance <= 0) continue;
			out.push({
				id: `bill:${b.id}`,
				date: b.due_date,
				kind: "bill",
				title: b.number,
				party: partyNameFromSnapshot(b.vendor_snapshot),
				amountCents: b.total_cents,
				balanceCents: balance,
				href: `/bills/${b.id}`,
				overdue: ds === "overdue"
			});
		}
		return out;
	});

	// Quotes show their valid_until as an "expiring" event — only when
	// the quote is still in play (sent, not yet accepted / rejected /
	// converted / expired). Past-dated entries get the overdue flag so
	// they render in red.
	const quoteEvents = computed<CalendarEvent[]>(() => {
		const out: CalendarEvent[] = [];
		for (const q of quotesStore.quotes) {
			if (q.status !== "sent") continue;
			out.push({
				id: `quote:${q.id}`,
				date: q.valid_until,
				kind: "quote",
				title: q.number,
				party: partyNameFromSnapshot(q.client_snapshot),
				amountCents: q.total_cents,
				balanceCents: q.total_cents,
				href: `/quotes/${q.id}`,
				overdue: q.valid_until < today.value
			});
		}
		return out;
	});

	// Payslips don't have an "overdue" derived state (the store keeps it
	// at unpaid/partial after pay_date passes), so we derive it here by
	// comparing pay_date to today — matches the UX convention of the
	// other types.
	const payslipEvents = computed<CalendarEvent[]>(() => {
		const out: CalendarEvent[] = [];
		for (const p of payslipsStore.payslips) {
			const ds = payslipsStore.derivedStatus(p);
			if (ds !== "unpaid" && ds !== "partial") continue;
			const balance = payslipsStore.balanceCentsFor(p);
			if (balance <= 0) continue;
			out.push({
				id: `payslip:${p.id}`,
				date: p.pay_date,
				kind: "payslip",
				title: p.number,
				party: partyNameFromSnapshot(p.employee_snapshot),
				amountCents: p.net_cents,
				balanceCents: balance,
				href: `/payslips/${p.id}`,
				overdue: p.pay_date < today.value
			});
		}
		return out;
	});

	// Order matters only for stable rendering of pills inside a day:
	// invoices first (most common "what's due"), then bills, quotes,
	// payslips. The calendar component re-sorts by overdue + amount
	// when picking which to show in the preview slots.
	const sources = [invoiceEvents, billEvents, quoteEvents, payslipEvents];

	const allEvents = computed<CalendarEvent[]>(() => {
		const out: CalendarEvent[] = [];
		const allow = kindFilter?.value;
		const skip = (k: CalendarEventKind) => allow && allow.size > 0 && !allow.has(k);
		for (const src of sources) {
			for (const e of src.value) {
				if (skip(e.kind)) continue;
				out.push(e);
			}
		}
		return out;
	});

	const eventsByDate = computed<Map<string, CalendarEvent[]>>(() => {
		const m = new Map<string, CalendarEvent[]>();
		for (const e of allEvents.value) {
			const list = m.get(e.date);
			if (list) list.push(e);
			else m.set(e.date, [e]);
		}
		// Per-day ordering: overdue first (red pills bunch at top),
		// then bigger balance first (so the user sees the largest
		// outstanding pieces before the "+N more" cutoff).
		for (const list of m.values()) {
			list.sort((a, b) => {
				if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
				return b.balanceCents - a.balanceCents;
			});
		}
		return m;
	});

	return {
		eventsByDate,
		allEvents,
		invoiceEvents,
		billEvents,
		quoteEvents,
		payslipEvents
	};
};
