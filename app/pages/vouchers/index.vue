<template>
	<div>
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
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<UInput
						v-model="store.search"
						placeholder="Search by number, party, reference…"
						icon="i-lucide-search"
						class="md:w-96"
					/>
					<USelect
						v-model="store.typeFilter"
						:items="typeOptions"
						value-key="value"
						class="w-40"
					/>
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

	const typeOptions: { label: string, value: VoucherType | "all" }[] = [
		{ label: "All", value: "all" },
		{ label: "Payments", value: "payment" },
		{ label: "Receipts", value: "receipt" }
	];

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
