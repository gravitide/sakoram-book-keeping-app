<template>
	<div>
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Invoices
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
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
				<!-- Filter strip — same shape as Quotes:
					Row 1 = quick filters (search / client / status)
					Row 2 = date ranges + reset pill -->
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by number, project, or client…"
							icon="i-lucide-search"
							size="md"
							class="flex-1 min-w-64"
						/>
						<USelectMenu
							v-model="store.clientFilter"
							:items="clientOptions"
							value-key="value"
							label-key="label"
							icon="i-lucide-users"
							class="w-56"
							:search-input="{ placeholder: 'Filter clients…' }"
						/>
						<USelect
							v-model="store.statusFilter"
							:items="statusOptions"
							value-key="value"
							icon="i-lucide-flag"
							class="w-48"
						/>
					</div>

					<div class="flex items-center gap-4 flex-wrap text-sm">
						<div class="flex items-center gap-2">
							<UIcon name="i-lucide-calendar" class="size-3.5 text-(--ui-text-muted)" />
							<span class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted)">Issued</span>
							<DateRangeField
								v-model:from="store.issuedFrom"
								v-model:to="store.issuedTo"
							/>
						</div>
						<div class="flex items-center gap-2">
							<UIcon name="i-lucide-calendar-clock" class="size-3.5 text-(--ui-text-muted)" />
							<span class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted)">Due</span>
							<DateRangeField
								v-model:from="store.dueFrom"
								v-model:to="store.dueTo"
							/>
						</div>
						<UButton
							v-if="hasAnyFilter"
							size="xs"
							variant="soft"
							color="neutral"
							icon="i-lucide-x"
							class="ml-auto"
							@click="resetFilters"
						>
							Reset filters
						</UButton>
					</div>
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
						<SortableTh
							th-class="py-2 pl-3 pr-2 font-medium"
							:active="list.sortKey === 'number'"
							:dir="list.sortDir"
							@sort="list.toggleSort('number')"
						>
							Number
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'client'"
							:dir="list.sortDir"
							@sort="list.toggleSort('client')"
						>
							Client
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'project'"
							:dir="list.sortDir"
							@sort="list.toggleSort('project')"
						>
							Project
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'issue_date'"
							:dir="list.sortDir"
							@sort="list.toggleSort('issue_date')"
						>
							Issued
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'due_date'"
							:dir="list.sortDir"
							@sort="list.toggleSort('due_date')"
						>
							Due
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium text-right"
							:active="list.sortKey === 'total'"
							:dir="list.sortDir"
							@sort="list.toggleSort('total')"
						>
							Total
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium text-right"
							:active="list.sortKey === 'balance'"
							:dir="list.sortDir"
							@sort="list.toggleSort('balance')"
						>
							Balance
						</SortableTh>
						<SortableTh
							th-class="py-2 pl-2 pr-3 font-medium"
							:active="list.sortKey === 'status'"
							:dir="list.sortDir"
							@sort="list.toggleSort('status')"
						>
							Status
						</SortableTh>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="i in list.paged"
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
						<td class="py-2 px-2 tabular-nums" :class="statusOf(i) === 'overdue' ? 'text-(--ui-error) font-medium' : 'text-(--ui-text-muted)'">
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
							<StatusBadge :status="statusOf(i)" />
						</td>
					</tr>
				</tbody>
			</table>

			<ListPagination
				v-model:page="list.page"
				v-model:page-size="list.pageSize"
				:total="list.total"
				:total-pages="list.totalPages"
				:range-start="list.rangeStart"
				:range-end="list.rangeEnd"
			/>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { InvoiceRow, InvoiceStatus } from "~/stores/invoices";
	import type { ClientSnapshot } from "~/stores/quotes";
	import { useListView } from "~/composables/useListView";
	import { formatLKR } from "~/lib/money";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Invoices" });

	const router = useRouter();
	const store = useInvoicesStore();
	const clientsStore = useClientsStore();
	const vouchersStore = useVouchersStore();

	// Load every store the list / filter dropdowns / derived status
	// reach into, in parallel. Vouchers are essential because invoice
	// status and balance are derived from linked receipt vouchers.
	await Promise.all([store.load(), clientsStore.load(), vouchersStore.load()]);

	const list = useListView<InvoiceRow>(
		() => store.filtered,
		[
			{ key: "number", getValue: (i) => i.number },
			{ key: "client", getValue: (i) => clientName(i.client_snapshot) },
			{ key: "project", getValue: (i) => i.project_title },
			{ key: "issue_date", getValue: (i) => i.issue_date },
			{ key: "due_date", getValue: (i) => i.due_date },
			{ key: "total", getValue: (i) => i.total_cents },
			{ key: "balance", getValue: (i) => store.balanceCentsFor(i) },
			{ key: "status", getValue: (i) => store.derivedStatus(i) }
		],
		{ defaultSortKey: "issue_date", defaultDir: "desc" }
	);

	const newInvoice = () => router.push("/invoices/new");
	const open = (i: InvoiceRow) => router.push(`/invoices/${i.id}`);

	// "All clients" sentinel + every loaded client. Includes archived
	// ones so old invoices against them stay findable.
	const clientOptions = computed<{ label: string, value: number | "all" }[]>(() => [
		{ label: "All clients", value: "all" },
		...[...clientsStore.clients]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => ({ label: c.name, value: c.id }))
	]);

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.statusFilter !== "all"
		|| store.clientFilter !== "all"
		|| store.hasDateFilters
	);

	const resetFilters = () => {
		store.search = "";
		store.statusFilter = "all";
		store.clientFilter = "all";
		store.clearDateFilters();
	};

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

	// Function declarations (not const arrows) so they hoist above the
	// useListView() call site, which references them in column getValues.
	function clientName(snap: string): string {
		try {
			return (JSON.parse(snap) as ClientSnapshot).name ?? "—";
		} catch {
			return "—";
		}
	}

	// Balance + status are derived from linked receipt vouchers (and
	// due date) — see invoices store. The list table just delegates.
	const balanceOf = (i: InvoiceRow) => store.balanceCentsFor(i);
	const statusOf = (i: InvoiceRow) => store.derivedStatus(i);
</script>
