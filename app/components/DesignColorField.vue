<template>
	<!-- One row of swatches: Accent (the business's PDF colour, so it follows a
		later change of accent), a few greys and white, then a custom colour. -->
	<div class="flex flex-wrap items-center gap-1.5" role="group" :aria-label="label">
		<button
			v-for="s in swatches"
			:key="s.value"
			type="button"
			class="size-6 shrink-0 rounded-full border-2 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
			:class="modelValue === s.value ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) hover:border-(--ui-text-muted)'"
			:style="{ backgroundColor: s.hex }"
			:title="s.label"
			:aria-label="s.label"
			:aria-pressed="modelValue === s.value"
			@click="emit('update:modelValue', s.value)"
		>
			<span v-if="s.value === 'accent'" class="block text-[9px] font-bold leading-none text-white">A</span>
		</button>
		<!-- Custom: the OS colour picker (offline, no dependency) hidden inside
			the swatch, like PdfColorRow. Committed on close, not on every move. -->
		<label
			class="size-6 shrink-0 rounded-full border-2 cursor-pointer transition relative overflow-hidden focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--ui-primary)"
			:class="isCustom ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) hover:border-(--ui-text-muted)'"
			:style="{ background: isCustom ? modelValue : 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)' }"
			title="A custom colour"
		>
			<input
				type="color"
				:value="currentHex"
				class="absolute inset-0 opacity-0 cursor-pointer"
				aria-label="Pick a custom colour"
				@change="onPick"
			>
		</label>
		<span v-if="isCustom" class="text-[11px] text-(--ui-text-muted) tabular-nums">{{ modelValue }}</span>
	</div>
</template>

<script setup lang="ts">
	// A page designer item's colour (text, page number, line): "accent" or a
	// fixed #rrggbb (page-design.ts DesignColor).
	import type { DesignColor } from "~/lib/page-design";
	import { BODY, HAIRLINE, INK, MUTED } from "~/lib/design-templates";

	const props = withDefaults(defineProps<{
		modelValue: DesignColor
		/** The business's PDF colour, to paint the Accent swatch. */
		accentHex: string
		label?: string
	}>(), { label: "Colour" });
	const emit = defineEmits<{ "update:modelValue": [value: DesignColor] }>();

	const swatches = computed(() => [
		{ value: "accent" as DesignColor, hex: props.accentHex, label: "Accent — the business's PDF colour" },
		{ value: INK as DesignColor, hex: INK, label: "Ink" },
		{ value: BODY as DesignColor, hex: BODY, label: "Body text" },
		{ value: MUTED as DesignColor, hex: MUTED, label: "Muted" },
		{ value: HAIRLINE as DesignColor, hex: HAIRLINE, label: "Hairline" },
		{ value: "#ffffff" as DesignColor, hex: "#ffffff", label: "White" }
	]);
	const isCustom = computed(() => !swatches.value.some((s) => s.value === props.modelValue));
	const currentHex = computed(() => (props.modelValue === "accent" ? props.accentHex : props.modelValue));

	const onPick = (e: Event) => {
		const hex = (e.target as HTMLInputElement).value.toLowerCase();
		if (/^#[0-9a-f]{6}$/.test(hex)) emit("update:modelValue", hex as DesignColor);
	};
</script>
