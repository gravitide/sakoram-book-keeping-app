<template>
	<div>
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Bills
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ store.bills.length }} total · {{ formatLKR(store.outstandingTotal) }} outstanding
					<span v-if="store.overdueCount > 0" class="text-(--ui-error)">
						· {{ store.overdueCount }} overdue
					</span>
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newBill">
				New bill
			</UButton>
		</header>

		<UCard>
			<template #header>
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<UInput
						v-model="store.search"
						placeholder="Search by number, vendor, vendor invoice…"
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
				Loading bills…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-file-input" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.bills.length === 0">
					No bills yet. Click <span class="font-medium">New bill</span> to record one.
				</div>
				<div v-else>
					No bills match your filters.
				</div>
			</div>
			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<th class="py-2 pl-3 pr-2 font-medium">
							Number
						</th>
						<th class="py-2 px-2 font-medium">
							Vendor
						</th>
						<th class="py-2 px-2 font-medium">
							Their #
						</th>
						<th class="py-2 px-2 font-medium">
							Category
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
						v-for="b in store.filtered"
						:key="b.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="open(b)"
					>
						<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
							{{ b.number }}
						</td>
						<td class="py-2 px-2">
							{{ b.vendor_name }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ b.vendor_invoice_number || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted)">
							{{ b.category || "—" }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ b.issue_date }}
						</td>
						<td class="py-2 px-2 tabular-nums" :class="b.status === 'overdue' ? 'text-(--ui-error) font-medium' : 'text-(--ui-text-muted)'">
							{{ b.due_date }}
						</td>
						<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
							{{ formatLKR(b.total_cents) }}
						</td>
						<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap">
							<span v-if="balanceOf(b) === 0" class="text-(--ui-text-muted)">—</span>
							<span v-else>{{ formatLKR(balanceOf(b)) }}</span>
						</td>
						<td class="py-2 pl-2 pr-3">
							<StatusBadge :status="b.status" />
						</td>
					</tr>
				</tbody>
			</table>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { BillRow, BillStatus } from "~/stores/bills";
	import { formatLKR } from "~/lib/money";
	import { useBillsStore } from "~/stores/bills";

	definePageMeta({ title: "Bills" });

	const router = useRouter();
	const store = useBillsStore();

	await store.load();
	await store.flagOverdue().catch(() => { /* non-fatal */ });

	const newBill = () => router.push("/bills/new");
	const open = (b: BillRow) => router.push(`/bills/${b.id}`);

	const statusOptions: { label: string, value: BillStatus | "all" | "outstanding" }[] = [
		{ label: "All", value: "all" },
		{ label: "Outstanding", value: "outstanding" },
		{ label: "Unpaid", value: "unpaid" },
		{ label: "Partial", value: "partial" },
		{ label: "Paid", value: "paid" },
		{ label: "Overdue", value: "overdue" },
		{ label: "Cancelled", value: "cancelled" }
	];

	const balanceOf = (b: BillRow) => Math.max(0, b.total_cents - b.paid_cents);
</script>
