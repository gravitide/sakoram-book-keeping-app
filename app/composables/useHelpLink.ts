// Help-link helper — every in-help-to-in-help navigation needs to
// preserve the `?popout=1` query when present, otherwise clicking
// any link inside a popout window navigates to the route without
// the query and the layout switches back to the default (full app
// chrome) mid-window.
//
// Used by:
//   - HelpSidebar (every topic link)
//   - HelpTopicView (See-also tiles)
//   - /help index (hero card + topic cards)
//   - /help/[slug] (back link to /help)
//
// External / app-route links (e.g. /invoices) deliberately don't
// go through this — they're cross-section navigation, and the
// popout window will navigate to whatever URL they point at. That's
// the documented v1 trade-off.

import type { RouteLocationRaw } from "vue-router";

export const useHelpLink = () => {
	const route = useRoute();

	const isPopoutMode = computed(() => route.query.popout === "1");

	/**
	 * Construct an in-help nav target preserving the popout query.
	 *
	 * - linkTo()          → /help index
	 * - linkTo("invoices") → /help/invoices
	 *
	 * In popout mode both forms carry `?popout=1` so the
	 * help-window layout stays applied across navigation.
	 */
	const linkTo = (slug?: string): RouteLocationRaw => ({
		path: slug ? `/help/${slug}` : "/help",
		query: isPopoutMode.value ? { popout: "1" } : {}
	});

	return { linkTo, isPopoutMode };
};
