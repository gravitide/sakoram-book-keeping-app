<template>
	<th :class="thClass">
		<span class="inline-flex items-center gap-1">
			<slot />
			<button
				v-if="sortable"
				type="button"
				class="cursor-pointer rounded p-0.5 -m-0.5 hover:bg-(--ui-bg-muted) transition-colors"
				:title="active ? `Sorted ${dir}ending — click to flip` : 'Sort by this column'"
				@click="emit('sort')"
			>
				<UIcon
					:name="iconName"
					class="size-3 transition-colors"
					:class="active ? 'text-(--ui-primary)' : 'opacity-40 hover:opacity-100'"
				/>
			</button>
		</span>
	</th>
</template>

<script setup lang="ts">
// Column header for resizable-column tables. Sort is triggered only by
// clicking the arrow icon — the column label itself is non-interactive,
// so the full-column-height resize strip rendered by ResizeHandleOverlay
// can't conflict with a stray header click.
//
// Used together with ResizeHandleOverlay (and useResizableColumns) on a
// table-fixed list page. See app/pages/invoices/index.vue for the full
// wiring.

	import type { SortDir } from "~/composables/useListView";

	interface Props {
		active: boolean
		dir: SortDir
		sortable?: boolean
		thClass?: string
	}
	const props = withDefaults(defineProps<Props>(), {
		sortable: true,
		thClass: ""
	});

	const emit = defineEmits<{ sort: [] }>();

	const iconName = computed(() => {
		if (!props.active) return "i-lucide-arrow-up-down";
		return props.dir === "asc" ? "i-lucide-arrow-up" : "i-lucide-arrow-down";
	});
</script>
