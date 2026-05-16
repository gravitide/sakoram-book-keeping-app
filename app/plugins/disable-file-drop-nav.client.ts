// With `dragDropEnabled: false` on the window (tauri.conf.json), the
// webview handles file drag-and-drop natively — which is what makes the
// HTML5 @drop handlers on the logo upload zones actually fire (when
// Tauri's own drag-drop is enabled it swallows OS file drops and the
// webview never sees them).
//
// The catch: a browser navigates to a file dropped anywhere on the
// page. In a desktop app that means a stray miss replaces the whole UI
// with the raw file. This guard preventDefaults dragover/drop at the
// document level so a drop outside any real target just does nothing.
//
// Genuine drop zones register their own `drop` handler on the element;
// that runs first in the bubble chain and reads the file, so this
// document-level handler is a harmless no-op afterwards. The dragover
// preventDefault is also what marks the page as a valid drop target —
// without it the browser would navigate on drop before any drop event
// fired.

export default defineNuxtPlugin(() => {
	if (typeof document === "undefined") return;

	document.addEventListener("dragover", (event) => {
		event.preventDefault();
	});
	document.addEventListener("drop", (event) => {
		event.preventDefault();
	});
});
