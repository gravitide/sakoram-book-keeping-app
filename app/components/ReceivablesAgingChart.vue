<template>
	<div>
		<!-- Top-line summary: total outstanding + breakdown chip count.
			The "current" bucket gets a softer tone since money that
			isn't overdue yet isn't actionable today. -->
		<div class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
			<div>
				<div class="text-2xl font-semibold tabular-nums">
					{{ formatLKR(total) }}
				</div>
				<div class="text-xs text-(--ui-text-muted) mt-0.5">
					Outstanding across {{ openInvoiceCount }} {{ openInvoiceCount === 1 ? "invoice" : "invoices" }}
				</div>
			</div>
			<div v-if="overdueAmount > 0" class="text-xs">
				<span class="text-(--ui-error) font-semibold tabular-nums">{{ formatLKR(overdueAmount) }}</span>
				<span class="text-(--ui-text-muted)"> overdue</span>
			</div>
		</div>

		<div v-if="total === 0" class="py-8 text-center text-sm text-(--ui-text-muted)">
			<UIcon name="i-lucide-circle-check" class="size-8 block mx-auto mb-2 text-(--ui-success)" />
			Everything paid. Nothing outstanding.
		</div>

		<template v-else>
			<!-- Stacked horizontal bar: each bucket gets a slice
				proportional to its share of the total outstanding. We
				show the bar before the legend so the eye lands on the
				visual first; the legend below gives the exact numbers. -->
			<div class="h-3 w-full rounded-full overflow-hidden flex bg-(--ui-bg-muted)">
				<div
					v-for="b in nonEmptyBuckets"
					:key="b.key"
					:class="b.barClass"
					:style="{ width: `${(b.amount / total) * 100}%` }"
					:title="`${b.label}: ${formatLKR(b.amount)}`"
				/>
			</div>

			<!-- Legend: one row per bucket, with count + amount. The
				row stays in the layout even when the bucket is empty
				so the user has a stable mental model of the brackets;
				zero rows just dim out. -->
			<ul class="mt-4 space-y-2">
				<li
					v-for="b in buckets"
					:key="b.key"
					class="flex items-center gap-3 text-sm"
					:class="b.amount === 0 ? 'opacity-40' : ''"
				>
					<span class="inline-block size-2.5 rounded-sm shrink-0" :class="b.dotClass" />
					<div class="flex-1 min-w-0">
						<div class="font-medium">
							{{ b.label }}
						</div>
						<div class="text-xs text-(--ui-text-muted)">
							{{ b.count }} {{ b.count === 1 ? "invoice" : "invoices" }}
						</div>
					</div>
					<div class="tabular-nums shrink-0">
						{{ formatLKR(b.amount) }}
					</div>
				</li>
			</ul>
		</template>
	</div>
</template>

<script setup lang="ts">
// Receivables aging: outstanding invoice balances bucketed by how
// many days past their due date they are. This is the most actionable
// chart for collections — it answers "who do I chase this week?".
//
// Buckets (industry-standard 30-day brackets):
//   - Current   — not yet due
//   - 1–30      — overdue but recent
//   - 31–60     — getting concerning
//   - 61–90     — needs follow-up
//   - 90+       — at-risk
//
// We read off useInvoicesStore() — every invoice's outstanding
// balance is derived from linked receipt vouchers (see store
// helpers); cancelled / fully-paid invoices contribute nothing.

	import type { InvoiceRow } from "~/stores/invoices";
	import { formatLKR } from "~/lib/money";
	import { useInvoicesStore } from "~/stores/invoices";

	const invoicesStore = useInvoicesStore();

	// Ms-per-day for the bucket math. We use day-level differences,
	// not hours/minutes — partial days don't matter here.
	const MS_PER_DAY = 86_400_000;

	const todayMidnight = computed(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	});

	// Days an invoice is past due. Negative = not due yet (current).
	const daysPastDue = (inv: InvoiceRow): number => {
		const due = new Date(inv.due_date);
		due.setHours(0, 0, 0, 0);
		return Math.floor((todayMidnight.value.getTime() - due.getTime()) / MS_PER_DAY);
	};

	interface Bucket {
		key: string
		label: string
		dotClass: string
		barClass: string
		count: number
		amount: number
		match: (days: number) => boolean
	}

	const buckets = computed<Bucket[]>(() => {
		const defs: Omit<Bucket, "count" | "amount">[] = [
			{ key: "current", label: "Current", dotClass: "bg-(--ui-text-muted)", barClass: "bg-(--ui-text-muted)/40", match: (d) => d <= 0 },
			{ key: "1-30", label: "1–30 days overdue", dotClass: "bg-(--ui-warning)/70", barClass: "bg-(--ui-warning)/70", match: (d) => d >= 1 && d <= 30 },
			{ key: "31-60", label: "31–60 days overdue", dotClass: "bg-(--ui-warning)", barClass: "bg-(--ui-warning)", match: (d) => d >= 31 && d <= 60 },
			{ key: "61-90", label: "61–90 days overdue", dotClass: "bg-(--ui-error)/80", barClass: "bg-(--ui-error)/80", match: (d) => d >= 61 && d <= 90 },
			{ key: "90+", label: "90+ days overdue", dotClass: "bg-(--ui-error)", barClass: "bg-(--ui-error)", match: (d) => d > 90 }
		];

		const rows: Bucket[] = defs.map((d) => ({ ...d, count: 0, amount: 0 }));

		for (const inv of invoicesStore.invoices) {
			// Only outstanding invoices contribute. Cancelled and fully-
			// paid get filtered out via the derived status check; drafts
			// don't have a balance the customer owes us yet.
			if (inv.status !== "sent") continue;
			const balance = invoicesStore.balanceCentsFor(inv);
			if (balance <= 0) continue;

			const days = daysPastDue(inv);
			for (const b of rows) {
				if (b.match(days)) {
					b.count++;
					b.amount += balance;
					break;
				}
			}
		}
		return rows;
	});

	const nonEmptyBuckets = computed(() => buckets.value.filter((b) => b.amount > 0));
	const total = computed(() => buckets.value.reduce((s, b) => s + b.amount, 0));
	const openInvoiceCount = computed(() => buckets.value.reduce((s, b) => s + b.count, 0));
	const overdueAmount = computed(() =>
		buckets.value.filter((b) => b.key !== "current").reduce((s, b) => s + b.amount, 0)
	);
</script>
