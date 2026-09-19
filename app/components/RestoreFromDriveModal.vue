<template>
	<UModal v-model:open="open" title="Restore from Google Drive" :dismissible="!drive.busy" :close="!drive.busy">
		<template #body>
			<div class="space-y-4">
				<!-- Step: connect -->
				<div v-if="!drive.status?.connected" class="text-center py-4">
					<p class="text-sm text-(--ui-text-muted) mb-3 select-none">
						Sign in with the Google account you backed up to.
					</p>
					<DriveConnectButton center @connected="loadBusinesses" />
				</div>

				<!-- Step: working -->
				<div v-else-if="drive.busy" class="space-y-3 py-2 select-none">
					<div class="text-sm">
						{{ progressLabel }}
					</div>
					<UProgress :model-value="progressPercent" :max="100" />
					<UButton color="neutral" variant="outline" size="sm" @click="drive.cancel()">
						Cancel
					</UButton>
				</div>

				<!-- Step: result -->
				<div v-else-if="result" class="space-y-3">
					<UAlert
						:color="result.failed.length > 0 ? 'warning' : 'success'"
						variant="subtle"
						icon="i-lucide-check"
						:title="`${result.tenant.name} restored`"
						:description="`${result.attachments_restored} of ${result.attachments_total} attachments restored.`"
					/>
					<div v-if="result.failed.length > 0" class="text-xs">
						<p class="text-(--ui-text-muted) mb-1">
							These attachments could not be restored. Your books are complete; only these files are missing:
						</p>
						<ul class="max-h-32 overflow-auto rounded border border-(--ui-border) p-2 font-mono select-text">
							<li v-for="f in result.failed" :key="f">
								{{ f }}
							</li>
						</ul>
					</div>
				</div>

				<!-- Step: pick -->
				<div v-else class="space-y-4">
					<div v-if="loading" class="text-sm text-(--ui-text-muted) py-4 text-center">
						Looking in your Google Drive…
					</div>
					<p v-else-if="businesses.length === 0" class="text-sm text-(--ui-text-muted) py-4 text-center">
						No Sakoram backups were found in this Google account.
					</p>
					<template v-else>
						<UFormField label="Business">
							<USelect v-model="selectedKey" :items="businessItems" placeholder="Choose a business" class="w-full" />
						</UFormField>
						<UFormField v-if="selectedKey" label="Backup">
							<USelect v-model="selectedStem" :items="snapshotItems" placeholder="Choose a backup" :loading="loadingSnapshots" class="w-full" />
						</UFormField>
						<p class="text-xs text-(--ui-text-muted) select-none">
							The business is restored into a NEW folder you choose next. Nothing already on this computer is overwritten.
						</p>
					</template>
				</div>
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton v-if="!result" color="neutral" variant="outline" :disabled="drive.busy" @click="open = false">
					Cancel
				</UButton>
				<UButton v-if="result" icon="i-lucide-arrow-right" @click="onOpenRestored">
					Open business
				</UButton>
				<UButton v-else icon="i-lucide-cloud-download" :disabled="!selectedKey || !selectedStem || drive.busy" @click="onRestore">
					Restore…
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import type { RemoteBusiness, RestoreResult, SnapshotInfo } from "~/stores/drive_backup";
	import { open as openDialog } from "@tauri-apps/plugin-dialog";
	import { describeDriveError } from "~/lib/drive-errors";
	import { formatBytes } from "~/lib/format-bytes";
	import { useDriveBackupStore } from "~/stores/drive_backup";
	import { useTenantsStore } from "~/stores/tenants";

	const open = defineModel<boolean>("open", { required: true });

	const drive = useDriveBackupStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	const businesses = ref<RemoteBusiness[]>([]);
	const snapshots = ref<SnapshotInfo[]>([]);
	const selectedKey = ref<string | undefined>();
	const selectedStem = ref<string | undefined>();
	const loading = ref(false);
	const loadingSnapshots = ref(false);
	const result = ref<RestoreResult | null>(null);

	const businessItems = computed(() => businesses.value.map((b) => ({ label: b.name, value: b.key })));
	const snapshotItems = computed(() => snapshots.value.map((s) => ({
		label: `${new Date(s.created_at).toLocaleString()} · ${s.device} · ${formatBytes(s.size)}`,
		value: s.stem
	})));

	const progressLabel = computed(() => {
		const p = drive.progress;
		if (!p || p.stage === "download") return "Downloading the snapshot…";
		return `Restoring attachments · ${p.done} / ${p.total}`;
	});
	const progressPercent = computed<number | null>(() => {
		const p = drive.progress;
		if (!p || p.stage !== "attachments" || p.total === 0) return null;
		return Math.round((p.done / p.total) * 100);
	});

	const fail = (err: unknown) => {
		const info = describeDriveError(err);
		if (info.cancelled) return;
		toast.add({ title: info.title, description: info.description, color: "error", icon: "i-lucide-circle-alert" });
	};

	const loadBusinesses = async () => {
		loading.value = true;
		try {
			businesses.value = await drive.listBusinesses();
		} catch (err) {
			fail(err);
			await drive.refresh(); // a revoked sign-in flips the modal back to Connect
		} finally {
			loading.value = false;
		}
	};

	// The welcome page is kept alive, so this modal instance is reused: reset
	// everything each time it opens instead of trusting a fresh mount.
	watch(open, async (isOpen) => {
		if (!isOpen) {
			if (drive.connecting) void drive.cancelConnect().catch(() => { /* nothing in flight */ });
			return;
		}
		businesses.value = [];
		snapshots.value = [];
		selectedKey.value = undefined;
		selectedStem.value = undefined;
		result.value = null;
		await drive.ensureLoaded();
		if (drive.status?.connected) await loadBusinesses();
	});

	watch(selectedKey, async (key) => {
		snapshots.value = [];
		selectedStem.value = undefined;
		if (!key) return;
		loadingSnapshots.value = true;
		try {
			snapshots.value = await drive.listSnapshots(key);
			selectedStem.value = snapshots.value[0]?.stem; // newest first
		} catch (err) {
			fail(err);
		} finally {
			loadingSnapshots.value = false;
		}
	});

	const onRestore = async () => {
		if (!selectedKey.value || !selectedStem.value) return;
		const picked = await openDialog({ directory: true, title: "Choose where to put the restored business" });
		const parentDir = typeof picked === "string" ? picked : null;
		if (!parentDir) return;
		try {
			result.value = await drive.restore(selectedKey.value, selectedStem.value, parentDir);
			await tenants.refresh();
		} catch (err) {
			fail(err);
		}
	};

	const onOpenRestored = async () => {
		if (!result.value) return;
		try {
			await tenants.activate(result.value.tenant.id);
			window.location.assign("/");
		} catch (err) {
			fail(err);
		}
	};
</script>
