# Per-business encryption — Phase 2b (unlock flow + access guard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase-2a vault commands into the app's tenant lifecycle so an encrypted business prompts for its password on launch / switch via a dedicated unlock screen, never auto-opens its database while locked, locks the previous business on switch, and locks the active business (with the SQLite pool closed first) when the window closes.

**Architecture:** A pure routing helper (`resolveTenantGuard`) decides welcome / unlock / proceed and is unit-tested. The `tenants` Pinia store learns the `encrypted` flag, gains an `activeLocked` computed, an `unlock()` action, and **guards `refresh()`/`activate()` against opening a locked DB** (which would otherwise run migrations and create an empty plaintext `.db`). The global middleware calls the helper. A new `/unlock` page (welcome layout) collects the password or recovery key. A client plugin locks the active encrypted business on window close, **closing the `tauri-plugin-sql` pool first** (via `resetDbCache()`) so the Windows file rename in `lock` doesn't fail.

**Tech Stack:** Nuxt 4 (SSG), Vue 3, Pinia, NuxtUI 4, `@tauri-apps/api`, Vitest (pure helper), Tauri capabilities.

**Spec:** `docs/superpowers/specs/2026-06-02-per-business-encryption-design.md` §6 Lifecycle, §7 UI (unlock screen + welcome lock indicators).

**Depends on Phase 2a** (already on this branch): the Rust commands `tenant_lock_state`, `unlock_tenant`, `lock_tenant`, and the `encrypted` field on the registry `Tenant`.

**Branch:** Continue on `feat/encryption-phase1-crypto-core`. Do not branch or touch `main`.

