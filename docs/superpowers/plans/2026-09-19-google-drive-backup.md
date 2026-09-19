# Google Drive Backup & Restore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user back up a business to their own Google Drive with one button, and restore it on any machine — database, logos and every attachment.

**Architecture:** A new Rust module `src-tauri/src/drive/` owns everything: OAuth (PKCE + loopback), a `RemoteStore` trait with a Google Drive REST implementation and an in-memory fake, snapshotting (`VACUUM INTO` → zip), and backup/restore orchestration written against the trait so it is tested end-to-end with no network. The frontend is a thin Pinia store + three components. No DB migration; per-machine state lives in `%APPDATA%/backup.json`, the refresh token in the OS keychain.

**Tech Stack:** Rust (tauri 2.10, sqlx 0.8, axum 0.8, tokio, zip 2, keyring 3 — all present; new: `reqwest`, `md-5`, `sha2`), Nuxt 4 + Pinia + NuxtUI 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-google-drive-backup-design.md`

## Global Constraints

- **Package manager is `bun` only.** `bun run lint`, `bun run test`. Rust tests: `cd src-tauri && cargo test drive::`. If cargo says "Blocking waiting for file lock", `tauri:dev` is running — wait.
- **Indentation is tabs** in new Rust, TS and Vue files.
- **Backup never runs on the window-close path.** `app/plugins/lock-on-close.client.ts` must not be touched.
- **All file I/O on a business folder is Rust `std::fs`**, never the fs plugin (folders live on any drive).
- **The refresh token lives only in the OS keychain** (service `com.sakoram.billing.gdrive`). Never in `tenants.json`, `backup.json`, or a business folder.
- **Scope is `https://www.googleapis.com/auth/drive.file` only.**
- **Google credentials are compile-time env vars** `SAKORAM_GOOGLE_CLIENT_ID` / `SAKORAM_GOOGLE_CLIENT_SECRET`. Absent ⇒ the feature reports `configured: false` and the UI hides itself. Never commit them.
- **Deletes on Drive are "trash", never permanent.**
- **Async Rust tests use `tauri::async_runtime::block_on`** (the existing convention in `tenants.rs`) — do not add tokio's `macros` feature.
- **Pure TS logic goes in `app/lib/` with RELATIVE runtime imports**; vitest cannot resolve `~/` or import a Pinia store.
- **Pages/components have a single root node**; template comments live inside it.
- **Branch:** `feat/google-drive-backup`, created from `main` in Task 1 Step 0. Never work on `main`.
- **Version bump → 0.160.0** in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (+ `Cargo.lock`) — done in Task 13.
- **No Claude Code footer in commit messages. Do not push or open a PR without explicit user confirmation.**

## Refinements made while planning (already folded back into the spec)

1. **Drive folder key is `backup_key = md5(tenant_id + "\n" + marker.created_at)`**, not the raw tenant id. Tenant ids are name slugs (`acme-traders`) — two different businesses with the same name would collide, and Drive `appProperties` cap key+value at 124 bytes.
2. **Snapshot name is `YYYY-MM-DD HH-MM-SS UTC · <DEVICE>`** (UTC, sortable; the crate set has no local-time support). The UI parses it and displays local time.
3. **Sidecar manifest uploads BEFORE the zip; the zip is the commit marker.** Spec had the order reversed.
4. **Files are looked up by `appProperties` (`skKey`, `skKind`, `skPath`) in ONE paginated query**, not by walking Drive folders (which would be one API call per document folder). The visible folder tree still mirrors the business folder.
5. `backup.json` holds `reminder_days`, `account_email`, `last_backups` — no cached Drive folder id.

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/src/drive/mod.rs` | `DriveState`, the `#[tauri::command]`s, glue |
| `src-tauri/src/drive/plan.rs` | **pure**: upload diff, snapshot naming/parsing, retention, attachment GC, backup key |
| `src-tauri/src/drive/state.rs` | `backup.json` load/save |
| `src-tauri/src/drive/snapshot.rs` | md5, attachment walk, manifest, `VACUUM INTO`, sealing, zip build, safe extract |
| `src-tauri/src/drive/remote.rs` | `RemoteStore` trait, `RemoteError`, test-only `MemoryStore` |
| `src-tauri/src/drive/backup.rs` | backup orchestration |
| `src-tauri/src/drive/restore.rs` | restore orchestration |
| `src-tauri/src/drive/oauth.rs` | PKCE, loopback listener, token exchange/refresh/revoke, keychain |
| `src-tauri/src/drive/gdrive.rs` | `RemoteStore` over the Drive v3 REST API |
| `app/lib/backup-reminder.ts` (+test) | pure: is a backup due |
| `app/lib/drive-errors.ts` (+test) | pure: error-code → friendly message |
| `app/stores/drive_backup.ts` | Pinia store bridging the commands |
| `app/components/DriveBackupCard.vue` | Settings → Businesses card |
| `app/components/DriveBackupProgressModal.vue` | store-driven progress modal |
| `app/components/BackupReminderBanner.vue` | reminder banner in the default layout |
| `app/components/RestoreFromDriveModal.vue` | welcome-screen restore flow |
| `app/help/topics/backup-google-drive.vue` | help topic |

---

### Task 1: Dependencies, module skeleton, and the pure planner

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/src/lib.rs:7-13`
- Create: `src-tauri/src/drive/mod.rs`, `src-tauri/src/drive/plan.rs`

**Interfaces:**
- Produces (all in `drive::plan`): `LocalFile { path, size, md5 }`, `RemoteFile { path, size, md5: Option<String> }`, `UploadAction::{Upload, Replace}`, `attachments_to_upload(&[LocalFile], &[RemoteFile]) -> Vec<(String, UploadAction)>`, `sanitize_device(&str) -> String`, `snapshot_stem(created_at_iso: &str, device: &str) -> String`, `parse_snapshot_stem(&str) -> Option<(String, String)>`, `SnapshotEntry { stem, has_zip, has_sidecar }`, `snapshot_entries(&[RemoteFile]) -> Vec<SnapshotEntry>`, `split_retained(&[SnapshotEntry], keep: usize) -> (Vec<String>, Vec<String>)`, `gc_attachments(&[Option<Vec<String>>], &[String]) -> Vec<String>`, `backup_key(tenant_id, created_at) -> String`, `fits_app_property(key, value) -> bool`, `KEEP_SNAPSHOTS: usize = 10`.

- [ ] **Step 0: Branch**

```bash
git checkout main && git fetch origin && git pull --ff-only && git checkout -b feat/google-drive-backup
```

(The spec + this plan sit uncommitted on `docs/google-drive-backup-spec`; carry them over with `git stash -u` before the checkout and `git stash pop` after, then commit them as the first commit: `git add docs/superpowers && git commit -m "docs: google drive backup spec + plan"`.)

- [ ] **Step 1: Add dependencies**

Append to `[dependencies]` in `src-tauri/Cargo.toml`, after the `zip = …` line:

```toml
# Google Drive backup (src/drive/): reqwest talks to the Drive v3 REST API and
# the OAuth token endpoint (rustls — no system OpenSSL). md-5 matches Drive's
# native `md5Checksum` so presence + integrity are verified against Google's
# own value. sha2 is the PKCE S256 challenge.
reqwest = { version = "0.12", default-features = false, features = [ "rustls-tls", "json" ] }
md-5 = "0.10"
sha2 = "0.10"
```

Replace `src-tauri/build.rs` with:

```rust
fn main() {
  // option_env! in src/drive/oauth.rs is compile-time; without these lines cargo
  // would not rebuild when the credentials change.
  println!("cargo:rerun-if-env-changed=SAKORAM_GOOGLE_CLIENT_ID");
  println!("cargo:rerun-if-env-changed=SAKORAM_GOOGLE_CLIENT_SECRET");
  tauri_build::build()
}
```

- [ ] **Step 2: Module skeleton**

In `src-tauri/src/lib.rs` add `mod drive;` after `mod data_io;`.

Create `src-tauri/src/drive/mod.rs`:

```rust
// Google Drive backup & restore. See
// docs/superpowers/specs/2026-09-19-google-drive-backup-design.md.
//
// Backup is a manual, one-way push; restore is an explicit user action. There
// is no sync and NOTHING here may run on the window-close path.

pub mod plan;
```

- [ ] **Step 3: Write the failing tests**

Create `src-tauri/src/drive/plan.rs` with only the tests first:

```rust
//! Pure planning logic for Drive backups — no I/O, no network.

#[cfg(test)]
mod tests {
	use super::*;

	fn local(path: &str, size: u64, md5: &str) -> LocalFile {
		LocalFile { path: path.into(), size, md5: md5.into() }
	}
	fn remote(path: &str, size: u64, md5: Option<&str>) -> RemoteFile {
		RemoteFile { path: path.into(), size, md5: md5.map(Into::into) }
	}

	#[test]
	fn upload_diff_skips_identical_uploads_missing_replaces_changed() {
		let l = vec![local("invoice/1/a.jpg", 10, "aa"), local("invoice/1/b.jpg", 20, "bb"), local("bill/2/c.jpg", 30, "cc")];
		let r = vec![remote("invoice/1/a.jpg", 10, Some("aa")), remote("invoice/1/b.jpg", 20, Some("XX"))];
		assert_eq!(
			attachments_to_upload(&l, &r),
			vec![("invoice/1/b.jpg".to_string(), UploadAction::Replace), ("bill/2/c.jpg".to_string(), UploadAction::Upload)]
		);
	}

	#[test]
	fn upload_diff_treats_missing_remote_md5_as_changed() {
		let l = vec![local("a", 1, "aa")];
		let r = vec![remote("a", 1, None)];
		assert_eq!(attachments_to_upload(&l, &r), vec![("a".to_string(), UploadAction::Replace)]);
	}

	#[test]
	fn device_names_are_ascii_and_capped() {
		assert_eq!(sanitize_device("DESKTOP-PC"), "DESKTOP-PC");
		assert_eq!(sanitize_device("Sri's MacBook Pro (2)"), "Sri-s-MacBook-Pro--2");
		assert_eq!(sanitize_device(""), "device");
		assert_eq!(sanitize_device("··"), "device");
	}

	#[test]
	fn snapshot_stem_round_trips() {
		let stem = snapshot_stem("2026-09-19T09:02:11Z", "DESKTOP-PC");
		assert_eq!(stem, "2026-09-19 09-02-11 UTC · DESKTOP-PC");
		assert_eq!(parse_snapshot_stem(&stem), Some(("2026-09-19T09:02:11Z".to_string(), "DESKTOP-PC".to_string())));
		assert_eq!(parse_snapshot_stem("holiday photos"), None);
	}

	#[test]
	fn snapshot_entries_pair_zip_and_sidecar() {
		let files = vec![
			remote("snapshots/A.zip", 1, None),
			remote("snapshots/A.manifest.json", 1, None),
			remote("snapshots/B.manifest.json", 1, None),
			remote("attachments/x", 1, None),
		];
		let mut e = snapshot_entries(&files);
		e.sort_by(|a, b| a.stem.cmp(&b.stem));
		assert_eq!(e, vec![
			SnapshotEntry { stem: "A".into(), has_zip: true, has_sidecar: true },
			SnapshotEntry { stem: "B".into(), has_zip: false, has_sidecar: true },
		]);
	}

	#[test]
	fn retention_keeps_newest_and_prunes_stale_incomplete_only() {
		let e = |s: &str, zip: bool| SnapshotEntry { stem: s.into(), has_zip: zip, has_sidecar: true };
		// "5" is an in-flight backup from another device (sidecar, no zip yet) —
		// newer than every complete snapshot, so it must NOT be pruned.
		let entries = vec![e("1", true), e("2", false), e("3", true), e("4", true), e("5", false)];
		let (retained, pruned) = split_retained(&entries, 2);
		assert_eq!(retained, vec!["4".to_string(), "3".to_string()]);
		assert_eq!(pruned, vec!["1".to_string(), "2".to_string()]);
	}

	#[test]
	fn gc_keeps_anything_a_retained_manifest_references() {
		let manifests = vec![Some(vec!["a".to_string()]), Some(vec!["b".to_string()])];
		let remote = vec!["a".to_string(), "b".to_string(), "c".to_string()];
		assert_eq!(gc_attachments(&manifests, &remote), vec!["c".to_string()]);
	}

	#[test]
	fn gc_deletes_nothing_when_any_retained_manifest_is_unreadable() {
		let manifests = vec![Some(vec!["a".to_string()]), None];
		let remote = vec!["a".to_string(), "orphan".to_string()];
		assert!(gc_attachments(&manifests, &remote).is_empty());
	}

	#[test]
	fn backup_key_is_stable_fixed_width_and_distinguishes_same_named_businesses() {
		let a = backup_key("acme-traders", "2026-01-01T00:00:00Z");
		let b = backup_key("acme-traders", "2026-02-01T00:00:00Z");
		assert_eq!(a.len(), 32);
		assert_eq!(a, backup_key("acme-traders", "2026-01-01T00:00:00Z"));
		assert_ne!(a, b);
	}

	#[test]
	fn app_property_limit_is_124_utf8_bytes_for_key_plus_value() {
		assert!(fits_app_property("skPath", &"x".repeat(118)));
		assert!(!fits_app_property("skPath", &"x".repeat(119)));
		assert!(!fits_app_property("skPath", &"·".repeat(60))); // 2 bytes each
	}
}
```

- [ ] **Step 4: Run to verify failure**

Run: `cd src-tauri && cargo test drive::plan`
Expected: compile errors — `cannot find type LocalFile`, etc.

- [ ] **Step 5: Implement**

Insert above the `#[cfg(test)]` block in `plan.rs`:

```rust
use std::collections::{BTreeMap, HashMap, HashSet};

use data_encoding::HEXLOWER;
use md5::{Digest, Md5};
use serde::Serialize;

/// Complete snapshots kept on Drive per business.
pub const KEEP_SNAPSHOTS: usize = 10;

/// Drive caps each appProperty at 124 UTF-8 bytes, key + value combined.
const APP_PROPERTY_LIMIT: usize = 124;

const STEM_SEPARATOR: &str = " UTC · ";

/// A local attachment. `path` is relative to `<folder>/attachments/`, '/' separated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalFile {
	pub path: String,
	pub size: u64,
	pub md5: String,
}

/// A file on the remote. `path` is relative to the business root for
/// `RemoteStore::list`, or to `attachments/` when handed to the diff.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RemoteFile {
	pub path: String,
	pub size: u64,
	pub md5: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UploadAction {
	/// Not on the remote yet.
	Upload,
	/// On the remote with a different size/checksum — trash it, then upload.
	Replace,
}

/// Which local attachments need sending, in local order. A remote file with no
/// checksum is treated as changed: we never assume integrity we can't verify.
pub fn attachments_to_upload(local: &[LocalFile], remote: &[RemoteFile]) -> Vec<(String, UploadAction)> {
	let by_path: HashMap<&str, &RemoteFile> = remote.iter().map(|r| (r.path.as_str(), r)).collect();
	local
		.iter()
		.filter_map(|l| match by_path.get(l.path.as_str()) {
			None => Some((l.path.clone(), UploadAction::Upload)),
			Some(r) if r.size == l.size && r.md5.as_deref() == Some(l.md5.as_str()) => None,
			Some(_) => Some((l.path.clone(), UploadAction::Replace)),
		})
		.collect()
}

/// ASCII-only, at most 20 chars — it is embedded in a filename AND an
/// appProperty value, so it must stay short and byte-predictable.
pub fn sanitize_device(raw: &str) -> String {
	let cleaned: String = raw
		.chars()
		.map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
		.take(20)
		.collect();
	let trimmed = cleaned.trim_matches('-');
	if trimmed.is_empty() { "device".to_string() } else { trimmed.to_string() }
}

/// `2026-09-19T09:02:11Z` + `DESKTOP-PC` → `2026-09-19 09-02-11 UTC · DESKTOP-PC`.
/// Sorts chronologically as a plain string.
pub fn snapshot_stem(created_at_iso: &str, device: &str) -> String {
	let stamp = created_at_iso.trim_end_matches('Z').replace('T', " ").replace(':', "-");
	format!("{stamp}{STEM_SEPARATOR}{}", sanitize_device(device))
}

/// Inverse of `snapshot_stem` → `(created_at_iso, device)`.
pub fn parse_snapshot_stem(stem: &str) -> Option<(String, String)> {
	let (stamp, device) = stem.split_once(STEM_SEPARATOR)?;
	let (date, time) = stamp.split_once(' ')?;
	if date.len() != 10 || time.len() != 8 {
		return None;
	}
	Some((format!("{date}T{}Z", time.replace('-', ":")), device.to_string()))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotEntry {
	pub stem: String,
	pub has_zip: bool,
	pub has_sidecar: bool,
}

/// Group everything under `snapshots/` by stem.
pub fn snapshot_entries(files: &[RemoteFile]) -> Vec<SnapshotEntry> {
	let mut by_stem: BTreeMap<String, (bool, bool)> = BTreeMap::new();
	for f in files {
		let Some(name) = f.path.strip_prefix("snapshots/") else { continue };
		if let Some(stem) = name.strip_suffix(".manifest.json") {
			by_stem.entry(stem.to_string()).or_default().1 = true;
		} else if let Some(stem) = name.strip_suffix(".zip") {
			by_stem.entry(stem.to_string()).or_default().0 = true;
		}
	}
	by_stem
		.into_iter()
		.map(|(stem, (has_zip, has_sidecar))| SnapshotEntry { stem, has_zip, has_sidecar })
		.collect()
}

/// `(retained, pruned)` stems. A snapshot is complete only when its zip exists
/// (the zip uploads last — it is the commit marker). Retained = the `keep`
/// newest complete ones, newest first. Pruned = older complete ones plus
/// incomplete ones OLDER than the newest complete snapshot; a newer incomplete
/// one may be another device's backup in flight and is left alone.
pub fn split_retained(entries: &[SnapshotEntry], keep: usize) -> (Vec<String>, Vec<String>) {
	let mut complete: Vec<&str> = entries.iter().filter(|e| e.has_zip).map(|e| e.stem.as_str()).collect();
	complete.sort_unstable_by(|a, b| b.cmp(a));
	let newest = complete.first().copied();
	let retained: Vec<String> = complete.iter().take(keep).map(|s| s.to_string()).collect();
	let mut pruned: Vec<String> = complete.iter().skip(keep).map(|s| s.to_string()).collect();
	for e in entries.iter().filter(|e| !e.has_zip) {
		if newest.is_some_and(|n| e.stem.as_str() < n) {
			pruned.push(e.stem.clone());
		}
	}
	pruned.sort();
	(retained, pruned)
}

/// Remote attachments no retained snapshot references. If ANY retained
/// manifest could not be read (`None`) nothing is collected — never delete
/// on incomplete knowledge.
pub fn gc_attachments(retained_manifests: &[Option<Vec<String>>], remote_attachments: &[String]) -> Vec<String> {
	if retained_manifests.iter().any(Option::is_none) {
		return Vec::new();
	}
	let keep: HashSet<&str> = retained_manifests.iter().flatten().flatten().map(String::as_str).collect();
	remote_attachments.iter().filter(|p| !keep.contains(p.as_str())).cloned().collect()
}

/// Stable 32-hex identity of a business on Drive. Tenant ids are slugs of the
/// business name, so two businesses called the same thing share an id; the
/// marker's `created_at` tells them apart. Fixed width also keeps it inside
/// the appProperty byte limit whatever the business is called.
pub fn backup_key(tenant_id: &str, created_at: &str) -> String {
	let mut h = Md5::new();
	h.update(tenant_id.as_bytes());
	h.update(b"\n");
	h.update(created_at.as_bytes());
	HEXLOWER.encode(&h.finalize())
}

pub fn fits_app_property(key: &str, value: &str) -> bool {
	key.len() + value.len() <= APP_PROPERTY_LIMIT
}
```

