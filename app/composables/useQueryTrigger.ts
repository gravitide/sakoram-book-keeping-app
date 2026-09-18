// One-shot `?new=1` style route triggers that survive <NuxtPage keepalive>.
//
// WHY: app.vue keeps every page alive, so a page's setup() / onMounted run
// ONCE per session. The list pages consumed `?new=1` (Dashboard "New ▸",
// Calendar "Create on this day", Employees "Create payslip") inside
// onMounted — so the shortcut worked the first time and silently did
// nothing afterwards, leaving `?new=1` stuck in the URL.
//
// `/invoices` and `/invoices?new=1` are the SAME cached instance (Nuxt keys
// pages on the path, not the query), and the page's `useRoute()` proxy goes
// live again whenever that path is active. So a WATCH on the query value
// fires on every arrival; onActivated is NOT used because the query isn't
// reliably settled when a kept-alive page activates (see the long note in
// app/pages/vouchers/new.vue, which hit exactly that).
//
// The first arrival is handled in onMounted rather than `immediate: true`
// so the `router.replace` that cleans the URL never runs during setup.

import type { LocationQuery } from "vue-router";
import { withoutQueryKeys } from "~/lib/route-query";

/// Run `onTrigger` every time the page is reached with `?<key>=1`, then strip
/// `key` + `consume` from the URL so back/forward doesn't re-fire and a later
/// manual click doesn't inherit stale params (e.g. a calendar date).
export function useQueryTrigger(
	onTrigger: (query: LocationQuery) => void,
	opts: { key?: string, consume?: string[] } = {}
): void {
	const key = opts.key ?? "new";
	const consume = [key, ...(opts.consume ?? [])];
	const route = useRoute();
	const router = useRouter();

	const fire = () => {
		if (route.query[key] !== "1") return;
		onTrigger(route.query);
		void router.replace({ query: withoutQueryKeys(route.query, consume) });
	};

	onMounted(fire);
	watch(() => route.query[key], fire);
}
