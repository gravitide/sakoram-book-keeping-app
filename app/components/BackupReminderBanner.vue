<template>
	<div v-if="visible" class="mb-3 select-none">
		<UAlert
			color="warning"
			variant="subtle"
			icon="i-lucide-cloud-alert"
			:title="`${ageLabel} — back up ${tenants.activeTenant?.name ?? 'this business'} to Google Drive?`"
			:actions="[
				{ label: 'Back up now', icon: 'i-lucide-cloud-upload', onClick: onBackup },
				{ label: 'Later', color: 'neutral', variant: 'outline', onClick: onLater }
			]"
		/>
	</div>
</template>

<script setup lang="ts">
	import { backupAgeLabel, isBackupDue } from "~/lib/backup-reminder";
	import { describeDriveError } from "~/lib/drive-errors";
	import { useDriveBackupStore } from "~/stores/drive_backup";
	import { useTenantsStore } from "~/stores/tenants";

	const drive = useDriveBackupStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	onMounted(() => drive.ensureLoaded());

	const last = computed(() => drive.lastBackupFor(tenants.activeTenantId));
	const ageLabel = computed(() => backupAgeLabel(last.value, new Date()));

	// Only nudge someone who has opted in (connected) and can act (unlocked).
	const visible = computed(() =>
		!!drive.status?.configured
		&& drive.status.connected
		&& !!tenants.activeTenantId
		&& !tenants.activeLocked
		&& !drive.reminderDismissed
		&& !drive.busy
		&& isBackupDue(last.value, drive.status.reminder_days, new Date())
	);

	const onLater = () => {
		drive.reminderDismissed = true;
	};

	const onBackup = async () => {
		const id = tenants.activeTenantId;
		if (!id) return;
		try {
			await drive.backupNow(id);
			toast.add({ title: "Backed up to Google Drive", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			const info = describeDriveError(err);
			if (info.cancelled) return;
			toast.add({ title: info.title, description: info.description, color: "error", icon: "i-lucide-circle-alert" });
		}
	};
</script>
