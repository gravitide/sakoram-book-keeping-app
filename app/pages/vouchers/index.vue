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

			<!-- Table action bar + filtered-rows summary. Auto-fit on
				the left; receipts/payments/net on the right (vouchers
				carry both directions). -->
			<div
				v-if="!store.loading && !store.error"
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
				<div class="flex items-baseline gap-3 ml-auto flex-wrap">
					<span v-if="hasAnyFilter" class="text-xs">{{ store.filtered.length }} of {{ store.vouchers.length }} shown</span>
					<span class="text-(--ui-success)">+ {{ formatLKR(filteredReceipts) }}</span>
					<span class="text-(--ui-error)">− {{ formatLKR(filteredPayments) }}</span>
					<span>
						Net
						<span
							class="font-medium"
							:class="filteredNet >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
						>
							{{ filteredNet >= 0 ? '+' : '−' }}{{ formatLKR(Math.abs(filteredNet)) }}
						</span>
					</span>
				</div>
			</div>

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

			<!-- No `:row-actions` — the original vouchers list page had no
				overflow / right-click menu, so the migration preserves
				that. First-cell click opens the voucher detail. -->
			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="store.filtered"
				state-key="vouchers-table"
				default-sort-field="voucher_date"
				:default-sort-order="-1"
				@row-click="(row) => router.push(`/vouchers/${row.id}`)"
			>
				<Column field="number" header="Number" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number }}
						</div>
					</template>
				</Column>
				<Column field="voucher_type" header="Type" sortable>
					<template #body="{ data }">
						<UBadge :color="data.voucher_type === 'receipt' ? 'success' : 'warning'" variant="subtle" size="sm">
							{{ data.voucher_type === 'receipt' ? 'Receipt' : 'Payment' }}
						</UBadge>
					</template>
				</Column>
				<Column field="voucher_date" header="Date" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.voucher_date }}
						</div>
					</template>
				</Column>
				<Column field="party_name" header="Party" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data.party_name }}
						</div>
					</template>
				</Column>
				<Column field="payment_method" header="Method" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ methodLabel(data.payment_method) }}
						</div>
					</template>
				</Column>
				<Column field="reference" header="Reference" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.reference || "—" }}
						</div>
					</template>
				</Column>
				<Column
					field="amount_cents"
					header="Amount"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div
							class="truncate text-right tabular-nums whitespace-nowrap font-medium"
							:class="data.voucher_type === 'receipt' ? 'text-(--ui-success)' : 'text-(--ui-error)'"
						>
							{{ data.voucher_type === 'receipt' ? '+' : '−' }} {{ formatLKR(data.amount_cents) }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { VoucherType } from "~/stores/vouchers";
	import { formatLKR } from "~/lib/money";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Vouchers" });

	const router = useRouter();
	const store = useVouchersStore();

	await store.load();

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	const newVoucher = () => router.push("/vouchers/new");

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.typeFilters.length > 0
		|| store.hasDateFilters
	);

	// Filtered totals — split by direction (receipt vs payment) so the
	// readout matches the dual-direction nature of the voucher ledger.
	// Net is just (in - out) on the visible slice.
	const filteredReceipts = computed(() =>
		store.filtered
			.filter((v) => v.voucher_type === "receipt")
			.reduce((sum, v) => sum + v.amount_cents, 0)
	);
	const filteredPayments = computed(() =>
		store.filtered
			.filter((v) => v.voucher_type === "payment")
			.reduce((sum, v) => sum + v.amount_cents, 0)
	);
	const filteredNet = computed(() => filteredReceipts.value - filteredPayments.value);

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
