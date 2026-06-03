# Per-business encryption — Phase 2c (Security settings UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Security settings page where the user enables password protection for the active business (with a one-time recovery-key display), changes the password, locks it now, or removes protection — making the whole encryption feature usable without the devtools console.

**Architecture:** A new `/settings/security` page operates on the **active** business (always unlocked when reachable, since the access guard requires it). It reads `tenants.activeTenant.encrypted` to choose between the *enable* flow and the *manage* flow, and calls the Phase-2a Tauri commands. The only non-obvious part is **enable**, which must close the JS SQL pool (`resetDbCache()` — checkpoints WAL + releases the file) before `enable_tenant_encryption`, then re-materialise the working DB via `tenants.unlock(password)`. Change-password / disable don't rename `.db`, so they run with the pool open. This phase is **frontend-only** — no Rust changes.

**Tech Stack:** Nuxt 4, Vue 3, Pinia, NuxtUI 4 (UCard / UModal / UFormField / UCheckbox / UButton), `@tauri-apps/api`.

**Spec:** `docs/superpowers/specs/2026-06-02-per-business-encryption-design.md` §7 UI (enable / change-password / disable + one-time recovery-key display).

**Depends on Phases 2a + 2b** (already on this branch): the commands `enable_tenant_encryption` (returns the recovery key), `disable_tenant_encryption`, `change_tenant_password`, `lock_tenant`; and the store's `unlock()` action + `activeTenant.encrypted`.

**Branch:** Continue on `feat/encryption-phase1-crypto-core`. Do not branch or touch `main`.

**Build/test:** `bun run lint` (must pass clean) + the documented **manual smoke test** in Task 3 (this UI can only be validated against the Tauri runtime + a real encrypted DB — it doubles as the end-to-end verification of Phases 2a/2b that was deferred).

---

## Command argument reference (Tauri auto-camelCases snake_case Rust params)

- `enable_tenant_encryption({ id, password })` → returns `string` (recovery key).
- `change_tenant_password({ id, oldPassword, newPassword })` → `void`.
- `disable_tenant_encryption({ id, password })` → `void`.
- `lock_tenant({ id })` → `void`.

## File structure

- **Modify** `app/layouts/default.vue` — add a "Security" item to the **App** sidebar group.
- **Create** `app/pages/settings/security.vue` — the Security page (status + enable flow + recovery-key modal + change-password + lock-now + disable).

---

### Task 1: Sidebar "Security" entry

**Files:**
- Modify: `app/layouts/default.vue`

- [ ] **Step 1: Add the nav item to the App group**

In the `nav` array, find the **App** group (the item with `label: "App"`, `to: "/settings/appearance"`). Its `children` array currently holds Appearance + Businesses. Add a Security child between them:

```ts
				children: [
					{
						to: "/settings/appearance",
						label: "Appearance",
						icon: "i-lucide-palette",
						sections: [
							{ hash: "#ui-font", label: "UI font", icon: "i-lucide-type" },
							{ hash: "#theme-color", label: "Theme color", icon: "i-lucide-palette" },
							{ hash: "#theme", label: "Theme", icon: "i-lucide-sun-moon" },
							{ hash: "#zoom", label: "Zoom", icon: "i-lucide-zoom-in" }
						]
					},
					{ to: "/settings/security", label: "Security", icon: "i-lucide-shield-check" },
					{ to: "/settings/businesses", label: "Businesses", icon: "i-lucide-briefcase" }
				]
```

(Only the new `{ to: "/settings/security", ... }` line is added — keep the Appearance + Businesses entries as they were.)

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add app/layouts/default.vue
git commit -m "feat(security): Security entry in the App settings sidebar group"
```

---

### Task 2: The `/settings/security` page

**Files:**
- Create: `app/pages/settings/security.vue`

- [ ] **Step 1: Create the page**

Create `app/pages/settings/security.vue` with the complete content below. Notes baked in:
- Single root node (`<div class="select-none">`) with the leading comment INSIDE it (route-transition landmine).
- `UModal` uses `#body` / `#footer` slots (the `#content` slot would eat the footer).
- The recovery modal is non-dismissible and its Done button is gated on the "I've saved it" checkbox.

