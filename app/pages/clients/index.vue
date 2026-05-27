<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			clients, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Clients
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ store.activeCount }} active · {{ store.archivedCount }} archived
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
								v-if="outstandingClientCount > 0"
								class="ml-1 text-[10px] opacity-75 tabular-nums"
							>
								({{ outstandingClientCount }})
							</span>
						</UButton>
						<div v-if="store.outstandingOnly || filteredOutstanding > 0" class="ml-auto">
							<StatChip
								v-if="store.outstandingOnly"
								label="Outstanding"
								:value="fmt(filteredOutstanding)"
								color="error"
							/>
						</div>
					</div>
				</div>
			</template>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading clients…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="displayedRows.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-users" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.clients.length === 0">
					No clients yet. Click <span class="font-medium">New client</span> to add the first one.
				</div>
				<div v-else-if="store.outstandingOnly">
					No clients with outstanding invoices. Either everyone's paid up, or invoices haven't loaded yet.
				</div>
				<div v-else>
					No clients match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="displayedRows"
				state-key="clients-table"
				:row-actions="itemsFor"
				:default-sort-field="store.outstandingOnly ? '_outstanding' : 'name'"
				:default-sort-order="store.outstandingOnly ? -1 : 1"
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
	import { formatMoney } from "~/lib/money";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useQuotesStore } from "~/stores/quotes";

	definePageMeta({ title: "Clients" });

	const store = useClientsStore();
	// Quote / invoice stores serve two purposes here:
	//   1. Hand off a client filter before navigating to /quotes or
	//      /invoices (the row actions and detail-page shortcuts).
	//   2. Read invoice balances so we can show an "Outstanding"
	//      column on each row and gate the new "Has outstanding"
	//      chip filter against that data.
	const quotesStore = useQuotesStore();
	const invoicesStore = useInvoicesStore();
	const toast = useToast();
	const router = useRouter();

	// Load clients up-front (page suspended). Invoices load in parallel
	// but aren't awaited — the Outstanding column reads from a Map that
	// starts empty and fills in once invoices arrive. Worst case: a
	// brief moment where every row shows "—" before the column lights
	// up with numbers. Better than blocking the page on the invoices
	// query for what's primarily a contact list.
	await store.load();
	void invoicesStore.ensureLoaded();

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	// Map<client_id, outstanding cents> — sum of every open invoice's
	// balance for that client. "Open" means derivedStatus is sent /
	// partial / overdue (drafts and cancelled don't count; fully-paid
	// fall off naturally because their balance is 0). Computed in one
	// pass over invoices to avoid O(N×M) when rendering thousands of
	// client rows.
	const outstandingByClient = computed<Map<number, number>>(() => {
		const map = new Map<number, number>();
		for (const inv of invoicesStore.invoices) {
			const ds = invoicesStore.derivedStatus(inv);
			if (ds !== "sent" && ds !== "partial" && ds !== "overdue") continue;
			const balance = invoicesStore.balanceCentsFor(inv);
			if (balance <= 0) continue;
			map.set(inv.client_id, (map.get(inv.client_id) ?? 0) + balance);
		}
		return map;
	});

	const currency = useActiveCurrency();
	const fmt = (cents: number) => formatMoney(cents, currency.value);

	// View-model row — synthesises `_outstanding` on each ClientRow so
	// the table can sort by amount via PrimeVue's by-field sorting.
	// Underscore-prefix matches the convention on other list pages
	// (e.g. _status / _client on document tables).
	interface ClientRowVM extends ClientRow {
		_outstanding: number
	}

	const displayedRows = computed<ClientRowVM[]>(() => {
		const map = outstandingByClient.value;
		const base = store.filtered.map((c) => ({
			...c,
			_outstanding: map.get(c.id) ?? 0
		}));
		if (!store.outstandingOnly) return base;
		return base
			.filter((c) => c._outstanding > 0)
			// When the chip is on, default-sort by amount desc so the
			// biggest receivable lands at the top — collections-chasing
			// is the use case here. PrimeVue's sortable column can
			// override this once the user clicks a header.
			.sort((a, b) => b._outstanding - a._outstanding);
	});

	// Filtered-row total — sum of outstanding across the rows currently
	// visible. Matches the StatChip pattern on the document lists.
	const filteredOutstanding = computed(() =>
		displayedRows.value.reduce((sum, r) => sum + r._outstanding, 0)
	);

	// Count of clients with > 0 outstanding, for the chip's badge.
	const outstandingClientCount = computed(() => {
		let n = 0;
		for (const c of store.clients) {
			if (c.is_archived === 1) continue;
			if ((outstandingByClient.value.get(c.id) ?? 0) > 0) n += 1;
		}
		return n;
	});

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