**Build/test:** `bun run test` (Vitest, for the pure helper), `bun run lint` (eslint --fix), and a documented **manual smoke test** under `bun run tauri:dev` for the integration (the unlock flow can't be unit-tested without the Tauri runtime + a real encrypted DB).

---

## Key integration facts (from reading the current code)

- `app/lib/db.ts` `resetDbCache()` already calls `db.close()` on the `tauri-plugin-sql` pool — this is exactly the pool-close needed before `lock_tenant` (otherwise the Windows rename of the open `.db` fails).
- `app/stores/tenants.ts` `refresh()` and `activate()` currently call `ensure_tenant_db` **unconditionally**. `ensure_tenant_db` runs migrations, which **creates the `.db` file if missing** — so for an encrypted+locked tenant it would silently create a fresh empty plaintext database. Both paths must be guarded.
- `app/middleware/tenant.global.ts` only distinguishes "has active" vs "no active". We add a third outcome: active-but-locked → `/unlock`.
- A locked encrypted tenant is exactly: `activeTenant.encrypted === true && dbUrl === null` (because `refresh()`/`activate()` only set `dbUrl` once the lock state is `unlocked`).

## File structure

- **Create** `app/lib/tenant-route.ts` — pure `resolveTenantGuard()` decision function. One responsibility: given tenant state + target path, return a redirect or null.
- **Create** `app/lib/tenant-route.test.ts` — Vitest unit tests (co-located, matching `reconcile-match.test.ts`).
- **Modify** `app/stores/tenants.ts` — `encrypted` on `Tenant`; `activeLocked` computed; guarded `refresh()`; new `unlock()`; guarded `activate()` with lock-previous.
- **Modify** `app/middleware/tenant.global.ts` — delegate to `resolveTenantGuard`.
- **Create** `app/pages/unlock.vue` — the unlock screen (welcome layout).
- **Modify** `app/pages/welcome.vue` — lock badge on encrypted businesses (the existing `switchTo` already works unchanged once the store is guarded).
- **Create** `app/plugins/lock-on-close.client.ts` — close pool + lock active encrypted business on window close.
- **Modify** `src-tauri/capabilities/main.json` — add `core:window:allow-destroy` (needed by the close plugin). Requires a Rust rebuild.

---

### Task 1: Pure routing guard + tests

**Files:**
- Create: `app/lib/tenant-route.ts`
- Create: `app/lib/tenant-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/tenant-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveTenantGuard } from "./tenant-route";

describe("resolveTenantGuard", () => {
	it("sends you to /welcome when no business is active", () => {
		const s = { activeId: null, activeLocked: false, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/")).toEqual({ redirect: "/welcome" });
		expect(resolveTenantGuard(s, "/invoices")).toEqual({ redirect: "/welcome" });
	});

	it("allows /welcome itself with no active business", () => {
		const s = { activeId: null, activeLocked: false, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/welcome")).toBeNull();
	});

	it("sends you to /unlock when the active business is locked", () => {
		const s = { activeId: "acme", activeLocked: true, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/")).toEqual({ redirect: "/unlock" });
		expect(resolveTenantGuard(s, "/invoices")).toEqual({ redirect: "/unlock" });
	});

	it("allows /unlock and /welcome while locked (welcome is the escape hatch)", () => {
		const s = { activeId: "acme", activeLocked: true, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/unlock")).toBeNull();
		expect(resolveTenantGuard(s, "/welcome")).toBeNull();
	});

	it("proceeds normally when the active business is open", () => {
		const s = { activeId: "acme", activeLocked: false, hasDbUrl: true };
		expect(resolveTenantGuard(s, "/")).toBeNull();
		expect(resolveTenantGuard(s, "/invoices")).toBeNull();
	});

	it("bounces /unlock to / when already unlocked", () => {
		const s = { activeId: "acme", activeLocked: false, hasDbUrl: true };
		expect(resolveTenantGuard(s, "/unlock")).toEqual({ redirect: "/" });
	});

	it("falls back to /welcome if active but somehow no db url and not locked", () => {
		const s = { activeId: "acme", activeLocked: false, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/invoices")).toEqual({ redirect: "/welcome" });
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test tenant-route`
Expected: FAIL — cannot resolve `./tenant-route`.

- [ ] **Step 3: Implement the helper**

Create `app/lib/tenant-route.ts`:

```ts
// Pure routing decision for the tenant access guard. Kept out of the Nuxt
// middleware so the branching (welcome / unlock / proceed) is unit-testable
// without a router or Tauri runtime. See app/middleware/tenant.global.ts.

export interface TenantGuardState {
	/** Active tenant id, or null if no business is selected. */
	activeId: string | null;
	/** True when the active business is encrypted AND not currently unlocked. */
	activeLocked: boolean;
	/** True when a working DB URL is open (unencrypted, or unlocked). */
	hasDbUrl: boolean;
}

export type GuardResult = { redirect: string } | null;

/**
 * Decide where a navigation to `toPath` should go.
 * - no active business  -> /welcome (but allow /welcome itself)
 * - active but locked    -> /unlock  (allow /unlock and /welcome as escapes)
 * - active and open      -> proceed  (but bounce /unlock back to /)
 */
export function resolveTenantGuard(state: TenantGuardState, toPath: string): GuardResult {
	const onWelcome = toPath === "/welcome";
	const onUnlock = toPath === "/unlock";

	if (!state.activeId) {
		return onWelcome ? null : { redirect: "/welcome" };
	}

	if (state.activeLocked) {
		if (onUnlock || onWelcome) return null;
		return { redirect: "/unlock" };
	}

	// Active and not locked: we expect a db url. If it's missing, something is
	// off — send the user back to the picker rather than into a broken page.
	if (!state.hasDbUrl) {
		return onWelcome ? null : { redirect: "/welcome" };
	}

	// Already unlocked but sitting on /unlock — go home.
	if (onUnlock) return { redirect: "/" };

	return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test tenant-route`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/tenant-route.ts app/lib/tenant-route.test.ts
git commit -m "feat(tenants): pure access-guard routing helper + tests"
```

---

### Task 2: tenants store — encrypted flag, guards, unlock action

**Files:**
- Modify: `app/stores/tenants.ts`

- [ ] **Step 1: Add `encrypted` to the `Tenant` interface**

```ts
export interface Tenant {
	id: string
	name: string
	logo_file: string | null
	encrypted?: boolean
}
```
(`?` so any code constructing a `Tenant` literal without it still type-checks; the registry from Rust always includes it.)

- [ ] **Step 2: Add the `activeLocked` computed**

After the existing `activeTenant` computed, add:

```ts
	// A business is "locked" when it's encrypted and its DB isn't open yet.
	// refresh()/activate() only set dbUrl once the Rust session reports the
	// vault as unlocked, so (encrypted && !dbUrl) is an accurate lock signal.
	const activeLocked = computed<boolean>(() =>
		!!activeTenant.value?.encrypted && !dbUrl.value
	);
```

- [ ] **Step 3: Guard `refresh()` so a locked DB is never auto-opened**

Replace the body of `refresh()` with:

```ts
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
```

- [ ] **Step 4: Add the `unlock()` action**

Add after `activate` (and export it in the returned object — see Step 6):

```ts
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
```

- [ ] **Step 5: Guard `activate()` + lock the previous business**

Replace the body of `activate()` with:

```ts
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
```

- [ ] **Step 6: Export `activeLocked` + `unlock` from the store**

In the returned object, add `activeLocked` and `unlock`:

```ts
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
```

- [ ] **Step 7: Lint + verify the store compiles**

Run: `bun run lint`
Expected: passes (auto-fixes formatting). No type errors reported for `tenants.ts`.

- [ ] **Step 8: Commit**

```bash
git add app/stores/tenants.ts
git commit -m "feat(tenants): encrypted-aware refresh/activate guards + unlock action"
```

---

### Task 3: Middleware delegates to the guard helper

**Files:**
- Modify: `app/middleware/tenant.global.ts`

- [ ] **Step 1: Rewrite the middleware to use `resolveTenantGuard`**

Replace the whole file with:

```ts
// Global guard: route every navigation based on tenant state.
//   - no active business        -> /welcome
//   - active but locked (vault) -> /unlock
//   - active and open           -> proceed
//
// The decision lives in app/lib/tenant-route.ts (pure + unit-tested); this
// middleware only wires the store state into it. On first navigation we also
// populate the tenants store (which auto-migrates a legacy single-DB).

import { resolveTenantGuard } from "~/lib/tenant-route";
import { useTenantsStore } from "~/stores/tenants";

export default defineNuxtRouteMiddleware(async (to) => {
	const tenants = useTenantsStore();
	if (!tenants.loaded) {
		try {
			await tenants.ensureLoaded();
		} catch {
			if (to.path !== "/welcome") return navigateTo("/welcome");
			return;
		}
	}

	const result = resolveTenantGuard(
		{
			activeId: tenants.activeTenantId,
			activeLocked: tenants.activeLocked,
			hasDbUrl: !!tenants.dbUrl
		},
		to.path
	);
	if (result) return navigateTo(result.redirect);
});
```

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/middleware/tenant.global.ts
git commit -m "feat(tenants): middleware routes locked businesses to /unlock"
```

---

### Task 4: The `/unlock` page

**Files:**
- Create: `app/pages/unlock.vue`

- [ ] **Step 1: Create the unlock screen**

Create `app/pages/unlock.vue` (uses the `welcome` layout; single root node per the project's blank-page landmine):

```vue
<template>
	<div class="w-full max-w-md select-none">
		<header class="text-center mb-6">
			<img
				:src="sakoramLogo"
				alt="Sakoram"
				class="h-16 w-auto mx-auto mb-5 dark:invert dark:hue-rotate-180"
			>
			<h1 class="text-2xl font-semibold flex items-center justify-center gap-2">
				<UIcon name="i-lucide-lock" class="size-5 text-(--ui-primary)" />
				Unlock business
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span class="font-medium">{{ tenants.activeTenant?.name ?? "This business" }}</span>
				is password-protected. Enter its password to continue.
			</p>
		</header>

		<div class="bg-(--ui-bg) border border-(--ui-border) rounded-lg p-5 space-y-4">
			<UFormField v-if="!useRecovery" label="Password" :error="error">
				<UInput
					v-model="password"
					type="password"
					placeholder="Business password"
					autofocus
					:disabled="busy"
					@keydown.enter="onSubmit"
				/>
			</UFormField>

			<UFormField v-else label="Recovery key" :error="error" help="The key shown when you enabled encryption.">
				<UTextarea
					v-model="recovery"
					placeholder="XXXX-XXXX-XXXX-…"
					:rows="3"
					:disabled="busy"
				/>
			</UFormField>

			<UButton
				block
				icon="i-lucide-lock-open"
				:loading="busy"
				:disabled="busy || (useRecovery ? !recovery.trim() : !password)"
				@click="onSubmit"
			>
				Unlock
			</UButton>

			<div class="flex items-center justify-between text-xs">
				<button
					type="button"
					class="text-(--ui-primary) hover:underline disabled:opacity-50"
					:disabled="busy"
					@click="toggleMode"
				>
					{{ useRecovery ? "Use password instead" : "Use recovery key instead" }}
				</button>
				<NuxtLink to="/welcome" class="text-(--ui-text-muted) hover:underline">
					Switch business
				</NuxtLink>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Unlock screen for an encrypted business. Decrypts the active tenant's vault
// via the Rust unlock_tenant command, then hard-reloads so every store
// re-hydrates against the now-open DB.

	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({
		layout: "welcome",
		title: "Unlock"
	});

	const tenants = useTenantsStore();

	const useRecovery = ref(false);
	const password = ref("");
	const recovery = ref("");
	const error = ref("");
	const busy = ref(false);

	const toggleMode = () => {
		useRecovery.value = !useRecovery.value;
		error.value = "";
	};

	const onSubmit = async () => {
		if (busy.value) return;
		const secret = useRecovery.value ? recovery.value.trim() : password.value;
		if (!secret) return;
		busy.value = true;
		error.value = "";
		try {
			await tenants.unlock(secret, useRecovery.value);
			window.location.assign("/");
		} catch (err) {
			// unlock_tenant maps a bad password/recovery key to an auth error.
			const raw = err instanceof Error ? err.message : String(err);
			error.value = /invalid password|recovery key|auth/i.test(raw)
				? (useRecovery.value ? "That recovery key isn't right." : "Incorrect password.")
				: raw;
			busy.value = false;
		}
	};
</script>
```

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/pages/unlock.vue
git commit -m "feat(unlock): /unlock screen (password + recovery-key fallback)"
```

---

### Task 5: Lock badge on the welcome screen

**Files:**
- Modify: `app/pages/welcome.vue`

- [ ] **Step 1: Add a lock badge to encrypted business cards**

In the business-picker `<button>` (the `v-for="t in tenants.tenants"` card), add a lock indicator next to the trailing chevron. Replace the trailing icon block:

```vue
				<UIcon
					v-if="switchingId === t.id"
					name="i-lucide-loader-circle"
					class="size-5 text-(--ui-text-muted) animate-spin"
				/>
				<UIcon v-else name="i-lucide-chevron-right" class="size-5 text-(--ui-text-muted) group-hover:text-(--ui-primary)" />
```

with:

```vue
				<UIcon
					v-if="t.encrypted"
					name="i-lucide-lock"
					class="size-4 text-(--ui-text-muted)"
					title="Password-protected"
				/>
				<UIcon
					v-if="switchingId === t.id"
					name="i-lucide-loader-circle"
					class="size-5 text-(--ui-text-muted) animate-spin"
				/>
				<UIcon v-else name="i-lucide-chevron-right" class="size-5 text-(--ui-text-muted) group-hover:text-(--ui-primary)" />
```

(No logic change to `switchTo` is needed: `activate()` now leaves `dbUrl` null for a locked target, so after `window.location.assign("/")` the middleware routes to `/unlock`.)

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/pages/welcome.vue
git commit -m "feat(welcome): lock badge on password-protected businesses"
```

---

### Task 6: Lock-on-close plugin + capability

**Files:**
- Create: `app/plugins/lock-on-close.client.ts`
- Modify: `src-tauri/capabilities/main.json`

- [ ] **Step 1: Add the window capability**

In `src-tauri/capabilities/main.json`, in the `permissions` array, add `"core:window:allow-destroy"` next to the other `core:window:*` entries (e.g. after `"core:window:allow-close"`):

```json
		"core:window:allow-close",
		"core:window:allow-destroy",
```

(Capabilities are compiled in — this needs a Rust rebuild, which `bun run tauri:dev` / the manual smoke test triggers.)

- [ ] **Step 2: Create the plugin**

Create `app/plugins/lock-on-close.client.ts`:

```ts
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
```

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add app/plugins/lock-on-close.client.ts src-tauri/capabilities/main.json
git commit -m "feat(unlock): lock active business on window close (pool closed first)"
```

---

### Task 7: Full manual smoke test (integration verification)

This phase's integration can't be unit-tested (needs the Tauri runtime + a real encrypted DB). Run the full flow once and record the result in the PR description. Do NOT skip.

**Files:** none (verification only).

- [ ] **Step 1: Build + launch**

Run: `bun run tauri:dev` (this recompiles Rust, picking up the new capability).

- [ ] **Step 2: Enable encryption on a business**

With an active business (e.g. the demo), open devtools console and enable encryption directly (the Settings UI is Phase 2c):

```js
await window.__TAURI__.core.invoke('enable_tenant_encryption', { id: '<active-id>', password: 'test1234' })
```

Copy the returned recovery key.

- [ ] **Step 3: Verify lock-on-close**

Close the app window. In `%APPDATA%\com.sakoram.billing\businesses\`, confirm `<id>.db` is **gone** and `<id>.db.enc` + `<id>.vault.json` exist (the plaintext was sealed away on close).

- [ ] **Step 4: Verify the unlock gate on launch**

Relaunch `bun run tauri:dev`. Confirm the app lands on the **/unlock** screen (not the dashboard, and not a fresh empty DB). Enter a wrong password → see the inline error. Enter `test1234` → it should unlock and load the dashboard with all the original data intact.

- [ ] **Step 5: Verify recovery key + switch**

Close + relaunch → on /unlock, click "Use recovery key instead", paste the recovery key → unlocks. Then create/switch to a second (unencrypted) business via "Switch business" → confirm the encrypted one re-locks (its `.db` disappears again) and the unencrypted one opens normally.

- [ ] **Step 6: Verify disable returns to normal**

Unlock the encrypted business, then from the console:

```js
await window.__TAURI__.core.invoke('disable_tenant_encryption', { id: '<id>', password: 'test1234' })
```

Reload — it should open straight to the dashboard with no unlock prompt, and `<id>.db` exists plaintext again (`.enc` + `.vault.json` gone).

- [ ] **Step 7: Record + commit (docs only, if you keep notes)**

No code commit required. Capture the smoke-test outcome (pass/fail per step) for the PR description.

---

## Self-review notes

- **Spec coverage (§6 Lifecycle):** unlock screen (Task 4) ✓; access guard routes locked → /unlock (Tasks 1, 3) ✓; lock-on-switch (Task 2 `activate`) ✓; lock-on-close with pool closed first (Task 6) ✓; never auto-open a locked DB / no empty-DB creation (Task 2 guards) ✓.
- **Spec coverage (§7 UI):** `/unlock` with password + recovery-key fallback (Task 4) ✓; welcome lock indicators (Task 5) ✓.
- **Phase-2a constraint honored:** `resetDbCache()` (pool close) runs before every `lock_tenant` (Task 2 `activate`, Task 6 close plugin) so the Windows rename succeeds.
- **Deferred to Phase 2c (correctly out of scope):** the Security settings UI to *enable/disable/change-password* + the one-time recovery-key display. This phase exercises enable/disable via the devtools console in the smoke test only.
- **Testing posture:** the tricky routing logic is pure + unit-tested (Task 1); the store/middleware/UI wiring is verified by `bun run lint` + the Task 7 manual smoke test, since there's no component/Tauri test harness in this project (consistent with how Phase 2a's command wiring was verified).
- **Placeholder scan:** none — every code step has complete code; Task 7 is an explicit, exact manual procedure (the only way to verify Tauri-runtime integration).
- **Type consistency:** `TenantGuardState{activeId,activeLocked,hasDbUrl}` matches the middleware call site; `unlock(secret, useRecovery)` matches the `/unlock` page call; `Tenant.encrypted` used consistently in store + welcome.

## Versioning / PR

Per project rules, the eventual PR bumps the version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (minor). Do that only when opening the PR. Do not open the PR until the user asks.
