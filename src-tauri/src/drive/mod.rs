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
	/// Aborts the sign-in currently being waited on by `drive_connect_finish`
	/// (which has already `take()`n `pending`, so this is the only handle left).
	canceller: Mutex<Option<oauth::AuthCanceller>>,
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
	pub name: Option<String>,
	/// `data:` URL of the profile photo, or None.
	pub photo: Option<String>,
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
		name: if connected { prefs.account_name } else { None },
		photo: if connected { prefs.account_photo } else { None },
		reminder_days: prefs.reminder_days,
		last_backups: prefs.last_backups,
	})
}

/// Look the connected account up and cache it in backup.json. A failure is
/// LOGGED, never swallowed: the first version discarded it with `.ok()` and the
/// card showed "your Google account" with nothing to say why.
async fn cache_account(app: &AppHandle, remote: &GDrive) -> Result<(), String> {
	let account = remote.account().await.map_err(|e| {
		eprintln!("[drive] account lookup failed: {e}");
		e.to_string()
	})?;
	let path = prefs_path(app)?;
	let mut prefs = state::load(&path);
	prefs.account_email = account.email;
	prefs.account_name = account.name;
	prefs.account_photo = account.photo;
	state::save(&path, &prefs)
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
	// A second Connect click must not queue behind an abandoned attempt: end
	// the previous wait first, so its `drive_connect_finish` returns right away.
	if let Some(previous) = drive.canceller.lock().unwrap().take() {
		previous.cancel();
	}
	let (url, pending, canceller) = oauth::begin(id).await?;
	// Replacing a stale PendingAuth drops it, which shuts its listener down.
	*drive.pending.lock().unwrap() = Some(pending);
	*drive.canceller.lock().unwrap() = Some(canceller);
	Ok(url)
}

/// Abort an in-flight sign-in (browser tab closed, user changed their mind).
/// Safe to call when nothing is in flight.
#[tauri::command]
pub fn drive_connect_cancel(drive: State<'_, DriveState>) {
	if let Some(canceller) = drive.canceller.lock().unwrap().take() {
		canceller.cancel();
	}
	// Covers a begin whose finish was never called.
	drive.pending.lock().unwrap().take();
}

#[tauri::command]
pub async fn drive_connect_finish(app: AppHandle, drive: State<'_, DriveState>) -> Result<DriveStatus, String> {
	let (id, secret) = oauth::client_creds().ok_or("Google Drive backup is not configured in this build.")?;
	// take() BEFORE awaiting — a std MutexGuard must never cross an await.
	let pending = drive.pending.lock().unwrap().take().ok_or("No Google sign-in is in progress.")?;
	let tokens = oauth::finish(pending, id, secret).await?;
	if !oauth::grants_drive(tokens.scope.as_deref()) {
		// Scope names are not secret — log what Google actually granted so a
		// refusal can be diagnosed rather than guessed at.
		eprintln!("[drive] connect refused; granted scopes: {}", tokens.scope.as_deref().unwrap_or("<none reported>"));
		// Don't keep a grant that can't do the one thing we need it for.
		if let Some(token) = tokens.refresh_token.as_deref() {
			oauth::revoke(&reqwest::Client::new(), token).await;
		}
		return Err("Google Drive access wasn't ticked on Google's permission screen. Connect again and leave the Google Drive permission selected — Sakoram can't back up without it.".into());
	}
	let refresh = tokens.refresh_token.ok_or("Google did not grant offline access. Try connecting again.")?;
	oauth::store_refresh_token(&refresh)?;

	// Cosmetic — being connected must not depend on it.
	let _ = cache_account(&app, &GDrive::new(id, secret, refresh)).await;
	status(&app)
}

/// Re-read who is connected. The card calls this when it is connected but has
/// nothing to show — a connect made before the lookup worked, or made offline.
#[tauri::command]
pub async fn drive_refresh_account(app: AppHandle) -> Result<DriveStatus, String> {
	cache_account(&app, &client()?).await.inspect_err(|e| note_error(e))?;
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
	prefs.account_name = None;
	prefs.account_photo = None;
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

/// Backup key of a registered business — what its Drive folder is filed under.
fn key_for(app: &AppHandle, tenant_id: &str) -> Result<String, String> {
	let tenant = tenants::get_tenant(app, tenant_id)?;
	let marker = tenants::read_marker(&PathBuf::from(&tenant.path))?;
	Ok(plan::backup_key(&marker.id, &marker.created_at))
}

/// Complete backups of one registered business, newest first. Empty (not an
/// error) when it has never been backed up.
#[tauri::command]
pub async fn drive_list_backups(app: AppHandle, tenant_id: String) -> Result<Vec<SnapshotInfo>, String> {
	let key = key_for(&app, &tenant_id)?;
	restore::list_snapshots(&client()?, &key).await.inspect_err(|e| note_error(e))
}

/// Move one OLDER backup to the Drive trash. The newest is refused: this
/// feature exists so there is always something to restore, and "delete" on the
/// only good copy is never what a tidy-up meant. (It can still be removed in
/// drive.google.com.)
#[tauri::command]
pub async fn drive_delete_backup(
	app: AppHandle,
	drive: State<'_, DriveState>,
	tenant_id: String,
	stem: String,
) -> Result<Vec<SnapshotInfo>, String> {
	let _busy = begin_operation(&drive)?;
	let key = key_for(&app, &tenant_id)?;
	let remote = client()?;
	let existing = restore::list_snapshots(&remote, &key).await.inspect_err(|e| note_error(e))?;
	if existing.first().is_some_and(|newest| newest.stem == stem) {
		return Err("The latest backup can't be deleted here — it is the one you would restore from.".into());
	}
	backup::delete_snapshot(&remote, &key, &stem, &work_dir(&app)?).await.inspect_err(|e| note_error(e))?;
	restore::list_snapshots(&remote, &key).await.inspect_err(|e| note_error(e))
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
