<template>
	<div>
		<!-- Header: month nav on the left, label centred, today shortcut
			on the right. Pinned to a single row at all widths because
			the calendar grid sits underneath and reads as the focus. -->
		<div class="flex items-center justify-between gap-2 mb-3">
			<div class="flex items-center gap-1">
				<UButton
					size="sm"
					variant="ghost"
					color="neutral"
					icon="i-lucide-chevron-left"
					title="Previous month"
					aria-label="Previous month"
					@click="shiftMonth(-1)"
				/>
				<UButton
					size="sm"
					variant="ghost"
					color="neutral"
					icon="i-lucide-chevron-right"
					title="Next month"
					aria-label="Next month"
					@click="shiftMonth(1)"
				/>
				<UButton
					size="sm"
					variant="soft"
					color="neutral"
					:disabled="isCurrentMonth"
					@click="goToday"
				>
					Today
				</UButton>
			</div>
			<div class="text-base sm:text-lg font-medium tabular-nums">
				{{ monthLabel }}
			</div>
			<!-- Right slot kept for symmetry / future filter chip embed.
				Empty for now — the page-level filter strip lives on
				/calendar.vue, and the dashboard embed doesn't need any. -->
			<div class="min-w-0 w-[160px]" />
		</div>

		<!-- Day-of-week header row. Locale-fixed to en-US short names to
			match the rest of the app's date conventions; Sunday is the
			week start, matching the calendar component the rest of the
			app uses. -->
		<div class="grid grid-cols-7 text-[11px] font-medium text-(--ui-text-muted) uppercase tracking-wider mb-1 select-none">
			<div v-for="d in WEEK_DAYS" :key="d" class="px-2 py-1">
				{{ d }}
			</div>
		</div>

		<!-- Cell grid. 6 rows × 7 cols = 42 cells. Outer rounded border +
			gap-px on a (--ui-border) background creates the 1px grid
			lines without us drawing them per-cell. -->
		<div class="grid grid-cols-7 gap-px bg-(--ui-border) rounded-md overflow-hidden border border-(--ui-border)">
			<!-- Each cell is both a left-click target (opens the day-detail
				modal) and a right-click target (UContextMenu offers the
				same Quote / Invoice / Bill / Payslip shortcuts the modal
				footer has, scoped to this cell's date). -->
			<UContextMenu
				v-for="cell in cells"
				:key="cell.date"
				:items="cellMenuItems(cell)"
			>
				<button
					type="button"
					class="text-left p-1.5 flex flex-col gap-1 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-(--ui-primary) w-full"
					:class="cellClass(cell)"
					:style="{ minHeight: `${cellHeight}px` }"
					@click="openDay(cell)"
				>
					<div class="flex items-center justify-between gap-1">
						<span
							class="text-xs tabular-nums leading-none px-1 py-0.5 rounded"
							:class="dayLabelClass(cell)"
						>
							{{ cell.day }}
						</span>
						<span
							v-if="cell.overdueCount > 0"
							class="text-[10px] leading-none px-1 py-0.5 rounded bg-(--ui-error)/15 text-(--ui-error) font-medium"
							:title="`${cell.overdueCount} overdue`"
						>
							!{{ cell.overdueCount }}
						</span>
					</div>
					<div class="flex-1 min-h-0 space-y-0.5 overflow-hidden">
						<div
							v-for="e in cell.events.slice(0, maxEventsPerCell)"
							:key="e.id"
							class="text-[10px] leading-tight truncate rounded px-1 py-0.5 font-medium cursor-pointer hover:brightness-95"
							:class="pillClass(e)"
							:title="`${EVENT_KIND_META[e.kind].label} · ${e.title} · ${e.party} · ${formatLKR(e.balanceCents)}`"
							@click.stop="navigateTo(e)"
						>
							{{ e.title }}
						</div>
						<div
							v-if="cell.events.length > maxEventsPerCell"
							class="text-[10px] text-(--ui-text-muted) px-1 leading-tight"
						>
							+{{ cell.events.length - maxEventsPerCell }} more
						</div>
					</div>
				</button>
			</UContextMenu>
		</div>

		<!-- Day-detail modal: opens on cell click. Lists every event for
			the day with full context (kind, party, amount, overdue
			badge). Clicking an event navigates to its detail page.
			Footer carries quick-create shortcuts so the user can spin
			off a new quote / invoice / bill / payslip without leaving
			the calendar flow. -->
		<UModal v-model:open="dayOpen" :title="selectedDayLabel">
			<template #body>
				<div v-if="selectedDayEvents.length === 0" class="py-6 flex flex-col items-center gap-2 text-sm text-(--ui-text-muted)">
					<UIcon name="i-lucide-calendar" class="size-8 opacity-50" />
					<span>Nothing's due on this day.</span>
				</div>
				<ul v-else class="divide-y divide-(--ui-border)">
					<li
						v-for="e in selectedDayEvents"
						:key="e.id"
						class="py-3 px-2 -mx-2 rounded hover:bg-(--ui-bg-elevated) cursor-pointer transition"
						@click="navigateAndClose(e)"
					>
						<div class="flex items-start gap-3">
							<div
								class="size-8 rounded-md flex items-center justify-center shrink-0"
								:class="iconBgClass(e)"
							>
								<UIcon :name="EVENT_KIND_META[e.kind].icon" class="size-4" />
							</div>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="text-xs text-(--ui-text-muted) uppercase tracking-wider">
										{{ EVENT_KIND_META[e.kind].label }}
									</span>
									<span v-if="e.overdue" class="text-[10px] px-1.5 py-0.5 rounded bg-(--ui-error)/15 text-(--ui-error) font-medium">
										Overdue
									</span>
								</div>
								<div class="font-medium tabular-nums truncate">
									{{ e.title }}
								</div>
								<div class="text-xs text-(--ui-text-muted) truncate">
									{{ e.party }}
								</div>
							</div>
							<div class="text-right shrink-0">
								<div class="text-sm font-medium tabular-nums" :class="e.overdue ? 'text-(--ui-error)' : ''">
									{{ formatLKR(e.balanceCents) }}
								</div>
								<div v-if="e.balanceCents !== e.amountCents" class="text-[10px] text-(--ui-text-muted) tabular-nums">
									of {{ formatLKR(e.amountCents) }}
								</div>
							</div>
						</div>
					</li>
				</ul>
			</template>
			<template #footer>
				<div class="w-full">
					<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) mb-2">
						Create on this day
					</div>
					<div class="flex flex-wrap gap-2">
						<UButton
							v-for="action in createActions"
							:key="action.label"
							size="sm"
							variant="soft"
							color="neutral"
							:icon="action.icon"
							@click="action.onSelect"
						>
							{{ action.label }}
						</UButton>
					</div>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
