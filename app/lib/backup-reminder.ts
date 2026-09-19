// Pure "is a Google Drive backup due?" logic. Timestamps are ISO UTC strings
// written by the Rust side (backup.json → last_backups).

const MS_PER_DAY = 86_400_000;

/** Reminder-interval choices. `null` = reminders off. */
export const REMINDER_OPTIONS: { label: string, value: number | null }[] = [
	{ label: "Every day", value: 1 },
	{ label: "Every week", value: 7 },
	{ label: "Every 2 weeks", value: 14 },
	{ label: "Every month", value: 30 },
	{ label: "Never remind me", value: null }
];

/** Whole days since the last backup; `null` if never (or unparseable). */
export function daysSinceBackup(lastIso: string | null, now: Date): number | null {
	if (!lastIso) return null;
	const then = Date.parse(lastIso);
	if (Number.isNaN(then)) return null;
	return Math.max(0, Math.floor((now.getTime() - then) / MS_PER_DAY));
}

export function isBackupDue(lastIso: string | null, reminderDays: number | null, now: Date): boolean {
	if (reminderDays === null) return false;
	const days = daysSinceBackup(lastIso, now);
	return days === null || days >= reminderDays;
}

export function backupAgeLabel(lastIso: string | null, now: Date): string {
	const days = daysSinceBackup(lastIso, now);
	if (days === null) return "Never backed up";
	if (days === 0) return "Backed up today";
	if (days === 1) return "Backed up yesterday";
	return `Last backup ${days} days ago`;
}
