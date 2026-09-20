<template>
	<div class="select-none">
		<FeatureLock v-if="locked" title="Cash flow" tier-label="Plus" feature="reports.cash_flow" />

		<!-- Top toolbar — PDF action. Same layout as the
			rest of the reports for consistency. -->
		<div class="mb-4 flex items-center justify-end gap-4">
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
				Cash flow
				<HelpButton slug="cash-flow" />
				<UIcon
					v-if="isLoading"
					name="i-lucide-loader-circle"
					class="size-4 animate-spin text-(--ui-primary)"
				/>
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span v-if="isLoading">Loading…</span>
				<template v-else>
					<!-- Cash basis: money in − money out by voucher date.
						Different from P&L, which is accrual (counts on
						document issue date, not on actual payment). For
						the same period, P&L and Cash flow can disagree;
						they're both correct, they answer different
						questions. -->
					Receipts collected vs payments made over a date range. Cash basis — counted on the date money actually moved, via voucher dates. Differs from P&L (accrual) on purpose.
				</template>
			</p>
		</header>

		<template v-if="!locked">
			<!-- Loading skeleton mirroring the real layout: filter card + 3
			KPI tiles + monthly breakdown table + tabbed drill-down. -->
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
						<div class="h-3 w-40 rounded bg-(--ui-bg-muted)" />
					</template>
					<div class="space-y-3">
						<div
							v-for="r in 6"
							:key="`mo-skel-${r}`"
							class="grid gap-3 py-2 border-b border-(--ui-border)/40 last:border-0"
							style="grid-template-columns: 1fr auto auto auto"
						>
							<div class="h-3 w-24 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-20 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-20 rounded bg-(--ui-bg-muted)" />
							<div class="h-3 w-20 rounded bg-(--ui-bg-muted)" />
						</div>
					</div>
				</UCard>
			</template>

			<template v-else>
				<!-- Filter strip: from / to dates + preset chips. Default to
				the current fiscal year on first visit (matches P&L), the
				most natural framing for a Sri Lankan business. -->
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

				<!-- Three KPI tiles: Receipts in, Payments out, Net. Net is
				success-toned when positive (money in > out) and error-toned
				when negative — same convention as the dashboard. -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
					<UCard class="h-full">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
								Receipts (in)
							</div>
							<UIcon name="i-lucide-arrow-down-left" class="size-4 text-(--ui-success)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-success)"
							:title="formatLKR(totals.receipts)"
						>
							{{ formatLKR(totals.receipts) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							{{ totals.receiptCount }} receipt{{ totals.receiptCount === 1 ? "" : "s" }}
						</div>
					</UCard>

					<UCard class="h-full">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
								Payments (out)
							</div>
							<UIcon name="i-lucide-arrow-up-right" class="size-4 text-(--ui-error)" />
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-error)"
							:title="formatLKR(totals.payments)"
						>
							{{ formatLKR(totals.payments) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							{{ totals.paymentCount }} payment{{ totals.paymentCount === 1 ? "" : "s" }}
						</div>
					</UCard>

					<UCard class="h-full">
						<div class="flex items-start justify-between gap-2">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
								Net cash flow
							</div>
							<UIcon
								:name="totals.net >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
								class="size-4"
								:class="totals.net >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
							/>
						</div>
						<div
							class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
							:class="totals.net >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
							:title="formatLKR(Math.abs(totals.net))"
						>
							{{ totals.net >= 0 ? "+" : "−" }}{{ formatLKR(Math.abs(totals.net)) }}
						</div>
						<div class="mt-1 text-xs text-(--ui-text-muted)">
							{{ rangeLabel }}
						</div>
					</UCard>
				</div>

				<!-- Monthly breakdown — one row per calendar month in the
				picked range. Shows the shape over time without needing a
				chart; users can scan for the months that swung the net
				one way or the other. Months with no activity are shown
				too (with dashes) so the user can see the full extent of
				the period. -->
				<UCard class="mb-6">
					<template #header>
						<div class="app-chrome flex items-center justify-between gap-2 flex-wrap">
							<div class="app-chrome font-medium">
								Monthly breakdown
							</div>
							<div class="text-xs text-(--ui-text-muted)">
								{{ rangeLabel }}
							</div>
						</div>
					</template>

					<table class="w-full text-sm">
						<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
							<tr>
								<th class="py-2 pl-3 pr-2 font-medium">
									Month
								</th>
								<th class="py-2 px-2 font-medium text-right whitespace-nowrap">
									Receipts (in)
								</th>
								<th class="py-2 px-2 font-medium text-right whitespace-nowrap">
									Payments (out)
								</th>
								<th class="py-2 pl-2 pr-3 font-medium text-right whitespace-nowrap">
									Net
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-if="monthlyRows.length === 0" class="border-b border-(--ui-border)/60">
								<td colspan="4" class="py-6 text-center text-sm text-(--ui-text-muted)">
									No voucher activity in this period.
								</td>
							</tr>
							<tr
								v-for="m in monthlyRows"
								v-else
								:key="m.key"
								class="border-b border-(--ui-border)/60 last:border-0"
							>
								<td class="py-2 pl-3 pr-2">
									<div class="font-medium">
										{{ m.label }}
									</div>
								</td>
								<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap" :class="m.receipts === 0 ? 'text-(--ui-text-muted)' : 'text-(--ui-success)'">
									{{ m.receipts === 0 ? "—" : formatLKR(m.receipts) }}
								</td>
								<td class="py-2 px-2 text-right tabular-nums whitespace-nowrap" :class="m.payments === 0 ? 'text-(--ui-text-muted)' : 'text-(--ui-error)'">
									{{ m.payments === 0 ? "—" : `− ${formatLKR(m.payments)}` }}
								</td>
								<td
									class="py-2 pl-2 pr-3 text-right tabular-nums font-medium whitespace-nowrap"
									:class="m.net === 0 ? 'text-(--ui-text-muted)' : (m.net > 0 ? 'text-(--ui-success)' : 'text-(--ui-error)')"
								>
									<template v-if="m.net === 0">
										—
									</template>
									<template v-else>
										{{ m.net > 0 ? "+ " : "− " }}{{ formatLKR(Math.abs(m.net)) }}
									</template>
								</td>
							</tr>
							<tr class="bg-(--ui-bg-muted)/60">
								<td class="py-3 pl-3 pr-2 font-semibold">
									Total
								</td>
								<td class="py-3 px-2 text-right tabular-nums font-semibold text-(--ui-success) whitespace-nowrap">
									{{ formatLKR(totals.receipts) }}
								</td>
								<td class="py-3 px-2 text-right tabular-nums font-semibold text-(--ui-error) whitespace-nowrap">
									{{ totals.payments === 0 ? "—" : `− ${formatLKR(totals.payments)}` }}
								</td>
								<td
									class="py-3 pl-2 pr-3 text-right tabular-nums font-semibold whitespace-nowrap"
									:class="totals.net >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
								>
									{{ totals.net >= 0 ? "+ " : "− " }}{{ formatLKR(Math.abs(totals.net)) }}
								</td>
							</tr>
						</tbody>
					</table>
				</UCard>

				<!-- Drill-down: tabs for Receipts / Payments. Each renders the
				underlying vouchers as a ResizableDataTable with the same
				UX as the other report drill-downs. -->
				<UCard>
					<template #header>
						<div class="app-chrome flex items-center justify-between gap-3 flex-wrap">
							<div class="flex border border-(--ui-border) rounded-md overflow-hidden text-xs">
								<button
									v-for="(t, i) in TABS"
									:key="t.key"
									type="button"
									class="px-3 py-1.5 transition cursor-pointer inline-flex items-center gap-1.5"
									:class="[
										activeTab === t.key
											? 'bg-(--ui-primary) text-(--ui-bg)'
											: 'hover:bg-(--ui-bg-muted)',
										i > 0 ? 'border-l border-(--ui-border)' : ''
									]"
									@click="activeTab = t.key"
								>
									<UIcon :name="t.icon" class="size-3.5" />
									<span>{{ t.label }}</span>
									<span
										class="tabular-nums px-1.5 rounded-sm"
										:class="activeTab === t.key
											? 'bg-(--ui-bg)/20'
											: 'bg-(--ui-bg-muted) text-(--ui-text-muted)'"
									>
										{{ tabCounts[t.key] }}
									</span>
								</button>
							</div>
							<div class="text-xs text-(--ui-text-muted) tabular-nums">
								Total <span class="text-(--ui-text) font-medium ml-1">{{ formatLKR(activeTabTotal) }}</span>
							</div>
						</div>
					</template>

					<div
						v-if="tabCounts[activeTab] === 0"
						class="py-10 text-center text-sm text-(--ui-text-muted)"
					>
						<UIcon :name="activeTabIcon" class="size-10 mx-auto mb-2 opacity-40" />
						<div>{{ activeTabEmpty }}</div>
					</div>

					<ResizableDataTable
						v-else-if="activeTab === 'receipts'"
						:rows="filtered.receipts"
						state-key="reports-cashflow-receipts"
						default-sort-field="voucher_date"
						:default-sort-order="-1"
						:default-page-size="50"
						@row-click="(row) => router.push(`/vouchers/${row.id}`)"
					>
						<Column field="number" header="Number" sortable>
							<template #body="{ data }">
								<div class="font-medium tabular-nums whitespace-nowrap">
									{{ data.number }}
								</div>
							</template>
						</Column>
						<Column field="voucher_date" header="Date" sortable>
							<template #body="{ data }">
								<div class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">
									{{ data.voucher_date }}
								</div>
							</template>
						</Column>
						<Column field="party_name" header="Party" sortable>
							<template #body="{ data }">
								<div class="truncate min-w-[140px] max-w-[260px]">
									{{ data.party_name || "—" }}
								</div>
							</template>
						</Column>
						<Column field="payment_method" header="Method" sortable>
							<template #body="{ data }">
								<div class="text-(--ui-text-muted) whitespace-nowrap">
									{{ methodLabel(data.payment_method) }}
								</div>
							</template>
						</Column>
						<Column field="amount_cents" header="Amount" sortable :style="{ textAlign: 'right' }">
							<template #body="{ data }">
								<div class="text-right tabular-nums whitespace-nowrap font-medium text-(--ui-success)">
									+ {{ formatLKR(data.amount_cents) }}
								</div>
							</template>
						</Column>
					</ResizableDataTable>

					<ResizableDataTable
						v-else
						:rows="filtered.payments"
						state-key="reports-cashflow-payments"
						default-sort-field="voucher_date"
						:default-sort-order="-1"
						:default-page-size="50"
						@row-click="(row) => router.push(`/vouchers/${row.id}`)"
					>
						<Column field="number" header="Number" sortable>
							<template #body="{ data }">
								<div class="font-medium tabular-nums whitespace-nowrap">
									{{ data.number }}
								</div>
							</template>
						</Column>
						<Column field="voucher_date" header="Date" sortable>
							<template #body="{ data }">
								<div class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">
									{{ data.voucher_date }}
								</div>
							</template>
						</Column>
						<Column field="party_name" header="Party" sortable>
							<template #body="{ data }">
								<div class="truncate min-w-[140px] max-w-[260px]">
									{{ data.party_name || "—" }}
								</div>
							</template>
						</Column>
						<Column field="payment_method" header="Method" sortable>
							<template #body="{ data }">
								<div class="text-(--ui-text-muted) whitespace-nowrap">
									{{ methodLabel(data.payment_method) }}
								</div>
							</template>
						</Column>
						<Column field="amount_cents" header="Amount" sortable :style="{ textAlign: 'right' }">
							<template #body="{ data }">
								<div class="text-right tabular-nums whitespace-nowrap font-medium text-(--ui-error)">
									− {{ formatLKR(data.amount_cents) }}
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
				title="Cash flow PDF preview"
				@save="pdf.onSave"
				@cancel="pdf.onCancel"
			/>
		</template>
	</div>
</template>

<script setup lang="ts">
// Cash flow report (cash basis).
//
// Receipts collected − payments made over a date range, with the
// underlying vouchers as the source of truth. Different from P&L —
// which is accrual (counts on document issue date) — and they can
// legitimately disagree for the same period:
//
//   - P&L recognises income when an invoice is issued, even if the
//     customer hasn't paid yet.
//   - Cash flow recognises income only when a receipt voucher is
//     recorded against that invoice.
//
// Both correct, different questions. The cash flow report is what
// the user looks at to answer "did we have more money coming in
// than going out this month?".

	import type { VoucherRow } from "~/stores/vouchers";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR } from "~/lib/money";
	import { buildCashFlowPdfPayload } from "~/lib/report-pdf";
	import { useLicenseStore } from "~/stores/license";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	const license = useLicenseStore();
	const locked = computed(() => !license.hasFeature("reports.cash_flow"));

	definePageMeta({ title: "Cash flow" });

	const router = useRouter();
	const vouchersStore = useVouchersStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			settingsStore.ensureLoaded(),
			vouchersStore.ensureLoaded()
		]);
	}));

	// Date range state. Defaults to the current fiscal year (same as
	// P&L) so the first-visit experience matches.
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
		// fiscal_year — driven by company_settings.
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

	// First-visit default = fiscal year.
	if (!dateFrom.value && !dateTo.value) {
		applyPreset("fiscal_year");
	}

	function inRange(iso: string | null | undefined): boolean {
		if (!iso) return false;
		if (dateFrom.value && iso < dateFrom.value) return false;
		if (dateTo.value && iso > dateTo.value) return false;
		return true;
	}

	// Receipts / payments in the picked range. Sort ascending by
	// voucher_date so the underlying detail tables and PDF detail
	// sections read chronologically by default; the DataTable
	// applies its own default-sort (desc) on top of this for
	// freshest-first scanning.
	const filtered = computed(() => {
		const receipts: VoucherRow[] = [];
		const payments: VoucherRow[] = [];
		for (const v of vouchersStore.vouchers) {
			if (!inRange(v.voucher_date)) continue;
			if (v.voucher_type === "receipt") receipts.push(v);
			else if (v.voucher_type === "payment") payments.push(v);
		}
		receipts.sort((a, b) => a.voucher_date.localeCompare(b.voucher_date));
		payments.sort((a, b) => a.voucher_date.localeCompare(b.voucher_date));
		return { receipts, payments };
	});

	const totals = computed(() => {
		const receipts = filtered.value.receipts.reduce((s, v) => s + v.amount_cents, 0);
		const payments = filtered.value.payments.reduce((s, v) => s + v.amount_cents, 0);
		return {
			receipts,
			payments,
			net: receipts - payments,
			receiptCount: filtered.value.receipts.length,
			paymentCount: filtered.value.payments.length
		};
	});

	// Monthly breakdown rows. We always emit a full series of months
	// between dateFrom and dateTo so months with no activity show as
	// dashes — the user can see the full extent of the period and
	// spot dry months without having to second-guess the data.
	interface MonthlyRow {
		key: string
		label: string
		receipts: number
		payments: number
		net: number
	}
	const monthlyRows = computed<MonthlyRow[]>(() => {
		if (!dateFrom.value || !dateTo.value) {
			// Open-ended range: aggregate per month over whatever data
			// we have. Range derived from the actual voucher dates.
			const range = computeRangeFromData(filtered.value.receipts, filtered.value.payments);
			if (!range) return [];
			return buildMonthlyRows(range.from, range.to, filtered.value.receipts, filtered.value.payments);
		}
		return buildMonthlyRows(dateFrom.value, dateTo.value, filtered.value.receipts, filtered.value.payments);
	});

	function computeRangeFromData(receipts: VoucherRow[], payments: VoucherRow[]): { from: string, to: string } | null {
		let from: string | null = null;
		let to: string | null = null;
		for (const v of [...receipts, ...payments]) {
			if (!from || v.voucher_date < from) from = v.voucher_date;
			if (!to || v.voucher_date > to) to = v.voucher_date;
		}
		return from && to ? { from, to } : null;
	}

	function buildMonthlyRows(fromIso: string, toIso: string, receipts: VoucherRow[], payments: VoucherRow[]): MonthlyRow[] {
		const [fy, fm] = fromIso.split("-").map(Number);
		const [ty, tm] = toIso.split("-").map(Number);
		if (!fy || !fm || !ty || !tm) return [];

		// Build the month skeleton (one row per calendar month spanned).
		// Iterate with a numeric month index rather than mutating a
		// Date in-place — eslint's no-unmodified-loop-condition can't
		// see Date.setMonth() as a mutation and would flag the loop.
		const rows = new Map<string, MonthlyRow>();
		const monthCount
			= (ty - fy) * 12 + (tm - fm) + 1;
		for (let i = 0; i < monthCount; i++) {
			const d = new Date(fy, fm - 1 + i, 1);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
			const label = d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
			rows.set(key, { key, label, receipts: 0, payments: 0, net: 0 });
		}

		// Accumulate.
		for (const v of receipts) {
			const key = v.voucher_date.slice(0, 7);
			const row = rows.get(key);
			if (row) row.receipts += v.amount_cents;
		}
		for (const v of payments) {
			const key = v.voucher_date.slice(0, 7);
			const row = rows.get(key);
			if (row) row.payments += v.amount_cents;
		}

		// Compute nets.
		for (const row of rows.values()) {
			row.net = row.receipts - row.payments;
		}

		return Array.from(rows.values());
	}

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

	// Pretty-print the voucher's payment_method enum.
	const methodLabel = (m: string | null | undefined): string => {
		if (!m) return "—";
		const map: Record<string, string> = {
			bank_transfer: "Bank transfer",
			cash: "Cash",
			cheque: "Cheque",
			card: "Card",
			other: "Other"
		};
		return map[m] ?? m;
	};

	// Drill-down tabs (Receipts / Payments) — same shape as the P&L /
	// VAT drill-downs.
	type TabKey = "receipts" | "payments";
	interface TabDef { key: TabKey, label: string, icon: string }
	const TABS: TabDef[] = [
		{ key: "receipts", label: "Receipts", icon: "i-lucide-arrow-down-left" },
		{ key: "payments", label: "Payments", icon: "i-lucide-arrow-up-right" }
	];
	const activeTab = ref<TabKey>("receipts");

	const tabCounts = computed<Record<TabKey, number>>(() => ({
		receipts: filtered.value.receipts.length,
		payments: filtered.value.payments.length
	}));

	const activeTabTotal = computed(() =>
		activeTab.value === "receipts" ? totals.value.receipts : totals.value.payments
	);

	const activeTabIcon = computed(() =>
		TABS.find((t) => t.key === activeTab.value)?.icon ?? "i-lucide-file"
	);
	const activeTabEmpty = computed(() => {
		if (activeTab.value === "receipts") return "No receipts in this period.";
		return "No payments in this period.";
	});

	// ---- PDF export ------------------------------------------------------
	const pdf = usePdfPreview({
		command: "export_report_pdf",
		buildPayload: () => buildCashFlowPdfPayload({
			settings: settingsStore.settings,
			currency: currency.value,
			dateFrom: dateFrom.value,
			dateTo: dateTo.value,
			totals: totals.value,
			monthlyRows: monthlyRows.value,
			filtered: filtered.value
		}),
		fileName: () => `cash-flow-${dateFrom.value || "all"}_${dateTo.value || "all"}.pdf`,
		title: "Cash flow PDF preview"
	});

	const onPdfClick = () => {
		if (isLoading.value || pdf.state.rendering) return;
		pdf.open();
	};
</script>
