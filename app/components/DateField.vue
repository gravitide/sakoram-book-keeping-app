<template>
	<UInputDate
		ref="inputRef"
		:model-value="cdValue"
		:disabled="disabled"
		:placeholder="placeholder"
		@update:model-value="onUpdate"
	>
		<template #trailing>
			<UPopover :reference="popoverReference">
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
					<UCalendar :model-value="cdValue" class="p-2" @update:model-value="onUpdate" />
				</template>
			</UPopover>
		</template>
	</UInputDate>
</template>

<script setup lang="ts">
// ISO-string ↔ CalendarDate adapter for `<UInputDate>` (NuxtUI 4).
//
// We keep the rest of the codebase using plain `YYYY-MM-DD` strings (DB
// columns, store types, PDF payloads — they're all ISO) so the v-model
// here is `string | null`. The conversion to/from `CalendarDate` happens
// in this one component.
//
// The popover-with-calendar pattern follows the official NuxtUI docs
// recipe: the calendar lives in the trailing slot via UPopover, anchored
// to the year segment's element so it lines up under the input.

	import type { CalendarDate } from "@internationalized/date";
	import type { ComponentPublicInstance } from "vue";
	import { parseDate } from "@internationalized/date";

	interface Props {
		modelValue: string | null
		disabled?: boolean
		placeholder?: string
	}

	const props = defineProps<Props>();
	const emit = defineEmits<{
		"update:modelValue": [value: string | null]
	}>();

	// CalendarDate uses calendar-specific year/month/day (1-indexed for both
	// month and day) and serialises back to "YYYY-MM-DD" via toString().
	const isoToCalendarDate = (iso: string | null): CalendarDate | null => {
		if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
		try {
			return parseDate(iso);
		} catch {
			return null;
		}
	};

	const cdValue = computed<CalendarDate | null>(() => isoToCalendarDate(props.modelValue));

	const onUpdate = (next: CalendarDate | null | undefined) => {
		emit("update:modelValue", next ? next.toString() : null);
	};

	// The docs example anchors the popover to inputsRef[3] (the year segment).
	// We do the same — when the input mounts, grab the last segment's element
	// so the calendar opens flush with the right edge of the input.
	const inputRef = useTemplateRef<ComponentPublicInstance & { inputsRef: ComponentPublicInstance[] }>("inputRef");
	const popoverReference = computed<HTMLElement | undefined>(() => {
		const segments = inputRef.value?.inputsRef;
		if (!segments || segments.length === 0) return undefined;
		const last = segments[segments.length - 1];
		return (last?.$el as HTMLElement | undefined) ?? undefined;
	});
</script>
