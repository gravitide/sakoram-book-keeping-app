// Seal the active encrypted business back to its blob when the MAIN window closes.
//
// Only active for the "main" window — the app also spawns a "help-main"
// WebviewWindow for the help library, and that window must never trigger a
// vault seal while the main window is still open.
//
// The Rust ExitRequested hook (Phase 2a) is a backstop, but it can't remove the
// plaintext working .db on Windows while tauri-plugin-sql still holds the file
// open. Doing it here lets us close the JS-side pool FIRST (resetDbCache), so
// the lock's re-encrypt + atomic rename + secure-delete all succeed cleanly.
//
// We intercept onCloseRequested, preventDefault synchronously (required before
// any await or the close proceeds), then race the async seal against a 5 s
// timeout so win.destroy() ALWAYS runs — the Rust backstop seals on its side
// if JS times out. Errors inside the seal are best-effort and never block close.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { resetDbCache } from "~/lib/db";
import { useTenantsStore } from "~/stores/tenants";

const SEAL_TIMEOUT_MS = 5000;

export default defineNuxtPlugin(() => {
	if (typeof window === "undefined") return;

	let win: ReturnType<typeof getCurrentWindow>;
	try {
		win = getCurrentWindow();
	} catch {
		return; // not running inside Tauri (e.g. plain `bun run dev`)
	}

	// Only the main window manages the vault lifecycle. The help window
	// (label "help-main") must never seal the vault while main is open.
	if (win.label !== "main") return;

	win.onCloseRequested(async (event) => {
		const tenants = useTenantsStore();
		const id = tenants.activeTenantId;
		// Only intercept when an encrypted business is actually open.
		if (!id || !tenants.activeTenant?.encrypted || !tenants.dbUrl) return;

		event.preventDefault(); // must be synchronous, before the first await

		// Race the seal against a timeout so win.destroy() always runs.
		// If the seal hangs (slow/locked disk), the Rust ExitRequested backstop
		// will still seal on its side after the process exits.
		await Promise.race([
			(async () => {
				try {
					await resetDbCache(); // close the sqlite pool so the file isn't locked
					await invoke("lock_tenant", { id });
				} catch { /* best-effort — we still close */ }
			})(),
			new Promise<void>((resolve) => setTimeout(resolve, SEAL_TIMEOUT_MS))
		]);
		await win.destroy();
	}).catch(() => { /* listener registration failed — nothing to do */ });
});
