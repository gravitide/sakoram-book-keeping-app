<template>
	<div>
		<!-- Column header — hidden below md since rows reflow to a single column. -->
		<div class="hidden md:grid md:grid-cols-[10rem_minmax(12rem,1fr)_8rem_8rem_minmax(10rem,16rem)] gap-3 text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border) pb-2 mb-3">
			<span>Date</span>
			<span>Description</span>
			<span class="text-right">Amount</span>
			<span>Status</span>
			<span>Actions</span>
		</div>

		<div class="space-y-2">
			<div
				v-for="row in rows"
				:key="row.id"
				class="rounded-lg border bg-(--ui-bg-elevated)/40 p-3 md:grid md:grid-cols-[10rem_minmax(12rem,1fr)_8rem_8rem_minmax(10rem,16rem)] md:gap-3 md:items-center"
				:class="rowToneClass(row)"
			>
				<!-- Date -->
				<div class="text-sm tabular-nums">
					{{ row.statement_date }}
				</div>

				<!-- Description + reference -->
				<div class="min-w-0">
					<div class="font-medium truncate">
						{{ row.description || "—" }}
					</div>
					<div v-if="row.reference" class="text-xs text-(--ui-text-muted) truncate font-mono">
						{{ row.reference }}
					</div>
				</div>

				<!-- Amount -->
				<div class="tabular-nums text-right font-medium" :class="row.amount_cents > 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'">
					{{ row.amount_cents > 0 ? "+" : "−" }}{{ formatLKR(Math.abs(row.amount_cents)) }}
				</div>

				<!-- Status badge -->
				<div>
					<UBadge v-if="row.matched_voucher_id !== null" color="success" variant="subtle">
						Matched
					</UBadge>
					<UBadge v-else-if="hasSuggestion(row)" color="warning" variant="subtle">
						Suggested
					</UBadge>
					<UBadge v-else color="neutral" variant="subtle">
						Unmatched
					</UBadge>
				</div>

				<!-- Actions -->
				<div class="flex items-center gap-1.5 flex-wrap">
					<template v-if="row.matched_voucher_id !== null">
						<NuxtLink :to="`/vouchers/${row.matched_voucher_id}`" class="text-xs font-mono text-(--ui-primary) hover:underline">
							{{ voucherNumberOf(row.matched_voucher_id) }}
						</NuxtLink>
						<UButton
							size="xs"
							variant="ghost"
							color="neutral"
							icon="i-lucide-unlink"
							title="Unlink"
							@click="$emit('unlink', row.id)"
						/>
					</template>
					<template v-else-if="hasSuggestion(row)">
						<NuxtLink :to="`/vouchers/${topSuggestionOf(row)!.voucher.id}`" class="text-xs font-mono text-(--ui-primary) hover:underline">
							{{ voucherNumberOf(topSuggestionOf(row)!.voucher.id) }}
						</NuxtLink>
						<UButton size="xs" variant="solid" color="primary" @click="$emit('accept', row.id, topSuggestionOf(row)!.voucher.id)">
							Accept
						</UButton>
						<UButton size="xs" variant="soft" color="neutral" @click="$emit('pickOther', row.id)">
							Other
						</UButton>
					</template>
					<template v-else>
						<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-search" @click="$emit('findVoucher', row.id)">
							Find
						</UButton>
						<UButton size="xs" variant="soft" color="primary" icon="i-lucide-plus" @click="$emit('createVoucher', row.id)">
							Create
						</UButton>
					</template>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import type { MatchCandidate } from "~/lib/reconcile-match";
	import type { BankStatementRowRow } from "~/stores/bank_statements";
	import { formatLKR } from "~/lib/money";
	import { useVouchersStore } from "~/stores/vouchers";

	const props = defineProps<{
		rows: BankStatementRowRow[]
		suggestions: Map<number, MatchCandidate[]>
	}>();

	defineEmits<{
		accept: [rowId: number, voucherId: number]
		unlink: [rowId: number]
		pickOther: [rowId: number]
		findVoucher: [rowId: number]
		createVoucher: [rowId: number]
	}>();

	const vouchers = useVouchersStore();

	const hasSuggestion = (row: BankStatementRowRow) =>
		(props.suggestions.get(row.id)?.length ?? 0) > 0;

	const topSuggestionOf = (row: BankStatementRowRow): MatchCandidate | undefined =>
		props.suggestions.get(row.id)?.[0];

	const voucherNumberOf = (id: number): string =>
		vouchers.vouchers.find((v) => v.id === id)?.number ?? `#${id}`;

	const rowToneClass = (row: BankStatementRowRow): string => {
		if (row.matched_voucher_id !== null) return "border-(--ui-success)/30";
		if (hasSuggestion(row)) return "border-(--ui-warning)/30";
		return "border-(--ui-border)";
	};
</script>
