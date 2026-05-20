<template>
	<!-- One vertical strip per resizable column boundary, absolutely
		positioned over the table. The strip spans the full height of
		its parent (the relative-wrapped table container), so the user
		can grab the divider anywhere down the column — not just in the
		header — without conflicting with header clicks or row clicks.
		Hit zone is 8px wide, centred on the boundary; the visible
		divider is a thin line that tints primary on hover. -->
	<div
		v-for="b in boundaries"
		:key="b.key"
		class="absolute top-0 bottom-0 w-2 -ml-1 cursor-col-resize select-none group z-10"
		:style="{ left: `${b.left}px` }"
		@mousedown.stop.prevent="emit('resizeStart', b.key, $event)"
	>
		<span
			class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-(--ui-text-muted)/20 group-hover:bg-(--ui-primary) group-hover:w-1 transition-all"
		/>
	</div>
</template>

<script setup lang="ts">
// Renders the column-divider drag handles for a table with resizable
// columns. The parent computes the boundary positions (cumulative
// column widths) and passes them in; this component just paints the
// strips and forwards the mousedown to useResizableColumns.startResize.
//
// Lives inside a `relative` ancestor that wraps the table — the strips
// fill the height of that ancestor, so they cover every row plus the
// header, scrolling horizontally with the table when the columns are
// resized past the available width.

	interface Boundary {
		/** The column key this strip resizes — passed back to startResize. */
		key: string
		/** Left offset in px, relative to the positioned ancestor. */
		left: number
	}

	defineProps<{ boundaries: Boundary[] }>();
	const emit = defineEmits<{ resizeStart: [key: string, event: MouseEvent] }>();
</script>
