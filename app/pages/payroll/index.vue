<template>
	<div>
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Payroll
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					Cycle health, recent runs, and what's coming up next.
				</p>
			</div>
			<div class="text-xs text-(--ui-text-muted) tabular-nums">
				{{ todayLabel }}
			</div>
		</header>

		<!-- Upcoming cycle hero. The most important thing on the page: it
			tells the user when they should next be processing payroll
			and gives them a one-click jump into the bulk page. -->
		<UCard class="mb-6">
			<template #header>
				<div class="flex items-center justify-between gap-3">
					<div class="flex items-center gap-2">
						<UIcon name="i-lucide-calendar-clock" class="size-4 text-(--ui-primary)" />
						<span class="font-medium">Upcoming pay cycle</span>
					</div>
					<UBadge
						:color="urgency.color"
						variant="subtle"
						size="sm"
					>
						{{ urgency.label }}
					</UBadge>
				</div>
			</template>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div>
					<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
						Next pay date
					</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">
						{{ next.cycle.payDate }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ formatMonthLabel(next.year, next.month) }}
					</div>
				</div>
				<div>
					<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
						Period
					</div>
					<div class="mt-1 text-sm tabular-nums">
						{{ next.cycle.periodStart }}
					</div>
					<div class="text-xs text-(--ui-text-muted)">
						to {{ next.cycle.periodEnd }}
					</div>
				</div>
				<div>
					<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
						Est. total payout
					</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">
						{{ formatLKR(estimatedTotal) }}
					</div>
					<div class="mt-1 text-xs text-(--ui-text-muted)">
						{{ activeEmployeeCount }} active employee{{ activeEmployeeCount === 1 ? "" : "s" }}
					</div>
				</div>
			</div>

			<template #footer>
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<div class="text-xs text-(--ui-text-muted) tabular-nums">
						<span class="font-medium text-(--ui-text)">{{ cycleCreatedCount }} / {{ activeEmployeeCount }}</span> payslips created
						<span v-if="cycleCreatedCount > 0">
							· <span class="text-(--ui-success)">{{ cyclePaidCount }} paid</span>
							<span v-if="cyclePartialCount > 0"> · <span class="text-(--ui-warning)">{{ cyclePartialCount }} partial</span></span>
							<span v-if="cycleUnpaidCount > 0"> · <span>{{ cycleUnpaidCount }} unpaid</span></span>
						</span>
					</div>
					<div class="flex gap-2">
						<NuxtLink to="/settings/payroll">
							<UButton size="sm" color="neutral" variant="outline" icon="i-lucide-calendar-clock">
								Cycle settings
							</UButton>
						</NuxtLink>
						<NuxtLink to="/payslips/bulk">
							<UButton size="sm" icon="i-lucide-play">
								{{ cycleCreatedCount === 0 ? "Run payroll" : "Continue run" }}
							</UButton>
						</NuxtLink>
					</div>
				</div>
			</template>
		</UCard>

		<!-- Headcount KPI strip. Tiny by design — the chart and recent
			runs below are the substance of the page. -->
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
			<UCard>
				<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
					Active employees
				</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">
					{{ activeEmployeeCount }}
				</div>
				<div class="mt-1 text-xs text-(--ui-text-muted)">
					{{ archivedEmployeeCount }} archived
				</div>
			</UCard>
			<UCard>
				<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
					Outstanding payroll
				</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">
					{{ formatLKR(outstandingPayroll) }}
				</div>
				<div class="mt-1 text-xs text-(--ui-text-muted)">
					{{ outstandingPayslips.length }} payslip{{ outstandingPayslips.length === 1 ? "" : "s" }} need attention
				</div>
			</UCard>
			<UCard>
				<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
					Paid this year
				</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">
					{{ formatLKR(paidThisYear) }}
				</div>
				<div class="mt-1 text-xs text-(--ui-text-muted)">
					Across {{ paidThisYearCount }} payment{{ paidThisYearCount === 1 ? "" : "s" }}
				</div>
			</UCard>
		</div>

		<!-- 12-month chart of salaries paid -->
		<UCard class="mb-6">
			<template #header>
				<div class="font-medium">
					Month-on-month salaries paid
				</div>
				<div class="text-xs text-(--ui-text-muted) mt-1">
					Sum of payment vouchers attributed to a payslip, by voucher date.
				</div>
			</template>
			<MonthlySalaryPaidChart :vouchers="vouchersStore.vouchers" />
		</UCard>

		<!-- Recent runs + outstanding side-by-side on wide screens; stack
			on narrow. Both link into the payslips list with a filter. -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between gap-2">
						<div class="font-medium">
							Recent runs
						</div>
						<NuxtLink to="/payslips" class="text-xs text-(--ui-text-muted) hover:text-(--ui-text)">
							View all
						</NuxtLink>
					</div>
				</template>
				<div v-if="recentRuns.length === 0" class="py-8 text-center text-sm text-(--ui-text-muted)">
					No payroll runs yet.
				</div>
				<ul v-else class="divide-y divide-(--ui-border)">
					<li
						v-for="r in recentRuns"
						:key="r.month"
						class="py-2.5 flex items-center justify-between gap-3"
					>
						<div class="min-w-0">
							<div class="font-medium truncate">
								{{ r.label }}
							</div>
							<div class="text-xs text-(--ui-text-muted)">
								{{ r.employeeCount }} employee{{ r.employeeCount === 1 ? "" : "s" }} · {{ r.paidCount }} of {{ r.employeeCount }} paid
							</div>
						</div>
						<div class="text-right tabular-nums shrink-0">
							<div class="font-medium">
								{{ formatLKR(r.netTotal) }}
							</div>
							<UBadge
								:color="r.paidCount === r.employeeCount ? 'success' : 'warning'"
								variant="subtle"
								size="sm"
							>
								{{ r.paidCount === r.employeeCount ? "✓ Complete" : `${r.employeeCount - r.paidCount} pending` }}
							</UBadge>
						</div>
					</li>
				</ul>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Outstanding
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Issued payslips that aren't fully paid yet.
					</div>
				</template>
				<div v-if="outstandingPayslips.length === 0" class="py-8 text-center text-sm text-(--ui-text-muted)">
					<UIcon name="i-lucide-check-circle-2" class="size-8 mx-auto mb-2 text-(--ui-success) opacity-70" />
					Everything's settled.
				</div>
				<ul v-else class="divide-y divide-(--ui-border)">
					<NuxtLink
						v-for="p in outstandingPayslips.slice(0, 6)"
						:key="p.id"
						:to="`/payslips/${p.id}`"
						class="py-2.5 flex items-center justify-between gap-3 hover:bg-(--ui-bg-muted) rounded-md px-2 -mx-2"
					>
						<div class="min-w-0">
							<div class="font-medium truncate">
								{{ p.number }} · {{ employeeNameFor(p) }}
							</div>
							<div class="text-xs text-(--ui-text-muted) tabular-nums">
								{{ p.period_start }} → {{ p.period_end }}
							</div>
						</div>
						<div class="text-right tabular-nums shrink-0">
							<div class="font-medium">
								{{ formatLKR(payslipsStore.balanceCentsFor(p)) }}
							</div>
							<StatusBadge :status="payslipsStore.derivedStatus(p)" />
						</div>
					</NuxtLink>
				</ul>
			</UCard>
		</div>
	</div>
