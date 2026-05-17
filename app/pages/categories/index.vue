<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for managing
			categories, not copying cell text out of the table. -->
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
						<SortableTh
							th-class="py-2 px-2 font-medium text-right"
							:active="list.sortKey === 'bills'"
							:dir="list.sortDir"
							@sort="list.toggleSort('bills')"
						>
							Bills
						</SortableTh>
						<th class="py-2 pl-2 pr-3 w-10" />
					</tr>
				</thead>
				<tbody>
					<!-- Each row is wrapped in a UContextMenu so right-click
						surfaces the same actions as the overflow ⋯ button.
						UContextMenu uses Reka UI's as-child trigger, so the
						<tr> stays the actual rendered element — no wrapper
						div between tbody and tr. -->
					<UContextMenu
						v-for="c in list.paged"
						:key="c.id"
						:items="itemsFor(c)"
					>
						<tr
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
							<td class="py-2 px-2 text-right tabular-nums">
								<span :class="billCountFor(c.id) === 0 ? 'text-(--ui-text-muted)' : ''">
									{{ billCountFor(c.id) }}
								</span>
							</td>
							<td class="py-2 pl-2 pr-3 text-right" @click.stop>
								<UDropdownMenu :items="itemsFor(c)">
									<UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
								</UDropdownMenu>
							</td>
						</tr>
					</UContextMenu>
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
	import { useBillsStore } from "~/stores/bills";

	definePageMeta({ title: "Bill categories" });

	const router = useRouter();
	const store = useBillCategoriesStore();
	// Bills are loaded purely to count how many sit in each category and
	// to power the "Show bills" action's filter handoff.
	const billsStore = useBillsStore();
	const toast = useToast();

	await Promise.all([store.load(), billsStore.load()]);

	// Declared as a hoisted `function` (not a const arrow) so the
	// useListView column descriptor below can close over it without
	// hitting the temporal dead zone — see CLAUDE.md list-view notes.
	function billCountFor(categoryId: number): number {
		return billsStore.bills.filter((b) => b.category_id === categoryId).length;
	}

	const list = useListView<BillCategoryRow>(
		() => store.filtered,
		[
			{ key: "name", getValue: (c) => c.name },
			{ key: "color", getValue: (c) => c.color },
			{ key: "icon", getValue: (c) => c.icon },
			{ key: "bills", getValue: (c) => billCountFor(c.id) }
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

	// Jump to the Bills list pre-filtered to this category. Bill filters
	// live on the bills store (Pinia state survives navigation), so we
	// clear the others and set the category before routing — the bills
	// page binds straight to these refs.
	const showBills = (c: BillCategoryRow) => {
		billsStore.search = "";
		billsStore.clearStatusFilters();
		billsStore.vendorFilter = "all";
		billsStore.clearDateFilters();
		billsStore.categoryFilter = c.id;
		router.push("/bills");
	};

	const itemsFor = (c: BillCategoryRow) => [
		[
			{
				label: "Show bills",
				icon: "i-lucide-file-input",
				onSelect: () => showBills(c)
			}
		],
		[
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
		]
	];
</script>
