// Per-business vault orchestration: turns the vault.rs crypto primitives into
// on-disk operations over a tenant's database, and holds unlocked Data
// Encryption Keys (DEKs) in session memory. Pure path-taking functions here are
// unit-tested; thin #[tauri::command] wrappers (further down) resolve per-tenant
// paths from the AppHandle and manage the session. See
// docs/superpowers/specs/2026-06-02-per-business-encryption-design.md §5–§6.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, State};
use zeroize::Zeroizing;

use crate::tenants;
use crate::vault;

#[derive(Debug, thiserror::Error)]
pub enum VaultFsError {
    #[error("crypto: {0}")]
    Vault(#[from] vault::VaultError),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("serde: {0}")]
    Serde(String),
    #[error("{0}")]
    State(String),
}

pub struct VaultPaths {
    pub db: PathBuf,
    pub enc: PathBuf,
    pub meta: PathBuf,
}

pub enum Secret {
    Password(String),
    Recovery(String),
}

fn write_meta(path: &std::path::Path, meta: &vault::VaultMeta) -> Result<(), VaultFsError> {
    let bytes = serde_json::to_vec_pretty(meta).map_err(|e| VaultFsError::Serde(e.to_string()))?;
    std::fs::write(path, bytes)?;
    Ok(())
}

fn read_meta(path: &std::path::Path) -> Result<vault::VaultMeta, VaultFsError> {
    let bytes = std::fs::read(path)?;
    serde_json::from_slice(&bytes).map_err(|e| VaultFsError::Serde(e.to_string()))
}

/// Encrypt an existing plaintext db: create a vault, write `{enc}` + `{meta}`,
/// then remove the plaintext `{db}`. Returns the one-time recovery key and the
/// DEK (so the caller can seed the session — the business stays usable right
/// after enabling, no immediate re-unlock needed).
pub fn enable_encryption_at(
    p: &VaultPaths,
    password: &str,
    aad: &[u8],
) -> Result<(String, Zeroizing<[u8; 32]>), VaultFsError> {
    let (meta, recovery, dek) = vault::create_vault(password, aad)?;
    vault::encrypt_file(&p.db, &p.enc, &dek)?;
    write_meta(&p.meta, &meta)?;
    // Only remove the plaintext after the blob + meta are safely written.
    secure_remove(&p.db)?;
    Ok((recovery, dek))
}

/// Best-effort secure delete: overwrite the file's bytes with zeros, flush, then
/// remove it. NOTE: on SSDs / journaling filesystems this does not guarantee the
/// original blocks are unrecoverable (wear-levelling). The threat model
/// (spec §8.3) is a copied file while the app is closed/locked — at which point
/// only `{enc}` exists — not forensic disk recovery, which is out of scope.
fn secure_remove(path: &std::path::Path) -> Result<(), VaultFsError> {
    use std::io::{Seek, SeekFrom, Write};
    if let Ok(meta) = std::fs::metadata(path) {
        if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(path) {
            let len = meta.len();
            let zeros = vec![0u8; 65536];
            let mut remaining = len;
            f.seek(SeekFrom::Start(0)).ok();
            while remaining > 0 {
                let n = remaining.min(zeros.len() as u64) as usize;
                if f.write_all(&zeros[..n]).is_err() {
                    break;
                }
                remaining -= n as u64;
            }
            f.flush().ok();
        }
    }
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(VaultFsError::Io(e)),
    }
}

/// Authenticate the secret against the vault and ensure the plaintext working
/// db is available. Returns the DEK for the session.
///
/// Crash handling: if a working `{db}` already exists (the app died while
/// unlocked), it is the NEWEST truth — we authenticate to recover the DEK but
/// do NOT overwrite it with the stale `{enc}`. A clean lock later re-seals it.
pub fn unlock_at(p: &VaultPaths, secret: &Secret, aad: &[u8]) -> Result<Zeroizing<[u8; 32]>, VaultFsError> {
    let meta = read_meta(&p.meta)?;
    let dek = match secret {
        Secret::Password(pw) => vault::unlock_with_password(&meta, pw, aad)?,
        Secret::Recovery(rk) => vault::unlock_with_recovery(&meta, rk, aad)?,
    };
    // Only materialise the plaintext from the blob if there isn't already a
    // (possibly crash-leftover) working db.
    if !p.db.exists() {
        vault::decrypt_file(&p.enc, &p.db, &dek)?;
    }
    Ok(dek)
}

