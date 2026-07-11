// Dashboard range state: which preset chip is active, persisted per
// business so the lens survives an app restart (useful while spending
// weeks back-filling a past year). The pure resolution math lives in
// app/lib/dashboard-range.ts; this composable only owns the selection
// + localStorage round-trip.

import type { DashboardRangePreset, ResolvedDashboardRange } from "~/lib/dashboard-range";
import { DASHBOARD_RANGE_PRESETS, resolveDashboardRange } from "~/lib/dashboard-range";
import { useSettingsStore } from "~/stores/settings";
import { useTenantsStore } from "~/stores/tenants";

const STORAGE_PREFIX = "sakoram.dashboard.range.";

// Local YYYY-MM-DD "today" (not UTC — toISOString would drift a day near
// midnight for +ve timezones).
const todayISO = (): string => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const isPreset = (v: string | null): v is DashboardRangePreset =>
	v !== null && DASHBOARD_RANGE_PRESETS.some((p) => p.id === v);

export function useDashboardRange() {
	const tenants = useTenantsStore();
	const settings = useSettingsStore();

	const storageKey = `${STORAGE_PREFIX}${tenants.activeTenantId ?? "default"}`;

	const stored = import.meta.client ? localStorage.getItem(storageKey) : null;
	const preset = ref<DashboardRangePreset>(isPreset(stored) ? stored : "last12");

	watch(preset, (p) => {
		if (import.meta.client) localStorage.setItem(storageKey, p);
	});

	// Re-resolved whenever the preset flips. The dashboard also re-reads
	// this on every activation (its KPI refresh), which bounds how stale
	// "This month" can get while the app stays open — same freshness
	// contract as the KPI tiles themselves.
	const range = computed<ResolvedDashboardRange>(() =>
		resolveDashboardRange(
			preset.value,
			todayISO(),
			settings.settings?.fiscal_year_start_month ?? 4
		)
	);

	return { preset, range, presets: DASHBOARD_RANGE_PRESETS };
}
