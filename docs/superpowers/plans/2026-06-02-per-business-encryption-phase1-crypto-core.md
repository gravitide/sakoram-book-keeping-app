# Per-business encryption — Phase 1 (crypto core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, unit-tested Rust crypto module (`vault.rs`) that does envelope encryption for a business database — generate a data key, wrap it with a password and a recovery key, and stream-encrypt/decrypt a file — with zero coupling to the app, Tauri, or the database layer.

**Architecture:** Envelope encryption. A random 256-bit Data Encryption Key (DEK) encrypts the DB file via streaming AEAD. The DEK is wrapped (AEAD-encrypted) twice: once under a key derived from the password (Argon2id), once under a random recovery key. Vault metadata (salt, KDF params, both wrapped DEKs) serialises to JSON and holds no usable secret on its own. This phase delivers the library only — no Tauri commands, no lifecycle, no UI (those are Phase 2).

**Tech Stack:** Rust, RustCrypto crates — `argon2` (KDF), `chacha20poly1305` (XChaCha20-Poly1305 one-shot + STREAM), `rand_core` (CSPRNG), `data-encoding` (base64/base32), `thiserror` (errors, already a dep), `serde` (already a dep).

**Spec:** `docs/superpowers/specs/2026-06-02-per-business-encryption-design.md` (§4 Cryptographic design, §10 Testing).

**Where it runs:** Rust tests via `cargo test`. The first build is slow (the crate vendors qpdf); subsequent runs are incremental.

> **Branch workflow (project rule):** This plan is executed on its own branch off `main` (`feat/encryption-phase1-crypto-core`). Do not work on `main`. The per-task commits below accumulate on that branch; the PR is opened only when the user asks.

---

## File structure

- **Create** `src-tauri/src/vault.rs` — the entire crypto module: error type, metadata
  structs, KDF, key wrapping, recovery-key encoding, high-level vault operations,
  streaming file encryption, and an inline `#[cfg(test)] mod tests`.
- **Modify** `src-tauri/src/lib.rs` — add `mod vault;` so the module compiles into the
  crate. No command registration in this phase.
- **Modify** `src-tauri/Cargo.toml` — add the crypto dependencies.

All public functions in `vault.rs` are unused by the rest of the crate until Phase 2,
so the module carries `#![allow(dead_code)]` with a comment pointing at Phase 2.

---

## Public API this phase defines (single source of truth)

Later tasks must match these names/signatures exactly:

```rust
pub enum VaultError { Auth, Kdf(String), Encoding(String), Io(std::io::Error), Crypto }

pub struct WrappedKey { pub nonce: String, pub ct: String }      // base64 fields
pub struct KdfMeta    { pub algorithm: String, pub m_cost: u32, pub t_cost: u32, pub p_cost: u32, pub salt: String }
pub struct VaultMeta  { pub version: u32, pub kdf: KdfMeta, pub wrapped_by_password: WrappedKey, pub wrapped_by_recovery: WrappedKey }

// internal helpers
fn derive_kek(password: &[u8], salt: &[u8], m_cost: u32, t_cost: u32, p_cost: u32) -> Result<[u8; 32], VaultError>
fn random_bytes<const N: usize>() -> [u8; N]
fn wrap_key(wrapping_key: &[u8; 32], dek: &[u8; 32]) -> Result<WrappedKey, VaultError>
fn unwrap_key(wrapping_key: &[u8; 32], w: &WrappedKey) -> Result<[u8; 32], VaultError>
fn encode_recovery_key(bytes: &[u8; 32]) -> String
fn decode_recovery_key(s: &str) -> Result<[u8; 32], VaultError>

// public operations
pub fn create_vault(password: &str) -> Result<(VaultMeta, String, [u8; 32]), VaultError>   // (meta, recovery_key, dek)
pub fn unlock_with_password(meta: &VaultMeta, password: &str) -> Result<[u8; 32], VaultError>
pub fn unlock_with_recovery(meta: &VaultMeta, recovery_key: &str) -> Result<[u8; 32], VaultError>
pub fn change_password(meta: &VaultMeta, old_password: &str, new_password: &str) -> Result<VaultMeta, VaultError>
pub fn encrypt_file(plaintext: &std::path::Path, ciphertext: &std::path::Path, dek: &[u8; 32]) -> Result<(), VaultError>
pub fn decrypt_file(ciphertext: &std::path::Path, plaintext: &std::path::Path, dek: &[u8; 32]) -> Result<(), VaultError>
```

