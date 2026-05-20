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
			<!-- NuxtUI UTable (built on @tanstack/vue-table). Handles sort,
				pagination, and column resizing internally; we just bind
				state. Custom headers render via the `<id>-header` slots
				(TableSortHeader = label + arrow-only sort button + the
				resize-handle the user grabs to widen the column). Custom
				cells render via `<id>-cell` slots, each wrapping content
				in a block-level `div.truncate` so content stays inside
				its column rather than bleeding into the next. -->
			<UTable
				v-else
				v-model:sorting="sorting"
				v-model:pagination="pagination"
				v-model:column-sizing="columnSizing"
				:data="store.filtered"
				:columns="columns"
				:column-sizing-options="{ columnResizeMode: 'onChange' }"
				:get-row-id="(row) => String(row.id)"
				:ui="{
					base: 'w-full',
					thead: 'text-xs uppercase tracking-wide text-(--ui-text-muted)',
					tr: 'border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer'
				}"
				@select="(_, row) => open(row.original)"
			>
				<template #number-header="{ header }">
					<TableSortHeader :header="header" label="Number" />
				</template>
				<template #client-header="{ header }">
					<TableSortHeader :header="header" label="Client" />
				</template>
				<template #project-header="{ header }">
					<TableSortHeader :header="header" label="Project" />
				</template>
				<template #issue_date-header="{ header }">
					<TableSortHeader :header="header" label="Issued" />
				</template>
				<template #due_date-header="{ header }">
					<TableSortHeader :header="header" label="Due" />
				</template>
				<template #total-header="{ header }">
					<TableSortHeader :header="header" label="Total" />
				</template>
				<template #balance-header="{ header }">
					<TableSortHeader :header="header" label="Balance" />
				</template>
				<template #status-header="{ header }">
					<TableSortHeader :header="header" label="Status" />
				</template>

				<template #number-cell="{ row }">
					<div class="truncate">
						{{ row.original.number }}
					</div>
				</template>
				<template #client-cell="{ row }">
					<div class="truncate">
						{{ clientName(row.original.client_snapshot) }}
					</div>
				</template>
				<template #project-cell="{ row }">
					<div class="truncate">
						{{ row.original.project_title || "—" }}
					</div>
				</template>
				<template #issue_date-cell="{ row }">
					<div class="truncate">
						{{ row.original.issue_date }}
					</div>
				</template>
				<template #due_date-cell="{ row }">
					<div
						class="truncate"
						:class="statusOf(row.original) === 'overdue'
							? 'text-(--ui-error) font-medium'
							: 'text-(--ui-text-muted)'"
					>
						{{ row.original.due_date }}
					</div>
				</template>
				<template #total-cell="{ row }">
					<div class="truncate">
						{{ formatLKR(row.original.total_cents) }}
					</div>
				</template>
				<template #balance-cell="{ row }">
					<div class="truncate">
						<span v-if="balanceOf(row.original) === 0" class="text-(--ui-text-muted)">—</span>
						<span v-else>{{ formatLKR(balanceOf(row.original)) }}</span>
					</div>
				</template>
				<template #status-cell="{ row }">
					<StatusBadge :status="statusOf(row.original)" />
				</template>
				<template #actions-cell="{ row }">
					<div class="text-right" @click.stop>
						<UDropdownMenu :items="itemsFor(row.original)">
							<UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
						</UDropdownMenu>
					</div>
				</template>
			</UTable>

			<ListPagination
				v-if="store.filtered.length > 0"
				v-model:page="page"
				v-model:page-size="pageSize"
				:total="totalRows"
				:total-pages="totalPages"
				:range-start="rangeStart"
				:range-end="rangeEnd"
			/>
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
	</div>
</template>