// UpcomingCalendar — month-grid view of every due-date event sourced
// from useCalendarEvents. Two densities:
//
//   - density="full": for the standalone /calendar page. Cells are
//     taller and show more pills before the "+N more" rollup.
//   - density="compact": for the dashboard embed. Half the vertical
//     room, two pills per cell max.
//
// The hand-rolled grid keeps the look consistent with the app's other
// SVG charts (no Chart.js / FullCalendar / VCal dep). Cell layout is
// declarative: 42 cells = 6 weeks (always), leading/trailing days from
// adjacent months fill the partial first/last weeks so the grid stays
// rectangular.

	import type { CalendarEvent, CalendarEventKind } from "~/composables/useCalendarEvents";
	import { EVENT_KIND_META, useCalendarEvents } from "~/composables/useCalendarEvents";
	import { formatLKR } from "~/lib/money";

	const props = withDefaults(defineProps<{
		density?: "full" | "compact"
		/** Reactive set of kinds to include. Empty / undefined = show all. */
		kindFilter?: Set<CalendarEventKind>
	}>(), {
		density: "full",
		kindFilter: undefined
	});

	const router = useRouter();

	// Density-driven cell sizing. Keeping the day-pill rendering identical
	// across densities — only the per-cell height and max-event count
	// differ. Bumping these are the natural knobs to tune the look later.
	const cellHeight = computed(() => (props.density === "compact" ? 76 : 116));
	const maxEventsPerCell = computed(() => (props.density === "compact" ? 2 : 4));

	// Days-of-week header. en-US short names, Sunday-first to match the
	// other date pickers (UCalendar default). Locale handling can be
	// upgraded later if needed.
	const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	// Anchor month state: year + 0-indexed month. We use plain numbers
	// rather than ISO strings so month arithmetic doesn't have to wrap
	// year boundaries manually — `new Date(year, month + delta, 1)`
	// auto-normalises.
	const today = new Date();
	const cursorYear = ref(today.getFullYear());
	const cursorMonth = ref(today.getMonth());

	const shiftMonth = (delta: number) => {
		const d = new Date(cursorYear.value, cursorMonth.value + delta, 1);
		cursorYear.value = d.getFullYear();
		cursorMonth.value = d.getMonth();
	};

	const goToday = () => {
		const now = new Date();
		cursorYear.value = now.getFullYear();
		cursorMonth.value = now.getMonth();
	};

	const isCurrentMonth = computed(() => {
		const now = new Date();
		return cursorYear.value === now.getFullYear() && cursorMonth.value === now.getMonth();
	});

	const monthLabel = computed(() =>
		new Date(cursorYear.value, cursorMonth.value, 1)
			.toLocaleDateString("en-US", { month: "long", year: "numeric" })
	);

	// Event data — reactive to filter changes. The composable handles
	// kind filtering when a non-empty set is provided; we just thread the
	// prop through.
	const filterRef = computed(() => props.kindFilter ?? new Set<CalendarEventKind>());
	const { eventsByDate } = useCalendarEvents(filterRef);

	// One cell per grid slot: 6 rows × 7 cols. Leading days come from the
	// previous month so the first row starts on Sunday; trailing days fill
	// out the last partial row from the next month. inMonth=false dims
	// those cells.
	interface Cell {
		date: string
		day: number
		inMonth: boolean
		isToday: boolean
		events: CalendarEvent[]
		overdueCount: number
	}

	const toISO = (d: Date): string =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

	const cells = computed<Cell[]>(() => {
		const firstOfMonth = new Date(cursorYear.value, cursorMonth.value, 1);
		const startDow = firstOfMonth.getDay(); // 0=Sun
		const todayStr = todayISO();
		const result: Cell[] = [];
		for (let i = 0; i < 42; i++) {
			const d = new Date(cursorYear.value, cursorMonth.value, 1 - startDow + i);
			const iso = toISO(d);
			const events = eventsByDate.value.get(iso) ?? [];
			const overdueCount = events.reduce((n, e) => n + (e.overdue ? 1 : 0), 0);
			result.push({
				date: iso,
				day: d.getDate(),
				inMonth: d.getMonth() === cursorMonth.value && d.getFullYear() === cursorYear.value,
				isToday: iso === todayStr,
				events,
				overdueCount
			});
		}
		return result;
	});

	// --- Day-modal state ---------------------------------------------------
	const dayOpen = ref(false);
	const selectedDate = ref<string>("");
	const selectedDayEvents = computed<CalendarEvent[]>(() =>
		(selectedDate.value && eventsByDate.value.get(selectedDate.value)) || []
	);
	const selectedDayLabel = computed(() => {
		if (!selectedDate.value) return "";
		const [y, m, d] = selectedDate.value.split("-").map(Number);
		return new Date(y!, (m ?? 1) - 1, d ?? 1)
			.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
	});

	const openDay = (cell: Cell) => {
		selectedDate.value = cell.date;
		dayOpen.value = true;
	};

	const navigateTo = (e: CalendarEvent) => {
		void router.push(e.href);
	};
	const navigateAndClose = (e: CalendarEvent) => {
		dayOpen.value = false;
		void router.push(e.href);
	};

	// Document types the user can spin off from a calendar date. Both
	// the day-detail modal's footer buttons and the right-click context
	// menu on each cell render off this list — `createForDate` does the
	// routing.
	//
	// - Quote / Invoice / Bill route to their list page with `?new=1`,
	//   which auto-opens the New modal. The picked date threads through
	//   as `?issued=YYYY-MM-DD` → becomes the draft's issue_date.
	//   valid_until / due_date derive from issue + settings defaults.
	// - Voucher routes to the full /vouchers/new page (no modal — too
	//   many fields to fit one) with `?date=YYYY-MM-DD` → becomes the
	//   voucher_date.
	//
	// Payslip is intentionally omitted: its cycle math derives period
	// dates from the cycle template, so a free-form picked date isn't
	// directly meaningful. Users go via the Payroll page for those.
	interface CreateKind {
		label: string
		icon: string
		buildPath: (date: string | null) => string
	}
	const CREATE_KINDS: ReadonlyArray<CreateKind> = [
		{
			label: "Quote",
			icon: "i-lucide-file-text",
			buildPath: (d) => `/quotes?new=1${d ? `&issued=${d}` : ""}`
		},
		{
			label: "Invoice",
			icon: "i-lucide-receipt",
			buildPath: (d) => `/invoices?new=1${d ? `&issued=${d}` : ""}`
		},
		{
			label: "Bill",
			icon: "i-lucide-file-input",
			buildPath: (d) => `/bills?new=1${d ? `&issued=${d}` : ""}`
		},
		{
			label: "Voucher",
			icon: "i-lucide-ticket",
			buildPath: (d) => `/vouchers/new${d ? `?date=${d}` : ""}`
		}
	];

	const createForDate = (kind: CreateKind, date: string | null) => {
		dayOpen.value = false;
		void router.push(kind.buildPath(date));
	};

	// Day-detail modal footer: route off the currently-open day.
	const createActions = computed(() =>
		CREATE_KINDS.map((kind) => ({
			label: kind.label,
			icon: kind.icon,
			onSelect: () => createForDate(kind, selectedDate.value || null)
		}))
	);

	// Per-cell right-click menu. Same actions as the modal footer but
	// scoped to that cell's date — lets the user create from the grid
	// without having to open the modal first.
	const cellMenuItems = (cell: Cell) =>
		CREATE_KINDS.map((kind) => ({
			label: `New ${kind.label.toLowerCase()}`,
			icon: kind.icon,
			onSelect: () => createForDate(kind, cell.date)
		}));

	// --- Styling helpers ---------------------------------------------------
	// Out-of-month cells dim down a notch; today gets a primary-tinted
	// pill on the date number. Hover lifts to bg-elevated.
	const cellClass = (cell: Cell) => {
		if (!cell.inMonth) return "bg-(--ui-bg-muted) hover:bg-(--ui-bg-elevated) opacity-60";
		return "bg-(--ui-bg) hover:bg-(--ui-bg-elevated)";
	};
	const dayLabelClass = (cell: Cell) => {
		if (cell.isToday) return "bg-(--ui-primary) text-(--ui-primary-contrast) font-semibold";
		if (!cell.inMonth) return "text-(--ui-text-muted)";
		return "text-(--ui-text)";
	};

	// Pill colour: kind-tinted bg + text. Overdue events override to
	// error red regardless of kind so they're impossible to miss.
	const pillClass = (e: CalendarEvent) => {
		if (e.overdue) return "bg-(--ui-error)/15 text-(--ui-error)";
		const c = EVENT_KIND_META[e.kind].color;
		switch (c) {
		case "success": return "bg-(--ui-success)/15 text-(--ui-success)";
		case "warning": return "bg-(--ui-warning)/15 text-(--ui-warning)";
		case "info": return "bg-(--ui-info)/15 text-(--ui-info)";
		case "primary": return "bg-(--ui-primary)/15 text-(--ui-primary)";
		}
	};

	// Same colour token as the pill, used for the round icon chip in the
	// day-detail modal.
	const iconBgClass = (e: CalendarEvent) => {
		if (e.overdue) return "bg-(--ui-error)/15 text-(--ui-error)";
		const c = EVENT_KIND_META[e.kind].color;
		switch (c) {
		case "success": return "bg-(--ui-success)/15 text-(--ui-success)";
		case "warning": return "bg-(--ui-warning)/15 text-(--ui-warning)";
		case "info": return "bg-(--ui-info)/15 text-(--ui-info)";
		case "primary": return "bg-(--ui-primary)/15 text-(--ui-primary)";
		}
	};
</script>
