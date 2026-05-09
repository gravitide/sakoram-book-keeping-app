// Disable the webview's default right-click context menu so the app
// feels native instead of webby. Form fields keep their context menu
// so users still get cut / copy / paste / spellcheck on inputs,
// textareas, and contenteditable surfaces.
//
// Custom context menus on specific elements still work: register a
// `contextmenu` handler on the element itself — that handler runs
// before this document-level one in the bubble chain, so showing a
// custom menu and the global preventDefault here don't conflict.
//
// Dev-only escape hatch: pressing Shift while right-clicking lets the
// browser context menu through, so you can still get to "Inspect"
// during development without yanking the build flag.

export default defineNuxtPlugin(() => {
	if (typeof document === "undefined") return;

	document.addEventListener("contextmenu", (event) => {
		if (event.shiftKey) return;

		const target = event.target as HTMLElement | null;
		if (!target) return;

		if (target.closest("input, textarea, [contenteditable=''], [contenteditable='true']")) {
			return;
		}

		event.preventDefault();
	});
});
