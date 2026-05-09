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
				<!-- Filter strip: two coordinated rows. The first holds the
					quick filters (search / client / status); the second
					holds the less-common date ranges with compact inline
					labels. A single "Reset" pill surfaces on the far right
					of row 2 whenever any filter is active. -->
				<div class="flex flex-col gap-3">
					<!-- Row 1 — quick filters -->
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by number, project, or client…"
							icon="i-lucide-search"
							size="md"
							class="flex-1 min-w-64"
						/>
						<!-- USelectMenu (searchable) instead of USelect because the
							client list can grow long; typing into the dropdown
							narrows it. value-key/label-key bind to the
							(number | "all") shape we put in the store. -->
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
							class="w-40"
						/>
					</div>

					<!-- Row 2 — date ranges + reset. Inline compact labels
						instead of stacked UFormField — at this density the
						extra label height made the section feel busier than
						it needed to. -->
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
							<span class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted)">Valid</span>
							<DateRangeField
								v-model:from="store.validFrom"
								v-model:to="store.validTo"
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
							:active="list.sortKey === 'valid_until'"
							:dir="list.sortDir"
							@sort="list.toggleSort('valid_until')"
						>
							Valid until
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
						v-for="q in list.paged"
						:key="q.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="open(q)"
					>
						<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
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
						<td class="py-2 pl-2 pr-3">
							<StatusBadge :status="q.status" />
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
	import type { ClientSnapshot, QuoteRow, QuoteStatus } from "~/stores/quotes";
	import { useListView } from "~/composables/useListView";
	import { formatLKR } from "~/lib/money";
	import { useClientsStore } from "~/stores/clients";
	import { useQuotesStore } from "~/stores/quotes";

	definePageMeta({ title: "Quotes" });

	const router = useRouter();
	const store = useQuotesStore();
	const clientsStore = useClientsStore();

	// Load both stores in parallel so the filter dropdown is populated by
	// the time the table renders. Clients are needed only for the
	// "Filter by client" select — the row itself reads off the snapshot.
	await Promise.all([store.load(), clientsStore.load()]);
	// Auto-expire any sent quotes past their valid_until on every list load.
	await store.expireOverdue().catch(() => { /* non-fatal */ });

	// `client` sorts by the snapshot's name (the visible column value).
	const list = useListView<QuoteRow>(
		() => store.filtered,
		[
			{ key: "number", getValue: (q) => q.number },
			{ key: "client", getValue: (q) => clientName(q.client_snapshot) },
			{ key: "project", getValue: (q) => q.project_title },
			{ key: "issue_date", getValue: (q) => q.issue_date },
			{ key: "valid_until", getValue: (q) => q.valid_until },
			{ key: "total", getValue: (q) => q.total_cents },
			{ key: "status", getValue: (q) => q.status }
		],
		{ defaultSortKey: "issue_date", defaultDir: "desc" }
	);

	const newQuote = () => router.push("/quotes/new");
	const open = (q: QuoteRow) => router.push(`/quotes/${q.id}`);

	// Does any filter narrow the list right now? Drives the visibility
	// of the "Reset filters" pill in the toolbar.
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

	// "All clients" sentinel + every loaded client (active or archived,
	// since old quotes against an archived client should still be
	// findable). Sorted by name to match the rest of the app.
	const clientOptions = computed<{ label: string, value: number | "all" }[]>(() => [
		{ label: "All clients", value: "all" },
		...[...clientsStore.clients]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => ({ label: c.name, value: c.id }))
	]);

	const statusOptions: { label: string, value: QuoteStatus | "all" }[] = [
		{ label: "All", value: "all" },
		{ label: "Draft", value: "draft" },
		{ label: "Sent", value: "sent" },
		{ label: "Accepted", value: "accepted" },
		{ label: "Rejected", value: "rejected" },
		{ label: "Expired", value: "expired" },
		{ label: "Converted", value: "converted" }
	];

	// Function declaration (not const arrow) so it hoists above the
	// useListView() call site, which references it in a column getValue.
	function clientName(snap: string): string {
		try {
			return (JSON.parse(snap) as ClientSnapshot).name ?? "—";
		} catch {
			return "—";
		}
	}

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
