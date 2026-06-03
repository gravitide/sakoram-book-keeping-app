# Per-business encryption — Phase 2a (vault orchestration + Tauri commands) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Rust backend that turns the Phase-1 crypto primitives into a working per-business vault: encrypt/decrypt a tenant's database on disk, hold the unlocked key in session memory, and expose enable/disable/unlock/lock/change-password to the frontend as Tauri commands — including crash-recovery and lock-on-exit.

**Architecture:** A new `vault_fs.rs` module provides **pure path-taking functions** (`enable_encryption_at`, `unlock_at`, `lock_at`, `disable_encryption_at`, `change_password_at`) that are unit-tested against temp dirs, plus thin `#[tauri::command]` wrappers that resolve per-tenant paths from the `AppHandle` and manage an in-memory session of unlocked Data Encryption Keys (DEKs). The `Tenant` registry gains an `encrypted` flag. This phase also hardens the Phase-1 `vault.rs` (binds the tenant id as AEAD associated data so a swapped blob/vault is rejected; zeroizes key material). No UI — that's Phase 2b/2c.

**Tech Stack:** Rust, Tauri 2, the Phase-1 `vault.rs` (Argon2id + XChaCha20-Poly1305 envelope), `zeroize` (new dep), `serde`/`serde_json` (existing).

**Spec:** `docs/superpowers/specs/2026-06-02-per-business-encryption-design.md` (§5 Storage layout, §6 Lifecycle, §8 Edge cases, §9 Components). This plan also resolves the two Phase-1 review follow-ups: tenant-id AAD binding and key zeroization.

**Branch:** Continue on `feat/encryption-phase1-crypto-core` (the user chose to keep building on it). Do not branch or touch `main`.

**Build/test:** `cargo test --manifest-path src-tauri/Cargo.toml <filter>` and `cargo check --manifest-path src-tauri/Cargo.toml`. Builds are incremental now (qpdf already compiled).

---

## On-disk layout this phase introduces

```
%APPDATA%\com.sakoram.billing\businesses\
  {id}.db          ← working DB, plaintext — exists ONLY while unlocked (or after a crash)
  {id}.db.enc      ← encrypted blob at rest
  {id}.vault.json  ← VaultMeta (salt, KDF params, both wrapped DEKs). Not secret.
```

`tenants.json` `Tenant` entries gain `"encrypted": true` once protected. AAD for every
vault is the tenant id bytes, so a vault/blob from tenant A cannot be unlocked in
tenant B's slot.

## File structure

- **Modify** `src-tauri/src/vault.rs` — add an `aad: &[u8]` parameter to the wrap/unlock/create/change-password
  functions (Tasks 1) and zeroize key material (Task 1). Update existing tests.
- **Modify** `src-tauri/Cargo.toml` — add `zeroize`.
- **Modify** `src-tauri/src/tenants.rs` — add `encrypted` to `Tenant`; add `set_tenant_encrypted` + `is_tenant_encrypted` helpers and path helpers for `.db.enc` / `.vault.json` (Task 2).
- **Create** `src-tauri/src/vault_fs.rs` — pure orchestration functions + the `VaultSessions` session-state type + the `#[tauri::command]` wrappers (Tasks 3–6).
- **Modify** `src-tauri/src/lib.rs` — `mod vault_fs;`, `.manage(vault_fs::VaultSessions::default())`, register the new commands, add the on-exit lock hook (Tasks 6–7).

## Pure-function API this phase defines (single source of truth)

In `vault_fs.rs`. All take explicit paths so they unit-test without a Tauri runtime:

```rust
pub struct VaultPaths { pub db: PathBuf, pub enc: PathBuf, pub meta: PathBuf }

// Encrypt an existing plaintext db -> blob + vault.json; remove the plaintext db.
// Returns the one-time recovery key and the DEK (to seed the session).
pub fn enable_encryption_at(p: &VaultPaths, password: &str, aad: &[u8])
    -> Result<(String /*recovery*/, Zeroizing<[u8;32]>), VaultFsError>;

// Make the plaintext working db available. Returns the DEK for the session.
// Handles the crash case (a working db already present) by NOT clobbering it.
pub fn unlock_at(p: &VaultPaths, secret: &Secret, aad: &[u8])
    -> Result<Zeroizing<[u8;32]>, VaultFsError>;

// Re-encrypt the working db -> blob using the session DEK, then securely remove
// the plaintext working db.
pub fn lock_at(p: &VaultPaths, dek: &[u8;32], aad: &[u8]) -> Result<(), VaultFsError>;

// Decrypt to plaintext permanently: remove blob + vault.json, leave only {id}.db.
pub fn disable_encryption_at(p: &VaultPaths, dek: &[u8;32], aad: &[u8]) -> Result<(), VaultFsError>;

// Re-wrap the DEK under a new password (DB blob untouched).
pub fn change_password_at(p: &VaultPaths, old: &str, new: &str, aad: &[u8]) -> Result<(), VaultFsError>;

pub enum Secret { Password(String), Recovery(String) }
```

Session state + commands also in `vault_fs.rs`:

```rust
#[derive(Default)]
pub struct VaultSessions(pub Mutex<HashMap<String /*tenant id*/, Zeroizing<[u8;32]>>>);
```

---

### Task 1: Harden `vault.rs` — tenant-id AAD binding + zeroization

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/vault.rs` (functions + existing tests)

- [ ] **Step 1: Add the `zeroize` dependency**

In `src-tauri/Cargo.toml` `[dependencies]`, next to the other crypto crates added in Phase 1:

```toml
zeroize = "1"
```

- [ ] **Step 2: Add a failing test for AAD binding**

Inside `vault.rs`'s `mod tests`, add:

```rust
    #[test]
    fn wrong_aad_is_rejected() {
        let (meta, recovery, dek) = create_vault("pw", b"tenant-acme").unwrap();
        // Correct AAD unlocks.
        assert_eq!(*unlock_with_password(&meta, "pw", b"tenant-acme").unwrap(), *dek);
        assert_eq!(*unlock_with_recovery(&meta, &recovery, b"tenant-acme").unwrap(), *dek);
        // A different AAD (e.g. another tenant's id) is rejected even with the
        // right password — defeats vault/blob substitution across businesses.
        assert!(matches!(
            unlock_with_password(&meta, "pw", b"tenant-other"),
            Err(VaultError::Auth)
        ));
    }
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::wrong_aad_is_rejected`
Expected: FAIL — `create_vault` takes 1 argument, not 2 (compile error).

- [ ] **Step 4: Thread `aad` through wrapping + ops, and zeroize secrets**

In `vault.rs`:

(a) Add imports near the top of the non-test code:

```rust
use chacha20poly1305::aead::Payload;
use zeroize::Zeroizing;
```

(b) Change `wrap_key` / `unwrap_key` to take `aad` and use `Payload`:

```rust
fn wrap_key(wrapping_key: &[u8; 32], dek: &[u8; 32], aad: &[u8]) -> Result<WrappedKey, VaultError> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(wrapping_key));
    let nonce = random_bytes::<24>();
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: dek.as_ref(), aad })
        .map_err(|_| VaultError::Crypto)?;
    Ok(WrappedKey { nonce: BASE64.encode(&nonce), ct: BASE64.encode(&ct) })
}

