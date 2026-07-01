<template>
	<!-- Relationship banner shown on a document that is linked to another via
		the quote → invoice conversion. Purely presentational: the host page
		fetches the linked document's summary and feeds the display values in,
		so this component stays reusable for both directions (invoice showing
		its source quote, quote showing the invoice it became). Sits full-width
		above the Reference / party grid on the detail pages. -->
	<!-- Violet is the fixed "linked / converted relationship" colour — kept
		distinct from the semantic status colours (green paid / red error /
		amber warning / blue info) so type and status never read as the same
		signal. Not tied to the theme accent on purpose. -->
	<div class="rounded-lg border border-violet-500/20 bg-violet-500/10 px-4 py-3">
		<!-- Top row: the relationship as an accent tag on the left, the jump
			link on the right. -->
		<div class="flex items-center justify-between gap-3">
			<span class="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-2 py-1 rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-300 select-none">
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
		<!-- Main row: the two things that matter — which document (identity,
			left) and how much (figure, right). Date + status recede. -->
		<div class="flex items-end justify-between gap-4 flex-wrap mt-3">
			<div>
				<div class="flex items-center gap-2.5">
					<span class="text-lg font-semibold tabular-nums">{{ number }}</span>
					<StatusBadge :status="status" />
				</div>
				<div class="text-xs text-(--ui-text-muted) mt-1">
					Issued {{ issueDate }}
				</div>
			</div>
			<div class="text-right">
				<div class="text-[11px] uppercase tracking-wider text-(--ui-text-muted) select-none">
					Amount
				</div>
				<div class="text-lg font-semibold tabular-nums mt-0.5">
					{{ formatLKR(totalCents) }}
				</div>
			</div>
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
