<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			invoices, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Invoices
					<HelpButton slug="invoices" />
					<!-- Inline spinner while the data is loading. Sits in the
						title row (not as an overlay) so the page is fully
						interactive while the rows hydrate — user can still
						click another sidebar link without waiting. -->
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-4 animate-spin text-(--ui-primary)"
					/>
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
					<span v-if="isLoading">Loading…</span>
					<template v-else>
						{{ headerStats.total }} total · {{ formatLKR(headerStats.outstandingCents) }} outstanding
						<span v-if="headerStats.overdueCount > 0" class="text-(--ui-error)">
							· {{ headerStats.overdueCount }} overdue
						</span>
					</template>
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newInvoice">
				New invoice
			</UButton>
		</header>

		<!-- Content-shaped skeleton while the page hydrates. See
			usePageLoading + ListPageSkeleton for the timing rationale. -->
		<ListPageSkeleton v-if="isLoading" :chip-count="5" :column-count="7" />

		<UCard v-else>
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

					<!-- Status + issued-date chip rows. Stack at sm, sit
						side-by-side from md+. items-start keeps each
						column flush with the top of the row when one
						wraps to two lines. -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
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
				</div>
			</template>

			<!-- Table action bar + filtered-rows summary; Auto-fit on
				the left, totals on the right. -->
			<div
				v-if="!isLoading && table.total.value > 0"
				class="flex justify-between items-center gap-3 flex-wrap text-sm text-(--ui-text-muted) tabular-nums mb-3"
			>
				<UButton
					size="xs"
					variant="soft"
					color="neutral"
					icon="i-lucide-table-columns-split"
					title="Auto-size columns to their content"
					@click="autoFitColumns"
				>
					Auto-fit columns
				</UButton>
				<div class="flex items-center gap-3 ml-auto">
					<span class="text-xs text-(--ui-text-muted)">Showing {{ table.rows.value.length }} of {{ table.total.value }}</span>
					<StatChip label="Total" :value="formatLKR(table.sumCents.value)" />
				</div>
			</div>

			<div v-if="table.loading.value && table.rows.value.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading invoices…
			</div>
			<div v-else-if="table.total.value === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-receipt" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="!hasAnyFilter">
					No invoices yet. Click <span class="font-medium">New invoice</span> to start.
				</div>
				<div v-else>
					No invoices match your filters.
				</div>
			</div>
			<!-- All the resize / drag-pan / state-persist / context-menu
				wiring lives inside <ResizableDataTable>. We just feed it
				rows + row-action callback and project Columns through
				its default slot. `tableRef` lets the "Auto-fit columns"
				button in the filter strip above call back into the
				component's exposed `autoFit()` method. -->
			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="table.rows.value"
				:total="table.total.value"
				state-key="invoices-table"
				:row-actions="itemsFor"
				default-sort-field="issue_date"
				:default-sort-order="-1"
				@request="table.onRequest"
				@row-click="(row) => router.push(`/invoices/${row.id}`)"
			>
				<Column field="number" header="Number" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number }}
						</div>
					</template>
				</Column>
				<Column field="client_name" header="Client" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data.client_name }}
						</div>
					</template>
				</Column>
				<Column field="project_title" header="Project" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.project_title || "—" }}
						</div>
					</template>
				</Column>
				<Column field="issue_date" header="Issued" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.issue_date }}
						</div>
					</template>
				</Column>
				<Column field="due_date" header="Due" sortable>
					<template #body="{ data }">
						<div
							class="truncate tabular-nums"
							:class="data._status === 'overdue'
								? 'text-(--ui-error) font-medium'
								: 'text-(--ui-text-muted)'"
						>
							{{ data.due_date }}
						</div>
					</template>
				</Column>
				<Column
					field="total_cents"
					header="Total"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="truncate tabular-nums">
							{{ formatLKR(data.total_cents) }}
						</div>
					</template>
				</Column>
				<Column
					field="_balance"
					header="Balance"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="truncate tabular-nums">
							<span v-if="data._balance === 0" class="text-(--ui-text-muted)">—</span>
							<span v-else>{{ formatLKR(data._balance) }}</span>
						</div>
					</template>
				</Column>
				<Column field="_status" header="Status" sortable>
					<template #body="{ data }">
						<StatusBadge :status="data._status" />
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:temp-path="pdf.state.tempPath"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Invoice PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>

		<!-- New-invoice creation lives as a modal (was a standalone page).
			Two fields didn't justify a navigation; the modal keeps the
			user on the list. After create the modal pushes the new
			draft's detail route. -->
		<NewInvoiceModal v-model:open="newInvoiceOpen" :issue-date="newInvoiceIssueDate" />
	</div>