KDF cost constants (module-level): `M_COST: u32 = 19456` (19 MiB), `T_COST: u32 = 2`, `P_COST: u32 = 1`.
Stream chunk: `const CHUNK: usize = 65536;`.

---

### Task 1: Dependencies + module skeleton (types, error, constants)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/vault.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add crypto dependencies to `src-tauri/Cargo.toml`**

In the `[dependencies]` section (e.g. right after `thiserror = "2"`), add:

```toml
# Per-business encryption (src/vault.rs): envelope encryption of a business
# database. argon2 derives the password key; chacha20poly1305 provides the
# XChaCha20-Poly1305 AEAD (one-shot for key wrapping, STREAM for the DB file);
# data-encoding gives us base64 (vault JSON) + base32 (recovery key); rand_core
# is the OS CSPRNG.
argon2 = "0.5"
chacha20poly1305 = { version = "0.10", features = [ "stream" ] }
rand_core = { version = "0.6", features = [ "getrandom" ] }
data-encoding = "2"
```

- [ ] **Step 2: Create `src-tauri/src/vault.rs` with the skeleton**

```rust
// Per-business at-rest encryption — crypto core.
//
// Envelope encryption: a random Data Encryption Key (DEK) encrypts the
// business database (streaming XChaCha20-Poly1305). The DEK is wrapped twice
// — under a password-derived key (Argon2id) and under a random recovery key —
// so the DB can be unlocked by either, and the password can change without
// re-encrypting the whole DB. See
// docs/superpowers/specs/2026-06-02-per-business-encryption-design.md §4.
//
// Phase 1 (this file) is the pure library: no Tauri commands, no DB, no UI.
// Phase 2 wires these functions into the tenant lifecycle, which is why the
// public functions are currently unused.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

// Argon2id cost parameters (OWASP-recommended baseline). m_cost is in KiB.
const M_COST: u32 = 19456; // 19 MiB
const T_COST: u32 = 2;
const P_COST: u32 = 1;

// Plaintext chunk size for streaming file encryption.
const CHUNK: usize = 65536;

// Current on-disk vault format version.
const VAULT_VERSION: u32 = 1;

#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("invalid password or recovery key")]
    Auth,
    #[error("key derivation failed: {0}")]
    Kdf(String),
    #[error("encoding error: {0}")]
    Encoding(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("crypto error")]
    Crypto,
}

/// An AEAD-encrypted 32-byte key (nonce + ciphertext, both base64).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WrappedKey {
    pub nonce: String,
    pub ct: String,
}

/// Key-derivation parameters + salt (base64). Not secret.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdfMeta {
    pub algorithm: String,
    pub m_cost: u32,
    pub t_cost: u32,
    pub p_cost: u32,
    pub salt: String,
}

/// Everything needed to unlock a vault given the password or recovery key.
/// Contains no usable secret on its own.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMeta {
    pub version: u32,
    pub kdf: KdfMeta,
    pub wrapped_by_password: WrappedKey,
    pub wrapped_by_recovery: WrappedKey,
}
```

- [ ] **Step 3: Register the module in `src-tauri/src/lib.rs`**

Find the module declarations near the top:

```rust
mod data_io;
mod pdf;
mod phone_upload;
mod tenants;
```

Add `vault`:

```rust
mod data_io;
mod pdf;
mod phone_upload;
mod tenants;
mod vault;
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Finishes successfully (the new crates download + compile; the module compiles with no warnings because of `#![allow(dead_code)]`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/vault.rs src-tauri/src/lib.rs
git commit -m "feat(vault): crypto module skeleton + crypto deps"
```

---

### Task 2: Key derivation (`derive_kek`)

**Files:**
- Modify: `src-tauri/src/vault.rs`

- [ ] **Step 1: Add the failing test**

Add to the bottom of `vault.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kek_is_deterministic_and_salt_sensitive() {
        let salt_a = [1u8; 16];
        let salt_b = [2u8; 16];
        let k1 = derive_kek(b"correct horse", &salt_a, M_COST, T_COST, P_COST).unwrap();
        let k2 = derive_kek(b"correct horse", &salt_a, M_COST, T_COST, P_COST).unwrap();
        let k3 = derive_kek(b"correct horse", &salt_b, M_COST, T_COST, P_COST).unwrap();
        assert_eq!(k1, k2, "same password+salt must derive the same key");
        assert_ne!(k1, k3, "different salt must derive a different key");
        assert_eq!(k1.len(), 32);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::kek_is_deterministic_and_salt_sensitive`
Expected: FAIL — `cannot find function derive_kek in this scope` (compile error).

- [ ] **Step 3: Implement `derive_kek`**

Add above the `#[cfg(test)]` block:

```rust
use argon2::{Algorithm, Argon2, Params, Version};

fn derive_kek(
    password: &[u8],
    salt: &[u8],
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
) -> Result<[u8; 32], VaultError> {
    let params = Params::new(m_cost, t_cost, p_cost, Some(32))
        .map_err(|e| VaultError::Kdf(e.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut kek = [0u8; 32];
    argon
        .hash_password_into(password, salt, &mut kek)
        .map_err(|e| VaultError::Kdf(e.to_string()))?;
    Ok(kek)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::kek_is_deterministic_and_salt_sensitive`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault.rs
git commit -m "feat(vault): Argon2id key derivation"
```

---

### Task 3: Random bytes + key wrapping (`random_bytes`, `wrap_key`, `unwrap_key`)

**Files:**
- Modify: `src-tauri/src/vault.rs`

- [ ] **Step 1: Add the failing test**

Add inside `mod tests`:

```rust
    #[test]
    fn wrap_round_trips_and_rejects_wrong_key() {
        let kek = [7u8; 32];
        let dek = random_bytes::<32>();
        let wrapped = wrap_key(&kek, &dek).unwrap();

        // Correct key unwraps to the original DEK.
        let out = unwrap_key(&kek, &wrapped).unwrap();
        assert_eq!(out, dek);

        // Wrong key fails authentication.
        let wrong = [8u8; 32];
        assert!(matches!(unwrap_key(&wrong, &wrapped), Err(VaultError::Auth)));

        // Two wraps of the same DEK differ (random nonce).
        let wrapped2 = wrap_key(&kek, &dek).unwrap();
        assert_ne!(wrapped.ct, wrapped2.ct);
    }

    #[test]
    fn random_bytes_are_not_constant() {
        assert_ne!(random_bytes::<32>(), random_bytes::<32>());
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::wrap_round_trips_and_rejects_wrong_key`
Expected: FAIL — `cannot find function random_bytes` / `wrap_key` / `unwrap_key`.

- [ ] **Step 3: Implement the helpers**

Add above the `#[cfg(test)]` block:

```rust
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    Key, XChaCha20Poly1305, XNonce,
};
use data_encoding::BASE64;
use rand_core::{OsRng, RngCore};

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut buf = [0u8; N];
    OsRng.fill_bytes(&mut buf);
    buf
}

fn wrap_key(wrapping_key: &[u8; 32], dek: &[u8; 32]) -> Result<WrappedKey, VaultError> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(wrapping_key));
    let nonce = random_bytes::<24>();
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce), dek.as_ref())
        .map_err(|_| VaultError::Crypto)?;
    Ok(WrappedKey {
        nonce: BASE64.encode(&nonce),
        ct: BASE64.encode(&ct),
    })
}

fn unwrap_key(wrapping_key: &[u8; 32], w: &WrappedKey) -> Result<[u8; 32], VaultError> {
    let nonce = BASE64
        .decode(w.nonce.as_bytes())
        .map_err(|e| VaultError::Encoding(e.to_string()))?;
    let ct = BASE64
        .decode(w.ct.as_bytes())
        .map_err(|e| VaultError::Encoding(e.to_string()))?;
    if nonce.len() != 24 {
        return Err(VaultError::Encoding("bad nonce length".into()));
    }
    let cipher = XChaCha20Poly1305::new(Key::from_slice(wrapping_key));
    let pt = cipher
        .decrypt(XNonce::from_slice(&nonce), ct.as_ref())
        .map_err(|_| VaultError::Auth)?;
    pt.try_into().map_err(|_| VaultError::Crypto)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::wrap_round_trips_and_rejects_wrong_key vault::tests::random_bytes_are_not_constant`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault.rs
git commit -m "feat(vault): random bytes + AEAD key wrapping"
```

---

### Task 4: Recovery-key encoding (`encode_recovery_key`, `decode_recovery_key`)

**Files:**
- Modify: `src-tauri/src/vault.rs`

- [ ] **Step 1: Add the failing test**

Add inside `mod tests`:

```rust
    #[test]
    fn recovery_key_round_trips() {
        let bytes = random_bytes::<32>();
        let encoded = encode_recovery_key(&bytes);
        // Human-friendly: uppercase base32 in dash-separated groups.
        assert!(encoded.contains('-'));
        let decoded = decode_recovery_key(&encoded).unwrap();
        assert_eq!(decoded, bytes);
    }

    #[test]
    fn recovery_key_decode_is_lenient_then_strict() {
        let bytes = [9u8; 32];
        let encoded = encode_recovery_key(&bytes);
        // Lowercase + extra spaces/dashes should still decode (user transcription).
        let messy = format!("  {}  ", encoded.to_lowercase().replace('-', " - "));
        assert_eq!(decode_recovery_key(&messy).unwrap(), bytes);
        // Garbage fails.
        assert!(decode_recovery_key("not a real key!!!").is_err());
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::recovery_key_round_trips`
Expected: FAIL — `cannot find function encode_recovery_key`.

- [ ] **Step 3: Implement the encoders**

Add above the `#[cfg(test)]` block (the `BASE32_NOPAD` import joins the existing `data_encoding` use — adjust that line):

```rust
use data_encoding::{BASE32_NOPAD, BASE64};

fn encode_recovery_key(bytes: &[u8; 32]) -> String {
    // Uppercase base32, no padding, grouped in 4s with dashes for readability.
    let raw = BASE32_NOPAD.encode(bytes);
    raw.as_bytes()
        .chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap())
        .collect::<Vec<_>>()
        .join("-")
}

fn decode_recovery_key(s: &str) -> Result<[u8; 32], VaultError> {
    // Normalise: strip whitespace + dashes, uppercase. Tolerates how a human
    // re-types the grouped key.
    let cleaned: String = s
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect::<String>()
        .to_uppercase();
    let bytes = BASE32_NOPAD
        .decode(cleaned.as_bytes())
        .map_err(|e| VaultError::Encoding(e.to_string()))?;
    bytes
        .try_into()
        .map_err(|_| VaultError::Encoding("recovery key wrong length".into()))
}
```

> Note: replace the earlier `use data_encoding::BASE64;` line (added in Task 3)
> with the combined `use data_encoding::{BASE32_NOPAD, BASE64};` so `BASE64`
> isn't imported twice.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::recovery_key_round_trips vault::tests::recovery_key_decode_is_lenient_then_strict`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault.rs
git commit -m "feat(vault): recovery-key base32 encoding"
```

---

### Task 5: Vault creation + unlock (`create_vault`, `unlock_with_password`, `unlock_with_recovery`)

**Files:**
- Modify: `src-tauri/src/vault.rs`

- [ ] **Step 1: Add the failing test**

Add inside `mod tests`:

```rust
    #[test]
    fn create_then_unlock_both_ways() {
        let (meta, recovery, dek) = create_vault("hunter2").unwrap();

        // Metadata shape.
        assert_eq!(meta.version, VAULT_VERSION);
        assert_eq!(meta.kdf.algorithm, "argon2id");
        assert!(!meta.kdf.salt.is_empty());

        // Password unlocks to the same DEK.
        assert_eq!(unlock_with_password(&meta, "hunter2").unwrap(), dek);
        // Recovery key unlocks to the same DEK.
        assert_eq!(unlock_with_recovery(&meta, &recovery).unwrap(), dek);

        // Wrong password is rejected.
        assert!(matches!(unlock_with_password(&meta, "wrong"), Err(VaultError::Auth)));
        // Wrong recovery key is rejected.
        let other = encode_recovery_key(&[0u8; 32]);
        assert!(matches!(unlock_with_recovery(&meta, &other), Err(VaultError::Auth)));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::create_then_unlock_both_ways`
Expected: FAIL — `cannot find function create_vault`.

- [ ] **Step 3: Implement the operations**

Add above the `#[cfg(test)]` block:

```rust
pub fn create_vault(password: &str) -> Result<(VaultMeta, String, [u8; 32]), VaultError> {
    let dek = random_bytes::<32>();
    let recovery_bytes = random_bytes::<32>();
    let salt = random_bytes::<16>();

    let kek_pw = derive_kek(password.as_bytes(), &salt, M_COST, T_COST, P_COST)?;
    let wrapped_by_password = wrap_key(&kek_pw, &dek)?;
    let wrapped_by_recovery = wrap_key(&recovery_bytes, &dek)?;

    let meta = VaultMeta {
        version: VAULT_VERSION,
        kdf: KdfMeta {
            algorithm: "argon2id".into(),
            m_cost: M_COST,
            t_cost: T_COST,
            p_cost: P_COST,
            salt: BASE64.encode(&salt),
        },
        wrapped_by_password,
        wrapped_by_recovery,
    };
    Ok((meta, encode_recovery_key(&recovery_bytes), dek))
}

pub fn unlock_with_password(meta: &VaultMeta, password: &str) -> Result<[u8; 32], VaultError> {
    let salt = BASE64
        .decode(meta.kdf.salt.as_bytes())
        .map_err(|e| VaultError::Encoding(e.to_string()))?;
    let kek = derive_kek(
        password.as_bytes(),
        &salt,
        meta.kdf.m_cost,
        meta.kdf.t_cost,
        meta.kdf.p_cost,
    )?;
    unwrap_key(&kek, &meta.wrapped_by_password)
}

pub fn unlock_with_recovery(meta: &VaultMeta, recovery_key: &str) -> Result<[u8; 32], VaultError> {
    let recovery_bytes = decode_recovery_key(recovery_key)?;
    unwrap_key(&recovery_bytes, &meta.wrapped_by_recovery)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::create_then_unlock_both_ways`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault.rs
git commit -m "feat(vault): create + unlock (password / recovery)"
```

---

### Task 6: Change password (`change_password`)

**Files:**
- Modify: `src-tauri/src/vault.rs`

- [ ] **Step 1: Add the failing test**

Add inside `mod tests`:

```rust
    #[test]
    fn change_password_preserves_dek_and_recovery() {
        let (meta, recovery, dek) = create_vault("old-pass").unwrap();
        let meta2 = change_password(&meta, "old-pass", "new-pass").unwrap();

        // New password unlocks to the SAME DEK (DB never re-encrypted).
        assert_eq!(unlock_with_password(&meta2, "new-pass").unwrap(), dek);
        // Old password no longer works.
        assert!(matches!(unlock_with_password(&meta2, "old-pass"), Err(VaultError::Auth)));
        // Recovery key still works unchanged.
        assert_eq!(unlock_with_recovery(&meta2, &recovery).unwrap(), dek);
        // Wrong current password is rejected up front.
        assert!(matches!(change_password(&meta, "nope", "x"), Err(VaultError::Auth)));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::change_password_preserves_dek_and_recovery`
Expected: FAIL — `cannot find function change_password`.

- [ ] **Step 3: Implement `change_password`**

Add above the `#[cfg(test)]` block:

```rust
pub fn change_password(
    meta: &VaultMeta,
    old_password: &str,
    new_password: &str,
) -> Result<VaultMeta, VaultError> {
    // Authenticate + recover the DEK with the current password.
    let dek = unlock_with_password(meta, old_password)?;

    // Re-wrap the SAME DEK under a fresh salt + new password. The DB blob is
    // untouched; only the password wrapping changes. Recovery wrapping is
    // carried over verbatim (it wraps the same DEK).
    let salt = random_bytes::<16>();
    let kek = derive_kek(new_password.as_bytes(), &salt, M_COST, T_COST, P_COST)?;
    let wrapped_by_password = wrap_key(&kek, &dek)?;

    Ok(VaultMeta {
        version: meta.version,
        kdf: KdfMeta {
            algorithm: "argon2id".into(),
            m_cost: M_COST,
            t_cost: T_COST,
            p_cost: P_COST,
            salt: BASE64.encode(&salt),
        },
        wrapped_by_password,
        wrapped_by_recovery: meta.wrapped_by_recovery.clone(),
    })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::change_password_preserves_dek_and_recovery`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault.rs
git commit -m "feat(vault): change password (re-wrap DEK, no DB re-encrypt)"
```

---

### Task 7: Streaming file encryption (`encrypt_file`, `decrypt_file`)

**Files:**
- Modify: `src-tauri/src/vault.rs`

- [ ] **Step 1: Add the failing test**

Add inside `mod tests`:

```rust
    #[test]
    fn file_round_trips_across_chunk_boundaries() {
        use std::io::Write;

        let dek = random_bytes::<32>();
        let dir = std::env::temp_dir().join(format!("vault-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let plain = dir.join("plain.bin");
        let enc = dir.join("plain.bin.enc");
        let out = dir.join("plain.out");

        // A payload larger than CHUNK so streaming spans multiple blocks.
        let data: Vec<u8> = (0..(CHUNK * 2 + 1234)).map(|i| (i % 251) as u8).collect();
        std::fs::File::create(&plain).unwrap().write_all(&data).unwrap();

        encrypt_file(&plain, &enc, &dek).unwrap();
        // Ciphertext is not the plaintext.
        assert_ne!(std::fs::read(&enc).unwrap(), data);

        decrypt_file(&enc, &out, &dek).unwrap();
        assert_eq!(std::fs::read(&out).unwrap(), data);

        // Wrong DEK fails authentication.
        let wrong = random_bytes::<32>();
        let bad = dir.join("bad.out");
        assert!(decrypt_file(&enc, &bad, &wrong).is_err());

        // A flipped byte fails authentication.
        let mut ct = std::fs::read(&enc).unwrap();
        let last = ct.len() - 1;
        ct[last] ^= 0xFF;
        let tampered = dir.join("tampered.enc");
        std::fs::write(&tampered, &ct).unwrap();
        let bad2 = dir.join("bad2.out");
        assert!(decrypt_file(&tampered, &bad2, &dek).is_err());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn empty_file_round_trips() {
        let dek = random_bytes::<32>();
        let dir = std::env::temp_dir().join(format!("vault-empty-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let plain = dir.join("empty.bin");
        let enc = dir.join("empty.enc");
        let out = dir.join("empty.out");
        std::fs::write(&plain, b"").unwrap();

        encrypt_file(&plain, &enc, &dek).unwrap();
        decrypt_file(&enc, &out, &dek).unwrap();
        assert_eq!(std::fs::read(&out).unwrap(), Vec::<u8>::new());

        std::fs::remove_dir_all(&dir).ok();
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::file_round_trips_across_chunk_boundaries`
Expected: FAIL — `cannot find function encrypt_file`.

- [ ] **Step 3: Implement streaming file encryption**

Add above the `#[cfg(test)]` block. The `stream` and `generic_array` items join the
existing `chacha20poly1305::aead` import — replace the Task 3 import line
`use chacha20poly1305::{aead::{Aead, KeyInit}, Key, XChaCha20Poly1305, XNonce};` with:

```rust
use chacha20poly1305::{
    aead::{generic_array::GenericArray, stream, Aead, KeyInit},
    Key, XChaCha20Poly1305, XNonce,
};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

// File format: [19-byte STREAM nonce][chunk][chunk]... where each non-final
// chunk is CHUNK plaintext bytes + 16-byte tag, and the final chunk is the
// remaining (0..CHUNK) bytes + tag, sealed with the STREAM "last block" flag.
// XChaCha20-Poly1305 has a 24-byte nonce; STREAM (BE32) reserves 5 bytes for
// its counter + flag, leaving a 19-byte per-file nonce.

pub fn encrypt_file(plaintext: &Path, ciphertext: &Path, dek: &[u8; 32]) -> Result<(), VaultError> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(dek));
    let stream_nonce = random_bytes::<19>();
    let mut encryptor =
        stream::EncryptorBE32::from_aead(cipher, GenericArray::from_slice(&stream_nonce));

    let mut reader = File::open(plaintext)?;
    let mut writer = File::create(ciphertext)?;
    writer.write_all(&stream_nonce)?;

    let mut buf = Vec::with_capacity(CHUNK);
    loop {
        buf.clear();
        let n = reader.by_ref().take(CHUNK as u64).read_to_end(&mut buf)?;
        if n == CHUNK {
            let ct = encryptor
                .encrypt_next(buf.as_slice())
                .map_err(|_| VaultError::Crypto)?;
            writer.write_all(&ct)?;
        } else {
            let ct = encryptor
                .encrypt_last(buf.as_slice())
                .map_err(|_| VaultError::Crypto)?;
            writer.write_all(&ct)?;
            break;
        }
    }
    writer.flush()?;
    Ok(())
}

pub fn decrypt_file(ciphertext: &Path, plaintext: &Path, dek: &[u8; 32]) -> Result<(), VaultError> {
    const ENC_CHUNK: usize = CHUNK + 16; // plaintext chunk + Poly1305 tag

    let mut reader = File::open(ciphertext)?;
    let mut stream_nonce = [0u8; 19];
    reader.read_exact(&mut stream_nonce)?;

    let cipher = XChaCha20Poly1305::new(Key::from_slice(dek));
    let mut decryptor =
        stream::DecryptorBE32::from_aead(cipher, GenericArray::from_slice(&stream_nonce));

    let mut writer = File::create(plaintext)?;
    let mut buf = Vec::with_capacity(ENC_CHUNK);
    loop {
        buf.clear();
        let n = reader.by_ref().take(ENC_CHUNK as u64).read_to_end(&mut buf)?;
        if n == ENC_CHUNK {
            let pt = decryptor
                .decrypt_next(buf.as_slice())
                .map_err(|_| VaultError::Auth)?;
            writer.write_all(&pt)?;
        } else {
            let pt = decryptor
                .decrypt_last(buf.as_slice())
                .map_err(|_| VaultError::Auth)?;
            writer.write_all(&pt)?;
            break;
        }
    }
    writer.flush()?;
    Ok(())
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::file_round_trips_across_chunk_boundaries vault::tests::empty_file_round_trips`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault.rs
git commit -m "feat(vault): streaming file encryption (XChaCha20-Poly1305 STREAM)"
```

---

### Task 8: End-to-end vault test + full suite green

**Files:**
- Modify: `src-tauri/src/vault.rs`

- [ ] **Step 1: Add an end-to-end test**

Add inside `mod tests` — exercises the full envelope flow against a real file,
the way Phase 2 will use it (create vault → encrypt DB → unlock via recovery →
decrypt → bytes identical):

```rust
    #[test]
    fn end_to_end_create_encrypt_recover_decrypt() {
        let dir = std::env::temp_dir().join(format!("vault-e2e-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("business.db");
        let blob = dir.join("business.db.enc");
        let restored = dir.join("business.restored.db");

        // Stand-in for a SQLite file.
        let contents: Vec<u8> = (0..200_000u32).map(|i| (i % 256) as u8).collect();
        std::fs::write(&db, &contents).unwrap();

        // Enable encryption: create vault, encrypt the DB with its DEK.
        let (meta, recovery, dek) = create_vault("s3cret-pass").unwrap();
        encrypt_file(&db, &blob, &dek).unwrap();

        // Serialise + reload metadata (simulates the vault.json sidecar).
        let json = serde_json::to_string(&meta).unwrap();
        let meta_loaded: VaultMeta = serde_json::from_str(&json).unwrap();

        // Forgot the password — unlock via recovery key, decrypt the DB.
        let dek2 = unlock_with_recovery(&meta_loaded, &recovery).unwrap();
        assert_eq!(dek2, dek);
        decrypt_file(&blob, &restored, &dek2).unwrap();
        assert_eq!(std::fs::read(&restored).unwrap(), contents);

        std::fs::remove_dir_all(&dir).ok();
    }
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::end_to_end_create_encrypt_recover_decrypt`
Expected: PASS (all functions already exist from prior tasks).

- [ ] **Step 3: Run the full vault test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault`
Expected: PASS — all 8 vault tests green.

- [ ] **Step 4: Confirm no warnings in the crate build**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Finishes with no warnings from `vault.rs`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault.rs
git commit -m "test(vault): end-to-end envelope + recovery flow"
```

---

## Self-review notes

- **Spec coverage (§4 Cryptographic design):** DEK (Task 5) ✓; KEK_pw via Argon2id
  (Task 2) ✓; recovery key + KEK_rec (Tasks 4–5) ✓; double-wrapped DEK (Task 5) ✓;
  streaming AEAD over the DB file (Task 7) ✓; change-password re-wrap without DB
  re-encrypt (Task 6) ✓; algorithm/version + KDF params in metadata (Task 1, used
  throughout) ✓. Enable/disable-encryption *file orchestration* and the Tauri
  command surface are intentionally **Phase 2** — this phase ships the primitives
  those will call (`create_vault` + `encrypt_file` = enable; `unlock_*` +
  `decrypt_file` = unlock; the inverse = disable).
- **Spec coverage (§10 Testing):** round-trip ✓ (Tasks 7–8); wrong password/recovery
  rejected ✓ (Tasks 3, 5); recovery unwraps same DEK ✓ (Tasks 5, 8); change-password
  preserves DB ✓ (Task 6); tamper fails AEAD ✓ (Task 7); large/streaming file ✓
  (Task 7). Lifecycle/export/default-path tests belong to later phases.
- **Placeholder scan:** none — every step has concrete code or an exact command.
- **Type consistency:** names match the "Public API this phase defines" table across
  all tasks (`derive_kek`, `wrap_key`/`unwrap_key`, `encode_recovery_key`/
  `decode_recovery_key`, `create_vault`, `unlock_with_password`/`unlock_with_recovery`,
  `change_password`, `encrypt_file`/`decrypt_file`); `M_COST`/`T_COST`/`P_COST`/`CHUNK`/
  `VAULT_VERSION` constants used consistently.

## Phase boundary

This plan ends with a fully-tested crypto library and **no** behavioural change to the
app (the module is compiled but unused). Phase 2 (lifecycle + UI) and Phase 3
(encrypted exports, change-password UI, idle-lock) are separate spec-derived plans.

## Versioning / PR

Per project rules a PR bumps the version in `package.json`, `src-tauri/Cargo.toml`,
and `src-tauri/tauri.conf.json` (minor bump — new feature). Do that as the final step
before opening the PR, not during the per-task commits. Do not open the PR until the
user asks.
