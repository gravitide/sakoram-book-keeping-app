// Maps the stable error codes emitted by src-tauri/src/drive/remote.rs
// (RemoteError's Display) + backup.rs (DRIVE_CANCELLED) to friendly copy.
// Keep the codes in sync with those files.

export interface DriveErrorInfo {
	title: string
	description: string
	/** The stored Google sign-in is dead — offer Reconnect. */
	reconnect: boolean
	/** The user cancelled — callers usually stay silent. */
	cancelled: boolean
}

const TITLES: Record<string, string> = {
	DRIVE_OFFLINE: "Can't reach Google Drive",
	DRIVE_RECONNECT: "Reconnect Google Drive",
	DRIVE_QUOTA: "Your Google Drive is full",
	DRIVE_NOT_FOUND: "Backup not found",
	DRIVE_CANCELLED: "Cancelled"
};

const DESCRIPTIONS: Record<string, string> = {
	DRIVE_OFFLINE: "Check your internet connection and try again. Nothing was changed.",
	DRIVE_RECONNECT: "Access to Google Drive was revoked or has expired. Connect again to keep backing up.",
	DRIVE_QUOTA: "Free up space in Google Drive (it is shared with Gmail and Photos), then back up again."
};

export function describeDriveError(raw: unknown): DriveErrorInfo {
	const message = raw instanceof Error ? raw.message : String(raw);
	const match = /^(DRIVE_[A-Z_]+): ?(.*)$/s.exec(message);
	const code = match?.[1] ?? "";
	const rest = match?.[2] ?? message;
	return {
		title: TITLES[code] ?? "Google Drive backup failed",
		description: DESCRIPTIONS[code] ?? rest,
		reconnect: code === "DRIVE_RECONNECT",
		cancelled: code === "DRIVE_CANCELLED"
	};
}
