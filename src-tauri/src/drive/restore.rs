//! Pull a snapshot back into a fresh business folder. Split in two so the
//! command layer can check the manifest (schema gate) and create the target
//! folder BETWEEN the download and anything being written to it.

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
