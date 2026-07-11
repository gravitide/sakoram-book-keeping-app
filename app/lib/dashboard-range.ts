// Dashboard date-range presets.
//
// The dashboard's flow widgets (net cash tile, monthly cash-flow chart,
// expenses by category, top clients) follow a user-picked period, chosen
// from a chip row of presets — same idea as the P&L page's preset chips.
// This module is the pure date math: preset id + today + fiscal-year
// start month → concrete ISO bounds. Resolution happens at read time so
// "This month" can never go stale while the app stays open across a
// month boundary.
//
// `null` bounds mean unbounded — "All time" is { from: null, to: null }.
// Comparisons downstream are plain lexicographic string compares (ISO
// dates sort correctly), matching the rest of the codebase.

export type DashboardRangePreset
	= | "last12"
		| "thisMonth"
		| "lastMonth"
		| "thisQuarter"
		| "thisYear"
		| "lastYear"
		| "fiscalYear"
		| "allTime";

export interface ResolvedDashboardRange {
	/** ISO YYYY-MM-DD inclusive lower bound; null = unbounded. */
	from: string | null
	/** ISO YYYY-MM-DD inclusive upper bound; null = unbounded. */
	to: string | null
	/** Short human label for tile titles / chart subtitles. */
	label: string
}

/// Ordered chip list — first entry is the default preset.
export const DASHBOARD_RANGE_PRESETS: ReadonlyArray<{ id: DashboardRangePreset, label: string }> = [
	{ id: "last12", label: "Last 12 months" },
	{ id: "thisMonth", label: "This month" },
	{ id: "lastMonth", label: "Last month" },
	{ id: "thisQuarter", label: "This quarter" },
	{ id: "thisYear", label: "This year" },
	{ id: "lastYear", label: "Last year" },
	{ id: "fiscalYear", label: "Fiscal year" },
	{ id: "allTime", label: "All time" }
];

const iso = (y: number, m: number, d: number): string =>
	`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/// Days in a (1-indexed) month — Date(y, m, 0) is the last day of month m.
const monthEnd = (y: number, m: number): number => new Date(y, m, 0).getDate();

export function resolveDashboardRange(
	preset: DashboardRangePreset,
	today: string,
	fiscalYearStartMonth: number
): ResolvedDashboardRange {
	const [y = 1970, m = 1, d = 1] = today.split("-").map(Number);
	const label = DASHBOARD_RANGE_PRESETS.find((p) => p.id === preset)?.label ?? preset;

	switch (preset) {
		case "last12": {
			// 12 monthly buckets ending in the current month — the chart's
			// historical default window, so the default chip changes nothing.
			const start = new Date(y, m - 1 - 11, 1);
			return { from: iso(start.getFullYear(), start.getMonth() + 1, 1), to: iso(y, m, d), label };
		}
		case "thisMonth":
			return { from: iso(y, m, 1), to: iso(y, m, monthEnd(y, m)), label };
		case "lastMonth": {
			const prev = new Date(y, m - 2, 1);
			const py = prev.getFullYear();
			const pm = prev.getMonth() + 1;
			return { from: iso(py, pm, 1), to: iso(py, pm, monthEnd(py, pm)), label };
		}
		case "thisQuarter": {
			const qStart = Math.floor((m - 1) / 3) * 3 + 1;
			const qEndMonth = qStart + 2;
			return { from: iso(y, qStart, 1), to: iso(y, qEndMonth, monthEnd(y, qEndMonth)), label };
		}
		case "thisYear":
			return { from: iso(y, 1, 1), to: iso(y, 12, 31), label };
		case "lastYear":
			return { from: iso(y - 1, 1, 1), to: iso(y - 1, 12, 31), label };
		case "fiscalYear": {
			// The FY containing today: starts fiscalYearStartMonth of this
			// year if we've reached it, else of last year; ends the day
			// before the next FY start.
			const fyStartYear = m >= fiscalYearStartMonth ? y : y - 1;
			if (fiscalYearStartMonth === 1) {
				return { from: iso(fyStartYear, 1, 1), to: iso(fyStartYear, 12, 31), label };
			}
			const endMonth = fiscalYearStartMonth - 1;
			const endYear = fyStartYear + 1;
			return {
				from: iso(fyStartYear, fiscalYearStartMonth, 1),
				to: iso(endYear, endMonth, monthEnd(endYear, endMonth)),
				label
			};
		}
		case "allTime":
			return { from: null, to: null, label };
	}
}
