<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			clients, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Clients
					<!-- HelpButton points at customer-statements because
						that's the workflow that begins here — the "Has
						outstanding" chip + the per-client Statement
						button are the things users come to /clients to
						use. -->
					<HelpButton slug="customer-statements" />
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ clientStats.active }} active · {{ clientStats.archived }} archived
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newClient">
				New client
			</UButton>
		</header>

		<UCard>
			<template #header>
				<div class="space-y-3">
					<div class="flex items-center justify-between gap-4 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by name, email, contact, phone, tax ID…"
							icon="i-lucide-search"
							class="md:w-96"
						/>
						<div class="flex items-center gap-3">
							<UCheckbox v-model="store.showArchived" label="Show archived" />
							<UButton
								size="md"
								variant="soft"
								color="neutral"
								icon="i-lucide-table-columns-split"
								title="Auto-size columns to their content"
								@click="autoFitColumns"
							>
								Auto-fit columns
							</UButton>
						</div>
					</div>
					<!-- Chip filter row. "Has outstanding" is currently the
						only chip; structured this way so adding more
						filters here later (e.g. "Recently active",
						"With overdue") doesn't restructure the layout. -->
					<div class="flex items-center gap-2 flex-wrap">
						<UButton
							size="xs"
							:variant="store.outstandingOnly ? 'solid' : 'soft'"
							:color="store.outstandingOnly ? 'primary' : 'neutral'"
							icon="i-lucide-file-clock"
							@click="store.outstandingOnly = !store.outstandingOnly"
						>
							Has outstanding
							<span
								v-if="clientStats.outstandingClients > 0"
								class="ml-1 text-[10px] opacity-75 tabular-nums"
							>
								({{ clientStats.outstandingClients }})
							</span>
						</UButton>
						<div v-if="store.outstandingOnly" class="ml-auto">
							<StatChip
								label="Outstanding"
								:value="fmt(table.sumCents.value)"
								color="error"
							/>
						</div>
					</div>
				</div>
			</template>

			<div v-if="table.loading.value && table.rows.value.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading clients…
			</div>
			<div v-else-if="table.total.value === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-users" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.outstandingOnly">
					No clients with outstanding invoices. Everyone's paid up.
				</div>
				<div v-else-if="!hasFilter">
					No clients yet. Click <span class="font-medium">New client</span> to add the first one.
				</div>
				<div v-else>
					No clients match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="table.rows.value"
				:total="table.total.value"
				state-key="clients-table"
				:row-actions="itemsFor"
				:default-sort-field="store.outstandingOnly ? '_outstanding' : 'name'"
				:default-sort-order="store.outstandingOnly ? -1 : 1"
				@request="table.onRequest"
				@row-click="(row) => router.push(`/clients/${row.id}`)"
			>
				<Column field="name" header="Name" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium flex items-center gap-2">
							{{ data.name }}
							<UBadge v-if="data.is_archived === 1" color="neutral" variant="subtle" size="sm">
								Archived
							</UBadge>
						</div>
					</template>
				</Column>
				<Column field="contact_person" header="Contact" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.contact_person || "—" }}
						</div>
					</template>
				</Column>
				<Column field="email" header="Email" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.email || "—" }}
						</div>
					</template>
				</Column>
				<Column field="phone" header="Phone" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.phone || "—" }}
						</div>
					</template>
				</Column>
				<Column field="tax_id" header="Tax ID" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.tax_id || "—" }}
						</div>
					</template>
				</Column>
				<!-- Outstanding receivable for this client. Sortable by the
					underlying numeric `_outstanding` so PrimeVue's
					by-field sort works correctly (instead of sorting
					the formatted string). Empty cells render "—" so
					the column reads as well-paid → unsettled rather
					than zeros everywhere. -->
				<Column field="_outstanding" header="Outstanding" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div
							class="text-right tabular-nums whitespace-nowrap"
							:class="data._outstanding > 0 ? 'font-medium text-(--ui-error)' : 'text-(--ui-text-muted)'"
						>
							{{ data._outstanding > 0 ? fmt(data._outstanding) : "—" }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { ClientRow } from "~/stores/clients";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { clientDerivedFrom } from "~/lib/derived-status";
	import { andClauses, likeClause, makeSortResolver } from "~/lib/list-query";
	import { formatMoney } from "~/lib/money";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useQuotesStore } from "~/stores/quotes";

	definePageMeta({ title: "Clients" });

	const store = useClientsStore();
	// Quote / invoice stores are kept only to hand off a client filter before
	// navigating to /quotes or /invoices (the row actions). Neither is loaded —
	// the Outstanding column comes from the clientDerivedFrom SQL subquery.
	const quotesStore = useQuotesStore();
	const invoicesStore = useInvoicesStore();
	const toast = useToast();
	const router = useRouter();

	const currency = useActiveCurrency();
	const fmt = (cents: number) => formatMoney(cents, currency.value);

	// `_outstanding` (Σ open-invoice balances) is computed in SQL by the
	// clientDerivedFrom subquery, so the page needs neither all clients nor
	// all invoices in memory. The "Outstanding only" toggle filters
	// `_outstanding > 0` and flips the default sort to amount-desc.
	type ClientRowVM = ClientRow & { _outstanding: number };

	const table = useServerTable<ClientRowVM>({
		query: () => ({
			from: clientDerivedFrom(),
			where: andClauses([
				{ sql: "is_archived = ?", params: [store.showArchived ? 1 : 0] },
				store.outstandingOnly ? { sql: "_outstanding > 0", params: [] } : { sql: "", params: [] },
				likeClause(store.search, ["name", "email", "contact_person", "phone", "tax_id"])
			]),
			sumExpr: "SUM(_outstanding)"
		}),
		resolveSortColumn: makeSortResolver({
			name: "name COLLATE NOCASE",
			contact_person: "contact_person COLLATE NOCASE",
			email: "email COLLATE NOCASE",
			phone: "phone",
			tax_id: "tax_id",
			_outstanding: "_outstanding"
		}),
		// Collections view (outstanding-only) leads with the biggest balance;
		// the plain contact list sorts by name. A function so it re-reads the
		// toggle on each fetch.
		defaultOrderBy: () => (store.outstandingOnly ? "_outstanding DESC" : "name COLLATE NOCASE ASC"),
		deps: () => store.listFilters,
		initialSortOrder: 1
	});

	// Header active/archived counts + "Has outstanding" chip badge count.
	const clientStats = ref({ active: 0, archived: 0, outstandingClients: 0 });
	const refreshStats = async () => {
		clientStats.value = await store.fetchClientStats();
	};

	// Kept-alive page: useServerTable refetches the ROWS on re-activation, but
	// these header figures were loaded in onMounted only — so after recording
	// a payment and coming back, the row said paid while the header total
	// didn't move. Skip the first activation (onMounted covers it).
	let headerActivatedOnce = false;
	onActivated(() => {
		if (!headerActivatedOnce) {
			headerActivatedOnce = true;
			return;
		}
		void refreshStats();
	});
	onMounted(refreshStats);

	const hasFilter = computed(() => store.search.trim() !== "" || store.showArchived || store.outstandingOnly);

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	const newClient = () => router.push("/clients/new");

	const toggleArchive = async (c: ClientRow) => {
		const goingToArchive = c.is_archived === 0;
		try {
			await store.setArchived(c.id, goingToArchive);
			toast.add({
				title: goingToArchive ? "Client archived" : "Client restored",
				color: "info",
				icon: goingToArchive ? "i-lucide-archive" : "i-lucide-archive-restore"
			});
			await table.reload();
			await refreshStats();
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Jump to the Quotes / Invoices list pre-filtered to this client.
	// Filters live on those stores (Pinia state survives navigation), so
	// we clear the others and set the client before routing.
	const viewQuotes = (c: ClientRow) => {
		quotesStore.search = "";
		quotesStore.clearStatusFilters();
		quotesStore.clearDateFilters();
		quotesStore.clientFilter = c.id;
		router.push("/quotes");
	};

	const viewInvoices = (c: ClientRow) => {
		invoicesStore.search = "";
		invoicesStore.clearStatusFilters();
		invoicesStore.clearDateFilters();
		invoicesStore.clientFilter = c.id;
		router.push("/invoices");
	};

	// Two-group row-actions menu: cross-page navigation actions first,
	// then per-row lifecycle. ResizableDataTable renders one separator
	// between the groups.
	function itemsFor(c: ClientRow) {
		return [
			[
				{
					label: "View quotes",
					icon: "i-lucide-file-text",
					onSelect: () => viewQuotes(c)
				},
				{
					label: "View invoices",
					icon: "i-lucide-receipt",
					onSelect: () => viewInvoices(c)
				}
			],
			[
				{
					label: "Edit",
					icon: "i-lucide-pencil",
					onSelect: () => router.push(`/clients/${c.id}`)
				},
				{
					label: c.is_archived === 0 ? "Archive" : "Restore",
					icon: c.is_archived === 0 ? "i-lucide-archive" : "i-lucide-archive-restore",
					onSelect: () => {
						void toggleArchive(c);
					}
				}
			]
		];
	}
</script>
