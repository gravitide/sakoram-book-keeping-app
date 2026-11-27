// The page designer is its own Tauri window (like Help — useHelpWindow.ts):
// one at a time, focused if it is already open. It runs its own Nuxt app at
// /designer (app/pages/designer.vue), edits the open business's page design
// and, on Save, tells the main window to reload its settings
// (app/plugins/page-design-sync.client.ts). Rust closes it whenever the
// business is switched, closed, locked or re-encrypted (src-tauri/src/designer.rs).
//
// Outside the Tauri shell (`bun run dev`) it falls back to an in-place route.

import { useRouter } from "vue-router";
import { useUserPlatform } from "~/composables/useUserPlatform";
import { useTenantsStore } from "~/stores/tenants";

/** Mirrors DESIGNER_LABEL in src-tauri/src/designer.rs (capabilities: "designer-*"). */
export const DESIGNER_WINDOW_LABEL = "designer-main";

export function usePageDesignerWindow() {
	const router = useRouter();
	const { platform } = useUserPlatform();
	const tenants = useTenantsStore();

	const open = async (): Promise<void> => {
		if (platform === "unknown") {
			await router.push("/designer");
			return;
		}
		const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
		const existing = await WebviewWindow.getByLabel(DESIGNER_WINDOW_LABEL);
		if (existing) {
			await existing.show().catch(() => {});
			await existing.unminimize().catch(() => {});
			await existing.setFocus().catch(() => {});
			return;
		}
		const name = tenants.activeTenant?.name;
		const win = new WebviewWindow(DESIGNER_WINDOW_LABEL, {
			url: "/designer",
			title: name ? `Page designer — ${name}` : "Page designer",
			width: 1400,
			height: 900,
			minWidth: 1100,
			minHeight: 700,
			center: true,
			focus: true,
			decorations: false,
			// Off so the page's own HTML5 drop zone receives dropped image files
			// (the main window does the same in tauri.conf.json).
			dragDropEnabled: false,
			resizable: true,
			minimizable: true,
			maximizable: true
		});
		win.once("tauri://error", (err) => {
			console.warn("[usePageDesignerWindow] failed to create the designer window:", err);
		});
	};

	return { open };
}
