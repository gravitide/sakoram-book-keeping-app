<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			bills, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Bills
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
					{{ store.bills.length }} total · {{ formatLKR(store.outstandingTotal) }} outstanding
					<span v-if="store.overdueCount > 0" class="text-(--ui-error)">
						· {{ store.overdueCount }} overdue
					</span>
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newBill">
				New bill
			</UButton>
		</header>

		<UCard>
			<template #header>
				<!-- Filter strip — chips + Advanced popover, matches the
					quotes/invoices pattern. Vendor and category live in
					row 1; date ranges are tucked into the popover. -->
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by number, vendor, vendor invoice…"
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
						/>
						<UPopover>
							<UButton color="neutral" variant="outline" icon="i-lucide-sliders-horizontal" class="relative">
								Advanced
								<span
									v-if="store.hasDateFilters"
									class="absolute -top-1 -right-1 size-2 rounded-full bg-(--ui-info)"
								/>
							</UButton>
							<template #content>
								<div class="p-4 w-[420px] space-y-4">
									<div>
										<div class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted) mb-1.5 flex items-center gap-1.5">
											<UIcon name="i-lucide-calendar" class="size-3.5" />
											Issue date
										</div>
										<DateRangeField
											v-model:from="store.issuedFrom"
											v-model:to="store.issuedTo"
										/>
									</div>
									<div>
										<div class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted) mb-1.5 flex items-center gap-1.5">
											<UIcon name="i-lucide-calendar-clock" class="size-3.5" />
											Due date
										</div>
										<DateRangeField
											v-model:from="store.dueFrom"
											v-model:to="store.dueTo"
										/>
									</div>
									<div v-if="store.hasDateFilters" class="pt-2 border-t border-(--ui-border) flex justify-end">
										<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="store.clearDateFilters">
											Clear date filters
										</UButton>
									</div>
								</div>
							</template>
						</UPopover>
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
						<UButton
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-table-columns-split"
							:class="hasAnyFilter ? '' : 'ml-auto'"
							title="Auto-size columns to their content"
							@click="autoFitColumns"
						>
							Auto-fit columns
						</UButton>
					</div>

					<div class="flex items-center gap-1.5 flex-wrap">
						<UIcon name="i-lucide-flag" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
						<button
							v-for="s in BILL_STATUSES"
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
						<UIcon name="i-lucide-calendar" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
						<span class="text-xs text-(--ui-text-muted) mr-1">Issued:</span>
						<button
							v-for="p in DATE_PRESETS"
							:key="p.key"
							type="button"
							class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
							:class="datePresetClasses(p.key)"
							@click="toggleDatePreset(p.key)"
						>
							{{ p.label }}
						</button>
					</div>
				</div>
			</template>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading bills…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-file-input" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.bills.length === 0">
					No bills yet. Click <span class="font-medium">New bill</span> to record one.
				</div>
				<div v-else>
					No bills match your filters.
				</div>
			</div>

			<!-- No `:row-actions` here — the original bills list page had
				no overflow / right-click menu, so the migration preserves
				that. First-cell click still opens the bill detail.
				A follow-up could add common actions (record payment,
				generate PDF) once buildBillPdfPayload moves into a shared
				lib file. -->
			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="rows"
				state-key="bills-table"
				default-sort-field="issue_date"
				:default-sort-order="-1"
				@row-click="(row) => router.push(`/bills/${row.id}`)"
			>
				<Column field="number" header="Number" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number }}
						</div>
					</template>
				</Column>
				<Column field="_vendor" header="Vendor" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data._vendor }}
						</div>
					</template>
				</Column>
				<Column field="vendor_invoice_number" header="Their #" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.vendor_invoice_number || "—" }}
						</div>
					</template>
				</Column>
				<Column field="_category" header="Category" sortable>
					<template #body="{ data }">
						<div class="truncate">
							<span v-if="data._categoryMeta" class="inline-flex items-center gap-1.5">
								<span
									class="inline-flex size-5 rounded items-center justify-center text-white shrink-0"
									:style="{ backgroundColor: themeHex(data._categoryMeta.color) }"
								>
									<UIcon :name="data._categoryMeta.icon" class="size-3" />
								</span>
								<span>{{ data._categoryMeta.name }}</span>
							</span>
							<span v-else class="text-(--ui-text-muted)">—</span>
						</div>
					</template>
				</Column>
				<Column field="issue_date" header="Issued" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.issue_date }}
						</div>
					</template>
				</Column>
				<Column field="due_date" header="Due" sortable>
					<template #body="{ data }">
						<div
							class="truncate tabular-nums"
							:class="data._status === 'overdue'
								? 'text-(--ui-error) font-medium'
								: 'text-(--ui-text-muted)'"
						>
							{{ data.due_date }}
						</div>
					</template>
				</Column>
				<Column
					field="total_cents"
					header="Total"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="truncate text-right tabular-nums">
							{{ formatLKR(data.total_cents) }}
						</div>
					</template>
				</Column>
				<Column
					field="_balance"
					header="Balance"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="truncate text-right tabular-nums">
							<span v-if="data._balance === 0" class="text-(--ui-text-muted)">—</span>
							<span v-else>{{ formatLKR(data._balance) }}</span>
						</div>
					</template>
				</Column>
				<Column field="_status" header="Status" sortable>
					<template #body="{ data }">
						<StatusBadge :status="data._status" />
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { BillRow, BillStatus, VendorSnapshot } from "~/stores/bills";
	import { formatLKR } from "~/lib/money";
	import { themeHex } from "~/lib/theme";
	import { useBillCategoriesStore } from "~/stores/bill_categories";
	import { useBillsStore } from "~/stores/bills";
	import { useVendorsStore } from "~/stores/vendors";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Bills" });

	const router = useRouter();
	const store = useBillsStore();
	const vendorsStore = useVendorsStore();
	const categoriesStore = useBillCategoriesStore();

	// Load every store the list / filter dropdowns / derived status
	// reach into, in parallel. Vouchers are essential because bill
	// status and balance are derived from linked payment vouchers.
	const vouchersStore = useVouchersStore();
	await Promise.all([
		store.load(),
		vendorsStore.load(),
		categoriesStore.load(),
		vouchersStore.load()
	]);

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	// Hoisted helpers — referenced from the row view-model below.
	function vendorNameOf(b: BillRow): string {
		try {
			return (JSON.parse(b.vendor_snapshot) as VendorSnapshot).name || "(no vendor)";
		} catch {
			return "(no vendor)";
		}
	}
	function categoryMetaOf(b: BillRow): { name: string, color: string, icon: string } | null {
		if (!b.category_snapshot) return null;
		try {
			return JSON.parse(b.category_snapshot) as { name: string, color: string, icon: string };
		} catch {
			return null;
		}
	}

	// View-model: PrimeVue sorts by top-level fields, so snapshot-derived
	// values (vendor name, category, balance, status) all get attached as
	// `_…` fields. The full category meta is preserved on `_categoryMeta`
	// so the Category cell can render its swatch + icon without re-parsing.
	interface BillRowVM extends BillRow {
		_vendor: string
		_category: string | null
		_categoryMeta: { name: string, color: string, icon: string } | null
		_balance: number
		_status: BillStatus
	}
	const rows = computed<BillRowVM[]>(() =>
		store.filtered.map((b) => {
			const meta = categoryMetaOf(b);
			return {
				...b,
				_vendor: vendorNameOf(b),
				_category: meta?.name ?? null,
				_categoryMeta: meta,
				_balance: store.balanceCentsFor(b),
				_status: store.derivedStatus(b)
			};
		})
	);

	const newBill = () => router.push("/bills/new");

	const vendorOptions = computed<{ label: string, value: number | "all" }[]>(() => [
		{ label: "All vendors", value: "all" },
		...[...vendorsStore.vendors]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((v) => ({ label: v.name, value: v.id }))
	]);

	// Categories: include an "Uncategorised" sentinel for bills without a
	// category_id (otherwise the user can't surface those rows in
	// isolation).
	const categoryOptions = computed<{ label: string, value: number | "all" | "uncategorised" }[]>(() => [
		{ label: "All categories", value: "all" },
		{ label: "Uncategorised", value: "uncategorised" },
		...[...categoriesStore.categories]
			.filter((c) => c.is_archived === 0)
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => ({ label: c.name, value: c.id }))
	]);

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.statusFilters.length > 0
		|| store.vendorFilter !== "all"
		|| store.categoryFilter !== "all"
		|| store.hasDateFilters
	);

	const resetFilters = () => {
		store.search = "";
		store.clearStatusFilters();
		store.vendorFilter = "all";
		store.categoryFilter = "all";
		store.clearDateFilters();
	};

	// Status chips. Colour map mirrors StatusBadge so the filter and
	// the row badge speak the same visual language.
	const BILL_STATUSES: BillStatus[] = [
		"unpaid",
		"partial",
		"paid",
		"overdue",
		"cancelled"
	];
	const STATUS_LABEL: Record<BillStatus, string> = {
		unpaid: "Unpaid",
		partial: "Partial",
		paid: "Paid",
		overdue: "Overdue",
		cancelled: "Cancelled"
	};
	const STATUS_ACTIVE_CLASSES: Record<BillStatus, string> = {
		unpaid: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		partial: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		paid: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		overdue: "bg-(--ui-error)/15 border-(--ui-error)/40 text-(--ui-error)",
		cancelled: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text-muted)"
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const statusChipClasses = (s: BillStatus): string =>
		store.statusFilters.includes(s) ? STATUS_ACTIVE_CLASSES[s] : inactiveChip;

	// Quick issue-date presets — same shape as Quotes / Invoices.
	type DatePresetKey = "today" | "this_week" | "this_month" | "this_year";
	const DATE_PRESETS: { key: DatePresetKey, label: string }[] = [
		{ key: "today", label: "Today" },
		{ key: "this_week", label: "This week" },
		{ key: "this_month", label: "This month" },
		{ key: "this_year", label: "This year" }
	];
	const isoFromDate = (d: Date): string =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const datePresetBounds = (key: DatePresetKey): { from: string, to: string } => {
		const now = new Date();
		if (key === "today") {
			const iso = isoFromDate(now);
			return { from: iso, to: iso };
		}
		if (key === "this_week") {
			const daysSinceMon = (now.getDay() + 6) % 7;
			const monday = new Date(now);
			monday.setDate(now.getDate() - daysSinceMon);
			const sunday = new Date(monday);
			sunday.setDate(monday.getDate() + 6);
			return { from: isoFromDate(monday), to: isoFromDate(sunday) };
		}
		if (key === "this_month") {
			const first = new Date(now.getFullYear(), now.getMonth(), 1);
			const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			return { from: isoFromDate(first), to: isoFromDate(last) };
		}
		const first = new Date(now.getFullYear(), 0, 1);
		const last = new Date(now.getFullYear(), 11, 31);
		return { from: isoFromDate(first), to: isoFromDate(last) };
	};
	const isDatePresetActive = (key: DatePresetKey): boolean => {
		const { from, to } = datePresetBounds(key);
		return store.issuedFrom === from && store.issuedTo === to;
	};
	const toggleDatePreset = (key: DatePresetKey) => {
		if (isDatePresetActive(key)) {
			store.issuedFrom = null;
			store.issuedTo = null;
			return;
		}
		const { from, to } = datePresetBounds(key);
		store.issuedFrom = from;
		store.issuedTo = to;
	};
	const datePresetClasses = (key: DatePresetKey): string =>
		isDatePresetActive(key)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: inactiveChip;
</script>
