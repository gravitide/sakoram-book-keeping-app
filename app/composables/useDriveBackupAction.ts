// The one "Back up now" action shared by every surface that offers it —
// the titlebar button, the reminder banner and the Settings → Businesses
// card. Owns the availability rule + the success / failure toasts so the
// three can't drift (the banner used to print a thinner toast than the
// card). The progress modal is store-driven and mounted once in the
// default layout, so callers only need to await `backupNow()`.

import { isBackupDue } from "~/lib/backup-reminder";
import { describeDriveError } from "~/lib/drive-errors";
import { useDriveBackupStore } from "~/stores/drive_backup";
import { useTenantsStore } from "~/stores/tenants";

export function useDriveBackupAction() {
	const drive = useDriveBackupStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	const lastBackup = computed(() => drive.lastBackupFor(tenants.activeTenantId));

	// A backup is possible only for someone who has opted in (connected)
	// with a business that is open and, if encrypted, unlocked.
	const available = computed(() =>
		!!drive.status?.configured
		&& drive.status.connected
		&& !!tenants.activeTenantId
		&& !tenants.activeLocked
	);

	// Older than the reminder interval (or never backed up). Only
	// meaningful while `available`.
	const due = computed(() =>
		available.value && isBackupDue(lastBackup.value, drive.status?.reminder_days ?? null, new Date())
	);

	const backupNow = async (): Promise<void> => {
		const id = tenants.activeTenantId;
		if (!id || drive.busy) return;
		try {
			const out = await drive.backupNow(id);
			const skipped = out.skipped.length > 0 ? ` ${out.skipped.length} attachment(s) could not be read and were skipped.` : "";
			toast.add({
				title: "Backed up to Google Drive",
				description: `${out.attachments_uploaded} new attachment(s) uploaded, ${out.attachments_total} in total.${skipped}`,
				color: out.skipped.length > 0 ? "warning" : "success",
				icon: "i-lucide-check"
			});
		} catch (err) {
			const info = describeDriveError(err);
			if (info.cancelled) return;
			toast.add({ title: info.title, description: info.description, color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	return { drive, tenants, lastBackup, available, due, backupNow };
}
