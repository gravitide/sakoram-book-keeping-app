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

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    Key, XChaCha20Poly1305, XNonce,
};
use data_encoding::{BASE32_NOPAD, BASE64};
use rand_core::{OsRng, RngCore};

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
}
