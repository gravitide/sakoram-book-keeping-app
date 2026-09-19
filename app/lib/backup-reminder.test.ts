import { describe, expect, it } from "vitest";
import { backupAgeLabel, daysSinceBackup, isBackupDue } from "./backup-reminder";

const now = new Date("2026-09-19T12:00:00Z");

describe("daysSinceBackup", () => {
	it("is null when there has never been a backup", () => {
		expect(daysSinceBackup(null, now)).toBeNull();
	});
	it("counts whole days", () => {
		expect(daysSinceBackup("2026-09-19T09:00:00Z", now)).toBe(0);
		expect(daysSinceBackup("2026-09-10T12:00:00Z", now)).toBe(9);
	});
	it("never goes negative when the clock moved backwards", () => {
		expect(daysSinceBackup("2026-09-25T00:00:00Z", now)).toBe(0);
	});
	it("treats an unparseable timestamp as never backed up", () => {
		expect(daysSinceBackup("garbage", now)).toBeNull();
	});
});

describe("isBackupDue", () => {
	it("is never due when reminders are off", () => {
		expect(isBackupDue(null, null, now)).toBe(false);
		expect(isBackupDue("2020-01-01T00:00:00Z", null, now)).toBe(false);
	});
	it("is due when there has never been a backup", () => {
		expect(isBackupDue(null, 7, now)).toBe(true);
	});
	it("is due only once the interval has fully elapsed", () => {
		expect(isBackupDue("2026-09-13T12:00:00Z", 7, now)).toBe(false); // 6 days
		expect(isBackupDue("2026-09-12T12:00:00Z", 7, now)).toBe(true); // 7 days
	});
});

describe("backupAgeLabel", () => {
	it("reads naturally", () => {
		expect(backupAgeLabel(null, now)).toBe("Never backed up");
		expect(backupAgeLabel("2026-09-19T09:00:00Z", now)).toBe("Backed up today");
		expect(backupAgeLabel("2026-09-18T09:00:00Z", now)).toBe("Backed up yesterday");
		expect(backupAgeLabel("2026-09-10T12:00:00Z", now)).toBe("Last backup 9 days ago");
	});
});
