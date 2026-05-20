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

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="rows"
				state-key="categories-table"
				:row-actions="itemsFor"
				default-sort-field="name"
				:default-sort-order="1"
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

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	// Helper hoisted via `function` so the row computed below can close
	// over it without hitting the temporal-dead-zone — see CLAUDE.md
	// list-view notes.
	function billCountFor(categoryId: number): number {
		return billsStore.bills.filter((b) => b.category_id === categoryId).length;
	}

	// View-model: every sortable PrimeVue column needs the value on a
	// top-level field, so we attach the derived bill count as `_billCount`.
	// Underscored to keep it out of the way of any future schema fields.
	interface CategoryRowVM extends BillCategoryRow {
		_billCount: number
	}
	const rows = computed<CategoryRowVM[]>(() =>
		store.filtered.map((c) => ({ ...c, _billCount: billCountFor(c.id) }))
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
