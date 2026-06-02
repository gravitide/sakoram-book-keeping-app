// Tenants registry — the bridge between the JS app and the Rust-managed
// `tenants.json` file. This store knows which businesses exist, which
// one is active, and what sqlite URL `db.ts` should connect to.
//
// The mental model: think of `dbUrl` as the "current working DB". Once
// it's set, every Pinia store calls getDb() and lands in the right
// tenant's database. Switching is a hard reload (window.location) — the
// cleanest way to reset every store without bug-prone manual $reset()
// gymnastics.

import { invoke } from "@tauri-apps/api/core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { resetDbCache } from "~/lib/db";

export interface Tenant {
	id: string
	name: string
	logo_file: string | null
	encrypted?: boolean
}

export interface TenantRegistry {
	active_tenant_id: string | null
	tenants: Tenant[]
}

export const useTenantsStore = defineStore("tenants", () => {
	const tenants = ref<Tenant[]>([]);
	const activeTenantId = ref<string | null>(null);
	const dbUrl = ref<string | null>(null);
	const loaded = ref(false);

	const activeTenant = computed<Tenant | null>(() =>
		tenants.value.find((t) => t.id === activeTenantId.value) ?? null
	);

	// A business is "locked" when it's encrypted and its DB isn't open yet.
	// refresh()/activate() only set dbUrl once the Rust session reports the
	// vault as unlocked, so (encrypted && !dbUrl) is an accurate lock signal.
	const activeLocked = computed<boolean>(() =>
		!!activeTenant.value?.encrypted && !dbUrl.value
	);

	/// Force a re-pull from the registry. Use after import/export changes
	/// the tenant list out-of-band.
	const refresh = async (): Promise<void> => {
		const reg = await invoke<TenantRegistry>("list_tenants");
		tenants.value = reg.tenants;
		activeTenantId.value = reg.active_tenant_id;
		if (activeTenantId.value && !dbUrl.value) {
			const active = tenants.value.find((t) => t.id === activeTenantId.value);
			if (active?.encrypted) {
				// Encrypted: only open the DB if the Rust session already holds
				// the key (e.g. after an unlock + reload). If it's locked, leave
				// dbUrl null — the middleware routes the user to /unlock. Calling
				// ensure_tenant_db here would create an empty plaintext DB.
				const state = await invoke<string>("tenant_lock_state", { id: activeTenantId.value });
				if (state === "unlocked") {
					dbUrl.value = await invoke<string>("ensure_tenant_db", { id: activeTenantId.value });
				}
			} else {
				dbUrl.value = await invoke<string>("ensure_tenant_db", { id: activeTenantId.value });
			}
		}
		loaded.value = true;
	};

	/// Pull the registry from Rust. Triggers the legacy-DB migration on
	/// first launch after upgrading. Idempotent — call from middleware.
	const ensureLoaded = async (): Promise<void> => {
		if (loaded.value) return;
		await refresh();
	};

	const create = async (name: string): Promise<Tenant> => {
		const t = await invoke<Tenant>("create_tenant", { name });
		tenants.value.push(t);
		return t;
	};

	const rename = async (id: string, name: string): Promise<void> => {
		await invoke("rename_tenant", { id, name });
		const t = tenants.value.find((t) => t.id === id);
		if (t) t.name = name;
	};

	const remove = async (id: string): Promise<void> => {
		// If we're deleting the active tenant, the open DB pool holds an
		// OS-level handle on Windows — Rust's remove_file would fail. Close
		// it first, then drop the in-memory active state so the rest of the
		// app stops trying to query it.
		const wasActive = activeTenantId.value === id;
		if (wasActive) {
			await resetDbCache();
		}
		await invoke("delete_tenant", { id });
		tenants.value = tenants.value.filter((t) => t.id !== id);
		if (wasActive) {
			activeTenantId.value = null;
			dbUrl.value = null;
		}
	};

	/// Switch the active tenant. Caller is responsible for navigating —
	/// usually `await activate(id); window.location.assign("/")` so every
	/// store re-hydrates against the new DB cleanly.
	const activate = async (id: string): Promise<void> => {
		const prev = activeTenantId.value;
		// Close the current pool before any re-encryption / file rename.
		await resetDbCache();
		// If we're leaving an unlocked encrypted business, seal it back to its
		// blob (the pool is now closed, so the Windows rename succeeds).
		if (prev && prev !== id) {
			const prevTenant = tenants.value.find((t) => t.id === prev);
			if (prevTenant?.encrypted) {
				try {
					await invoke("lock_tenant", { id: prev });
				} catch { /* best-effort — don't block the switch */ }
			}
		}
		await invoke("set_active_tenant", { id });
		const target = tenants.value.find((t) => t.id === id);
		if (target?.encrypted) {
			// Only open the DB if it's already unlocked in the session; otherwise
			// leave dbUrl null and let the post-navigation middleware send the
			// user to /unlock.
			const state = await invoke<string>("tenant_lock_state", { id });
			dbUrl.value = state === "unlocked" ? await invoke<string>("ensure_tenant_db", { id }) : null;
		} else {
			dbUrl.value = await invoke<string>("ensure_tenant_db", { id });
		}
		activeTenantId.value = id;
	};

	/// Unlock the active encrypted business with a password or recovery key.
	/// Decrypts the blob to the working DB (Rust), then opens it. Caller
	/// typically does `await unlock(...); window.location.assign("/")`.
	const unlock = async (secret: string, useRecovery: boolean): Promise<void> => {
		const id = activeTenantId.value;
		if (!id) throw new Error("No business selected to unlock.");
		await invoke("unlock_tenant", { id, secret, useRecovery });
		const url = await invoke<string>("ensure_tenant_db", { id });
		await resetDbCache();
		dbUrl.value = url;
	};

	const setLogoFile = async (id: string, logoFile: string | null): Promise<void> => {
		await invoke("set_tenant_logo", { id, logoFile });
		const t = tenants.value.find((t) => t.id === id);
		if (t) t.logo_file = logoFile;
	};

	const logoPath = async (id: string): Promise<string | null> => {
		return await invoke<string | null>("tenant_logo_path", { id });
	};

	return {
		tenants,
		activeTenantId,
		activeTenant,
		activeLocked,
		dbUrl,
		loaded,
		ensureLoaded,
		refresh,
		create,
		rename,
		remove,
		activate,
		unlock,
		setLogoFile,
		logoPath
	};
});
