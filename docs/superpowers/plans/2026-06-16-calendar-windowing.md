# Calendar Windowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the calendar fetch only the events in the visible 42-day grid window via per-source date-bounded SQL, instead of loading five whole tables to render one month.

**Architecture:** Extract the calendar's pure logic (grid-window math, row→event builders, kind metadata) into a testable `app/lib/calendar-events.ts`. Rewrite `useCalendarEvents` into thin glue that owns the month cursor, runs four date-bounded queries (`WHERE <datecol> BETWEEN ? AND ?` + a correlated voucher-sum subquery), and exposes window-scoped events + cursor nav. `UpcomingCalendar` accepts the cursor/events via props (prop-or-self fallback for the dashboard embed); `/calendar` collapses its two extra composable instances into one.

**Tech Stack:** Nuxt 4 / Vue 3 `<script setup>`, Pinia, `tauri-plugin-sql` (`select` helper from `app/lib/db.ts`), Vitest (node env, pure modules only).

**Reference spec:** `docs/superpowers/specs/2026-06-16-calendar-windowing-design.md`

---

## Pre-flight (do once, before Task 1)

- [ ] **Sync main and branch.**

```bash
git checkout main && git fetch origin && git pull --ff-only
git checkout -b perf/calendar-windowing
```

- [ ] **Read the three voucher-sum sources so the queries match the stores exactly.** Open `app/stores/invoices.ts`, `app/stores/bills.ts`, `app/stores/payslips.ts` and note each `balanceCentsFor` / `paidCentsFor`: which `voucher_type` it sums and whether it filters by type at all. The query table below is the *expected* shape; if a store sums without a `voucher_type` filter, drop that filter from the matching query so the calendar can never disagree with the detail page.

Expected (verify against the stores):

| Source | Date col | Status filter | Voucher sum | Amount |
|---|---|---|---|---|
| invoices | `due_date` | `status='sent'` | `related_invoice_id`, `voucher_type='receipt'` | `total_cents` |
| bills | `due_date` | `status='open'` | `related_bill_id`, `voucher_type='payment'` | `total_cents` |
| quotes | `valid_until` | `status='sent'` | — | `total_cents` |
| payslips | `pay_date` | `status='issued'` | `related_payslip_id`, `voucher_type='payment'` | `net_cents` |

---

## Task 1: Pure calendar-events module

**Files:**
- Create: `app/lib/calendar-events.ts`
- Test: `app/lib/calendar-events.test.ts`

This module holds everything pure: the event types + kind metadata (moved out of the composable so tests need no Vue auto-imports), the 42-day grid-window math, and the row→event builders.

- [ ] **Step 1: Write the failing test**

`app/lib/calendar-events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	buildBillEvent,
	buildInvoiceEvent,
	buildPayslipEvent,
	buildQuoteEvent,
	computeGridWindow,
} from "./calendar-events";

describe("computeGridWindow", () => {
	it("spans the 42-cell grid from the Sunday on/before the 1st", () => {
		// June 2026: the 1st is a Monday, so the grid starts on Sun May 31.
		expect(computeGridWindow(2026, 5)).toEqual({ from: "2026-05-31", to: "2026-07-11" });
	});

	it("starts on the 1st when the month begins on a Sunday", () => {
		// Feb 2026: the 1st is a Sunday.
		expect(computeGridWindow(2026, 1)).toEqual({ from: "2026-02-01", to: "2026-03-14" });
	});
});

describe("buildInvoiceEvent", () => {
	const row = {
		id: 7,
		number: "INV-2026-0007",
		due_date: "2026-06-20",
		client_name: "Acme",
		total_cents: 10000,
		paid_cents: 4000,
	};

	it("builds an event for a partially-paid invoice", () => {
		const e = buildInvoiceEvent(row, "2026-06-16");
		expect(e).toMatchObject({
			id: "invoice:7",
			date: "2026-06-20",
			kind: "invoice",
			title: "INV-2026-0007",
			party: "Acme",
			amountCents: 10000,
			balanceCents: 6000,
			href: "/invoices/7",
			overdue: false,
		});
	});

	it("drops a fully-paid invoice", () => {
		expect(buildInvoiceEvent({ ...row, paid_cents: 10000 }, "2026-06-16")).toBeNull();
	});

	it("flags overdue when due_date is before today and a balance remains", () => {
		expect(buildInvoiceEvent({ ...row, due_date: "2026-06-10" }, "2026-06-16")?.overdue).toBe(true);
	});

	it("falls back to an em dash when client_name is null", () => {
		expect(buildInvoiceEvent({ ...row, client_name: null }, "2026-06-16")?.party).toBe("—");
	});
});

describe("buildBillEvent", () => {
	it("drops a fully-paid bill and builds an open one", () => {
		const row = { id: 3, number: "BILL-1", due_date: "2026-06-20", vendor_name: "V", total_cents: 5000, paid_cents: 0 };
		expect(buildBillEvent(row, "2026-06-16")).toMatchObject({ id: "bill:3", kind: "bill", balanceCents: 5000, href: "/bills/3" });
		expect(buildBillEvent({ ...row, paid_cents: 5000 }, "2026-06-16")).toBeNull();
	});
});

describe("buildQuoteEvent", () => {
	it("always builds (no balance gate) and flags expiry", () => {
		const row = { id: 9, number: "QUO-9", valid_until: "2026-06-10", client_name: "C", total_cents: 8000 };
		const e = buildQuoteEvent(row, "2026-06-16");
		expect(e).toMatchObject({ id: "quote:9", kind: "quote", balanceCents: 8000, amountCents: 8000, href: "/quotes/9", overdue: true });
	});
});

describe("buildPayslipEvent", () => {
	it("uses net_cents and drops fully-paid", () => {
		const row = { id: 4, number: "PSL-4", pay_date: "2026-06-25", employee_name: "E", net_cents: 12000, paid_cents: 0 };
		expect(buildPayslipEvent(row, "2026-06-16")).toMatchObject({ id: "payslip:4", kind: "payslip", amountCents: 12000, balanceCents: 12000, href: "/payslips/4" });
		expect(buildPayslipEvent({ ...row, paid_cents: 12000 }, "2026-06-16")).toBeNull();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- calendar-events`
