<template>
	<UInputDate
		:key="resetKey"
		:model-value="cdRange"
		range
		:disabled="disabled"
		@update:model-value="onUpdate"
	>
		<template #trailing>
			<UPopover>
				<UButton
					color="neutral"
					variant="link"
					size="sm"
					icon="i-lucide-calendar"
					aria-label="Open calendar"
					:disabled="disabled"
					class="px-0"
				/>
				<template #content>
					<UCalendar
						:model-value="cdRange"
						range
						class="p-2"
						@update:model-value="onUpdate"
					/>
				</template>
			</UPopover>
		</template>
	</UInputDate>
</template>

<script setup lang="ts">
// ISO-string ↔ CalendarDate adapter for `<UInputDate range>` (NuxtUI 4).
//
// Mirrors `DateField.vue` but exposes two v-models — `from` and `to` — both
// as ISO `YYYY-MM-DD` strings so callers stay string-based. Internally we
// bridge to a `{ start, end }` CalendarDate pair which is what UInputDate
// and UCalendar consume in `range` mode.

	import type { CalendarDate, DateValue } from "@internationalized/date";
	import { parseDate } from "@internationalized/date";

	interface Props {
		from: string | null
		to: string | null
		disabled?: boolean
	}

	const props = defineProps<Props>();
	const emit = defineEmits<{
		"update:from": [value: string | null]
		"update:to": [value: string | null]
	}>();

	const isoToCalendarDate = (iso: string | null): CalendarDate | null => {
		if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
		try {
			return parseDate(iso);
		} catch {
			return null;
		}
	};

	interface CDRange { start: CalendarDate | null, end: CalendarDate | null }

	const cdRange = computed<CDRange>(() => ({
		start: isoToCalendarDate(props.from),
		end: isoToCalendarDate(props.to)
	}));

	// UInputDate range mode keeps showing the last value even when given
	// `{start: null, end: null}` — its internal segment buffer doesn't
	// reset on prop change. Bumping a `:key` forces Vue to remount the
	// component when the parent clears both fields, which is the only
	// reliable way to wipe the visible segments without user interaction.
	const resetKey = ref(0);
	watch(
		() => [props.from, props.to] as const,
		([from, to]) => {
			if (!from && !to) resetKey.value++;
		}
	);

	const onUpdate = (next: { start?: DateValue | null, end?: DateValue | null } | null | undefined) => {
		const startVal = next?.start;
		const endVal = next?.end;
		emit("update:from", startVal ? startVal.toString() : null);
		emit("update:to", endVal ? endVal.toString() : null);
	};
</script>
