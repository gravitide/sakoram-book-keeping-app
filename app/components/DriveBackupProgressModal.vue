<template>
	<UModal :open="drive.busy" title="Google Drive" :dismissible="false" :close="false">
		<template #body>
			<div class="space-y-3 select-none">
				<div class="flex items-center gap-2 text-sm">
					<UIcon name="i-lucide-cloud-upload" class="size-4 text-(--ui-primary)" />
					<span>{{ label }}</span>
				</div>
				<UProgress :model-value="percent" :max="100" />
				<p class="text-xs text-(--ui-text-muted)">
					You can keep the app open — closing it cancels the transfer. Nothing on Google Drive is left half-written.
				</p>
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end w-full">
				<UButton color="neutral" variant="outline" :disabled="cancelling" @click="onCancel">
					Cancel
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import { useDriveBackupStore } from "~/stores/drive_backup";

	const drive = useDriveBackupStore();
	const cancelling = ref(false);

	const STAGE_LABELS: Record<string, string> = {
		snapshot: "Taking a snapshot of your books…",
		attachments: "Transferring attachments",
		upload: "Uploading the snapshot…",
		cleanup: "Tidying up old backups…",
		download: "Downloading the snapshot…"
	};

	const label = computed(() => {
		const p = drive.progress;
		if (!p) return "Connecting to Google Drive…";
		const base = STAGE_LABELS[p.stage] ?? "Working…";
		return p.stage === "attachments" && p.total > 0 ? `${base} · ${p.done} / ${p.total}` : base;
	});

	// Indeterminate (null) until a stage with a real total reports in.
	const percent = computed<number | null>(() => {
		const p = drive.progress;
		if (!p || p.stage !== "attachments" || p.total === 0) return null;
		return Math.round((p.done / p.total) * 100);
	});

	const onCancel = async () => {
		cancelling.value = true;
		await drive.cancel();
	};

	// keep-alive / re-open: a finished run must not leave Cancel disabled.
	watch(() => drive.busy, (isBusy) => {
		if (!isBusy) cancelling.value = false;
	});
</script>