fn unwrap_key(wrapping_key: &[u8; 32], w: &WrappedKey, aad: &[u8]) -> Result<Zeroizing<[u8; 32]>, VaultError> {
    let nonce = BASE64.decode(w.nonce.as_bytes()).map_err(|e| VaultError::Encoding(e.to_string()))?;
    let ct = BASE64.decode(w.ct.as_bytes()).map_err(|e| VaultError::Encoding(e.to_string()))?;
    if nonce.len() != 24 {
        return Err(VaultError::Encoding("bad nonce length".into()));
    }
    let cipher = XChaCha20Poly1305::new(Key::from_slice(wrapping_key));
    let pt = cipher
        .decrypt(XNonce::from_slice(&nonce), Payload { msg: ct.as_ref(), aad })
        .map_err(|_| VaultError::Auth)?;
    let arr: [u8; 32] = pt.try_into().map_err(|_| VaultError::Crypto)?;
    Ok(Zeroizing::new(arr))
}
```

(c) `derive_kek` returns a `Zeroizing<[u8;32]>`:

```rust
fn derive_kek(password: &[u8], salt: &[u8], m_cost: u32, t_cost: u32, p_cost: u32) -> Result<Zeroizing<[u8; 32]>, VaultError> {
    let params = Params::new(m_cost, t_cost, p_cost, Some(32)).map_err(|e| VaultError::Kdf(e.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut kek = Zeroizing::new([0u8; 32]);
    argon.hash_password_into(password, salt, kek.as_mut()).map_err(|e| VaultError::Kdf(e.to_string()))?;
    Ok(kek)
}
```

(d) `create_vault` / `unlock_with_password` / `unlock_with_recovery` / `change_password` take `aad: &[u8]`, return `Zeroizing<[u8;32]>` for DEKs, and pass `aad`/`&*kek` through. Full replacements:

```rust
pub fn create_vault(password: &str, aad: &[u8]) -> Result<(VaultMeta, String, Zeroizing<[u8; 32]>), VaultError> {
    let dek = Zeroizing::new(random_bytes::<32>());
    let recovery_bytes = Zeroizing::new(random_bytes::<32>());
    let salt = random_bytes::<16>();

    let kek_pw = derive_kek(password.as_bytes(), &salt, M_COST, T_COST, P_COST)?;
    let wrapped_by_password = wrap_key(&kek_pw, &dek, aad)?;
    let wrapped_by_recovery = wrap_key(&recovery_bytes, &dek, aad)?;

    let meta = VaultMeta {
        version: VAULT_VERSION,
        kdf: KdfMeta {
            algorithm: "argon2id".into(),
            m_cost: M_COST, t_cost: T_COST, p_cost: P_COST,
            salt: BASE64.encode(&salt),
        },
        wrapped_by_password,
        wrapped_by_recovery,
    };
    Ok((meta, encode_recovery_key(&recovery_bytes), dek))
}

pub fn unlock_with_password(meta: &VaultMeta, password: &str, aad: &[u8]) -> Result<Zeroizing<[u8; 32]>, VaultError> {
    let salt = BASE64.decode(meta.kdf.salt.as_bytes()).map_err(|e| VaultError::Encoding(e.to_string()))?;
    let kek = derive_kek(password.as_bytes(), &salt, meta.kdf.m_cost, meta.kdf.t_cost, meta.kdf.p_cost)?;
    unwrap_key(&kek, &meta.wrapped_by_password, aad)
}

pub fn unlock_with_recovery(meta: &VaultMeta, recovery_key: &str, aad: &[u8]) -> Result<Zeroizing<[u8; 32]>, VaultError> {
    let recovery_bytes = decode_recovery_key(recovery_key)?;
    unwrap_key(&recovery_bytes, &meta.wrapped_by_recovery, aad)
}

pub fn change_password(meta: &VaultMeta, old_password: &str, new_password: &str, aad: &[u8]) -> Result<VaultMeta, VaultError> {
    let dek = unlock_with_password(meta, old_password, aad)?;
    let salt = random_bytes::<16>();
    let kek = derive_kek(new_password.as_bytes(), &salt, M_COST, T_COST, P_COST)?;
    let wrapped_by_password = wrap_key(&kek, &dek, aad)?;
    Ok(VaultMeta {
        version: meta.version,
        kdf: KdfMeta {
            algorithm: "argon2id".into(),
            m_cost: M_COST, t_cost: T_COST, p_cost: P_COST,
            salt: BASE64.encode(&salt),
        },
        wrapped_by_password,
        wrapped_by_recovery: meta.wrapped_by_recovery.clone(),
    })
}
```

Note `decode_recovery_key` should also return `Zeroizing<[u8;32]>`; update its signature to `-> Result<Zeroizing<[u8; 32]>, VaultError>` and wrap the returned array in `Zeroizing::new(...)`. The `wrap_key(&recovery_bytes, ...)` and `unwrap_key(&recovery_bytes, ...)` calls deref through `Zeroizing` automatically.

- [ ] **Step 5: Update the existing Phase-1 tests to pass an `aad` and deref DEKs**

Every existing test that calls `create_vault`, `unlock_with_*`, or `change_password` now passes an AAD (use `b"tenant-test"` consistently) and compares with `*` deref where a `Zeroizing<[u8;32]>` is returned. Concretely update:
- `kek_is_deterministic_and_salt_sensitive`: `derive_kek(...)` now returns `Zeroizing`; compare with `*k1 == *k2` / `*k1 != *k3` and `k1.len()` still works via deref.
- `wrap_round_trips_and_rejects_wrong_key`: `wrap_key(&kek, &dek, b"aad")` and `unwrap_key(&wrong, &wrapped, b"aad")`; compare `*out == dek`.
- `recovery_key_round_trips` / `..._lenient_then_strict`: `decode_recovery_key` returns `Zeroizing`; compare `*decoded == bytes`.
- `create_then_unlock_both_ways`: `create_vault("hunter2", b"tenant-test")`, `unlock_with_password(&meta, "hunter2", b"tenant-test")` etc.; compare with `*`.
- `change_password_preserves_dek_and_recovery`: thread `b"tenant-test"` through all calls; compare with `*`.
- The file tests (`file_round_trips_*`, `empty_file_round_trips`, `truncated_*`, `exact_chunk_*`) call `encrypt_file`/`decrypt_file`, which are UNCHANGED — but their `dek` is now produced via `random_bytes::<32>()` directly (no change needed) OR via `create_vault` (add the aad). Leave `encrypt_file`/`decrypt_file` signatures as-is.
- `end_to_end_create_encrypt_recover_decrypt`: `create_vault("s3cret-pass", b"tenant-acme")`; `unlock_with_recovery(&meta_loaded, &recovery, b"tenant-acme")`; `encrypt_file(&db, &blob, &dek)` / `decrypt_file(&blob, &restored, &dek2)` — pass `&*dek` where a `&[u8;32]` is needed (e.g. `encrypt_file(&db, &blob, &dek)` becomes `encrypt_file(&db, &blob, &dek)`; since `Zeroizing<[u8;32]>` derefs to `[u8;32]`, `&dek` coerces — if the compiler complains, use `&*dek`).

- [ ] **Step 6: Run the full vault suite + the new test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault`
Expected: PASS — all prior tests (updated) plus `wrong_aad_is_rejected`.

- [ ] **Step 7: Confirm no warnings**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: no warnings from `vault.rs`.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/vault.rs
git commit -m "feat(vault): bind tenant-id AAD + zeroize key material"
```

---

### Task 2: `encrypted` flag on `Tenant` + tenants path/registry helpers

**Files:**
- Modify: `src-tauri/src/tenants.rs`

- [ ] **Step 1: Add a failing test**

Add a `#[cfg(test)] mod tests` block at the bottom of `tenants.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tenant_encrypted_defaults_false_for_legacy_json() {
        // A tenants.json written before this field existed must still parse,
        // with encrypted defaulting to false.
        let legacy = r#"{"active_tenant_id":"acme","tenants":[{"id":"acme","name":"Acme","logo_file":null}]}"#;
        let reg: TenantRegistry = serde_json::from_str(legacy).unwrap();
        assert_eq!(reg.tenants[0].encrypted, false);
    }

    #[test]
    fn tenant_encrypted_round_trips() {
        let t = Tenant { id: "acme".into(), name: "Acme".into(), logo_file: None, encrypted: true };
        let json = serde_json::to_string(&t).unwrap();
        let back: Tenant = serde_json::from_str(&json).unwrap();
        assert!(back.encrypted);
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tenants::tests`
Expected: FAIL — `Tenant` has no field `encrypted`.

- [ ] **Step 3: Add the field with a serde default**

In the `Tenant` struct, add:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tenant {
    pub id: String,
    pub name: String,
    pub logo_file: Option<String>,
    /// True once the user has enabled at-rest encryption for this business.
    /// `#[serde(default)]` so tenants.json written before this field parses
    /// (legacy entries are unencrypted).
    #[serde(default)]
    pub encrypted: bool,
}
```

Fix the three `Tenant { ... }` literals in this file (in `migrate_legacy_db`, `create_tenant`, `create_tenant_internal`) to add `encrypted: false`.

- [ ] **Step 4: Add path + registry helpers**

After the existing `tenant_db_path` helper, add:

```rust
pub fn tenant_enc_path(app: &AppHandle, tenant_id: &str) -> Result<PathBuf, String> {
    Ok(businesses_dir(app)?.join(format!("{tenant_id}.db.enc")))
}

pub fn tenant_vault_path(app: &AppHandle, tenant_id: &str) -> Result<PathBuf, String> {
    Ok(businesses_dir(app)?.join(format!("{tenant_id}.vault.json")))
}

pub fn tenant_db_path_public(app: &AppHandle, tenant_id: &str) -> Result<PathBuf, String> {
    tenant_db_path(app, tenant_id)
}
```

After `set_tenant_logo_internal`, add:

```rust
/// Flip a tenant's `encrypted` flag in the registry.
pub fn set_tenant_encrypted(app: &AppHandle, id: &str, encrypted: bool) -> Result<(), String> {
    let mut reg = read_registry(app)?;
    let tenant = reg.tenants.iter_mut().find(|t| t.id == id).ok_or("Tenant not found")?;
    tenant.encrypted = encrypted;
    write_registry(app, &reg)
}

/// Whether a tenant is marked encrypted.
pub fn is_tenant_encrypted(app: &AppHandle, id: &str) -> Result<bool, String> {
    let reg = read_registry(app)?;
    Ok(reg.tenants.iter().find(|t| t.id == id).map(|t| t.encrypted).unwrap_or(false))
}
```

- [ ] **Step 5: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tenants::tests`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/tenants.rs
git commit -m "feat(tenants): encrypted flag + vault path/registry helpers"
```

---

### Task 3: `vault_fs.rs` skeleton + `enable_encryption_at`

**Files:**
- Create: `src-tauri/src/vault_fs.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod vault_fs;`)

- [ ] **Step 1: Add the failing test**

Create `src-tauri/src/vault_fs.rs` with the skeleton + a test (the test exercises the not-yet-written function):

```rust
// Per-business vault orchestration: turns the vault.rs crypto primitives into
// on-disk operations over a tenant's database, and holds unlocked Data
// Encryption Keys (DEKs) in session memory. Pure path-taking functions here are
// unit-tested; thin #[tauri::command] wrappers (further down) resolve per-tenant
// paths from the AppHandle and manage the session. See
// docs/superpowers/specs/2026-06-02-per-business-encryption-design.md §5–§6.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use zeroize::Zeroizing;

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
}
```

- [ ] **Step 2: Register the module so the test compiles**

In `src-tauri/src/lib.rs`, add `mod vault_fs;` next to `mod vault;`:

```rust
mod vault;
mod vault_fs;
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs::tests::enable_encrypts_and_removes_plaintext`
Expected: FAIL — `cannot find function enable_encryption_at`.

- [ ] **Step 4: Implement `enable_encryption_at` + JSON helpers**

Add above the `#[cfg(test)]` block:

```rust
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
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs::tests::enable_encrypts_and_removes_plaintext`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/vault_fs.rs src-tauri/src/lib.rs
git commit -m "feat(vault_fs): enable_encryption_at + secure remove"
```

---

### Task 4: `unlock_at` (with crash-leftover handling) + `lock_at`

**Files:**
- Modify: `src-tauri/src/vault_fs.rs`

- [ ] **Step 1: Add failing tests**

Add inside `mod tests`:

```rust
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
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs::tests::unlock_decrypts_then_lock_reencrypts`
Expected: FAIL — `cannot find function unlock_at`.

- [ ] **Step 3: Implement `unlock_at` + `lock_at`**

Add above the `#[cfg(test)]` block:

```rust
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
```

- [ ] **Step 4: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs::tests::unlock_decrypts_then_lock_reencrypts vault_fs::tests::unlock_preserves_crash_leftover_db`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault_fs.rs
git commit -m "feat(vault_fs): unlock_at (crash-safe) + lock_at"
```

---

### Task 5: `disable_encryption_at` + `change_password_at`

**Files:**
- Modify: `src-tauri/src/vault_fs.rs`

- [ ] **Step 1: Add failing tests**

Add inside `mod tests`:

```rust
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
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs::tests::disable_leaves_only_plaintext`
Expected: FAIL — `cannot find function disable_encryption_at`.

