// The "load once, share the in-flight promise" rule behind a store's
// `ensureLoaded()`. Most stores hand-roll it with a `pendingLoad` variable;
// settings + business_banks instead had
//
//     if (!loaded && !loading) await load();
//
// which looks equivalent and isn't: a SECOND caller arriving mid-load sees
// `loading === true`, skips the await, and returns immediately with the state
// still null. Callers that do a non-reactive read straight after —
// `settings?.fiscal_year_start_month ?? 1` when creating a payslip — then
// silently use the fallback.
//
// Pure (no Vue / Pinia), so the concurrency is unit-tested.

export const createLoadOnce = (
	load: () => Promise<void>,
	isLoaded: () => boolean
): (() => Promise<void>) => {
	let pending: Promise<void> | null = null;
	return async (): Promise<void> => {
		if (isLoaded()) return;
		if (!pending) {
			// Cleared on settle either way: a FAILED load must retry next
			// time rather than being cached as "done".
			pending = load().finally(() => {
				pending = null;
			});
		}
		await pending;
	};
};
