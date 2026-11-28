// The business's look on every window that shows its pages: the main window
// (layouts/default.vue) and the page designer's own window
// (layouts/designer-window.vue). Each window is its own Nuxt app, so each one
// applies it.
//
// - UI font: overrides Tailwind's `--font-sans` on :root (not `font-family` on
//   a layout element), so teleported overlays — modals, popovers — get it too.
// - Theme colour: a named preset flips NuxtUI's palette; a custom hex injects
//   a generated ramp (color-ramp.ts applyPrimaryColor).
// - Light / dark: @nuxtjs/color-mode keeps the choice in localStorage, which
//   the windows share; a change in another window arrives as a `storage`
//   event, applied here so an open window follows it.

import { applyPrimaryColor } from "~/lib/color-ramp";
import { uiFontStack } from "~/lib/theme";
import { useSettingsStore } from "~/stores/settings";

/** @nuxtjs/color-mode's default localStorage key (nuxt.config sets none). */
const COLOR_MODE_KEY = "nuxt-color-mode";

export function useAppTheme(): void {
	const settings = useSettingsStore();
	const appConfig = useAppConfig() as { ui: { colors: { primary: string } } };
	const colorMode = useColorMode();

	watch(() => uiFontStack(settings.settings?.ui_font), (stack) => {
		if (typeof document !== "undefined") document.documentElement.style.setProperty("--font-sans", stack);
	}, { immediate: true });

	watch(() => settings.settings?.theme_color, (value) => applyPrimaryColor(appConfig, value), { immediate: true });

	const onStorage = (e: StorageEvent) => {
		if (e.key === COLOR_MODE_KEY && e.newValue) colorMode.preference = e.newValue;
	};
	onMounted(() => {
		window.addEventListener("storage", onStorage);
		settings.ensureLoaded().catch(() => { /* surfaced where settings are shown */ });
	});
	onBeforeUnmount(() => window.removeEventListener("storage", onStorage));
}
