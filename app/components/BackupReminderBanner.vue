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
	import { useDriveBackupAction } from "~/composables/useDriveBackupAction";
	import { backupAgeLabel } from "~/lib/backup-reminder";

	// Availability + due + the backup itself are shared with the titlebar
	// button and the Businesses card — see useDriveBackupAction.
	const { drive, tenants, lastBackup, due, backupNow: onBackup } = useDriveBackupAction();

	onMounted(() => drive.ensureLoaded());

	const ageLabel = computed(() => backupAgeLabel(lastBackup.value, new Date()));

	const visible = computed(() => due.value && !drive.reminderDismissed && !drive.busy);

	const onLater = () => {
		drive.reminderDismissed = true;
	};
</script>
