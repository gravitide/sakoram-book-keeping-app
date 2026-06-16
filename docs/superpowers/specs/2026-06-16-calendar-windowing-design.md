# Calendar Windowing — Design

**Date**: 2026-06-16
**Branch**: `perf/calendar-windowing`
**Roadmap tier**: Performance / deferred-items ("DB-side pagination" family). This is the calendar-specific slice, done first as its own focused effort ahead of the general list-pagination engine.

---

## Goal

Make the calendar (`/calendar` page + the dashboard compact embed) fetch **only the events whose date falls in the visible 42-day grid window**, instead of loading five entire tables to render one month.

The deliverable is a **range-driven, DB-backed `useCalendarEvents`**: per-source date-bounded queries scoped to `[from, to]`, re-fetched on month navigation, with kind-filtering kept JS-side so chip toggles stay instant.

## The problem (why)

`app/composables/useCalendarEvents.ts` today iterates the **full** `invoices`, `bills`, `quotes`, `payslips` store arrays. Via the stores' `derivedStatus()` / `balanceCentsFor()` it also needs the **vouchers** store fully loaded (to sum linked payments). So rendering a single month pulls **five whole tables** across the IPC bridge — on the demo dataset (~3,400+ rows) that's the felt slowness when opening the calendar / dashboard.

A calendar only ever renders a **42-cell grid**: `new Date(year, month, 1 - startDow)` through +41 days (`UpcomingCalendar.vue:288-308`). Everything outside that window is computed and then thrown away.

## Non-goals (v1)

- The general list-pagination engine (ResizableDataTable opt-in `total` + `useServerTable`). Separate, deferred effort — not touched here.
- Changing the stores' bulk `load()` / `ensureLoaded()` used by the list pages and reports. Unchanged; only the calendar stops depending on them.
- Live cross-store reactivity while parked on the calendar (e.g. a payment recorded in another tab/window auto-appearing). Covered by `reload()` + refetch-on-mount/nav, not by Pinia array reactivity anymore.
- A new index migration, unless QA proves it's needed (see "Indexes").

---

## Design

### 1. `useCalendarEvents` becomes range-driven + DB-backed

The composable owns the month cursor and queries the DB directly for the visible window. It no longer reads any store array, so the calendar stops needing invoices/bills/quotes/payslips/vouchers bulk-loaded at all.

**New shape (sketch):**

```ts
export const useCalendarEvents = (kindFilter?: Ref<Set<CalendarEventKind>>) => {
  // --- month cursor (moved IN from UpcomingCalendar) ---
  const now = new Date();
  const cursorYear = ref(now.getFullYear());
  const cursorMonth = ref(now.getMonth());     // 0-based
  const shiftMonth = (delta: number) => { /* … */ };
  const goToday = () => { /* … */ };
  const monthLabel = computed(() => /* "June 2026" */);
  const isCurrentMonth = computed(() => /* … */);

  // --- visible window: the 42-cell grid range ---
  const windowRange = computed<{ from: string; to: string }>(() => {
    const firstOfMonth = new Date(cursorYear.value, cursorMonth.value, 1);
    const startDow = firstOfMonth.getDay();             // 0=Sun
    const start = new Date(cursorYear.value, cursorMonth.value, 1 - startDow);
    const end = new Date(cursorYear.value, cursorMonth.value, 1 - startDow + 41);
    return { from: toISO(start), to: toISO(end) };
  });

  // --- fetched window events (ALL kinds), refilled on range change ---
  const windowEvents = ref<CalendarEvent[]>([]);
  const loading = ref(false);

  async function fetchWindow() {
    const { from, to } = windowRange.value;
    loading.value = true;
    try {
      const [inv, bill, quote, pay] = await Promise.all([
        fetchInvoiceEvents(from, to),
        fetchBillEvents(from, to),
        fetchQuoteEvents(from, to),
        fetchPayslipEvents(from, to),
      ]);
      windowEvents.value = [...inv, ...bill, ...quote, ...pay];
    } finally {
      loading.value = false;
    }
  }

  watch(windowRange, fetchWindow, { immediate: true });

  // --- kind filtering stays JS-side (instant chip toggles, no re-query) ---
  const allEvents = computed(() => {
    const allow = kindFilter?.value;
    const skip = (k) => allow && allow.size > 0 && !allow.has(k);
    return windowEvents.value.filter(e => !skip(e.kind));
  });

  const eventsByDate = computed<Map<string, CalendarEvent[]>>(() => /* group+sort, unchanged */);

  // per-kind arrays now window-scoped (drive /calendar chip counts)
  const invoiceEvents = computed(() => windowEvents.value.filter(e => e.kind === "invoice"));
  // … bill/quote/payslip likewise

  const reload = fetchWindow;

  return {
    eventsByDate, allEvents, invoiceEvents, billEvents, quoteEvents, payslipEvents,
    cursorYear, cursorMonth, shiftMonth, goToday, monthLabel, isCurrentMonth,
    windowRange, loading, reload,
  };
};
```

