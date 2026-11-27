<template>
	<div>
		<div class="flex items-baseline gap-2 mb-2">
			<span class="text-sm font-medium">Colour</span>
			<span class="text-xs text-(--ui-text-muted) truncate">{{ selectedLabel }}</span>
		</div>
		<!-- The eight presets (the Theme colour picker's set on
			/settings/appearance), then the custom swatch + hex field. One wrapping
			row; each preset's name is its tooltip and accessible name, and the
			selected one is named beside the label above. -->
		<div class="flex flex-wrap items-center gap-x-2 gap-y-3" role="group" aria-label="PDF colour">
			<button
				v-for="c in THEME_COLORS"
				:key="c.value"
				type="button"
				class="size-7 shrink-0 rounded-full border-2 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
				:class="modelValue === c.value ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) hover:border-(--ui-text-muted)'"
				:style="{ backgroundColor: c.hex }"
				:title="c.label"
				:aria-label="c.label"
				:aria-pressed="modelValue === c.value"
				@click="emit('update:modelValue', c.value)"
			/>
			<span class="hidden sm:block mx-1 h-6 w-px bg-(--ui-border)" aria-hidden="true" />
			<!-- Custom accent: the same field as the presets, as a literal hex, so
				dirty tracking, save and the live preview work unchanged. The native
				colour input (the OS picker — no dependency, works offline) hides
				inside the swatch so it looks like the presets; the hex field is for
				pasting an exact brand colour. Swatch and field wrap together. -->
			<span class="flex items-center gap-2">
				<label
					class="size-7 shrink-0 rounded-full border-2 cursor-pointer transition relative overflow-hidden focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--ui-primary)"
					:class="isCustom ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) hover:border-(--ui-text-muted)'"
					:style="{ backgroundColor: hex }"
					title="Pick a custom colour"
				>
					<input
						v-model="colorWell"
						type="color"
						class="absolute inset-0 opacity-0 cursor-pointer"
						aria-label="Pick a custom colour"
					>
				</label>
				<UInput
					:model-value="hexDraft"
					placeholder="#1d4ed8"
					size="sm"
					class="w-28"
					aria-label="Custom colour hex"
					@update:model-value="onHexInput(String($event))"
				/>
			</span>
		</div>
		<p v-if="hint" class="text-xs text-(--ui-text-muted) mt-2">
			{{ hint }}
		</p>
	</div>
</template>

<script setup lang="ts">
	// The PDF accent colour (company_settings.pdf_theme_color): one compact row,
	// shared by every Stationery mode's options on /settings/pdf. Under Built-in
	// it colours the accent lines; under every mode it tints the highlighted
	// totals in statements and reports, so each mode's section carries it. Bound to the page form; saving is the page's.
	import { isHexColor, THEME_COLORS, themeHex } from "~/lib/theme";

	const props = defineProps<{
		/** A preset name ("green") or a literal "#rrggbb". */
		modelValue: string | null | undefined
		/** One line under the row. */
		hint?: string
	}>();
	const emit = defineEmits<{ "update:modelValue": [value: string] }>();

	const hex = computed(() => themeHex(props.modelValue));
	// A custom accent is stored as a literal hex in the same column, so the
	// presets' `=== c.value` comparison deselects on its own.
	const isCustom = computed(() => isHexColor(props.modelValue));
	const selectedLabel = computed(() => (isCustom.value
		? `Custom ${hex.value}`
		: THEME_COLORS.find((c) => c.value === props.modelValue)?.label ?? ""));

	// The colour well always needs a concrete #rrggbb, even while a preset is
	// selected, so it opens the OS picker on the current colour, not black.
	const colorWell = computed({
		get: () => hex.value,
		set: (v: string) => emit("update:modelValue", v.toLowerCase())
	});

	// Free text while typing; committed only once it's a valid hex, so a
	// half-typed "#1d" never becomes the stored value.
	const hexDraft = ref("");
	watch(() => props.modelValue, (v) => {
		if (isHexColor(v)) hexDraft.value = String(v).toLowerCase();
	}, { immediate: true });
	const onHexInput = (v: string) => {
		hexDraft.value = v;
		if (isHexColor(v)) emit("update:modelValue", v.trim().toLowerCase());
	};
</script>