/// Re-encrypt the working db -> blob with the session DEK, then securely remove
/// the plaintext working db.
pub fn lock_at(p: &VaultPaths, dek: &[u8; 32], aad: &[u8]) -> Result<(), VaultFsError> {
    // aad isn't needed by encrypt_file (the blob is bound to the DEK, which is
    // itself AAD-bound at the wrap layer), but we accept it for signature
    // symmetry and future use.
    let _ = aad;
    if p.db.exists() {
        vault::encrypt_file(&p.db, &p.enc, dek)?;
        secure_remove(&p.db)?;
    }
    Ok(())
}

/// Permanently decrypt: ensure the plaintext `{db}` exists (decrypt from blob if
/// needed using the supplied session DEK), then remove `{enc}` + `{meta}`.
pub fn disable_encryption_at(p: &VaultPaths, dek: &[u8; 32], aad: &[u8]) -> Result<(), VaultFsError> {
    let _ = aad;
    if !p.db.exists() {
        vault::decrypt_file(&p.enc, &p.db, dek)?;
    }
    // Remove blob + metadata; the plaintext db is now the only copy.
    match std::fs::remove_file(&p.enc) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(VaultFsError::Io(e)),
    }
    match std::fs::remove_file(&p.meta) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(VaultFsError::Io(e)),
    }
    Ok(())
}

/// Re-wrap the DEK under a new password by rewriting `{meta}`. The DB blob is
/// untouched (the DEK doesn't change).
pub fn change_password_at(p: &VaultPaths, old: &str, new: &str, aad: &[u8]) -> Result<(), VaultFsError> {
    let meta = read_meta(&p.meta)?;
    let new_meta = vault::change_password(&meta, old, new, aad)?;
    write_meta(&p.meta, &new_meta)?;
    Ok(())
}

/// In-memory session of unlocked DEKs, keyed by tenant id. Held in Tauri managed
/// state for the life of the process, so an unlocked business survives the
/// webview reload on tenant switch. Wrapped in Zeroizing so keys are wiped on
/// removal/drop.
#[derive(Default)]
pub struct VaultSessions(pub Mutex<HashMap<String, Zeroizing<[u8; 32]>>>);

impl VaultSessions {
    pub fn insert(&self, id: &str, dek: Zeroizing<[u8; 32]>) {
        self.0.lock().unwrap().insert(id.to_string(), dek);
    }
    pub fn get(&self, id: &str) -> Option<Zeroizing<[u8; 32]>> {
        self.0.lock().unwrap().get(id).cloned()
    }
    pub fn remove(&self, id: &str) {
        self.0.lock().unwrap().remove(id);
    }
    pub fn is_unlocked(&self, id: &str) -> bool {
        self.0.lock().unwrap().contains_key(id)
    }
    pub fn unlocked_ids(&self) -> Vec<String> {
        self.0.lock().unwrap().keys().cloned().collect()
    }
}

fn paths_for(app: &AppHandle, id: &str) -> Result<VaultPaths, String> {
    Ok(VaultPaths {
        db: tenants::tenant_db_path_public(app, id)?,
        enc: tenants::tenant_enc_path(app, id)?,
        meta: tenants::tenant_vault_path(app, id)?,
    })
}

/// Lock state reported to the frontend.
#[derive(serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LockState {
    Unencrypted,
    Locked,
    Unlocked,
}

#[tauri::command]
pub fn tenant_lock_state(app: AppHandle, sessions: State<'_, VaultSessions>, id: String) -> Result<LockState, String> {
    if !tenants::is_tenant_encrypted(&app, &id)? {
        return Ok(LockState::Unencrypted);
    }
    Ok(if sessions.is_unlocked(&id) { LockState::Unlocked } else { LockState::Locked })
}

#[tauri::command]
pub fn enable_tenant_encryption(app: AppHandle, sessions: State<'_, VaultSessions>, id: String, password: String) -> Result<String, String> {
    if password.trim().is_empty() {
        return Err("Password is required".into());
    }
    let p = paths_for(&app, &id)?;
    if !p.db.exists() {
        return Err("Business database not found — open the business first".into());
    }
    let (recovery, dek) = enable_encryption_at(&p, &password, id.as_bytes()).map_err(|e| e.to_string())?;
    tenants::set_tenant_encrypted(&app, &id, true)?;
    sessions.insert(&id, dek); // stays usable without an immediate re-unlock
    Ok(recovery)
}

