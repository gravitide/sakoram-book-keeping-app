<template>
	<div>
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Invoices
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ store.invoices.length }} total · {{ formatLKR(store.outstandingTotal) }} outstanding
					<span v-if="store.overdueCount > 0" class="text-(--ui-error)">
						· {{ store.overdueCount }} overdue
					</span>
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newInvoice">
				New invoice
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
						class="w-48"
					/>
				</div>
			</template>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading invoices…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-receipt" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.invoices.length === 0">
					No invoices yet. Click <span class="font-medium">New invoice</span> to start.
				</div>
				<div v-else>
					No invoices match your filters.
				</div>
			</div>
			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<th class="py-2 pl-3 pr-2 font-medium">
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
							Due
						</th>
						<th class="py-2 px-2 font-medium text-right">
							Total
						</th>
						<th class="py-2 px-2 font-medium text-right">
							Balance
						</th>
						<th class="py-2 pl-2 pr-3 font-medium">
							Status
						</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="i in store.filtered"
						:key="i.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="open(i)"
					>
						<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
							{{ i.number }}
						</td>
						<td class="py-2 px-2">
							{{ clientName(i.client_snapshot) }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) max-w-xs truncate">
							{{ i.project_title || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ i.issue_date }}
						</td>
						<td class="py-2 px-2 tabular-nums" :class="i.status === 'overdue' ? 'text-(--ui-error) font-medium' : 'text-(--ui-text-muted)'">
							{{ i.due_date }}
						</td>
						<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
							{{ formatLKR(i.total_cents) }}
						</td>
						<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
							<span v-if="balanceOf(i) === 0" class="text-(--ui-text-muted)">—</span>
							<span v-else>{{ formatLKR(balanceOf(i)) }}</span>
						</td>
						<td class="py-2 pl-2 pr-3">
							<StatusBadge :status="i.status" />
						</td>
					</tr>
				</tbody>
			</table>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { InvoiceRow, InvoiceStatus } from "~/stores/invoices";
	import type { ClientSnapshot } from "~/stores/quotes";
	import { formatLKR } from "~/lib/money";
	import { useInvoicesStore } from "~/stores/invoices";

	definePageMeta({ title: "Invoices" });

	const router = useRouter();
	const store = useInvoicesStore();

	await store.load();
	// Auto-flag overdue on every list visit. Cheap single-statement UPDATE.
	await store.flagOverdue().catch(() => { /* non-fatal */ });

	const newInvoice = () => router.push("/invoices/new");
	const open = (i: InvoiceRow) => router.push(`/invoices/${i.id}`);

	const statusOptions: { label: string, value: InvoiceStatus | "all" | "outstanding" }[] = [
		{ label: "All", value: "all" },
		{ label: "Outstanding", value: "outstanding" },
		{ label: "Draft", value: "draft" },
		{ label: "Sent", value: "sent" },
		{ label: "Partial", value: "partial" },
		{ label: "Paid", value: "paid" },
		{ label: "Overdue", value: "overdue" },
		{ label: "Cancelled", value: "cancelled" }
	];

	const clientName = (snap: string): string => {
		try {
			return (JSON.parse(snap) as ClientSnapshot).name ?? "—";
		} catch {
			return "—";
		}
	};

	const balanceOf = (i: InvoiceRow) => Math.max(0, i.total_cents - i.paid_cents);
</script>
