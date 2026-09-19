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

			<div v-else class="mt-4 space-y-4">
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<div class="text-sm">
						<span class="text-(--ui-text-muted)">Connected as</span>
						<span class="font-medium ml-1">{{ drive.status.email ?? "your Google account" }}</span>
					</div>
					<UButton color="neutral" variant="outline" size="sm" icon="i-lucide-log-out" @click="onDisconnect">
						Disconnect
					</UButton>
				</div>

				<UFormField label="Remind me to back up" class="max-w-xs">
					<USelect :model-value="reminderValue" :items="reminderItems" class="w-full" @update:model-value="onReminderChange" />
				</UFormField>

				<div class="rounded-md border border-(--ui-border) divide-y divide-(--ui-border)">
					<div v-for="t in tenants.tenants" :key="t.id" class="flex items-center justify-between gap-3 px-3 py-2">
						<div class="min-w-0">
							<div class="font-medium truncate">
								{{ t.name }}
							</div>
							<div class="text-xs text-(--ui-text-muted)">
								{{ backupAgeLabel(drive.lastBackupFor(t.id), now) }}
							</div>
						</div>
						<UButton
							v-if="t.id === tenants.activeTenantId"
							size="sm"
							icon="i-lucide-cloud-upload"
							:disabled="tenants.activeLocked || drive.busy"
							@click="onBackup(t.id)"
						>
							Back up now
						</UButton>
						<span v-else class="text-xs text-(--ui-text-muted) select-none">Open it to back it up</span>
					</div>
				</div>

				<p class="text-xs text-(--ui-text-muted) select-none">
					The last 10 backups are kept. Database encryption protects the database in the backup too — but
					attachments (scans, photos) are stored on Drive as ordinary files, exactly as they are on this computer.
				</p>
			</div>
		</SectionCard>
	</div>
</template>

<script setup lang="ts">
	import { backupAgeLabel, REMINDER_OPTIONS } from "~/lib/backup-reminder";
	import { describeDriveError } from "~/lib/drive-errors";
	import { useDriveBackupStore } from "~/stores/drive_backup";
	import { useTenantsStore } from "~/stores/tenants";

	const drive = useDriveBackupStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	// Re-evaluated on every activation so "today / yesterday" can't go stale
	// inside the kept-alive settings page.
	const now = ref(new Date());
	onMounted(() => drive.ensureLoaded());
	onActivated(() => {
		now.value = new Date();
		void drive.refresh();
	});

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

	const onBackup = async (tenantId: string) => {
		try {
			const out = await drive.backupNow(tenantId);
			now.value = new Date();
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
</script>