- [ ] **Step 6: Run tests**

Run: `cd src-tauri && cargo test drive::plan`
Expected: 10 passed. (`dead_code` warnings are expected until later tasks consume these.)

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/build.rs src-tauri/src/lib.rs src-tauri/src/drive
git commit -m "feat(drive): pure backup planner — upload diff, retention, attachment gc"
```

---

### Task 2: `backup.json` — per-machine backup state

**Files:**
- Create: `src-tauri/src/drive/state.rs`
- Modify: `src-tauri/src/drive/mod.rs`

**Interfaces:**
- Produces: `BackupPrefs { reminder_days: Option<u32>, account_email: Option<String>, last_backups: HashMap<String, String> }` (`Default` = 7 days, no email, empty map), `state::load(path: &Path) -> BackupPrefs`, `state::save(path: &Path, prefs: &BackupPrefs) -> Result<(), String>`. `last_backups` maps tenant id → ISO UTC timestamp. `reminder_days: None` = reminders off.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/drive/state.rs`:

```rust
//! `%APPDATA%/com.sakoram.billing/backup.json` — per-machine Drive-backup state.
//! Deliberately separate from `tenants.json`: nothing here is needed to open a
//! business, and a corrupt file must never block the app.

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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test drive::state` (after adding `pub mod state;` to `drive/mod.rs`)
Expected: compile errors — `cannot find function load`.

- [ ] **Step 3: Implement**

Insert above the test module:

```rust
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
```

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test drive::state`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/drive
git commit -m "feat(drive): backup.json per-machine state"
```

---

### Task 3: Snapshots — md5, attachment walk, `VACUUM INTO`, sealing, zip build, safe extract

**Files:**
- Create: `src-tauri/src/drive/snapshot.rs`
- Modify: `src-tauri/src/drive/mod.rs` (add `pub mod snapshot;`), `src-tauri/src/vault_fs.rs:80` (`fn secure_remove` → `pub(crate) fn secure_remove`)

**Interfaces:**
- Consumes: `plan::LocalFile`, `vault::encrypt_file(&Path, &Path, &[u8; 32])`, `vault_fs::secure_remove(&Path)`.
- Produces: `MANIFEST_NAME = "backup-manifest.json"`, `Manifest { format, format_version, tenant_id, business_name, schema_version: i32, app_version, created_at, device_name, encrypted: bool, attachments: Vec<ManifestAttachment> }`, `ManifestAttachment { path, size, md5 }`, `file_md5(&Path) -> std::io::Result<String>`, `walk_attachments(folder: &Path) -> (Vec<LocalFile>, Vec<String>)` (files, unreadable paths), `vacuum_into(src: &Path, dest: &Path) -> Result<(), String>` (async), `prepare_db(folder: &Path, work: &Path, dek: Option<&[u8; 32]>) -> Result<Vec<(String, PathBuf)>, String>` (async; zip-entry-name → file), `build_zip(folder: &Path, db_entries: &[(String, PathBuf)], manifest: &Manifest, out: &Path) -> Result<(), String>`, `read_manifest_from_zip(&Path) -> Result<Manifest, String>`, `extract_zip(zip: &Path, dest: &Path) -> Result<(), String>`, `safe_rel_path(&str) -> Option<PathBuf>`.

- [ ] **Step 1: Make `secure_remove` crate-visible**

In `src-tauri/src/vault_fs.rs` change `fn secure_remove(path: &std::path::Path)` to `pub(crate) fn secure_remove(path: &std::path::Path)`. Nothing else in that file changes.

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/drive/snapshot.rs`:

```rust
//! Turning a business folder into an uploadable snapshot, and back.

#[cfg(test)]
pub(crate) mod tests {
	use super::*;
	use sqlx::Connection;

