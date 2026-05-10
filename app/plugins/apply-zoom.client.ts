// Apply the user's UI zoom level by overriding the root <html>
// font-size. Tailwind v4 + NuxtUI 4 are almost entirely rem-based,
// so bumping the root unit scales fonts, paddings, icons, gaps,
// modals, and teleported overlays in one shot — without the
// subpixel artifacts of CSS `zoom` or the layout breakage of
// `transform: scale()`.
//
// Lives at the plugin layer (not in default.vue) so it applies on
// every layout — welcome screen included — and survives layout
// transitions instead of being torn down with the watcher when the
// component unmounts.
//
// The custom titlebar (TitleBar.vue) and the floating sidebar use
// pixel-pinned arbitrary values so they sit out of the rem cascade
// and stay at their reference size regardless of zoom.

export default defineNuxtPlugin(() => {
	const { zoomLevel } = useUiState();

	watch(zoomLevel, (level) => {
		if (typeof document === "undefined") return;
		document.documentElement.style.fontSize = `${(level / 100) * 16}px`;
	}, { immediate: true });
});