Expected: FAIL — `Cannot find module './calendar-events'`.

- [ ] **Step 3: Write the module**

`app/lib/calendar-events.ts`:

```ts
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
export function computeGridWindow(year: number, month0: number): { from: string; to: string } {
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
	const balance = row.total_cents - row.paid_cents;
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- calendar-events`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add app/lib/calendar-events.ts app/lib/calendar-events.test.ts
git commit -m "feat(calendar): pure calendar-events module (grid window + event builders)"
```

---

## Task 2: Rewrite `useCalendarEvents` as range-driven DB glue

**Files:**
- Modify (rewrite): `app/composables/useCalendarEvents.ts`

The composable owns the month cursor, runs the four windowed queries, holds the fetched window in a ref, and exposes window-scoped events + cursor nav. No store arrays, no vouchers store dependency. No unit test here — the pure parts are covered by Task 1; this glue is covered by manual QA in Task 5.

- [ ] **Step 1: Replace the file contents**

`app/composables/useCalendarEvents.ts`:

```ts
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
	QuoteEventRow,
} from "~/lib/calendar-events";
import {
	buildBillEvent,
	buildInvoiceEvent,
	buildPayslipEvent,
	buildQuoteEvent,
	computeGridWindow,
	todayISO,
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
		                  WHERE v.related_invoice_id = i.id AND v.voucher_type = 'receipt'), 0) AS paid_cents
		 FROM invoices i
		 WHERE i.status = 'sent' AND i.due_date BETWEEN ? AND ?`,
		[from, to]
	);
	return rows.map(r => buildInvoiceEvent(r, today)).filter((e): e is CalendarEvent => e !== null);
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
	return rows.map(r => buildBillEvent(r, today)).filter((e): e is CalendarEvent => e !== null);
}

async function fetchQuoteEvents(from: string, to: string, today: string): Promise<CalendarEvent[]> {
	const rows = await select<QuoteEventRow>(
		`SELECT q.id, q.number, q.valid_until, q.client_name, q.total_cents
		 FROM quotes q
		 WHERE q.status = 'sent' AND q.valid_until BETWEEN ? AND ?`,
		[from, to]
	);
	return rows.map(r => buildQuoteEvent(r, today));
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
	return rows.map(r => buildPayslipEvent(r, today)).filter((e): e is CalendarEvent => e !== null);
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
				fetchPayslipEvents(from, to, today),
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
		return windowEvents.value.filter(e => !skip(e.kind));
	});

	const invoiceEvents = computed(() => windowEvents.value.filter(e => e.kind === "invoice"));
	const billEvents = computed(() => windowEvents.value.filter(e => e.kind === "bill"));
	const quoteEvents = computed(() => windowEvents.value.filter(e => e.kind === "quote"));
	const payslipEvents = computed(() => windowEvents.value.filter(e => e.kind === "payslip"));

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
		reload: fetchWindow,
	};
};
```

> **Note on the voucher-type filters:** if Task 1 pre-flight found a store's `balanceCentsFor` sums vouchers *without* a `voucher_type` filter, remove the `AND v.voucher_type = '…'` clause from that source's query to match. The detail page is the source of truth.

- [ ] **Step 2: Type-check / lint**

