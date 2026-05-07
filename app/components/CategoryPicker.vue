<template>
	<div>
		<UPopover v-model:open="open" :ui="{ content: 'w-(--reka-popper-anchor-width)' }">
			<UButton
				color="neutral"
				variant="outline"
				class="w-full justify-between"
				:disabled="disabled"
				trailing-icon="i-lucide-chevrons-up-down"
			>
				<span v-if="selected" class="inline-flex items-center gap-2 truncate">
					<span
						class="inline-flex size-5 rounded items-center justify-center text-white shrink-0"
						:style="{ backgroundColor: themeHex(selected.color) }"
					>
						<UIcon :name="selected.icon" class="size-3" />
					</span>
					<span class="truncate">{{ selected.name }}</span>
				</span>
				<span v-else class="text-(--ui-text-muted)">Select a category…</span>
			</UButton>
			<template #content>
				<div class="p-2 border-b border-(--ui-border)">
					<UInput
						v-model="search"
						placeholder="Search categories…"
						icon="i-lucide-search"
						autofocus
					/>
				</div>
				<div class="max-h-72 overflow-auto">
					<div v-if="items.length === 0" class="p-4 text-sm text-(--ui-text-muted) text-center">
						<div v-if="store.categories.length === 0">
							No categories yet.
						</div>
						<div v-else>
							No matches.
						</div>
					</div>
					<button
						v-for="c in items"
						:key="c.id"
						type="button"
						class="block w-full text-left px-3 py-2 hover:bg-(--ui-bg-muted) text-sm flex items-center gap-2"
						:class="{ 'bg-(--ui-primary)/10 text-(--ui-primary)': c.id === modelValue }"
						@click="select(c)"
					>
						<span
							class="inline-flex size-5 rounded items-center justify-center text-white shrink-0"
							:style="{ backgroundColor: themeHex(c.color) }"
						>
							<UIcon :name="c.icon" class="size-3" />
						</span>
						<span class="truncate">{{ c.name }}</span>
					</button>
				</div>
				<div class="p-2 border-t border-(--ui-border) flex justify-between">
					<button
						type="button"
						class="text-xs text-(--ui-primary) hover:underline"
						@click="openCreate"
					>
						+ New category
					</button>
					<button
						v-if="modelValue !== null && !required"
						type="button"
						class="text-xs text-(--ui-text-muted) hover:text-(--ui-error)"
						@click="clear"
					>
						Clear
					</button>
				</div>
			</template>
		</UPopover>

		<CategoryFormModal v-model:open="showCreate" @saved="onCreated" />
	</div>
</template>

<script setup lang="ts">
	import type { BillCategoryRow } from "~/stores/bill_categories";
	import { themeHex } from "~/lib/theme";
	import { useBillCategoriesStore } from "~/stores/bill_categories";

	// v-model = bill_category_id (number) or null. Picker also offers an
	// inline "+ New category" that opens CategoryFormModal — on save the new
	// row is auto-selected so the user stays on the bill page.

	interface Props {
		modelValue: number | null
		disabled?: boolean
		required?: boolean
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false, required: false });
	const emit = defineEmits<{
		"update:modelValue": [value: number | null]
		select: [category: BillCategoryRow]
	}>();

	const store = useBillCategoriesStore();
	onMounted(async () => {
		if (store.categories.length === 0) await store.load();
	});

	const open = ref(false);
	const search = ref("");
	const showCreate = ref(false);

	const items = computed(() => {
		const q = search.value.trim().toLowerCase();
		const active = store.categories.filter((c) => c.is_archived === 0);
		if (!q) return active;
		return active.filter((c) => c.name.toLowerCase().includes(q));
	});

	const selected = computed(() => store.categories.find((c) => c.id === props.modelValue) ?? null);

	const select = (c: BillCategoryRow) => {
		emit("update:modelValue", c.id);
		emit("select", c);
		open.value = false;
		search.value = "";
	};

	const clear = () => {
		emit("update:modelValue", null);
	};

	const openCreate = () => {
		open.value = false;
		showCreate.value = true;
	};

	const onCreated = (id: number) => {
		const row = store.categories.find((c) => c.id === id);
		if (row) {
			emit("update:modelValue", row.id);
			emit("select", row);
		}
	};
</script>
