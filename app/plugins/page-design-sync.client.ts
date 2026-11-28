// The page designer saves in its own window (its own Pinia), then tells the
// main window with a `page-design:saved` event (app/pages/designer.vue). The
// main window reloads its settings so /settings/pdf, the PDF exports and the
// live previews pick up the new design without a restart.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettingsStore } from "~/stores/settings";

export default defineNuxtPlugin(() => {
	if (!("__TAURI_INTERNALS__" in window)) return;
	const win = getCurrentWindow();
	if (win.label !== "main") return;
	const settings = useSettingsStore();
	void win.listen("page-design:saved", () => {
		settings.load().catch((e) => console.warn("[page-design-sync] reload failed", e));
	});
});
