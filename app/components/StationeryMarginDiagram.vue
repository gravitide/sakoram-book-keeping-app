<template>
	<!-- The four Safe-area margins as a picture rather than "t / r / b / l":
		the content in the middle, each margin on its own side with an arrow
		pointing at the page edge it measures to. -->
	<div
		class="inline-grid grid-cols-[auto_auto_auto] items-center gap-x-2 gap-y-1.5 text-xs text-(--ui-text-muted) tabular-nums"
		role="img"
		:aria-label="`Margins: top ${mm(margins.top)}, right ${mm(margins.right)}, bottom ${mm(margins.bottom)}, left ${mm(margins.left)}`"
	>
		<span />
		<span class="flex items-center justify-center gap-1">
			<UIcon name="i-lucide-arrow-up" class="size-3.5 shrink-0" aria-hidden="true" />
			{{ mm(margins.top) }}
		</span>
		<span />

		<span class="flex items-center justify-end gap-1">
			<UIcon name="i-lucide-arrow-left" class="size-3.5 shrink-0" aria-hidden="true" />
			{{ mm(margins.left) }}
		</span>
		<span
			class="w-24 h-14 rounded-sm border border-dashed border-(--ui-border-accented) bg-(--ui-bg-elevated) flex items-center justify-center text-[11px] text-(--ui-text-dimmed)"
			aria-hidden="true"
		>
			Content
		</span>
		<span class="flex items-center gap-1">
			{{ mm(margins.right) }}
			<UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
		</span>

		<span />
		<span class="flex items-center justify-center gap-1">
			<UIcon name="i-lucide-arrow-down" class="size-3.5 shrink-0" aria-hidden="true" />
			{{ mm(margins.bottom) }}
		</span>
		<span />
	</div>
</template>

<script setup lang="ts">
	// A compact picture of the Safe area's four margins (mm from each page
	// edge), shown under "Adjust margins & placement" on /settings/pdf.
	import type { StationeryMarginsMm } from "~/lib/stationery";
	import { formatMm } from "~/lib/stationery-geometry";

	defineProps<{ margins: StationeryMarginsMm }>();

	const mm = (value: number) => `${formatMm(value)} mm`;
</script>
