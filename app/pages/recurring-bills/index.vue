<template>
	<div class="select-none">
		<FeatureLock v-if="locked" title="Recurring bills" tier-label="Plus" feature="recurring" />
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Recurring bills
					<HelpButton slug="recurring-bills" />
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-4 animate-spin text-(--ui-primary)"
					/>
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
					<span v-if="isLoading">Loading…</span>
					<template v-else>
						{{ store.templates.length }} template{{ store.templates.length === 1 ? "" : "s" }} ·
						<span v-if="store.pendingCount > 0" class="text-(--ui-warning) font-medium">
							{{ store.pendingCount }} ready to generate
						</span>
						<span v-else>nothing pending</span>
					</template>
				</p>
			</div>
			<div class="flex items-center gap-2">
				<UButton
					v-if="!locked"
					color="primary"
					variant="soft"
					icon="i-lucide-play"
					:disabled="store.pendingCount === 0"
					@click="openGenerate"
				>
					Generate pending<span v-if="store.pendingCount > 0"> ({{ store.pendingCount }})</span>
				</UButton>
				<UButton v-if="!locked" icon="i-lucide-plus" @click="newTemplate">
					New recurring
				</UButton>
			</div>
		</header>

		<ListPageSkeleton v-if="isLoading" :chip-count="6" :column-count="6" />

		<UCard v-else>
			<template #header>
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by template, vendor, or category…"
							icon="i-lucide-search"
							size="md"
							class="flex-1 min-w-64"
						/>
						<USelectMenu
							v-model="store.vendorFilter"
							:items="vendorOptions"
							value-key="value"
							label-key="label"
							icon="i-lucide-truck"
							class="w-56"
							:search-input="{ placeholder: 'Filter vendors…' }"
						/>
						<USelectMenu
							v-model="store.categoryFilter"
							:items="categoryOptions"
							value-key="value"
							label-key="label"
							icon="i-lucide-tag"
							class="w-48"
							:search-input="{ placeholder: 'Filter categories…' }"
						>
							<!-- Coloured-chip + icon prefix per item, same shape
								the bills list uses. Sentinel rows (All /
								Uncategorised) have colorHex: null and fall
								through to a plain muted UIcon. -->
							<template #item-leading="{ item }">
								<span
									v-if="item.colorHex"
									class="inline-flex size-4 rounded items-center justify-center text-white shrink-0"
									:style="{ backgroundColor: item.colorHex }"
								>
									<UIcon :name="item.icon" class="size-2.5" />
								</span>
								<UIcon
									v-else
									:name="item.icon"
									class="size-4 text-(--ui-text-muted) shrink-0"
								/>
							</template>
						</USelectMenu>
						<UButton
							v-if="hasAnyFilter"
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-x"
							class="ml-auto"
							@click="resetFilters"
						>
							Reset
						</UButton>
					</div>

					<!-- Two filter axes share a row at md+: status (active /
						paused) on the left, frequency on the right. -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-flag" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<button
								v-for="s in STATUSES"
								:key="s"
								type="button"
								class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
								:class="statusChipClasses(s)"
								@click="store.toggleStatusFilter(s)"
							>
								{{ STATUS_LABEL[s] }}
							</button>
						</div>
						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-repeat-2" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<span class="text-xs text-(--ui-text-muted) mr-1">Frequency:</span>
							<button
								v-for="f in FREQUENCIES"
								:key="f"
								type="button"
								class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
								:class="frequencyChipClasses(f)"
								@click="store.toggleFrequencyFilter(f)"
							>
								{{ FREQUENCY_LABEL[f] }}
							</button>
						</div>
					</div>
				</div>
			</template>

			<div
				v-if="!store.loading && !store.error && store.filtered.length > 0"
				class="flex justify-between items-center gap-3 flex-wrap text-sm text-(--ui-text-muted) tabular-nums mb-3"
			>
				<UButton
					size="xs"
					variant="soft"
					color="neutral"
					icon="i-lucide-table-columns-split"
					title="Auto-size columns to their content"
					@click="autoFitColumns"
				>
					Auto-fit columns
				</UButton>
				<div class="flex items-center gap-3 ml-auto">
					<span v-if="hasAnyFilter" class="text-xs text-(--ui-text-muted)">{{ store.filtered.length }} of {{ store.templates.length }} shown</span>
				</div>
			</div>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading templates…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-repeat-2" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.templates.length === 0">
					No recurring bill templates yet. Click <span class="font-medium">New recurring</span> to set one up.
				</div>
				<div v-else>
					No templates match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="rows"
				state-key="recurring-bills-table"
				:row-actions="itemsFor"
				default-sort-field="next_issue_date"
				:default-sort-order="1"
				@row-click="(row) => router.push(`/recurring-bills/${row.id}`)"
			>
				<Column field="template_name" header="Template" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium">
							{{ data.template_name }}
						</div>
					</template>
				</Column>
				<Column field="vendor_name" header="Vendor" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data.vendor_name || "—" }}
						</div>
					</template>
				</Column>
				<Column field="category_name" header="Category" sortable>
					<template #body="{ data }">
						<div v-if="data.category_name" class="inline-flex items-center gap-2 truncate">
							<span
								class="inline-flex size-4 rounded items-center justify-center text-white shrink-0"
								:style="{ backgroundColor: themeHex(data.category_color) }"
							>
								<UIcon :name="data.category_icon" class="size-2.5" />
							</span>
							<span class="truncate">{{ data.category_name }}</span>
						</div>
						<span v-else class="text-(--ui-text-muted)">—</span>
					</template>
				</Column>
				<Column field="frequency" header="Frequency" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ FREQUENCY_LABEL[data.frequency as RecurringFrequency] }}
						</div>
					</template>
				</Column>
				<Column field="next_issue_date" header="Next issue" sortable>
					<template #body="{ data }">
						<div
							class="truncate tabular-nums"
							:class="data._pending
								? 'text-(--ui-warning) font-medium'
								: 'text-(--ui-text-muted)'"
						>
							{{ data.next_issue_date }}
						</div>
					</template>
				</Column>
				<Column field="_status" header="Status" sortable>
					<template #body="{ data }">
						<StatusBadge :status="data._status" />
					</template>
				</Column>
				<Column
					field="bills_generated"
					header="# generated"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="text-right tabular-nums">
							<span v-if="data.bills_generated === 0" class="text-(--ui-text-muted)">—</span>
							<span v-else>{{ data.bills_generated }}</span>
						</div>
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>

		<NewRecurringBillModal v-model:open="newOpen" />
		<RecurringGenerateBillsModal v-model:open="generateOpen" />

		<UModal v-model:open="deleteOpen" :title="`Delete ${pendingDelete?.template_name ?? 'template'}?`">
			<template #body>
				<p class="text-sm">
					This removes the recurring template. Already-generated bills stay intact —
					they're real liabilities in your books, independent of the template.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="deleteOpen = false">
						Cancel
					</UButton>
					<UButton color="error" icon="i-lucide-trash-2" @click="confirmDelete">
						Delete template
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
	import type { RecurringBillRow } from "~/stores/recurring_bills";
	// RecurringFrequency is owned by the recurring_invoices store (#249).
	import type { RecurringFrequency } from "~/stores/recurring_invoices";
	import { themeHex } from "~/lib/theme";
	import { useBillCategoriesStore } from "~/stores/bill_categories";
	import { useLicenseStore } from "~/stores/license";
	import { useRecurringBillsStore } from "~/stores/recurring_bills";
	import { useVendorsStore } from "~/stores/vendors";

	definePageMeta({ title: "Recurring bills" });

	const router = useRouter();
	const toast = useToast();
	const store = useRecurringBillsStore();
	const vendorsStore = useVendorsStore();
	const categoriesStore = useBillCategoriesStore();
	const license = useLicenseStore();
	const locked = computed(() => !license.hasFeature("recurring"));

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			store.ensureLoaded(),
			vendorsStore.ensureLoaded(),
			categoriesStore.ensureLoaded()
		]);
	}));

	type StatusKey = "active" | "paused";
	const STATUSES: StatusKey[] = ["active", "paused"];
	const STATUS_LABEL: Record<StatusKey, string> = {
		active: "Active",
		paused: "Paused"
	};
	const FREQUENCIES: RecurringFrequency[] = ["weekly", "monthly", "quarterly", "yearly"];
	const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
		weekly: "Weekly",
		monthly: "Monthly",
		quarterly: "Quarterly",
		yearly: "Yearly"
	};

	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const statusChipClasses = (s: StatusKey): string => {
		if (!store.statusFilters.includes(s)) return inactiveChip;
		return s === "active"
			? "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)"
			: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text-muted)";
	};
	const frequencyChipClasses = (f: RecurringFrequency): string =>
		store.frequencyFilters.includes(f)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: inactiveChip;

	const vendorOptions = computed<{ label: string, value: number | "all" }[]>(() => [
		{ label: "All vendors", value: "all" },
		...[...vendorsStore.vendors]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((v) => ({ label: v.name, value: v.id }))
	]);

	// Categories: include an "Uncategorised" sentinel for templates
	// without a category_id (otherwise the user can't surface those rows
	// in isolation). Mirrors the bills list's option shape.
	interface CategoryOption {
		label: string
		value: number | "all" | "uncategorised"
		icon: string
		colorHex: string | null
	}
	const categoryOptions = computed<CategoryOption[]>(() => [
		{ label: "All categories", value: "all", icon: "i-lucide-tag", colorHex: null },
		{ label: "Uncategorised", value: "uncategorised", icon: "i-lucide-tag-x", colorHex: null },
		...[...categoriesStore.categories]
			.filter((c) => c.is_archived === 0)
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => ({
				label: c.name,
				value: c.id,
				icon: c.icon,
				colorHex: themeHex(c.color)
			}))
	]);

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.statusFilters.length > 0
		|| store.frequencyFilters.length > 0
		|| store.vendorFilter !== "all"
		|| store.categoryFilter !== "all"
	);
	const resetFilters = () => {
		store.search = "";
		store.clearStatusFilters();
		store.clearFrequencyFilters();
		store.vendorFilter = "all";
		store.categoryFilter = "all";
	};

	// View-model wrapping each row with the synthetic `_status` and
	// `_pending` flags so PrimeVue's by-field sort agrees with the
	// rendered cell.
	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};
	interface RecurringRowVM extends RecurringBillRow {
		_status: StatusKey
		_pending: boolean
	}
	const rows = computed<RecurringRowVM[]>(() => {
		const today = todayISO();
		return store.filtered.map((t) => {
			const isPaused = t.is_paused === 1;
			const isPending = !isPaused
				&& t.next_issue_date <= today
				&& (t.end_date === null || t.next_issue_date <= t.end_date);
			return {
				...t,
				_status: isPaused ? "paused" : "active",
				_pending: isPending
			};
		});
	});

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	const newOpen = ref(false);
	const newTemplate = () => {
		newOpen.value = true;
	};
	const generateOpen = ref(false);
	const openGenerate = () => {
		if (store.pendingCount === 0) return;
		generateOpen.value = true;
	};

	const route = useRoute();
	onMounted(() => {
		if (route.query.new === "1") {
			newOpen.value = true;
			void router.replace({ query: { ...route.query, new: undefined } });
		}
	});

	// Row-action handlers. Function declarations so they hoist above
	// itemsFor() — eslint's no-use-before-define catches the
	// alternative arrow-fn order.
	async function onTogglePause(t: RecurringBillRow) {
		try {
			await store.togglePause(t.id);
			toast.add({
				title: t.is_paused === 1 ? `Resumed ${t.template_name}` : `Paused ${t.template_name}`,
				color: "info",
				icon: t.is_paused === 1 ? "i-lucide-play" : "i-lucide-pause"
			});
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	}

	async function onGenerateOne(t: RecurringBillRow) {
		try {
			const billId = await store.generateOne(t.id);
			toast.add({
				title: `Generated bill from ${t.template_name}`,
				description: "Recorded as unpaid on the bills page.",
				color: "success",
				icon: "i-lucide-check"
			});
			void router.push(`/bills/${billId}`);
		} catch (err) {
			toast.add({
				title: "Could not generate",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	}

	const deleteOpen = ref(false);
	const pendingDelete = ref<RecurringBillRow | null>(null);
	function onDelete(t: RecurringBillRow) {
		pendingDelete.value = t;
		deleteOpen.value = true;
	}
	async function confirmDelete() {
		const t = pendingDelete.value;
		if (!t) return;
		deleteOpen.value = false;
		try {
			await store.remove(t.id);
			toast.add({ title: "Template deleted", color: "info", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			pendingDelete.value = null;
		}
	}

	// Row actions — Edit / Pause-Resume / Generate now / Delete.
	function itemsFor(t: RecurringBillRow) {
		const primary = [
			{
				label: "Edit",
				icon: "i-lucide-pencil",
				onSelect: () => router.push(`/recurring-bills/${t.id}`)
			},
			{
				label: t.is_paused === 1 ? "Resume" : "Pause",
				icon: t.is_paused === 1 ? "i-lucide-play" : "i-lucide-pause",
				onSelect: () => {
					void onTogglePause(t);
				}
			}
		];
		// "Generate now" only when the template is active.
		if (t.is_paused === 0) {
			primary.push({
				label: "Generate now",
				icon: "i-lucide-play",
				onSelect: () => {
					void onGenerateOne(t);
				}
			});
		}
		const destructive = [{
			label: "Delete",
			icon: "i-lucide-trash-2",
			onSelect: () => {
				onDelete(t);
			}
		}];
		return [primary, destructive];
	}
</script>
