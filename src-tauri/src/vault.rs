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
