<template>
	<div>
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
				<!-- Filter strip — bills have more dimensions than the
					quote/invoice equivalents (vendor + category + dates),
					so the second row stretches a bit wider. -->
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
						<USelect
							v-model="store.statusFilter"
							:items="statusOptions"
							value-key="value"
							icon="i-lucide-flag"
							class="w-44"
						/>
					</div>

					<div class="flex items-center gap-4 flex-wrap text-sm">
						<div class="flex items-center gap-2">
							<UIcon name="i-lucide-calendar" class="size-3.5 text-(--ui-text-muted)" />
							<span class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted)">Issued</span>
							<DateRangeField
								v-model:from="store.issuedFrom"
								v-model:to="store.issuedTo"
							/>
						</div>
						<div class="flex items-center gap-2">
							<UIcon name="i-lucide-calendar-clock" class="size-3.5 text-(--ui-text-muted)" />
							<span class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted)">Due</span>
							<DateRangeField
								v-model:from="store.dueFrom"
								v-model:to="store.dueTo"
							/>
						</div>
						<UButton
							v-if="hasAnyFilter"
							size="xs"
							variant="soft"
							color="neutral"
							icon="i-lucide-x"
							class="ml-auto"
							@click="resetFilters"
						>
							Reset filters
						</UButton>
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
			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<SortableTh
							th-class="py-2 pl-3 pr-2 font-medium"
							:active="list.sortKey === 'number'"
							:dir="list.sortDir"
							@sort="list.toggleSort('number')"
						>
							Number
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'vendor'"
							:dir="list.sortDir"
							@sort="list.toggleSort('vendor')"
						>
							Vendor
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'their_number'"
							:dir="list.sortDir"
							@sort="list.toggleSort('their_number')"
						>
							Their #
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'category'"
							:dir="list.sortDir"
							@sort="list.toggleSort('category')"
						>
							Category
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'issue_date'"
							:dir="list.sortDir"
							@sort="list.toggleSort('issue_date')"
						>
							Issued
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'due_date'"
							:dir="list.sortDir"
							@sort="list.toggleSort('due_date')"
						>
							Due
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium text-right"
							:active="list.sortKey === 'total'"
							:dir="list.sortDir"
							@sort="list.toggleSort('total')"
						>
							Total
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium text-right"
							:active="list.sortKey === 'balance'"
							:dir="list.sortDir"
							@sort="list.toggleSort('balance')"
						>
							Balance
						</SortableTh>
						<SortableTh
							th-class="py-2 pl-2 pr-3 font-medium"
							:active="list.sortKey === 'status'"
							:dir="list.sortDir"
							@sort="list.toggleSort('status')"
						>
							Status
						</SortableTh>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="b in list.paged"
						:key="b.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="open(b)"
					>
						<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
							{{ b.number }}
						</td>
						<td class="py-2 px-2">
							{{ vendorNameOf(b) }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ b.vendor_invoice_number || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							<span v-if="categoryOf(b)" class="inline-flex items-center gap-1.5">
								<span
									class="inline-flex size-5 rounded items-center justify-center text-white shrink-0"
									:style="{ backgroundColor: themeHex(categoryOf(b)!.color) }"
								>
									<UIcon :name="categoryOf(b)!.icon" class="size-3" />
								</span>
								<span class="text-(--ui-text)">{{ categoryOf(b)!.name }}</span>
							</span>
							<span v-else>—</span>
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ b.issue_date }}
						</td>
						<td class="py-2 px-2 tabular-nums" :class="statusOf(b) === 'overdue' ? 'text-(--ui-error) font-medium' : 'text-(--ui-text-muted)'">
							{{ b.due_date }}
						</td>
						<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
							{{ formatLKR(b.total_cents) }}
						</td>
						<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
							<span v-if="balanceOf(b) === 0" class="text-(--ui-text-muted)">—</span>
							<span v-else>{{ formatLKR(balanceOf(b)) }}</span>
						</td>
						<td class="py-2 pl-2 pr-3">
							<StatusBadge :status="statusOf(b)" />
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
	</div>
</template>

<script setup lang="ts">
	import type { BillRow, BillStatus, VendorSnapshot } from "~/stores/bills";
	import { useListView } from "~/composables/useListView";
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

	const list = useListView<BillRow>(
		() => store.filtered,
		[
			{ key: "number", getValue: (b) => b.number },
			{ key: "vendor", getValue: (b) => vendorNameOf(b) },
			{ key: "their_number", getValue: (b) => b.vendor_invoice_number },
			{ key: "category", getValue: (b) => categoryOf(b)?.name ?? null },
			{ key: "issue_date", getValue: (b) => b.issue_date },
			{ key: "due_date", getValue: (b) => b.due_date },
			{ key: "total", getValue: (b) => b.total_cents },
			{ key: "balance", getValue: (b) => store.balanceCentsFor(b) },
			{ key: "status", getValue: (b) => store.derivedStatus(b) }
		],
		{ defaultSortKey: "issue_date", defaultDir: "desc" }
	);

	const newBill = () => router.push("/bills/new");
	const open = (b: BillRow) => router.push(`/bills/${b.id}`);

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
		|| store.statusFilter !== "all"
		|| store.vendorFilter !== "all"
		|| store.categoryFilter !== "all"
		|| store.hasDateFilters
	);

	const resetFilters = () => {
		store.search = "";
		store.statusFilter = "all";
		store.vendorFilter = "all";
		store.categoryFilter = "all";
		store.clearDateFilters();
	};

	const statusOptions: { label: string, value: BillStatus | "all" | "outstanding" }[] = [
		{ label: "All", value: "all" },
		{ label: "Outstanding", value: "outstanding" },
		{ label: "Unpaid", value: "unpaid" },
		{ label: "Partial", value: "partial" },
		{ label: "Paid", value: "paid" },
		{ label: "Overdue", value: "overdue" },
		{ label: "Cancelled", value: "cancelled" }
	];

	// Balance + status are derived from the linked payment vouchers
	// (and due date) — see bills store. The list table just delegates.
	const balanceOf = (b: BillRow) => store.balanceCentsFor(b);
	const statusOf = (b: BillRow) => store.derivedStatus(b);

	// Function declarations (not const arrows) so they hoist above the
	// useListView() call site, which references them in column getValues.

	// Vendor name lives in the JSON snapshot frozen at creation time.
	// Falls back gracefully if the snapshot is missing or malformed.
	function vendorNameOf(b: BillRow): string {
		try {
			return (JSON.parse(b.vendor_snapshot) as VendorSnapshot).name || "(no vendor)";
		} catch {
			return "(no vendor)";
		}
	}

	// Category name/color/icon also live in a frozen snapshot, so renames or
	// recolors don't rewrite older bill rows. Returns null when the bill has
	// no category (or the snapshot is malformed).
	function categoryOf(b: BillRow): { name: string, color: string, icon: string } | null {
		if (!b.category_snapshot) return null;
		try {
			return JSON.parse(b.category_snapshot) as { name: string, color: string, icon: string };
		} catch {
			return null;
		}
	}
</script>
