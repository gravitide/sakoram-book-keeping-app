<template>
	<div>
		<!-- The sign-in happens in the system browser, where we can't see it: the
			tab may be closed, or Google may show an error page that never redirects
			back. So the waiting state must always offer a way out — a bare loading
			spinner here left the button dead for the full 5-minute consent timeout. -->
		<UButton v-if="!drive.connecting" icon="i-lucide-log-in" @click="onConnect">
			Connect Google Drive
		</UButton>
		<div v-else class="flex items-center gap-x-3 gap-y-2 flex-wrap" :class="center ? 'justify-center' : ''">
			<span class="inline-flex items-center gap-2 text-sm text-(--ui-text-muted) select-none">
				<UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
				Waiting for you to sign in to Google in your browser…
			</span>
			<UButton size="sm" color="neutral" variant="outline" @click="onCancel">
				Cancel
			</UButton>
			<UButton size="sm" variant="ghost" icon="i-lucide-external-link" @click="onConnect">
				Open sign-in again
			</UButton>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { describeDriveError } from "~/lib/drive-errors";
	import { useDriveBackupStore } from "~/stores/drive_backup";

	defineProps<{ center?: boolean }>();
	const emit = defineEmits<{ connected: [] }>();

	const drive = useDriveBackupStore();
	const toast = useToast();

	const onConnect = async () => {
		try {
			await drive.connect();
			emit("connected");
		} catch (err) {
			// Cancelled covers both the Cancel button and an attempt superseded
			// by "Open sign-in again" — neither is an error worth a toast.
			const info = describeDriveError(err, "Couldn't connect Google Drive");
			if (info.cancelled) return;
			toast.add({ title: info.title, description: info.description, color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	const onCancel = () => drive.cancelConnect().catch(() => { /* nothing in flight */ });
</script>
