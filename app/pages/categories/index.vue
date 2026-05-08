<template>
	<div>
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Bill categories
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ store.activeCount }} active · {{ store.archivedCount }} archived
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="openCreate">
				New category
			</UButton>
		</header>

		<UCard>
			<template #header>
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<UInput
						v-model="store.search"
						placeholder="Search categories…"
						icon="i-lucide-search"
						class="md:w-96"
					/>
					<UCheckbox v-model="store.showArchived" label="Show archived" />
				</div>
			</template>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading categories…
			</div>

			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>

			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-tags" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.categories.length === 0">
					No categories yet. Click <span class="font-medium">New category</span> to add the first one.
				</div>
				<div v-else>
					No categories match your filters.
				</div>
			</div>

			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<SortableTh
							th-class="py-2 pl-3 pr-2 font-medium"
							:active="list.sortKey === 'name'"
							:dir="list.sortDir"
							@sort="list.toggleSort('name')"
						>
							Name
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'color'"
							:dir="list.sortDir"
							@sort="list.toggleSort('color')"
						>
							Color
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'icon'"
							:dir="list.sortDir"
							@sort="list.toggleSort('icon')"
						>
							Icon
						</SortableTh>
						<th class="py-2 pl-2 pr-3 w-10" />
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="c in list.paged"
						:key="c.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="openEdit(c)"
					>
						<td class="py-2 pl-3 pr-2 font-medium">
							<span class="inline-flex items-center gap-2">
								<span
									class="inline-flex size-6 rounded items-center justify-center text-white shrink-0"
									:style="{ backgroundColor: themeHex(c.color) }"
								>
									<UIcon :name="c.icon" class="size-3.5" />
								</span>
								{{ c.name }}
								<UBadge v-if="c.is_archived === 1" color="neutral" variant="subtle" size="sm">
									Archived
								</UBadge>
							</span>
						</td>
						<td class="py-2 px-2">
							<span
								class="inline-block size-5 rounded border border-(--ui-border) align-middle"
								:style="{ backgroundColor: themeHex(c.color) }"
								:title="c.color"
							/>
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							<UIcon :name="c.icon" class="size-5 align-middle" :title="c.icon" />
						</td>
						<td class="py-2 pl-2 pr-3 text-right" @click.stop>
							<UDropdownMenu :items="itemsFor(c)">
								<UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
							</UDropdownMenu>
						</td>
					</tr>
				</tbody>
			</table>

			<ListPagination
				v-model:page="list.page"
				v-model:page-size="list.pageSize"
				:total="list.total"
				:total-pages="list.totalPages"
				:range-start="list.rangeStart"
				:range-end="list.rangeEnd"
			/>
		</UCard>

		<CategoryFormModal
			v-model:open="modalOpen"
			:category="editingRow"
		/>
	</div>
</template>

<script setup lang="ts">
	import type { BillCategoryRow } from "~/stores/bill_categories";
	import { useListView } from "~/composables/useListView";
	import { themeHex } from "~/lib/theme";
	import { useBillCategoriesStore } from "~/stores/bill_categories";

	definePageMeta({ title: "Bill categories" });

	const store = useBillCategoriesStore();
	const toast = useToast();

	await store.load();

	const list = useListView<BillCategoryRow>(
		() => store.filtered,
		[
			{ key: "name", getValue: (c) => c.name },
			{ key: "color", getValue: (c) => c.color },
			{ key: "icon", getValue: (c) => c.icon }
		],
		{ defaultSortKey: "name", defaultDir: "asc" }
	);

	const modalOpen = ref(false);
	const editingRow = ref<BillCategoryRow | null>(null);

	const openCreate = () => {
		editingRow.value = null;
		modalOpen.value = true;
	};

	const openEdit = (c: BillCategoryRow) => {
		editingRow.value = c;
		modalOpen.value = true;
	};

	const toggleArchive = async (c: BillCategoryRow) => {
		const goingToArchive = c.is_archived === 0;
		try {
			await store.setArchived(c.id, goingToArchive);
			toast.add({
				title: goingToArchive ? "Category archived" : "Category restored",
				color: "info",
				icon: goingToArchive ? "i-lucide-archive" : "i-lucide-archive-restore"
			});
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const itemsFor = (c: BillCategoryRow) => [[
		{
			label: "Edit",
			icon: "i-lucide-pencil",
			onSelect: () => openEdit(c)
		},
		{
			label: c.is_archived === 0 ? "Archive" : "Restore",
			icon: c.is_archived === 0 ? "i-lucide-archive" : "i-lucide-archive-restore",
			onSelect: () => toggleArchive(c)
		}
	]];
</script>
