<template>
	<!-- Month + year quick-jump for the calendar popover. v-model is the
		calendar's `placeholder` (the currently-displayed month); changing a
		dropdown re-points it via CalendarDate.set(), which clamps the day so
		31 Jan -> Feb never produces an invalid date. Sits above the calendar's
		own arrow controls (matching the common date-picker pattern). -->
	<div class="flex items-center gap-2 mb-2">
		<USelect
			v-model="monthValue"
			:items="monthItems"
			value-key="value"
			class="flex-1"
			aria-label="Month"
		/>
		<USelect
			v-model="yearValue"
			:items="yearItems"
			class="w-24"
			aria-label="Year"
		/>
	</div>
</template>

<script setup lang="ts">
	import type { CalendarDate } from "@internationalized/date";

	const model = defineModel<CalendarDate>({ required: true });

	const MONTHS = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December"
	];
	const monthItems = MONTHS.map((label, i) => ({ label, value: i + 1 }));

	const monthValue = computed<number>({
		get: () => model.value.month,
		set: (m) => {
			model.value = model.value.set({ month: Number(m) });
		}
	});

	const yearValue = computed<number>({
		get: () => model.value.year,
		set: (y) => {
			model.value = model.value.set({ year: Number(y) });
		}
	});

	// Year range: a window around today that always includes the displayed
	// year (so a back-dated document's year is selectable). Generous either
	// side of "now" without an enormous list.
	const yearItems = computed<number[]>(() => {
		const now = new Date().getFullYear();
		const yr = model.value.year;
		const start = Math.min(now - 10, yr);
		const end = Math.max(now + 5, yr);
		const out: number[] = [];
		for (let y = start; y <= end; y++) out.push(y);
		return out;
	});
</script>
