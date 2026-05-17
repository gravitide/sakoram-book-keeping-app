<template>
	<div class="relative">
		<UInput
			:model-value="display"
			:disabled="disabled"
			:placeholder="placeholder"
			class="w-full"
			:ui="{ base: 'text-right', leading: 'ps-1.5' }"
			@input="onInput"
			@focus="onFocus"
			@blur="onBlur"
		>
			<template v-if="showCurrency" #leading>
				<span class="text-xs text-(--ui-text-muted) pl-1">{{ currency.code }}</span>
			</template>
		</UInput>
		<div v-if="!focused && modelValue !== 0" class="sr-only">
			{{ formatted }}
		</div>
	</div>
</template>

<script setup lang="ts">
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR, toCents } from "~/lib/money";

	const props = withDefaults(defineProps<Props>(), {
		disabled: false,
		placeholder: "0.00",
		showCurrency: true
	});

	const emit = defineEmits<{ "update:modelValue": [value: number] }>();

	const currency = useActiveCurrency();

	// MoneyInput: v-model is INTEGER CENTS. The user sees rupees with 2 decimals.
	// The component never lets float arithmetic touch the bound value — every
	// keystroke goes through toCents() which is integer-safe.

	interface Props {
		modelValue: number // cents
		disabled?: boolean
		placeholder?: string
		showCurrency?: boolean
	}
	// Internal display string. We don't reformat on every keystroke (would jump
	// the cursor), only on blur. On focus we show the editable rupee form.
	const display = ref<string>(centsToRupeeString(props.modelValue));
	const focused = ref(false);

	function centsToRupeeString(c: number): string {
		if (!Number.isInteger(c)) return "";
		const sign = c < 0 ? "-" : "";
		const abs = Math.abs(c);
		const r = Math.floor(abs / 100);
		const cs = abs % 100;
		return `${sign}${r}.${cs.toString().padStart(2, "0")}`;
	}

	watch(() => props.modelValue, (v) => {
		if (!focused.value) display.value = centsToRupeeString(v);
	});

	const onInput = (event: Event) => {
		const raw = (event.target as HTMLInputElement).value;
		display.value = raw;
		try {
			emit("update:modelValue", toCents(raw));
		} catch {
		// invalid in-progress input; don't bubble. blur will fix it.
		}
	};

	const onBlur = () => {
		focused.value = false;
		display.value = centsToRupeeString(props.modelValue);
	};

	const onFocus = () => {
		focused.value = true;
	};

	const formatted = computed(() => formatLKR(props.modelValue));
</script>
