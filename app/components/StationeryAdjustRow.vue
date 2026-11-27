<template>
	<div>
		<!-- Same label treatment as PdfColorRow's "Colour", so the two read as
			sibling groups when a card stacks them. -->
		<div v-if="heading" class="text-sm font-medium">
			{{ heading }}
		</div>
		<p v-if="description" class="text-xs text-(--ui-text-muted) mt-0.5">
			{{ description }}
		</p>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2" :class="heading || description ? 'mt-2' : ''">
			<UButton
				icon="i-lucide-pencil-ruler"
				variant="soft"
				:color="attention ? 'warning' : 'neutral'"
				size="sm"
				@click="emit('adjust')"
			>
				{{ label }}
			</UButton>
			<span v-if="!margins && summary" class="text-xs text-(--ui-text-muted) tabular-nums" :title="summaryTitle">
				{{ summary }}
			</span>
		</div>
		<!-- The margins as a picture, under the button that changes them. -->
		<StationeryMarginDiagram v-if="margins" class="mt-3" :margins="margins" />
	</div>
</template>

<script setup lang="ts">
	// The one way into the Stationery editor from a mode's options on
	// /settings/pdf: the button, and what it adjusts — either the four
	// Safe-area margins as a small diagram (`margins`) or one line of text
	// (`summary`, used for Pre-printed paper's bands). The page owns the editor.
	import type { StationeryMarginsMm } from "~/lib/stationery";

	defineProps<{
		/** Optional group label above the row (e.g. "Safe area"). */
		heading?: string
		/** One line under the heading saying what the group is. */
		description?: string
		label: string
		/** Draw these margins as a diagram under the button. */
		margins?: StationeryMarginsMm
		/** Text summary beside the button, when there's no diagram. */
		summary?: string
		/** Tooltip on the summary (e.g. "Top / right / bottom / left"). */
		summaryTitle?: string
		/** The editor has something to check on the picked sheet (stationeryReview). */
		attention?: boolean
	}>();
	const emit = defineEmits<{ adjust: [] }>();
</script>
