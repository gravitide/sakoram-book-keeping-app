//! `%APPDATA%/com.sakoram.billing/backup.json` — per-machine Drive-backup state.
//! Deliberately separate from `tenants.json`: nothing here is needed to open a
//! business, and a corrupt file must never block the app.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

fn default_reminder_days() -> Option<u32> {
	Some(7)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BackupPrefs {
	/// Remind when the last backup is older than this many days. `None` = off.
	#[serde(default = "default_reminder_days")]
	pub reminder_days: Option<u32>,
	/// Connected Google account, cached so the UI can show it while offline.
	#[serde(default)]
	pub account_email: Option<String>,
	/// tenant id → ISO UTC timestamp of the last COMPLETE backup from this machine.
	#[serde(default)]
	pub last_backups: HashMap<String, String>,
}

impl Default for BackupPrefs {
	fn default() -> Self {
		Self { reminder_days: default_reminder_days(), account_email: None, last_backups: HashMap::new() }
	}
}

pub fn load(path: &Path) -> BackupPrefs {
	std::fs::read(path)
		.ok()
		.and_then(|raw| serde_json::from_slice(&raw).ok())
		.unwrap_or_default()
}

/// Write-then-rename so a crash mid-write can't leave a truncated file.
pub fn save(path: &Path, prefs: &BackupPrefs) -> Result<(), String> {
	if let Some(parent) = path.parent() {
		std::fs::create_dir_all(parent).map_err(|e| format!("create backup state dir: {e}"))?;
	}
	let tmp = path.with_extension("json.tmp");
	let bytes = serde_json::to_vec_pretty(prefs).map_err(|e| e.to_string())?;
	std::fs::write(&tmp, bytes).map_err(|e| format!("write backup state: {e}"))?;
	std::fs::rename(&tmp, path).map_err(|e| format!("replace backup state: {e}"))
}

#[cfg(test)]
mod tests {
	use super::*;

	fn temp_file(tag: &str) -> std::path::PathBuf {
		let dir = std::env::temp_dir().join(format!("sakoram-backup-state-{tag}-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&dir).unwrap();
		dir.join("backup.json")
	}

	#[test]
	fn missing_file_loads_defaults() {
		let prefs = load(&temp_file("missing"));
		assert_eq!(prefs.reminder_days, Some(7));
		assert!(prefs.last_backups.is_empty());
	}

	#[test]
	fn corrupt_file_loads_defaults_instead_of_failing() {
		let p = temp_file("corrupt");
		std::fs::write(&p, b"{not json").unwrap();
		assert_eq!(load(&p), BackupPrefs::default());
	}

	#[test]
	fn round_trips_and_distinguishes_off_from_unset() {
		let p = temp_file("roundtrip");
		let mut prefs = BackupPrefs::default();
		prefs.reminder_days = None; // explicitly off
		prefs.account_email = Some("a@example.com".into());
		prefs.last_backups.insert("acme".into(), "2026-09-19T09:02:11Z".into());
		save(&p, &prefs).unwrap();
		assert_eq!(load(&p), prefs);

		// A file written before `reminder_days` existed gets the default, not "off".
		std::fs::write(&p, br#"{"last_backups":{}}"#).unwrap();
		assert_eq!(load(&p).reminder_days, Some(7));
	}
}
