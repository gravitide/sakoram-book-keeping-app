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
				How <span class="font-medium">{{ tenants.activeTenant?.name }}</span> is protected — the
				database password that locks it on this computer, and the separate password that locks
				its generated PDFs. These are two different things, set independently.
			</p>
		</header>

		<div class="space-y-10 max-w-2xl mx-auto">
			<!-- ============ Database encryption ============ -->
			<section id="encryption" class="scroll-mt-6 space-y-4">
				<div>
					<h2 class="text-sm font-semibold flex items-center gap-2">
						<UIcon name="i-lucide-database" class="size-4 text-(--ui-text-muted)" />
						Database encryption
					</h2>
					<p class="text-xs text-(--ui-text-muted) mt-0.5">
						Encrypts this business's database file at rest. Opening the business requires this
						password — protects your data if this computer's files are copied or stolen.
					</p>
				</div>

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
			</section>

			<!-- ============ PDF protection ============ -->
			<section id="pdf-protection" class="scroll-mt-6 space-y-4">
				<div>
					<h2 class="text-sm font-semibold flex items-center gap-2">
						<UIcon name="i-lucide-file-text" class="size-4 text-(--ui-text-muted)" />
						PDF protection
					</h2>
					<p class="text-xs text-(--ui-text-muted) mt-0.5">
						A separate owner password applied to generated PDFs. Protected documents still open
						without a prompt, but editing, copying, and annotating are blocked — printing stays
						allowed. <span class="font-medium">This is unrelated to the database password above.</span>
					</p>
				</div>

				<UCard>
					<div class="space-y-4">
						<UFormField label="Owner password" help="Leave blank to disable. Keep it safe — it's needed later to remove restrictions.">
							<PasswordInput v-model="pdfForm.password" placeholder="No protection" class="max-w-md" />
						</UFormField>

						<div>
							<div class="text-xs text-(--ui-text-muted) mb-2">
								Protect these document types:
							</div>
							<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
								<UCheckbox v-model="pdfForm.quote" label="Quotes" />
								<UCheckbox v-model="pdfForm.invoice" label="Invoices" />
								<UCheckbox v-model="pdfForm.bill" label="Bills" />
								<UCheckbox v-model="pdfForm.voucher" label="Vouchers" />
								<UCheckbox v-model="pdfForm.payslip" label="Payslips" />
							</div>
						</div>

						<div
							v-if="pdfGapWarning"
							class="flex items-start gap-2 p-3 rounded-md border border-(--ui-warning)/40 bg-(--ui-warning)/5 text-sm"
						>
							<UIcon name="i-lucide-triangle-alert" class="size-4 mt-0.5 text-(--ui-warning) shrink-0" />
							<span class="text-(--ui-text-muted)">
								You've selected document types to protect but haven't set a password — nothing will be encrypted until you enter one above.
							</span>
						</div>

						<div class="flex justify-end">
							<UButton
								icon="i-lucide-save"
								:loading="settings.saving"
								:disabled="!pdfDirty"
								@click="savePdfProtection"
							>
								Save
							</UButton>
						</div>
					</div>
				</UCard>
			</section>
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
// Security settings for the active business. Two independent areas:
//   - #encryption: at-rest database encryption (enable / change-password /
//     lock / disable), with a one-time recovery-key display. Reachable only
//     when the business is unlocked (the access guard enforces that).
//   - #pdf-protection: owner-password protection for generated PDFs (moved
//     here from /settings/pdf so all of a business's security lives together).
// The two passwords are unrelated.

	import { invoke } from "@tauri-apps/api/core";
	import { resetDbCache } from "~/lib/db";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ title: "Security" });

	const tenants = useTenantsStore();
	const settings = useSettingsStore();
	const toast = useToast();

	await tenants.ensureLoaded();
	await settings.ensureLoaded();

	const isEncrypted = computed(() => !!tenants.activeTenant?.encrypted);
	const busy = ref(false);
	const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

	// ---- Enable (database encryption) ----
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
			// to encrypt. enable_tenant_encryption writes the blob + vault.json and
			// KEEPS the working db in place, so the business stays usable immediately
			// — no re-unlock step. The working db is sealed on the next lock.
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

	// ---- PDF protection (owner password on generated PDFs) ----
	// Moved here from /settings/pdf. Fields live on company_settings; the five
	// per-type flags are 0/1 INTEGERs modelled as booleans on the form.
	const pdfForm = reactive({
		password: "",
		quote: false,
		invoice: false,
		bill: false,
		voucher: false,
		payslip: false
	});

	const hydratePdf = () => {
		const s = settings.settings;
		if (!s) return;
		pdfForm.password = s.pdf_protect_password ?? "";
		pdfForm.quote = !!s.pdf_protect_quote;
		pdfForm.invoice = !!s.pdf_protect_invoice;
		pdfForm.bill = !!s.pdf_protect_bill;
		pdfForm.voucher = !!s.pdf_protect_voucher;
		pdfForm.payslip = !!s.pdf_protect_payslip;
	};
	hydratePdf();

	const pdfSnapshot = computed(() => JSON.stringify(pdfForm));
	const pdfBaseline = ref(pdfSnapshot.value);
	const pdfDirty = computed(() => pdfSnapshot.value !== pdfBaseline.value);

	const pdfGapWarning = computed(() =>
		!pdfForm.password.trim()
		&& (pdfForm.quote || pdfForm.invoice || pdfForm.bill || pdfForm.voucher || pdfForm.payslip)
	);

	const savePdfProtection = async () => {
		try {
			await settings.save({
				pdf_protect_password: pdfForm.password.trim() || null,
				pdf_protect_quote: pdfForm.quote ? 1 : 0,
				pdf_protect_invoice: pdfForm.invoice ? 1 : 0,
				pdf_protect_bill: pdfForm.bill ? 1 : 0,
				pdf_protect_voucher: pdfForm.voucher ? 1 : 0,
				pdf_protect_payslip: pdfForm.payslip ? 1 : 0
			});
			pdfBaseline.value = pdfSnapshot.value;
			toast.add({ title: "PDF protection saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Save failed", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};
</script>
