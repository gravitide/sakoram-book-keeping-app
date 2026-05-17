<template>
	<div
		v-if="total > 0"
		class="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-(--ui-border) text-sm"
	>
		<div class="text-(--ui-text-muted) tabular-nums">
			Showing <span class="text-(--ui-text) font-medium">{{ rangeStart }}–{{ rangeEnd }}</span>
			of <span class="text-(--ui-text) font-medium">{{ total }}</span>
		</div>
		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2">
				<span class="text-xs text-(--ui-text-muted)">Per page</span>
				<USelect
					:model-value="pageSize"
					:items="PAGE_SIZE_OPTIONS"
					value-key="value"
					class="w-20"
					@update:model-value="onPageSize"
				/>
			</div>
			<div class="flex items-center gap-1">
				<UButton
					size="xs"
					variant="ghost"
					color="neutral"
					icon="i-lucide-chevrons-left"
					:disabled="page <= 1"
					aria-label="First page"
					@click="emit('update:page', 1)"
				/>
				<UButton
					size="xs"
					variant="ghost"
					color="neutral"
					icon="i-lucide-chevron-left"
					:disabled="page <= 1"
					aria-label="Previous page"
					@click="emit('update:page', page - 1)"
				/>
				<span class="text-(--ui-text-muted) tabular-nums px-2">
					Page <span class="text-(--ui-text) font-medium">{{ page }}</span> of {{ totalPages }}
				</span>
				<UButton
					size="xs"
					variant="ghost"
					color="neutral"
					icon="i-lucide-chevron-right"
					:disabled="page >= totalPages"
					aria-label="Next page"
					@click="emit('update:page', page + 1)"
				/>
				<UButton
					size="xs"
					variant="ghost"
					color="neutral"
					icon="i-lucide-chevrons-right"
					:disabled="page >= totalPages"
					aria-label="Last page"
					@click="emit('update:page', totalPages)"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Pagination footer for list tables. Stateless — caller drives `page` and
// `pageSize` via v-model and reads `total` / `totalPages` / `rangeStart` /
// `rangeEnd` from `useListView`. Hides itself entirely when `total` is 0
// so empty-states don't get cluttered with an inactive control bar.

	import type { PageSize } from "~/composables/useListView";

	interface Props {
		page: number
		pageSize: PageSize
		total: number
		totalPages: number
		rangeStart: number
		rangeEnd: number
	}
	defineProps<Props>();
	const emit = defineEmits<{
		"update:page": [value: number]
		"update:pageSize": [value: PageSize]
	}>();

	const PAGE_SIZE_OPTIONS = [
		{ label: "10", value: 10 },
		{ label: "15", value: 15 },
		{ label: "25", value: 25 },
		{ label: "50", value: 50 },
		{ label: "100", value: 100 }
	] as const;

	const onPageSize = (v: number | string) => {
		const n = typeof v === "string" ? Number(v) : v;
		if (n === 10 || n === 15 || n === 25 || n === 50 || n === 100) emit("update:pageSize", n);
	};
</script>
