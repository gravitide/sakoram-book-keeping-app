import { describe, expect, it } from "vitest";
import { describeDriveError } from "./drive-errors";

describe("describeDriveError", () => {
	it("maps each stable code", () => {
		expect(describeDriveError("DRIVE_OFFLINE: dns failure").title).toBe("Can't reach Google Drive");
		expect(describeDriveError("DRIVE_QUOTA: full").title).toBe("Your Google Drive is full");
		expect(describeDriveError("DRIVE_NOT_FOUND: x").title).toBe("Backup not found");
	});
	it("flags a revoked sign-in so the UI can offer Reconnect", () => {
		const d = describeDriveError("DRIVE_RECONNECT: revoked");
		expect(d.reconnect).toBe(true);
		expect(d.title).toBe("Reconnect Google Drive");
	});
	it("flags a cancel so callers can stay silent", () => {
		expect(describeDriveError("DRIVE_CANCELLED: Cancelled.").cancelled).toBe(true);
	});
	it("passes unknown messages through, from Error objects too", () => {
		const d = describeDriveError(new Error("Unlock this business before backing it up."));
		expect(d.title).toBe("Google Drive backup failed");
		expect(d.description).toBe("Unlock this business before backing it up.");
		expect(d.reconnect).toBe(false);
	});
	it("strips the DRIVE_ERROR code from the description", () => {
		expect(describeDriveError("DRIVE_ERROR: Google Drive returned 500: boom").description).toBe("Google Drive returned 500: boom");
	});
});