#[tauri::command]
pub fn unlock_tenant(app: AppHandle, sessions: State<'_, VaultSessions>, id: String, secret: String, use_recovery: bool) -> Result<(), String> {
    let p = paths_for(&app, &id)?;
    let s = if use_recovery { Secret::Recovery(secret) } else { Secret::Password(secret) };
    let dek = unlock_at(&p, &s, id.as_bytes()).map_err(|e| e.to_string())?;
    sessions.insert(&id, dek);
    Ok(())
}

#[tauri::command]
pub fn lock_tenant(app: AppHandle, sessions: State<'_, VaultSessions>, id: String) -> Result<(), String> {
    if let Some(dek) = sessions.get(&id) {
        let p = paths_for(&app, &id)?;
        lock_at(&p, &dek, id.as_bytes()).map_err(|e| e.to_string())?;
        sessions.remove(&id);
    }
    Ok(())
}

#[tauri::command]
pub fn change_tenant_password(app: AppHandle, id: String, old_password: String, new_password: String) -> Result<(), String> {
    if new_password.trim().is_empty() {
        return Err("New password is required".into());
    }
    let p = paths_for(&app, &id)?;
    change_password_at(&p, &old_password, &new_password, id.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn disable_tenant_encryption(app: AppHandle, sessions: State<'_, VaultSessions>, id: String, password: String) -> Result<(), String> {
    let p = paths_for(&app, &id)?;
    // Authenticate via the password to recover the DEK, then decrypt + tear down.
    let dek = unlock_at(&p, &Secret::Password(password), id.as_bytes()).map_err(|e| e.to_string())?;
    disable_encryption_at(&p, &dek, id.as_bytes()).map_err(|e| e.to_string())?;
    tenants::set_tenant_encrypted(&app, &id, false)?;
    sessions.remove(&id);
    Ok(())
}

/// Lock every currently-unlocked tenant: re-encrypt each working db and clear
/// the session. Best-effort — a failure on one tenant doesn't abort the others
/// (we're typically running this on app exit). Returns the ids it sealed.
pub fn lock_all(app: &AppHandle, sessions: &VaultSessions) -> Vec<String> {
    let mut sealed = Vec::new();
    for id in sessions.unlocked_ids() {
        if let Some(dek) = sessions.get(&id) {
            if let Ok(p) = paths_for(app, &id) {
                if lock_at(&p, &dek, id.as_bytes()).is_ok() {
                    sessions.remove(&id);
                    sealed.push(id);
                }
            }
        }
    }
    sealed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_paths(tag: &str) -> (PathBuf, VaultPaths) {
        let dir = std::env::temp_dir().join(format!("vaultfs-{tag}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = VaultPaths {
            db: dir.join("acme.db"),
            enc: dir.join("acme.db.enc"),
            meta: dir.join("acme.vault.json"),
        };
        (dir, p)
    }

    #[test]
    fn enable_encrypts_and_removes_plaintext() {
        let (dir, p) = temp_paths("enable");
        let contents = b"a pretend sqlite database".to_vec();
        std::fs::write(&p.db, &contents).unwrap();

        let (recovery, _dek) = enable_encryption_at(&p, "pw", b"acme").unwrap();
        assert!(!recovery.is_empty());
        // Plaintext db is gone; blob + vault.json exist.
        assert!(!p.db.exists(), "plaintext db must be removed after enabling");
        assert!(p.enc.exists());
        assert!(p.meta.exists());
        // vault.json is valid VaultMeta JSON.
        let _meta: vault::VaultMeta =
            serde_json::from_slice(&std::fs::read(&p.meta).unwrap()).unwrap();

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unlock_decrypts_then_lock_reencrypts() {
        let (dir, p) = temp_paths("cycle");
        let contents = vec![3u8; 50_000];
        std::fs::write(&p.db, &contents).unwrap();
        let (recovery, _dek) = enable_encryption_at(&p, "pw", b"acme").unwrap();

        // Unlock with password -> working db reappears with original bytes.
        let dek = unlock_at(&p, &Secret::Password("pw".into()), b"acme").unwrap();
        assert!(p.db.exists());
        assert_eq!(std::fs::read(&p.db).unwrap(), contents);

        // Wrong password is rejected.
        assert!(unlock_at(&p, &Secret::Password("nope".into()), b"acme").is_err());
        // Recovery key also unlocks.
        let dek_r = unlock_at(&p, &Secret::Recovery(recovery), b"acme").unwrap();
        assert_eq!(*dek_r, *dek);

        // Lock re-encrypts and removes the plaintext working db.
        lock_at(&p, &dek, b"acme").unwrap();
        assert!(!p.db.exists());
        assert!(p.enc.exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unlock_preserves_crash_leftover_db() {
        let (dir, p) = temp_paths("crash");
        std::fs::write(&p.db, vec![1u8; 1000]).unwrap();
        let _ = enable_encryption_at(&p, "pw", b"acme").unwrap();

        // Simulate a crash: a NEWER working db is present alongside the (now
        // stale) blob. Its contents must NOT be clobbered by the stale blob.
        let newer = vec![2u8; 2000];
        std::fs::write(&p.db, &newer).unwrap();

        let _dek = unlock_at(&p, &Secret::Password("pw".into()), b"acme").unwrap();
        assert_eq!(std::fs::read(&p.db).unwrap(), newer, "crash leftover must win over stale blob");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn disable_leaves_only_plaintext() {
        let (dir, p) = temp_paths("disable");
        let contents = vec![7u8; 30_000];
        std::fs::write(&p.db, &contents).unwrap();
        let _ = enable_encryption_at(&p, "pw", b"acme").unwrap();
        let dek = unlock_at(&p, &Secret::Password("pw".into()), b"acme").unwrap();

        disable_encryption_at(&p, &dek, b"acme").unwrap();
        assert!(p.db.exists(), "plaintext db remains");
        assert_eq!(std::fs::read(&p.db).unwrap(), contents);
        assert!(!p.enc.exists(), "blob removed");
        assert!(!p.meta.exists(), "vault.json removed");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn change_password_updates_only_meta() {
        let (dir, p) = temp_paths("chpw");
        std::fs::write(&p.db, vec![9u8; 10_000]).unwrap();
        let (recovery, _dek) = enable_encryption_at(&p, "old", b"acme").unwrap();

        change_password_at(&p, "old", "new", b"acme").unwrap();
        // New password unlocks; old does not; recovery still works.
        assert!(unlock_at(&p, &Secret::Password("new".into()), b"acme").is_ok());
        // (db now exists from the unlock above; remove it so the next unlock
        // exercises the blob path rather than the crash-leftover path.)
        std::fs::remove_file(&p.db).ok();
        assert!(unlock_at(&p, &Secret::Password("old".into()), b"acme").is_err());
        std::fs::remove_file(&p.db).ok();
        assert!(unlock_at(&p, &Secret::Recovery(recovery), b"acme").is_ok());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn sessions_track_unlocked_keys() {
        let s = VaultSessions::default();
        assert!(!s.is_unlocked("acme"));
        s.insert("acme", Zeroizing::new([5u8; 32]));
        assert!(s.is_unlocked("acme"));
        assert_eq!(*s.get("acme").unwrap(), [5u8; 32]);
        s.remove("acme");
        assert!(!s.is_unlocked("acme"));
    }

    #[test]
    fn locking_two_vaults_seals_both() {
        let (dir_a, pa) = temp_paths("multi-a");
        let (dir_b, pb) = temp_paths("multi-b");
        std::fs::write(&pa.db, vec![1u8; 5000]).unwrap();
        std::fs::write(&pb.db, vec![2u8; 5000]).unwrap();
        let (_ra, da) = enable_encryption_at(&pa, "pw", b"a").unwrap();
        let (_rb, db) = enable_encryption_at(&pb, "pw", b"b").unwrap();
        // After enabling, plaintext is already removed; unlock both to get
        // working dbs, then lock both.
        let da = unlock_at(&pa, &Secret::Password("pw".into()), b"a").unwrap_or(da);
        let db = unlock_at(&pb, &Secret::Password("pw".into()), b"b").unwrap_or(db);
        lock_at(&pa, &da, b"a").unwrap();
        lock_at(&pb, &db, b"b").unwrap();
        assert!(!pa.db.exists() && pa.enc.exists());
        assert!(!pb.db.exists() && pb.enc.exists());
        std::fs::remove_dir_all(&dir_a).ok();
        std::fs::remove_dir_all(&dir_b).ok();
    }
}
