<template>
	<!-- "Read this first" band at the top of the quote detail page — the quote
		sibling of InvoiceSummaryHero. Quotes carry no payments, so the money
		side is just the Total; the date line shows "Valid until" (red once the
		quote has expired). Purely presentational — the page feeds every value
		from its existing computeds. See app/pages/quotes/[id].vue. -->
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
			<div v-if="projectTitle" class="text-sm text-(--ui-text-muted) mt-0.5">
				{{ projectTitle }}
			</div>
			<div class="text-xs text-(--ui-text-muted) mt-0.5 tabular-nums">
				Issued {{ issueDate }}
				<span class="mx-1">·</span>
				<span :class="expired ? 'text-(--ui-error) font-medium' : ''">Valid until {{ validUntil }}</span>
			</div>
		</div>

		<!-- Money: a quote has no payment state, so just the headline total. -->
		<div class="shrink-0">
			<div class="rounded-md bg-(--ui-bg-muted) px-4 py-2.5 min-w-[7.5rem]">
				<div class="text-[11px] uppercase tracking-wider text-(--ui-text-muted) select-none">
					Total
				</div>
				<div class="text-xl font-semibold tabular-nums mt-0.5">
					{{ formatLKR(totalCents) }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { formatLKR } from "~/lib/money";

	// Display values, resolved on the page (derivedStatus / computedTotals /
	// clientSnapshot / form dates). `status` drives the badge and the expired
	// tinting on the valid-until date.
	const props = defineProps<{
		number: string
		status: string
		clientName?: string | null
		projectTitle?: string | null
		issueDate: string
		validUntil: string
		totalCents: number
		editable: boolean
	}>();

	const expired = computed(() => props.status === "expired");
</script>