- [ ] **Step 3: Implement both**

Add above the `#[cfg(test)]` block:

```rust
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
```

- [ ] **Step 4: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs::tests::disable_leaves_only_plaintext vault_fs::tests::change_password_updates_only_meta`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault_fs.rs
git commit -m "feat(vault_fs): disable_encryption_at + change_password_at"
```

---

### Task 6: Session state + Tauri command wrappers + registration

**Files:**
- Modify: `src-tauri/src/vault_fs.rs` (session type + commands)
- Modify: `src-tauri/src/lib.rs` (manage state + register commands)

- [ ] **Step 1: Add `VaultSessions` + a unit test for it**

Add to `vault_fs.rs` (above `#[cfg(test)]`):

```rust
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
```

Add inside `mod tests`:

```rust
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
```

- [ ] **Step 2: Run it to confirm it passes** (no command wiring needed yet)

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs::tests::sessions_track_unlocked_keys`
Expected: PASS.

- [ ] **Step 3: Add the command wrappers**

Add to `vault_fs.rs` (these resolve paths from the `AppHandle`, use the tenant id as AAD, and update the session + registry). Imports to add at the top: `use tauri::{AppHandle, State};` and `use crate::tenants;`.

```rust
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
```

- [ ] **Step 4: Register state + commands in `lib.rs`**

In `src-tauri/src/lib.rs`:

(a) After the existing `.manage(phone_upload::PhoneUploadState::default())` line, add:

```rust
.manage(vault_fs::VaultSessions::default())
```

(b) In the `tauri::generate_handler![ ... ]` list, add the six commands (after the `tenants::...` block):

```rust
            vault_fs::tenant_lock_state,
            vault_fs::enable_tenant_encryption,
            vault_fs::unlock_tenant,
            vault_fs::lock_tenant,
            vault_fs::change_tenant_password,
            vault_fs::disable_tenant_encryption,
