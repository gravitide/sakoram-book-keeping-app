<template>
	<div>
		<div class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
			<div>
				<div class="text-2xl font-semibold tabular-nums">
					{{ formatLKR(grandTotal) }}
				</div>
				<div class="text-xs text-(--ui-text-muted) mt-0.5">
					Last 12 months · {{ totalInvoiceCount }} invoice{{ totalInvoiceCount === 1 ? "" : "s" }}
				</div>
			</div>
			<div v-if="topRow && totalClients > 1" class="text-xs text-(--ui-text-muted)">
				<span class="text-(--ui-text) font-medium">{{ topRow.name }}</span>
				·
				<span class="tabular-nums">{{ Math.round((topRow.amount / grandTotal) * 100) }}%</span>
			</div>
		</div>

		<div v-if="rows.length === 0" class="py-8 text-center text-sm text-(--ui-text-muted)">
			<UIcon name="i-lucide-users" class="size-8 mx-auto mb-2 opacity-50" />
			No invoiced revenue in the last 12 months yet.
		</div>

		<!-- Horizontal bar list. Each row is a name on top of a tinted
			bar whose width is its share of the leader. We rank against
			the top row (not the total) so the differences between
			adjacent rows stay visible — otherwise a dominant client
			squashes everyone else. -->
		<ul v-else class="space-y-2.5">
			<li
				v-for="(row, i) in rows"
				:key="row.id"
				class="group"
			>
				<NuxtLink
					:to="`/clients/${row.id}`"
					class="flex items-baseline gap-3 mb-1 hover:text-(--ui-primary)"
				>
					<span class="text-xs font-mono text-(--ui-text-muted) w-4 tabular-nums shrink-0">{{ i + 1 }}.</span>
					<span class="font-medium text-sm truncate flex-1">{{ row.name }}</span>
					<span class="text-xs text-(--ui-text-muted) tabular-nums">
						{{ row.invoiceCount }} {{ row.invoiceCount === 1 ? "inv" : "invs" }}
					</span>
					<span class="text-sm font-semibold tabular-nums shrink-0">
						{{ formatLKR(row.amount) }}
					</span>
				</NuxtLink>
				<div class="h-2 rounded-full bg-(--ui-bg-muted) overflow-hidden">
					<div
						class="h-full bg-(--ui-primary)/70 group-hover:bg-(--ui-primary) transition-colors rounded-full"
						:style="{ width: `${(row.amount / leaderAmount) * 100}%` }"
					/>
				</div>
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
// Top clients by invoiced revenue over the last 12 months.
//
// We aggregate by `client_id` (the FK on the invoice row), not by the
// snapshot name, so renames don't fragment a client across multiple
// rows. The display name comes from the most recent invoice's
// snapshot, which mirrors what the user sees on the invoice list.
//
// "Revenue" here = total_cents on issued invoices, not paid_cents.
// That's the conventional accounting view ("how much did we sell to
// each client?") rather than cash-collected. Cancelled invoices and
// drafts don't contribute. Cap the list at 8 rows so the card stays
// scannable; an "Other" rollup catches the long tail.

	import type { ClientSnapshot } from "~/stores/quotes";
	import { formatLKR } from "~/lib/money";
	import { useInvoicesStore } from "~/stores/invoices";

	const invoicesStore = useInvoicesStore();

	// Window: the most recent 365 days.
	const cutoffISO = computed(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - 365);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	});

	interface ClientRow {
		id: number | string // numeric for real clients, "__other" for the rollup
		name: string
		amount: number
		invoiceCount: number
	}

	const rows = computed<ClientRow[]>(() => {
		const map = new Map<number, ClientRow>();
		for (const inv of invoicesStore.invoices) {
			if (inv.status === "cancelled" || inv.status === "draft") continue;
			if (inv.issue_date < cutoffISO.value) continue;
			const existing = map.get(inv.client_id);
			if (existing) {
				existing.amount += inv.total_cents;
				existing.invoiceCount++;
				continue;
			}
			let name = "(unknown)";
			try {
				const snap = JSON.parse(inv.client_snapshot) as ClientSnapshot;
				if (snap.name) name = snap.name;
			} catch { /* leave fallback */ }
			map.set(inv.client_id, {
				id: inv.client_id,
				name,
				amount: inv.total_cents,
				invoiceCount: 1
			});
		}

		const sorted = [...map.values()].sort((a, b) => b.amount - a.amount);
		if (sorted.length <= 9) return sorted;
		const top = sorted.slice(0, 8);
		const tail = sorted.slice(8);
		return [
			...top,
			{
				id: "__other",
				name: `Other · ${tail.length} clients`,
				amount: tail.reduce((s, r) => s + r.amount, 0),
				invoiceCount: tail.reduce((s, r) => s + r.invoiceCount, 0)
			}
		];
	});

	const grandTotal = computed(() => rows.value.reduce((s, r) => s + r.amount, 0));
	const leaderAmount = computed(() => rows.value[0]?.amount ?? 1);
	const topRow = computed(() => rows.value[0]);
	const totalInvoiceCount = computed(() => rows.value.reduce((s, r) => s + r.invoiceCount, 0));
	const totalClients = computed(() => rows.value.length);
</script>
