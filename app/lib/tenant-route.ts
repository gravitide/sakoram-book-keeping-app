// Pure routing decision for the tenant access guard. Kept out of the Nuxt
// middleware so the branching (welcome / unlock / proceed) is unit-testable
// without a router or Tauri runtime. See app/middleware/tenant.global.ts.

export interface TenantGuardState {
	/** Active tenant id, or null if no business is selected. */
	activeId: string | null
	/** True when the active business is encrypted AND not currently unlocked. */
	activeLocked: boolean
	/** True when a working DB URL is open (unencrypted, or unlocked). */
	hasDbUrl: boolean
}

export type GuardResult = { redirect: string } | null;

/**
 * Decide where a navigation to `toPath` should go.
 * - no active business  -> /welcome (but allow /welcome itself)
 * - active but locked    -> /unlock  (allow /unlock and /welcome as escapes)
 * - active and open      -> proceed  (but bounce /unlock back to /)
 */
export function resolveTenantGuard(state: TenantGuardState, toPath: string): GuardResult {
	const onWelcome = toPath === "/welcome";
	const onUnlock = toPath === "/unlock";

	if (!state.activeId) {
		return onWelcome ? null : { redirect: "/welcome" };
	}

	if (state.activeLocked) {
		if (onUnlock || onWelcome) return null;
		return { redirect: "/unlock" };
	}

	// Active and not locked: we expect a db url. If it's missing, something is
	// off — send the user back to the picker rather than into a broken page.
	if (!state.hasDbUrl) {
		return onWelcome ? null : { redirect: "/welcome" };
	}

	// Already unlocked but sitting on /unlock — go home.
	if (onUnlock) return { redirect: "/" };

	return null;
}

/**
 * The page designer window's route (app/pages/designer.vue). When the guard
 * would redirect it — no business open, or the business locked — the window
 * closes instead of turning into a second welcome / unlock screen
 * (app/middleware/tenant.global.ts).
 */
export function isDesignerRoute(path: string): boolean {
	return /^\/designer\/?$/.test(path);
}

/**
 * Whether a navigation may happen: the designer window never leaves the
 * designer (a help topic's link would otherwise turn it into another page,
 * with the unsaved draft hidden behind it).
 */
export function designerWindowMayGo(fromPath: string, toPath: string): boolean {
	return !isDesignerRoute(fromPath) || isDesignerRoute(toPath);
}
