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
