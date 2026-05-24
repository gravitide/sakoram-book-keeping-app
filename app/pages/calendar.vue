<template>
	<div class="select-none">
		<!-- select-none on the page root: the calendar is for navigating
			and triaging due items, not copying text out of. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div class="min-w-0 flex-1">
				<h1 class="text-2xl font-semibold">
					Calendar
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					Upcoming receivables, payables, quote expiries and payslips — every due date in one place.
				</p>
			</div>
		</header>

		<UCard>
			<template #header>
				<!-- Filter chips — toggle each event kind on/off. Default
					= all kinds visible. The chip's coloured tone matches
					the pill colour on the grid so the visual language is
					consistent. -->
				<div class="flex items-center gap-2 flex-wrap">
					<UIcon name="i-lucide-filter" class="size-4 text-(--ui-text-muted) shrink-0" />
					<span class="text-xs text-(--ui-text-muted) mr-1">Show:</span>
					<button
						v-for="k in CALENDAR_EVENT_KINDS"
						:key="k"
						type="button"
						class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer inline-flex items-center gap-1.5"
						:class="chipClass(k)"
						@click="toggleKind(k)"
					>
						<UIcon :name="EVENT_KIND_META[k].icon" class="size-3.5" />
						{{ EVENT_KIND_META[k].label }}
						<span class="tabular-nums text-(--ui-text-muted)">·</span>
						<span class="tabular-nums">{{ countsByKind[k] }}</span>
					</button>
					<UButton
						v-if="kindFilter.size > 0 && kindFilter.size < CALENDAR_EVENT_KINDS.length"
						size="xs"
						variant="ghost"
						color="neutral"
						icon="i-lucide-x"
						class="ml-auto"
						@click="resetFilters"
					>
						Reset
					</UButton>
				</div>
			</template>

			<!-- Summary above the calendar: how many events the current
				filter is showing + how many are already overdue. Uses
				the same StatChip joined-pill design as the table summary
				bars on every list page (quotes / invoices / bills /
				vouchers) for a consistent at-a-glance feel. -->
			<div class="flex justify-end items-center mb-3 gap-2 flex-wrap">
				<StatChip
					v-if="overdueCount > 0"
					label="Overdue"
					color="error"
					:value="String(overdueCount)"
				/>
				<StatChip label="Shown" color="neutral" :value="String(visibleEvents.length)" />
			</div>

			<UpcomingCalendar density="full" :kind-filter="kindFilter" />
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { CalendarEventKind } from "~/composables/useCalendarEvents";
	import { CALENDAR_EVENT_KINDS, EVENT_KIND_META, useCalendarEvents } from "~/composables/useCalendarEvents";
	import { useBillsStore } from "~/stores/bills";
	import { useInvoicesStore } from "~/stores/invoices";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useQuotesStore } from "~/stores/quotes";

	definePageMeta({ title: "Calendar" });

	// Pre-warm every store the calendar reads from. These are normally
	// loaded by their list pages on first visit, so on a cold app start
	// the calendar would otherwise come up empty for a beat. Load them
	// here so the grid is populated on first render.
	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();
	const quotesStore = useQuotesStore();
	const payslipsStore = usePayslipsStore();

	await Promise.all([
		invoicesStore.load(),
		billsStore.load(),
		quotesStore.load(),
		payslipsStore.load()
	]);

	// Filter set drives which kinds the calendar component renders.
	// Empty = show all (matches the composable's contract). We seed it
	// empty so the page lands with everything visible.
	const kindFilter = ref(new Set<CalendarEventKind>());

	const toggleKind = (k: CalendarEventKind) => {
		const next = new Set(kindFilter.value);
		if (next.has(k)) next.delete(k);
		else next.add(k);
		kindFilter.value = next;
	};

	const resetFilters = () => {
		kindFilter.value = new Set();
	};

	// Per-kind counts use an UNFILTERED view so the chip badges always
	// show the full set ("how many of each are there"), not just the
	// filtered view. The visible/overdue summary line below uses the
	// filtered events.
	const allKinds = useCalendarEvents();
	const countsByKind = computed<Record<CalendarEventKind, number>>(() => ({
		invoice: allKinds.invoiceEvents.value.length,
		bill: allKinds.billEvents.value.length,
		quote: allKinds.quoteEvents.value.length,
		payslip: allKinds.payslipEvents.value.length
	}));

	const filtered = useCalendarEvents(kindFilter);
	const visibleEvents = computed(() => filtered.allEvents.value);
	const overdueCount = computed(() => visibleEvents.value.filter((e) => e.overdue).length);

	// Chip visual state: when the filter set is empty every chip is
	// "active" (no narrowing yet — all visible). When the user picks one
	// or more, only those are tinted; the rest dim down.
	const chipClass = (k: CalendarEventKind) => {
		const c = EVENT_KIND_META[k].color;
		const active = kindFilter.value.size === 0 || kindFilter.value.has(k);
		if (!active) return "bg-(--ui-bg) border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)";
		switch (c) {
		case "success": return "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success) hover:bg-(--ui-success)/25";
		case "warning": return "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning) hover:bg-(--ui-warning)/25";
		case "info": return "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info) hover:bg-(--ui-info)/25";
		case "primary": return "bg-(--ui-primary)/15 border-(--ui-primary)/40 text-(--ui-primary) hover:bg-(--ui-primary)/25";
		}
	};
</script>
