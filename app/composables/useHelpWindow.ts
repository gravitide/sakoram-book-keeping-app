// Help window — spawns the help library as a separate Tauri
// WebviewWindow so the user can park it on a second monitor while
// they work in the main app.
//
// Each spawn gets a unique label (`help-${counter}`) so multiple
// help windows can coexist — useful for cross-referencing two
// topics side-by-side. The capability in src-tauri/capabilities/
// main.json grants `core:webview:allow-create-webview-window` to
// the main window and applies the rest of the main capabilities
// to any window labelled `help-*` (wildcard match).
//
// Falls back to a same-window navigation when the Tauri runtime
// isn't available (e.g. `bun run dev` without `tauri:dev`) so the
// feature doesn't break dev iteration.

import { useRouter } from "vue-router";
import { useUserPlatform } from "~/composables/useUserPlatform";
import { HELP_TOPICS_BY_SLUG } from "~/help";

// Module-level counter — incremented per spawn so each window gets
// a unique label even within a single session. Reset only when the
// main window unloads.
let nextHelpWindowIndex = 0;

interface OpenHelpWindowOptions {
	/// Optional topic slug to open. Falls back to /help index when omitted.
	slug?: string
}

export const useHelpWindow = () => {
	const router = useRouter();
	const { platform } = useUserPlatform();

	const isTauri = computed(() => platform !== "unknown");

	const openHelpWindow = async (options: OpenHelpWindowOptions = {}): Promise<void> => {
		const { slug } = options;
		const url = slug ? `/help/${slug}` : "/help";

		// Outside Tauri (dev mode without the shell): just navigate
		// in-place. Won't be a separate window but the user still
		// gets to the content.
		if (!isTauri.value) {
			await router.push(url);
			return;
		}

		// Dynamic import so the @tauri-apps/api bundle doesn't get
		// pulled into the initial route chunk. The help feature is
		// secondary; pay for it only when the user actually uses it.
		const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

		const label = `help-${++nextHelpWindowIndex}`;
		const title = slug && HELP_TOPICS_BY_SLUG[slug]
			? `Help — ${HELP_TOPICS_BY_SLUG[slug].title}`
			: "Sakoram — Help";

		const win = new WebviewWindow(label, {
			url,
			title,
			// Picks reasonable defaults for a docs reader on a typical
			// 1920×1080 desktop. The user can resize / maximize at will.
			// Center-positioning means subsequent windows stack on top
			// of each other; an OS like macOS handles cascading offsets
			// automatically, on Windows they overlap (acceptable for
			// v1 — the user just drags them apart).
			width: 1000,
			height: 760,
			center: true,
			focus: true,
			// Visible by default; same chrome as the main window so the
			// custom titlebar / sidebar / tenant switcher all paint
			// normally. The trade-off: the help window shows full app
			// chrome, not a minimal docs-reader layout. A follow-up
			// can introduce a dedicated layout for help-* windows that
			// strips the sidebar for a cleaner reading surface.
			decorations: false,
			resizable: true,
			minimizable: true,
			maximizable: true
		});

		// The window-creation Promise resolves with the WebviewWindow
		// handle synchronously. Errors land on the 'tauri://error'
		// event — listen once and surface any failure as a console
		// warning so dev can spot it but the modal still closes cleanly.
		win.once("tauri://error", (err) => {
			console.warn("[useHelpWindow] failed to create help window:", err);
		});
	};

	return {
		openHelpWindow,
		isTauri
	};
};
