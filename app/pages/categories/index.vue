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
					{{ archivedCounts.active }} active · {{ archivedCounts.archived }} archived
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
					<div class="flex items-center gap-3">
						<UCheckbox v-model="store.showArchived" label="Show archived" />
						<UButton
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-table-columns-split"
							title="Auto-size columns to their content"
							@click="autoFitColumns"
						>
							Auto-fit columns
						</UButton>
					</div>
				</div>
			</template>

			<div v-if="table.loading.value && table.rows.value.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading categories…
			</div>
			<div v-else-if="table.total.value === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-tags" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="!hasFilter">
					No categories yet. Click <span class="font-medium">New category</span> to add the first one.
				</div>
				<div v-else>
					No categories match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="table.rows.value"
				:total="table.total.value"
				state-key="categories-table"
				:row-actions="itemsFor"
				default-sort-field="name"
				:default-sort-order="1"
				@request="table.onRequest"
				@row-click="openEdit"
			>
				<Column field="name" header="Name" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium inline-flex items-center gap-2">
							<span
								class="inline-flex size-6 rounded items-center justify-center text-white shrink-0"
								:style="{ backgroundColor: themeHex(data.color) }"
							>
								<UIcon :name="data.icon" class="size-3.5" />
							</span>
							{{ data.name }}
							<UBadge v-if="data.is_archived === 1" color="neutral" variant="subtle" size="sm">
								Archived
							</UBadge>
						</div>
					</template>
				</Column>
				<Column field="color" header="Color" sortable>
					<template #body="{ data }">
						<span
							class="inline-block size-5 rounded border border-(--ui-border) align-middle"
							:style="{ backgroundColor: themeHex(data.color) }"
							:title="data.color"
						/>
					</template>
				</Column>
				<Column field="icon" header="Icon" sortable>
					<template #body="{ data }">
						<UIcon :name="data.icon" class="size-5 align-middle text-(--ui-text-muted)" :title="data.icon" />
					</template>
				</Column>
				<Column field="_billCount" header="Bills" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div
							class="truncate text-right tabular-nums"
							:class="data._billCount === 0 ? 'text-(--ui-text-muted)' : ''"
						>
							{{ data._billCount }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>

		<CategoryFormModal
			v-model:open="modalOpen"
			:category="editingRow"
		/>
	</div>
</template>

<script setup lang="ts">
	import type { BillCategoryRow } from "~/stores/bill_categories";
	import { andClauses, likeClause, makeSortResolver } from "~/lib/list-query";
	import { themeHex } from "~/lib/theme";
	import { useBillCategoriesStore } from "~/stores/bill_categories";
	import { useBillsStore } from "~/stores/bills";

	definePageMeta({ title: "Bill categories" });

	const router = useRouter();
	const store = useBillCategoriesStore();
	// Kept only for the "Show bills" action's filter handoff (we set its
	// filter refs before navigating). No longer loaded — the per-category
	// bill count is computed in SQL by the list query's subquery below.
	const billsStore = useBillsStore();
	const toast = useToast();

	// Row view-model: the per-category bill count comes back as `_billCount`
	// from a correlated COUNT subquery (see the table query), so PrimeVue can
	// sort on it as a top-level field without loading every bill.
	interface CategoryRowVM extends BillCategoryRow {
		_billCount: number
	}

	const table = useServerTable<CategoryRowVM>({
		query: () => ({
			from: "bill_categories c",
			columns: "c.*, (SELECT COUNT(*) FROM bills b WHERE b.category_id = c.id) AS _billCount",
			where: andClauses([
				{ sql: "is_archived = ?", params: [store.showArchived ? 1 : 0] },
				likeClause(store.search, ["name"])
			])
		}),
		resolveSortColumn: makeSortResolver({
			name: "name COLLATE NOCASE",
			color: "color",
			icon: "icon",
			_billCount: "_billCount"
		}),
		defaultOrderBy: "name COLLATE NOCASE ASC",
		deps: () => store.listFilters,
		initialSortField: "name",
		initialSortOrder: 1
	});

	const archivedCounts = ref({ active: 0, archived: 0 });
	const refreshCounts = async () => {
		archivedCounts.value = await store.fetchArchivedCounts();
	};
	onMounted(refreshCounts);

	const hasFilter = computed(() => store.search.trim() !== "" || store.showArchived);

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	const modalOpen = ref(false);
	const editingRow = ref<BillCategoryRow | null>(null);

	// The CategoryFormModal writes directly to the store and closes. In
	// server mode the grid won't react to that, so refetch the page + counts
	// whenever the modal closes (a plain cancel just re-runs the same query).
	watch(modalOpen, (open) => {
		if (!open) {
			void table.reload();
			void refreshCounts();
		}
	});

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
			await table.reload();
			await refreshCounts();
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
	// clear the others and set the category before routing.
	const showBills = (c: BillCategoryRow) => {
		billsStore.search = "";
		billsStore.clearStatusFilters();
		billsStore.vendorFilter = "all";
		billsStore.clearDateFilters();
		billsStore.categoryFilter = c.id;
		router.push("/bills");
	};

	function itemsFor(c: CategoryRowVM) {
		return [
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
					onSelect: () => {
						void toggleArchive(c);
					}
				}
			]
		];
	}
</script>
