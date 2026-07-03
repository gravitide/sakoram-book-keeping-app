<template>
	<!-- "Read this first" band at the top of the invoice detail page. Groups
		the identity (number / status / client / dates) on the left with the
		money that matters (Total / Paid / Balance) as big legible tiles on the
		right. Purely presentational — every value is fed in by the page from
		its existing computeds, so this component holds no logic and no store
		access. See app/pages/invoices/[id].vue. -->
	<div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) shadow-md shadow-black/10 px-5 py-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
		<!-- Identity -->
		<div class="min-w-0">
			<div class="flex items-center gap-3 flex-wrap">
				<span class="text-2xl font-semibold tabular-nums">{{ number }}</span>
				<StatusBadge :status="status" size="md" />
				<span v-if="!editable" class="text-xs text-(--ui-text-muted) font-normal">
					read-only after issue
				</span>
			</div>
			<div v-if="clientName" class="text-sm text-(--ui-text) mt-2">
				{{ clientName }}
			</div>
			<div class="text-xs text-(--ui-text-muted) mt-0.5 tabular-nums">
				Issued {{ issueDate }}
				<span class="mx-1">·</span>
				<span :class="overdue ? 'text-(--ui-error) font-medium' : ''">Due {{ dueDate }}</span>
			</div>
		</div>

		<!-- Money tiles: Total always; Paid + Balance once anything is paid;
			Overpaid replaces Balance when receipts exceed the total. -->
		<div class="flex gap-3 flex-wrap shrink-0">
			<div class="rounded-md bg-(--ui-bg-muted) px-4 py-2.5 min-w-[7.5rem]">
				<div class="text-[11px] uppercase tracking-wider text-(--ui-text-muted) select-none">
					Total
				</div>
				<div class="text-xl font-semibold tabular-nums mt-0.5">
					{{ formatLKR(totalCents) }}
				</div>
			</div>
			<div v-if="paidCents > 0" class="rounded-md bg-(--ui-bg-muted) px-4 py-2.5 min-w-[7.5rem]">
				<div class="text-[11px] uppercase tracking-wider text-(--ui-text-muted) select-none">
					Paid
				</div>
				<div class="text-xl font-semibold tabular-nums mt-0.5 text-(--ui-success)">
					{{ formatLKR(paidCents) }}
				</div>
			</div>
			<div v-if="paidCents > 0 && overpaidCents === 0" class="rounded-md bg-(--ui-bg-muted) px-4 py-2.5 min-w-[7.5rem]">
				<div class="text-[11px] uppercase tracking-wider text-(--ui-text-muted) select-none">
					Balance
				</div>
				<div
					class="text-xl font-semibold tabular-nums mt-0.5"
					:class="overdue && balanceCents > 0 ? 'text-(--ui-error)' : 'text-(--ui-text)'"
				>
					{{ formatLKR(balanceCents) }}
				</div>
			</div>
			<div v-if="overpaidCents > 0" class="rounded-md bg-(--ui-warning)/10 px-4 py-2.5 min-w-[7.5rem]">
				<div class="text-[11px] uppercase tracking-wider text-(--ui-text-muted) select-none">
					Overpaid by
				</div>
				<div class="text-xl font-semibold tabular-nums mt-0.5 text-(--ui-warning)">
					{{ formatLKR(overpaidCents) }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { formatLKR } from "~/lib/money";

	// All display values — resolved on the page from existing computeds
	// (derivedStatus / computedTotals / paidCentsFor / balanceCents /
	// clientSnapshot / form dates). `status` drives both the badge and the
	// overdue tinting; overpaid is signalled by `overpaidCents > 0`.
	const props = defineProps<{
		number: string
		status: string
		clientName?: string | null
		issueDate: string
		dueDate: string
		totalCents: number
		paidCents: number
		balanceCents: number
		overpaidCents: number
		editable: boolean
	}>();

	const overdue = computed(() => props.status === "overdue");
</script>
