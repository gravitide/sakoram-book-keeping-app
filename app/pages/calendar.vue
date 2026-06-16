<template>
	<div class="select-none">
		<!-- select-none on the page root: the calendar is for navigating
			and triaging due items, not copying text out of. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div class="min-w-0 flex-1">
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Calendar
					<!-- Inline spinner while the first window fetch runs on
						first visit. Sits in the title row, not as an overlay,
						so the page stays interactive and sidebar nav keeps
						working while the data loads in the background. -->
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-4 animate-spin text-(--ui-primary)"
					/>
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					<span v-if="isLoading">Loading…</span>
					<template v-else>
						Upcoming receivables, payables, quote expiries and payslips — every due date in one place.
					</template>
				</p>
			</div>
		</header>

		<!-- Loading skeleton — content-shaped placeholders that mirror
			the real calendar's layout (filter chip strip + summary
			pill + 6×7 day grid). Mirrors the dashboard's approach:
			page reads as "loading" rather than "broken" while the
			first window fetch runs. Drops the moment isLoading flips. -->
		<UCard v-if="isLoading" class="animate-pulse">
			<template #header>
				<div class="flex items-center gap-2 flex-wrap">
					<div class="size-4 rounded bg-(--ui-bg-muted)" />
					<div class="h-3 w-10 rounded bg-(--ui-bg-muted)" />
					<div
						v-for="i in 4"
						:key="`chip-skel-${i}`"
						class="h-6 w-24 rounded-full bg-(--ui-bg-muted)"
					/>
				</div>
			</template>

			<!-- Summary placeholder. -->
			<div class="flex justify-end items-center mb-3 gap-2">
				<div class="h-6 w-28 rounded bg-(--ui-bg-muted)" />
			</div>

			<!-- Day-of-week header row -->
			<div class="grid grid-cols-7 gap-1 mb-1">
				<div
					v-for="i in 7"
					:key="`dow-skel-${i}`"
					class="h-4 rounded bg-(--ui-bg-muted)"
				/>
			</div>

			<!-- 6×7 month grid. Checker opacity gives the cells a tiny
				bit of texture so the grid reads as a calendar rather
				than a uniform slab. -->
			<div class="grid grid-cols-7 gap-1">
				<div
					v-for="n in 42"
					:key="`cell-skel-${n}`"
					class="aspect-square rounded bg-(--ui-bg-muted)"
					:class="(n + Math.floor((n - 1) / 7)) % 2 === 0 ? 'opacity-90' : 'opacity-60'"
				/>
			</div>
		</UCard>

		<UCard v-else>
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

			<UpcomingCalendar density="full" :kind-filter="kindFilter" :calendar="calendar" />
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { CalendarEventKind } from "~/composables/useCalendarEvents";
	import { CALENDAR_EVENT_KINDS, EVENT_KIND_META, useCalendarEvents } from "~/composables/useCalendarEvents";

	definePageMeta({ title: "Calendar" });

	// Filter set drives which kinds the calendar renders. Empty = show all
	// (matches the composable's contract). We seed it empty so the page
	// lands with everything visible.
	const kindFilter = ref(new Set<CalendarEventKind>());

	// One shared windowed calendar instance owns the month cursor and the
	// per-month DB fetch. Both this page (chip counts + summary) AND the
	// grid component below read from it, so they agree on the visible month
	// and the data is fetched exactly once per navigation. The calendar
	// queries scoped to the visible 42-day window — no store bulk-load here.
	const calendar = useCalendarEvents(kindFilter);

	// Skeleton shows until the first window fetch resolves, then never again:
	// month navigation refetches (calendar.loading toggles) must NOT collapse
	// the whole card back to the skeleton.
	const firstLoadDone = ref(false);
	watch(calendar.loading, (l) => {
		if (!l) firstLoadDone.value = true;
	}, { immediate: true });
	const isLoading = computed(() => !firstLoadDone.value);

	const toggleKind = (k: CalendarEventKind) => {
		const next = new Set(kindFilter.value);
		if (next.has(k)) next.delete(k);
		else next.add(k);
		kindFilter.value = next;
	};

	const resetFilters = () => {
		kindFilter.value = new Set();
	};

	// Per-kind counts read the window-scoped, kind-UNfiltered arrays so each
	// chip badge always shows its own kind's count for the visible month
	// ("how many of each are due this month"), regardless of which chips are
	// toggled. The visible/overdue summary below uses the filtered events.
	const countsByKind = computed<Record<CalendarEventKind, number>>(() => ({
		invoice: calendar.invoiceEvents.value.length,
		bill: calendar.billEvents.value.length,
		quote: calendar.quoteEvents.value.length,
		payslip: calendar.payslipEvents.value.length
	}));

	const visibleEvents = computed(() => calendar.allEvents.value);
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