```

- [ ] **Step 5: Verify it compiles + all tests pass**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles, no warnings (the command fns are now reachable via the handler, so no dead-code warnings).

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs`
Expected: PASS — all vault_fs tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/vault_fs.rs src-tauri/src/lib.rs
git commit -m "feat(vault_fs): session state + Tauri commands (enable/unlock/lock/disable/change-pw)"
```

---

### Task 7: Lock-all-on-exit hook

**Files:**
- Modify: `src-tauri/src/vault_fs.rs` (a reusable lock-all helper)
- Modify: `src-tauri/src/lib.rs` (wire the exit hook)

- [ ] **Step 1: Add a lock-all helper (with a unit test on the pure part)**

The exit hook itself needs an `AppHandle` (hard to unit-test), so factor the loop into a helper that the test can drive with explicit paths. Add to `vault_fs.rs`:

```rust
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
```

Add inside `mod tests` a test that exercises the seal loop without an AppHandle by calling `lock_at` directly across two vaults (the `lock_all` AppHandle wrapper is covered by manual verification in Step 4):

```rust
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
```

- [ ] **Step 2: Run it to confirm it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs::tests::locking_two_vaults_seals_both`
Expected: PASS.

- [ ] **Step 3: Wire the exit hook in `lib.rs`**

Tauri fires `RunEvent::ExitRequested` (and `Exit`) when the app is closing. Replace the tail of `run()` — currently:

```rust
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
```

with a `.build(...)` + `.run(|app_handle, event| { ... })` form so we can hook the exit:

```rust
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Seal every unlocked business back to its encrypted blob before
                // the process dies, so a plaintext working db isn't left behind.
                let sessions = app_handle.state::<vault_fs::VaultSessions>();
                let _ = vault_fs::lock_all(app_handle, &sessions);
            }
        });
```