`today` for the `overdue` flag is computed once per fetch (or kept as a `computed(todayISO)` — overdue is a display flag, recomputed cheaply).

### 2. Per-source windowed queries

Each source is **one** `SELECT … WHERE <datecol> BETWEEN ? AND ? AND status = ?`, with a **correlated voucher-sum** column for the three that derive paid-state. JS then computes `balance = total − paid`, drops `balance ≤ 0`, sets `overdue = datecol < today`, and shapes the `CalendarEvent`.

| Source | Date col | Persisted status filter | Voucher sum (mirror the store's `balanceCentsFor`) | Amount field |
|---|---|---|---|---|
| invoices | `due_date` | `status = 'sent'` | `related_invoice_id`, `voucher_type='receipt'` | `total_cents` |
| bills | `due_date` | `status = 'open'` | `related_bill_id`, `voucher_type='payment'` | `total_cents` |
| quotes | `valid_until` | `status = 'sent'` | — (no payments) | `total_cents` |
| payslips | `pay_date` | `status = 'issued'` | `related_payslip_id`, `voucher_type='payment'` | `net_cents` |

Example (invoices):

```sql
SELECT i.id, i.number, i.due_date, i.client_name, i.total_cents,
       COALESCE((SELECT SUM(v.amount_cents) FROM vouchers v
                 WHERE v.related_invoice_id = i.id AND v.voucher_type = 'receipt'), 0) AS paid_cents
FROM invoices i
WHERE i.status = 'sent' AND i.due_date BETWEEN ? AND ?;
```

> **Implementation note:** before writing each query, re-read that store's `balanceCentsFor()` to copy its exact voucher-sum semantics (which `voucher_type`, whether it filters at all). The table above is the expected shape; the store is the source of truth so the calendar can never disagree with the detail page / dashboard tiles.

The status filters reproduce the current emitters' JS guards exactly:
- invoices: emitter keeps derived `sent | partial | overdue` → all non-draft, non-cancelled = persisted `status='sent'`, then `balance>0`.
- bills: derived `unpaid | partial | overdue` → persisted `status='open'`, then `balance>0`.
- quotes: emitter requires `status === 'sent'`; all such quotes shown (no balance gate). `overdue = valid_until < today`.
- payslips: derived `unpaid | partial` → persisted `status='issued'`, then `balance>0`. `overdue = pay_date < today`.

The window is tiny (dozens of rows), so the correlated subquery is cheap and the "load all vouchers" dependency is gone.

### 3. Month-cursor ownership moves into the composable

**Decision (approved):** the month cursor lives in `useCalendarEvents`, not in `UpcomingCalendar`.

- `/calendar` (`app/pages/calendar.vue`) creates **one** `useCalendarEvents(kindFilter)` instance — replacing its current **two** standalone instances (`allKinds` for counts, `filtered` for the list). Per-kind chip counts read the window-scoped `invoiceEvents.length` etc.; the visible list + overdue count read `allEvents`.
- `/calendar` passes the cursor + nav handlers + `eventsByDate` into `UpcomingCalendar` **as props** (the component stops owning `cursorYear/cursorMonth/shiftMonth/goToday`).
- The **dashboard compact embed** uses `UpcomingCalendar` standalone with no surrounding counts UI. So `UpcomingCalendar` falls back to creating its **own** internal `useCalendarEvents` instance when the page doesn't supply one (prop-or-self pattern).

This keeps a single window + single fetch wherever counts and grid must agree, while letting the embed stay self-contained.

### 4. Window-scoped chip counts

**Decision (approved):** the `/calendar` per-kind chip counts become **visible-month** counts (e.g. "23 receivables due this month") instead of all-time. This falls out of the windowed fetch for free and matches what's drawn on the grid. It is a visible behavior change from the current all-time counts — intended.

### 5. Re-fetch triggers

- `watch(windowRange, fetchWindow, { immediate: true })` — fetch on mount and on every month navigation.
- Kind-filter toggles do **not** refetch (JS filter over `windowEvents`).
- `reload()` exposed for the "recorded a payment, still on the calendar" case; callers that mutate then return generally remount anyway.

### 6. Indexes

Already present: `idx_invoices_due_date`, `idx_bills_due_date`, `idx_payslips_pay_date`, and the voucher FK indexes (`idx_vouchers_invoice`, `idx_vouchers_bill`, `idx_vouchers_related_payslip`). `quotes.valid_until` is **not** indexed (only `idx_quotes_status` + `idx_quotes_issue_date`); `status='sent'` narrows the scan enough that we ship **without** a new index and only add `idx_quotes_valid_until` (a tiny migration) if QA shows it matters. No migration in this PR by default.

---

## Files touched

- `app/composables/useCalendarEvents.ts` — rewrite: range-driven, DB-backed, owns the month cursor; per-source `fetch*Events(from,to)` query fns + pure row→`CalendarEvent` builders; `windowEvents` ref + `fetchWindow` + `watch`; preserved return surface (`eventsByDate`, `allEvents`, per-kind) now window-scoped, plus new cursor/`reload`/`loading` exports.
- `app/components/UpcomingCalendar.vue` — accept cursor + nav handlers + `eventsByDate` (+ `loading`) via props; prop-or-self fallback so the dashboard embed still works standalone; drop its internal cursor state; grid cells read injected `eventsByDate`.
- `app/pages/calendar.vue` — collapse the two `useCalendarEvents()` instances into one; thread cursor/handlers into `UpcomingCalendar`; chip counts + summary read window-scoped per-kind arrays.
- (Dashboard page — no change expected; it renders `<UpcomingCalendar density="compact" />` which self-manages.)
- Remove now-dead store bulk-loads the calendar page used to trigger for these five stores (verify nothing else on the page needs them).

## Testing

- **Unit (pure):** the row→`CalendarEvent` builders (balance/overdue/shape) per source; the `windowRange` grid-range computation (42-day span from a cursor month, including leading/trailing months + DST-safe ISO). These are pure and table-testable.
- **Manual QA:** open `/calendar` and dashboard on the demo dataset (perceived speed); month-navigate forward/back (events change, counts update); kind chips toggle instantly (no flicker / no refetch); record a payment on an invoice due this month → `reload()`/remount drops it off; a quote expiring this month shows; overdue items render red; the dashboard compact embed still works with no page wiring.
- **Regression:** confirm no other consumer relied on `useCalendarEvents` returning all-time data, and that removing the calendar page's bulk store-loads doesn't blank any other widget on that page.

## Risks / call-outs

- **Async `eventsByDate`:** grid cells read a ref filled after an await, so the first paint shows an empty grid for ~one local query before events pop in. Acceptable (fast local SQLite); `loading` is available if we want a subtle skeleton.
- **Behavior change:** chip counts are now month-scoped (intended, §4).
- **Voucher-type fidelity:** the per-source sums must mirror each store's `balanceCentsFor` exactly — re-read those before writing queries (§2 note).