	pub(crate) fn temp_dir(tag: &str) -> PathBuf {
		let d = std::env::temp_dir().join(format!("sakoram-snapshot-{tag}-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&d).unwrap();
		d
	}

	/// A real SQLite file with one table + `rows` rows. Returns the OPEN
	/// connection so callers can prove VACUUM INTO works against a live db.
	pub(crate) async fn make_db(path: &Path, rows: i64) -> sqlx::sqlite::SqliteConnection {
		let opts = sqlx::sqlite::SqliteConnectOptions::new().filename(path).create_if_missing(true);
		let mut conn = sqlx::sqlite::SqliteConnection::connect_with(&opts).await.unwrap();
		sqlx::query("CREATE TABLE t (x INTEGER)").execute(&mut conn).await.unwrap();
		for i in 0..rows {
			sqlx::query("INSERT INTO t (x) VALUES (?)").bind(i).execute(&mut conn).await.unwrap();
		}
		conn
	}

	pub(crate) async fn count_rows(path: &Path) -> i64 {
		let opts = sqlx::sqlite::SqliteConnectOptions::new().filename(path);
		let mut conn = sqlx::sqlite::SqliteConnection::connect_with(&opts).await.unwrap();
		let n: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM t").fetch_one(&mut conn).await.unwrap();
		n.0
	}

	/// A minimal business folder: db (3 rows), marker, a logo, two attachments.
	pub(crate) async fn make_business_folder(tag: &str) -> PathBuf {
		let folder = temp_dir(tag);
		let conn = make_db(&folder.join("business.db"), 3).await;
		conn.close().await.unwrap();
		std::fs::write(folder.join("business.json"), br#"{"id":"acme","name":"Acme","schema_version":53,"created_at":"2026-01-01T00:00:00Z","encrypted":false}"#).unwrap();
		std::fs::create_dir_all(folder.join("logos")).unwrap();
		std::fs::write(folder.join("logos").join("logo.png"), b"PNGDATA").unwrap();
		std::fs::write(folder.join("pdf-header.png"), b"HEADER").unwrap();
		std::fs::create_dir_all(folder.join("attachments").join("invoice").join("1")).unwrap();
		std::fs::write(folder.join("attachments").join("invoice").join("1").join("a.jpg"), b"scan-a").unwrap();
		std::fs::create_dir_all(folder.join("attachments").join("bill").join("2")).unwrap();
		std::fs::write(folder.join("attachments").join("bill").join("2").join("b.jpg"), b"scan-bb").unwrap();
		folder
	}

	pub(crate) fn manifest_for(attachments: Vec<ManifestAttachment>, encrypted: bool) -> Manifest {
		Manifest {
			format: "sakoram-drive-backup".into(),
			format_version: 1,
			tenant_id: "acme".into(),
			business_name: "Acme".into(),
			schema_version: 53,
			app_version: "0.160.0".into(),
			created_at: "2026-09-19T09:02:11Z".into(),
			device_name: "TEST-PC".into(),
			encrypted,
			attachments,
		}
	}

	#[test]
	fn md5_matches_the_known_digest() {
		let p = temp_dir("md5").join("f");
		std::fs::write(&p, b"hello").unwrap();
		assert_eq!(file_md5(&p).unwrap(), "5d41402abc4b2a76b9719d911017c592");
	}

	#[test]
	fn walk_lists_attachments_with_forward_slashes_sorted() {
		tauri::async_runtime::block_on(async {
			let folder = make_business_folder("walk").await;
			let (files, unreadable) = walk_attachments(&folder);
			assert!(unreadable.is_empty());
			let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
			assert_eq!(paths, vec!["bill/2/b.jpg", "invoice/1/a.jpg"]);
			assert_eq!(files[0].size, 7);
		});
	}

	#[test]
	fn walk_of_a_folder_without_attachments_is_empty() {
		let (files, unreadable) = walk_attachments(&temp_dir("noatt"));
		assert!(files.is_empty() && unreadable.is_empty());
	}

	#[test]
	fn vacuum_into_copies_a_db_that_is_still_open() {
		tauri::async_runtime::block_on(async {
			let dir = temp_dir("vacuum");
			let src = dir.join("live.db");
			let _held_open = make_db(&src, 5).await; // never closed during the copy
			let dest = dir.join("copy.db");
			vacuum_into(&src, &dest).await.unwrap();
			assert_eq!(count_rows(&dest).await, 5);
		});
	}

	#[test]
	fn plain_snapshot_round_trips_through_zip() {
		tauri::async_runtime::block_on(async {
			let folder = make_business_folder("plainzip").await;
			let work = temp_dir("plainzip-work");
			let db_entries = prepare_db(&folder, &work, None).await.unwrap();
			assert_eq!(db_entries.len(), 1);
			assert_eq!(db_entries[0].0, "business.db");

			let zip = work.join("snap.zip");
			build_zip(&folder, &db_entries, &manifest_for(vec![], false), &zip).unwrap();
			assert_eq!(read_manifest_from_zip(&zip).unwrap().business_name, "Acme");

			let dest = temp_dir("plainzip-dest");
			extract_zip(&zip, &dest).unwrap();
			assert_eq!(count_rows(&dest.join("business.db")).await, 3);
			assert_eq!(std::fs::read(dest.join("logos").join("logo.png")).unwrap(), b"PNGDATA");
			assert_eq!(std::fs::read(dest.join("pdf-header.png")).unwrap(), b"HEADER");
			assert!(dest.join("business.json").exists());
			assert!(dest.join(MANIFEST_NAME).exists());
			// Attachments are NOT in the zip — they are uploaded individually.
			assert!(!dest.join("attachments").exists());
		});
	}

	#[test]
	fn encrypted_snapshot_never_contains_plaintext_sqlite() {
		tauri::async_runtime::block_on(async {
			let folder = make_business_folder("enczip").await;
			std::fs::write(folder.join("business.vault.json"), b"{\"vault\":true}").unwrap();
			let work = temp_dir("enczip-work");
			let dek = [7u8; 32];
			let db_entries = prepare_db(&folder, &work, Some(&dek)).await.unwrap();
			let names: Vec<&str> = db_entries.iter().map(|(n, _)| n.as_str()).collect();
			assert_eq!(names, vec!["business.db.enc", "business.vault.json"]);
			// The plaintext temp copy is gone.
			assert!(!work.join("business.db").exists());

			let zip = work.join("snap.zip");
			build_zip(&folder, &db_entries, &manifest_for(vec![], true), &zip).unwrap();
			let bytes = std::fs::read(&zip).unwrap();
			assert!(!bytes.windows(15).any(|w| w == b"SQLite format 3"));

			// The sealed blob decrypts back to a working database.
			let dest = temp_dir("enczip-dest");
			extract_zip(&zip, &dest).unwrap();
			let plain = dest.join("out.db");
			crate::vault::decrypt_file(&dest.join("business.db.enc"), &plain, &dek).unwrap();
			assert_eq!(count_rows(&plain).await, 3);
		});
	}

	#[test]
	fn extract_refuses_entries_that_escape_the_target() {
		use std::io::Write;
		let dir = temp_dir("zipslip");
		let zip_path = dir.join("evil.zip");
		let mut zip = zip::ZipWriter::new(std::fs::File::create(&zip_path).unwrap());
		let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default();
		zip.start_file("../escaped.txt", opts).unwrap();
		zip.write_all(b"x").unwrap();
		zip.finish().unwrap();

		let dest = dir.join("dest");
		std::fs::create_dir_all(&dest).unwrap();
		assert!(extract_zip(&zip_path, &dest).is_err());
		assert!(!dir.join("escaped.txt").exists());
	}

	#[test]
	fn safe_rel_path_rejects_traversal_and_absolute_paths() {
		assert_eq!(safe_rel_path("invoice/1/a.jpg"), Some(PathBuf::from("invoice").join("1").join("a.jpg")));
		assert_eq!(safe_rel_path("../a"), None);
		assert_eq!(safe_rel_path("a/../../b"), None);
		assert_eq!(safe_rel_path("/etc/passwd"), None);
		assert_eq!(safe_rel_path("C:/x"), None);
		assert_eq!(safe_rel_path("a\\b"), None);
		assert_eq!(safe_rel_path(""), None);
	}
}
```

- [ ] **Step 3: Run to verify failure**

Run: `cd src-tauri && cargo test drive::snapshot`
Expected: compile errors — `cannot find function file_md5`, etc.

- [ ] **Step 4: Implement**

Insert above the test module:

```rust
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use data_encoding::HEXLOWER;
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use sqlx::Connection;

use super::plan::LocalFile;

pub const MANIFEST_NAME: &str = "backup-manifest.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ManifestAttachment {
	/// Relative to `attachments/`, '/' separated.
	pub path: String,
	pub size: u64,
	pub md5: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
	pub format: String,
	pub format_version: i32,
	pub tenant_id: String,
	pub business_name: String,
	pub schema_version: i32,
	pub app_version: String,
	pub created_at: String,
	pub device_name: String,
	pub encrypted: bool,
	pub attachments: Vec<ManifestAttachment>,
}

/// Lowercase hex MD5 — the same form as Drive's `md5Checksum`.
pub fn file_md5(path: &Path) -> std::io::Result<String> {
	let mut file = std::fs::File::open(path)?;
	let mut hasher = Md5::new();
	let mut buf = vec![0u8; 65536];
	loop {
		let n = file.read(&mut buf)?;
		if n == 0 {
			break;
		}
		hasher.update(&buf[..n]);
	}
	Ok(HEXLOWER.encode(&hasher.finalize()))
}

/// Every file under `<folder>/attachments/`, sorted by path. The second list
/// is paths that could not be read — reported to the user, never fatal. We
/// walk the DIRECTORY (not `document_attachments` rows): the Drive copy is a
/// folder mirror, and an orphan file riding along is harmless.
pub fn walk_attachments(folder: &Path) -> (Vec<LocalFile>, Vec<String>) {
	let root = folder.join("attachments");
	let mut files = Vec::new();
	let mut unreadable = Vec::new();
	let mut stack = vec![root.clone()];
	while let Some(dir) = stack.pop() {
		let Ok(entries) = std::fs::read_dir(&dir) else { continue };
		for entry in entries.flatten() {
			let path = entry.path();
			if path.is_dir() {
				stack.push(path);
				continue;
			}
			let Ok(rel) = path.strip_prefix(&root) else { continue };
			let rel = rel.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect::<Vec<_>>().join("/");
			match (std::fs::metadata(&path), file_md5(&path)) {
				(Ok(meta), Ok(md5)) => files.push(LocalFile { path: rel, size: meta.len(), md5 }),
				_ => unreadable.push(rel),
			}
		}
	}
	files.sort_by(|a, b| a.path.cmp(&b.path));
	unreadable.sort();
	(files, unreadable)
}

/// A consistent copy of a possibly-live database. `VACUUM INTO` runs inside a
/// read transaction on its OWN connection, so the JS-side pool stays open and
/// the user keeps working. `dest` must not exist.
pub async fn vacuum_into(src: &Path, dest: &Path) -> Result<(), String> {
	let opts = SqliteConnectOptions::new().filename(src).create_if_missing(false);
	let mut conn = SqliteConnection::connect_with(&opts).await.map_err(|e| format!("open database for backup: {e}"))?;
	let result = sqlx::query("VACUUM INTO ?")
		.bind(dest.to_string_lossy().to_string())
		.execute(&mut conn)
		.await
		.map(|_| ())
		.map_err(|e| format!("snapshot database: {e}"));
	let _ = conn.close().await;
	result
}

/// Produce the database entries for the snapshot zip as `(entry name, file)`.
/// Plain business → `business.db`. Encrypted business → the copy is sealed with
/// the session DEK and the plaintext temp securely removed, so plaintext never
/// reaches the zip — entries are `business.db.enc` + `business.vault.json`.
pub async fn prepare_db(folder: &Path, work: &Path, dek: Option<&[u8; 32]>) -> Result<Vec<(String, PathBuf)>, String> {
	std::fs::create_dir_all(work).map_err(|e| format!("create backup work dir: {e}"))?;
	let plain = work.join("business.db");
	vacuum_into(&folder.join("business.db"), &plain).await?;
	let Some(dek) = dek else {
		return Ok(vec![("business.db".to_string(), plain)]);
	};

	let enc = work.join("business.db.enc");
	let sealed = crate::vault::encrypt_file(&plain, &enc, dek).map_err(|e| format!("seal snapshot: {e}"));
	// Remove the plaintext copy whether or not sealing worked.
	let wiped = crate::vault_fs::secure_remove(&plain).map_err(|e| format!("remove plaintext snapshot: {e}"));
	sealed?;
	wiped?;

	let vault_src = folder.join("business.vault.json");
	let vault_copy = work.join("business.vault.json");
	std::fs::copy(&vault_src, &vault_copy).map_err(|e| format!("copy vault metadata: {e}"))?;
	Ok(vec![("business.db.enc".to_string(), enc), ("business.vault.json".to_string(), vault_copy)])
}

fn add_file(zip: &mut zip::ZipWriter<std::fs::File>, name: &str, src: &Path) -> Result<(), String> {
	let opts: zip::write::FileOptions<'_, ()> =
		zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
	zip.start_file(name, opts).map_err(|e| e.to_string())?;
	let bytes = std::fs::read(src).map_err(|e| format!("read {}: {e}", src.display()))?;
	zip.write_all(&bytes).map_err(|e| e.to_string())
}

/// Snapshot zip = db entries + `business.json` + `logos/*` + root `pdf-header*`
/// + the manifest. Attachments are NOT included; they upload individually.
pub fn build_zip(folder: &Path, db_entries: &[(String, PathBuf)], manifest: &Manifest, out: &Path) -> Result<(), String> {
	let file = std::fs::File::create(out).map_err(|e| format!("create snapshot zip: {e}"))?;
	let mut zip = zip::ZipWriter::new(file);

	for (name, src) in db_entries {
		add_file(&mut zip, name, src)?;
	}
	add_file(&mut zip, "business.json", &folder.join("business.json"))?;

	if let Ok(entries) = std::fs::read_dir(folder.join("logos")) {
		for entry in entries.flatten().filter(|e| e.path().is_file()) {
			let name = format!("logos/{}", entry.file_name().to_string_lossy());
			add_file(&mut zip, &name, &entry.path())?;
		}
	}
	if let Ok(entries) = std::fs::read_dir(folder) {
		for entry in entries.flatten().filter(|e| e.path().is_file()) {
			let name = entry.file_name().to_string_lossy().to_string();
			if name.starts_with("pdf-header") {
				add_file(&mut zip, &name, &entry.path())?;
			}
		}
	}

	let opts: zip::write::FileOptions<'_, ()> =
		zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
	zip.start_file(MANIFEST_NAME, opts).map_err(|e| e.to_string())?;
	zip.write_all(&serde_json::to_vec_pretty(manifest).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
	zip.finish().map_err(|e| format!("finalize snapshot zip: {e}"))?;
	Ok(())
}

pub fn read_manifest_from_zip(zip_path: &Path) -> Result<Manifest, String> {
	let file = std::fs::File::open(zip_path).map_err(|e| format!("open snapshot: {e}"))?;
	let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read snapshot: {e}"))?;
	let mut entry = archive.by_name(MANIFEST_NAME).map_err(|_| "Snapshot has no manifest.".to_string())?;
	let mut raw = Vec::new();
	entry.read_to_end(&mut raw).map_err(|e| e.to_string())?;
	serde_json::from_slice(&raw).map_err(|e| format!("Corrupt snapshot manifest: {e}"))
}

/// Extract every entry under `dest`. `enclosed_name()` is `None` for any entry
/// whose path is absolute or climbs out with `..` (zip-slip) — such a snapshot
/// is rejected outright, before the offending entry is written.
pub fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
	let file = std::fs::File::open(zip_path).map_err(|e| format!("open snapshot: {e}"))?;
	let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read snapshot: {e}"))?;
	for i in 0..archive.len() {
		let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
		let rel = entry.enclosed_name().ok_or_else(|| format!("Snapshot contains an unsafe path: {}", entry.name()))?;
		let target = dest.join(rel);
		if entry.is_dir() {
			std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
			continue;
		}
		if let Some(parent) = target.parent() {
			std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
		}
		let mut out = std::fs::File::create(&target).map_err(|e| format!("write {}: {e}", target.display()))?;
		std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
	}
	Ok(())
}

/// A manifest attachment path turned into a relative `PathBuf`, or `None` if it
/// could land outside `attachments/`. Manifest paths arrive from the network.
pub fn safe_rel_path(raw: &str) -> Option<PathBuf> {
	if raw.is_empty() || raw.starts_with('/') || raw.contains('\\') || raw.contains(':') {
		return None;
	}
	let mut out = PathBuf::new();
	for part in raw.split('/') {
		if part.is_empty() || part == "." || part == ".." {
			return None;
		}
		out.push(part);
	}
	Some(out)
}
```

- [ ] **Step 5: Run tests**

Run: `cd src-tauri && cargo test drive::snapshot`
Expected: 8 passed. If `extract_refuses_entries_that_escape_the_target` fails at `start_file` (a future zip release validating names on write), build the fixture with raw bytes instead — do NOT weaken `extract_zip`.

- [ ] **Step 6: Run the vault tests too** (visibility change must not break them)

Run: `cd src-tauri && cargo test vault_fs`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/drive src-tauri/src/vault_fs.rs
git commit -m "feat(drive): snapshot a live business db into a zip, sealed when encrypted"
```

---

### Task 4: `RemoteStore` trait + in-memory fake

**Files:**
- Create: `src-tauri/src/drive/remote.rs`
- Modify: `src-tauri/src/drive/mod.rs` (add `pub mod remote;`)

**Interfaces:**
- Consumes: `plan::RemoteFile`.
- Produces: `RemoteError::{Offline, AuthRevoked, QuotaExceeded, NotFound, Other}(String)` whose `Display` starts with a stable code (`DRIVE_OFFLINE: `, `DRIVE_RECONNECT: `, `DRIVE_QUOTA: `, `DRIVE_NOT_FOUND: `, `DRIVE_ERROR: `) — the frontend keys on these; `RemoteBusiness { key, name }`; trait `RemoteStore` with async methods `list_businesses()`, `ensure_business(key, name)`, `list(key) -> Vec<RemoteFile>` (EVERY file of the business, paths relative to the business root: `snapshots/…`, `attachments/…`), `upload(key, path, local: &Path)`, `download(key, path, local: &Path)`, `trash(key, path)`; test-only `MemoryStore`.

- [ ] **Step 1: Write the file (trait + fake + the fake's own tests)**

Create `src-tauri/src/drive/remote.rs`:

```rust
//! The storage boundary. Backup/restore orchestration is written against
//! `RemoteStore`, so it is tested end-to-end with `MemoryStore` and no network.
//! `gdrive.rs` is the only real implementation.

use std::future::Future;
use std::path::Path;

use serde::Serialize;

use super::plan::RemoteFile;

/// `Display` begins with a stable code the frontend maps to friendly copy
/// (`app/lib/drive-errors.ts`). Keep the codes in sync with that file.
#[derive(Debug, thiserror::Error)]
pub enum RemoteError {
	#[error("DRIVE_OFFLINE: {0}")]
	Offline(String),
	#[error("DRIVE_RECONNECT: {0}")]
	AuthRevoked(String),
	#[error("DRIVE_QUOTA: {0}")]
	QuotaExceeded(String),
	#[error("DRIVE_NOT_FOUND: {0}")]
	NotFound(String),
	#[error("DRIVE_ERROR: {0}")]
	Other(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RemoteBusiness {
	/// `plan::backup_key` of the business.
	pub key: String,
	pub name: String,
}

pub trait RemoteStore: Send + Sync {
	/// Every business that has a backup folder.
	fn list_businesses(&self) -> impl Future<Output = Result<Vec<RemoteBusiness>, RemoteError>> + Send;
	/// Create the business root if missing; keep its display name current.
	fn ensure_business(&self, key: &str, name: &str) -> impl Future<Output = Result<(), RemoteError>> + Send;
	/// EVERY file of the business, paths relative to its root, '/' separated.
	fn list(&self, key: &str) -> impl Future<Output = Result<Vec<RemoteFile>, RemoteError>> + Send;
	/// Create `path` from `local`. The caller trashes an existing file first.
	fn upload(&self, key: &str, path: &str, local: &Path) -> impl Future<Output = Result<(), RemoteError>> + Send;
	fn download(&self, key: &str, path: &str, local: &Path) -> impl Future<Output = Result<(), RemoteError>> + Send;
	/// Recoverable delete. Trashing a missing path is `NotFound`.
	fn trash(&self, key: &str, path: &str) -> impl Future<Output = Result<(), RemoteError>> + Send;
}

#[cfg(test)]
pub(crate) mod memory {
	use std::collections::BTreeMap;
	use std::sync::Mutex;

	use data_encoding::HEXLOWER;
	use md5::{Digest, Md5};

	use super::*;

	#[derive(Default)]
	struct Business {
		name: String,
		files: BTreeMap<String, Vec<u8>>,
	}

	/// In-memory `RemoteStore`. `fail_uploads_containing` makes any upload whose
	/// path contains the needle fail as `Offline` (simulates a dropped connection);
	/// `corrupt_downloads_of` flips the first byte of matching downloads ONCE.
	#[derive(Default)]
	pub struct MemoryStore {
		businesses: Mutex<BTreeMap<String, Business>>,
		pub uploads: Mutex<Vec<String>>,
		pub trashed: Mutex<Vec<String>>,
		pub fail_uploads_containing: Mutex<Option<String>>,
		pub corrupt_downloads_of: Mutex<Option<String>>,
	}

	impl MemoryStore {
		pub fn paths(&self, key: &str) -> Vec<String> {
			self.businesses.lock().unwrap().get(key).map(|b| b.files.keys().cloned().collect()).unwrap_or_default()
		}
		pub fn remove_silently(&self, key: &str, path: &str) {
			if let Some(b) = self.businesses.lock().unwrap().get_mut(key) {
				b.files.remove(path);
			}
		}
	}

	impl RemoteStore for MemoryStore {
		async fn list_businesses(&self) -> Result<Vec<RemoteBusiness>, RemoteError> {
			Ok(self.businesses.lock().unwrap().iter().map(|(k, b)| RemoteBusiness { key: k.clone(), name: b.name.clone() }).collect())
		}

		async fn ensure_business(&self, key: &str, name: &str) -> Result<(), RemoteError> {
			self.businesses.lock().unwrap().entry(key.to_string()).or_default().name = name.to_string();
			Ok(())
		}

		async fn list(&self, key: &str) -> Result<Vec<RemoteFile>, RemoteError> {
			let guard = self.businesses.lock().unwrap();
			let Some(b) = guard.get(key) else { return Ok(Vec::new()) };
			Ok(b.files
				.iter()
				.map(|(path, bytes)| RemoteFile {
					path: path.clone(),
					size: bytes.len() as u64,
					md5: Some(HEXLOWER.encode(&Md5::digest(bytes))),
				})
				.collect())
		}

		async fn upload(&self, key: &str, path: &str, local: &Path) -> Result<(), RemoteError> {
			if let Some(needle) = self.fail_uploads_containing.lock().unwrap().as_deref() {
				if path.contains(needle) {
					return Err(RemoteError::Offline("simulated drop".into()));
				}
			}
			let bytes = std::fs::read(local).map_err(|e| RemoteError::Other(e.to_string()))?;
			let mut guard = self.businesses.lock().unwrap();
			let b = guard.get_mut(key).ok_or_else(|| RemoteError::NotFound(key.to_string()))?;
			b.files.insert(path.to_string(), bytes);
			self.uploads.lock().unwrap().push(path.to_string());
			Ok(())
		}

		async fn download(&self, key: &str, path: &str, local: &Path) -> Result<(), RemoteError> {
			let mut bytes = {
				let guard = self.businesses.lock().unwrap();
				guard.get(key).and_then(|b| b.files.get(path)).cloned().ok_or_else(|| RemoteError::NotFound(path.to_string()))?
			};
			let mut corrupt = self.corrupt_downloads_of.lock().unwrap();
			if corrupt.as_deref().is_some_and(|needle| path.contains(needle)) {
				*corrupt = None; // once
				if let Some(first) = bytes.first_mut() {
					*first ^= 0xff;
				}
			}
			if let Some(parent) = local.parent() {
				std::fs::create_dir_all(parent).map_err(|e| RemoteError::Other(e.to_string()))?;
			}
			std::fs::write(local, bytes).map_err(|e| RemoteError::Other(e.to_string()))
		}

		async fn trash(&self, key: &str, path: &str) -> Result<(), RemoteError> {
			let mut guard = self.businesses.lock().unwrap();
			let b = guard.get_mut(key).ok_or_else(|| RemoteError::NotFound(key.to_string()))?;
			b.files.remove(path).ok_or_else(|| RemoteError::NotFound(path.to_string()))?;
			self.trashed.lock().unwrap().push(path.to_string());
			Ok(())
		}
	}

	#[test]
	fn memory_store_round_trips_a_file_with_checksum() {
		tauri::async_runtime::block_on(async {
			let dir = std::env::temp_dir().join(format!("sakoram-memstore-{}", uuid::Uuid::new_v4()));
			std::fs::create_dir_all(&dir).unwrap();
			let src = dir.join("src");
			std::fs::write(&src, b"hello").unwrap();

			let store = MemoryStore::default();
			store.ensure_business("k", "Acme").await.unwrap();
			store.upload("k", "attachments/a", &src).await.unwrap();
			let listed = store.list("k").await.unwrap();
			assert_eq!(listed[0].md5.as_deref(), Some("5d41402abc4b2a76b9719d911017c592"));

			let out = dir.join("out");
			store.download("k", "attachments/a", &out).await.unwrap();
			assert_eq!(std::fs::read(&out).unwrap(), b"hello");

			store.trash("k", "attachments/a").await.unwrap();
			assert!(store.list("k").await.unwrap().is_empty());
			assert!(matches!(store.trash("k", "attachments/a").await, Err(RemoteError::NotFound(_))));
		});
	}
}
```

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test drive::remote`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/drive
git commit -m "feat(drive): RemoteStore trait with an in-memory fake for orchestration tests"
```

---

### Task 5: Backup orchestration

**Files:**
- Create: `src-tauri/src/drive/backup.rs`
- Modify: `src-tauri/src/drive/mod.rs` (add `pub mod backup;`)

**Interfaces:**
- Consumes: everything produced by Tasks 1, 3, 4.
- Produces: `Progress { stage: &'static str, done: usize, total: usize }` (`Serialize`, `Clone`); `ProgressFn<'a> = &'a (dyn Fn(Progress) + Send + Sync)`; `CANCELLED: &str = "DRIVE_CANCELLED: Cancelled."`; `BackupInput { key, tenant_id, business_name, folder: PathBuf, work_dir: PathBuf, encrypted: bool, dek: Option<Zeroizing<[u8; 32]>>, device, created_at, app_version, schema_version: i32 }`; `BackupOutcome { snapshot, attachments_total, attachments_uploaded, skipped: Vec<String>, pruned_snapshots }` (`Serialize`); `run_backup<R: RemoteStore>(remote: &R, input: &BackupInput, progress: ProgressFn<'_>, cancel: &AtomicBool) -> Result<BackupOutcome, String>`. Stages emitted: `"snapshot"`, `"attachments"`, `"upload"`, `"cleanup"`.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/drive/backup.rs`:

```rust
//! One-way push of a business to a `RemoteStore`.
//!
//! Order matters: attachments first, sidecar manifest next, snapshot ZIP LAST.
//! The zip's existence is the commit marker — an interrupted run leaves no zip,
//! is not a backup, and the next run reuses the attachments already uploaded.

#[cfg(test)]
mod tests {
	use std::sync::atomic::AtomicBool;

	use super::*;
	use crate::drive::remote::memory::MemoryStore;
	use crate::drive::snapshot::tests::{make_business_folder, temp_dir};

	fn input(folder: PathBuf, created_at: &str) -> BackupInput {
		BackupInput {
			key: "k".into(),
			tenant_id: "acme".into(),
			business_name: "Acme".into(),
			folder,
			work_dir: temp_dir("backup-work"),
			encrypted: false,
			dek: None,
			device: "TEST-PC".into(),
			created_at: created_at.into(),
			app_version: "0.160.0".into(),
			schema_version: 53,
		}
	}

	fn quiet(_: Progress) {}

	#[test]
	fn first_backup_uploads_everything_and_the_zip_last() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			let folder = make_business_folder("first").await;
			let out = run_backup(&store, &input(folder, "2026-09-19T09:02:11Z"), &quiet, &AtomicBool::new(false)).await.unwrap();

			assert_eq!(out.attachments_total, 2);
			assert_eq!(out.attachments_uploaded, 2);
			assert_eq!(out.snapshot, "2026-09-19 09-02-11 UTC · TEST-PC");
			let uploads = store.uploads.lock().unwrap().clone();
			assert_eq!(uploads, vec![
				"attachments/bill/2/b.jpg".to_string(),
				"attachments/invoice/1/a.jpg".to_string(),
				"snapshots/2026-09-19 09-02-11 UTC · TEST-PC.manifest.json".to_string(),
				"snapshots/2026-09-19 09-02-11 UTC · TEST-PC.zip".to_string(),
			]);
		});
	}

