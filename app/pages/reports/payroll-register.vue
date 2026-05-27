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
				Payroll register
				<HelpButton slug="payroll-register" />
				<UIcon
					v-if="isLoading"
					name="i-lucide-loader-circle"
					class="size-4 animate-spin text-(--ui-primary)"
				/>
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span v-if="isLoading">Loading…</span>
				<template v-else>
					<!-- Issued payslips whose pay period falls inside the
						selected range. Net is what employees take home;
						deductions are statutory withholdings the company
						still has to remit. -->
					Every issued payslip in the period, with gross earnings, deductions and net pay per employee. Filtered by pay period — cancelled and draft payslips excluded.
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
						style="grid-template-columns: 1fr auto auto auto"
					>
						<div class="h-3 w-40 rounded bg-(--ui-bg-muted)" />
						<div class="h-3 w-24 rounded bg-(--ui-bg-muted)" />
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

			<!-- Three KPI tiles: Gross earnings, Net pay, Payslips. -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Gross earnings
						</div>
						<UIcon name="i-lucide-wallet" class="size-4 text-(--ui-text-muted)" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
						:title="formatLKR(totals.earnings)"
					>
						{{ formatLKR(totals.earnings) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ totals.payslipCount }} payslip{{ totals.payslipCount === 1 ? "" : "s" }} · {{ totals.employeeCount }} employee{{ totals.employeeCount === 1 ? "" : "s" }}
					</div>
				</UCard>

				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							Net pay
						</div>
						<UIcon name="i-lucide-banknote" class="size-4 text-(--ui-success)" />
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums text-(--ui-success)"
						:title="formatLKR(totals.net)"
					>
						{{ formatLKR(totals.net) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						<template v-if="totals.earnings === 0">
							No payroll in this period
						</template>
						<template v-else>
							After {{ formatLKR(totals.deductions) }} deductions
						</template>
					</div>
				</UCard>

				<UCard class="h-full">
					<div class="flex items-start justify-between gap-2">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) leading-tight">
							{{ outstanding === 0 ? "Paid out" : "Outstanding" }}
						</div>
						<UIcon
							:name="outstanding === 0 ? 'i-lucide-check-circle-2' : 'i-lucide-alarm-clock'"
							class="size-4"
							:class="outstanding === 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
						/>
					</div>
					<div
						class="mt-2 text-2xl md:text-xl 2xl:text-2xl font-semibold tabular-nums"
						:class="outstanding === 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'"
						:title="formatLKR(outstanding === 0 ? totals.paid : outstanding)"
					>
						{{ formatLKR(outstanding === 0 ? totals.paid : outstanding) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						<template v-if="outstanding === 0">
							All payslips fully paid
						</template>
						<template v-else>
							{{ formatLKR(totals.paid) }} paid so far
						</template>
					</div>
				</UCard>
			</div>

			<!-- Per-employee breakdown. Sorted by gross earnings desc. -->
			<div class="mb-2 flex items-end justify-between gap-2 flex-wrap">
				<div>
					<div class="font-medium">
						By employee
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-0.5">
						Click a row to open that employee's payslip list pre-filtered. {{ rangeLabel }}.
					</div>
				</div>
				<div class="text-xs text-(--ui-text-muted)">
					{{ employeeRows.length }} employee{{ employeeRows.length === 1 ? "" : "s" }} on payroll
				</div>
			</div>

			<div
				v-if="employeeRows.length === 0"
				class="py-10 text-center text-sm text-(--ui-text-muted) border border-dashed border-(--ui-border) rounded-lg mb-6"
			>
				<UIcon name="i-lucide-file-spreadsheet" class="size-10 mx-auto mb-2 opacity-40" />
				<div>No payslips issued in this period.</div>
			</div>

			<ResizableDataTable
				v-else
				:rows="employeeRows"
				class="mb-6"
				state-key="reports-payroll-register-by-employee"
				data-key="rowKey"
				default-sort-field="earnings"
				:default-sort-order="-1"
				:default-page-size="50"
				@row-click="(row) => openEmployee(row.employeeId)"
			>
				<Column field="name" header="Employee" sortable>
					<template #body="{ data }">
						<div class="min-w-[140px] max-w-[320px]">
							<div class="font-medium truncate">
								{{ data.name }}
							</div>
							<div class="text-xs text-(--ui-text-muted) truncate">
								{{ data.payslipCount }} payslip{{ data.payslipCount === 1 ? "" : "s" }}
							</div>
						</div>
					</template>
				</Column>
				<Column field="earnings" header="Gross" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div class="text-right tabular-nums whitespace-nowrap">
							{{ formatLKR(data.earnings) }}
						</div>
					</template>
				</Column>
				<Column field="deductions" header="Deductions" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div class="text-right tabular-nums whitespace-nowrap" :class="data.deductions === 0 ? 'text-(--ui-text-muted)' : 'text-(--ui-error)'">
							{{ data.deductions === 0 ? "—" : `− ${formatLKR(data.deductions)}` }}
						</div>
					</template>
				</Column>
				<Column field="net" header="Net" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div class="text-right tabular-nums whitespace-nowrap font-semibold text-(--ui-success)">
							{{ formatLKR(data.net) }}
						</div>
					</template>
				</Column>
				<Column field="paid" header="Paid" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div class="text-right tabular-nums whitespace-nowrap" :class="paidClass(data.net, data.paid)">
							{{ formatLKR(data.paid) }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>

			<!-- Drill-down: every payslip in the period. Default sort is
				employee asc then period desc — when the page is filtered
				to a single month, the natural read is "everyone, one row
				each". Columns: Number / Employee / Period / Gross /
				Deductions / Net / Paid. -->
			<UCard>
				<template #header>
					<div class="app-chrome flex items-center justify-between gap-3 flex-wrap">
						<div class="app-chrome font-medium">
							Payslips
						</div>
						<div class="text-xs text-(--ui-text-muted) tabular-nums">
							{{ filteredPayslips.length }} · Net <span class="text-(--ui-text) font-medium ml-1">{{ formatLKR(totals.net) }}</span>
						</div>
					</div>
				</template>

				<div
					v-if="filteredPayslips.length === 0"
					class="py-10 text-center text-sm text-(--ui-text-muted)"
				>
					<UIcon name="i-lucide-file-spreadsheet" class="size-10 mx-auto mb-2 opacity-40" />
					<div>No payslips in this period.</div>
				</div>

				<ResizableDataTable
					v-else
					:rows="payslipRows"
					state-key="reports-payroll-register-payslips"
					default-sort-field="_employee"
					:default-sort-order="1"
					:default-page-size="50"
					@row-click="(row) => router.push(`/payslips/${row.id}`)"
				>
					<Column field="number" header="Number" sortable>
						<template #body="{ data }">
							<div class="font-medium tabular-nums whitespace-nowrap">
								{{ data.number }}
							</div>
						</template>
					</Column>
					<Column field="_employee" header="Employee" sortable>
						<template #body="{ data }">
							<div class="truncate min-w-[140px] max-w-[260px]">
								{{ data.employee_name || "—" }}
							</div>
						</template>
					</Column>
					<Column field="period_end" header="Period end" sortable>
						<template #body="{ data }">
							<div class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">
								{{ data.period_end }}
							</div>
						</template>
					</Column>
					<Column field="earnings_cents" header="Gross" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap">
								{{ formatLKR(data.earnings_cents) }}
							</div>
						</template>
					</Column>
					<Column field="deductions_cents" header="Deductions" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap" :class="data.deductions_cents === 0 ? 'text-(--ui-text-muted)' : 'text-(--ui-error)'">
								{{ data.deductions_cents === 0 ? "—" : `− ${formatLKR(data.deductions_cents)}` }}
							</div>
						</template>
					</Column>
					<Column field="net_cents" header="Net" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap font-semibold text-(--ui-success)">
								{{ formatLKR(data.net_cents) }}
							</div>
						</template>
					</Column>
					<Column field="_paid" header="Paid" sortable :style="{ textAlign: 'right' }">
						<template #body="{ data }">
							<div class="text-right tabular-nums whitespace-nowrap" :class="paidClass(data.net_cents, data._paid)">
								{{ formatLKR(data._paid) }}
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
			title="Payroll register PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Payroll register report.
//
// Every issued payslip in a date range, in one table — the report
// you hand to the accountant or attach to the monthly statutory
// filings (EPF / ETF). Filters on `period_start` falling in
// [dateFrom, dateTo]; cancelled and draft payslips excluded. The
// per-employee breakdown sits above the per-payslip detail so the
// user can scan totals before drilling.
//
// "Paid" comes from the voucher ledger via the payslips store's
// paidCentsFor() — same definition every other surface uses, so the
// outstanding KPI can never disagree with the payroll dashboard or
// the payslip detail page.

	import type { PayslipRow } from "~/stores/payslips";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { formatLKR } from "~/lib/money";
	import { buildPayrollRegisterPdfPayload } from "~/lib/report-pdf";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Payroll register" });

	const router = useRouter();
	const payslipsStore = usePayslipsStore();
	const vouchersStore = useVouchersStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			settingsStore.ensureLoaded(),
			payslipsStore.ensureLoaded(),
			// Vouchers carry the "paid" derivation for each payslip — same
			// pattern aged-receivables uses for invoices. Without them
			// every payslip looks fully outstanding.
			vouchersStore.ensureLoaded()
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

	// Filter on period_start — "this month's payroll" should pick up
	// the payslip whose period started this month even if pay_date
	// slipped into the next month. Issued only; draft / cancelled out.
	function inRange(iso: string | null | undefined): boolean {
		if (!iso) return false;
		if (dateFrom.value && iso < dateFrom.value) return false;
		if (dateTo.value && iso > dateTo.value) return false;
		return true;
	}

	const filteredPayslips = computed<PayslipRow[]>(() =>
		payslipsStore.payslips
			.filter((row) => row.status === "issued" && inRange(row.period_start))
			.sort((a, b) => a.period_start.localeCompare(b.period_start))
	);

	// Synthetic _employee / _paid fields on each row so the
	// ResizableDataTable's by-field sort matches the rendered cell.
	// Same trick the other list pages use for snapshot-derived
	// columns (CLAUDE.md "Snapshot-derived columns").
	interface PayslipDetailRow extends PayslipRow {
		_employee: string
		_paid: number
	}
	const payslipRows = computed<PayslipDetailRow[]>(() =>
		filteredPayslips.value.map((p) => ({
			...p,
			_employee: p.employee_name || "",
			_paid: payslipsStore.paidCentsFor(p.id)
		}))
	);

	// Per-employee aggregation. Sum gross / deductions / net / paid
	// across every payslip for that employee in the range. Sorted by
	// gross desc so the highest-paid employees lead.
	interface EmployeeRegisterRow {
		rowKey: string
		employeeId: number | null
		name: string
		payslipCount: number
		earnings: number
		deductions: number
		net: number
		paid: number
	}
	const employeeRows = computed<EmployeeRegisterRow[]>(() => {
		const byEmployee = new Map<number, EmployeeRegisterRow>();
		for (const p of filteredPayslips.value) {
			const eid = p.employee_id;
			let row = byEmployee.get(eid);
			if (!row) {
				row = {
					rowKey: `employee:${eid}`,
					employeeId: eid,
					name: p.employee_name || "(no employee)",
					payslipCount: 0,
					earnings: 0,
					deductions: 0,
					net: 0,
					paid: 0
				};
				byEmployee.set(eid, row);
			}
			row.payslipCount++;
			row.earnings += p.earnings_cents;
			row.deductions += p.deductions_cents;
			row.net += p.net_cents;
			row.paid += payslipsStore.paidCentsFor(p.id);
		}
		return Array.from(byEmployee.values()).sort((a, b) => b.earnings - a.earnings);
	});

	const totals = computed(() => {
		let earnings = 0;
		let deductions = 0;
		let net = 0;
		let paid = 0;
		for (const r of employeeRows.value) {
			earnings += r.earnings;
			deductions += r.deductions;
			net += r.net;
			paid += r.paid;
		}
		return {
			earnings,
			deductions,
			net,
			paid,
			payslipCount: filteredPayslips.value.length,
			employeeCount: employeeRows.value.length
		};
	});

	const outstanding = computed(() => Math.max(0, totals.value.net - totals.value.paid));

	// Cell tone for the Paid column. Match net = fully paid (success);
	// less than net = error; zero with non-zero net = error.
	const paidClass = (net: number, paid: number): string => {
		if (net === 0 || paid >= net) return "text-(--ui-text-muted)";
		if (paid === 0) return "text-(--ui-error)";
		return "text-(--ui-warning)";
	};

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

	// Open /payslips pre-filtered to an employee. Mirrors the existing
	// employees-detail "View payslips" pattern.
	const openEmployee = (employeeId: number | null) => {
		if (employeeId === null) return;
		payslipsStore.search = "";
		payslipsStore.clearStatusFilters();
		payslipsStore.clearDateFilters();
		payslipsStore.employeeFilter = employeeId;
		void router.push("/payslips");
	};

	// ---- PDF export ------------------------------------------------------
	const pdf = usePdfPreview({
		command: "export_report_pdf",
		buildPayload: () => buildPayrollRegisterPdfPayload({
			settings: settingsStore.settings,
			currency: currency.value,
			dateFrom: dateFrom.value,
			dateTo: dateTo.value,
			totals: totals.value,
			employeeRows: employeeRows.value,
			payslips: filteredPayslips.value
		}),
		fileName: () => {
			const stamp = dateFrom.value && dateTo.value
				? `${dateFrom.value}_${dateTo.value}`
				: new Date().toISOString().slice(0, 10);
			return `payroll-register-${stamp}.pdf`;
		},
		title: "Payroll register PDF preview"
	});

	const onPdfClick = () => {
		if (isLoading.value || pdf.state.rendering) return;
		pdf.open();
	};
</script>
