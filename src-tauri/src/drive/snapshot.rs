//! Turning a business folder into an uploadable snapshot, and back.

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
