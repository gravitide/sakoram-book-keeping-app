<template>
	<div>
		<UPopover v-model:open="open" :ui="{ content: 'min-w-72 w-(--reka-popper-anchor-width)' }">
			<UButton
				color="neutral"
				variant="outline"
				class="w-full justify-between"
				:disabled="props.disabled"
				trailing-icon="i-lucide-chevrons-up-down"
			>
				<span v-if="model" class="truncate">{{ model }}</span>
				<span v-else class="text-(--ui-text-muted)">Select a category…</span>
			</UButton>
			<template #content>
				<div class="p-2 border-b border-(--ui-border)">
					<UInput
						v-model="search"
						placeholder="Search or type a new one…"
						icon="i-lucide-search"
						autofocus
						@keydown.enter.prevent="onEnter"
					/>
				</div>
				<div class="max-h-72 overflow-auto">
					<div v-if="matches.length === 0 && !canCreate" class="p-4 text-sm text-(--ui-text-muted) text-center">
						<div v-if="store.activeNames.length === 0">
							No categories yet — type one and press Enter.
						</div>
						<div v-else>
							No matches.
						</div>
					</div>
					<button
						v-for="name in matches"
						:key="name"
						type="button"
						class="block w-full text-left px-3 py-2 hover:bg-(--ui-bg-muted) text-sm"
						:class="{ 'bg-(--ui-primary)/10 text-(--ui-primary)': name === model }"
						@click="select(name)"
					>
						{{ name }}
					</button>
					<button
						v-if="canCreate"
						type="button"
						class="block w-full text-left px-3 py-2 hover:bg-(--ui-bg-muted) text-sm text-(--ui-primary)"
						@click="createAndSelect"
					>
						+ Create “{{ search.trim() }}”
					</button>
				</div>
				<div v-if="model" class="p-2 border-t border-(--ui-border) flex justify-end">
					<button
						type="button"
						class="text-xs text-(--ui-text-muted) hover:text-(--ui-error)"
						@click="select('')"
					>
						Clear
					</button>
				</div>
			</template>
		</UPopover>
	</div>
</template>

<script setup lang="ts">
// Category picker for letters. v-model is the category NAME (string; "" = none).
// The search box doubles as an inline create field — typing a name that isn't
// in the managed list offers "+ Create". New categories are persisted to
// letter_categories so they show up in the filter dropdown + settings page.
	import { useLetterCategoriesStore } from "~/stores/letter_categories";

	const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
	const model = defineModel<string>({ default: "" });

	const store = useLetterCategoriesStore();
	const toast = useToast();

	onMounted(() => {
		void store.ensureLoaded();
	});

	const open = ref(false);
	const search = ref("");

	const matches = computed(() => {
		const q = search.value.trim().toLowerCase();
		if (!q) return store.activeNames;
		return store.activeNames.filter((n) => n.toLowerCase().includes(q));
	});

	// Offer "+ Create" only when the typed name doesn't already exist (any case).
	const canCreate = computed(() => {
		const q = search.value.trim();
		if (!q) return false;
		return !store.activeNames.some((n) => n.toLowerCase() === q.toLowerCase());
	});

	const select = (name: string) => {
		model.value = name;
		open.value = false;
		search.value = "";
	};

	const createAndSelect = async () => {
		const name = search.value.trim();
		if (!name) return;
		try {
			await store.create(name);
			select(name);
		} catch (err) {
			toast.add({ title: "Could not add category", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	// Enter: pick the sole match, else create the typed name.
	const onEnter = () => {
		if (matches.value.length === 1) select(matches.value[0]!);
		else if (canCreate.value) void createAndSelect();
	};
</script>
