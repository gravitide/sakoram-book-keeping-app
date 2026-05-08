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
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<UInput
						v-model="store.search"
						placeholder="Search by number, vendor, vendor invoice…"
						icon="i-lucide-search"
						class="md:w-96"
					/>
					<USelect
						v-model="store.statusFilter"
						:items="statusOptions"
						value-key="value"
						class="w-48"
					/>
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
						<td class="py-2 px-2 tabular-nums" :class="b.status === 'overdue' ? 'text-(--ui-error) font-medium' : 'text-(--ui-text-muted)'">
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
							<StatusBadge :status="b.status" />
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
	import { useBillsStore } from "~/stores/bills";

	definePageMeta({ title: "Bills" });

	const router = useRouter();
	const store = useBillsStore();

	await store.load();
	await store.flagOverdue().catch(() => { /* non-fatal */ });

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
			{ key: "balance", getValue: (b) => Math.max(0, b.total_cents - b.paid_cents) },
			{ key: "status", getValue: (b) => b.status }
		],
		{ defaultSortKey: "issue_date", defaultDir: "desc" }
	);

	const newBill = () => router.push("/bills/new");
	const open = (b: BillRow) => router.push(`/bills/${b.id}`);

	const statusOptions: { label: string, value: BillStatus | "all" | "outstanding" }[] = [
		{ label: "All", value: "all" },
		{ label: "Outstanding", value: "outstanding" },
		{ label: "Unpaid", value: "unpaid" },
		{ label: "Partial", value: "partial" },
		{ label: "Paid", value: "paid" },
		{ label: "Overdue", value: "overdue" },
		{ label: "Cancelled", value: "cancelled" }
	];

	const balanceOf = (b: BillRow) => Math.max(0, b.total_cents - b.paid_cents);

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