<script setup lang="ts">
	import type { TableColumn } from "@nuxt/ui";
	import type { InvoiceLineRow, InvoiceRow, InvoiceStatus } from "~/stores/invoices";
	import type { ClientSnapshot } from "~/stores/quotes";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { usePersistedColumnSizing } from "~/composables/usePersistedColumnSizing";
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
	const statusOf = (i: InvoiceRow) => store.derivedStatus(i);

	// --- UTable state ---------------------------------------------------
	// Sort + pagination state live here (UTable handles both internally
	// via v-model). Column widths persist to localStorage via
	// usePersistedColumnSizing so the user's layout survives reloads.

	const sorting = ref<{ id: string, desc: boolean }[]>([
		{ id: "issue_date", desc: true }
	]);
	const pagination = ref({ pageIndex: 0, pageSize: 15 });
	const columnSizing = usePersistedColumnSizing("invoices", {
		number: 130,
		client: 200,
		project: 240,
		issue_date: 110,
		due_date: 110,
		total: 130,
		balance: 130,
		status: 110,
		actions: 56
	});

	// Bridges between UTable's {pageIndex, pageSize} state and the
	// ListPagination component's {page, pageSize, total, ...} props.
	const totalRows = computed(() => store.filtered.length);
	const page = computed({
		get: () => pagination.value.pageIndex + 1,
		set: (v: number) => {
			pagination.value = { ...pagination.value, pageIndex: Math.max(0, v - 1) };
		}
	});
	const pageSize = computed({
		get: () => pagination.value.pageSize,
		set: (v: number) => {
			pagination.value = { pageIndex: 0, pageSize: v };
		}
	});
	const totalPages = computed(() =>
		Math.max(1, Math.ceil(totalRows.value / pagination.value.pageSize))
	);
	const rangeStart = computed(() =>
		totalRows.value === 0 ? 0 : pagination.value.pageIndex * pagination.value.pageSize + 1
	);
	const rangeEnd = computed(() =>
		Math.min(totalRows.value, (pagination.value.pageIndex + 1) * pagination.value.pageSize)
	);

	// TanStack column definitions. Header / cell content is rendered via
	// the named slots in the template — these objects just declare the
	// column ids, accessors, default sizes, and per-th/td classes.
	// `meta.class.th: "relative"` lets TableSortHeader absolute-position
	// its resize handle at the cell's right edge.
	const HEADER_BASE = "relative font-medium";
	const columns = computed<TableColumn<InvoiceRow>[]>(() => [
		{
			accessorKey: "number",
			id: "number",
			header: "Number",
			size: columnSizing.value.number,
			meta: { class: { th: `${HEADER_BASE} py-2 pl-3 pr-2`, td: "py-2 pl-3 pr-2 font-medium tabular-nums" } }
		},
		{
			id: "client",
			accessorFn: (row) => clientName(row.client_snapshot),
			header: "Client",
			size: columnSizing.value.client,
			meta: { class: { th: `${HEADER_BASE} py-2 px-2`, td: "py-2 px-2" } }
		},
		{
			id: "project",
			accessorFn: (row) => row.project_title || "—",
			header: "Project",
			size: columnSizing.value.project,
			meta: { class: { th: `${HEADER_BASE} py-2 px-2`, td: "py-2 px-2 text-(--ui-text-muted)" } }
		},
		{
			accessorKey: "issue_date",
			id: "issue_date",
			header: "Issued",
			size: columnSizing.value.issue_date,
			meta: { class: { th: `${HEADER_BASE} py-2 px-2`, td: "py-2 px-2 text-(--ui-text-muted) tabular-nums" } }
		},
		{
			accessorKey: "due_date",
			id: "due_date",
			header: "Due",
			size: columnSizing.value.due_date,
			meta: { class: { th: `${HEADER_BASE} py-2 px-2`, td: "py-2 px-2 tabular-nums" } }
		},
		{
			accessorKey: "total_cents",
			id: "total",
			header: "Total",
			size: columnSizing.value.total,
			meta: { class: { th: `${HEADER_BASE} py-2 px-2 text-right`, td: "py-2 px-2 text-right tabular-nums" } }
		},
		{
			id: "balance",
			accessorFn: (row) => store.balanceCentsFor(row),
			header: "Balance",
			size: columnSizing.value.balance,
			meta: { class: { th: `${HEADER_BASE} py-2 px-2 text-right`, td: "py-2 px-2 text-right tabular-nums" } }
		},
		{
			id: "status",
			accessorFn: (row) => store.derivedStatus(row),
			header: "Status",
			size: columnSizing.value.status,
			enableResizing: false,
			meta: { class: { th: "font-medium py-2 px-2", td: "py-2 px-2" } }
		},
		{
			id: "actions",
			header: "",
			size: columnSizing.value.actions,
			enableSorting: false,
			enableResizing: false,
			meta: { class: { th: "py-2 pl-2 pr-3", td: "py-2 pl-2 pr-3 text-right" } }
		}
	]);

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

	const itemsFor = (i: InvoiceRow) => {
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
		return [lifecycle, duplicateAction, exports];
	};
</script>
