// Page-level loading state with a guaranteed paint frame around the
// async work.
//
// Why this exists: every list / calendar page does
//
//   const isLoading = ref(true);
//   onMounted(async () => {
//     try { await Promise.all([store.ensureLoaded(), ...]) }
//     finally { isLoading.value = false }
//   });
//
// …and the page's template gates a real card vs a skeleton card on
// `isLoading`. That looks like it should "just work" but on warm-store
// revisits (or any case where the awaits resolve synchronously), Vue
// commits the isLoading=true skeleton DOM and the isLoading=false
// real DOM within the same animation frame. The browser only paints
// the final state — so the user never sees the skeleton.
//
// `usePageLoading` wraps the load with `requestAnimationFrame` yields
// on both sides:
//
//   1. Before the load fires, yield so the initial skeleton commit
//      actually paints to pixels.
//   2. After the load resolves, yield again before flipping isLoading
//      off, so the skeleton stays visible while Vue prepares the
//      real-content render (which can itself take a few hundred ms on
//      large datasets — bucketing thousands of events, building
//      hundreds of table rows, etc).
//
// Usage:
//
//   const { isLoading, runLoad } = usePageLoading();
//   onMounted(() => runLoad(async () => {
//     await Promise.all([
//       invoicesStore.ensureLoaded(),
//       clientsStore.ensureLoaded()
//     ]);
//   }));
//
// In the template, gate a skeleton block on `isLoading` and the real
// content on `!isLoading` (or use `v-if` / `v-else`).

import { ref } from "vue";

/// Resolve one requestAnimationFrame from now — guarantees a paint
/// boundary between the current microtask chain and the next bit of
/// work. Falls back to a 0ms setTimeout for environments without rAF
/// (vitest jsdom, SSR — neither matters for the app runtime, but
/// keeps the composable safe to import anywhere).
const yieldFrame = (): Promise<void> =>
	new Promise((resolve) => {
		if (typeof requestAnimationFrame === "undefined") {
			setTimeout(resolve, 0);
			return;
		}
		requestAnimationFrame(() => resolve());
	});

export function usePageLoading() {
	const isLoading = ref(true);

	const runLoad = async (load: () => Promise<unknown>) => {
		// Yield once so the initial skeleton commit definitely paints
		// before we kick off async work or trigger Vue's heavier
		// reactive recompute on the data we're about to load.
		await yieldFrame();
		try {
			await load();
		} finally {
			// Second yield: skeleton stays visible while Vue prepares
			// the real-content render. Without this the skeleton would
			// flip off the instant the data lands, then the page would
			// be unresponsive for the duration of Vue's commit pass
			// (~hundreds of ms on big lists / calendars), with no
			// visual feedback.
			await yieldFrame();
			isLoading.value = false;
		}
	};

	return { isLoading, runLoad };
}