	#[test]
	fn second_backup_uploads_no_attachments() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			let folder = make_business_folder("second").await;
			run_backup(&store, &input(folder.clone(), "2026-09-19T09:00:00Z"), &quiet, &AtomicBool::new(false)).await.unwrap();
			let out = run_backup(&store, &input(folder, "2026-09-20T09:00:00Z"), &quiet, &AtomicBool::new(false)).await.unwrap();
			assert_eq!(out.attachments_uploaded, 0);
			assert_eq!(out.attachments_total, 2);
		});
	}

	#[test]
	fn interrupted_run_leaves_no_snapshot_and_the_retry_reuses_attachments() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			let folder = make_business_folder("interrupted").await;
			*store.fail_uploads_containing.lock().unwrap() = Some(".zip".into());
			let err = run_backup(&store, &input(folder.clone(), "2026-09-19T09:00:00Z"), &quiet, &AtomicBool::new(false)).await.unwrap_err();
			assert!(err.starts_with("DRIVE_OFFLINE"));
			assert!(!store.paths("k").iter().any(|p| p.ends_with(".zip")));

			*store.fail_uploads_containing.lock().unwrap() = None;
			let out = run_backup(&store, &input(folder, "2026-09-19T10:00:00Z"), &quiet, &AtomicBool::new(false)).await.unwrap();
			assert_eq!(out.attachments_uploaded, 0);
		});
	}

	#[test]
	fn changed_attachment_is_replaced() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			let folder = make_business_folder("changed").await;
			run_backup(&store, &input(folder.clone(), "2026-09-19T09:00:00Z"), &quiet, &AtomicBool::new(false)).await.unwrap();
			std::fs::write(folder.join("attachments").join("invoice").join("1").join("a.jpg"), b"different").unwrap();
			let out = run_backup(&store, &input(folder, "2026-09-20T09:00:00Z"), &quiet, &AtomicBool::new(false)).await.unwrap();
			assert_eq!(out.attachments_uploaded, 1);
			assert!(store.trashed.lock().unwrap().contains(&"attachments/invoice/1/a.jpg".to_string()));
		});
	}

	#[test]
	fn retention_prunes_old_snapshots_and_unreferenced_attachments() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			let folder = make_business_folder("retention").await;
			// Day 1 references a.jpg + b.jpg. Then b.jpg is deleted locally.
			run_backup(&store, &input(folder.clone(), "2026-09-01T09:00:00Z"), &quiet, &AtomicBool::new(false)).await.unwrap();
			std::fs::remove_file(folder.join("attachments").join("bill").join("2").join("b.jpg")).unwrap();
			// KEEP_SNAPSHOTS more backups push day 1 out of retention.
			for day in 2..(2 + crate::drive::plan::KEEP_SNAPSHOTS) {
				let stamp = format!("2026-09-{day:02}T09:00:00Z");
				run_backup(&store, &input(folder.clone(), &stamp), &quiet, &AtomicBool::new(false)).await.unwrap();
			}
			let paths = store.paths("k");
			assert_eq!(paths.iter().filter(|p| p.ends_with(".zip")).count(), crate::drive::plan::KEEP_SNAPSHOTS);
			assert!(!paths.iter().any(|p| p.contains("2026-09-01")));
			// b.jpg survived while day 1 was retained; now nothing references it.
			assert!(!paths.contains(&"attachments/bill/2/b.jpg".to_string()));
			assert!(paths.contains(&"attachments/invoice/1/a.jpg".to_string()));
		});
	}

	#[test]
	fn cancel_stops_before_the_commit_marker() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			let folder = make_business_folder("cancel").await;
			let err = run_backup(&store, &input(folder, "2026-09-19T09:00:00Z"), &quiet, &AtomicBool::new(true)).await.unwrap_err();
			assert_eq!(err, CANCELLED);
			assert!(!store.paths("k").iter().any(|p| p.ends_with(".zip")));
		});
	}

	#[test]
	fn encrypted_business_without_a_session_key_is_refused() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			let folder = make_business_folder("locked").await;
			let mut i = input(folder, "2026-09-19T09:00:00Z");
			i.encrypted = true;
			let err = run_backup(&store, &i, &quiet, &AtomicBool::new(false)).await.unwrap_err();
			assert!(err.contains("Unlock"));
		});
	}

	#[test]
	fn work_dir_is_removed_even_on_failure() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			let folder = make_business_folder("cleanup").await;
			*store.fail_uploads_containing.lock().unwrap() = Some(".zip".into());
			let i = input(folder, "2026-09-19T09:00:00Z");
			let _ = run_backup(&store, &i, &quiet, &AtomicBool::new(false)).await;
			assert!(!i.work_dir.exists());
		});
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test drive::backup`
Expected: compile errors — `cannot find function run_backup`.

- [ ] **Step 3: Implement**

Insert above the test module:

```rust
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use zeroize::Zeroizing;

use super::plan::{self, LocalFile, RemoteFile, UploadAction, KEEP_SNAPSHOTS};
use super::remote::RemoteStore;
use super::snapshot::{self, Manifest, ManifestAttachment};

pub const CANCELLED: &str = "DRIVE_CANCELLED: Cancelled.";

#[derive(Debug, Clone, Serialize)]
pub struct Progress {
	pub stage: &'static str,
	pub done: usize,
	pub total: usize,
}

pub type ProgressFn<'a> = &'a (dyn Fn(Progress) + Send + Sync);

pub struct BackupInput {
	pub key: String,
	pub tenant_id: String,
	pub business_name: String,
	pub folder: PathBuf,
	/// Scratch dir, unique per run. Removed when the run ends, pass or fail.
	pub work_dir: PathBuf,
	pub encrypted: bool,
	/// Session DEK — required when `encrypted`.
	pub dek: Option<Zeroizing<[u8; 32]>>,
	pub device: String,
	/// ISO UTC, e.g. `2026-09-19T09:02:11Z`.
	pub created_at: String,
	pub app_version: String,
	pub schema_version: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupOutcome {
	pub snapshot: String,
	pub attachments_total: usize,
	pub attachments_uploaded: usize,
	/// Local attachments that could not be read — reported, never fatal.
	pub skipped: Vec<String>,
	pub pruned_snapshots: usize,
}

fn check_cancel(cancel: &AtomicBool) -> Result<(), String> {
	if cancel.load(Ordering::Relaxed) { Err(CANCELLED.to_string()) } else { Ok(()) }
}

pub async fn run_backup<R: RemoteStore>(
	remote: &R,
	input: &BackupInput,
	progress: ProgressFn<'_>,
	cancel: &AtomicBool,
) -> Result<BackupOutcome, String> {
	let result = run_inner(remote, input, progress, cancel).await;
	let _ = std::fs::remove_dir_all(&input.work_dir);
	result
}

async fn run_inner<R: RemoteStore>(
	remote: &R,
	input: &BackupInput,
	progress: ProgressFn<'_>,
	cancel: &AtomicBool,
) -> Result<BackupOutcome, String> {
	if input.encrypted && input.dek.is_none() {
		return Err("Unlock this business before backing it up.".into());
	}
	check_cancel(cancel)?;

	// 1. Snapshot the database + list attachments.
	progress(Progress { stage: "snapshot", done: 0, total: 1 });
	let dek = if input.encrypted { input.dek.as_deref() } else { None };
	let db_entries = snapshot::prepare_db(&input.folder, &input.work_dir, dek).await?;
	let (local, skipped) = snapshot::walk_attachments(&input.folder);
	let manifest = Manifest {
		format: "sakoram-drive-backup".into(),
		format_version: 1,
		tenant_id: input.tenant_id.clone(),
		business_name: input.business_name.clone(),
		schema_version: input.schema_version,
		app_version: input.app_version.clone(),
		created_at: input.created_at.clone(),
		device_name: plan::sanitize_device(&input.device),
		encrypted: input.encrypted,
		attachments: local.iter().map(|f| ManifestAttachment { path: f.path.clone(), size: f.size, md5: f.md5.clone() }).collect(),
	};
	let stem = plan::snapshot_stem(&input.created_at, &input.device);
	let zip_path = input.work_dir.join("snapshot.zip");
	snapshot::build_zip(&input.folder, &db_entries, &manifest, &zip_path)?;
	let sidecar_path = input.work_dir.join("snapshot.manifest.json");
	std::fs::write(&sidecar_path, serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?)
		.map_err(|e| format!("write manifest: {e}"))?;
	check_cancel(cancel)?;

	// 2. Attachments first — only the missing / changed ones.
	remote.ensure_business(&input.key, &input.business_name).await.map_err(|e| e.to_string())?;
	let remote_files = remote.list(&input.key).await.map_err(|e| e.to_string())?;
	let remote_attachments = under_attachments(&remote_files);
	let todo = plan::attachments_to_upload(&local, &remote_attachments);
	let total = todo.len();
	for (i, (rel, action)) in todo.iter().enumerate() {
		check_cancel(cancel)?;
		progress(Progress { stage: "attachments", done: i, total });
		let remote_path = format!("attachments/{rel}");
		if *action == UploadAction::Replace {
			remote.trash(&input.key, &remote_path).await.map_err(|e| e.to_string())?;
		}
		let local_path = snapshot::safe_rel_path(rel)
			.map(|p| input.folder.join("attachments").join(p))
			.ok_or_else(|| format!("Unsafe attachment path: {rel}"))?;
		remote.upload(&input.key, &remote_path, &local_path).await.map_err(|e| e.to_string())?;
	}
	progress(Progress { stage: "attachments", done: total, total });

	// 3. Sidecar, then the zip LAST (commit marker).
	check_cancel(cancel)?;
	progress(Progress { stage: "upload", done: 0, total: 1 });
	remote.upload(&input.key, &format!("snapshots/{stem}.manifest.json"), &sidecar_path).await.map_err(|e| e.to_string())?;
	check_cancel(cancel)?;
	remote.upload(&input.key, &format!("snapshots/{stem}.zip"), &zip_path).await.map_err(|e| e.to_string())?;
	progress(Progress { stage: "upload", done: 1, total: 1 });

	// 4. Retention. The backup is already complete — pruning is best-effort
	//    and a failure here must never turn a good backup into an error.
	progress(Progress { stage: "cleanup", done: 0, total: 1 });
	let pruned_snapshots = prune(remote, input, &stem, &local).await.unwrap_or(0);
	progress(Progress { stage: "cleanup", done: 1, total: 1 });

	Ok(BackupOutcome {
		snapshot: stem,
		attachments_total: local.len(),
		attachments_uploaded: total,
		skipped,
		pruned_snapshots,
	})
}

/// Files under `attachments/`, re-based so paths compare with `LocalFile.path`.
fn under_attachments(files: &[RemoteFile]) -> Vec<RemoteFile> {
	files
		.iter()
		.filter_map(|f| {
			f.path.strip_prefix("attachments/").map(|rel| RemoteFile { path: rel.to_string(), size: f.size, md5: f.md5.clone() })
		})
		.collect()
}

async fn prune<R: RemoteStore>(remote: &R, input: &BackupInput, current_stem: &str, current_local: &[LocalFile]) -> Result<usize, String> {
	let files = remote.list(&input.key).await.map_err(|e| e.to_string())?;
	let entries = plan::snapshot_entries(&files);
	let (retained, pruned) = plan::split_retained(&entries, KEEP_SNAPSHOTS);

	// Attachment lists of every retained snapshot. `None` = unreadable, which
	// switches attachment GC off entirely (see `plan::gc_attachments`).
	let mut manifests: Vec<Option<Vec<String>>> = Vec::new();
	for stem in &retained {
		if stem == current_stem {
			manifests.push(Some(current_local.iter().map(|f| f.path.clone()).collect()));
			continue;
		}
		let tmp = input.work_dir.join(format!("retained-{}.json", manifests.len()));
		let parsed = match remote.download(&input.key, &format!("snapshots/{stem}.manifest.json"), &tmp).await {
			Ok(()) => std::fs::read(&tmp).ok().and_then(|raw| serde_json::from_slice::<Manifest>(&raw).ok()),
			Err(_) => None,
		};
		manifests.push(parsed.map(|m| m.attachments.into_iter().map(|a| a.path).collect()));
	}

	for stem in &pruned {
		for suffix in [".zip", ".manifest.json"] {
			let path = format!("snapshots/{stem}{suffix}");
			if files.iter().any(|f| f.path == path) {
				let _ = remote.trash(&input.key, &path).await;
			}
		}
	}

	let remote_attachment_paths: Vec<String> = under_attachments(&files).into_iter().map(|f| f.path).collect();
	for rel in plan::gc_attachments(&manifests, &remote_attachment_paths) {
		let _ = remote.trash(&input.key, &format!("attachments/{rel}")).await;
	}
	Ok(pruned.len())
}
```

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test drive::backup`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/drive
git commit -m "feat(drive): backup orchestration — attachments first, zip as commit marker, retention"
```

---

### Task 6: Restore orchestration

**Files:**
- Create: `src-tauri/src/drive/restore.rs`
- Modify: `src-tauri/src/drive/mod.rs` (add `pub mod restore;`)

**Interfaces:**
- Consumes: `RemoteStore`, `plan::{snapshot_entries, parse_snapshot_stem}`, `snapshot::{Manifest, read_manifest_from_zip, extract_zip, safe_rel_path, file_md5}`, `backup::{Progress, ProgressFn, CANCELLED}`.
- Produces: `SnapshotInfo { stem, created_at, device, size: u64 }` (`Serialize`); `list_snapshots<R>(remote, key) -> Result<Vec<SnapshotInfo>, String>` (complete snapshots only, newest first); `fetch_snapshot<R>(remote, key, stem, work_dir: &Path) -> Result<(PathBuf, Manifest), String>`; `check_schema(manifest: &Manifest, current: i32) -> Result<(), String>`; `RestoreOutcome { attachments_total, attachments_restored, failed: Vec<String> }` (`Serialize`); `materialise<R>(remote, key, zip: &Path, manifest: &Manifest, dest: &Path, progress, cancel) -> Result<RestoreOutcome, String>`. Stages emitted: `"download"`, `"attachments"`.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/drive/restore.rs`:

```rust
//! Pull a snapshot back into a fresh business folder. Split in two so the
//! command layer can check the manifest (schema gate) and create the target
//! folder BETWEEN the download and anything being written to it.

#[cfg(test)]
mod tests {
	use std::sync::atomic::AtomicBool;

	use super::*;
	use crate::drive::backup::{run_backup, BackupInput};
	use crate::drive::remote::memory::MemoryStore;
	use crate::drive::snapshot::tests::{count_rows, make_business_folder, temp_dir};

	fn quiet(_: Progress) {}

	async fn backed_up(store: &MemoryStore, tag: &str, created_at: &str) -> PathBuf {
		let folder = make_business_folder(tag).await;
		let input = BackupInput {
			key: "k".into(),
			tenant_id: "acme".into(),
			business_name: "Acme".into(),
			folder: folder.clone(),
			work_dir: temp_dir("restore-bk-work"),
			encrypted: false,
			dek: None,
			device: "TEST-PC".into(),
			created_at: created_at.into(),
			app_version: "0.160.0".into(),
			schema_version: 53,
		};
		run_backup(store, &input, &quiet, &AtomicBool::new(false)).await.unwrap();
		folder
	}

	#[test]
	fn backup_then_restore_round_trips_db_and_attachments() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			let original = backed_up(&store, "rt", "2026-09-19T09:02:11Z").await;

			let snaps = list_snapshots(&store, "k").await.unwrap();
			assert_eq!(snaps.len(), 1);
			assert_eq!(snaps[0].created_at, "2026-09-19T09:02:11Z");
			assert_eq!(snaps[0].device, "TEST-PC");

			let work = temp_dir("rt-work");
			let (zip, manifest) = fetch_snapshot(&store, "k", &snaps[0].stem, &work).await.unwrap();
			check_schema(&manifest, 53).unwrap();

			let dest = temp_dir("rt-dest");
			let out = materialise(&store, "k", &zip, &manifest, &dest, &quiet, &AtomicBool::new(false)).await.unwrap();
			assert_eq!((out.attachments_total, out.attachments_restored), (2, 2));
			assert!(out.failed.is_empty());
			assert_eq!(count_rows(&dest.join("business.db")).await, 3);
			for rel in ["invoice/1/a.jpg", "bill/2/b.jpg"] {
				let a = std::fs::read(original.join("attachments").join(rel)).unwrap();
				let b = std::fs::read(dest.join("attachments").join(rel)).unwrap();
				assert_eq!(a, b);
			}
		});
	}

	#[test]
	fn snapshots_list_newest_first_and_hide_incomplete_ones() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			backed_up(&store, "list-a", "2026-09-01T09:00:00Z").await;
			backed_up(&store, "list-b", "2026-09-02T09:00:00Z").await;
			// A sidecar with no zip = an interrupted backup.
			store.remove_silently("k", "snapshots/2026-09-02 09-00-00 UTC · TEST-PC.zip");
			let snaps = list_snapshots(&store, "k").await.unwrap();
			assert_eq!(snaps.iter().map(|s| s.created_at.as_str()).collect::<Vec<_>>(), vec!["2026-09-01T09:00:00Z"]);
		});
	}

	#[test]
	fn a_backup_from_a_newer_app_is_refused_and_an_older_one_is_fine() {
		let mut m = crate::drive::snapshot::tests::manifest_for(vec![], false);
		m.schema_version = 54;
		assert!(check_schema(&m, 53).unwrap_err().contains("newer"));
		m.schema_version = 40;
		assert!(check_schema(&m, 53).is_ok());
	}

	#[test]
	fn a_corrupt_download_is_retried_once_then_succeeds() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			backed_up(&store, "retry", "2026-09-19T09:00:00Z").await;
			*store.corrupt_downloads_of.lock().unwrap() = Some("a.jpg".into()); // corrupts ONCE
			let snaps = list_snapshots(&store, "k").await.unwrap();
			let (zip, manifest) = fetch_snapshot(&store, "k", &snaps[0].stem, &temp_dir("retry-work")).await.unwrap();
			let out = materialise(&store, "k", &zip, &manifest, &temp_dir("retry-dest"), &quiet, &AtomicBool::new(false)).await.unwrap();
			assert_eq!(out.attachments_restored, 2);
		});
	}

	#[test]
	fn a_missing_attachment_is_reported_not_fatal_and_leaves_no_partial_file() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			backed_up(&store, "missing", "2026-09-19T09:00:00Z").await;
			store.remove_silently("k", "attachments/invoice/1/a.jpg");
			let snaps = list_snapshots(&store, "k").await.unwrap();
			let (zip, manifest) = fetch_snapshot(&store, "k", &snaps[0].stem, &temp_dir("missing-work")).await.unwrap();
			let dest = temp_dir("missing-dest");
			let out = materialise(&store, "k", &zip, &manifest, &dest, &quiet, &AtomicBool::new(false)).await.unwrap();
			assert_eq!(out.attachments_restored, 1);
			assert_eq!(out.failed, vec!["invoice/1/a.jpg".to_string()]);
			assert!(!dest.join("attachments").join("invoice").join("1").join("a.jpg").exists());
			assert_eq!(count_rows(&dest.join("business.db")).await, 3);
		});
	}

	#[test]
	fn an_unsafe_manifest_path_is_reported_and_never_written() {
		tauri::async_runtime::block_on(async {
			let store = MemoryStore::default();
			backed_up(&store, "unsafe", "2026-09-19T09:00:00Z").await;
			let snaps = list_snapshots(&store, "k").await.unwrap();
			let (zip, mut manifest) = fetch_snapshot(&store, "k", &snaps[0].stem, &temp_dir("unsafe-work")).await.unwrap();
			manifest.attachments[0].path = "../../escape.jpg".into();
			let dest = temp_dir("unsafe-dest");
			let out = materialise(&store, "k", &zip, &manifest, &dest, &quiet, &AtomicBool::new(false)).await.unwrap();
			assert_eq!(out.failed, vec!["../../escape.jpg".to_string()]);
			assert!(!dest.parent().unwrap().join("escape.jpg").exists());
		});
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test drive::restore`
Expected: compile errors — `cannot find function list_snapshots`.

- [ ] **Step 3: Implement**

Insert above the test module:

```rust
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

use super::backup::{Progress, ProgressFn, CANCELLED};
use super::plan;
use super::remote::RemoteStore;
use super::snapshot::{self, Manifest};

#[derive(Debug, Clone, Serialize)]
pub struct SnapshotInfo {
	pub stem: String,
	/// ISO UTC — the UI renders it in local time.
	pub created_at: String,
	pub device: String,
	pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestoreOutcome {
	pub attachments_total: usize,
	pub attachments_restored: usize,
	/// Manifest paths that could not be restored. The books are intact without
	/// them, so this is reported — never silent, never fatal.
	pub failed: Vec<String>,
}

/// Complete snapshots (zip present), newest first.
pub async fn list_snapshots<R: RemoteStore>(remote: &R, key: &str) -> Result<Vec<SnapshotInfo>, String> {
	let files = remote.list(key).await.map_err(|e| e.to_string())?;
	let mut out: Vec<SnapshotInfo> = plan::snapshot_entries(&files)
		.into_iter()
		.filter(|e| e.has_zip)
		.filter_map(|e| {
			let (created_at, device) = plan::parse_snapshot_stem(&e.stem)?;
			let zip_path = format!("snapshots/{}.zip", e.stem);
			let size = files.iter().find(|f| f.path == zip_path).map(|f| f.size).unwrap_or(0);
			Some(SnapshotInfo { stem: e.stem, created_at, device, size })
		})
		.collect();
	out.sort_by(|a, b| b.stem.cmp(&a.stem));
	Ok(out)
}

/// Download the snapshot zip into `work_dir` and read its manifest. Nothing is
/// written to the eventual business folder yet.
pub async fn fetch_snapshot<R: RemoteStore>(remote: &R, key: &str, stem: &str, work_dir: &Path) -> Result<(PathBuf, Manifest), String> {
	std::fs::create_dir_all(work_dir).map_err(|e| format!("create restore work dir: {e}"))?;
	let zip = work_dir.join("snapshot.zip");
	remote.download(key, &format!("snapshots/{stem}.zip"), &zip).await.map_err(|e| e.to_string())?;
	let manifest = snapshot::read_manifest_from_zip(&zip)?;
	Ok((zip, manifest))
}

/// Older backups migrate forward on Open; a NEWER one cannot be read by this build.
pub fn check_schema(manifest: &Manifest, current: i32) -> Result<(), String> {
	if manifest.schema_version > current {
		return Err(format!(
			"This backup was made by a newer version of Sakoram ({}). Update Sakoram, then restore again.",
			manifest.app_version
		));
	}
	Ok(())
}

/// Unzip into `dest`, then pull every manifest attachment to the same relative
/// path, verifying its MD5 (one retry on mismatch).
pub async fn materialise<R: RemoteStore>(
	remote: &R,
	key: &str,
	zip: &Path,
	manifest: &Manifest,
	dest: &Path,
	progress: ProgressFn<'_>,
	cancel: &AtomicBool,
) -> Result<RestoreOutcome, String> {
	progress(Progress { stage: "download", done: 0, total: 1 });
	snapshot::extract_zip(zip, dest)?;
	progress(Progress { stage: "download", done: 1, total: 1 });

	let total = manifest.attachments.len();
	let mut restored = 0;
	let mut failed = Vec::new();
	for (i, att) in manifest.attachments.iter().enumerate() {
		if cancel.load(Ordering::Relaxed) {
			return Err(CANCELLED.to_string());
		}
		progress(Progress { stage: "attachments", done: i, total });
		let Some(rel) = snapshot::safe_rel_path(&att.path) else {
			failed.push(att.path.clone());
			continue;
		};
		let target = dest.join("attachments").join(rel);
		let remote_path = format!("attachments/{}", att.path);
		let mut ok = false;
		for _attempt in 0..2 {
			if remote.download(key, &remote_path, &target).await.is_err() {
				break; // missing / offline — a retry won't conjure it
			}
			if snapshot::file_md5(&target).map(|m| m == att.md5).unwrap_or(false) {
				ok = true;
				break;
			}
		}
		if ok {
			restored += 1;
		} else {
			let _ = std::fs::remove_file(&target);
			failed.push(att.path.clone());
		}
	}
	progress(Progress { stage: "attachments", done: total, total });
	Ok(RestoreOutcome { attachments_total: total, attachments_restored: restored, failed })
}
```

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test drive::`
Expected: every `drive::` test passes (plan 10, state 3, snapshot 8, remote 1, backup 8, restore 6).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/drive
git commit -m "feat(drive): restore orchestration with checksum-verified attachments"
```

---

### Task 7: Google OAuth — PKCE, loopback listener, tokens, keychain

**Files:**
- Create: `src-tauri/src/drive/oauth.rs`
- Modify: `src-tauri/src/drive/mod.rs` (add `pub mod oauth;`)

**Interfaces:**
- Consumes: `remote::RemoteError`.
- Produces: `SCOPE`, `client_creds() -> Option<(&'static str, &'static str)>`, `random_token() -> String`, `pkce_challenge(verifier: &str) -> String`, `auth_url(client_id, redirect_uri, challenge, state) -> String`, `PendingAuth` (opaque), `begin(client_id: &str) -> Result<(String, PendingAuth), String>` (async; returns the consent URL), `finish(pending: PendingAuth, client_id, client_secret) -> Result<Tokens, String>` (async; waits ≤ 5 min), `Tokens { access_token, expires_in: u64, refresh_token: Option<String> }`, `refresh(http: &reqwest::Client, client_id, client_secret, refresh_token) -> Result<Tokens, RemoteError>` (async), `revoke(http, token)` (async, best-effort), `store_refresh_token(&str) -> Result<(), String>`, `load_refresh_token() -> Option<String>`, `clear_refresh_token()`.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/drive/oauth.rs`:

```rust
//! OAuth 2.0 for installed apps: system browser + PKCE + a one-shot loopback
//! listener on 127.0.0.1. The refresh token lives ONLY in the OS keychain —
//! never in tenants.json, backup.json, or a (portable) business folder.

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn pkce_challenge_matches_the_rfc_7636_appendix_b_vector() {
		assert_eq!(
			pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
			"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
		);
	}

