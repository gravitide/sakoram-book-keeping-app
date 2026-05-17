<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			vouchers, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Vouchers
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
					{{ store.vouchers.length }} total ·
					<span class="text-(--ui-success)">+ {{ formatLKR(store.totalReceipts) }}</span>
					received ·
					<span class="text-(--ui-error)">− {{ formatLKR(store.totalPayments) }}</span>
					paid out
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newVoucher">
				New voucher
			</UButton>
		</header>

		<UCard>
			<template #header>
				<!-- Filter strip — chip-style type filter + Advanced
					popover for date range. Same pattern as the other
					ledgers. -->
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by number, party, reference…"
							icon="i-lucide-search"
							size="md"
							class="flex-1 min-w-64"
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
											Voucher date
										</div>
										<DateRangeField
											v-model:from="store.dateFrom"
											v-model:to="store.dateTo"
										/>
									</div>
									<div v-if="store.hasDateFilters" class="pt-2 border-t border-(--ui-border) flex justify-end">
										<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="store.clearDateFilters">
											Clear date filter
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
					</div>

					<div class="flex items-center gap-1.5 flex-wrap">
						<UIcon name="i-lucide-arrow-left-right" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
						<button
							v-for="t in VOUCHER_TYPES"
							:key="t"
							type="button"
							class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
							:class="typeChipClasses(t)"
							@click="store.toggleTypeFilter(t)"
						>
							{{ TYPE_LABEL[t] }}
						</button>
					</div>

					<div class="flex items-center gap-1.5 flex-wrap">
						<UIcon name="i-lucide-calendar" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
						<span class="text-xs text-(--ui-text-muted) mr-1">Date:</span>
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
				Loading vouchers…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-ticket" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.vouchers.length === 0">
					No vouchers yet. Click <span class="font-medium">New voucher</span> to log one.
				</div>
				<div v-else>
					No vouchers match your filters.
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
							:active="list.sortKey === 'type'"
							:dir="list.sortDir"
							@sort="list.toggleSort('type')"
						>
							Type
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'date'"
							:dir="list.sortDir"
							@sort="list.toggleSort('date')"
						>
							Date
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'party'"
							:dir="list.sortDir"
							@sort="list.toggleSort('party')"
						>
							Party
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'method'"
							:dir="list.sortDir"
							@sort="list.toggleSort('method')"
						>
							Method
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'reference'"
							:dir="list.sortDir"
							@sort="list.toggleSort('reference')"
						>
							Reference
						</SortableTh>
						<SortableTh
							th-class="py-2 pl-2 pr-3 font-medium text-right"
							:active="list.sortKey === 'amount'"
							:dir="list.sortDir"
							@sort="list.toggleSort('amount')"
						>
							Amount
						</SortableTh>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="v in list.paged"
						:key="v.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="open(v)"
					>
						<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
							{{ v.number }}
						</td>
						<td class="py-2 px-2">
							<UBadge :color="v.voucher_type === 'receipt' ? 'success' : 'warning'" variant="subtle" size="sm">
								{{ v.voucher_type === 'receipt' ? 'Receipt' : 'Payment' }}
							</UBadge>
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ v.voucher_date }}
						</td>
						<td class="py-2 px-2">
							{{ v.party_name }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ methodLabel(v.payment_method) }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ v.reference || "—" }}
						</td>
						<td class="py-2 pl-2 pr-3 text-right tabular-nums whitespace-nowrap font-medium" :class="v.voucher_type === 'receipt' ? 'text-(--ui-success)' : 'text-(--ui-error)'">
							{{ v.voucher_type === 'receipt' ? '+' : '−' }} {{ formatLKR(v.amount_cents) }}
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
	import type { VoucherRow, VoucherType } from "~/stores/vouchers";
	import { useListView } from "~/composables/useListView";
	import { formatLKR } from "~/lib/money";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Vouchers" });

	const router = useRouter();
	const store = useVouchersStore();

	await store.load();

	const list = useListView<VoucherRow>(
		() => store.filtered,
		[
			{ key: "number", getValue: (v) => v.number },
			{ key: "type", getValue: (v) => v.voucher_type },
			{ key: "date", getValue: (v) => v.voucher_date },
			{ key: "party", getValue: (v) => v.party_name },
			{ key: "method", getValue: (v) => v.payment_method },
			{ key: "reference", getValue: (v) => v.reference },
			{ key: "amount", getValue: (v) => v.amount_cents }
		],
		{ defaultSortKey: "date", defaultDir: "desc" }
	);

	const newVoucher = () => router.push("/vouchers/new");
	const open = (v: VoucherRow) => router.push(`/vouchers/${v.id}`);

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.typeFilters.length > 0
		|| store.hasDateFilters
	);

	const resetFilters = () => {
		store.search = "";
		store.clearTypeFilters();
		store.clearDateFilters();
	};

	// Type chips. Two values only — multi-select still works (selecting
	// both equals neither). Receipts use success-green (money in),
	// payments use error-red (money out) so the colour aligns with the
	// dashboard's cash-flow chart.
	const VOUCHER_TYPES: VoucherType[] = ["receipt", "payment"];
	const TYPE_LABEL: Record<VoucherType, string> = {
		receipt: "Receipts",
		payment: "Payments"
	};
	const TYPE_ACTIVE_CLASSES: Record<VoucherType, string> = {
		receipt: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		payment: "bg-(--ui-error)/15 border-(--ui-error)/40 text-(--ui-error)"
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const typeChipClasses = (t: VoucherType): string =>
		store.typeFilters.includes(t) ? TYPE_ACTIVE_CLASSES[t] : inactiveChip;

	// Quick date presets — same shape as the other ledgers, applied to
	// voucher_date.
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
		return store.dateFrom === from && store.dateTo === to;
	};
	const toggleDatePreset = (key: DatePresetKey) => {
		if (isDatePresetActive(key)) {
			store.dateFrom = null;
			store.dateTo = null;
			return;
		}
		const { from, to } = datePresetBounds(key);
		store.dateFrom = from;
		store.dateTo = to;
	};
	const datePresetClasses = (key: DatePresetKey): string =>
		isDatePresetActive(key)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: inactiveChip;

	const methodLabel = (m: string | null): string => {
		if (!m) return "—";
		return ({
			bank_transfer: "Bank transfer",
			cash: "Cash",
			cheque: "Cheque",
			card: "Card",
			other: "Other"
		} as Record<string, string>)[m] ?? m;
	};
</script>
