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
    aead::{generic_array::GenericArray, stream, Aead, KeyInit, Payload},
    Key, XChaCha20Poly1305, XNonce,
};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use data_encoding::{BASE32_NOPAD, BASE64};
use rand_core::{OsRng, RngCore};
use zeroize::Zeroizing;

fn encode_recovery_key(bytes: &[u8; 32]) -> String {
    // Uppercase base32, no padding, grouped in 4s with dashes for readability.
    // We chunk on chars (all single-byte ASCII for base32) to avoid relying on
    // the non-local invariant that `from_utf8` would need for a safe `.unwrap()`.
    let raw = BASE32_NOPAD.encode(bytes);
    raw.chars()
        .collect::<Vec<char>>()
        .chunks(4)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("-")
}

fn decode_recovery_key(s: &str) -> Result<Zeroizing<[u8; 32]>, VaultError> {
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
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| VaultError::Encoding("recovery key wrong length".into()))?;
    Ok(Zeroizing::new(arr))
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut buf = [0u8; N];
    OsRng.fill_bytes(&mut buf);
    buf
}

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

fn derive_kek(
    password: &[u8],
    salt: &[u8],
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
) -> Result<Zeroizing<[u8; 32]>, VaultError> {
    let params = Params::new(m_cost, t_cost, p_cost, Some(32))
        .map_err(|e| VaultError::Kdf(e.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut kek = Zeroizing::new([0u8; 32]);
    argon
        .hash_password_into(password, salt, kek.as_mut())
        .map_err(|e| VaultError::Kdf(e.to_string()))?;
    Ok(kek)
}

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

pub fn unlock_with_password(meta: &VaultMeta, password: &str, aad: &[u8]) -> Result<Zeroizing<[u8; 32]>, VaultError> {
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
    unwrap_key(&kek, &meta.wrapped_by_password, aad)
}

pub fn unlock_with_recovery(meta: &VaultMeta, recovery_key: &str, aad: &[u8]) -> Result<Zeroizing<[u8; 32]>, VaultError> {
    let recovery_bytes = decode_recovery_key(recovery_key)?;
    unwrap_key(&recovery_bytes, &meta.wrapped_by_recovery, aad)
}

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
        let n = std::io::Read::by_ref(&mut reader).take(CHUNK as u64).read_to_end(&mut buf)?;
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
        let n = std::io::Read::by_ref(&mut reader).take(ENC_CHUNK as u64).read_to_end(&mut buf)?;
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

pub fn change_password(
    meta: &VaultMeta,
    old_password: &str,
    new_password: &str,
    aad: &[u8],
) -> Result<VaultMeta, VaultError> {
    // Authenticate + recover the DEK with the current password.
    let dek = unlock_with_password(meta, old_password, aad)?;

    // Re-wrap the SAME DEK under a fresh salt + new password. The DB blob is
    // untouched; only the password wrapping changes. Recovery wrapping is
    // carried over verbatim (it wraps the same DEK).
    let salt = random_bytes::<16>();
    let kek = derive_kek(new_password.as_bytes(), &salt, M_COST, T_COST, P_COST)?;
    let wrapped_by_password = wrap_key(&kek, &dek, aad)?;

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
        assert_eq!(*k1, *k2, "same password+salt must derive the same key");
        assert_ne!(*k1, *k3, "different salt must derive a different key");
        assert_eq!(k1.len(), 32);
    }

    #[test]
    fn wrap_round_trips_and_rejects_wrong_key() {
        let kek = [7u8; 32];
        let dek = random_bytes::<32>();
        let wrapped = wrap_key(&kek, &dek, b"aad").unwrap();

        // Correct key unwraps to the original DEK.
        let out = unwrap_key(&kek, &wrapped, b"aad").unwrap();
        assert_eq!(*out, dek);

        // Wrong key fails authentication.
        let wrong = [8u8; 32];
        assert!(matches!(unwrap_key(&wrong, &wrapped, b"aad"), Err(VaultError::Auth)));

        // Two wraps of the same DEK differ (random nonce).
        let wrapped2 = wrap_key(&kek, &dek, b"aad").unwrap();
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
        assert_eq!(*decoded, bytes);
    }

    #[test]
    fn recovery_key_decode_is_lenient_then_strict() {
        let bytes = [9u8; 32];
        let encoded = encode_recovery_key(&bytes);
        // Lowercase + extra spaces/dashes should still decode (user transcription).
        let messy = format!("  {}  ", encoded.to_lowercase().replace('-', " - "));
        assert_eq!(*decode_recovery_key(&messy).unwrap(), bytes);
        // Garbage fails.
        assert!(decode_recovery_key("not a real key!!!").is_err());
    }

    #[test]
    fn create_then_unlock_both_ways() {
        let (meta, recovery, dek) = create_vault("hunter2", b"tenant-test").unwrap();

        // Metadata shape.
        assert_eq!(meta.version, VAULT_VERSION);
        assert_eq!(meta.kdf.algorithm, "argon2id");
        assert!(!meta.kdf.salt.is_empty());

        // Password unlocks to the same DEK.
        assert_eq!(*unlock_with_password(&meta, "hunter2", b"tenant-test").unwrap(), *dek);
        // Recovery key unlocks to the same DEK.
        assert_eq!(*unlock_with_recovery(&meta, &recovery, b"tenant-test").unwrap(), *dek);

        // Wrong password is rejected.
        assert!(matches!(unlock_with_password(&meta, "wrong", b"tenant-test"), Err(VaultError::Auth)));
        // Wrong recovery key is rejected.
        let other = encode_recovery_key(&[0u8; 32]);
        assert!(matches!(unlock_with_recovery(&meta, &other, b"tenant-test"), Err(VaultError::Auth)));
    }

    #[test]
    fn change_password_preserves_dek_and_recovery() {
        let (meta, recovery, dek) = create_vault("old-pass", b"tenant-test").unwrap();
        let meta2 = change_password(&meta, "old-pass", "new-pass", b"tenant-test").unwrap();

        // New password unlocks to the SAME DEK (DB never re-encrypted).
        assert_eq!(*unlock_with_password(&meta2, "new-pass", b"tenant-test").unwrap(), *dek);
        // Old password no longer works.
        assert!(matches!(unlock_with_password(&meta2, "old-pass", b"tenant-test"), Err(VaultError::Auth)));
        // Recovery key still works unchanged.
        assert_eq!(*unlock_with_recovery(&meta2, &recovery, b"tenant-test").unwrap(), *dek);
        // Wrong current password is rejected up front.
        assert!(matches!(change_password(&meta, "nope", "x", b"tenant-test"), Err(VaultError::Auth)));
    }

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

    #[test]
    fn truncated_ciphertext_is_rejected() {
        use std::io::Write;

        let dek = random_bytes::<32>();
        let dir = std::env::temp_dir()
            .join(format!("vault-trunc-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let plain = dir.join("plain.bin");
        let enc = dir.join("plain.enc");
        let truncated = dir.join("plain.truncated.enc");
        let out = dir.join("plain.out");

        // Payload: one full chunk + a partial last chunk.
        let data: Vec<u8> = (0..(CHUNK + 500)).map(|i| (i % 251) as u8).collect();
        std::fs::File::create(&plain).unwrap().write_all(&data).unwrap();
        encrypt_file(&plain, &enc, &dek).unwrap();

        // The ciphertext layout is: [19-byte nonce][CHUNK+16 bytes][500+16 bytes].
        // Chop off the final block to get [19-byte nonce][CHUNK+16 bytes].
        let full_ct = std::fs::read(&enc).unwrap();
        let trunc_len = 19 + (CHUNK + 16);
        assert!(full_ct.len() > trunc_len, "ciphertext shorter than expected");
        std::fs::write(&truncated, &full_ct[..trunc_len]).unwrap();

        // Decrypting the truncated file must fail — the STREAM tag is missing.
        assert!(
            decrypt_file(&truncated, &out, &dek).is_err(),
            "truncated ciphertext should be rejected"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn exact_chunk_multiple_round_trips() {
        use std::io::Write;

        let dek = random_bytes::<32>();
        let dir = std::env::temp_dir()
            .join(format!("vault-exact-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let plain = dir.join("exact.bin");
        let enc = dir.join("exact.enc");
        let out = dir.join("exact.out");

        // Exactly two full chunks — exercises the boundary where every read fills
        // the buffer and the final block is length zero.
        let data: Vec<u8> = (0..(CHUNK * 2)).map(|i| (i % 251) as u8).collect();
        std::fs::File::create(&plain).unwrap().write_all(&data).unwrap();

        encrypt_file(&plain, &enc, &dek).unwrap();
        decrypt_file(&enc, &out, &dek).unwrap();
        assert_eq!(std::fs::read(&out).unwrap(), data);

        std::fs::remove_dir_all(&dir).ok();
    }

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
        let (meta, recovery, dek) = create_vault("s3cret-pass", b"tenant-acme").unwrap();
        encrypt_file(&db, &blob, &dek).unwrap();

        // Serialise + reload metadata (simulates the vault.json sidecar).
        let json = serde_json::to_string(&meta).unwrap();
        let meta_loaded: VaultMeta = serde_json::from_str(&json).unwrap();

        // Forgot the password — unlock via recovery key, decrypt the DB.
        let dek2 = unlock_with_recovery(&meta_loaded, &recovery, b"tenant-acme").unwrap();
        assert_eq!(*dek2, *dek);
        decrypt_file(&blob, &restored, &dek2).unwrap();
        assert_eq!(std::fs::read(&restored).unwrap(), contents);

        std::fs::remove_dir_all(&dir).ok();
    }
}
