<template>
	<th
		v-if="sortable"
		class="cursor-pointer select-none hover:text-(--ui-text) transition-colors" :class="[thClass]"
		@click="$emit('sort')"
	>
		<span class="inline-flex items-center gap-1">
			<slot />
			<UIcon
				:name="iconName"
				class="size-3"
				:class="[active ? 'text-(--ui-primary)' : 'opacity-40']"
			/>
		</span>
	</th>
	<th v-else :class="thClass">
		<slot />
	</th>
</template>

<script setup lang="ts">
// Sortable column header for list tables. Pages pass `active` (whether
// this column is the currently-sorted one) and `dir` ("asc" | "desc"),
// and emit @sort to flip via the composable's toggleSort. When the
// column isn't sortable (no getValue in its descriptor), we render a
// plain <th> with no click affordance.
//
// Slot is the column label so callers keep markup like
// <SortableTh active="..." dir="..." @sort="...">Number</SortableTh>.

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
	defineEmits<{ sort: [] }>();

	const iconName = computed(() => {
		if (!props.active) return "i-lucide-arrow-up-down";
		return props.dir === "asc" ? "i-lucide-arrow-up" : "i-lucide-arrow-down";
	});
</script>
