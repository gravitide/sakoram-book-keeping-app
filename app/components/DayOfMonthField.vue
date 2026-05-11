<template>
	<UFormField :label="label" :hint="hint">
		<div class="flex items-center gap-3">
			<UInputNumber
				:model-value="modelValue"
				:min="1"
				:max="31"
				class="w-32"
				@update:model-value="onValue"
			/>
			<UCheckbox
				:model-value="isLastDay"
				label="Last day of month"
				@update:model-value="onToggleLast"
			/>
		</div>
	</UFormField>
</template>

<script setup lang="ts">
// A day-of-month integer input with a convenience "Last day of month"
// toggle. 31 is the canonical "last day" value — `resolvePayrollCycle`
// clamps it to the actual month length at render time, so the user
// doesn't need to think about February etc.
//
// Used by the Payroll settings page. Keeping it as a standalone
// component because the same pattern will likely repeat in any future
// settings that take a day-of-month (e.g. invoice-due-day templates).

	interface Props {
		modelValue: number
		label: string
		hint?: string
	}

	const props = defineProps<Props>();
	const emit = defineEmits<{ "update:modelValue": [value: number] }>();

	const isLastDay = computed(() => props.modelValue === 31);

	const onValue = (v: number | undefined) => {
		if (typeof v !== "number" || Number.isNaN(v)) return;
		emit("update:modelValue", Math.min(31, Math.max(1, Math.round(v))));
	};

	const onToggleLast = (v: boolean) => {
		emit("update:modelValue", v ? 31 : Math.min(props.modelValue, 30));
	};
</script>
