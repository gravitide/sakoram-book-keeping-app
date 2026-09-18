// Pure date stepping for recurring invoice / bill templates. Lifted out of
// app/stores/recurring_invoices.ts so it's unit-testable (stores drag in
// ~/lib/db) and shared by both recurring stores + their detail pages.

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (y: number, m1: number, d: number): string => `${y}-${pad(m1)}-${pad(d)}`;
const lastDayOf = (y: number, m1: number): number => new Date(y, m1, 0).getDate();

/// Day-of-month of an ISO date — the "intended day" of a schedule, read from
/// the template's start_date. Undefined for anything that isn't YYYY-MM-DD.
export const anchorDayOf = (isoDate: string): number | undefined => {
	const d = Number(isoDate.split("-")[2]);
	return Number.isInteger(d) && d >= 1 && d <= 31 ? d : undefined;
};

/// Advance an ISO date by ONE step of `frequency`. Month-end overflow clamps
/// to the last day of the target month (Jan 31 + 1 month → Feb 28/29).
///
/// `anchorDay` is the schedule's intended day of month. Without it each step
/// only knows the PREVIOUS date, so one short month permanently decays the
/// schedule: Jan 31 → Feb 28 → Mar 28 → Apr 28 … "Rent on the 31st" silently
/// became "the 28th" forever, and a yearly Feb 29 never came back.
///
/// The anchor is applied ONLY when the current day looks like a clamp artefact
/// — it is below the anchor AND is the last day of its month. That restores
/// 28 Feb → 31 Mar, while a day the user deliberately typed into
/// next_issue_date (the 15th, say) is left alone rather than yanked back.
export const advanceDate = (isoDate: string, frequency: RecurringFrequency, anchorDay?: number): string => {
	const [y, m, d] = isoDate.split("-").map(Number);
	if (!y || !m || !d) return isoDate;

	if (frequency === "weekly") {
		const dt = new Date(y, m - 1, d);
		dt.setDate(dt.getDate() + 7);
		return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
	}

	const stepMonths = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
	const zeroBased = (m - 1) + stepMonths;
	const ty = y + Math.floor(zeroBased / 12);
	const tm = (zeroBased % 12) + 1;

	const wasClamped = anchorDay !== undefined && d < anchorDay && d === lastDayOf(y, m);
	const intendedDay = wasClamped ? anchorDay : d;
	return iso(ty, tm, Math.min(intendedDay, lastDayOf(ty, tm)));
};
