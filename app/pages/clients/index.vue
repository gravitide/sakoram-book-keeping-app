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
			</template>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading clients…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-users" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.clients.length === 0">
					No clients yet. Click <span class="font-medium">New client</span> to add the first one.
				</div>
				<div v-else>
					No clients match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="store.filtered"
				state-key="clients-table"
				:row-actions="itemsFor"
				default-sort-field="name"
				:default-sort-order="1"
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
			</ResizableDataTable>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { ClientRow } from "~/stores/clients";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useQuotesStore } from "~/stores/quotes";

	definePageMeta({ title: "Clients" });

	const store = useClientsStore();
	// Quote / invoice stores are only touched to hand off a client filter
	// before navigating — their list pages bind straight to these refs.
	const quotesStore = useQuotesStore();
	const invoicesStore = useInvoicesStore();
	const toast = useToast();
	const router = useRouter();

	await store.load();

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
