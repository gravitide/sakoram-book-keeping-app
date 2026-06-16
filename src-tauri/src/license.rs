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
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

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

/// Your Ed25519 public key (hex, 32 bytes). Generated once via
/// `mint_license keygen`. Safe to be public — it can only verify, not sign.
pub const EMBEDDED_PUBLIC_KEY: &str = "73a60e5fc362f4e193c4ea7ab9f1c89338f9b4416d2e02ec94f4fab22f9fb431";

fn embedded_vk() -> VerifyingKey {
    let bytes = (0..EMBEDDED_PUBLIC_KEY.len()).step_by(2)
        .map(|i| u8::from_str_radix(&EMBEDDED_PUBLIC_KEY[i..i + 2], 16).unwrap())
        .collect::<Vec<u8>>();
    VerifyingKey::from_bytes(&bytes.try_into().expect("32-byte public key")).expect("valid key")
}

/// Verify a key string against the embedded public key and return tier info.
pub fn validate(key: &str) -> Result<LicenseInfo, String> {
    let p = decode_and_verify(key, &embedded_vk())?;
    Ok(LicenseInfo { tier: p.tier, license_id: p.license_id, name: p.name, email: p.email })
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LicenseState {
    /// The entered key string, or null. Tier is always re-derived by verifying.
    pub license_key: Option<String>,
    /// ISO date (YYYY-MM-DD) the trial started; set on first read if absent.
    pub trial_start: Option<String>,
    /// Max ISO date ever observed — clock-rollback guard.
    pub last_seen_date: Option<String>,
}

fn state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("license.json"))
}

// --- Out-of-band trial marker (keyring) ---------------------------------
//
// The trial-start date also lives in the OS credential store (Windows
// Credential Manager / macOS Keychain), bound to a stable per-machine id.
// This survives deleting the app-data folder, so wiping license.json can't
// re-arm the trial. Everything here is best-effort: any keyring failure (e.g.
// an unsigned macOS build whose Keychain prompt is declined) degrades silently
// to the license.json-only behaviour.

const KEYRING_SERVICE: &str = "com.sakoram.billing";
const KEYRING_USER: &str = "trial-marker";

#[derive(Serialize, Deserialize)]
struct TrialMarker {
    trial_start: String,
    machine_id: String,
}

fn machine_id() -> String {
    machine_uid::get().unwrap_or_else(|_| "unknown".into())
}

/// Read the trial-start date from the credential store, but only if the marker
/// was written by THIS machine (so a credential copied from another machine is
/// ignored). Returns None on any error / absence.
fn read_trial_marker() -> Option<String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()?;
    let raw = entry.get_password().ok()?;
    let marker: TrialMarker = serde_json::from_str(&raw).ok()?;
    if marker.machine_id != machine_id() {
        return None;
    }
    Some(marker.trial_start)
}

/// Persist the trial-start date to the credential store (best-effort). The
/// recorded date only ever moves EARLIER — a later date never overwrites an
/// existing (earlier) marker, so the trial can't be re-armed.
fn write_trial_marker(trial_start: &str) {
    if let Some(existing) = read_trial_marker() {
        if existing.as_str() <= trial_start {
            return;
        }
    }
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let marker = TrialMarker {
            trial_start: trial_start.to_string(),
            machine_id: machine_id(),
        };
        if let Ok(raw) = serde_json::to_string(&marker) {
            let _ = entry.set_password(&raw);
        }
    }
}

/// The earliest known trial-start across license.json and the keyring marker
/// (ISO `YYYY-MM-DD` compares chronologically as a string), or None if neither
/// has one (a genuinely fresh install — the JS side then seeds today). Pure.
fn earliest_trial_start(json_start: Option<&str>, marker_start: Option<&str>) -> Option<String> {
    [json_start, marker_start].into_iter().flatten().min().map(str::to_string)
}

#[tauri::command]
pub fn read_license_state(app: tauri::AppHandle) -> Result<LicenseState, String> {
    let path = state_path(&app)?;
    let mut state: LicenseState = if path.exists() {
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())?
    } else {
        LicenseState::default()
    };

    // Harden the trial against app-data deletion: the earliest start known to
    // either license.json or the keyring marker wins, so deleting license.json
    // can't re-arm the trial. (The marker is (re)written in write_license_state,
    // which the JS side always calls right after this.)
    if let Some(effective) = earliest_trial_start(state.trial_start.as_deref(), read_trial_marker().as_deref()) {
        state.trial_start = Some(effective);
    }
    Ok(state)
}

#[tauri::command]
pub fn write_license_state(app: tauri::AppHandle, state: LicenseState) -> Result<(), String> {
    let path = state_path(&app)?;
    let raw = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())?;
    // Mirror trial_start into the out-of-band keyring marker (only ever moves
    // earlier — see write_trial_marker) so it survives app-data deletion.
    if let Some(ts) = state.trial_start.as_deref() {
        write_trial_marker(ts);
    }
    Ok(())
}

#[tauri::command]
pub fn validate_license(key: String) -> Result<LicenseInfo, String> {
    validate(&key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn earliest_trial_start_picks_oldest() {
        assert_eq!(earliest_trial_start(None, None), None);
        assert_eq!(earliest_trial_start(Some("2026-05-01"), None).as_deref(), Some("2026-05-01"));
        // license.json deleted but the keyring marker remembers -> reset defeated
        assert_eq!(earliest_trial_start(None, Some("2026-05-01")).as_deref(), Some("2026-05-01"));
        // both present -> the earliest start wins (either order)
        assert_eq!(earliest_trial_start(Some("2026-06-01"), Some("2026-05-01")).as_deref(), Some("2026-05-01"));
        assert_eq!(earliest_trial_start(Some("2026-05-01"), Some("2026-06-01")).as_deref(), Some("2026-05-01"));
    }

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
    fn validates_a_real_minted_key() {
        let info = validate("SAKORAM-PREMIUM-KNFV-ETIB-AIAA-AAAA-AAAA-AAIA-ABII-ACSU-MVZX-IICC-OV4W-K4QG-ORAH-QLTM-NOIL-EYQK-KFL7-QV2O-HL4N-BXGH-34T7-FULY-YMOF-YT3R-M4JT-UDUM-4BRG-JTEC-WQV3-Q47T-EWBJ-IDLS-MSDH-SDUW-AJVZ-4QWZ-ATRV-NXU7-2NFM-F3IB").expect("real key validates");
        assert_eq!(info.tier, TIER_PREMIUM);
        assert_eq!(info.email, "t@x.lk");
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
