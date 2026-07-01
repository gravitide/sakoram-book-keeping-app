<template>
	<!-- Relationship banner shown on a document that is linked to another via
		the quote → invoice conversion. Purely presentational: the host page
		fetches the linked document's summary and feeds the display values in,
		so this component stays reusable for both directions (invoice showing
		its source quote, quote showing the invoice it became). Sits full-width
		above the Reference / party grid on the detail pages. -->
	<div class="rounded-lg border border-(--ui-border) bg-(--ui-bg) px-4 py-3">
		<!-- Top row: the relationship as an accent tag on the left, the jump
			link on the right. -->
		<div class="flex items-center justify-between gap-3">
			<span class="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-2 py-1 rounded-md bg-(--ui-primary)/10 text-(--ui-primary) select-none">
				<UIcon name="i-lucide-link-2" class="size-3.5" />
				{{ lead }}
			</span>
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
		<!-- Details row: the linked document at a glance. -->
		<div class="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2.5">
			<span class="font-semibold tabular-nums">{{ number }}</span>
			<StatusBadge :status="status" />
			<span class="text-sm text-(--ui-text-muted) tabular-nums">{{ issueDate }}</span>
			<span class="text-sm font-medium tabular-nums">{{ formatLKR(totalCents) }}</span>
		</div>
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
