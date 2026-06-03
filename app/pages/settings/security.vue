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
						<PasswordInput v-model="enablePw" placeholder="Choose a strong password" :disabled="busy" />
					</UFormField>
					<UFormField label="Confirm password" required :error="enableMismatch ? 'Passwords don\'t match' : undefined">
						<PasswordInput
							v-model="enablePw2"
							placeholder="Re-enter the password"
							:disabled="busy"
							@enter="onEnable"
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
							<PasswordInput v-model="cpOld" :disabled="busy" />
						</UFormField>
						<UFormField label="New password" required>
							<PasswordInput v-model="cpNew" :disabled="busy" />
						</UFormField>
						<UFormField label="Confirm new password" required :error="cpMismatch ? 'Passwords don\'t match' : undefined">
							<PasswordInput v-model="cpNew2" :disabled="busy" @enter="onChangePassword" />
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
							<PasswordInput v-model="disablePw" :disabled="busy" @enter="onDisable" />
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
					<UButton :disabled="!savedAck" icon="i-lucide-check" @click="onRecoveryDone">
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
			// file and releases the OS handle so Rust gets a complete, flushed db
			// to encrypt (Windows blocks encrypting an open file). enable_tenant_encryption
			// writes the blob + vault.json and KEEPS the working db in place, so the
			// business remains usable immediately — no re-unlock step needed.
			// The working db is sealed on the next lock (window close or Lock Now).
			await resetDbCache();
			const key = await invoke<string>("enable_tenant_encryption", { id, password: enablePw.value });
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
			setTimeout(() => {
				copied.value = false;
			}, 2000);
		} catch {
			toast.add({ title: "Couldn't copy — select the key and copy it manually", color: "warning", icon: "i-lucide-circle-alert" });
		}
	};

	// Hard-reload after the user acknowledges the recovery key. Consistent with
	// the lock/tenant-switch pattern: wipes all in-memory store state and lets
	// the middleware re-hydrate from the now-encrypted tenant cleanly.
	const onRecoveryDone = () => {
		window.location.assign("/settings/security");
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
			disablePw.value = "";
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
