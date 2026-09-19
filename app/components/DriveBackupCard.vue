<template>
	<div v-if="drive.status?.configured" id="google-drive" class="mt-8 scroll-mt-4">
		<SectionCard title="Google Drive backup" icon="i-lucide-cloud-upload">
			<p class="text-sm text-(--ui-text-muted) select-none">
				Keep a copy of your books in <strong>your own</strong> Google Drive, so a dead PC isn't the end of them.
				Backups run only when you press the button — Sakoram never uploads in the background.
			</p>

			<div v-if="!drive.status.connected" class="mt-4">
				<DriveConnectButton @connected="onConnected" />
				<p class="text-xs text-(--ui-text-muted) mt-2 select-none">
					Your browser opens to sign in. Sakoram can only see files it created itself — not the rest of your Drive.
				</p>
			</div>

			<div v-else class="mt-4 space-y-5">
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<div class="flex items-center gap-3 min-w-0">
						<!-- `alt` doubles as the initials fallback when there is no photo. -->
						<UAvatar :src="drive.status.photo ?? undefined" :alt="accountTitle" icon="i-lucide-user-round" size="lg" />
						<div class="min-w-0">
							<div class="text-xs text-(--ui-text-muted) select-none">
								Connected to Google Drive as
							</div>
							<div class="font-medium truncate">
								{{ accountTitle }}
							</div>
							<div v-if="accountSubtitle" class="text-xs text-(--ui-text-muted) truncate">
								{{ accountSubtitle }}
							</div>
						</div>
					</div>
					<UButton color="neutral" variant="outline" size="sm" icon="i-lucide-log-out" @click="onDisconnect">
						Disconnect
					</UButton>
				</div>

				<!-- The open business — the only one a backup can act on: it needs
					the live database and, if encrypted, the unlocked session key. -->
				<div>
					<div class="flex items-center justify-between gap-3 flex-wrap rounded-md border border-(--ui-border) bg-(--ui-bg-elevated)/40 px-4 py-3">
						<div class="min-w-0">
							<div class="font-medium truncate">
								{{ tenants.activeTenant?.name }}
							</div>
							<div class="text-xs text-(--ui-text-muted)">
								{{ lastBackupLabel }}
							</div>
						</div>
						<UButton icon="i-lucide-cloud-upload" :disabled="!tenants.activeTenantId || tenants.activeLocked || drive.busy" @click="onBackup">
							Back up now
						</UButton>
					</div>
					<p class="flex items-start gap-1.5 text-xs text-(--ui-text-muted) mt-2 select-none">
						<UIcon name="i-lucide-info" class="size-3.5 mt-px shrink-0" />
						<span>A backup covers the business that is open. To back up another one, open it first.</span>
					</p>
				</div>

				<div>
					<div class="flex items-center justify-between gap-3 mb-2">
						<h3 class="text-sm font-medium select-none">
							Backups on Google Drive
						</h3>
						<UButton
							size="xs"
							color="neutral"
							variant="ghost"
							icon="i-lucide-refresh-cw"
							:loading="loadingBackups"
							title="Check Google Drive again"
							@click="loadBackups"
						>
							Refresh
						</UButton>
					</div>

					<div v-if="backupsError" class="flex items-center justify-between gap-3 flex-wrap rounded-md border border-(--ui-border) px-4 py-3 text-sm">
						<span class="text-(--ui-text-muted)">{{ backupsError }}</span>
						<UButton size="xs" color="neutral" variant="outline" @click="loadBackups">
							Try again
						</UButton>
					</div>
					<div v-else-if="backups === null" class="rounded-md border border-(--ui-border) px-4 py-3 text-sm text-(--ui-text-muted) select-none">
						Checking Google Drive…
					</div>
					<div v-else-if="backups.length === 0" class="rounded-md border border-dashed border-(--ui-border) px-4 py-3 text-sm text-(--ui-text-muted) select-none">
						No backups of this business on Google Drive yet.
					</div>
					<ul v-else class="rounded-md border border-(--ui-border) divide-y divide-(--ui-border)">
						<li v-for="(b, i) in backups" :key="b.stem" class="flex items-center justify-between gap-3 px-4 py-2.5 min-h-12">
							<div class="min-w-0">
								<div class="flex items-center gap-2 text-sm">
									<span class="tabular-nums">{{ formatWhen(b.created_at) }}</span>
									<UBadge v-if="i === 0" color="success" variant="subtle" size="sm">
										Latest
									</UBadge>
								</div>
								<div class="text-xs text-(--ui-text-muted) truncate">
									from {{ b.device }} · {{ formatBytes(b.size) }}
								</div>
							</div>
							<!-- The latest backup is the one a restore would use — it is
								never deletable here (the command refuses it too). -->
							<UButton
								v-if="i > 0"
								size="xs"
								color="error"
								variant="ghost"
								icon="i-lucide-trash-2"
								:loading="deletingStem === b.stem"
								:disabled="drive.busy || deletingStem !== null"
								title="Delete this backup"
								@click="askDelete(b)"
							/>
						</li>
					</ul>
					<p class="text-xs text-(--ui-text-muted) mt-2 select-none">
						The 10 newest are kept automatically; you can delete older ones yourself. Database encryption protects the
						database in a backup too — but attachments (scans, photos) are stored on Drive as ordinary files, exactly
						as they are on this computer.
					</p>
				</div>

				<UFormField label="Remind me to back up" class="max-w-xs">
					<USelect :model-value="reminderValue" :items="reminderItems" class="w-full" @update:model-value="onReminderChange" />
				</UFormField>
			</div>
		</SectionCard>

		<UModal v-model:open="confirmOpen" title="Delete this backup?" :dismissible="deletingStem === null" :close="deletingStem === null">
			<template #body>
				<p class="text-sm">
					The backup from <strong>{{ pendingDelete ? formatWhen(pendingDelete.created_at) : "" }}</strong>
					({{ pendingDelete?.device }}) will be removed from Google Drive, along with any attachments only it still needed.
				</p>
				<p class="text-xs text-(--ui-text-muted) mt-2">
					It moves to your Google Drive trash, where Google keeps it for 30 days. Your latest backup is not affected.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" :disabled="deletingStem !== null" @click="confirmOpen = false">
						Cancel
					</UButton>
					<UButton color="error" icon="i-lucide-trash-2" :loading="deletingStem !== null" @click="confirmDelete">
						Delete backup
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
	import type { SnapshotInfo } from "~/stores/drive_backup";
	import { backupAgeLabel, REMINDER_OPTIONS } from "~/lib/backup-reminder";
	import { describeDriveError } from "~/lib/drive-errors";
	import { formatBytes } from "~/lib/format-bytes";
	import { useDriveBackupStore } from "~/stores/drive_backup";
	import { useTenantsStore } from "~/stores/tenants";

	const drive = useDriveBackupStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	// ---- Who is connected ----
	// Google may withhold the email from a drive.file-only app, so the name can
	// be all we get — and either can be missing.
	const accountTitle = computed(() => drive.status?.name ?? drive.status?.email ?? "your Google account");
	const accountSubtitle = computed(() => (drive.status?.name && drive.status.email ? drive.status.email : null));

	// Connected but nothing to show = the lookup failed at connect time (or the
	// connect predates it). Try once per mount; it is cosmetic, so stay quiet.
	const healAccount = async () => {
		const s = drive.status;
		if (!s?.connected || s.name || s.email) return;
		await drive.refreshAccount().catch((err) => console.warn("[drive] account lookup failed:", err));
	};

	// ---- Backups of the open business, as they exist on Drive ----
	// `null` = not loaded yet (distinct from "loaded, none found").
	const backups = ref<SnapshotInfo[] | null>(null);
	const backupsError = ref<string | null>(null);
	const loadingBackups = ref(false);

	const loadBackups = async () => {
		const id = tenants.activeTenantId;
		if (!id || !drive.status?.connected || loadingBackups.value) return;
		loadingBackups.value = true;
		backupsError.value = null;
		try {
			backups.value = await drive.listBackups(id);
		} catch (err) {
			// Inline, not a toast: this runs on every visit to the page, and being
			// offline is an ordinary state for this app, not an event.
			const info = describeDriveError(err);
			backupsError.value = info.reconnect ? info.description : `${info.title}.`;
			if (info.reconnect) await drive.refresh().catch(() => { /* best-effort */ });
		} finally {
			loadingBackups.value = false;
		}
	};

	// Re-evaluated on every activation so "today / yesterday" can't go stale
	// inside the kept-alive settings page; the Drive list is re-read too, since
	// another machine may have backed up in the meantime.
	const now = ref(new Date());
	onMounted(async () => {
		await drive.ensureLoaded();
		void healAccount();
		await loadBackups();
	});
	onActivated(async () => {
		now.value = new Date();
		await drive.refresh().catch(() => { /* best-effort */ });
		await loadBackups();
	});

	// Connecting here, or a backup started from the reminder banner, both change
	// what is on Drive without going through this component's own handlers.
	watch(() => drive.status?.connected, (connected) => {
		if (connected) void loadBackups();
		else backups.value = null;
	});
	watch(() => drive.busy, (busy, wasBusy) => {
		if (wasBusy && !busy) {
			now.value = new Date();
			void loadBackups();
		}
	});

	// Drive is the truth across machines; backup.json only knows THIS machine.
	const lastBackupLabel = computed(() => {
		const newestOnDrive = backups.value?.[0]?.created_at ?? null;
		return backupAgeLabel(newestOnDrive ?? drive.lastBackupFor(tenants.activeTenantId), now.value);
	});

	const formatWhen = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

	// USelect can't carry a null value — "off" travels as 0.
	const reminderItems = REMINDER_OPTIONS.map((o) => ({ label: o.label, value: o.value ?? 0 }));
	const reminderValue = computed(() => drive.status?.reminder_days ?? 0);
	const onReminderChange = (value: number) => drive.setReminderDays(value === 0 ? null : value);

	const fail = (err: unknown) => {
		const info = describeDriveError(err);
		if (info.cancelled) return;
		toast.add({ title: info.title, description: info.description, color: "error", icon: "i-lucide-circle-alert" });
	};

	const onConnected = () => {
		toast.add({ title: "Google Drive connected", color: "success", icon: "i-lucide-check" });
	};

	const onDisconnect = async () => {
		try {
			await drive.disconnect();
			toast.add({ title: "Google Drive disconnected", description: "Backups already on your Drive were left untouched.", color: "info", icon: "i-lucide-log-out" });
		} catch (err) {
			fail(err);
		}
	};

	const onBackup = async () => {
		const id = tenants.activeTenantId;
		if (!id) return;
		try {
			const out = await drive.backupNow(id); // the busy watcher reloads the list
			const skipped = out.skipped.length > 0 ? ` ${out.skipped.length} attachment(s) could not be read and were skipped.` : "";
			toast.add({
				title: "Backed up to Google Drive",
				description: `${out.attachments_uploaded} new attachment(s) uploaded, ${out.attachments_total} in total.${skipped}`,
				color: out.skipped.length > 0 ? "warning" : "success",
				icon: "i-lucide-check"
			});
		} catch (err) {
			fail(err);
		}
	};

	// ---- Delete an older backup ----
	const confirmOpen = ref(false);
	const pendingDelete = ref<SnapshotInfo | null>(null);
	const deletingStem = ref<string | null>(null);

	const askDelete = (b: SnapshotInfo) => {
		pendingDelete.value = b;
		confirmOpen.value = true;
	};

	const confirmDelete = async () => {
		const id = tenants.activeTenantId;
		const target = pendingDelete.value;
		if (!id || !target) return;
		deletingStem.value = target.stem;
		try {
			backups.value = await drive.deleteBackup(id, target.stem);
			toast.add({ title: "Backup deleted", description: "It is in your Google Drive trash for 30 days.", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			fail(err);
		} finally {
			// Keep-alive: this component is cached, so every flag is reset here
			// rather than left for an unmount that never happens.
			// (`pendingDelete` is left alone: the modal still shows it while it
			// fades out, and the next askDelete overwrites it.)
			deletingStem.value = null;
			confirmOpen.value = false;
		}
	};
</script>
