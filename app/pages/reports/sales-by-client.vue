<template>
	<div class="select-none">
		<!-- Top toolbar — back link + PDF action. Same layout as the
			rest of the reports for consistency. -->
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/reports" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to Reports
			</NuxtLink>

			<UButton
				size="sm"
				color="neutral"
				variant="outline"
				icon="i-lucide-file-down"
				:loading="pdf.state.rendering"
				:disabled="isLoading || pdf.state.rendering"
				:title="isLoading ? 'Loading data…' : 'Preview this report as a PDF'"
				@click="onPdfClick"
			>
				PDF & Print
			</UButton>
		</div>

		<header class="mb-6">
			<h1 class="text-2xl font-semibold flex items-center gap-3">
				Sales by client
				<HelpButton slug="sales-by-client" />
				<UIcon
					v-if="isLoading"
					name="i-lucide-loader-circle"
					class="size-4 animate-spin text-(--ui-primary)"
				/>
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span v-if="isLoading">Loading…</span>
				<template v-else>
					<!-- Per-client revenue breakdown. Accrual basis — counts
						on the invoice's issue date, not on when payment lands
						(that's the Cash flow report's job). Subtotals only
						because VAT is a pass-through to the IRD, not real
						revenue. -->
					Revenue per client over a date range. Counts issued invoices on their issue date; subtotals exclude VAT. Click a client to see their full invoice list.
				</template>
			</p>
		</header>

		<!-- Loading skeleton mirroring the real layout. -->
		<template v-if="isLoading">
			<UCard class="mb-6 animate-pulse">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-2">
							<div class="h-3 w-12 rounded bg-(--ui-bg-muted)" />
							<div class="h-9 rounded bg-(--ui-bg-muted)" />
						</div>
						<div class="space-y-2">
							<div class="h-3 w-12 rounded bg-(--ui-bg-muted)" />
							<div class="h-9 rounded bg-(--ui-bg-muted)" />
						</div>
					</div>
					<div class="flex flex-wrap gap-1.5 items-center justify-end">
						<div
							v-for="i in 6"
							:key="`pset-skel-${i}`"
							class="h-6 w-24 rounded-md bg-(--ui-bg-muted)"
						/>
					</div>
				</div>
			</UCard>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 animate-pulse">
				<UCard v-for="i in 3" :key="`kpi-skel-${i}`" class="h-full">
					<div class="space-y-3">
						<div class="h-3 w-24 rounded bg-(--ui-bg-muted)" />
						<div class="h-7 w-40 rounded bg-(--ui-bg-muted)" />
						<div class="h-3 w-32 rounded bg-(--ui-bg-muted)" />
					</div>
				</UCard>
			</div>

			<UCard class="mb-6 animate-pulse">
				<template #header>
					<div class="h-3 w-28 rounded bg-(--ui-bg-muted)" />
				</template>
				<div class="space-y-3">
					<div
						v-for="r in 6"
						:key="`br-skel-${r}`"
						class="grid gap-3 py-2 border-b border-(--ui-border)/40 last:border-0"
						style="grid-template-columns: 1fr auto auto"
					>
						<div class="h-3 w-40 rounded bg-(--ui-bg-muted)" />
						<div class="h-3 w-24 rounded bg-(--ui-bg-muted)" />
						<div class="h-3 w-12 rounded bg-(--ui-bg-muted)" />
					</div>
				</div>
			</UCard>
		</template>

		<template v-else>
			<!-- Filter strip: from / to dates + preset chips. Default to
				the current fiscal year on first visit, matching P&L. -->
			<UCard class="mb-6">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
					<div class="grid grid-cols-2 gap-3">
						<UFormField label="From">
							<DateField v-model="dateFrom" />
						</UFormField>
						<UFormField label="To">
							<DateField v-model="dateTo" :min-value="dateFrom || undefined" />
						</UFormField>
					</div>
					<div class="flex flex-wrap gap-1.5 items-center justify-end">
						<button
							v-for="p in DATE_PRESETS"
							:key="p.key"
							type="button"
							class="px-2.5 py-1 text-xs rounded-md border transition cursor-pointer"
							:class="presetClasses(p.key)"
							@click="togglePreset(p.key)"
						>
							{{ p.label }}
						</button>
						<UButton
							size="xs"
							variant="ghost"
							color="neutral"
							icon="i-lucide-rotate-ccw"
							@click="resetDates"
						>
							Reset
						</UButton>
					</div>
				</div>
			</UCard>

			<!-- Three KPI tiles: Revenue, Clients, Invoices. -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Total revenue
						</div>
						<UIcon name="i-lucide-trending-up" class="size-4 text-(--ui-success)" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-success)"
						:title="formatLKR(totals.revenue)"
					>
						{{ formatLKR(totals.revenue) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ totals.invoiceCount }} invoice{{ totals.invoiceCount === 1 ? "" : "s" }} issued
					</div>
				</UCard>

				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Clients
						</div>
						<UIcon name="i-lucide-users-round" class="size-4 text-(--ui-text-muted)" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
					>
						{{ totals.clientCount }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						<template v-if="totals.clientCount === 0">
							No clients in this period
						</template>
						<template v-else>
							Avg {{ formatLKR(avgPerClient) }} per client
						</template>
					</div>
				</UCard>

				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Invoices
						</div>
						<UIcon name="i-lucide-receipt" class="size-4 text-(--ui-text-muted)" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
					>
						{{ totals.invoiceCount }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						<template v-if="totals.invoiceCount === 0">
							No invoices issued
						</template>
						<template v-else>
							Avg {{ formatLKR(avgPerInvoice) }} per invoice
						</template>
					</div>
				</UCard>
			</div>

			<!-- Per-client breakdown. Sorted by total desc — top clients
				lead. ResizableDataTable for the same column-resize +
				sort + Fit page-size UX every other list page has. Click
				a row to open /invoices pre-filtered to that client. -->
			<div class="mb-2 flex items-end justify-between gap-2 flex-wrap">
				<div>
					<div class="font-medium">
						By client
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-0.5">
						Click a row to open that client's invoice list pre-filtered. {{ rangeLabel }}.
					</div>
				</div>
				<div class="text-xs text-(--ui-text-muted)">
					{{ clientRows.length }} client{{ clientRows.length === 1 ? "" : "s" }} with revenue
				</div>
			</div>

			<div
				v-if="clientRows.length === 0"
				class="py-10 text-center text-sm text-(--ui-text-muted) border border-dashed border-(--ui-border) rounded-lg mb-6"
			>
				<UIcon name="i-lucide-receipt" class="size-10 mx-auto mb-2 opacity-40" />
				<div>No invoices issued in this period.</div>
			</div>

			<ResizableDataTable
				v-else
				:rows="clientRows"
				class="mb-6"
				state-key="reports-sales-by-client"
				data-key="rowKey"
				default-sort-field="total"
				:default-sort-order="-1"
				:default-page-size="50"
				@row-click="(row) => openClient(row.clientId)"
			>
				<Column field="name" header="Client" sortable>
					<template #body="{ data }">
						<div class="min-w-[140px] max-w-[320px]">
							<div class="font-medium truncate">
								{{ data.name }}
							</div>
							<div class="text-xs text-(--ui-text-muted) truncate">
								{{ data.invoiceCount }} invoice{{ data.invoiceCount === 1 ? "" : "s" }}
							</div>
						</div>
					</template>
				</Column>
				<Column field="invoiceCount" header="Invoices" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div class="text-right tabular-nums whitespace-nowrap text-(--ui-text-muted)">
							{{ data.invoiceCount }}
						</div>
					</template>
				</Column>
				<Column field="total" header="Revenue" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div class="text-right tabular-nums whitespace-nowrap font-semibold text-(--ui-success)">
							{{ formatLKR(data.total) }}
						</div>
					</template>
				</Column>
				<Column field="share" header="% of total" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div class="text-right tabular-nums whitespace-nowrap text-(--ui-text-muted)">
							{{ pct(data.total, totals.revenue) }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>

			<!-- Drill-down: every issued invoice in the period, sortable.
				Same shape as the P&L invoice tab so the muscle memory
				carries across reports. -->
			<UCard>
				<template #header>
					<div class="app-chrome flex items-center justify-between gap-3 flex-wrap">
						<div class="app-chrome font-medium">
							Invoices
						</div>
						<div class="text-xs text-(--ui-text-muted) tabular-nums">
							{{ filteredInvoices.length }} · Total <span class="text-(--ui-text) font-medium ml-1">{{ formatLKR(totals.revenue) }}</span>
						</div>
					</div>
				</template>

				<div
					v-if="filteredInvoices.length === 0"
					class="py-10 text-center text-sm text-(--ui-text-muted)"
				>
					<UIcon name="i-lucide-receipt" class="size-10 mx-auto mb-2 opacity-40" />
					<div>No invoices issued in this period.</div>
				</div>

				<ResizableDataTable
					v-else
					:rows="filteredInvoices"
					state-key="reports-sales-by-client-invoices"
					default-sort-field="issue_date"
					:default-sort-order="-1"
					:default-page-size="50"
					@row-click="(row) => router.push(`/invoices/${row.id}`)"
				>
					<Column field="number" header="Number" sortable>
						<template #body="{ data }">
							<div class="font-medium tabular-nums whitespace-nowrap">
								{{ data.number }}
							</div>
						</template>
					</Column>
					<Column field="issue_date" header="Date" sortable>
						<template #body="{ data }">
							<div class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">
								{{ data.issue_date }}
							</div>
						</template>
					</Column>
					<Column field="client_name" header="Client" sortable>
						<template #body="{ data }">
							<div class="truncate min-w-[140px] max-w-[260px]">
								{{ data.client_name || "—" }}
							</div>
						</template>
					</Column>
					<Column field="subtotal_cents" header="Subtotal" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap">
								{{ formatLKR(data.subtotal_cents) }}
							</div>
						</template>
					</Column>
				</ResizableDataTable>
			</UCard>
		</template>

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:temp-path="pdf.state.tempPath"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Sales by client PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Sales by client report.
//
// Per-client revenue over a date range. Accrual basis — counts on the
// invoice's issue date, like P&L. Only `sent` invoices count (drafts
// aren't issued; cancelled never count). Uses `subtotal_cents`
// because VAT is a pass-through, not real revenue.
//
// All math in-memory on rows already in the invoices store; fine at
// expected per-tenant volumes (low thousands of rows max).

	import type { InvoiceRow } from "~/stores/invoices";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR } from "~/lib/money";
	import { buildSalesByClientPdfPayload } from "~/lib/report-pdf";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Sales by client" });

	const router = useRouter();
	const invoicesStore = useInvoicesStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			settingsStore.ensureLoaded(),
			invoicesStore.ensureLoaded()
		]);
	}));

	// Date range state (same shape as P&L / Cash flow). Default = current
	// fiscal year per company_settings.fiscal_year_start_month.
	const dateFrom = ref("");
	const dateTo = ref("");

	const isoFromDate = (d: Date): string =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

	type DatePresetKey
		= | "this_month"
			| "last_month"
			| "this_quarter"
			| "this_year"
			| "last_year"
			| "fiscal_year";
	interface DatePreset { key: DatePresetKey, label: string }
	const DATE_PRESETS: DatePreset[] = [
		{ key: "this_month", label: "This month" },
		{ key: "last_month", label: "Last month" },
		{ key: "this_quarter", label: "This quarter" },
		{ key: "this_year", label: "This year" },
		{ key: "last_year", label: "Last year" },
		{ key: "fiscal_year", label: "Fiscal year" }
	];

	function datePresetBounds(key: DatePresetKey): { from: string, to: string } {
		const now = new Date();
		const y = now.getFullYear();
		const m = now.getMonth();
		if (key === "this_month") {
			return { from: isoFromDate(new Date(y, m, 1)), to: isoFromDate(new Date(y, m + 1, 0)) };
		}
		if (key === "last_month") {
			return { from: isoFromDate(new Date(y, m - 1, 1)), to: isoFromDate(new Date(y, m, 0)) };
		}
		if (key === "this_quarter") {
			const qStart = Math.floor(m / 3) * 3;
			return { from: isoFromDate(new Date(y, qStart, 1)), to: isoFromDate(new Date(y, qStart + 3, 0)) };
		}
		if (key === "this_year") {
			return { from: `${y}-01-01`, to: `${y}-12-31` };
		}
		if (key === "last_year") {
			return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
		}
		const startMonth1Based = settingsStore.settings?.fiscal_year_start_month ?? 4;
		const startMonth = startMonth1Based - 1;
		const fyStartYear = m >= startMonth ? y : y - 1;
		return {
			from: isoFromDate(new Date(fyStartYear, startMonth, 1)),
			to: isoFromDate(new Date(fyStartYear + 1, startMonth, 0))
		};
	}

	function applyPreset(key: DatePresetKey): void {
		const { from, to } = datePresetBounds(key);
		dateFrom.value = from;
		dateTo.value = to;
	}

	function isPresetActive(key: DatePresetKey): boolean {
		const { from, to } = datePresetBounds(key);
		return dateFrom.value === from && dateTo.value === to;
	}

	function togglePreset(key: DatePresetKey): void {
		if (isPresetActive(key)) {
			dateFrom.value = "";
			dateTo.value = "";
			return;
		}
		applyPreset(key);
	}

	function presetClasses(key: DatePresetKey): string {
		return isPresetActive(key)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: "border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-border-accented)";
	}

	function resetDates(): void {
		dateFrom.value = "";
		dateTo.value = "";
	}

	if (!dateFrom.value && !dateTo.value) {
		applyPreset("fiscal_year");
	}

	// In-range predicate. Lexicographic ISO compare — safe for
	// YYYY-MM-DD strings, avoids Date parsing.
	function inRange(iso: string | null | undefined): boolean {
		if (!iso) return false;
		if (dateFrom.value && iso < dateFrom.value) return false;
		if (dateTo.value && iso > dateTo.value) return false;
		return true;
	}

	// Issued invoices in range, chronological. Drafts and cancelled
	// excluded — same definition the P&L uses, so the totals match
	// when the same date range is picked on both reports.
	const filteredInvoices = computed<InvoiceRow[]>(() =>
		invoicesStore.invoices
			.filter((row) => row.status === "sent" && inRange(row.issue_date))
			.sort((a, b) => a.issue_date.localeCompare(b.issue_date))
	);

	// Per-client aggregation. Group by client_id, sum subtotal_cents.
	// Client names come off the denormalised `invoice.client_name`
	// column (migration 0028) — no snapshot JSON parsing per row.
	interface ClientSalesRow {
		rowKey: string
		clientId: number | null
		name: string
		invoiceCount: number
		total: number
	}
	const clientRows = computed<ClientSalesRow[]>(() => {
		const byClient = new Map<number, ClientSalesRow>();
		for (const inv of filteredInvoices.value) {
			const cid = inv.client_id;
			let row = byClient.get(cid);
			if (!row) {
				row = {
					rowKey: `client:${cid}`,
					clientId: cid,
					name: inv.client_name || "(no client)",
					invoiceCount: 0,
					total: 0
				};
				byClient.set(cid, row);
			}
			row.invoiceCount++;
			row.total += inv.subtotal_cents;
		}
		return Array.from(byClient.values()).sort((a, b) => b.total - a.total);
	});

	const totals = computed(() => {
		const revenue = filteredInvoices.value.reduce((s, r) => s + r.subtotal_cents, 0);
		return {
			revenue,
			invoiceCount: filteredInvoices.value.length,
			clientCount: clientRows.value.length
		};
	});

	const avgPerClient = computed(() =>
		totals.value.clientCount === 0 ? 0 : Math.round(totals.value.revenue / totals.value.clientCount)
	);
	const avgPerInvoice = computed(() =>
		totals.value.invoiceCount === 0 ? 0 : Math.round(totals.value.revenue / totals.value.invoiceCount)
	);

	const rangeLabel = computed(() => {
		const fmt = (iso: string): string => {
			const [y, mo, d] = iso.split("-").map(Number);
			if (!y || !mo || !d) return iso;
			const dt = new Date(y, mo - 1, d);
			return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
		};
		if (!dateFrom.value && !dateTo.value) return "All time";
		if (!dateFrom.value) return `Up to ${fmt(dateTo.value)}`;
		if (!dateTo.value) return `From ${fmt(dateFrom.value)}`;
		return `${fmt(dateFrom.value)} → ${fmt(dateTo.value)}`;
	});

	const pct = (part: number, whole: number): string => {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	};

	// Open /invoices pre-filtered to a client. Same store-filter +
	// route pattern the aged-receivables and clients-detail pages
	// already use.
	const openClient = (clientId: number | null) => {
		if (clientId === null) return;
		invoicesStore.search = "";
		invoicesStore.clearStatusFilters();
		invoicesStore.clearDateFilters();
		invoicesStore.clientFilter = clientId;
		void router.push("/invoices");
	};

	// ---- PDF export ------------------------------------------------------
	const pdf = usePdfPreview({
		command: "export_report_pdf",
		buildPayload: () => buildSalesByClientPdfPayload({
			settings: settingsStore.settings,
			currency: currency.value,
			dateFrom: dateFrom.value,
			dateTo: dateTo.value,
			totals: totals.value,
			clientRows: clientRows.value,
			invoices: filteredInvoices.value
		}),
		fileName: () => {
			const stamp = dateFrom.value && dateTo.value
				? `${dateFrom.value}_${dateTo.value}`
				: new Date().toISOString().slice(0, 10);
			return `sales-by-client-${stamp}.pdf`;
		},
		title: "Sales by client PDF preview"
	});

	const onPdfClick = () => {
		if (isLoading.value || pdf.state.rendering) return;
		pdf.open();
	};
</script>