Run: `bun run lint`
Expected: no errors in `useCalendarEvents.ts` (auto-fix tidies formatting). `ref`/`computed`/`watch`/`Ref` resolve via Nuxt auto-imports.

- [ ] **Step 3: Commit**

```bash
git add app/composables/useCalendarEvents.ts
git commit -m "perf(calendar): window useCalendarEvents to the visible month (DB-bounded queries)"
```

---

## Task 3: `UpcomingCalendar` accepts the cursor/events via props (prop-or-self)

**Files:**
- Modify: `app/components/UpcomingCalendar.vue`

The component currently owns `cursorYear/cursorMonth/shiftMonth/goToday` and calls `useCalendarEvents(filterRef)` itself (`UpcomingCalendar.vue:240-270`). Change it so the parent can supply the composable's outputs as props; when not supplied (dashboard embed), it creates its own instance.

- [ ] **Step 1: Add a `calendar` prop and prefer it over a self-created instance**

In `<script setup>`, find the existing `props` definition and the block:

```ts
const filterRef = computed(() => props.kindFilter ?? new Set<CalendarEventKind>());
const { eventsByDate } = useCalendarEvents(filterRef);
```

Replace the `useCalendarEvents` wiring with a prop-or-self pattern. Add to `defineProps` an optional `calendar` object (the return type of `useCalendarEvents`), then:

```ts
const filterRef = computed(() => props.kindFilter ?? new Set<CalendarEventKind>());
// Prop-or-self: the /calendar page supplies a shared instance so its chip
// counts + this grid agree on the visible month; the dashboard embed passes
// nothing and we self-manage.
const calendar = props.calendar ?? useCalendarEvents(filterRef);
const { eventsByDate, cursorYear, cursorMonth, shiftMonth, goToday, monthLabel, isCurrentMonth } = calendar;
```

Add the prop to `defineProps` (alongside `density` / `kindFilter`):

```ts
calendar?: ReturnType<typeof useCalendarEvents>
```

- [ ] **Step 2: Replace the component's local cursor state with the destructured one**

Delete the now-duplicated local declarations the component owned:

```ts
const today = new Date();
const cursorYear = ref(today.getFullYear());
const cursorMonth = ref(today.getMonth());
const shiftMonth = (delta: number) => { /* … */ };
const goToday = () => { /* … */ };
const isCurrentMonth = computed(() => { /* … */ });
const monthLabel = computed(() => /* … */);
```

These names now come from the `calendar` destructure in Step 1. The `cells` computed (`UpcomingCalendar.vue:288`) already reads `cursorYear.value` / `cursorMonth.value` / `eventsByDate.value` — those references resolve to the destructured refs unchanged. Keep the local `toISO` / `todayISO` helpers the template/cells use.

> If `cursorYear` etc. are used only inside `cells`, destructuring them as above is enough. Verify no remaining local `const cursorYear = ref(...)` line survives (it would shadow and break the shared instance).

- [ ] **Step 3: Lint + quick manual smoke**

Run: `bun run lint`
Expected: clean. Then `bun run tauri:dev`, open the dashboard — the compact calendar still renders the current month and navigation arrows work (self-managed instance path).

- [ ] **Step 4: Commit**

```bash
git add app/components/UpcomingCalendar.vue
git commit -m "refactor(calendar): UpcomingCalendar takes a shared calendar instance via prop (prop-or-self)"
```

---

## Task 4: `/calendar` page uses one shared instance; window-scoped counts

**Files:**
- Modify: `app/pages/calendar.vue`

The page currently creates **two** instances (`calendar.vue:187` `allKinds` for counts, `calendar.vue:195` `filtered` for the list). Collapse to one and feed it into `UpcomingCalendar`.

- [ ] **Step 1: Replace the two instances with one**

Find:

```ts
const allKinds = useCalendarEvents();
// ... kindCounts reads allKinds.invoiceEvents.value.length etc.
const filtered = useCalendarEvents(kindFilter);
const visibleEvents = computed(() => filtered.allEvents.value);
const overdueCount = computed(() => visibleEvents.value.filter((e) => e.overdue).length);
```

Replace with a single filtered instance; per-kind counts now read its window-scoped arrays:

```ts
const calendar = useCalendarEvents(kindFilter);
const visibleEvents = computed(() => calendar.allEvents.value);
const overdueCount = computed(() => visibleEvents.value.filter((e) => e.overdue).length);
```

Update the `kindCounts` map (around `calendar.vue:188-193`) to read from the single instance:

```ts
const kindCounts = computed<Record<CalendarEventKind, number>>(() => ({
	invoice: calendar.invoiceEvents.value.length,
	bill: calendar.billEvents.value.length,
	quote: calendar.quoteEvents.value.length,
	payslip: calendar.payslipEvents.value.length,
}));
```

