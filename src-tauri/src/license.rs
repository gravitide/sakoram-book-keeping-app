//! License-key core: encode / sign / verify Ed25519-signed tier keys, and
//! per-install trial state in `license.json`.
//!
//! Security stance: the tier gate is client-side and the app is offline, so a
//! determined cracker can patch the binary. We do NOT try to defeat that. The
//! one cryptographic guarantee is that keys cannot be FORGED — only the holder
//! of the private key can mint a key that verifies against the embedded public
//! key. Sharing a real key is discouraged socially (buyer name in the payload).

use data_encoding::BASE32_NOPAD;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::Serialize;

const MAGIC: [u8; 4] = *b"SKRM";
const FORMAT_VERSION: u8 = 1;

pub const TIER_PLUS: u8 = 1;
pub const TIER_PREMIUM: u8 = 2;

#[derive(Debug, Clone, PartialEq)]
pub struct Payload {
    pub tier: u8,
    pub license_id: u64,
    pub issued_days: u32, // days since 1970-01-01, record-keeping only
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LicenseInfo {
    pub tier: u8,
    pub license_id: u64,
    pub name: String,
    pub email: String,
}

fn serialize_payload(p: &Payload) -> Vec<u8> {
    let name = p.name.as_bytes();
    let email = p.email.as_bytes();
    debug_assert!(name.len() <= 255, "name too long for u8 length prefix");
    debug_assert!(email.len() <= 255, "email too long for u8 length prefix");
    let mut v = Vec::with_capacity(19 + name.len() + email.len());
    v.extend_from_slice(&MAGIC);
    v.push(FORMAT_VERSION);
    v.push(p.tier);
    v.extend_from_slice(&p.license_id.to_be_bytes());
    v.extend_from_slice(&p.issued_days.to_be_bytes());
    v.push(name.len() as u8);
    v.extend_from_slice(name);
    v.push(email.len() as u8);
    v.extend_from_slice(email);
    v
}

fn deserialize_payload(b: &[u8]) -> Result<Payload, String> {
    if b.len() < 19 || b[0..4] != MAGIC {
        return Err("bad header".into());
    }
    if b[4] != FORMAT_VERSION {
        return Err("unsupported version".into());
    }
    let tier = b[5];
    let license_id = u64::from_be_bytes(b[6..14].try_into().unwrap());
    let issued_days = u32::from_be_bytes(b[14..18].try_into().unwrap());
    let name_len = b[18] as usize;
    let name_end = 19 + name_len;
    if b.len() < name_end + 1 { return Err("truncated".into()); }
    let name = String::from_utf8(b[19..name_end].to_vec()).map_err(|_| "bad utf8")?;
    let email_len = b[name_end] as usize;
    let email_start = name_end + 1;
    let email_end = email_start + email_len;
    if b.len() != email_end { return Err("length mismatch".into()); }
    let email = String::from_utf8(b[email_start..email_end].to_vec()).map_err(|_| "bad utf8")?;
    Ok(Payload { tier, license_id, issued_days, name, email })
}

fn tier_word(tier: u8) -> &'static str {
    match tier { TIER_PREMIUM => "PREMIUM", TIER_PLUS => "PLUS", _ => "LICENSE" }
}

/// Sign `payload` and produce the `SAKORAM-<TIER>-<base32...>` key string.
pub fn encode_key(payload: &Payload, signing_key: &SigningKey) -> String {
    let body = serialize_payload(payload);
    let sig: Signature = signing_key.sign(&body);
    let mut blob = body;
    blob.extend_from_slice(&sig.to_bytes());
    let b32 = BASE32_NOPAD.encode(&blob);
    let grouped = b32.as_bytes().chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap())
        .collect::<Vec<_>>().join("-");
    format!("SAKORAM-{}-{}", tier_word(payload.tier), grouped)
}

/// Strip prefix + hyphens, base32-decode, split payload/signature, verify.
pub fn decode_and_verify(key: &str, vk: &VerifyingKey) -> Result<Payload, String> {
    let parts: Vec<&str> = key.trim().split('-').collect();
    if parts.len() < 3 || parts[0] != "SAKORAM" {
        return Err("not a Sakoram key".into());
    }
    let b32: String = parts[2..].concat().to_uppercase();
    let blob = BASE32_NOPAD.decode(b32.as_bytes()).map_err(|_| "bad encoding")?;
    if blob.len() < 64 { return Err("too short".into()); }
    let (body, sig_bytes) = blob.split_at(blob.len() - 64);
    let sig = Signature::from_bytes(sig_bytes.try_into().map_err(|_| "bad sig")?);
    vk.verify_strict(body, &sig).map_err(|_| "signature mismatch".to_string())?;
    deserialize_payload(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Payload {
        Payload { tier: TIER_PREMIUM, license_id: 1042, issued_days: 20000,
                  name: "Acme (Pvt) Ltd".into(), email: "o@acme.lk".into() }
    }

    #[test]
    fn round_trips() {
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let vk = sk.verifying_key();
        let key = encode_key(&sample(), &sk);
        let got = decode_and_verify(&key, &vk).expect("verifies");
        assert_eq!(got, sample());
    }

    #[test]
    fn rejects_tampered_payload() {
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let vk = sk.verifying_key();
        let mut key = encode_key(&sample(), &sk);
        // Flip one base32 char in the body (after the SAKORAM-PREMIUM- prefix).
        let idx = key.len() - 5;
        let ch = if key.as_bytes()[idx] == b'A' { 'B' } else { 'A' };
        key.replace_range(idx..idx + 1, &ch.to_string());
        assert!(decode_and_verify(&key, &vk).is_err());
    }

    #[test]
    fn rejects_wrong_key() {
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let other = SigningKey::from_bytes(&[9u8; 32]).verifying_key();
        let key = encode_key(&sample(), &sk);
        assert!(decode_and_verify(&key, &other).is_err());
    }

    #[test]
    fn rejects_garbage() {
        let vk = SigningKey::from_bytes(&[7u8; 32]).verifying_key();
        assert!(decode_and_verify("not-a-key", &vk).is_err());
        assert!(decode_and_verify("SAKORAM-PLUS-AAAA", &vk).is_err());
    }

    #[test]
    fn deserialize_rejects_inconsistent_lengths() {
        // Valid header, but name_len points far past the end of the buffer.
        let mut b = Vec::new();
        b.extend_from_slice(b"SKRM");
        b.push(1); // version
        b.push(TIER_PLUS);
        b.extend_from_slice(&0u64.to_be_bytes()); // license_id
        b.extend_from_slice(&0u32.to_be_bytes()); // issued_days
        b.push(200); // name_len far past the end
        assert!(deserialize_payload(&b).is_err());

        // Trailing extra byte after zero-length name + email -> length mismatch.
        let mut c = Vec::new();
        c.extend_from_slice(b"SKRM");
        c.push(1);
        c.push(TIER_PLUS);
        c.extend_from_slice(&0u64.to_be_bytes());
        c.extend_from_slice(&0u32.to_be_bytes());
        c.push(0); // name_len = 0
        c.push(0); // email_len = 0
        c.push(0xFF); // extra trailing byte
        assert!(deserialize_payload(&c).is_err());
    }
}
