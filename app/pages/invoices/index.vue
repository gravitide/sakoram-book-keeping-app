<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			invoices, not copying cell text out of the table. -->
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

			<!-- Table action bar + filtered-rows summary; Auto-fit on
				the left, totals on the right. -->
			<div
				v-if="!store.loading && !store.error"
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
				<div class="flex items-baseline gap-3 ml-auto">
					<span v-if="hasAnyFilter" class="text-xs">{{ store.filtered.length }} of {{ store.invoices.length }} shown</span>
					<span>Total <span class="text-(--ui-text) font-medium">{{ formatLKR(filteredTotal) }}</span></span>
				</div>
			</div>

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
			<!-- All the resize / drag-pan / state-persist / context-menu
				wiring lives inside <ResizableDataTable>. We just feed it
				rows + row-action callback and project Columns through
				its default slot. `tableRef` lets the "Auto-fit columns"
				button in the filter strip above call back into the
				component's exposed `autoFit()` method. -->
			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="rows"
				state-key="invoices-table"
				:row-actions="itemsFor"
				default-sort-field="issue_date"
				:default-sort-order="-1"
				@row-click="(row) => router.push(`/invoices/${row.id}`)"
			>
				<Column field="number" header="Number" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number }}
						</div>
					</template>
				</Column>
				<Column field="_client" header="Client" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data._client }}
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
		<NewInvoiceModal v-model:open="newInvoiceOpen" />
	</div>
</template>

<script setup lang="ts">
	import type { InvoiceLineRow, InvoiceRow, InvoiceStatus } from "~/stores/invoices";
	import type { ClientSnapshot } from "~/stores/quotes";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { buildInvoicePdfPayload } from "~/lib/invoice-pdf";
	import { formatLKR } from "~/lib/money";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Invoices" });

	const router = useRouter();
	const toast = useToast();
	const store = useInvoicesStore();
	const clientsStore = useClientsStore();
	const vouchersStore = useVouchersStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	// Load every store the list / filter dropdowns / derived status
	// reach into, in parallel. Vouchers are essential because invoice
	// status and balance are derived from linked receipt vouchers.
	await Promise.all([store.load(), clientsStore.load(), vouchersStore.load(), settingsStore.ensureLoaded()]);

	// Pre-declare helpers that the column definitions below reference.
	// (Plain `function` declarations hoist; `const` arrows don't.)
	function clientName(snap: string): string {
		try {
			return (JSON.parse(snap) as ClientSnapshot).name ?? "—";
		} catch {
			return "—";
		}
	}
	const balanceOf = (i: InvoiceRow) => store.balanceCentsFor(i);

	// PrimeVue DataTable expects each row to expose every sortable
	// field as a plain top-level property. The InvoiceRow type doesn't
	// have client name / balance / status directly — they're derived —
	// so we map to a view-model with those baked in. Underscored names
	// keep them out of the way of any future schema additions.
	interface InvoiceRowVM extends InvoiceRow {
		_client: string
		_balance: number
		_status: InvoiceStatus
	}
	const rows = computed<InvoiceRowVM[]>(() =>
		store.filtered.map((i) => ({
			...i,
			_client: clientName(i.client_snapshot),
			_balance: store.balanceCentsFor(i),
			_status: store.derivedStatus(i)
		}))
	);

	// Sum of total_cents across the currently visible (filtered) rows.
	// Tracks whatever the active filters narrow the list to.
	const filteredTotal = computed(() =>
		store.filtered.reduce((sum, i) => sum + i.total_cents, 0)
	);

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
	const newInvoice = () => {
		newInvoiceOpen.value = true;
	};

	// Auto-open if the route asked for it (e.g. dashboard New > Invoice
	// menu). Clear the query param once consumed so back/forward doesn't
	// re-trigger.
	const route = useRoute();
	onMounted(() => {
		if (route.query.new === "1") {
			newInvoiceOpen.value = true;
			void router.replace({ query: { ...route.query, new: undefined } });
		}
	});
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

	// --- Row actions: PDF preview + transitions + record payment ----

	const currentInvoice = ref<InvoiceRow | null>(null);
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
				paidCents: store.paidCentsFor(currentInvoice.value.id)
			});
		},
		fileName: () => `${currentInvoice.value?.number ?? "invoice"}.pdf`,
		title: "Invoice PDF preview"
	});

	const onPdfClick = async (i: InvoiceRow) => {
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
	function itemsFor(i: InvoiceRow) {
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
		if (i.status === "sent" && balanceOf(i) > 0) {
			lifecycle.push({
				label: "Record payment",
				icon: "i-lucide-circle-dollar-sign",
				onSelect: () => recordPayment(i)
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
			label: "Generate PDF",
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
