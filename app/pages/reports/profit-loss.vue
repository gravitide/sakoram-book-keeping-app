<template>
	<div class="select-none">
		<div class="mb-4">
			<NuxtLink to="/reports" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to Reports
			</NuxtLink>
		</div>

		<header class="mb-6">
			<h1 class="text-2xl font-semibold">
				Profit &amp; Loss
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<!-- Accrual basis: dates are when the document was issued
					(invoice / bill issue_date, payslip period_end), not
					when the money actually moved. The cash-flow report
					(coming) will be the cash-basis cousin. -->
				Income from issued invoices, minus expenses from bills and
				payroll. Accrual basis — counted on issue / period-end
				dates, not on when the money moved. Amounts exclude VAT.
			</p>
		</header>

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
					class="mt-2 text-2xl font-semibold tabular-nums text-(--ui-success)"
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
					class="mt-2 text-2xl font-semibold tabular-nums text-(--ui-error)"
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
					class="mt-2 text-2xl font-semibold tabular-nums"
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

		<!-- Underlying document drill-downs. Each section lists the rows
			that contributed to the line — clicking a row navigates to
			the document's detail page. Keeps the report auditable
			without needing to leave the page first. -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<UCard>
				<template #header>
					<div class="app-chrome font-medium">
						Invoices ({{ filtered.invoices.length }})
					</div>
				</template>
				<div v-if="filtered.invoices.length === 0" class="py-6 text-center text-sm text-(--ui-text-muted)">
					<UIcon name="i-lucide-receipt" class="size-8 mx-auto mb-2 opacity-50" />
					<div>No invoices issued in this period.</div>
				</div>
				<table v-else class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium">
								Number
							</th>
							<th class="py-2 px-2 font-medium">
								Date
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right">
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
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
								{{ row.number }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
								{{ row.issue_date }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums">
								{{ formatLKR(row.subtotal_cents) }}
							</td>
						</tr>
					</tbody>
				</table>
			</UCard>

			<UCard>
				<template #header>
					<div class="app-chrome font-medium">
						Bills ({{ filtered.bills.length }})
					</div>
				</template>
				<div v-if="filtered.bills.length === 0" class="py-6 text-center text-sm text-(--ui-text-muted)">
					<UIcon name="i-lucide-file-input" class="size-8 mx-auto mb-2 opacity-50" />
					<div>No bills in this period.</div>
				</div>
				<table v-else class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium">
								Number
							</th>
							<th class="py-2 px-2 font-medium">
								Date
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right">
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
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
								{{ row.number }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
								{{ row.issue_date }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums">
								{{ formatLKR(row.subtotal_cents) }}
							</td>
						</tr>
					</tbody>
				</table>
			</UCard>

			<UCard>
				<template #header>
					<div class="app-chrome font-medium">
						Payslips ({{ filtered.payslips.length }})
					</div>
				</template>
				<div v-if="filtered.payslips.length === 0" class="py-6 text-center text-sm text-(--ui-text-muted)">
					<UIcon name="i-lucide-file-spreadsheet" class="size-8 mx-auto mb-2 opacity-50" />
					<div>No payslips in this period.</div>
				</div>
				<table v-else class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium">
								Number
							</th>
							<th class="py-2 px-2 font-medium">
								Period end
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right">
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
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
								{{ row.number }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
								{{ row.period_end }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums">
								{{ formatLKR(row.earnings_cents) }}
							</td>
						</tr>
					</tbody>
				</table>
			</UCard>
		</div>
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

	import { formatLKR } from "~/lib/money";
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

	// Eagerly load everything the report aggregates over. If the user
	// deep-linked here, the stores might be empty.
	await Promise.all([
		settingsStore.ensureLoaded(),
		invoicesStore.load(),
		billsStore.load(),
		payslipsStore.load()
	]);

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
</script>
