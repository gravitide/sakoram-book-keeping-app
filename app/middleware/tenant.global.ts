// Global guard: every navigation must have an active tenant set, OR be
// going to /welcome. This is the single funnel that ensures every page
// can safely call getDb() without checking activeTenant first.
//
// On first navigation we populate the tenants store (which also auto-
// migrates a legacy single-DB on first run after upgrade).

import { useTenantsStore } from "~/stores/tenants";

export default defineNuxtRouteMiddleware(async (to) => {
	const tenants = useTenantsStore();
	if (!tenants.loaded) {
		try {
			await tenants.ensureLoaded();
		} catch {
			// Bubble up to /welcome so the user sees a recoverable state
			// rather than a route crash.
			if (to.path !== "/welcome") return navigateTo("/welcome");
			return;
		}
	}

	const hasActive = !!tenants.activeTenantId && !!tenants.dbUrl;
	const isWelcome = to.path === "/welcome";

	if (!hasActive && !isWelcome) {
		return navigateTo("/welcome");
	}
});