Add `use tauri::Manager;` if `app_handle.state::<...>()` isn't already in scope (the file already imports tauri menu/tray items; `Manager` provides `.state()`).

- [ ] **Step 4: Compile + manual verification**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles, no warnings.

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault_fs vault tenants`
Expected: all green.

Manual smoke test (document the result in the commit / PR, do not skip): run `bun run tauri:dev`, and from the devtools console invoke the commands to confirm the round trip against a real tenant. With an active business `acme` whose `businesses/acme.db` exists:

```js
// enable -> returns a recovery key string; acme.db.enc + acme.vault.json appear, acme.db disappears
await window.__TAURI__.core.invoke('enable_tenant_encryption', { id: 'acme', password: 'test1234' })
// state -> "unlocked" (session seeded on enable)
await window.__TAURI__.core.invoke('tenant_lock_state', { id: 'acme' })
// lock -> acme.db re-encrypts away; state -> "locked"
await window.__TAURI__.core.invoke('lock_tenant', { id: 'acme' })
await window.__TAURI__.core.invoke('tenant_lock_state', { id: 'acme' })
// unlock -> acme.db reappears; state -> "unlocked"
await window.__TAURI__.core.invoke('unlock_tenant', { id: 'acme', secret: 'test1234', useRecovery: false })
// disable -> acme.db remains, .enc + .vault.json gone
await window.__TAURI__.core.invoke('disable_tenant_encryption', { id: 'acme', password: 'test1234' })
```

Confirm the files appear/disappear under `%APPDATA%\com.sakoram.billing\businesses\` as described.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault_fs.rs src-tauri/src/lib.rs
git commit -m "feat(vault_fs): lock all unlocked businesses on app exit"
```

---

## Self-review notes

- **Spec coverage (§5 Storage layout):** `.db` / `.db.enc` / `.vault.json` paths (Task 2) ✓; `encrypted` flag on the registry (Task 2) ✓; DEK held in process memory via `VaultSessions` (Task 6) ✓.
- **Spec coverage (§6 Lifecycle):** unlock → working db (Task 4, 6) ✓; lock = re-encrypt + wipe (Task 4, 6) ✓; lock-on-exit (Task 7) ✓; crash recovery — leftover db wins over stale blob (Task 4) ✓. The *switch-locks-previous* and *access guard* are frontend coordination → **Phase 2b** (this phase exposes `lock_tenant` + `tenant_lock_state` that 2b calls).
- **Spec coverage (§8 edge cases):** secure-remove with documented forensic caveat (Task 3, matches §8.3) ✓; unencrypted default untouched — all new code paths gate on the `encrypted` flag / vault files existing (Tasks 2, 6) ✓.
- **Phase-1 review follow-ups:** tenant-id AAD binding (Task 1) ✓; key zeroization via `Zeroizing` + `VaultSessions` (Tasks 1, 6) ✓.
- **Deferred to later phases (correctly out of scope here):** encrypted export bundles (§8.2 → Phase 3); enable/disable/unlock UI + recovery-key display (§7 → Phase 2b/2c); idle-lock (§ Phase 3).
- **Placeholder scan:** none — every code step has complete code; the one non-cargo verification (Task 7 Step 4) is an explicit manual smoke test with exact commands, appropriate because Tauri command + exit-hook wiring can't be unit-tested without a runtime.
- **Type consistency:** `VaultPaths{db,enc,meta}`, `Secret::{Password,Recovery}`, `VaultSessions`, `LockState`, and the `*_at` function signatures match across all tasks; `vault.rs` ops uniformly take `aad: &[u8]` and return `Zeroizing<[u8;32]>` after Task 1.

## Dependency on later phases

This phase ships the backend with **no behavioural change to the app** — the commands exist but nothing calls them yet (the frontend wiring is Phase 2b). The Rust unit tests + the Task 7 manual smoke test are the verification that the vault works end-to-end before any UI is built on it.

## Versioning / PR

Per project rules, the eventual PR bumps the version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (minor). Do that only when opening the PR, not during per-task commits. Do not open the PR until the user asks.
