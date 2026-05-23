// Reports the host operating system so platform-conditional UI
// (custom titlebar layout, Mac traffic-light reservation, etc.) can
// branch cleanly.
//
// `@tauri-apps/plugin-os`'s `platform()` is synchronous in v2 — it's
// resolved at app start by the Tauri runtime — so we cache it on
// first call. If the call ever throws (e.g. running under `nuxt dev`
// outside the Tauri shell, or a future SDK that turns it async), we
// fall back to "unknown" so the UI just behaves like Windows (the
// historical default).

import { platform } from "@tauri-apps/plugin-os";

export type UserPlatform = "macos" | "windows" | "linux" | "unknown";

let cached: UserPlatform | null = null;

const detect = (): UserPlatform => {
	try {
		const p = platform();
		if (p === "macos" || p === "windows" || p === "linux") return p;
		return "unknown";
	} catch {
		return "unknown";
	}
};

/**
 * Returns the active platform. Cached after first call — the value
 * can't change while the app is running. Reads are cheap; pull it
 * once into a `const { isMac } = useUserPlatform()` and lean on it.
 */
export const useUserPlatform = () => {
	if (cached === null) cached = detect();
	return {
		platform: cached,
		isMac: cached === "macos",
		isWindows: cached === "windows",
		isLinux: cached === "linux"
	};
};
