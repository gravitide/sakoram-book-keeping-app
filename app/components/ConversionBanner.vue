<template>
	<!-- Relationship banner shown on a document that is linked to another via
		the quote → invoice conversion. Purely presentational: the host page
		fetches the linked document's summary and feeds the display values in,
		so this component stays reusable for both directions (invoice showing
		its source quote, quote showing the invoice it became). Sits full-width
		above the Reference / party grid on the detail pages. -->
	<div class="rounded-lg border border-(--ui-border) border-l-4 border-l-(--ui-primary) bg-(--ui-primary)/5 px-4 py-3 flex items-center gap-4 flex-wrap">
		<UIcon name="i-lucide-link-2" class="size-5 text-(--ui-primary) shrink-0" />
		<div class="min-w-0 flex-1">
			<div class="text-[11px] uppercase tracking-wider text-(--ui-text-muted) select-none">
				{{ lead }}
			</div>
			<div class="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1">
				<span class="font-semibold tabular-nums">{{ number }}</span>
				<StatusBadge :status="status" />
				<span class="text-sm text-(--ui-text-muted) tabular-nums">{{ issueDate }}</span>
				<span class="text-sm font-medium tabular-nums">{{ formatLKR(totalCents) }}</span>
			</div>
		</div>
		<UButton
			:to="to"
			size="sm"
			color="neutral"
			variant="soft"
			icon="i-lucide-arrow-up-right"
			class="shrink-0"
		>
			View
		</UButton>
	</div>
</template>

<script setup lang="ts">
	import { formatLKR } from "~/lib/money";

	// Display-only values — the host page resolves them from the linked
	// document (see invoices/[id].vue + quotes/[id].vue). `status` is passed
	// straight to StatusBadge, so quote statuses and invoice derived statuses
	// both work without this component knowing which kind it is.
	defineProps<{
		lead: string
		number: string
		issueDate: string
		totalCents: number
		status: string
		to: string
	}>();
</script>
