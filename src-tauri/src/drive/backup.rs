//! One-way push of a business to a `RemoteStore`.
//!
//! Order matters: attachments first, sidecar manifest next, snapshot ZIP LAST.
//! The zip's existence is the commit marker — an interrupted run leaves no zip,
//! is not a backup, and the next run reuses the attachments already uploaded.

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