	#[test]
	fn random_tokens_are_url_safe_43_chars_and_unique() {
		let a = random_token();
		assert_eq!(a.len(), 43);
		assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
		assert_ne!(a, random_token());
	}

	#[test]
	fn auth_url_requests_offline_access_with_only_the_drive_file_scope() {
		let url = auth_url("cid.apps.googleusercontent.com", "http://127.0.0.1:5123", "CHAL", "STATE");
		let parsed = reqwest::Url::parse(&url).unwrap();
		let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
		assert_eq!(parsed.host_str(), Some("accounts.google.com"));
		assert_eq!(q["scope"], "https://www.googleapis.com/auth/drive.file");
		assert_eq!(q["redirect_uri"], "http://127.0.0.1:5123");
		assert_eq!(q["code_challenge"], "CHAL");
		assert_eq!(q["code_challenge_method"], "S256");
		assert_eq!(q["state"], "STATE");
		assert_eq!(q["access_type"], "offline");
		assert_eq!(q["prompt"], "consent");
		assert_eq!(q["response_type"], "code");
	}

	#[test]
	fn loopback_listener_delivers_the_code_and_rejects_a_wrong_state() {
		tauri::async_runtime::block_on(async {
			let (url, pending) = begin("cid").await.unwrap();
			let parsed = reqwest::Url::parse(&url).unwrap();
			let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
			let redirect = q["redirect_uri"].clone();

			// Simulate Google redirecting the browser back with a FORGED state.
			let http = reqwest::Client::new();
			http.get(format!("{redirect}/?code=abc&state=forged")).send().await.unwrap();
			let err = wait_for_code(pending).await.unwrap_err();
			assert!(err.contains("state"));
		});
	}

