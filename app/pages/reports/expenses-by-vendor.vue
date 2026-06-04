<template>
	<div class="select-none">
		<FeatureLock v-if="locked" title="Expenses by vendor" tier-label="Plus" feature="reports.expenses_by_vendor" />

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
				Expenses by vendor
				<HelpButton slug="expenses-by-vendor" />
				<UIcon
					v-if="isLoading"
					name="i-lucide-loader-circle"
					class="size-4 animate-spin text-(--ui-primary)"
				/>
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span v-if="isLoading">Loading…</span>
				<template v-else>
					<!-- Mirror of sales-by-client. Same accrual basis, same
						subtotals-only treatment of VAT. -->
					Spend per vendor over a date range. Counts non-cancelled bills on their issue date; subtotals exclude VAT. Click a vendor to see their full bill list.
				</template>
			</p>
		</header>

		<template v-if="!locked">
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

				<!-- Three KPI tiles: Spend, Vendors, Bills. -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
					<UCard class="h-full">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
								Total spend
							</div>
							<UIcon name="i-lucide-arrow-up-right" class="size-4 text-(--ui-error)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-error)"
							:title="formatLKR(totals.spend)"
						>
							{{ formatLKR(totals.spend) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							{{ totals.billCount }} bill{{ totals.billCount === 1 ? "" : "s" }} received
						</div>
					</UCard>

					<UCard class="h-full">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
								Vendors
							</div>
							<UIcon name="i-lucide-store" class="size-4 text-(--ui-text-muted)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
						>
							{{ totals.vendorCount }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							<template v-if="totals.vendorCount === 0">
								No vendors in this period
							</template>
							<template v-else>
								Avg {{ formatLKR(avgPerVendor) }} per vendor
							</template>
						</div>
					</UCard>

					<UCard class="h-full">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
								Bills
							</div>
							<UIcon name="i-lucide-file-input" class="size-4 text-(--ui-text-muted)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
						>
							{{ totals.billCount }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							<template v-if="totals.billCount === 0">
								No bills received
							</template>
							<template v-else>
								Avg {{ formatLKR(avgPerBill) }} per bill
							</template>
						</div>
					</UCard>
				</div>

				<!-- Per-vendor breakdown. -->
				<div class="mb-2 flex items-end justify-between gap-2 flex-wrap">
					<div>
						<div class="font-medium">
							By vendor
						</div>
						<div class="text-xs text-(--ui-text-muted) mt-0.5">
							Click a row to open that vendor's bill list pre-filtered. {{ rangeLabel }}.
						</div>
					</div>
					<div class="text-xs text-(--ui-text-muted)">
						{{ vendorRows.length }} vendor{{ vendorRows.length === 1 ? "" : "s" }} with spend
					</div>
				</div>

				<div
					v-if="vendorRows.length === 0"
					class="py-10 text-center text-sm text-(--ui-text-muted) border border-dashed border-(--ui-border) rounded-lg mb-6"
				>
					<UIcon name="i-lucide-file-input" class="size-10 mx-auto mb-2 opacity-40" />
					<div>No bills in this period.</div>
				</div>

				<ResizableDataTable
					v-else
					:rows="vendorRows"
					class="mb-6"
					state-key="reports-expenses-by-vendor"
					data-key="rowKey"
					default-sort-field="total"
					:default-sort-order="-1"
					:default-page-size="50"
					@row-click="(row) => openVendor(row.vendorId)"
				>
					<Column field="name" header="Vendor" sortable>
						<template #body="{ data }">
							<div class="min-w-[140px] max-w-[320px]">
								<div class="font-medium truncate">
									{{ data.name }}
								</div>
								<div class="text-xs text-(--ui-text-muted) truncate">
									{{ data.billCount }} bill{{ data.billCount === 1 ? "" : "s" }}
								</div>
							</div>
						</template>
					</Column>
					<Column field="billCount" header="Bills" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap text-(--ui-text-muted)">
								{{ data.billCount }}
							</div>
						</template>
					</Column>
					<Column field="total" header="Spend" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap font-semibold text-(--ui-error)">
								{{ formatLKR(data.total) }}
							</div>
						</template>
					</Column>
					<Column field="share" header="% of total" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap text-(--ui-text-muted)">
								{{ pct(data.total, totals.spend) }}
							</div>
						</template>
					</Column>
				</ResizableDataTable>

				<!-- Drill-down: every non-cancelled bill in the period. -->
				<UCard>
					<template #header>
						<div class="app-chrome flex items-center justify-between gap-3 flex-wrap">
							<div class="app-chrome font-medium">
								Bills
							</div>
							<div class="text-xs text-(--ui-text-muted) tabular-nums">
								{{ filteredBills.length }} · Total <span class="text-(--ui-text) font-medium ml-1">{{ formatLKR(totals.spend) }}</span>
							</div>
						</div>
					</template>

					<div
						v-if="filteredBills.length === 0"
						class="py-10 text-center text-sm text-(--ui-text-muted)"
					>
						<UIcon name="i-lucide-file-input" class="size-10 mx-auto mb-2 opacity-40" />
						<div>No bills in this period.</div>
					</div>

					<ResizableDataTable
						v-else
						:rows="filteredBills"
						state-key="reports-expenses-by-vendor-bills"
						default-sort-field="issue_date"
						:default-sort-order="-1"
						:default-page-size="50"
						@row-click="(row) => router.push(`/bills/${row.id}`)"
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
						<Column field="vendor_name" header="Vendor" sortable>
							<template #body="{ data }">
								<div class="truncate min-w-[140px] max-w-[260px]">
									{{ data.vendor_name || "—" }}
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
				title="Expenses by vendor PDF preview"
				@save="pdf.onSave"
				@cancel="pdf.onCancel"
			/>
		</template>
	</div>
</template>

<script setup lang="ts">
// Expenses by vendor report.
//
// Per-vendor spend over a date range. Mirror of sales-by-client but
// for bills + vendors. Cancelled bills excluded; uses subtotal_cents
// because input VAT is recoverable via the VAT report — counting it
// here would inflate the expense by an amount we get back.

	import type { BillRow } from "~/stores/bills";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR } from "~/lib/money";
	import { buildExpensesByVendorPdfPayload } from "~/lib/report-pdf";
	import { useBillsStore } from "~/stores/bills";
	import { useLicenseStore } from "~/stores/license";
	import { useSettingsStore } from "~/stores/settings";

	const license = useLicenseStore();
	const locked = computed(() => !license.hasFeature("reports.expenses_by_vendor"));

	definePageMeta({ title: "Expenses by vendor" });

	const router = useRouter();
	const billsStore = useBillsStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			settingsStore.ensureLoaded(),
			billsStore.ensureLoaded()
		]);
	}));

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

	function inRange(iso: string | null | undefined): boolean {
		if (!iso) return false;
		if (dateFrom.value && iso < dateFrom.value) return false;
		if (dateTo.value && iso > dateTo.value) return false;
		return true;
	}

	const filteredBills = computed<BillRow[]>(() =>
		billsStore.bills
			.filter((row) => row.status !== "cancelled" && inRange(row.issue_date))
			.sort((a, b) => a.issue_date.localeCompare(b.issue_date))
	);

	interface VendorExpenseRow {
		rowKey: string
		vendorId: number | null
		name: string
		billCount: number
		total: number
	}
	const vendorRows = computed<VendorExpenseRow[]>(() => {
		const byVendor = new Map<number, VendorExpenseRow>();
		for (const bill of filteredBills.value) {
			const vid = bill.vendor_id;
			let row = byVendor.get(vid);
			if (!row) {
				row = {
					rowKey: `vendor:${vid}`,
					vendorId: vid,
					name: bill.vendor_name || "(no vendor)",
					billCount: 0,
					total: 0
				};
				byVendor.set(vid, row);
			}
			row.billCount++;
			row.total += bill.subtotal_cents;
		}
		return Array.from(byVendor.values()).sort((a, b) => b.total - a.total);
	});

	const totals = computed(() => {
		const spend = filteredBills.value.reduce((s, r) => s + r.subtotal_cents, 0);
		return {
			spend,
			billCount: filteredBills.value.length,
			vendorCount: vendorRows.value.length
		};
	});

	const avgPerVendor = computed(() =>
		totals.value.vendorCount === 0 ? 0 : Math.round(totals.value.spend / totals.value.vendorCount)
	);
	const avgPerBill = computed(() =>
		totals.value.billCount === 0 ? 0 : Math.round(totals.value.spend / totals.value.billCount)
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

	const openVendor = (vendorId: number | null) => {
		if (vendorId === null) return;
		billsStore.search = "";
		billsStore.clearStatusFilters();
		billsStore.clearDateFilters();
		billsStore.vendorFilter = vendorId;
		void router.push("/bills");
	};

	// ---- PDF export ------------------------------------------------------
	const pdf = usePdfPreview({
		command: "export_report_pdf",
		buildPayload: () => buildExpensesByVendorPdfPayload({
			settings: settingsStore.settings,
			currency: currency.value,
			dateFrom: dateFrom.value,
			dateTo: dateTo.value,
			totals: totals.value,
			vendorRows: vendorRows.value,
			bills: filteredBills.value
		}),
		fileName: () => {
			const stamp = dateFrom.value && dateTo.value
				? `${dateFrom.value}_${dateTo.value}`
				: new Date().toISOString().slice(0, 10);
			return `expenses-by-vendor-${stamp}.pdf`;
		},
		title: "Expenses by vendor PDF preview"
	});

	const onPdfClick = () => {
		if (isLoading.value || pdf.state.rendering) return;
		pdf.open();
	};
</script>
