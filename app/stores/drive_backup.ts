// Google Drive backup & restore — thin bridge to src-tauri/src/drive/.
//
// Per-INSTALL state (one Google account per machine), not per-tenant: it is
// not reset by the tenant-switch hard reload in any way that matters, and it
// must work on the welcome screen where no business is open.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openInBrowser } from "@tauri-apps/plugin-shell";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { createLoadOnce } from "~/lib/load-once";

export interface DriveStatus {
	configured: boolean
	connected: boolean
	email: string | null
	name: string | null
	/** `data:` URL — fetched once by Rust, so rendering it needs no network. */
	photo: string | null
	reminder_days: number | null
	last_backups: Record<string, string>
}

export interface DriveProgress {
	stage: "snapshot" | "attachments" | "upload" | "cleanup" | "download"
	done: number
	total: number
}

export interface BackupOutcome {
	snapshot: string
	attachments_total: number
	attachments_uploaded: number
	skipped: string[]
	pruned_snapshots: number
}

export interface RemoteBusiness {
	key: string
	name: string
}

export interface SnapshotInfo {
	stem: string
	created_at: string
	device: string
	size: number
}

export interface RestoreResult {
	tenant: { id: string, name: string, path: string, encrypted: boolean }
	attachments_total: number
	attachments_restored: number
	failed: string[]
}

export const useDriveBackupStore = defineStore("drive_backup", () => {
	const status = ref<DriveStatus | null>(null);
	const busy = ref(false);
	const connecting = ref(false);
	const progress = ref<DriveProgress | null>(null);
	/** "Later" on the reminder banner — hidden for this app session only. */
	const reminderDismissed = ref(false);

	const loaded = computed(() => status.value !== null);

	let listening = false;
	const startListening = async () => {
		if (listening) return;
		listening = true;
		await listen<DriveProgress>("drive-progress", (event) => {
			progress.value = event.payload;
		});
	};

	const refresh = async () => {
		await startListening();
		status.value = await invoke<DriveStatus>("drive_status");
	};

	const ensureLoaded = createLoadOnce(refresh, () => status.value !== null);

	// The sign-in happens in the system browser, out of our sight, so an attempt
	// can be abandoned (tab closed) or restarted at any time. Each call is
	// numbered: only the NEWEST attempt may switch `connecting` off, otherwise a
	// superseded attempt rejecting late would kill the spinner of the live one.
	let connectAttempt = 0;

	const connect = async () => {
		const attempt = ++connectAttempt;
		connecting.value = true;
		try {
			// Also ends any previous in-flight attempt (it rejects DRIVE_CANCELLED).
			const url = await invoke<string>("drive_connect_begin");
			await openInBrowser(url);
			status.value = await invoke<DriveStatus>("drive_connect_finish");
		} finally {
			if (attempt === connectAttempt) connecting.value = false;
		}
	};

	/** Stop waiting for the browser. The pending `connect()` rejects DRIVE_CANCELLED. */
	const cancelConnect = async () => {
		connectAttempt++;
		connecting.value = false;
		await invoke("drive_connect_cancel");
	};

	/** Re-read who is connected (name / email / photo) from Google. */
	const refreshAccount = async () => {
		status.value = await invoke<DriveStatus>("drive_refresh_account");
	};

	const disconnect = async () => {
		status.value = await invoke<DriveStatus>("drive_disconnect");
	};

	const setReminderDays = async (days: number | null) => {
		status.value = await invoke<DriveStatus>("drive_set_reminder_days", { days });
	};

	/** Runs `op` with busy/progress bookkeeping; always refreshes status after. */
	const run = async <T>(op: () => Promise<T>): Promise<T> => {
		busy.value = true;
		progress.value = null;
		try {
			return await op();
		} finally {
			busy.value = false;
			progress.value = null;
			await refresh().catch(() => { /* status refresh is best-effort */ });
		}
	};

	const backupNow = (tenantId: string) =>
		run(() => invoke<BackupOutcome>("drive_backup_now", { tenantId }));

	const restore = (key: string, stem: string, parentDir: string) =>
		run(() => invoke<RestoreResult>("drive_restore", { key, stem, parentDir }));

	const cancel = () => invoke("drive_cancel");
	const listBusinesses = () => invoke<RemoteBusiness[]>("drive_list_businesses");
	const listSnapshots = (key: string) => invoke<SnapshotInfo[]>("drive_list_snapshots", { key });

	/** Backups of a REGISTERED business (Rust derives its Drive key), newest first. */
	const listBackups = (tenantId: string) => invoke<SnapshotInfo[]>("drive_list_backups", { tenantId });

	/** Trash one older backup; resolves to the refreshed list. The newest is refused. */
	const deleteBackup = (tenantId: string, stem: string) =>
		invoke<SnapshotInfo[]>("drive_delete_backup", { tenantId, stem });

	const lastBackupFor = (tenantId: string | null | undefined): string | null =>
		(tenantId && status.value?.last_backups[tenantId]) || null;

	return {
		status,
		loaded,
		busy,
		connecting,
		progress,
		reminderDismissed,
		ensureLoaded,
		refresh,
		connect,
		cancelConnect,
		refreshAccount,
		disconnect,
		setReminderDays,
		backupNow,
		restore,
		cancel,
		listBusinesses,
		listSnapshots,
		listBackups,
		deleteBackup,
		lastBackupFor
	};
});