</template>

<script setup lang="ts">
// Payroll dashboard — Phase B of the payroll automation push.
//
// Reads from existing stores (payslips, vouchers, employees, settings)
// and the payroll-cycle helpers. No new DB queries; the page is a thin
// projection over what's already loaded.

	import type { EmployeeSnapshot, PayslipRow } from "~/stores/payslips";
	import { formatLKR } from "~/lib/money";
	import { formatMonthLabel, nextPayrollCycle } from "~/lib/payroll-cycle";
	import { useEmployeesStore } from "~/stores/employees";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Payroll" });

	const settingsStore = useSettingsStore();
	const employeesStore = useEmployeesStore();
	const payslipsStore = usePayslipsStore();
	const vouchersStore = useVouchersStore();

	await Promise.all([
		settingsStore.ensureLoaded(),
		employeesStore.employees.length === 0 ? employeesStore.load() : Promise.resolve(),
		payslipsStore.payslips.length === 0 ? payslipsStore.load() : Promise.resolve(),
		vouchersStore.vouchers.length === 0 ? vouchersStore.load() : Promise.resolve()
	]);

	const todayISO = (() => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	})();
	const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

	const cycleConfig = computed(() => ({
		payroll_period_start_day: settingsStore.settings?.payroll_period_start_day ?? 1,
		payroll_period_end_day: settingsStore.settings?.payroll_period_end_day ?? 31,
		payroll_pay_day: settingsStore.settings?.payroll_pay_day ?? 31
	}));

	const next = computed(() => nextPayrollCycle(todayISO, cycleConfig.value));

	// Urgency band on the hero badge. The thresholds match what someone
	// running monthly payroll feels: > 7 days = comfortable, 1–7 = start
	// pulling things together, < 0 = you should have already paid.
	const urgency = computed<{ color: "success" | "warning" | "error", label: string }>(() => {
		const d = next.value.daysUntilPay;
		if (d < 0) return { color: "error", label: `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue` };
		if (d === 0) return { color: "warning", label: "Today" };
		if (d <= 7) return { color: "warning", label: `In ${d} day${d === 1 ? "" : "s"}` };
		return { color: "success", label: `In ${d} days` };
	});

	const activeEmployeeCount = computed(() => employeesStore.activeCount);
	const archivedEmployeeCount = computed(() => employeesStore.archivedCount);

	// Estimate the upcoming payout: sum of basic salaries for currently-
	// active employees. Doesn't account for allowances/deductions because
	// those are entered per-payslip — surfacing them would need the user
	// to have already created the drafts, defeating the "what's coming"
	// purpose of this number.
	const estimatedTotal = computed(() =>
		employeesStore.employees
			.filter((e) => e.is_archived === 0)
			.reduce((s, e) => s + e.basic_salary_cents, 0)
	);

	// Payslips that belong to the upcoming cycle, identified by period
	// start equalling the resolved start date. We use ===, not date math,
	// so the user only sees what they actually created against this
	// cycle (a one-off payslip with a different start date won't pollute
	// the count).
	const cyclePayslips = computed<PayslipRow[]>(() =>
		payslipsStore.payslips.filter((p) => p.period_start === next.value.cycle.periodStart)
	);
	const cycleCreatedCount = computed(() => cyclePayslips.value.length);
	const cyclePaidCount = computed(() =>
		cyclePayslips.value.filter((p) => payslipsStore.derivedStatus(p) === "paid").length
	);
	const cyclePartialCount = computed(() =>
		cyclePayslips.value.filter((p) => payslipsStore.derivedStatus(p) === "partial").length
	);
	const cycleUnpaidCount = computed(() =>
		cyclePayslips.value.filter((p) => {
			const s = payslipsStore.derivedStatus(p);
			return s === "unpaid" || s === "overdue";
		}).length
	);

	// Outstanding = issued and not fully paid, regardless of cycle.
	const outstandingPayslips = computed<PayslipRow[]>(() => {
		const items = payslipsStore.payslips.filter((p) => {
			const s = payslipsStore.derivedStatus(p);
			return s === "unpaid" || s === "partial" || s === "overdue";
		});
		// Most-recent-first
		items.sort((a, b) => b.period_start.localeCompare(a.period_start));
		return items;
	});

	const outstandingPayroll = computed(() =>
		outstandingPayslips.value.reduce((s, p) => s + payslipsStore.balanceCentsFor(p), 0)
	);

	// "Paid this year" — the salary-payment portion of the voucher
	// ledger, scoped to the current calendar year (Jan 1 → today). Use
	// the same predicate as the chart so the numbers reconcile.
	const yearStart = `${new Date().getFullYear()}-01-01`;
	const yearPayrollVouchers = computed(() =>
		vouchersStore.vouchers.filter((v) =>
			v.voucher_type === "payment"
			&& v.related_payslip_id !== null
			&& v.voucher_date >= yearStart
		)
	);
	const paidThisYear = computed(() =>
		yearPayrollVouchers.value.reduce((s, v) => s + v.amount_cents, 0)
	);
	const paidThisYearCount = computed(() => yearPayrollVouchers.value.length);

	// Recent runs — group payslips by their period-start month and
	// aggregate. Last 6 months that have data. The "label" is the
	// human-readable month of the period start (so 26→25 cycles read
	// naturally: a run with period_start 2026-03-26 shows as March 2026).
	interface RunSummary {
		month: string // YYYY-MM
		label: string
		employeeCount: number
		netTotal: number
		paidCount: number
	}
	const recentRuns = computed<RunSummary[]>(() => {
		const buckets = new Map<string, { employees: number, net: number, paid: number }>();
		for (const p of payslipsStore.payslips) {
			if (p.status === "cancelled") continue;
			const key = p.period_start.slice(0, 7);
			const slot = buckets.get(key) ?? { employees: 0, net: 0, paid: 0 };
			slot.employees += 1;
			slot.net += p.net_cents;
			if (payslipsStore.derivedStatus(p) === "paid") slot.paid += 1;
			buckets.set(key, slot);
		}
		const list: RunSummary[] = [];
		for (const [month, slot] of buckets) {
			const [y, m] = month.split("-").map(Number) as [number, number];
			list.push({
				month,
				label: formatMonthLabel(y, m),
				employeeCount: slot.employees,
				netTotal: slot.net,
				paidCount: slot.paid
			});
		}
		list.sort((a, b) => b.month.localeCompare(a.month));
		return list.slice(0, 6);
	});

	// Helper for the outstanding list — read the snapshot rather than
	// joining `employees`. Same pattern the list page uses.
	const employeeNameFor = (p: PayslipRow): string => {
		try {
			return (JSON.parse(p.employee_snapshot) as EmployeeSnapshot).full_name ?? "(unknown)";
		} catch {
			return "(unknown)";
		}
	};
</script>
