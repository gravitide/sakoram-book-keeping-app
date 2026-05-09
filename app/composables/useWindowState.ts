// Reactive maximized-state for the Tauri main window.
//
// We removed native window decorations (see tauri.conf.json) and draw
// our own min/max/close buttons. The maximize button needs to flip
// between "maximize" and "restore" icons, and the layout drops its
// outer margin when maximized so the floating sidebar doesn't leave
// a visible gap against the screen edge.

import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowState() {
	const isMaximized = ref(false);
	let unlisten: (() => void) | null = null;

	const sync = async () => {
		try {
			isMaximized.value = await getCurrentWindow().isMaximized();
		} catch { /* not in Tauri context (dev SSR-prepare) */ }
	};

	onMounted(async () => {
		await sync();
		try {
			unlisten = await getCurrentWindow().onResized(() => {
				void sync();
			});
		} catch { /* idem */ }
	});

	onBeforeUnmount(() => {
		unlisten?.();
		unlisten = null;
	});

	return { isMaximized };
}