```vue
<template>
	<div class="select-none">
		<!-- select-none on the page root: static labels aren't selectable;
			form fields + the recovery key stay selectable via main.css /
			explicit select-text. -->
		<header class="mb-6 max-w-2xl mx-auto">
			<h1 class="text-2xl font-semibold flex items-center gap-2">
				<UIcon name="i-lucide-shield-check" class="size-6 text-(--ui-primary)" />
				Security
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Password-protect <span class="font-medium">{{ tenants.activeTenant?.name }}</span>
				by encrypting its database on this computer.
			</p>
		</header>

		<div class="space-y-6 max-w-2xl mx-auto">
			<!-- Status -->
			<UCard>
				<div class="flex items-center gap-3">
					<div
						class="size-10 rounded-md flex items-center justify-center shrink-0"
						:class="isEncrypted ? 'bg-(--ui-success)/15' : 'bg-(--ui-bg-muted)'"
					>
						<UIcon
							:name="isEncrypted ? 'i-lucide-shield-check' : 'i-lucide-shield-off'"
							class="size-5"
							:class="isEncrypted ? 'text-(--ui-success)' : 'text-(--ui-text-muted)'"
						/>
					</div>
					<div class="min-w-0">
						<div class="font-medium">
							{{ isEncrypted ? "Protected" : "Not protected" }}
						</div>
						<div class="text-xs text-(--ui-text-muted)">
							{{ isEncrypted
								? "This business's database is encrypted at rest and needs a password to open."
								: "This business's database is stored unencrypted — anyone with access to this computer's files can read it." }}
						</div>
					</div>
				</div>
			</UCard>

			<!-- Enable (shown when the business is not yet encrypted) -->
			<UCard v-if="!isEncrypted">
				<template #header>
					<div class="font-medium">
						Enable password protection
					</div>
				</template>
				<div class="space-y-4">
					<div class="text-sm text-(--ui-warning) bg-(--ui-warning)/10 border border-(--ui-warning)/30 rounded p-3 flex gap-2">
						<UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-0.5" />
						<div>
							You'll see a <span class="font-semibold">recovery key</span> once, right after enabling.
							Save it somewhere safe. If you forget the password <span class="font-semibold">and</span>
							lose the recovery key, this business's data is unrecoverable — there's no backdoor.
						</div>
					</div>
					<UFormField label="Password" required>
						<UInput v-model="enablePw" type="password" placeholder="Choose a strong password" :disabled="busy" />
					</UFormField>
					<UFormField label="Confirm password" required :error="enableMismatch ? 'Passwords don\'t match' : undefined">
						<UInput
							v-model="enablePw2"
							type="password"
							placeholder="Re-enter the password"
							:disabled="busy"
							@keydown.enter="onEnable"
						/>
					</UFormField>
					<div class="flex justify-end">
						<UButton icon="i-lucide-lock" :loading="busy" :disabled="busy || !enablePw || enableMismatch" @click="onEnable">
							Enable encryption
						</UButton>
					</div>
				</div>
			</UCard>

			<!-- Manage (shown when the business is encrypted + unlocked) -->
			<template v-else>
				<UCard>
					<template #header>
						<div class="font-medium">
							Change password
						</div>
					</template>
					<div class="space-y-4">
						<UFormField label="Current password" required>
							<UInput v-model="cpOld" type="password" :disabled="busy" />
						</UFormField>
						<UFormField label="New password" required>
							<UInput v-model="cpNew" type="password" :disabled="busy" />
						</UFormField>
						<UFormField label="Confirm new password" required :error="cpMismatch ? 'Passwords don\'t match' : undefined">
							<UInput v-model="cpNew2" type="password" :disabled="busy" @keydown.enter="onChangePassword" />
						</UFormField>
						<div class="flex justify-end">
							<UButton
								variant="outline"
								icon="i-lucide-key-round"
								:loading="busy"
								:disabled="busy || !cpOld || !cpNew || cpMismatch"
								@click="onChangePassword"
							>
								Change password
							</UButton>
						</div>
					</div>
				</UCard>

				<UCard>
					<template #header>
						<div class="font-medium">
							Lock now
						</div>
					</template>
					<div class="flex items-center justify-between gap-4">
						<p class="text-sm text-(--ui-text-muted)">
							Seal this business and return to the unlock screen without closing the app.
						</p>
						<UButton color="neutral" variant="outline" icon="i-lucide-lock" :disabled="busy" @click="onLockNow">
							Lock
						</UButton>
					</div>
				</UCard>

				<UCard>
					<template #header>
						<div class="font-medium text-(--ui-error)">
							Remove protection
						</div>
					</template>
					<div class="space-y-4">
						<p class="text-sm text-(--ui-text-muted)">
							Decrypt this business and store it unencrypted again. Requires the current password.
						</p>
						<UFormField label="Current password" required>
							<UInput v-model="disablePw" type="password" :disabled="busy" @keydown.enter="onDisable" />
						</UFormField>
						<div class="flex justify-end">
							<UButton
								color="error"
								variant="soft"
								icon="i-lucide-shield-off"
								:loading="busy"
								:disabled="busy || !disablePw"
								@click="onDisable"
							>
								Remove encryption
							</UButton>
						</div>
					</div>
				</UCard>
			</template>
		</div>

		<!-- Recovery key — shown ONCE right after enabling. Non-dismissible;
			Done is gated on the user confirming they saved it. -->
		<UModal v-model:open="showRecovery" title="Save your recovery key" :dismissible="false" :close="false">
			<template #body>
				<div class="space-y-4">
					<p class="text-sm text-(--ui-text-muted)">
						This is the <span class="font-medium text-(--ui-text)">only</span> time we'll show this.
						If you forget your password, this key is the only way back into
						<span class="font-medium">{{ tenants.activeTenant?.name }}</span>.
					</p>
					<div class="bg-(--ui-bg-muted) border border-(--ui-border) rounded-md p-3 font-mono text-sm break-all select-text">
						{{ recoveryKey }}
					</div>
					<div class="flex justify-end">
						<UButton size="sm" variant="outline" :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" @click="copyKey">
							{{ copied ? "Copied" : "Copy" }}
						</UButton>
					</div>
					<UCheckbox v-model="savedAck" label="I've saved my recovery key somewhere safe" />
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end w-full">
					<UButton :disabled="!savedAck" icon="i-lucide-check" @click="showRecovery = false">
						Done
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
// Security settings for the active business — enable / change-password /
// lock / disable at-rest encryption, with a one-time recovery-key display.
// Reachable only when the active business is unlocked (the access guard
// enforces that), so every action here targets tenants.activeTenantId.

	import { invoke } from "@tauri-apps/api/core";
	import { resetDbCache } from "~/lib/db";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ title: "Security" });

	const tenants = useTenantsStore();
	const toast = useToast();

	await tenants.ensureLoaded();

	const isEncrypted = computed(() => !!tenants.activeTenant?.encrypted);
	const busy = ref(false);
	const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

	// ---- Enable ----
	const enablePw = ref("");
	const enablePw2 = ref("");
	const enableMismatch = computed(() => !!enablePw2.value && enablePw.value !== enablePw2.value);
	const showRecovery = ref(false);
	const recoveryKey = ref("");
	const savedAck = ref(false);
	const copied = ref(false);

	const onEnable = async () => {
		const id = tenants.activeTenantId;
		if (!id || busy.value || !enablePw.value || enableMismatch.value) return;
		busy.value = true;
		try {
			// Close the JS pool first: this checkpoints the WAL into the main db
			// file and releases the OS handle, so Rust can encrypt the complete db
			// and remove the plaintext copy cleanly (Windows blocks deleting an
			// open file). enable seeds the session key + writes the blob and
			// removes the plaintext db, so we re-materialise the working db by
			// unlocking with the password we just set.
			await resetDbCache();
			const key = await invoke<string>("enable_tenant_encryption", { id, password: enablePw.value });
			await tenants.unlock(enablePw.value, false);
			await tenants.refresh();
			recoveryKey.value = key;
			savedAck.value = false;
			copied.value = false;
			showRecovery.value = true;
			enablePw.value = "";
			enablePw2.value = "";
			toast.add({ title: "Encryption enabled", color: "success", icon: "i-lucide-shield-check" });
		} catch (err) {
			toast.add({ title: "Could not enable encryption", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			busy.value = false;
		}
	};

	const copyKey = async () => {
		try {
			await navigator.clipboard.writeText(recoveryKey.value);
			copied.value = true;
			setTimeout(() => { copied.value = false; }, 2000);
		} catch {
			toast.add({ title: "Couldn't copy — select the key and copy it manually", color: "warning", icon: "i-lucide-circle-alert" });
		}
	};

	// ---- Change password ----
	const cpOld = ref("");
	const cpNew = ref("");
	const cpNew2 = ref("");
	const cpMismatch = computed(() => !!cpNew2.value && cpNew.value !== cpNew2.value);

	const onChangePassword = async () => {
		const id = tenants.activeTenantId;
		if (!id || busy.value || !cpOld.value || !cpNew.value || cpMismatch.value) return;
		busy.value = true;
		try {
			await invoke("change_tenant_password", { id, oldPassword: cpOld.value, newPassword: cpNew.value });
			cpOld.value = "";
			cpNew.value = "";
			cpNew2.value = "";
			toast.add({ title: "Password changed", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			const raw = msg(err);
			toast.add({
				title: "Could not change password",
				description: /invalid password|auth/i.test(raw) ? "The current password is incorrect." : raw,
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			busy.value = false;
		}
	};

	// ---- Disable ----
	const disablePw = ref("");
	const onDisable = async () => {
		const id = tenants.activeTenantId;
		if (!id || busy.value || !disablePw.value) return;
		busy.value = true;
		try {
			// disable removes the blob + vault.json and clears the session; it does
			// NOT rename the working db, so the open pool is fine.
			await invoke("disable_tenant_encryption", { id, password: disablePw.value });
			await tenants.refresh();
			disablePw.value = "";
			toast.add({ title: "Encryption removed", color: "info", icon: "i-lucide-shield-off" });
		} catch (err) {
			const raw = msg(err);
			toast.add({
				title: "Could not remove encryption",
				description: /invalid password|auth/i.test(raw) ? "The password is incorrect." : raw,
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			busy.value = false;
		}
	};

	// ---- Lock now ----
	const onLockNow = async () => {
		const id = tenants.activeTenantId;
		if (!id || busy.value) return;
		busy.value = true;
		try {
			// Close the pool so the lock's re-encrypt + rename + delete succeed,
			// then hard-reload: the middleware routes the now-locked business to
			// /unlock.
			await resetDbCache();
			await invoke("lock_tenant", { id });
			window.location.assign("/");
		} catch (err) {
			busy.value = false;
			toast.add({ title: "Could not lock", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};
</script>
```

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: passes (auto-fixes formatting). If eslint flags any unused import or NuxtUI prop, resolve it. If `UModal` rejects `:dismissible` / `:close` props on this NuxtUI version, check the installed `@nuxt/ui` modal API and use the equivalent (the intent: a modal the user can't dismiss without clicking Done).

- [ ] **Step 3: Commit**

```bash
git add app/pages/settings/security.vue
git commit -m "feat(security): /settings/security page (enable/change-pw/lock/disable + recovery key)"
```

---

### Task 3: Manual end-to-end smoke test

This validates Phase 2c **and** the deferred Phase 2a/2b integration — the full user-facing encryption flow. It needs the Tauri runtime (a Rust rebuild picks up the Phase-2b `core:window:allow-destroy` capability) and a real DB. Run it and record per-step results for the PR. Do NOT skip.

**Files:** none (verification only).

- [ ] **Step 1: Launch**

Run: `bun run tauri:dev`. Open (or create) a business — the demo business works well.

- [ ] **Step 2: Enable from the UI**

Sidebar → App → **Security**. Confirm it shows "Not protected". Enter a password + confirm, click **Enable encryption**. Verify:
- The recovery-key modal appears with a key; **Copy** works; **Done** is disabled until the checkbox is ticked.
- After Done, the page switches to the "Protected" state (Change password / Lock now / Remove protection cards).
- In `%APPDATA%\com.sakoram.billing\businesses\`, `<id>.db.enc` + `<id>.vault.json` now exist, and the app still works (navigate to Invoices etc. — data is intact).

- [ ] **Step 3: Lock-on-close + unlock gate**

Close the app window. Confirm `<id>.db` is gone (sealed). Relaunch `bun run tauri:dev`: the app should land on **/unlock**, not the dashboard and not an empty book. Enter a wrong password → inline error. Enter the right password → dashboard loads with all data intact.

- [ ] **Step 4: Recovery key**

Close + relaunch → on /unlock click "Use recovery key instead", paste the key → unlocks.

- [ ] **Step 5: Change password**

Security page → Change password (current + new). Lock now → relaunch/unlock with the NEW password (old one should fail). Confirm the recovery key from Step 2 still works too.

- [ ] **Step 6: Lock now + switch**

Security → **Lock now** → confirm you land on /unlock. Unlock. Then switch to another (unencrypted) business via the sidebar switcher → confirm the encrypted one re-locks (`<id>.db` disappears) and the other opens normally.

- [ ] **Step 7: Disable**

Unlock the encrypted business → Security → **Remove protection** (enter password). Confirm it returns to "Not protected", `<id>.db.enc` + `<id>.vault.json` are gone, `<id>.db` exists plaintext, and after a reload the app opens straight to the dashboard (no unlock prompt).

- [ ] **Step 8: Record**

No code commit. Capture pass/fail per step for the PR description.

---

## Self-review notes

- **Spec coverage (§7 UI):** enable + set password (Task 2 enable card) ✓; one-time recovery-key display with copy + acknowledge gate (Task 2 modal) ✓; change password (Task 2) ✓; disable, requires current password (Task 2) ✓; lock now (Task 2) ✓; reachable Security area in the App settings group (Task 1) ✓.
- **Integration correctness:** enable closes the pool before encrypting (WAL checkpoint + Windows file release) then re-materialises via `unlock` ✓; change-password/disable run with the pool open (they don't rename `.db`) ✓; lock-now closes the pool before `lock_tenant` ✓; `refresh()` after enable/disable updates the `encrypted` flag without disturbing the open DB ✓.
- **No Rust changes** — reuses Phase-2a commands + Phase-2b store `unlock()`. Frontend-only.
- **Testing posture:** no pure unit-testable logic in this phase (it's UI + Tauri integration); verified by `bun run lint` + the Task 3 manual smoke test, which is also the deferred end-to-end verification of 2a/2b. Consistent with how the prior integration layers were verified.
- **Placeholder scan:** none — the page is complete; Task 3 is an exact manual procedure (the only way to validate Tauri-runtime UI).
- **Landmines respected:** single root node + comment inside it; `UModal` `#body`/`#footer` slots; Tauri camelCase command args.

## After this phase

This completes the **encryption MVP**: crypto core (1) + vault backend (2a) + unlock flow (2b) + Security UI (2c). The feature is fully usable from the UI with no devtools. Remaining (Phase 3, separate): **encrypted export bundles** (spec §8.2 — currently an export of an encrypted business writes a plaintext zip, which must be addressed before real use), plus optional idle-lock. The branch is a natural candidate to become the encryption PR after the Task 3 smoke test passes.

## Versioning / PR

Per project rules, the eventual PR bumps the version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (minor). Do that only when opening the PR. Do not open the PR until the user asks.
