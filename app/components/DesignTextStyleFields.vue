<template>
	<div class="space-y-3">
		<div>
			<div class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
				Font
			</div>
			<USelectMenu
				:model-value="modelValue.font"
				:items="[...DESIGN_FONTS]"
				:search-input="false"
				size="sm"
				class="w-full"
				@update:model-value="set('font', $event as DesignFont)"
			>
				<template #default>
					<span :style="{ fontFamily: `'${modelValue.font}'` }">{{ modelValue.font }}</span>
				</template>
				<template #item-label="{ item }">
					<span :style="{ fontFamily: `'${item}'` }">{{ item }}</span>
				</template>
			</USelectMenu>
		</div>

		<div class="flex items-end gap-2">
			<div class="w-24 shrink-0">
				<div class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
					Size (pt)
				</div>
				<UInputNumber
					:model-value="modelValue.size"
					:min="4"
					:max="96"
					:step="0.5"
					size="sm"
					@update:model-value="onSize"
				/>
			</div>
			<div class="segmented" role="group" aria-label="Weight and slant">
				<button type="button" title="Bold" aria-label="Bold" :aria-pressed="modelValue.bold" @click="set('bold', !modelValue.bold)">
					<UIcon name="i-lucide-bold" class="size-3.5" />
				</button>
				<button type="button" title="Italic" aria-label="Italic" :aria-pressed="modelValue.italic" @click="set('italic', !modelValue.italic)">
					<UIcon name="i-lucide-italic" class="size-3.5" />
				</button>
			</div>
			<div class="segmented flex-1" role="group" aria-label="Alignment">
				<button
					v-for="a in ALIGNS"
					:key="a.value"
					type="button"
					:title="a.label"
					:aria-label="a.label"
					:aria-pressed="modelValue.align === a.value"
					@click="set('align', a.value)"
				>
					<UIcon :name="a.icon" class="size-3.5" />
				</button>
			</div>
		</div>

		<div>
			<div class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
				Colour
			</div>
			<DesignColorField :model-value="modelValue.color" :accent-hex="accentHex" label="Text colour" @update:model-value="set('color', $event)" />
		</div>
	</div>
</template>

<script setup lang="ts">
	// The look of a page designer text box or page number (page-design.ts
	// TextStyle): font, size, bold / italic, alignment and colour. Emits the
	// whole new style; `merge` is set for the size field so stepping it is
	// one undo step (design-history.ts).
	import type { DesignFont, TextAlign, TextStyle } from "~/lib/page-design";
	import { DESIGN_FONTS } from "~/lib/page-design";

	const props = defineProps<{
		modelValue: TextStyle
		/** The business's PDF colour, for the Accent swatch. */
		accentHex: string
	}>();
	const emit = defineEmits<{ "update:modelValue": [value: TextStyle, merge?: string] }>();

	const ALIGNS: { value: TextAlign, label: string, icon: string }[] = [
		{ value: "left", label: "Align left", icon: "i-lucide-align-left" },
		{ value: "center", label: "Align centre", icon: "i-lucide-align-center" },
		{ value: "right", label: "Align right", icon: "i-lucide-align-right" }
	];

	const set = <K extends keyof TextStyle>(key: K, value: TextStyle[K], merge?: string) =>
		emit("update:modelValue", { ...props.modelValue, [key]: value }, merge);
	const onSize = (value: number | null | undefined) => {
		if (typeof value === "number" && Number.isFinite(value) && value > 0) set("size", value, "size");
	};
</script>
