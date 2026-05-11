// Payroll cycle resolver.
//
// The tenant configures three day-of-month integers in company settings:
// `payroll_period_start_day`, `payroll_period_end_day`, `payroll_pay_day`.
// Every consumer (the bulk page, the new-payslip page, the payroll
// dashboard's upcoming-cycle widget) needs to turn those plus a target
// "month" into three concrete ISO dates. This file is the single source
// of truth.
//
// Clamping rule: a stored day greater than `daysInMonth(month, year)`
// snaps to the last day of that month. So 31 naturally means "last day
// of whatever month this is" — February gets 28/29, April 30, etc. No
// magic sentinel value needed.
//
// Period-end semantics: if the configured end day is *smaller* than the
// start day, we treat the period as straddling month boundaries — start
// is in the previous month, end is in the target month. Example: a
// business running 26→25 cycles, asked to "run April 2026", produces
// 2026-03-26 → 2026-04-25 with pay date driven by the same target month.

export interface PayrollCycleConfig {
	payroll_period_start_day: number
	payroll_period_end_day: number
	payroll_pay_day: number
}

export interface ResolvedCycle {
	/** ISO YYYY-MM-DD */
	periodStart: string
	/** ISO YYYY-MM-DD */
	periodEnd: string
	/** ISO YYYY-MM-DD */
	payDate: string
}

const daysInMonth = (year: number, month1to12: number): number =>
	new Date(year, month1to12, 0).getDate(); // day 0 of next month = last day of this month

const isoFromYMD = (year: number, month1to12: number, day: number): string =>
	`${year}-${String(month1to12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const clampDay = (year: number, month1to12: number, configuredDay: number): number =>
	Math.min(Math.max(1, configuredDay), daysInMonth(year, month1to12));

const prevMonth = (year: number, month1to12: number): { year: number, month: number } =>
	month1to12 === 1 ? { year: year - 1, month: 12 } : { year, month: month1to12 - 1 };

const daysBetween = (aISO: string, bISO: string): number => {
	const a = new Date(`${aISO}T00:00:00`).getTime();
	const b = new Date(`${bISO}T00:00:00`).getTime();
	return Math.round((b - a) / 86_400_000);
};

/**
 * Resolve the payroll cycle for the given target year + month (1..12).
 *
 * The "target month" is the month the user is *running payroll for* —
 * the month that owns the pay-date and the period-end. If the cycle is
 * configured to straddle months (end < start), the period starts in
 * the previous month and ends in the target month.
 */
export const resolvePayrollCycle = (
	year: number,
	month1to12: number,
	cfg: PayrollCycleConfig
): ResolvedCycle => {
	const startCfg = cfg.payroll_period_start_day;
	const endCfg = cfg.payroll_period_end_day;
	const payCfg = cfg.payroll_pay_day;

	// Period end is in the target month.
	const endDay = clampDay(year, month1to12, endCfg);

	// Period start: same month if start <= end, else previous month.
	let startY = year;
	let startM = month1to12;
	if (startCfg > endCfg) {
		const p = prevMonth(year, month1to12);
		startY = p.year;
		startM = p.month;
	}
	const startDay = clampDay(startY, startM, startCfg);

	// Pay date sits in the target month. If a business wants pay date
	// in the *next* month they'll either bump pay_day to 31 of this
	// month or override on the form — out of scope for the auto-derive.
	const payDay = clampDay(year, month1to12, payCfg);

	return {
		periodStart: isoFromYMD(startY, startM, startDay),
		periodEnd: isoFromYMD(year, month1to12, endDay),
		payDate: isoFromYMD(year, month1to12, payDay)
	};
};

/**
 * The "next" target month relative to today: if today is on or before
 * this month's pay date, the next cycle IS this month. Once the pay
 * date has passed, the next cycle is next month. This is what the
 * dashboard's upcoming-cycle widget cares about.
 */
export const nextPayrollCycle = (
	todayISO: string,
	cfg: PayrollCycleConfig
): { year: number, month: number, cycle: ResolvedCycle, daysUntilPay: number } => {
	const [yStr, mStr, dStr] = todayISO.split("-");
	const today = { y: Number(yStr), m: Number(mStr), d: Number(dStr) };
	const thisMonth = resolvePayrollCycle(today.y, today.m, cfg);

	// String comparison works for ISO YYYY-MM-DD.
	if (todayISO <= thisMonth.payDate) {
		return {
			year: today.y,
			month: today.m,
			cycle: thisMonth,
			daysUntilPay: daysBetween(todayISO, thisMonth.payDate)
		};
	}
	const next = today.m === 12 ? { y: today.y + 1, m: 1 } : { y: today.y, m: today.m + 1 };
	const nextCycle = resolvePayrollCycle(next.y, next.m, cfg);
	return {
		year: next.y,
		month: next.m,
		cycle: nextCycle,
		daysUntilPay: daysBetween(todayISO, nextCycle.payDate)
	};
};

/**
 * Convenience: format a target year+month as "May 2026" for UI.
 */
export const formatMonthLabel = (year: number, month1to12: number): string => {
	const fmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
	return fmt.format(new Date(year, month1to12 - 1, 1));
};
