<template>
	<div class="select-none">
		<!-- Top toolbar row: back link on the left, action cluster on the
			right. Mirrors the invoice / quote / bill detail-page pattern
			so the button position is consistent across the app — sits
			above the title block, not crammed beside the description. -->
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/reports" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to Reports
			</NuxtLink>

			<!-- PDF & Print: hands the same filtered/totals view-model to
				the report template the user is looking at. Disabled
				while data is loading so we don't render an empty PDF. -->
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
				Profit &amp; Loss
				<!-- Inline spinner mirrors the list pages — header stays
					visible so the user knows where they are even while
					the report's three stores hydrate. -->
				<UIcon
					v-if="isLoading"
					name="i-lucide-loader-circle"
					class="size-4 animate-spin text-(--ui-primary)"
				/>
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span v-if="isLoading">Loading…</span>
				<template v-else>
					<!-- Accrual basis: dates are when the document was issued
						(invoice / bill issue_date, payslip period_end), not
						when the money actually moved. The cash-flow report
						(coming) will be the cash-basis cousin. -->
					Income from issued invoices, minus expenses from bills and
					payroll. Accrual basis — counted on issue / period-end
					dates, not on when the money moved. Amounts exclude VAT.
				</template>
			</p>
		</header>

		<!-- Content-shaped skeleton while the three stores hydrate.
			Mirrors the real page's structure: filter card with date
			fields + preset chips, 3 KPI tile placeholders, a chart
			card with mini bar-chart shape, breakdown table rows.
			Uses the same animate-pulse + rAF-yield pattern as the
			rest of the app (see usePageLoading). -->
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
					<div class="space-y-1.5">
						<div class="h-3 w-32 rounded bg-(--ui-bg-muted)" />
						<div class="h-2 w-48 rounded bg-(--ui-bg-muted)/60" />
					</div>
				</template>
				<!-- Mini bar-chart placeholder so the trend section reads
					as "a chart is coming", not just an empty box. -->
				<div class="flex items-end gap-1.5 h-44">
					<div
						v-for="n in 12"
						:key="`cf-skel-${n}`"
						class="flex gap-0.5 flex-1"
					>
						<div
							class="flex-1 rounded-sm bg-(--ui-bg-muted)"
							:style="{ height: `${30 + ((n * 17) % 55)}%` }"
						/>
						<div
							class="flex-1 rounded-sm bg-(--ui-bg-muted)/70"
							:style="{ height: `${20 + ((n * 23) % 60)}%` }"
						/>
					</div>
				</div>
			</UCard>

			<UCard class="mb-6 animate-pulse">
				<template #header>
					<div class="h-3 w-28 rounded bg-(--ui-bg-muted)" />
				</template>
				<div class="space-y-3">
					<div
						v-for="r in 4"
						:key="`brk-skel-${r}`"
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

		<!-- Real content. v-else gates everything below so the KPI tiles
			don't briefly flash "Rs 0" between mount and the first data
			compute. -->
		<template v-else>
			<!-- Filter strip: from / to dates + preset chips. Default to the
			current fiscal year on first visit since that's the most
			common P&L question; user can narrow / widen from there. -->
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

			<!-- Three KPI tiles: Income, Expenses, Net. Same shape as the
			dashboard so the numbers feel familiar. -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Income
						</div>
						<UIcon name="i-lucide-arrow-down-left" class="size-4 text-(--ui-success)" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-success)"
						:title="formatLKR(totals.income)"
					>
						{{ formatLKR(totals.income) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ totals.invoiceCount }} invoice{{ totals.invoiceCount === 1 ? "" : "s" }} issued
					</div>
				</UCard>

				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Expenses
						</div>
						<UIcon name="i-lucide-arrow-up-right" class="size-4 text-(--ui-error)" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-error)"
						:title="formatLKR(totals.expenses)"
					>
						{{ formatLKR(totals.expenses) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted) flex items-center gap-2 flex-wrap">
						<span>{{ totals.billCount }} bill{{ totals.billCount === 1 ? "" : "s" }}</span>
						<span class="text-(--ui-border-accented)">·</span>
						<span>{{ totals.payslipCount }} payslip{{ totals.payslipCount === 1 ? "" : "s" }}</span>
					</div>
				</UCard>

				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Net {{ totals.net >= 0 ? "profit" : "loss" }}
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
						:title="`${totals.net >= 0 ? '+' : '−'}${formatLKR(Math.abs(totals.net))}`"
					>
						{{ totals.net >= 0 ? "+" : "−" }}{{ formatLKR(Math.abs(totals.net)) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ marginLabel }}
					</div>
				</UCard>
			</div>

			<!-- Monthly trend: twin bars per month (income vs expense) with a
			net trend line overlay. Reveals month-over-month patterns the
			KPI tiles can't — a stable Net for the period might be hiding
			a great Q1 + a terrible Q3, etc. Tied to the same filtered
			row sets the breakdown uses, so totals line up exactly. -->
			<UCard class="mb-6">
				<template #header>
					<div class="app-chrome flex items-center justify-between gap-2 flex-wrap">
						<div class="app-chrome font-medium">
							Monthly trend
						</div>
						<div class="text-xs text-(--ui-text-muted)">
							{{ rangeLabel }}
						</div>
					</div>
				</template>
				<PnlMonthlyChart
					:invoices="filtered.invoices"
					:bills="filtered.bills"
					:payslips="filtered.payslips"
					:date-from="dateFrom"
					:date-to="dateTo"
				/>
			</UCard>

			<!-- Breakdown table — the canonical P&L shape: income line(s),
			less expense line(s), final net. % column gives the user a
			feel for which expense buckets dominate without needing to
			eyeball the numbers. -->
			<UCard class="mb-6">
				<template #header>
					<div class="app-chrome flex items-center justify-between gap-2 flex-wrap">
						<div class="app-chrome font-medium">
							Breakdown
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
								Line
							</th>
							<th class="py-2 px-2 font-medium text-right">
								Amount
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right w-20">
								% of income
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-b border-(--ui-border)/60">
							<td class="py-2 pl-3 pr-2">
								<div class="font-medium">
									Income
								</div>
								<div class="text-xs text-(--ui-text-muted)">
									Issued invoices, subtotal excluding VAT
								</div>
							</td>
							<td class="py-2 px-2 text-right tabular-nums font-medium text-(--ui-success)">
								{{ formatLKR(totals.income) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums text-(--ui-text-muted)">
								100%
							</td>
						</tr>
						<tr class="border-b border-(--ui-border)/60">
							<td class="py-2 pl-3 pr-2">
								<div>Bills (purchases)</div>
								<div class="text-xs text-(--ui-text-muted)">
									Open bills, subtotal excluding VAT
								</div>
							</td>
							<td class="py-2 px-2 text-right tabular-nums text-(--ui-error)">
								− {{ formatLKR(totals.bills) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums text-(--ui-text-muted)">
								{{ pct(totals.bills, totals.income) }}
							</td>
						</tr>
						<tr class="border-b border-(--ui-border)/60">
							<td class="py-2 pl-3 pr-2">
								<div>Payroll</div>
								<div class="text-xs text-(--ui-text-muted)">
									Issued payslips, gross earnings (before deductions)
								</div>
							</td>
							<td class="py-2 px-2 text-right tabular-nums text-(--ui-error)">
								− {{ formatLKR(totals.payroll) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums text-(--ui-text-muted)">
								{{ pct(totals.payroll, totals.income) }}
							</td>
						</tr>
						<tr class="bg-(--ui-bg-muted)/60">
							<td class="py-3 pl-3 pr-2 font-semibold">
								Net {{ totals.net >= 0 ? "profit" : "loss" }}
							</td>
							<td
								class="py-3 px-2 text-right tabular-nums font-semibold"
								:class="totals.net >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
							>
								{{ totals.net >= 0 ? "+" : "−" }}{{ formatLKR(Math.abs(totals.net)) }}
							</td>
							<td
								class="py-3 pl-2 pr-3 text-right tabular-nums font-semibold"
								:class="totals.net >= 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
							>
								{{ pct(Math.abs(totals.net), totals.income) }}
							</td>
						</tr>
					</tbody>
				</table>
			</UCard>

			<!-- Underlying document drill-downs. Single full-width card with
			a segmented tab control — at the earlier 3-column layout each
			table got ~340px even at xl, which crushed Number / Date /
			Subtotal into wrapped columns. Tabs give every table the
			page's full width and let us add a Party column for context
			(invoice numbers alone aren't very identifying — knowing the
			client / vendor makes the audit trail real).

			Tab strip styled to match the bundle/itemized toggle on the
			document detail pages so the language is consistent. Counts
			live inside each tab pill; the active tab's running total
			shows on the right, so the user always sees both "how many
			rows" and "how much" at a glance. -->
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

				<!-- Empty states share one shell, swapping icon + label. -->
				<div
					v-if="tabCounts[activeTab] === 0"
					class="py-10 text-center text-sm text-(--ui-text-muted)"
				>
					<UIcon :name="activeTabIcon" class="size-10 mx-auto mb-2 opacity-40" />
					<div>{{ activeTabEmpty }}</div>
				</div>

				<table v-else-if="activeTab === 'invoices'" class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium w-40">
								Number
							</th>
							<th class="py-2 px-2 font-medium w-28">
								Date
							</th>
							<th class="py-2 px-2 font-medium">
								Client
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right w-40">
								Subtotal
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="row in filtered.invoices"
							:key="row.id"
							class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
							@click="router.push(`/invoices/${row.id}`)"
						>
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums whitespace-nowrap">
								{{ row.number }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums whitespace-nowrap">
								{{ row.issue_date }}
							</td>
							<td class="py-2 px-2 truncate max-w-0">
								{{ partyName(row.client_snapshot) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums whitespace-nowrap">
								{{ formatLKR(row.subtotal_cents) }}
							</td>
						</tr>
					</tbody>
				</table>

				<table v-else-if="activeTab === 'bills'" class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium w-40">
								Number
							</th>
							<th class="py-2 px-2 font-medium w-28">
								Date
							</th>
							<th class="py-2 px-2 font-medium">
								Vendor
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right w-40">
								Subtotal
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="row in filtered.bills"
							:key="row.id"
							class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
							@click="router.push(`/bills/${row.id}`)"
						>
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums whitespace-nowrap">
								{{ row.number }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums whitespace-nowrap">
								{{ row.issue_date }}
							</td>
							<td class="py-2 px-2 truncate max-w-0">
								{{ partyName(row.vendor_snapshot) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums whitespace-nowrap">
								{{ formatLKR(row.subtotal_cents) }}
							</td>
						</tr>
					</tbody>
				</table>

				<table v-else class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium w-40">
								Number
							</th>
							<th class="py-2 px-2 font-medium w-28">
								Period end
							</th>
							<th class="py-2 px-2 font-medium">
								Employee
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right w-40">
								Earnings
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="row in filtered.payslips"
							:key="row.id"
							class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
							@click="router.push(`/payslips/${row.id}`)"
						>
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums whitespace-nowrap">
								{{ row.number }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums whitespace-nowrap">
								{{ row.period_end }}
							</td>
							<td class="py-2 px-2 truncate max-w-0">
								{{ partyName(row.employee_snapshot, "full_name") }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums whitespace-nowrap">
								{{ formatLKR(row.earnings_cents) }}
							</td>
						</tr>
					</tbody>
				</table>
			</UCard>
		</template>

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:temp-path="pdf.state.tempPath"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Profit & Loss PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Profit & Loss report (accrual basis).
//
// Income, expenses, and net for a date range. "Accrual" means we count
// documents on their issue dates (invoices / bills) or period-end
// (payslips), not on when money actually moved — that's the
// cash-flow report's job.
//
// Amounts use *subtotal_cents* on invoices / bills (i.e. excluding
// VAT) because VAT is a pass-through to the tax department, not real
// revenue / expense. Payroll uses *earnings_cents* (gross) since
// employee-side deductions (EPF, ETF withholdings) are still the
// company's expense from a P&L perspective — they're owed onward,
// not "saved".
//
// All math is in-memory on rows already in the stores. With current
// per-business volumes (low thousands of rows max) this is fine; if a
// real tenant ever crosses ~10k documents we'd switch to a SQL-side
// SUM query. See CLAUDE.md "DB-side pagination" deferred item.

	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR } from "~/lib/money";
	import { buildPnlPdfPayload } from "~/lib/report-pdf";
	import { useBillsStore } from "~/stores/bills";
	import { useInvoicesStore } from "~/stores/invoices";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Profit & Loss" });

	const router = useRouter();
	const invoicesStore = useInvoicesStore();
	const billsStore = useBillsStore();
	const payslipsStore = usePayslipsStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	// Loading state owned by `usePageLoading` — see the composable for
	// the rAF-yield trick that ensures the skeleton actually paints.
	// Top-level await was blocking the route transition and hiding the
	// skeleton at the same time (same pattern we fixed on calendar +
	// every list page).
	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			settingsStore.ensureLoaded(),
			invoicesStore.ensureLoaded(),
			billsStore.ensureLoaded(),
			payslipsStore.ensureLoaded()
		]);
	}));

	// Date range state. Default range = the current fiscal year per
	// company_settings.fiscal_year_start_month. Sri Lankan gov FY is
	// April-March so the default ends up being the right thing without
	// the user having to fiddle.
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
			const first = new Date(y, m, 1);
			const last = new Date(y, m + 1, 0);
			return { from: isoFromDate(first), to: isoFromDate(last) };
		}
		if (key === "last_month") {
			const first = new Date(y, m - 1, 1);
			const last = new Date(y, m, 0);
			return { from: isoFromDate(first), to: isoFromDate(last) };
		}
		if (key === "this_quarter") {
			// Calendar quarters (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec).
			const qStart = Math.floor(m / 3) * 3;
			const first = new Date(y, qStart, 1);
			const last = new Date(y, qStart + 3, 0);
			return { from: isoFromDate(first), to: isoFromDate(last) };
		}
		if (key === "this_year") {
			return { from: `${y}-01-01`, to: `${y}-12-31` };
		}
		if (key === "last_year") {
			return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
		}
		// fiscal_year: starts on company_settings.fiscal_year_start_month
		// (1-12) and runs 12 months. If today is on/after that month, the
		// FY started this calendar year; otherwise it started last year.
		const startMonth1Based = settingsStore.settings?.fiscal_year_start_month ?? 4;
		const startMonth = startMonth1Based - 1; // 0-based
		const fyStartYear = m >= startMonth ? y : y - 1;
		const first = new Date(fyStartYear, startMonth, 1);
		const last = new Date(fyStartYear + 1, startMonth, 0);
		return { from: isoFromDate(first), to: isoFromDate(last) };
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
		// Clicking the active preset clears, like the document list
		// pages do — gives the user a quick "show me everything" path.
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

	// First-visit default = fiscal year. Done lazily so we wait for
	// settings to be loaded above.
	if (!dateFrom.value && !dateTo.value) {
		applyPreset("fiscal_year");
	}

	// In-range predicate. Both bounds are optional: missing `from`
	// means open on the left, missing `to` means open on the right.
	// Comparing ISO YYYY-MM-DD strings lexicographically is safe and
	// avoids new Date() parsing surprises.
	function inRange(iso: string | null | undefined): boolean {
		if (!iso) return false;
		if (dateFrom.value && iso < dateFrom.value) return false;
		if (dateTo.value && iso > dateTo.value) return false;
		return true;
	}

	const filtered = computed(() => {
		// Income: invoices the user has actually issued. Drafts don't
		// count yet (revenue isn't recognised until the customer has
		// received the document), cancelled doesn't count ever.
		const invoices = invoicesStore.invoices
			.filter((row) => row.status === "sent" && inRange(row.issue_date))
			.sort((a, b) => a.issue_date.localeCompare(b.issue_date));
		// Bill expense: every non-cancelled bill in range. Bills don't
		// have a "draft" state — once entered they're a real liability.
		const bills = billsStore.bills
			.filter((row) => row.status !== "cancelled" && inRange(row.issue_date))
			.sort((a, b) => a.issue_date.localeCompare(b.issue_date));
		// Payroll expense: issued payslips in range by period_end —
		// the date the obligation accrued. Draft / cancelled excluded.
		const payslips = payslipsStore.payslips
			.filter((row) => row.status === "issued" && inRange(row.period_end))
			.sort((a, b) => a.period_end.localeCompare(b.period_end));
		return { invoices, bills, payslips };
	});

	const totals = computed(() => {
		const income = filtered.value.invoices.reduce((s, r) => s + r.subtotal_cents, 0);
		const bills = filtered.value.bills.reduce((s, r) => s + r.subtotal_cents, 0);
		const payroll = filtered.value.payslips.reduce((s, r) => s + r.earnings_cents, 0);
		const expenses = bills + payroll;
		return {
			income,
			bills,
			payroll,
			expenses,
			net: income - expenses,
			invoiceCount: filtered.value.invoices.length,
			billCount: filtered.value.bills.length,
			payslipCount: filtered.value.payslips.length
		};
	});

	// Margin sub-label on the Net tile. Hidden when there's no income
	// — "Loss of Rs X · −∞% margin" is not useful. Two decimal places
	// to feel precise without being noisy.
	const marginLabel = computed(() => {
		if (totals.value.income === 0) return "No income in this period";
		const m = (totals.value.net / totals.value.income) * 100;
		return `${m >= 0 ? "+" : "−"}${Math.abs(m).toFixed(1)}% margin`;
	});

	// Human-readable "May 1, 2026 → May 31, 2026" for the breakdown
	// header. Falls back gracefully when one or both bounds are blank.
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

	function pct(part: number, whole: number): string {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		// Hide hundredths for small percentages — looks tidier in a
		// column of values that are mostly two-digit.
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	}

	// Drill-down tabs. Single full-width table per tab gives every
	// column real breathing room — at the previous 3-up layout each
	// table got ~340px even at xl and the cells wrapped awkwardly.
	type TabKey = "invoices" | "bills" | "payslips";
	interface TabDef { key: TabKey, label: string, icon: string }
	const TABS: TabDef[] = [
		{ key: "invoices", label: "Invoices", icon: "i-lucide-receipt" },
		{ key: "bills", label: "Bills", icon: "i-lucide-file-input" },
		{ key: "payslips", label: "Payslips", icon: "i-lucide-file-spreadsheet" }
	];
	const activeTab = ref<TabKey>("invoices");

	const tabCounts = computed<Record<TabKey, number>>(() => ({
		invoices: filtered.value.invoices.length,
		bills: filtered.value.bills.length,
		payslips: filtered.value.payslips.length
	}));

	const activeTabTotal = computed(() => {
		if (activeTab.value === "invoices") return totals.value.income;
		if (activeTab.value === "bills") return totals.value.bills;
		return totals.value.payroll;
	});

	// Empty-state copy + icon for the current tab. Centralised so the
	// per-tab `<table v-if>` branches stay flat.
	const activeTabIcon = computed(() =>
		TABS.find((t) => t.key === activeTab.value)?.icon ?? "i-lucide-file"
	);
	const activeTabEmpty = computed(() => {
		if (activeTab.value === "invoices") return "No invoices issued in this period.";
		if (activeTab.value === "bills") return "No bills in this period.";
		return "No payslips in this period.";
	});

	// Pull the party name out of a snapshot JSON column. Snapshots are
	// JSON-stringified and shaped differently — clients/vendors use
	// `name`, employees use `full_name` — so the second arg picks the
	// key. Parsing JSON on every render is fine at expected row counts
	// (typically <100 rows per P&L period); revisit if profiling shows
	// it matters.
	function partyName(snapshotJson: string | null | undefined, key: "name" | "full_name" = "name"): string {
		if (!snapshotJson) return "—";
		try {
			const o = JSON.parse(snapshotJson) as Record<string, unknown>;
			const v = o?.[key];
			return typeof v === "string" && v.length > 0 ? v : "—";
		} catch {
			return "—";
		}
	}

	// ---- PDF export ------------------------------------------------------
	// Same preview-then-save flow every document detail page uses. The
	// builder lives in app/lib/report-pdf.ts so the shape is shared with
	// the future "schedule a recurring P&L" / "email this report" flows
	// without re-implementing the payload there.
	const pdf = usePdfPreview({
		command: "export_report_pdf",
		buildPayload: () => buildPnlPdfPayload({
			settings: settingsStore.settings,
			currency: currency.value,
			dateFrom: dateFrom.value,
			dateTo: dateTo.value,
			totals: totals.value,
			filtered: filtered.value
		}),
		fileName: () => {
			// Slug from the period bounds; fall back to a date stamp when
			// the user has cleared the range (rare but legal).
			const stamp = dateFrom.value && dateTo.value
				? `${dateFrom.value}_${dateTo.value}`
				: new Date().toISOString().slice(0, 10);
			return `profit-loss-${stamp}.pdf`;
		},
		title: "Profit & Loss PDF preview"
	});

	const onPdfClick = () => {
		if (isLoading.value || pdf.state.rendering) return;
		pdf.open();
	};
</script>
