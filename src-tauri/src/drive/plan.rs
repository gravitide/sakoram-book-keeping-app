//! Pure planning logic for Drive backups — no I/O, no network.

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