> The chips now show **visible-month** counts (intended behavior change per the spec). Note: these per-kind counts are over the *unfiltered* window (they ignore `kindFilter`), so the chips still show each kind's own count even when other kinds are toggled off — matching current UX where a chip's number reflects its kind regardless of selection.

- [ ] **Step 2: Pass the shared instance into `UpcomingCalendar`**

Find the `<UpcomingCalendar … />` usage in the template and add the prop:

```vue
<UpcomingCalendar :kind-filter="kindFilter" :calendar="calendar" density="full" />
```

(Keep whatever existing props are there — `density`, `kindFilter`. Add `:calendar="calendar"`.)

- [ ] **Step 3: Remove the page's now-unnecessary store bulk-loads**

Search `app/pages/calendar.vue` for `ensureLoaded()` / `.load()` calls on the invoices / bills / quotes / payslips / vouchers stores in `onMounted` (or a setup block). The calendar no longer reads those store arrays, so delete the calls **and** the now-unused store imports/instances — but only if nothing else on the page uses them (e.g. the quick-create flow). Verify by grep before deleting.

```bash
grep -nE "useInvoicesStore|useBillsStore|useQuotesStore|usePayslipsStore|useVouchersStore|ensureLoaded|\.load\(\)" app/pages/calendar.vue
```

Delete only the calls/instances with no remaining reference.

- [ ] **Step 4: Lint + manual QA**

Run: `bun run lint`
Then `bun run tauri:dev`, open `/calendar`:
- Opens noticeably faster on the demo dataset (no five-table load).
- Month navigation forward/back updates events + chip counts.
- Kind chips toggle instantly (no flicker / no perceptible refetch).
- Overdue items render red; a quote expiring this month appears.
- Quick-create from a day still works (if that flow lived here).

- [ ] **Step 5: Commit**

```bash
git add app/pages/calendar.vue
git commit -m "refactor(calendar): single windowed useCalendarEvents instance; window-scoped chip counts"
```

---

## Task 5: Verify, bump version, final commit

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (+ `src-tauri/Cargo.lock` picks up automatically)

- [ ] **Step 1: Full test + lint**

Run: `bun run test && bun run lint`
Expected: all green; `calendar-events` suite passes.

- [ ] **Step 2: Regression sweep**

Confirm no other consumer of `useCalendarEvents` (or the moved exports) broke:

```bash
grep -rnE "useCalendarEvents|EVENT_KIND_META|CALENDAR_EVENT_KINDS|from \"~/composables/useCalendarEvents\"" app/
```

Every importer should resolve `EVENT_KIND_META` / `CALENDAR_EVENT_KINDS` / `CalendarEvent` (re-exported from the composable) and `useCalendarEvents` unchanged. Confirm the dashboard page renders the compact embed with no console errors.

- [ ] **Step 3: Bump version (patch — perf/refactor, no new feature surface)**

Current `0.114.2` → `0.114.3`. Edit all three:
- `package.json` → `"version": "0.114.3"`
- `src-tauri/Cargo.toml` → `version = "0.114.3"`
- `src-tauri/tauri.conf.json` → `"version": "0.114.3"`

Then let cargo refresh the lock:

```bash
cd src-tauri && cargo check 2>/dev/null; cd ..
```

(If `tauri:dev` holds the build lock, edit the `version` line in `Cargo.lock` for `sakoram_billing` by hand instead.)

- [ ] **Step 4: Commit the bump**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "chore: bump version to 0.114.3"
```

- [ ] **Step 5: Push and stop for confirmation**

```bash
git push -u origin perf/calendar-windowing
```

Then summarise what shipped and **wait for explicit "open the PR"** before running `gh pr create` (user gate: push, PR-open, and PR-merge are separate confirmations).

---

## Self-review notes (author)

- **Spec coverage:** §1 range-driven DB fetch → Task 2; §2 per-source queries → Task 2 (+ pre-flight verification); §3 cursor ownership in composable → Task 2/3; §4 window-scoped counts → Task 4; §5 refetch triggers → Task 2 `watch`/`reload`; §6 indexes → no migration (default), noted; pure builders + grid math unit-tested → Task 1.
- **Behavior change called out:** chip counts become month-scoped (Task 4 Step 1).
- **No new index migration** unless QA flags `quotes.valid_until` (spec §6) — keep this PR migration-free.
- **Type consistency:** `computeGridWindow(year, month0)`, `build*Event(row, today)`, and the `{ from, to }` window shape are used identically in Tasks 1 and 2; `useCalendarEvents` return keys (`eventsByDate`, `*Events`, `cursorYear/cursorMonth`, `shiftMonth`, `goToday`, `monthLabel`, `isCurrentMonth`, `loading`, `reload`) match what Tasks 3 and 4 destructure.
