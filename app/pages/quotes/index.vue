<template>
	<div>
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Quotes
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ store.quotes.length }} total · {{ counts.draft }} draft · {{ counts.sent }} sent · {{ counts.accepted }} accepted
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newQuote">
				New quote
			</UButton>
		</header>

		<UCard>
			<template #header>
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<UInput
						v-model="store.search"
						placeholder="Search by number, project, or client…"
						icon="i-lucide-search"
						class="md:w-96"
					/>
					<USelect
						v-model="store.statusFilter"
						:items="statusOptions"
						value-key="value"
						class="w-40"
					/>
				</div>
			</template>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading quotes…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-file-text" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.quotes.length === 0">
					No quotes yet. Click <span class="font-medium">New quote</span> to start.
				</div>
				<div v-else>
					No quotes match your filters.
				</div>
			</div>
			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<th class="py-2 pr-2 font-medium">
							Number
						</th>
						<th class="py-2 px-2 font-medium">
							Client
						</th>
						<th class="py-2 px-2 font-medium">
							Project
						</th>
						<th class="py-2 px-2 font-medium">
							Issued
						</th>
						<th class="py-2 px-2 font-medium">
							Valid until
						</th>
						<th class="py-2 px-2 font-medium text-right">
							Total
						</th>
						<th class="py-2 pl-2 font-medium">
							Status
						</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="q in store.filtered"
						:key="q.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="open(q)"
					>
						<td class="py-2 pr-2 font-medium tabular-nums">
							{{ q.number }}
						</td>
						<td class="py-2 px-2">
							{{ clientName(q.client_snapshot) }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) max-w-xs truncate">
							{{ q.project_title || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ q.issue_date }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ q.valid_until }}
						</td>
						<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
							{{ formatLKR(q.total_cents) }}
						</td>
						<td class="py-2 pl-2">
							<StatusBadge :status="q.status" />
						</td>
					</tr>
				</tbody>
			</table>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { ClientSnapshot, QuoteRow, QuoteStatus } from "~/stores/quotes";
	import { formatLKR } from "~/lib/money";
	import { useQuotesStore } from "~/stores/quotes";

	definePageMeta({ title: "Quotes" });

	const router = useRouter();
	const store = useQuotesStore();

	await store.load();
	// Auto-expire any sent quotes past their valid_until on every list load.
	await store.expireOverdue().catch(() => { /* non-fatal */ });

	const newQuote = () => router.push("/quotes/new");
	const open = (q: QuoteRow) => router.push(`/quotes/${q.id}`);

	const statusOptions: { label: string, value: QuoteStatus | "all" }[] = [
		{ label: "All", value: "all" },
		{ label: "Draft", value: "draft" },
		{ label: "Sent", value: "sent" },
		{ label: "Accepted", value: "accepted" },
		{ label: "Rejected", value: "rejected" },
		{ label: "Expired", value: "expired" },
		{ label: "Converted", value: "converted" }
	];

	const clientName = (snap: string): string => {
		try {
			return (JSON.parse(snap) as ClientSnapshot).name ?? "—";
		} catch {
			return "—";
		}
	};

	const counts = computed(() => {
		const c: Record<QuoteStatus, number> = {
			draft: 0,
			sent: 0,
			accepted: 0,
			rejected: 0,
			expired: 0,
			converted: 0
		};
		for (const q of store.quotes) c[q.status]++;
		return c;
	});
</script>
