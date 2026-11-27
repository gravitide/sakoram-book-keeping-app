<template>
	<div>
		<!-- Same label treatment as PdfColorRow's "Colour", so the two read as
			sibling groups when a card stacks them. -->
		<div v-if="heading" class="text-sm font-medium mb-2">
			{{ heading }}
		</div>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			<UButton
				icon="i-lucide-pencil-ruler"
				variant="soft"
				:color="attention ? 'warning' : 'neutral'"
				size="sm"
				@click="emit('adjust')"
			>
				{{ label }}
			</UButton>
			<span class="text-xs text-(--ui-text-muted) tabular-nums" :title="summaryTitle">
				{{ summary }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
	// The one way into the Stationery editor from a mode's options on
	// /settings/pdf: the button, and one line of what it adjusts (the Safe
	// area, or Pre-printed paper's bands). The page owns the editor itself.
	defineProps<{
		/** Optional group label above the row (e.g. "Safe area"). */
		heading?: string
		label: string
		summary: string
		/** Tooltip on the summary (e.g. "Top / right / bottom / left"). */
		summaryTitle?: string
		/** The editor has something to check on the picked sheet (stationeryReview). */
		attention?: boolean
	}>();
	const emit = defineEmits<{ adjust: [] }>();
</script>
