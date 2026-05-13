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
				<!-- Filter strip — chip-style multi-select status + Advanced
					popover for date ranges. Same pattern as Quotes. -->
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
						<UPopover>
							<UButton
								color="neutral"
								variant="outline"
								icon="i-lucide-sliders-horizontal"
								class="relative"
							>
								Advanced
								<span
									v-if="store.hasDateFilters"
									class="absolute -top-1 -right-1 size-2 rounded-full bg-(--ui-info)"
								/>
							</UButton>
							<template #content>
								<div class="p-4 w-[420px] space-y-4">
									<div>
										<div class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted) mb-1.5 flex items-center gap-1.5">
											<UIcon name="i-lucide-calendar" class="size-3.5" />
											Issue date
										</div>
										<DateRangeField
											v-model:from="store.issuedFrom"
											v-model:to="store.issuedTo"
										/>
									</div>
									<div>
										<div class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted) mb-1.5 flex items-center gap-1.5">
											<UIcon name="i-lucide-calendar-clock" class="size-3.5" />
											Due date
										</div>
										<DateRangeField
											v-model:from="store.dueFrom"
											v-model:to="store.dueTo"
										/>
									</div>
									<div v-if="store.hasDateFilters" class="pt-2 border-t border-(--ui-border) flex justify-end">
										<UButton
											size="xs"
											variant="ghost"
											color="neutral"
											icon="i-lucide-x"
											@click="store.clearDateFilters"
										>
											Clear date filters
										</UButton>
									</div>
								</div>
							</template>
						</UPopover>
						<UButton
							v-if="hasAnyFilter"
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-x"
							class="ml-auto"
							@click="resetFilters"
						>
							Reset
						</UButton>
					</div>

					<!-- Multi-select status filter. Matches StatusBadge colours. -->
					<div class="flex items-center gap-1.5 flex-wrap">
						<UIcon name="i-lucide-flag" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
						<button
							v-for="s in INVOICE_STATUSES"
							:key="s"
							type="button"
							class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
							:class="statusChipClasses(s)"
							@click="store.toggleStatusFilter(s)"
						>
							{{ STATUS_LABEL[s] }}
						</button>
					</div>

					<!-- Quick issue-date preset chips. Resolved at click time. -->
					<div class="flex items-center gap-1.5 flex-wrap">
						<UIcon name="i-lucide-calendar" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
						<span class="text-xs text-(--ui-text-muted) mr-1">Issued:</span>
						<button
							v-for="p in DATE_PRESETS"
							:key="p.key"
							type="button"
							class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
							:class="datePresetClasses(p.key)"
							@click="toggleDatePreset(p.key)"
						>
							{{ p.label }}
						</button>
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
		|| store.statusFilters.length > 0
		|| store.clientFilter !== "all"
		|| store.hasDateFilters
	);

	const resetFilters = () => {
		store.search = "";
		store.clearStatusFilters();
		store.clientFilter = "all";
		store.clearDateFilters();
	};

	// Status chip metadata — display order, label, and the colour each
	// chip uses when active. Mirrors StatusBadge's semantic colours so
	// the filter chip and the row badge speak the same visual language.
	const INVOICE_STATUSES: InvoiceStatus[] = [
		"draft",
		"sent",
		"partial",
		"paid",
		"overdue",
		"cancelled"
	];
	const STATUS_LABEL: Record<InvoiceStatus, string> = {
		draft: "Draft",
		sent: "Sent",
		partial: "Partial",
		paid: "Paid",
		overdue: "Overdue",
		cancelled: "Cancelled"
	};
	const STATUS_ACTIVE_CLASSES: Record<InvoiceStatus, string> = {
		draft: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text)",
		sent: "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)",
		partial: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		paid: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		overdue: "bg-(--ui-error)/15 border-(--ui-error)/40 text-(--ui-error)",
		cancelled: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text-muted)"
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const statusChipClasses = (s: InvoiceStatus): string =>
		store.statusFilters.includes(s) ? STATUS_ACTIVE_CLASSES[s] : inactiveChip;

	// Quick issue-date presets — same shape as Quotes. Each resolves to
	// concrete ISO bounds at click time so "This month" is always the
	// current calendar month, no staleness across boundaries.
	type DatePresetKey = "today" | "this_week" | "this_month" | "this_year";
	const DATE_PRESETS: { key: DatePresetKey, label: string }[] = [
		{ key: "today", label: "Today" },
		{ key: "this_week", label: "This week" },
		{ key: "this_month", label: "This month" },
		{ key: "this_year", label: "This year" }
	];
	const isoFromDate = (d: Date): string =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const datePresetBounds = (key: DatePresetKey): { from: string, to: string } => {
		const now = new Date();
		if (key === "today") {
			const iso = isoFromDate(now);
			return { from: iso, to: iso };
		}
		if (key === "this_week") {
			const daysSinceMon = (now.getDay() + 6) % 7;
			const monday = new Date(now);
			monday.setDate(now.getDate() - daysSinceMon);
			const sunday = new Date(monday);
			sunday.setDate(monday.getDate() + 6);
			return { from: isoFromDate(monday), to: isoFromDate(sunday) };
		}
		if (key === "this_month") {
			const first = new Date(now.getFullYear(), now.getMonth(), 1);
			const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			return { from: isoFromDate(first), to: isoFromDate(last) };
		}
		const first = new Date(now.getFullYear(), 0, 1);
		const last = new Date(now.getFullYear(), 11, 31);
		return { from: isoFromDate(first), to: isoFromDate(last) };
	};
	const isDatePresetActive = (key: DatePresetKey): boolean => {
		const { from, to } = datePresetBounds(key);
		return store.issuedFrom === from && store.issuedTo === to;
	};
	const toggleDatePreset = (key: DatePresetKey) => {
		if (isDatePresetActive(key)) {
			store.issuedFrom = null;
			store.issuedTo = null;
			return;
		}
		const { from, to } = datePresetBounds(key);
		store.issuedFrom = from;
		store.issuedTo = to;
	};
	const datePresetClasses = (key: DatePresetKey): string =>
		isDatePresetActive(key)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: inactiveChip;

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
