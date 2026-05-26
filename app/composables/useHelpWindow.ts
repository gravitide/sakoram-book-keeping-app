// Help window — the help library is a separate Tauri WebviewWindow.
// There is no in-app help reader any more; the sidebar "Help" link
// and the HelpModal's "Open in docs window" button both call the
// composable below, which:
//
//   1. Focuses the existing help window if one is open (so clicking
//      Help a second time doesn't pile up windows). When a slug is
//      supplied, emits a `help:navigate` Tauri event so the help
//      window can route to that topic via its own listener — see
//      app/layouts/help-window.vue.
//   2. Otherwise spawns a new WebviewWindow at /help/[slug] (or /help
//      if no slug was supplied).
//
// Outside the Tauri runtime (e.g. `bun run dev` without the shell),
// falls back to an in-place router push so dev iteration still works.

import { useRouter } from "vue-router";
import { useUserPlatform } from "~/composables/useUserPlatform";
import { HELP_TOPICS_BY_SLUG } from "~/help";

// Single label — only one help window ever exists. If we ever want
// multi-window cross-referencing again, switch to a counter and
// drop the getByLabel branch below.
const HELP_WINDOW_LABEL = "help-main";

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

		// Outside Tauri (dev mode without the shell): same-window
		// navigation. Won't be a separate window but the user still
		// reaches the content.
		if (!isTauri.value) {
			await router.push(url);
			return;
		}

		// Dynamic import so the @tauri-apps/api bundle doesn't get
		// pulled into the initial route chunk. Pay for it only when
		// the user actually opens the help window.
		const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

		// Focus-or-create. If a window with our label already exists,
		// surface it (and tell it to navigate to the requested slug
		// via a Tauri event the layout listens for).
		const existing = await WebviewWindow.getByLabel(HELP_WINDOW_LABEL);
		if (existing) {
			await existing.show();
			await existing.unminimize();
			await existing.setFocus();
			if (slug) {
				await existing.emit("help:navigate", { slug });
			} else {
				await existing.emit("help:navigate", { slug: null });
			}
			return;
		}

		const title = slug && HELP_TOPICS_BY_SLUG[slug]
			? `Help — ${HELP_TOPICS_BY_SLUG[slug].title}`
			: "Sakoram — Help";

		const win = new WebviewWindow(HELP_WINDOW_LABEL, {
			url,
			title,
			// Mirror the main window's 1280×800 default. minWidth: 1024
			// matches main's floor and is also the breakpoint above
			// which the help sidebar comfortably fits.
			width: 1280,
			height: 800,
			minWidth: 1024,
			minHeight: 640,
			center: true,
			focus: true,
			decorations: false,
			resizable: true,
			minimizable: true,
			maximizable: true
		});

		win.once("tauri://error", (err) => {
			console.warn("[useHelpWindow] failed to create help window:", err);
		});
	};

	return {
		openHelpWindow,
		isTauri
	};
};
