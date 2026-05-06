// Keep the OS window title in sync with the active business.
//
// Tauri sets the initial title from `productName` in tauri.conf.json
// ("Sakoram Book Keeping"). Here we prepend the active tenant's name so
// the taskbar / Alt-Tab list shows which business is currently open —
// handy when the user has more than one business and runs multiple
// windows (or just glances at the taskbar).
//
// Runs only on the client (the `.client` suffix) because Tauri's window
// API is browser-only and the watcher needs the live tenants store.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTenantsStore } from "~/stores/tenants";

export default defineNuxtPlugin(() => {
	const tenants = useTenantsStore();
	const win = getCurrentWindow();

	watch(
		() => tenants.activeTenant?.name,
		(name) => {
			const title = name ? `${name} · Sakoram Book Keeping` : "Sakoram Book Keeping";
			win.setTitle(title).catch(() => { /* setTitle is best-effort */ });
		},
		{ immediate: true }
	);
});