</template>

<script setup lang="ts">
	import type { InvoiceLineRow, InvoiceRow, InvoiceStatus } from "~/stores/invoices";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { todayISO } from "~/lib/calendar-events";
	import { invoiceDerivedFrom } from "~/lib/derived-status";
	import { buildInvoicePdfPayload } from "~/lib/invoice-pdf";
	import { andClauses, eqClause, inClause, likeClause, makeSortResolver, rangeClause } from "~/lib/list-query";
	import { formatLKR } from "~/lib/money";
	import { queryString } from "~/lib/route-query";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useLicenseStore } from "~/stores/license";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Invoices" });

	const router = useRouter();
	const toast = useToast();
	const store = useInvoicesStore();
	const license = useLicenseStore();
	const clientsStore = useClientsStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	// Each row carries the derived `_paid` / `_balance` / `_status` from the
	// SQL subquery, so the page needs neither all invoices NOR all vouchers in
	// memory — the gate + PDF read those fields straight off the row.
	type InvoiceRowVM = InvoiceRow & { _paid: number, _credited: number, _balance: number, _status: InvoiceStatus };

	const table = useServerTable<InvoiceRowVM>({
		query: () => ({
			from: invoiceDerivedFrom(todayISO()),
			where: andClauses([
				inClause("_status", store.statusFilters),
				eqClause("client_id", store.clientFilter),
				rangeClause("issue_date", store.issuedFrom, store.issuedTo),
				rangeClause("due_date", store.dueFrom, store.dueTo),
				likeClause(store.search, ["number", "project_title", "client_name"])
			]),
			sumExpr: "SUM(total_cents)"
		}),
		resolveSortColumn: makeSortResolver({
			number: "number",
			client_name: "client_name COLLATE NOCASE",
			project_title: "project_title COLLATE NOCASE",
			issue_date: "issue_date",
			due_date: "due_date",
			total_cents: "total_cents",
			_balance: "_balance",
			_status: "_status"
		}),
		defaultOrderBy: "datetime(created_at) DESC",
		deps: () => store.listFilters,
		initialSortField: "issue_date",
		initialSortOrder: -1
	});

	// Header: grand total count + global outstanding + overdue count (one query).
	const headerStats = ref({ total: 0, outstandingCents: 0, overdueCount: 0 });
	const refreshStats = async () => {
		headerStats.value = await store.fetchHeaderStats();
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

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			clientsStore.ensureLoaded(),
			settingsStore.ensureLoaded()
		]);
		await refreshStats();
	}));

	// `ResizableDataTable` exposes `autoFit()` for the Auto-fit columns
	// button in the filter strip. Everything else (drag-pan, sort/page
	// persistence, ContextMenu wiring, column-width eviction on entry)
	// is owned by the component — see `app/components/ResizableDataTable.vue`.
	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	// Drives <NewInvoiceModal>; the New button below opens it. Also
	// flipped to true on mount when the page is hit with `?new=1` so
	// shortcuts from the dashboard "New" dropdown still work.
	const newInvoiceOpen = ref(false);
	// Optional issue-date prefill carried over from `?issued=YYYY-MM-DD`
	// — set when the user arrived here via "Create on this day" on the
	// calendar. Threaded into NewInvoiceModal, which passes it through
	// to invoices.createDraft (due_date derives from issue + settings).
	const newInvoiceIssueDate = ref<string | null>(null);
	const newInvoice = () => {
		newInvoiceIssueDate.value = null;
		newInvoiceOpen.value = true;
	};

	// The create modal writes a draft + may navigate to it. On close, refetch
	// so the grid + header reflect any new row when it doesn't navigate away.
	watch(newInvoiceOpen, (open) => {
		if (!open) {
			void table.reload();
			void refreshStats();
		}
	});

	// Auto-open if the route asked for it (e.g. dashboard New > Invoice
	// menu or calendar Create-on-this-day). Clear the query params once
	// consumed so back/forward doesn't re-trigger and a manual "New"
	// click later doesn't accidentally inherit the date.
	// useQueryTrigger, not onMounted: this page is kept alive, so onMounted
	// runs once per session and the shortcut would only ever work once.
	useQueryTrigger((query) => {
		newInvoiceIssueDate.value = queryString(query.issued);
		newInvoiceOpen.value = true;
	}, { consume: ["issued"] });
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
		"credited",
		"overdue",
		"cancelled"
	];
	const STATUS_LABEL: Record<InvoiceStatus, string> = {
		draft: "Draft",
		sent: "Sent",
		partial: "Partial",
		paid: "Paid",
		credited: "Credited",
		overdue: "Overdue",
		cancelled: "Cancelled"
	};
	const STATUS_ACTIVE_CLASSES: Record<InvoiceStatus, string> = {
		draft: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text)",
		sent: "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)",
		partial: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		paid: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		// Matches StatusBadge's neutral tone for `credited` — closed out by
		// a credit note, not collected.
		credited: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text-muted)",
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

	// --- Row actions: PDF preview + transitions + record payment ----

	const currentInvoice = ref<InvoiceRowVM | null>(null);
	const currentLines = ref<InvoiceLineRow[]>([]);
	const pdf = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => {
			if (!currentInvoice.value) return {};
			return buildInvoicePdfPayload({
				row: currentInvoice.value,
				lines: currentLines.value,
				settings: settingsStore.settings,
				currency: currency.value,
				paidCents: currentInvoice.value._paid,
				creditedCents: currentInvoice.value._credited,
				entitledToTemplates: license.hasFeature("pdf_templates")
			});
		},
		fileName: () => `${currentInvoice.value?.number ?? "invoice"}.pdf`,
		title: "Invoice PDF preview"
	});

	const onPdfClick = async (i: InvoiceRowVM) => {
		currentInvoice.value = i;
		try {
			currentLines.value = await store.getLines(i.id);
		} catch (err) {
			toast.add({
				title: "Could not load lines",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		pdf.open();
	};

	const markSent = async (i: InvoiceRow) => {
		try {
			await store.setStatus(i.id, "sent");
			toast.add({ title: `${i.number} marked as sent`, color: "info", icon: "i-lucide-send" });
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

	// Mirror of the detail page's "Revert to draft" — offered on sent rows
	// with no recorded payments and on cancelled rows (the store refuses
	// with payments as the backstop).
	const revertToDraft = async (i: InvoiceRow) => {
		try {
			await store.setStatus(i.id, "draft");
			toast.add({ title: `${i.number} reverted to draft`, color: "info", icon: "i-lucide-rotate-ccw" });
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

	const recordPayment = (i: InvoiceRow) => {
		router.push(`/vouchers/new?invoice=${i.id}`);
	};

	// Clone an invoice into a fresh draft and jump straight into it. Same
	// client / items / totals, a new number, today's issue date, and a
	// preserved payment-term window. Any failure surfaces as a toast.
	const onDuplicate = async (i: InvoiceRow) => {
		try {
			const newId = await store.duplicate(i.id);
			toast.add({ title: `Duplicated ${i.number}`, color: "success", icon: "i-lucide-copy" });
			router.push(`/invoices/${newId}`);
		} catch (err) {
			toast.add({
				title: "Duplicate failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Function declaration (not arrow) so it hoists — the row
	// right-click handler defined earlier in the script closes over it.
	function itemsFor(i: InvoiceRowVM) {
		const lifecycle: { label: string, icon: string, onSelect: () => void }[] = [
			{ label: "Open", icon: "i-lucide-pencil", onSelect: () => open(i) }
		];
		if (i.status === "draft") {
			lifecycle.push({
				label: "Mark sent",
				icon: "i-lucide-send",
				onSelect: () => {
					void markSent(i);
				}
			});
		}
		// Receipts are only legal on sent invoices that still have a
		// balance — mirrors the detail page's `canRecordPayments`.
		if (i.status === "sent" && i._balance > 0) {
			lifecycle.push({
				label: "Record payment",
				icon: "i-lucide-circle-dollar-sign",
				onSelect: () => recordPayment(i)
			});
		}
		// Revert to draft: sent with no payments or issued credit notes yet, or cancelled —
		// mirrors the detail page's transition buttons.
		if ((i.status === "sent" && i._paid === 0 && i._credited === 0) || i.status === "cancelled") {
			lifecycle.push({
				label: "Revert to draft",
				icon: "i-lucide-rotate-ccw",
				onSelect: () => {
					void revertToDraft(i);
				}
			});
		}
		const duplicateAction = [{
			label: "Duplicate",
			icon: "i-lucide-copy",
			onSelect: () => {
				void onDuplicate(i);
			}
		}];
		const exports = [{
			label: "Generate PDF & Print",
			icon: "i-lucide-file-down",
			onSelect: () => {
				void onPdfClick(i);
			}
		}];
		// Two groups → exactly one separator in the menu, sitting between
		// Generate PDF and everything else. Open / Mark sent / Record
		// payment / Duplicate stay in one continuous block.
		return [[...lifecycle, ...duplicateAction], exports];
	}
</script>
