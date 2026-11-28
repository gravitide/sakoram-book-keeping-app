// Global guard: route every navigation based on tenant state.
//   - no active business        -> /welcome
//   - active but locked (vault) -> /unlock
//   - active and open           -> proceed
//
// The decision lives in app/lib/tenant-route.ts (pure + unit-tested); this
// middleware only wires the store state into it. On first navigation we also
// populate the tenants store (which auto-migrates a legacy single-DB).

import { useTerms } from "~/composables/useTerms";
import { designerWindowMayGo, isDesignerRoute, resolveTenantGuard } from "~/lib/tenant-route";
import { useTenantsStore } from "~/stores/tenants";

export default defineNuxtRouteMiddleware(async (to, from) => {
	// The page designer's window never leaves the designer (a help topic's
	// "See also" link would strand the unsaved draft behind another page).
	if (!designerWindowMayGo(from.path, to.path)) return abortNavigation();

	// First-run Terms gate — the OUTERMOST gate. Until the current Terms version
	// is accepted, only /terms may render, and we must NOT fall through to the
	// tenant guard below: on a fresh install (no active tenant) that guard
	// bounces every non-/welcome path to /welcome, which the Terms gate then
	// bounces back to /terms — an infinite redirect loop. Returning here keeps
	// the user on /terms until they accept.
	const { accepted } = useTerms();
	if (!accepted.value) {
		return to.path === "/terms" ? undefined : navigateTo("/terms");
	}
	// Accepted: keep the user out of the gate.
	if (to.path === "/terms") {
		return navigateTo("/welcome");
	}

	const tenants = useTenantsStore();
	if (!tenants.loaded) {
		try {
			await tenants.ensureLoaded();
		} catch {
			if (to.path !== "/welcome") return navigateTo("/welcome");
			return;
		}
	}

	const result = resolveTenantGuard(
		{
			activeId: tenants.activeTenantId,
			activeLocked: tenants.activeLocked,
			hasDbUrl: !!tenants.dbUrl
		},
		to.path
	);
	if (!result) return;
	// The page designer window never becomes a second welcome / unlock
	// screen: without an open business it just closes (the main window
	// shows where to go).
	if (isDesignerRoute(to.path)) {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().destroy().catch(() => { /* not in Tauri */ });
		return abortNavigation();
	}
	return navigateTo(result.redirect);
});
