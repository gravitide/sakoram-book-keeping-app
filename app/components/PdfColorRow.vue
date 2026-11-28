<template>
	<div>
		<div class="flex items-baseline justify-between gap-2 mb-1.5">
			<span :id="labelId" class="text-[11px] font-medium text-(--ui-text-muted)">Accent colour</span>
			<span class="text-[11px] text-(--ui-text-muted) tabular-nums truncate">{{ selectedLabel }}</span>
		</div>
		<!-- One row: the eight presets (the Theme colour set on
			/settings/appearance), then a colour wheel for anything else. Each
			swatch's name is its tooltip and accessible name. -->
		<div class="flex items-center justify-between" role="group" :aria-labelledby="labelId">
			<button
				v-for="c in THEME_COLORS"
				:key="c.value"
				type="button"
				class="size-6 shrink-0 rounded-full transition cursor-pointer ring-offset-2 ring-offset-(--ui-bg) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--ui-primary)"
				:class="modelValue === c.value ? 'ring-2 ring-(--ui-text)' : 'hover:ring-2 hover:ring-(--ui-border-accented)'"
				:style="{ backgroundColor: c.hex }"
				:title="c.label"
				:aria-label="c.label"
				:aria-pressed="modelValue === c.value"
				@click="emit('update:modelValue', c.value)"
			/>
			<!-- Custom: the OS colour picker (it takes a typed hex too) hidden
				inside a colour-wheel swatch. Committed when the picker closes, so a
				pick is one change, not one per step of the drag. -->
			<label
				class="relative size-6 shrink-0 rounded-full cursor-pointer transition ring-offset-2 ring-offset-(--ui-bg) focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-(--ui-primary)"
				:class="isCustom ? 'ring-2 ring-(--ui-text)' : 'hover:ring-2 hover:ring-(--ui-border-accented)'"
				:style="{ background: 'conic-gradient(from 90deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)' }"
				:title="isCustom ? `Custom ${hex} — pick another` : 'Pick a custom colour'"
			>
				<span
					v-if="isCustom"
					class="absolute inset-1.5 rounded-full ring-2 ring-white"
					:style="{ backgroundColor: hex }"
					aria-hidden="true"
				/>
				<input
					type="color"
					:value="hex"
					class="absolute inset-0 size-full opacity-0 cursor-pointer"
					aria-label="Pick a custom colour"
					@change="onPick"
				>
			</label>
		</div>
		<p v-if="hint" class="text-xs text-(--ui-text-muted) mt-2">
			{{ hint }}
		</p>
	</div>
</template>

<script setup lang="ts">
	// The PDF accent colour (company_settings.pdf_theme_color), in the page
	// designer's Document panel: the presets in one row and a colour wheel for a
	// custom one. It colours the highlighted totals in statements and reports
	// and any design item set to Accent.
	import { isHexColor, THEME_COLORS, themeHex } from "~/lib/theme";

	const props = defineProps<{
		/** A preset name ("green") or a literal "#rrggbb". */
		modelValue: string | null | undefined
		/** One line under the row. */
		hint?: string
	}>();
	const emit = defineEmits<{ "update:modelValue": [value: string] }>();

	const labelId = useId();
	const hex = computed(() => themeHex(props.modelValue));
	// A custom accent is stored as a literal hex in the same column, so the
	// presets' `=== c.value` comparison deselects on its own.
	const isCustom = computed(() => isHexColor(props.modelValue));
	const selectedLabel = computed(() => (isCustom.value
		? `Custom ${hex.value}`
		: THEME_COLORS.find((c) => c.value === props.modelValue)?.label ?? ""));

	const onPick = (e: Event) => {
		const value = (e.target as HTMLInputElement).value.toLowerCase();
		if (isHexColor(value)) emit("update:modelValue", value);
	};
</script>
