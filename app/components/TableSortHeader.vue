<template>
	<div class="flex items-center gap-1 group/header">
		<span class="truncate">{{ label }}</span>
		<button
			v-if="header.column.getCanSort()"
			type="button"
			class="cursor-pointer rounded p-0.5 -m-0.5 hover:bg-(--ui-bg-elevated) transition-colors"
			:title="sortTitle"
			@click.stop="header.column.toggleSorting()"
		>
			<UIcon
				:name="sortIcon"
				class="size-3 transition-colors"
				:class="header.column.getIsSorted() ? 'text-(--ui-primary)' : 'opacity-40 hover:opacity-100'"
			/>
		</button>

		<!-- Column resize handle: the visible divider is a thin line at
			the very right edge of the th; the clickable hit zone is 8px
			wide. TanStack does the actual drag math — we just hand it the
			mousedown / touchstart. The parent th needs position: relative,
			set via `meta.class.th = "relative"` on the column definition. -->
		<span
			v-if="header.column.getCanResize()"
			class="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize select-none group/resize"
			@mousedown.stop.prevent="header.getResizeHandler()($event)"
			@touchstart.stop.prevent="header.getResizeHandler()($event)"
			@click.stop
		>
			<span
				class="absolute inset-y-1 right-0 w-0.5 bg-(--ui-text-muted)/20 group-hover/resize:bg-(--ui-primary) group-hover/resize:w-1 transition-all"
				:class="header.column.getIsResizing() ? 'bg-(--ui-primary) w-1' : ''"
			/>
		</span>
	</div>
</template>

<script setup lang="ts">
// Header cell for UTable that gives us (a) sort triggered by the arrow
// icon only — clicking the label is a no-op — and (b) the always-visible
// resize handle at the right edge of the column. Drop into a column's
// `<key>-header` slot:
//
//   <template #number-header="{ header }">
//     <TableSortHeader :header="header" label="Number" />
//   </template>
//
// The arrow icon flips between unsorted (up-down), asc (up), and desc
// (down). The resize handle calls TanStack's getResizeHandler() which
// handles the drag math.

	import type { Header, RowData } from "@tanstack/vue-table";

	interface Props<T extends RowData = RowData> {
		header: Header<T, unknown>
		label: string
	}
	const props = defineProps<Props>();

	const sortIcon = computed(() => {
		const dir = props.header.column.getIsSorted();
		if (dir === "asc") return "i-lucide-arrow-up";
		if (dir === "desc") return "i-lucide-arrow-down";
		return "i-lucide-arrow-up-down";
	});

	const sortTitle = computed(() => {
		const dir = props.header.column.getIsSorted();
		if (dir === "asc") return "Sorted ascending — click to flip";
		if (dir === "desc") return "Sorted descending — click to clear";
		return "Sort by this column";
	});
</script>
