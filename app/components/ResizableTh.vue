<template>
	<th
		class="relative"
		:class="[thClass, sortable ? 'cursor-pointer select-none hover:text-(--ui-text) transition-colors' : '']"
		@click="onClick"
	>
		<span class="inline-flex items-center gap-1">
			<slot />
			<UIcon
				v-if="sortable"
				:name="iconName"
				class="size-3"
				:class="[active ? 'text-(--ui-primary)' : 'opacity-40']"
			/>
		</span>

		<!-- Resize grip. The visible divider is a 1px line; the
			clickable hit area is wider (6px, half outside the cell) so
			the drag affordance is easy to grab without crowding the
			label's click zone. Cursor changes to col-resize on hover,
			divider tints to the primary colour while the user's mouse
			is on it. -->
		<span
			v-if="resizable"
			class="absolute top-0 bottom-0 right-0 w-1.5 -mr-[3px] cursor-col-resize group"
			@mousedown="$emit('resizeStart', $event)"
			@click.stop
		>
			<span
				class="absolute inset-y-1.5 right-[2px] w-px bg-(--ui-border) group-hover:bg-(--ui-primary) transition-colors"
			/>
		</span>
	</th>
</template>

<script setup lang="ts">
// Sortable + resizable column header. Drop-in replacement for
// SortableTh: same sort props/emits, plus an always-visible drag
// handle on the right edge that emits `resize-start` for the page's
// useResizableColumns composable to handle.
//
// The handle's mousedown stops propagation so a drag-start near the
// edge never triggers a sort. The label area still toggles sort on
// click.

	import type { SortDir } from "~/composables/useListView";

	interface Props {
		active: boolean
		dir: SortDir
		sortable?: boolean
		resizable?: boolean
		thClass?: string
	}
	const props = withDefaults(defineProps<Props>(), {
		sortable: true,
		resizable: true,
		thClass: ""
	});

	const emit = defineEmits<{
		sort: []
		resizeStart: [event: MouseEvent]
	}>();

	const iconName = computed(() => {
		if (!props.active) return "i-lucide-arrow-up-down";
		return props.dir === "asc" ? "i-lucide-arrow-up" : "i-lucide-arrow-down";
	});

	const onClick = () => {
		if (props.sortable) emit("sort");
	};
</script>
