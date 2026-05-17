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
					<UCheckbox v-model="store.showArchived" label="Show archived" />
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

			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<SortableTh
							th-class="py-2 pl-3 pr-2 font-medium"
							:active="list.sortKey === 'name'"
							:dir="list.sortDir"
							@sort="list.toggleSort('name')"
						>
							Name
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'contact'"
							:dir="list.sortDir"
							@sort="list.toggleSort('contact')"
						>
							Contact
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'email'"
							:dir="list.sortDir"
							@sort="list.toggleSort('email')"
						>
							Email
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'phone'"
							:dir="list.sortDir"
							@sort="list.toggleSort('phone')"
						>
							Phone
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'tax_id'"
							:dir="list.sortDir"
							@sort="list.toggleSort('tax_id')"
						>
							Tax ID
						</SortableTh>
						<th class="py-2 pl-2 pr-3 w-10" />
					</tr>
				</thead>
				<tbody>
					<!-- Each row is wrapped in a UContextMenu so right-click
						surfaces the same actions as the overflow ⋯ button.
						UContextMenu uses Reka UI's as-child trigger, so the
						<tr> stays the actual rendered element — no wrapper
						div between tbody and tr. -->
					<UContextMenu
						v-for="c in list.paged"
						:key="c.id"
						:items="itemsFor(c)"
					>
						<tr
							class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
							@click="openClient(c)"
						>
							<td class="py-2 pl-3 pr-2 font-medium">
								<span class="flex items-center gap-2">
									{{ c.name }}
									<UBadge v-if="c.is_archived === 1" color="neutral" variant="subtle" size="sm">
										Archived
									</UBadge>
								</span>
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted)">
								{{ c.contact_person || "—" }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted)">
								{{ c.email || "—" }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted)">
								{{ c.phone || "—" }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted)">
								{{ c.tax_id || "—" }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right" @click.stop>
								<UDropdownMenu :items="itemsFor(c)">
									<UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
								</UDropdownMenu>
							</td>
						</tr>
					</UContextMenu>
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
	import type { ClientRow } from "~/stores/clients";
	import { useListView } from "~/composables/useListView";
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

	// Sortable columns: name (alpha), and the two contact fields most useful
	// for browsing. Email/phone/tax_id sort but they nicely surface duplicates.
	const list = useListView<ClientRow>(
		() => store.filtered,
		[
			{ key: "name", getValue: (c) => c.name },
			{ key: "contact", getValue: (c) => c.contact_person },
			{ key: "email", getValue: (c) => c.email },
			{ key: "phone", getValue: (c) => c.phone },
			{ key: "tax_id", getValue: (c) => c.tax_id }
		],
		{ defaultSortKey: "name", defaultDir: "asc" }
	);

	const newClient = () => router.push("/clients/new");
	const openClient = (c: ClientRow) => router.push(`/clients/${c.id}`);

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

	// Build the per-row dropdown items inline since they need the row.
	const itemsFor = (c: ClientRow) => [
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
				onSelect: () => openClient(c)
			},
			{
				label: c.is_archived === 0 ? "Archive" : "Restore",
				icon: c.is_archived === 0 ? "i-lucide-archive" : "i-lucide-archive-restore",
				onSelect: () => toggleArchive(c)
			}
		]
	];
</script>