	#[test]
	fn loopback_listener_returns_the_code_for_the_right_state() {
		tauri::async_runtime::block_on(async {
			let (url, pending) = begin("cid").await.unwrap();
			let parsed = reqwest::Url::parse(&url).unwrap();
			let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
			let http = reqwest::Client::new();
			http.get(format!("{}/?code=abc&state={}", q["redirect_uri"], q["state"])).send().await.unwrap();
			let (code, _verifier, _redirect) = wait_for_code(pending).await.unwrap();
			assert_eq!(code, "abc");
		});
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test drive::oauth`
Expected: compile errors — `cannot find function pkce_challenge`.

- [ ] **Step 3: Implement**

Insert above the test module:

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::Query;
use axum::response::Html;
use axum::routing::get;
use axum::Router;
use data_encoding::BASE64URL_NOPAD;
use keyring::Entry;
use rand_core::{OsRng, RngCore};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::sync::oneshot;

use super::remote::RemoteError;

pub const SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT: &str = "https://oauth2.googleapis.com/revoke";
const KEYRING_SERVICE: &str = "com.sakoram.billing.gdrive";
const KEYRING_USER: &str = "refresh_token";
const CONSENT_TIMEOUT: Duration = Duration::from_secs(300);

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Sakoram</title>\
<body style=\"font-family:system-ui;text-align:center;padding-top:20vh\">\
<h2>You can close this tab</h2><p>Return to Sakoram to finish connecting Google Drive.</p></body>";

/// Compile-time Google OAuth client. Google documents that an installed-app
/// "secret" is not confidential, but it still stays out of the repo — CI
/// injects it. `None` ⇒ the whole feature reports itself as not configured.
pub fn client_creds() -> Option<(&'static str, &'static str)> {
	match (option_env!("SAKORAM_GOOGLE_CLIENT_ID"), option_env!("SAKORAM_GOOGLE_CLIENT_SECRET")) {
		(Some(id), Some(secret)) if !id.is_empty() && !secret.is_empty() => Some((id, secret)),
		_ => None,
	}
}

/// 32 random bytes, base64url — a valid PKCE verifier (43 chars) and `state`.
pub fn random_token() -> String {
	let mut buf = [0u8; 32];
	OsRng.fill_bytes(&mut buf);
	BASE64URL_NOPAD.encode(&buf)
}

pub fn pkce_challenge(verifier: &str) -> String {
	BASE64URL_NOPAD.encode(&Sha256::digest(verifier.as_bytes()))
}

pub fn auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
	reqwest::Url::parse_with_params(AUTH_ENDPOINT, &[
		("client_id", client_id),
		("redirect_uri", redirect_uri),
		("response_type", "code"),
		("scope", SCOPE),
		("code_challenge", challenge),
		("code_challenge_method", "S256"),
		("state", state),
		// Both are needed for Google to hand back a refresh token every time.
		("access_type", "offline"),
		("prompt", "consent"),
	])
	.expect("static endpoint is a valid URL")
	.to_string()
}

/// An authorisation in flight. Dropping it shuts the loopback listener down.
pub struct PendingAuth {
	verifier: String,
	state: String,
	redirect_uri: String,
	rx: oneshot::Receiver<HashMap<String, String>>,
	_shutdown: oneshot::Sender<()>,
}

/// Bind the loopback listener and build the consent URL the caller opens in
/// the system browser.
pub async fn begin(client_id: &str) -> Result<(String, PendingAuth), String> {
	let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| format!("could not start sign-in listener: {e}"))?;
	let port = listener.local_addr().map_err(|e| e.to_string())?.port();
	let redirect_uri = format!("http://127.0.0.1:{port}");

	let (tx, rx) = oneshot::channel::<HashMap<String, String>>();
	let tx = Arc::new(Mutex::new(Some(tx)));
	let router = Router::new().route(
		"/",
		get(move |Query(params): Query<HashMap<String, String>>| {
			let tx = tx.clone();
			async move {
				if let Some(tx) = tx.lock().unwrap().take() {
					let _ = tx.send(params);
				}
				Html(DONE_PAGE)
			}
		}),
	);
	let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
	tokio::spawn(async move {
		let _ = axum::serve(listener, router)
			.with_graceful_shutdown(async {
				let _ = shutdown_rx.await;
			})
			.await;
	});

	let verifier = random_token();
	let state = random_token();
	let url = auth_url(client_id, &redirect_uri, &pkce_challenge(&verifier), &state);
	Ok((url, PendingAuth { verifier, state, redirect_uri, rx, _shutdown: shutdown_tx }))
}

/// Wait for the browser redirect → `(code, verifier, redirect_uri)`.
async fn wait_for_code(pending: PendingAuth) -> Result<(String, String, String), String> {
	let PendingAuth { verifier, state, redirect_uri, rx, _shutdown } = pending;
	let params = tokio::time::timeout(CONSENT_TIMEOUT, rx)
		.await
		.map_err(|_| "Timed out waiting for Google sign-in.".to_string())?
		.map_err(|_| "Sign-in was interrupted.".to_string())?;
	if let Some(err) = params.get("error") {
		return Err(format!("Google sign-in was declined ({err})."));
	}
	if params.get("state").map(String::as_str) != Some(state.as_str()) {
		return Err("Sign-in response had an unexpected state — ignored for safety.".into());
	}
	let code = params.get("code").cloned().ok_or_else(|| "Google did not return an authorisation code.".to_string())?;
	Ok((code, verifier, redirect_uri))
}

#[derive(Debug, Clone, Deserialize)]
pub struct Tokens {
	pub access_token: String,
	pub expires_in: u64,
	#[serde(default)]
	pub refresh_token: Option<String>,
}

pub async fn finish(pending: PendingAuth, client_id: &str, client_secret: &str) -> Result<Tokens, String> {
	let (code, verifier, redirect_uri) = wait_for_code(pending).await?;
	let http = reqwest::Client::new();
	let resp = http
		.post(TOKEN_ENDPOINT)
		.form(&[
			("code", code.as_str()),
			("client_id", client_id),
			("client_secret", client_secret),
			("redirect_uri", redirect_uri.as_str()),
			("grant_type", "authorization_code"),
			("code_verifier", verifier.as_str()),
		])
		.send()
		.await
		.map_err(|e| format!("DRIVE_OFFLINE: {e}"))?;
	if !resp.status().is_success() {
		return Err(format!("Google rejected the sign-in ({}).", resp.status()));
	}
	resp.json::<Tokens>().await.map_err(|e| format!("Unexpected token response: {e}"))
}

/// Exchange the refresh token for an access token. `invalid_grant` means the
/// user revoked access (or the token expired) → `AuthRevoked`, which the UI
/// turns into a "reconnect Google Drive" prompt.
pub async fn refresh(http: &reqwest::Client, client_id: &str, client_secret: &str, refresh_token: &str) -> Result<Tokens, RemoteError> {
	let resp = http
		.post(TOKEN_ENDPOINT)
		.form(&[
			("client_id", client_id),
			("client_secret", client_secret),
			("refresh_token", refresh_token),
			("grant_type", "refresh_token"),
		])
		.send()
		.await
		.map_err(|e| RemoteError::Offline(e.to_string()))?;
	let status = resp.status();
	if status.is_success() {
		return resp.json::<Tokens>().await.map_err(|e| RemoteError::Other(e.to_string()));
	}
	let body = resp.text().await.unwrap_or_default();
	if body.contains("invalid_grant") {
		Err(RemoteError::AuthRevoked("Google Drive access was revoked or has expired.".into()))
	} else {
		Err(RemoteError::Other(format!("token refresh failed ({status})")))
	}
}

/// Best-effort: tell Google to invalidate the token on Disconnect.
pub async fn revoke(http: &reqwest::Client, token: &str) {
	let _ = http.post(REVOKE_ENDPOINT).form(&[("token", token)]).send().await;
}

pub fn store_refresh_token(token: &str) -> Result<(), String> {
	Entry::new(KEYRING_SERVICE, KEYRING_USER)
		.and_then(|e| e.set_password(token))
		.map_err(|e| format!("Could not save the Google sign-in to the system keychain: {e}"))
}

pub fn load_refresh_token() -> Option<String> {
	Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()?.get_password().ok().filter(|t| !t.is_empty())
}

pub fn clear_refresh_token() {
	if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER) {
		let _ = entry.delete_credential();
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test drive::oauth`
Expected: 5 passed. (The two listener tests bind a real loopback port; they need no internet.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/drive
git commit -m "feat(drive): google oauth — pkce, loopback listener, keychain-stored refresh token"
```

---

### Task 8: Google Drive implementation of `RemoteStore`

**Files:**
- Create: `src-tauri/src/drive/gdrive.rs`
- Modify: `src-tauri/src/drive/mod.rs` (add `pub mod gdrive;`)

**Interfaces:**
- Consumes: `remote::{RemoteStore, RemoteError, RemoteBusiness}`, `plan::{RemoteFile, fits_app_property}`, `oauth::refresh`.
- Produces: `GDrive::new(client_id: &str, client_secret: &str, refresh_token: String) -> GDrive`, `GDrive::account_email(&self) -> Result<String, RemoteError>` (async), `impl RemoteStore for GDrive`, pure helpers `map_status(status: u16, body: &str) -> RemoteError` and `escape_q(&str) -> String`.

**Drive data model (every object the app creates carries `appProperties`):**

| Object | `skKind` | Other properties |
|---|---|---|
| `Sakoram Backups` folder | `root` | — |
| `<Business name>` folder | `business` | `skKey` |
| sub-folders (`snapshots`, `attachments/…`) | `dir` | `skKey` |
| every uploaded file | `file` | `skKey`, `skPath` (path relative to the business root) |

`list` is ONE paginated query on `skKey` + `skKind='file'`; sub-folders exist only so the tree is human-browsable for a by-hand restore.

There is no automated test for the HTTP calls (they need a real Google account — covered by the manual E2E checklist in Task 13). The two pure helpers are unit-tested.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/drive/gdrive.rs`:

```rust
//! `RemoteStore` over the Google Drive v3 REST API. Hand-written: six endpoints
//! do not justify a generated SDK crate.

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn status_mapping_picks_the_code_the_ui_keys_on() {
		assert!(matches!(map_status(401, ""), RemoteError::AuthRevoked(_)));
		assert!(matches!(map_status(403, r#"{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}"#), RemoteError::QuotaExceeded(_)));
		assert!(matches!(map_status(403, r#"{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}"#), RemoteError::Other(_)));
		assert!(matches!(map_status(404, ""), RemoteError::NotFound(_)));
		assert!(matches!(map_status(500, "boom"), RemoteError::Other(_)));
	}

	#[test]
	fn query_values_escape_quotes_and_backslashes() {
		assert_eq!(escape_q("O'Brien \\ Sons"), "O\\'Brien \\\\ Sons");
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test drive::gdrive`
Expected: compile errors — `cannot find function map_status`.

- [ ] **Step 3: Implement**

Insert above the test module:

```rust
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;

use super::oauth;
use super::plan::{fits_app_property, RemoteFile};
use super::remote::{RemoteBusiness, RemoteError, RemoteStore};

const API: &str = "https://www.googleapis.com/drive/v3";
const UPLOAD_API: &str = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
const FOLDER_MIME: &str = "application/vnd.google-apps.folder";
const ROOT_NAME: &str = "Sakoram Backups";

pub fn map_status(status: u16, body: &str) -> RemoteError {
	match status {
		401 => RemoteError::AuthRevoked("Google Drive sign-in is no longer valid.".into()),
		403 if body.contains("storageQuotaExceeded") => RemoteError::QuotaExceeded("Your Google Drive is full.".into()),
		404 => RemoteError::NotFound("Not found on Google Drive.".into()),
		_ => RemoteError::Other(format!("Google Drive returned {status}: {}", body.chars().take(200).collect::<String>())),
	}
}

/// Escape a value for a Drive `q` string literal.
pub fn escape_q(raw: &str) -> String {
	raw.replace('\\', "\\\\").replace('\'', "\\'")
}

#[derive(Deserialize)]
struct FileList {
	#[serde(default, rename = "nextPageToken")]
	next_page_token: Option<String>,
	#[serde(default)]
	files: Vec<DriveFile>,
}

#[derive(Deserialize)]
struct DriveFile {
	id: String,
	#[serde(default)]
	name: String,
	/// Drive serialises int64 as a JSON string.
	#[serde(default)]
	size: Option<String>,
	#[serde(default, rename = "md5Checksum")]
	md5: Option<String>,
	#[serde(default, rename = "appProperties")]
	props: HashMap<String, String>,
}

pub struct GDrive {
	http: reqwest::Client,
	client_id: String,
	client_secret: String,
	refresh_token: String,
	access: tokio::sync::Mutex<Option<(String, Instant)>>,
	/// `"<key>|<path>"` → Drive id. Folder paths end with '/'; `"<key>|"` is the
	/// business root; `"|"` is the `Sakoram Backups` root.
	ids: Mutex<HashMap<String, String>>,
}

impl GDrive {
	pub fn new(client_id: &str, client_secret: &str, refresh_token: String) -> Self {
		let http = reqwest::Client::builder().timeout(Duration::from_secs(120)).build().expect("reqwest client");
		Self {
			http,
			client_id: client_id.into(),
			client_secret: client_secret.into(),
			refresh_token,
			access: tokio::sync::Mutex::new(None),
			ids: Mutex::new(HashMap::new()),
		}
	}

	async fn token(&self) -> Result<String, RemoteError> {
		let mut guard = self.access.lock().await;
		if let Some((token, expires)) = guard.as_ref() {
			if Instant::now() + Duration::from_secs(60) < *expires {
				return Ok(token.clone());
			}
		}
		let fresh = oauth::refresh(&self.http, &self.client_id, &self.client_secret, &self.refresh_token).await?;
		let expires = Instant::now() + Duration::from_secs(fresh.expires_in);
		*guard = Some((fresh.access_token.clone(), expires));
		Ok(fresh.access_token)
	}

	/// Send, mapping transport failures to `Offline` and HTTP failures through `map_status`.
	async fn send(&self, req: reqwest::RequestBuilder) -> Result<reqwest::Response, RemoteError> {
		let resp = req.bearer_auth(self.token().await?).send().await.map_err(|e| RemoteError::Offline(e.to_string()))?;
		if resp.status().is_success() {
			return Ok(resp);
		}
		let status = resp.status().as_u16();
		let body = resp.text().await.unwrap_or_default();
		Err(map_status(status, &body))
	}

	async fn query(&self, q: &str) -> Result<Vec<DriveFile>, RemoteError> {
		let mut out = Vec::new();
		let mut page: Option<String> = None;
		loop {
			let mut params = vec![
				("q", q.to_string()),
				("spaces", "drive".to_string()),
				("pageSize", "1000".to_string()),
				("fields", "nextPageToken,files(id,name,size,md5Checksum,appProperties)".to_string()),
			];
			if let Some(token) = &page {
				params.push(("pageToken", token.clone()));
			}
			let list: FileList = self
				.send(self.http.get(format!("{API}/files")).query(&params))
				.await?
				.json()
				.await
				.map_err(|e| RemoteError::Other(e.to_string()))?;
			out.extend(list.files);
			match list.next_page_token {
				Some(next) => page = Some(next),
				None => return Ok(out),
			}
		}
	}

	async fn create_folder(&self, name: &str, parent: Option<&str>, props: serde_json::Value) -> Result<String, RemoteError> {
		let mut meta = json!({ "name": name, "mimeType": FOLDER_MIME, "appProperties": props });
		if let Some(parent) = parent {
			meta["parents"] = json!([parent]);
		}
		let created: DriveFile = self
			.send(self.http.post(format!("{API}/files")).query(&[("fields", "id")]).json(&meta))
			.await?
			.json()
			.await
			.map_err(|e| RemoteError::Other(e.to_string()))?;
		Ok(created.id)
	}

	fn cached(&self, cache_key: &str) -> Option<String> {
		self.ids.lock().unwrap().get(cache_key).cloned()
	}

	fn remember(&self, cache_key: String, id: String) {
		self.ids.lock().unwrap().insert(cache_key, id);
	}

	async fn root_id(&self) -> Result<String, RemoteError> {
		if let Some(id) = self.cached("|") {
			return Ok(id);
		}
		let q = format!("mimeType='{FOLDER_MIME}' and trashed=false and appProperties has {{ key='skKind' and value='root' }}");
		let id = match self.query(&q).await?.into_iter().next() {
			Some(found) => found.id,
			None => self.create_folder(ROOT_NAME, None, json!({ "skKind": "root" })).await?,
		};
		self.remember("|".into(), id.clone());
		Ok(id)
	}

	async fn find_business(&self, key: &str) -> Result<Option<DriveFile>, RemoteError> {
		let q = format!(
			"mimeType='{FOLDER_MIME}' and trashed=false and appProperties has {{ key='skKind' and value='business' }} and appProperties has {{ key='skKey' and value='{}' }}",
			escape_q(key)
		);
		Ok(self.query(&q).await?.into_iter().next())
	}

	async fn business_id(&self, key: &str) -> Result<String, RemoteError> {
		let cache_key = format!("{key}|");
		if let Some(id) = self.cached(&cache_key) {
			return Ok(id);
		}
		let found = self.find_business(key).await?.ok_or_else(|| RemoteError::NotFound("No backup folder for this business.".into()))?;
		self.remember(cache_key, found.id.clone());
		Ok(found.id)
	}

	/// Id of the folder that should hold `path` (e.g. `attachments/invoice/1/a.jpg`
	/// → the `attachments/invoice/1/` folder), creating missing levels.
	async fn parent_folder_id(&self, key: &str, path: &str) -> Result<String, RemoteError> {
		let mut parent = self.business_id(key).await?;
		let mut walked = String::new();
		let segments: Vec<&str> = path.split('/').collect();
		for segment in &segments[..segments.len().saturating_sub(1)] {
			walked.push_str(segment);
			walked.push('/');
			let cache_key = format!("{key}|{walked}");
			if let Some(id) = self.cached(&cache_key) {
				parent = id;
				continue;
			}
			let q = format!(
				"'{parent}' in parents and name='{}' and mimeType='{FOLDER_MIME}' and trashed=false",
				escape_q(segment)
			);
			let id = match self.query(&q).await?.into_iter().next() {
				Some(found) => found.id,
				None => self.create_folder(segment, Some(&parent), json!({ "skKind": "dir", "skKey": key })).await?,
			};
			self.remember(cache_key, id.clone());
			parent = id;
		}
		Ok(parent)
	}

	async fn file_id(&self, key: &str, path: &str) -> Result<String, RemoteError> {
		let cache_key = format!("{key}|{path}");
		if let Some(id) = self.cached(&cache_key) {
			return Ok(id);
		}
		self.list(key).await?; // repopulates the id cache
		self.cached(&cache_key).ok_or_else(|| RemoteError::NotFound(path.to_string()))
	}

	/// The connected account, shown in Settings. Works with the `drive.file` scope.
	pub async fn account_email(&self) -> Result<String, RemoteError> {
		#[derive(Deserialize)]
		struct About {
			user: User,
		}
		#[derive(Deserialize)]
		struct User {
			#[serde(rename = "emailAddress")]
			email: String,
		}
		let about: About = self
			.send(self.http.get(format!("{API}/about")).query(&[("fields", "user(emailAddress)")]))
			.await?
			.json()
			.await
			.map_err(|e| RemoteError::Other(e.to_string()))?;
		Ok(about.user.email)
	}
}

impl RemoteStore for GDrive {
	async fn list_businesses(&self) -> Result<Vec<RemoteBusiness>, RemoteError> {
		let q = format!("mimeType='{FOLDER_MIME}' and trashed=false and appProperties has {{ key='skKind' and value='business' }}");
		Ok(self
			.query(&q)
			.await?
			.into_iter()
			.filter_map(|f| f.props.get("skKey").cloned().map(|key| RemoteBusiness { key, name: f.name }))
			.collect())
	}

	async fn ensure_business(&self, key: &str, name: &str) -> Result<(), RemoteError> {
		let id = match self.find_business(key).await? {
			Some(found) => {
				if found.name != name {
					// Folder name is cosmetic — keep it current after a rename.
					self.send(self.http.patch(format!("{API}/files/{}", found.id)).json(&json!({ "name": name }))).await?;
				}
				found.id
			}
			None => {
				let root = self.root_id().await?;
				self.create_folder(name, Some(&root), json!({ "skKind": "business", "skKey": key })).await?
			}
		};
		self.remember(format!("{key}|"), id);
		Ok(())
	}

	async fn list(&self, key: &str) -> Result<Vec<RemoteFile>, RemoteError> {
		let q = format!(
			"trashed=false and appProperties has {{ key='skKind' and value='file' }} and appProperties has {{ key='skKey' and value='{}' }}",
			escape_q(key)
		);
		let mut out = Vec::new();
		for f in self.query(&q).await? {
			let Some(path) = f.props.get("skPath").cloned() else { continue };
			self.remember(format!("{key}|{path}"), f.id);
			out.push(RemoteFile { path, size: f.size.and_then(|s| s.parse().ok()).unwrap_or(0), md5: f.md5 });
		}
		Ok(out)
	}

	async fn upload(&self, key: &str, path: &str, local: &Path) -> Result<(), RemoteError> {
		if !fits_app_property("skPath", path) {
			return Err(RemoteError::Other(format!("Path is too long to back up: {path}")));
		}
		let parent = self.parent_folder_id(key, path).await?;
		let name = path.rsplit('/').next().unwrap_or(path);
		let bytes = std::fs::read(local).map_err(|e| RemoteError::Other(format!("read {}: {e}", local.display())))?;
		let meta = json!({
			"name": name,
			"parents": [parent],
			"appProperties": { "skKind": "file", "skKey": key, "skPath": path },
		});
		// Resumable protocol, single PUT: the file only comes into existence when
		// the PUT completes, so a dropped connection never leaves a partial file.
		let init = self
			.send(self.http.post(UPLOAD_API).header("X-Upload-Content-Type", "application/octet-stream").json(&meta))
			.await?;
		let session = init
			.headers()
			.get(reqwest::header::LOCATION)
			.and_then(|v| v.to_str().ok())
			.map(str::to_string)
			.ok_or_else(|| RemoteError::Other("Google Drive did not open an upload session.".into()))?;
		let created: DriveFile = self
			.send(self.http.put(session).header(reqwest::header::CONTENT_TYPE, "application/octet-stream").body(bytes))
			.await?
			.json()
			.await
			.map_err(|e| RemoteError::Other(e.to_string()))?;
		self.remember(format!("{key}|{path}"), created.id);
		Ok(())
	}

	async fn download(&self, key: &str, path: &str, local: &Path) -> Result<(), RemoteError> {
		let id = self.file_id(key, path).await?;
		let bytes = self
			.send(self.http.get(format!("{API}/files/{id}")).query(&[("alt", "media")]))
			.await?
			.bytes()
			.await
			.map_err(|e| RemoteError::Offline(e.to_string()))?;
		if let Some(parent) = local.parent() {
			std::fs::create_dir_all(parent).map_err(|e| RemoteError::Other(e.to_string()))?;
		}
		std::fs::write(local, &bytes).map_err(|e| RemoteError::Other(format!("write {}: {e}", local.display())))
	}

	async fn trash(&self, key: &str, path: &str) -> Result<(), RemoteError> {
		let id = self.file_id(key, path).await?;
		self.send(self.http.patch(format!("{API}/files/{id}")).json(&json!({ "trashed": true }))).await?;
		self.ids.lock().unwrap().remove(&format!("{key}|{path}"));
		Ok(())
	}
}
```

- [ ] **Step 4: Run tests + a full build**

Run: `cd src-tauri && cargo test drive::gdrive && cargo check`
Expected: 2 passed; `cargo check` clean apart from `dead_code` warnings (nothing calls `GDrive` until Task 9). If the compiler reports a future is not `Send` because a `std::sync::MutexGuard` is held across an `.await`, the guard has leaked out of `cached`/`remember` — those helpers exist precisely so no guard crosses an await; keep all `ids` access inside them.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/drive
git commit -m "feat(drive): google drive v3 implementation of RemoteStore"
```

---

### Task 9: Tauri commands, registration, CI credentials

**Files:**
- Modify: `src-tauri/src/drive/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/tenants.rs` (three visibility changes), `src-tauri/src/data_io.rs` (one visibility change), `.github/workflows/release-windows.yml:108`, `.github/workflows/release-macos.yml:107`

**Interfaces:**
- Consumes: everything from Tasks 1–8; `tenants::{get_tenant, read_marker, create_business_folder, open_tenant, Tenant}`, `data_io::{current_iso_utc, SCHEMA_VERSION}`, `vault_fs::VaultSessions`.
- Produces (JS-visible commands, camelCase args): `drive_status() -> DriveStatus { configured, connected, email, reminder_days, last_backups }`, `drive_connect_begin() -> string` (consent URL), `drive_connect_finish() -> DriveStatus`, `drive_disconnect() -> DriveStatus`, `drive_set_reminder_days({ days: number | null }) -> DriveStatus`, `drive_backup_now({ tenantId }) -> BackupOutcome`, `drive_cancel()`, `drive_list_businesses() -> RemoteBusiness[]`, `drive_list_snapshots({ key }) -> SnapshotInfo[]`, `drive_restore({ key, stem, parentDir }) -> RestoreResult { tenant, attachments_total, attachments_restored, failed }`. Event `drive-progress` with payload `Progress { stage, done, total }`.

- [ ] **Step 1: Widen four private helpers**

- `src-tauri/src/tenants.rs`: `fn read_marker(` → `pub(crate) fn read_marker(`; `fn create_business_folder(` → `pub(crate) fn create_business_folder(`. (`get_tenant` and `open_tenant` are already `pub`.)
- `src-tauri/src/data_io.rs`: `fn current_iso_utc()` → `pub(crate) fn current_iso_utc()`.

- [ ] **Step 2: Write the commands**

Replace `src-tauri/src/drive/mod.rs` with:

```rust
// Google Drive backup & restore. See
// docs/superpowers/specs/2026-09-19-google-drive-backup-design.md.
//
// Backup is a manual, one-way push; restore is an explicit user action. There
// is no sync and NOTHING here may run on the window-close path.

pub mod backup;
pub mod gdrive;
pub mod oauth;
pub mod plan;
pub mod remote;
pub mod restore;
pub mod snapshot;
pub mod state;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::tenants::{self, Tenant};
use crate::vault_fs::VaultSessions;
use backup::{BackupInput, BackupOutcome, Progress};
use gdrive::GDrive;
use remote::{RemoteBusiness, RemoteStore};
use restore::SnapshotInfo;

#[derive(Default)]
pub struct DriveState {
	pending: Mutex<Option<oauth::PendingAuth>>,
	cancel: Arc<AtomicBool>,
	/// One Drive operation at a time — a backup and a restore must not interleave.
	busy: AtomicBool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DriveStatus {
	/// False when the build carries no Google client credentials — the UI hides the feature.
	pub configured: bool,
	pub connected: bool,
	pub email: Option<String>,
	pub reminder_days: Option<u32>,
	pub last_backups: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestoreResult {
	pub tenant: Tenant,
	pub attachments_total: usize,
	pub attachments_restored: usize,
	pub failed: Vec<String>,
}

fn prefs_path(app: &AppHandle) -> Result<PathBuf, String> {
	Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("backup.json"))
}

fn work_dir(app: &AppHandle) -> Result<PathBuf, String> {
	Ok(app
		.path()
		.app_local_data_dir()
		.map_err(|e| e.to_string())?
		.join("backup-work")
		.join(uuid::Uuid::new_v4().to_string()))
}

fn status(app: &AppHandle) -> Result<DriveStatus, String> {
	let prefs = state::load(&prefs_path(app)?);
	let configured = oauth::client_creds().is_some();
	let connected = configured && oauth::load_refresh_token().is_some();
	Ok(DriveStatus {
		configured,
		connected,
		email: if connected { prefs.account_email } else { None },
		reminder_days: prefs.reminder_days,
		last_backups: prefs.last_backups,
	})
}

fn client() -> Result<GDrive, String> {
	let (id, secret) = oauth::client_creds().ok_or("Google Drive backup is not configured in this build.")?;
	let token = oauth::load_refresh_token().ok_or("DRIVE_RECONNECT: Connect Google Drive first.")?;
	Ok(GDrive::new(id, secret, token))
}

/// Clears `busy` when dropped, so every exit path releases it.
struct BusyGuard<'a>(&'a AtomicBool);
impl Drop for BusyGuard<'_> {
	fn drop(&mut self) {
		self.0.store(false, Ordering::SeqCst);
	}
}

fn begin_operation(drive: &DriveState) -> Result<BusyGuard<'_>, String> {
	if drive.busy.swap(true, Ordering::SeqCst) {
		return Err("Another Google Drive operation is already running.".into());
	}
	drive.cancel.store(false, Ordering::SeqCst);
	Ok(BusyGuard(&drive.busy))
}

/// A revoked grant means the stored token is dead weight — drop it so the UI
/// flips to "not connected" instead of failing the same way every time.
fn note_error(err: &str) {
	if err.starts_with("DRIVE_RECONNECT") {
		oauth::clear_refresh_token();
	}
}

#[tauri::command]
pub fn drive_status(app: AppHandle) -> Result<DriveStatus, String> {
	status(&app)
}

#[tauri::command]
pub async fn drive_connect_begin(drive: State<'_, DriveState>) -> Result<String, String> {
	let (id, _) = oauth::client_creds().ok_or("Google Drive backup is not configured in this build.")?;
	let (url, pending) = oauth::begin(id).await?;
	// Replacing a stale PendingAuth drops it, which shuts its listener down.
	*drive.pending.lock().unwrap() = Some(pending);
	Ok(url)
}

#[tauri::command]
pub async fn drive_connect_finish(app: AppHandle, drive: State<'_, DriveState>) -> Result<DriveStatus, String> {
	let (id, secret) = oauth::client_creds().ok_or("Google Drive backup is not configured in this build.")?;
	// take() BEFORE awaiting — a std MutexGuard must never cross an await.
	let pending = drive.pending.lock().unwrap().take().ok_or("No Google sign-in is in progress.")?;
	let tokens = oauth::finish(pending, id, secret).await?;
	let refresh = tokens.refresh_token.ok_or("Google did not grant offline access. Try connecting again.")?;
	oauth::store_refresh_token(&refresh)?;

	let email = GDrive::new(id, secret, refresh).account_email().await.ok();
	let path = prefs_path(&app)?;
	let mut prefs = state::load(&path);
	prefs.account_email = email;
	state::save(&path, &prefs)?;
	status(&app)
}

#[tauri::command]
pub async fn drive_disconnect(app: AppHandle) -> Result<DriveStatus, String> {
	if let Some(token) = oauth::load_refresh_token() {
		oauth::revoke(&reqwest::Client::new(), &token).await;
	}
	oauth::clear_refresh_token();
	let path = prefs_path(&app)?;
	let mut prefs = state::load(&path);
	prefs.account_email = None;
	state::save(&path, &prefs)?;
	status(&app)
}

#[tauri::command]
pub fn drive_set_reminder_days(app: AppHandle, days: Option<u32>) -> Result<DriveStatus, String> {
	let path = prefs_path(&app)?;
	let mut prefs = state::load(&path);
	prefs.reminder_days = days;
	state::save(&path, &prefs)?;
	status(&app)
}

#[tauri::command]
pub fn drive_cancel(drive: State<'_, DriveState>) {
	drive.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn drive_backup_now(
	app: AppHandle,
	drive: State<'_, DriveState>,
	sessions: State<'_, VaultSessions>,
	tenant_id: String,
) -> Result<BackupOutcome, String> {
	let _busy = begin_operation(&drive)?;
	let tenant = tenants::get_tenant(&app, &tenant_id)?;
	let folder = PathBuf::from(&tenant.path);
	if !folder.join("business.db").exists() {
		return Err("Open (and unlock) this business before backing it up.".into());
	}
	let marker = tenants::read_marker(&folder)?;
	let created_at = crate::data_io::current_iso_utc();
	let input = BackupInput {
		key: plan::backup_key(&marker.id, &marker.created_at),
		tenant_id: tenant.id.clone(),
		business_name: tenant.name.clone(),
		folder,
		work_dir: work_dir(&app)?,
		encrypted: tenant.encrypted,
		dek: if tenant.encrypted { sessions.get(&tenant.id) } else { None },
		device: tauri_plugin_os::hostname(),
		created_at: created_at.clone(),
		app_version: env!("CARGO_PKG_VERSION").to_string(),
		schema_version: crate::data_io::SCHEMA_VERSION,
	};

	let remote = client()?;
	let emitter = app.clone();
	let progress = move |p: Progress| {
		let _ = emitter.emit("drive-progress", p);
	};
	let outcome = backup::run_backup(&remote, &input, &progress, &drive.cancel).await.inspect_err(|e| note_error(e))?;

	let path = prefs_path(&app)?;
	let mut prefs = state::load(&path);
	prefs.last_backups.insert(tenant.id, created_at);
	state::save(&path, &prefs)?;
	Ok(outcome)
}

#[tauri::command]
pub async fn drive_list_businesses() -> Result<Vec<RemoteBusiness>, String> {
	client()?.list_businesses().await.map_err(|e| e.to_string()).inspect_err(|e| note_error(e))
}

#[tauri::command]
pub async fn drive_list_snapshots(key: String) -> Result<Vec<SnapshotInfo>, String> {
	restore::list_snapshots(&client()?, &key).await.inspect_err(|e| note_error(e))
}

#[tauri::command]
pub async fn drive_restore(
	app: AppHandle,
	drive: State<'_, DriveState>,
	key: String,
	stem: String,
	parent_dir: String,
) -> Result<RestoreResult, String> {
	let _busy = begin_operation(&drive)?;
	let remote = client()?;
	let work = work_dir(&app)?;
	let emitter = app.clone();
	let progress = move |p: Progress| {
		let _ = emitter.emit("drive-progress", p);
	};

	let result = async {
		progress(Progress { stage: "download", done: 0, total: 1 });
		let (zip, manifest) = restore::fetch_snapshot(&remote, &key, &stem, &work).await?;
		// Schema gate BEFORE the target folder exists — nothing is written on refusal.
		restore::check_schema(&manifest, crate::data_io::SCHEMA_VERSION)?;
		let folder = tenants::create_business_folder(&parent_dir, &manifest.business_name)?;
		match restore::materialise(&remote, &key, &zip, &manifest, &folder, &progress, &drive.cancel).await {
			Ok(outcome) => Ok((folder, outcome)),
			Err(e) => {
				let _ = std::fs::remove_dir_all(&folder); // never leave a half-restored business
				Err(e)
			}
		}
	}
	.await;
	let _ = std::fs::remove_dir_all(&work);
	let (folder, outcome) = result.inspect_err(|e| note_error(e))?;

	// open_tenant runs pending migrations, infers `encrypted` from the blob and
	// upserts the registry by marker id. Stored absolute paths are healed by
	// relocate_stored_paths on the next ensure_tenant_db.
	let tenant = match tenants::open_tenant(app.clone(), folder.to_string_lossy().to_string()).await {
		Ok(t) => t,
		Err(e) => {
			let _ = std::fs::remove_dir_all(&folder);
			return Err(e);
		}
	};
	Ok(RestoreResult {
		tenant,
		attachments_total: outcome.attachments_total,
		attachments_restored: outcome.attachments_restored,
		failed: outcome.failed,
	})
}
```

- [ ] **Step 3: Register in `lib.rs`**

After `.manage(vault_fs::VaultSessions::default())` add:

```rust
		.manage(drive::DriveState::default())
```

In `generate_handler![…]`, after `vault_fs::disable_tenant_encryption,` add:

```rust
			drive::drive_status,
			drive::drive_connect_begin,
			drive::drive_connect_finish,
			drive::drive_disconnect,
			drive::drive_set_reminder_days,
			drive::drive_cancel,
			drive::drive_backup_now,
			drive::drive_list_businesses,
			drive::drive_list_snapshots,
			drive::drive_restore,
```

- [ ] **Step 4: CI credentials**

In `.github/workflows/release-windows.yml` (the step whose `run:` is `bun run tauri:build`, line ~108) and `.github/workflows/release-macos.yml` (`bun run tauri:build -- --target aarch64-apple-darwin`, line ~107), add to that step's `env:` block (create the block if the step has none):

```yaml
        env:
          SAKORAM_GOOGLE_CLIENT_ID: ${{ secrets.SAKORAM_GOOGLE_CLIENT_ID }}
          SAKORAM_GOOGLE_CLIENT_SECRET: ${{ secrets.SAKORAM_GOOGLE_CLIENT_SECRET }}
```

If the step already has an `env:` block, append the two keys to it rather than adding a second `env:`. Unset secrets expand to empty strings, which `client_creds()` treats as "not configured" — forks still build.

- [ ] **Step 5: Verify**

Run: `cd src-tauri && cargo test && cargo check`
Expected: all tests pass (existing + every `drive::` test); `cargo check` has no errors and no `dead_code` warnings from `drive/`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src .github/workflows
git commit -m "feat(drive): tauri commands for connect, backup, list and restore"
```

---

### Task 10: Frontend pure logic + Pinia store

**Files:**
- Create: `app/lib/backup-reminder.ts`, `app/lib/backup-reminder.test.ts`, `app/lib/drive-errors.ts`, `app/lib/drive-errors.test.ts`, `app/stores/drive_backup.ts`

**Interfaces:**
- Consumes: the Task 9 commands + `drive-progress` event.
- Produces: `daysSinceBackup(lastIso: string | null, now: Date): number | null`, `isBackupDue(lastIso: string | null, reminderDays: number | null, now: Date): boolean`, `backupAgeLabel(lastIso: string | null, now: Date): string`, `REMINDER_OPTIONS`; `describeDriveError(raw: unknown): { title: string, description: string, reconnect: boolean, cancelled: boolean }`; store `useDriveBackupStore` exposing `status`, `loaded`, `busy`, `progress`, `reminderDismissed`, `ensureLoaded()`, `refresh()`, `connect()`, `disconnect()`, `setReminderDays(days)`, `backupNow(tenantId)`, `cancel()`, `listBusinesses()`, `listSnapshots(key)`, `restore(key, stem, parentDir)`, `lastBackupFor(tenantId)`.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/backup-reminder.test.ts`:

```ts
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
```

Create `app/lib/drive-errors.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test app/lib/backup-reminder.test.ts app/lib/drive-errors.test.ts`
Expected: FAIL — cannot resolve `./backup-reminder` / `./drive-errors`.

- [ ] **Step 3: Implement the pure libs**

Create `app/lib/backup-reminder.ts`:

```ts
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
```

Create `app/lib/drive-errors.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bun run test app/lib/backup-reminder.test.ts app/lib/drive-errors.test.ts`
Expected: all pass.

- [ ] **Step 5: Write the store**

Create `app/stores/drive_backup.ts`:

```ts
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

	const connect = async () => {
		connecting.value = true;
		try {
			const url = await invoke<string>("drive_connect_begin");
			await openInBrowser(url);
			status.value = await invoke<DriveStatus>("drive_connect_finish");
		} finally {
			connecting.value = false;
		}
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
		disconnect,
		setReminderDays,
		backupNow,
		restore,
		cancel,
		listBusinesses,
		listSnapshots,
		lastBackupFor
	};
});
```

(`createLoadOnce(load: () => Promise<void>, isLoaded: () => boolean)` is the existing helper in `app/lib/load-once.ts` — a failed load is retried next call rather than cached.)

- [ ] **Step 6: Lint + test**

Run: `bun run lint && bun run test`
Expected: lint clean; full vitest suite passes.

- [ ] **Step 7: Commit**

```bash
git add app/lib/backup-reminder.ts app/lib/backup-reminder.test.ts app/lib/drive-errors.ts app/lib/drive-errors.test.ts app/stores/drive_backup.ts
git commit -m "feat(drive): reminder + error-copy libs and the drive backup store"
```

---

### Task 11: Settings card, progress modal, reminder banner

**Files:**
- Create: `app/components/DriveBackupCard.vue`, `app/components/DriveBackupProgressModal.vue`, `app/components/BackupReminderBanner.vue`
- Modify: `app/pages/settings/businesses.vue` (insert the card after the "Demo business" block, before the `<!-- Rename modal -->` comment, ~line 150), `app/layouts/default.vue:361-363`

**Interfaces:**
- Consumes: `useDriveBackupStore`, `useTenantsStore` (`activeTenantId`, `activeTenant`, `activeLocked`, `tenants`), `backupAgeLabel` / `isBackupDue` / `REMINDER_OPTIONS`, `describeDriveError`.
- Produces: three auto-imported components. `DriveBackupProgressModal` is store-driven (no props) and is mounted ONCE, in the default layout.

- [ ] **Step 1: Progress modal**

Create `app/components/DriveBackupProgressModal.vue`:

```vue
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
```

- [ ] **Step 2: Settings card**

Create `app/components/DriveBackupCard.vue`:

```vue
<template>
	<div v-if="drive.status?.configured" id="google-drive" class="mt-8 scroll-mt-4">
		<SectionCard title="Google Drive backup" icon="i-lucide-cloud-upload">
			<p class="text-sm text-(--ui-text-muted) select-none">
				Keep a copy of your books in <strong>your own</strong> Google Drive, so a dead PC isn't the end of them.
				Backups run only when you press the button — Sakoram never uploads in the background.
			</p>

			<div v-if="!drive.status.connected" class="mt-4">
				<UButton icon="i-lucide-log-in" :loading="drive.connecting" @click="onConnect">
					Connect Google Drive
				</UButton>
				<p class="text-xs text-(--ui-text-muted) mt-2 select-none">
					Your browser opens to sign in. Sakoram can only see files it created itself — not the rest of your Drive.
				</p>
			</div>

			<div v-else class="mt-4 space-y-4">
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<div class="text-sm">
						<span class="text-(--ui-text-muted)">Connected as</span>
						<span class="font-medium ml-1">{{ drive.status.email ?? "your Google account" }}</span>
					</div>
					<UButton color="neutral" variant="outline" size="sm" icon="i-lucide-log-out" @click="onDisconnect">
						Disconnect
					</UButton>
				</div>

				<UFormField label="Remind me to back up" class="max-w-xs">
					<USelect :model-value="reminderValue" :items="reminderItems" @update:model-value="onReminderChange" />
				</UFormField>

				<div class="rounded-md border border-(--ui-border) divide-y divide-(--ui-border)">
					<div v-for="t in tenants.tenants" :key="t.id" class="flex items-center justify-between gap-3 px-3 py-2">
						<div class="min-w-0">
							<div class="font-medium truncate">
								{{ t.name }}
							</div>
							<div class="text-xs text-(--ui-text-muted)">
								{{ backupAgeLabel(drive.lastBackupFor(t.id), now) }}
							</div>
						</div>
						<UButton
							v-if="t.id === tenants.activeTenantId"
							size="sm"
							icon="i-lucide-cloud-upload"
							:disabled="tenants.activeLocked || drive.busy"
							@click="onBackup(t.id)"
						>
							Back up now
						</UButton>
						<span v-else class="text-xs text-(--ui-text-muted) select-none">Open it to back it up</span>
					</div>
				</div>

				<p class="text-xs text-(--ui-text-muted) select-none">
					The last 10 backups are kept. Database encryption protects the database in the backup too — but
					attachments (scans, photos) are stored on Drive as ordinary files, exactly as they are on this computer.
				</p>
			</div>
		</SectionCard>
	</div>
</template>

<script setup lang="ts">
	import { backupAgeLabel, REMINDER_OPTIONS } from "~/lib/backup-reminder";
	import { describeDriveError } from "~/lib/drive-errors";
	import { useDriveBackupStore } from "~/stores/drive_backup";
	import { useTenantsStore } from "~/stores/tenants";

	const drive = useDriveBackupStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	// Re-evaluated on every activation so "today / yesterday" can't go stale
	// inside the kept-alive settings page.
	const now = ref(new Date());
	onMounted(() => drive.ensureLoaded());
	onActivated(() => {
		now.value = new Date();
		void drive.refresh();
	});

	// USelect can't carry a null value — "off" travels as 0.
	const reminderItems = REMINDER_OPTIONS.map(o => ({ label: o.label, value: o.value ?? 0 }));
	const reminderValue = computed(() => drive.status?.reminder_days ?? 0);
	const onReminderChange = (value: number) => drive.setReminderDays(value === 0 ? null : value);

	const fail = (err: unknown) => {
		const info = describeDriveError(err);
		if (info.cancelled) return;
		toast.add({ title: info.title, description: info.description, color: "error", icon: "i-lucide-circle-alert" });
	};

	const onConnect = async () => {
		try {
			await drive.connect();
			toast.add({ title: "Google Drive connected", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			fail(err);
		}
	};

	const onDisconnect = async () => {
		try {
			await drive.disconnect();
			toast.add({ title: "Google Drive disconnected", description: "Backups already on your Drive were left untouched.", color: "info", icon: "i-lucide-log-out" });
		} catch (err) {
			fail(err);
		}
	};

	const onBackup = async (tenantId: string) => {
		try {
			const out = await drive.backupNow(tenantId);
			now.value = new Date();
			const skipped = out.skipped.length > 0 ? ` ${out.skipped.length} attachment(s) could not be read and were skipped.` : "";
			toast.add({
				title: "Backed up to Google Drive",
				description: `${out.attachments_uploaded} new attachment(s) uploaded, ${out.attachments_total} in total.${skipped}`,
				color: out.skipped.length > 0 ? "warning" : "success",
				icon: "i-lucide-check"
			});
		} catch (err) {
			fail(err);
		}
	};
</script>
```

In `app/pages/settings/businesses.vue`, insert immediately after the closing `</div>` of the "Demo business" block (the block containing "Add a demo business") and before `<!-- Rename modal -->`:

```vue
		<DriveBackupCard />
```

- [ ] **Step 3: Reminder banner**

Create `app/components/BackupReminderBanner.vue`:

```vue
<template>
	<div v-if="visible" class="mb-3 select-none">
		<UAlert
			color="warning"
			variant="subtle"
			icon="i-lucide-cloud-alert"
			:title="`${ageLabel} — back up ${tenants.activeTenant?.name ?? 'this business'} to Google Drive?`"
			:actions="[
				{ label: 'Back up now', icon: 'i-lucide-cloud-upload', onClick: onBackup },
				{ label: 'Later', color: 'neutral', variant: 'outline', onClick: onLater }
			]"
		/>
	</div>
</template>

<script setup lang="ts">
	import { backupAgeLabel, isBackupDue } from "~/lib/backup-reminder";
	import { describeDriveError } from "~/lib/drive-errors";
	import { useDriveBackupStore } from "~/stores/drive_backup";
	import { useTenantsStore } from "~/stores/tenants";

	const drive = useDriveBackupStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	onMounted(() => drive.ensureLoaded());

	const last = computed(() => drive.lastBackupFor(tenants.activeTenantId));
	const ageLabel = computed(() => backupAgeLabel(last.value, new Date()));

	// Only nudge someone who has opted in (connected) and can act (unlocked).
	const visible = computed(() =>
		!!drive.status?.configured
		&& drive.status.connected
		&& !!tenants.activeTenantId
		&& !tenants.activeLocked
		&& !drive.reminderDismissed
		&& !drive.busy
		&& isBackupDue(last.value, drive.status.reminder_days, new Date())
	);

	const onLater = () => {
		drive.reminderDismissed = true;
	};

	const onBackup = async () => {
		const id = tenants.activeTenantId;
		if (!id) return;
		try {
			await drive.backupNow(id);
			toast.add({ title: "Backed up to Google Drive", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			const info = describeDriveError(err);
			if (info.cancelled) return;
			toast.add({ title: info.title, description: info.description, color: "error", icon: "i-lucide-circle-alert" });
		}
	};
</script>
```

In `app/layouts/default.vue`, change the content wrapper (lines 361–363) from:

```vue
					<div class="p-4 pb-2 max-w-[96rem] mx-auto">
						<slot />
					</div>
```

to:

```vue
					<div class="p-4 pb-2 max-w-[96rem] mx-auto">
						<BackupReminderBanner />
						<slot />
					</div>
```

and add `<DriveBackupProgressModal />` directly after the closing `</main>` tag on line 364 (still inside the same flex column `<div>`, so the layout keeps a single root).

- [ ] **Step 4: Lint + build gate**

Run: `bun run lint && bun run generate`
Expected: both clean. (`nuxi typecheck` is NOT the gate — see CLAUDE.md on `ResizableDataTable` generics. If `generate` dies with "memory allocation failed", that is the Windows commit charge, not this change — retry when the machine is quiet.)

- [ ] **Step 5: Verify in the running app**

Run `bun run tauri:dev` with the two `SAKORAM_GOOGLE_*` env vars exported in the same shell. Check: (a) Settings → Businesses shows the card; (b) WITHOUT the env vars the card is absent entirely; (c) Connect opens the browser, consent returns to the app, the card shows the account email; (d) Back up now shows the progress modal then a success toast, and a `Sakoram Backups/<name>/{snapshots,attachments}` tree appears in drive.google.com; (e) set the reminder to "Every day", edit `%APPDATA%/com.sakoram.billing/backup.json` to a `last_backups` date two days ago, reload — the banner appears on every page; "Later" hides it until restart.

- [ ] **Step 6: Commit**

```bash
git add app/components/DriveBackupCard.vue app/components/DriveBackupProgressModal.vue app/components/BackupReminderBanner.vue app/pages/settings/businesses.vue app/layouts/default.vue
git commit -m "feat(drive): settings card, progress modal and backup reminder banner"
```

---

### Task 12: Restore from Google Drive on the welcome screen

**Files:**
- Create: `app/components/RestoreFromDriveModal.vue`
- Modify: `app/pages/welcome.vue` (template after the "Open a business folder…" block ending line 234; script near `onOpenBusiness`, line ~485)

**Interfaces:**
- Consumes: `useDriveBackupStore` (`connect`, `listBusinesses`, `listSnapshots`, `restore`, `progress`, `busy`, `cancel`), `useTenantsStore` (`refresh`, `activate`), `formatBytes` from `~/lib/format-bytes`, `open` from `@tauri-apps/plugin-dialog`.
- Produces: `<RestoreFromDriveModal v-model:open="…" />`. On success it activates the restored business and hard-reloads (`window.location.assign("/")`) — the same exit `onOpenBusiness` uses; an encrypted business lands on `/unlock` via the tenant guard.

- [ ] **Step 1: The modal**

Create `app/components/RestoreFromDriveModal.vue`:

```vue
<template>
	<UModal v-model:open="open" title="Restore from Google Drive" :dismissible="!drive.busy" :close="!drive.busy">
		<template #body>
			<div class="space-y-4">
				<!-- Step: connect -->
				<div v-if="!drive.status?.connected" class="text-center py-4">
					<p class="text-sm text-(--ui-text-muted) mb-3 select-none">
						Sign in with the Google account you backed up to.
					</p>
					<UButton icon="i-lucide-log-in" :loading="drive.connecting" @click="onConnect">
						Connect Google Drive
					</UButton>
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
							<USelect v-model="selectedKey" :items="businessItems" placeholder="Choose a business" />
						</UFormField>
						<UFormField v-if="selectedKey" label="Backup">
							<USelect v-model="selectedStem" :items="snapshotItems" placeholder="Choose a backup" :loading="loadingSnapshots" />
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

	const businessItems = computed(() => businesses.value.map(b => ({ label: b.name, value: b.key })));
	const snapshotItems = computed(() => snapshots.value.map(s => ({
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
		if (!isOpen) return;
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

	const onConnect = async () => {
		try {
			await drive.connect();
			await loadBusinesses();
		} catch (err) {
			fail(err);
		}
	};

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
```

- [ ] **Step 2: Wire it into the welcome page**

In `app/pages/welcome.vue`, directly after the "Open a business folder…" `<div class="text-center mt-4">…</div>` block (ends line 234), add:

```vue
		<!-- Restore from Google Drive — disaster recovery on a fresh machine.
			Hidden when this build carries no Google credentials. -->
		<div v-if="drive.status?.configured" class="text-center mt-4">
			<UButton
				icon="i-lucide-cloud-download"
				variant="outline"
				color="neutral"
				:disabled="seedingDemo || opening"
				@click="showDriveRestore = true"
			>
				Restore from Google Drive…
			</UButton>
		</div>
		<RestoreFromDriveModal v-model:open="showDriveRestore" />
```

In the `<script setup>`, next to `const opening = ref(false);`:

```ts
	// ---- Restore from Google Drive ----
	const drive = useDriveBackupStore();
	const showDriveRestore = ref(false);
	onMounted(() => drive.ensureLoaded());
```

and add the import beside the other store imports: `import { useDriveBackupStore } from "~/stores/drive_backup";`

- [ ] **Step 3: Lint + build gate**

Run: `bun run lint && bun run generate`
Expected: clean.

- [ ] **Step 4: Verify in the running app**

With credentials exported and at least one backup on Drive (Task 11 Step 5): Close the business → welcome → Restore from Google Drive → pick business + newest backup → choose an EMPTY parent folder → progress → "N of N attachments restored" → Open business. Confirm: the dashboard shows the same figures; an invoice's attachment opens (proves `relocate_stored_paths` healed the absolute path); the ORIGINAL folder on disk is untouched and the Businesses list now points at the restored folder.

- [ ] **Step 5: Commit**

```bash
git add app/components/RestoreFromDriveModal.vue app/pages/welcome.vue
git commit -m "feat(drive): restore a business from google drive on the welcome screen"
```

---

### Task 13: Help topic, docs, version bump, end-to-end verification

**Files:**
- Create: `app/help/topics/backup-google-drive.vue`
- Modify: `app/help/index.ts` (append a registry row after the `security` entry), `CLAUDE.md`, `README.md` (any "fully offline" claim), `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`

- [ ] **Step 1: Help topic**

Create `app/help/topics/backup-google-drive.vue`:

```vue
<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What it is" icon="i-lucide-cloud-upload">
			<p>
				A copy of your business — the books, your logos and every attached scan — kept in
				<strong>your own Google Drive</strong>. If this computer is lost or dies, you install Sakoram on
				another one, sign in to Google, and restore.
			</p>
			<p>
				It is a <strong>backup</strong>, not sync. Nothing uploads in the background; a backup happens when you
				press <strong>Back up now</strong>. Sakoram reminds you when it has been a while.
			</p>
		</HelpSection>

		<HelpSection title="Setting it up" icon="i-lucide-log-in">
			<ol class="list-decimal pl-5 space-y-1">
				<li>
					Open
					<NuxtLink to="/settings/businesses#google-drive" class="text-(--ui-primary) hover:underline">
						Settings → Businesses
					</NuxtLink>
					and press <strong>Connect Google Drive</strong>.
				</li>
				<li>Your browser opens. Sign in and allow access.</li>
				<li>Back in Sakoram, press <strong>Back up now</strong> next to the open business.</li>
			</ol>
			<HelpCallout variant="info">
				Sakoram asks Google only for permission to see <em>files it created itself</em>. It cannot read the rest
				of your Drive, your email or your photos. The storage used comes out of your own free 15 GB.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Restoring" icon="i-lucide-cloud-download">
			<p>
				On the welcome screen choose <strong>Restore from Google Drive…</strong>, pick the business and the
				backup you want (the newest is preselected), then choose a folder. The business is restored into a
				<strong>new folder</strong> — nothing already on the computer is overwritten. A backup made with an
				older Sakoram is upgraded automatically when it opens.
			</p>
			<HelpCallout variant="tip">
				Using a PC and a laptop? Back up on one, restore on the other. There is no merging: whichever copy you
				restore replaces what that machine was using, so finish and back up on one machine before switching.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="What is kept, and for how long" icon="i-lucide-archive">
			<p>
				The last <strong>10 backups</strong> are kept. Older ones move to your Google Drive trash, where Google
				holds them for 30 days. Attachments upload once and are reused by later backups, so a routine backup is
				small and quick.
			</p>
			<p>
				In Drive you will see a <strong>Sakoram Backups</strong> folder laid out like your business folder. You
				can even restore by hand: download that folder, unzip the newest file in <code>snapshots</code> into it,
				and use <strong>Open a business folder…</strong>.
			</p>
		</HelpSection>

		<HelpSection title="Encryption" icon="i-lucide-shield-check">
			<p>
				If the business has
				<NuxtLink to="/settings/security#encryption" class="text-(--ui-primary) hover:underline">
					database encryption
				</NuxtLink>
				turned on, the database in the backup is encrypted too and opens with the same password or recovery key.
			</p>
			<HelpCallout variant="warning">
				Attachments (scans and photos) are <strong>not</strong> encrypted — on this computer or in Drive. And a
				backup of an encrypted business is useless without its password or recovery key: keep the recovery key
				somewhere that is not this computer.
			</HelpCallout>
		</HelpSection>
	</div>
</template>
```

In `app/help/index.ts`, after the `security` entry's closing `},` add:

```ts
	{
		slug: "backup-google-drive",
		title: "Backing up to Google Drive",
		summary: "Keep a copy of your books in your own Google Drive, and restore it on any computer. Manual backups with a reminder — not sync.",
		category: "general",
		icon: "i-lucide-cloud-upload",
		relatedSlugs: ["security", "bookkeeping-basics"],
		component: () => import("./topics/backup-google-drive.vue")
	},
```

and add `"backup-google-drive"` to the `security` entry's `relatedSlugs`.

- [ ] **Step 2: CLAUDE.md**

Add a section after "Per-business encryption (optional, opt-in)" titled `## Google Drive backup (optional, opt-in)` covering, in this order: goal (disaster recovery; backup/restore only, **no sync**); module map (`src-tauri/src/drive/*` one line each, orchestration written against `RemoteStore` + tested with `MemoryStore`); Drive layout + the `skKind`/`skKey`/`skPath` appProperties table and the 124-byte limit; the zip-last commit-marker rule; retention (10, trash not delete, GC switched off when any retained manifest is unreadable); restore path (`check_schema` → `create_business_folder` → `materialise` → `open_tenant`; `relocate_stored_paths` heals absolute paths). Then a **Landmines** list:

- **Never on the close path.** `lock-on-close.client.ts` races a 5 s timeout; a network call there hangs quit.
- **Refresh token is keychain-only** (`com.sakoram.billing.gdrive`). Not `tenants.json`, not `backup.json`, never a business folder (portable).
- **`backup_key`, not tenant id**, identifies a business on Drive — ids are name slugs and collide.
- **Credentials are `option_env!`** — compile-time. `build.rs` has the `rerun-if-env-changed` lines; without them a changed secret silently doesn't rebuild. Absent ⇒ `configured: false` ⇒ UI hidden.
- **No std `MutexGuard` across an `.await`** in `gdrive.rs` / `mod.rs` — go through `cached`/`remember`, and `take()` the `PendingAuth` before awaiting.
- **Cloud backups carry the raw SQLite file, NOT the JSON export** — `import_tenant_data`'s schema-version gate would reject an old backup on a new build.
- **Attachments are plaintext on Drive even for encrypted businesses** (same as on disk).

Also: add `drive/` to the Project layout tree under `src-tauri/src/`; add the three components, the store and the two libs to their lists; add a "✅ Google Drive backup & restore (v0.160.0)" bullet under Done; change any "Runs fully offline" phrasing in the intro to "Runs fully offline by default (optional Google Drive backup)".

- [ ] **Step 3: README**

Run `grep -n -i "offline" README.md`. For each claim that the app is fully/entirely offline, reword to "offline by default — the only network feature is the optional Google Drive backup, which you switch on yourself". Leave unrelated mentions alone.

- [ ] **Step 4: Version bump → 0.160.0**

Set `"version": "0.160.0"` in `package.json` and `src-tauri/tauri.conf.json`, `version = "0.160.0"` in `src-tauri/Cargo.toml`, then run `cd src-tauri && cargo check` so `Cargo.lock` picks it up (if `tauri:dev` holds the lock, edit the `sakoram_billing` version line in `Cargo.lock` by hand).

- [ ] **Step 5: Full automated verification**

```bash
bun run lint
bun run test
bun run verify:sql
bun run generate
cd src-tauri && cargo test
```

Expected: all five succeed. Paste the tail of each into the PR description.

- [ ] **Step 6: Manual end-to-end checklist (real Google account — cannot be automated)**

Prerequisite (owner): Google Cloud project, Drive API enabled, OAuth client of type **Desktop app**, consent screen **published to Production** with only the `drive.file` scope, both env vars exported in the shell running `bun run tauri:dev`.

- [ ] Connect → browser consent shows "See, edit, create, and delete only the specific Google Drive files that you use with this app" → card shows the email.
- [ ] Back up the demo business (large: ~10 attachments). Drive shows `Sakoram Backups/<name>/snapshots/*.zip` + `*.manifest.json` and `attachments/<type>/<id>/*`.
- [ ] Back up again immediately → toast says **0 new attachments uploaded**.
- [ ] Attach a new scan to an invoice → back up → **1 new**.
- [ ] Pull the network cable mid-upload → "Can't reach Google Drive"; Drive has no new `.zip`; the next backup succeeds.
- [ ] Encrypted business: back up while unlocked; download the zip from drive.google.com and confirm it contains `business.db.enc` + `business.vault.json` and NO `business.db`. Lock the business → "Back up now" is disabled.
- [ ] Restore on a clean profile (rename `%APPDATA%/com.sakoram.billing` aside first): welcome → Restore → figures match, an attachment opens, encrypted business asks for its password on `/unlock`.
- [ ] Restore on the SAME machine while the business is still registered → lands in `<name> (2)`, the registry re-points, the original folder is intact.
- [ ] Revoke access at myaccount.google.com → Permissions → next backup shows "Reconnect Google Drive" and the card flips to not-connected.
- [ ] Build WITHOUT the env vars → no card, no banner, no welcome button.
- [ ] Close the window during an idle moment → app exits immediately (the close path is untouched).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs+chore: google drive backup help topic, CLAUDE.md, v0.160.0"
```

Then STOP. Summarise what shipped and wait — do not push or open a PR until the user says so.

