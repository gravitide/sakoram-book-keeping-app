// Seal the active encrypted business back to its blob when the window closes.
//
// The Rust ExitRequested hook (Phase 2a) is a backstop, but it can't remove the
// plaintext working .db on Windows while tauri-plugin-sql still holds the file
// open. Doing it here lets us close the JS-side pool FIRST (resetDbCache), so
// the lock's re-encrypt + atomic rename + secure-delete all succeed cleanly.
//
// We intercept onCloseRequested, preventDefault synchronously (required before
// any await or the close proceeds), do the async lock, then destroy() the
// window. Errors never block the close.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { resetDbCache } from "~/lib/db";
import { useTenantsStore } from "~/stores/tenants";

export default defineNuxtPlugin(() => {
	if (typeof window === "undefined") return;

	let sealing = false;
	let win: ReturnType<typeof getCurrentWindow>;
	try {
		win = getCurrentWindow();
	} catch {
		return; // not running inside Tauri (e.g. plain `bun run dev`)
	}

	win.onCloseRequested(async (event) => {
		if (sealing) return; // our own destroy() re-entry — let it through
		const tenants = useTenantsStore();
		const id = tenants.activeTenantId;
		// Only intercept when an encrypted business is actually open.
		if (!id || !tenants.activeTenant?.encrypted || !tenants.dbUrl) return;

		event.preventDefault(); // must be synchronous, before the first await
		sealing = true;
		try {
			await resetDbCache(); // close the sqlite pool so the file isn't locked
			await invoke("lock_tenant", { id });
		} catch { /* best-effort — we still close */ }
		await win.destroy();
	}).catch(() => { /* listener registration failed — nothing to do */ });
});
