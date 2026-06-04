# Licensing & Feature Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three perpetual, offline-verifiable license tiers (Basic free / Plus / Premium) with a 30-day full-Premium trial, an Ed25519 key system, a local key-minting tool, and feature gating across the app.

**Architecture:** A Rust core verifies Ed25519-signed key blobs against an embedded public key and owns the per-install `license.json` (trial state). A pure TypeScript library (`app/lib/licensing.ts`) holds the feature→tier registry and trial math; a Pinia store exposes the *effective entitlement* to the UI. Gating is client-side (a deliberate soft deterrent — the real cryptographic guarantee is "keys can't be forged"). Mirrors the existing `resolveTenantGuard` / `tenants.rs` patterns.

**Tech Stack:** Rust (`ed25519-dalek` 2, `data-encoding` base32 — already a dep), Tauri commands, Nuxt 4 / Vue 3 / Pinia, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-licensing-tiers-design.md`

**Two phases / two PRs:**
- **Phase 1 (Tasks 1–8):** the entitlement engine + mint tool. Fully tested. The app computes `tier`/`trialDaysLeft` but does NOT yet enforce anything — behaviour unchanged for users.
- **Phase 2 (Tasks 9–16):** gating surfaces + UI. Consumes the engine.

---

## File structure

**Rust (Phase 1):**
- `src-tauri/src/license.rs` — *create*. Pure core: `Payload`, `encode_key`, `sign_key`, `decode_and_verify`, `EMBEDDED_PUBLIC_KEY`, `validate_license`; Tauri commands `validate_license`, `read_license_state`, `write_license_state`. Unit tests in-file.
- `src-tauri/src/bin/mint_license.rs` — *create*. `keygen` + `mint` CLI (signs with your private key).
- `src-tauri/src/lib.rs` — *modify*. `mod license;` + register the three commands.
- `src-tauri/Cargo.toml` — *modify*. Add `ed25519-dalek = "2"`.
- `.gitignore` — *modify*. Ignore private-key files.

**TypeScript (Phase 1):**
- `app/lib/licensing.ts` — *create*. `Tier`, `FEATURES`, `BUSINESS_LIMITS`, `hasFeature`, `trialDaysRemaining`, `effectiveEntitlement`.
- `app/lib/licensing.test.ts` — *create*. Unit tests.
- `app/stores/license.ts` — *create*. Pinia store; loads state, validates key via Rust, updates `last_seen`.

**TypeScript (Phase 2):**
- `app/lib/license-route.ts` + `.test.ts` — *create*. Pure `resolveLicenseGuard` (used only for genuinely create-only routes).
- `app/components/TrialBanner.vue` — *create*.
- `app/components/FeatureLock.vue` — *create*. Reusable in-page lock banner + upsell.
- `app/components/UpgradeButton.vue` — *create*. Small "Upgrade" pill used by action gates.
- `app/pages/upgrade.vue` — *create*. Tier comparison + key entry.
- `app/pages/settings/license.vue` — *create*. License management.
- `app/layouts/default.vue` — *modify*. Nav `feature` flags + lock badges; License nav entry; mount `TrialBanner`; About-modal buyer name.
- `app/stores/tenants.ts` — *modify*. Enforce business cap on create.
- Feature pages/modals — *modify*. Action-level gates (enumerated in Task 14).

---

## PHASE 1 — Entitlement engine

### Task 1: Add the Ed25519 dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add the crate**

In `src-tauri/Cargo.toml`, under `[dependencies]`, add after the existing crypto block (near `zeroize = "1"`):

```toml
# License-key signatures (src/license.rs + src/bin/mint_license.rs).
# Ed25519: the app embeds only the public key and verifies offline; only the
# private key (kept off-repo) can mint a valid key.
ed25519-dalek = "2"
```

- [ ] **Step 2: Verify it resolves**

Run: `cd src-tauri && cargo fetch`
Expected: downloads `ed25519-dalek` and deps, no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "build: add ed25519-dalek for license signing"
```

---

### Task 2: License payload encode/decode/verify (pure Rust core, TDD)

**Files:**
- Create: `src-tauri/src/license.rs`

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/license.rs` with the core types + a test module. Start with ONLY the test module and stub signatures so it compiles-and-fails:

```rust
//! License-key core: encode / sign / verify Ed25519-signed tier keys, and
//! per-install trial state in `license.json`.
//!
//! Security stance: the tier gate is client-side and the app is offline, so a
//! determined cracker can patch the binary. We do NOT try to defeat that. The
//! one cryptographic guarantee is that keys cannot be FORGED — only the holder
//! of the private key can mint a key that verifies against the embedded public
//! key. Sharing a real key is discouraged socially (buyer name in the payload).

use data_encoding::BASE32_NOPAD;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
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
}
```

- [ ] **Step 2: Run tests to verify they fail to compile**

Run: `cd src-tauri && cargo test --lib license 2>&1 | head -30`
Expected: compile errors — `encode_key`, `decode_and_verify` not found.

- [ ] **Step 3: Implement the core functions**

Add above the `#[cfg(test)]` module:

```rust
fn serialize_payload(p: &Payload) -> Vec<u8> {
    let name = p.name.as_bytes();
    let email = p.email.as_bytes();
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
    vk.verify(body, &sig).map_err(|_| "signature mismatch".to_string())?;
    deserialize_payload(body)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib license`
Expected: `round_trips`, `rejects_tampered_payload`, `rejects_wrong_key`, `rejects_garbage` PASS.

- [ ] **Step 5: Wire the module (so it compiles in the crate)**

In `src-tauri/src/lib.rs`, add near the other `mod` declarations:

```rust
mod license;
```

Run: `cd src-tauri && cargo build --lib`
Expected: builds (a `dead_code` warning for unused pub fns is fine for now).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license.rs src-tauri/src/lib.rs
git commit -m "feat(license): Ed25519 key encode/decode/verify core + tests"
```

---

### Task 3: The minting CLI (keygen + mint)

**Files:**
- Create: `src-tauri/src/bin/mint_license.rs`

- [ ] **Step 1: Implement the tool**

Create `src-tauri/src/bin/mint_license.rs`:

```rust
//! Local key-minting tool (NOT bundled into the app). Shares the payload
//! format with the app via `sakoram_billing_lib::license`.
//!
//!   cargo run --bin mint_license -- keygen --out ~/.sakoram/license-signing.key
//!   cargo run --bin mint_license -- mint --tier premium --name "Acme" \
//!       --email "o@acme.lk" --license-id 1042 [--out acme.lic]
//!
//! The private key lives ONLY on your machine (the --out file or the
//! SAKORAM_LICENSE_PRIVATE_KEY env var, hex). Never commit it. The PUBLIC key
//! printed by `keygen` goes into EMBEDDED_PUBLIC_KEY in src/license.rs.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use ed25519_dalek::SigningKey;
use rand_core::OsRng;
use sakoram_billing_lib::license::{encode_key, Payload, TIER_PLUS, TIER_PREMIUM};

fn args() -> (String, HashMap<String, String>) {
    let mut a = std::env::args().skip(1);
    let cmd = a.next().unwrap_or_default();
    let mut map = HashMap::new();
    while let Some(flag) = a.next() {
        if let Some(name) = flag.strip_prefix("--") {
            map.insert(name.to_string(), a.next().unwrap_or_default());
        }
    }
    (cmd, map)
}

fn read_private_key(opts: &HashMap<String, String>) -> SigningKey {
    let hex = if let Some(path) = opts.get("key-file") {
        std::fs::read_to_string(path).expect("read key-file").trim().to_string()
    } else {
        std::env::var("SAKORAM_LICENSE_PRIVATE_KEY")
            .expect("set SAKORAM_LICENSE_PRIVATE_KEY or pass --key-file")
            .trim().to_string()
    };
    let bytes = hex_decode(&hex).expect("private key must be 64 hex chars");
    SigningKey::from_bytes(&bytes.try_into().expect("32-byte key"))
}

fn hex_decode(s: &str) -> Result<Vec<u8>, ()> {
    if s.len() % 2 != 0 { return Err(()); }
    (0..s.len()).step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| ()))
        .collect()
}
fn hex_encode(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

fn main() {
    let (cmd, opts) = args();
    match cmd.as_str() {
        "keygen" => {
            let sk = SigningKey::generate(&mut OsRng);
            let vk = sk.verifying_key();
            let priv_hex = hex_encode(&sk.to_bytes());
            if let Some(out) = opts.get("out") {
                std::fs::write(out, &priv_hex).expect("write key");
                println!("Private key written to {out} (NEVER commit this).");
            } else {
                println!("PRIVATE (save securely, never commit):\n{priv_hex}");
            }
            println!("\nPUBLIC key — paste into EMBEDDED_PUBLIC_KEY in src/license.rs:\n{}",
                     hex_encode(&vk.to_bytes()));
        }
        "mint" => {
            let sk = read_private_key(&opts);
            let tier = match opts.get("tier").map(String::as_str) {
                Some("plus") => TIER_PLUS,
                Some("premium") => TIER_PREMIUM,
                _ => panic!("--tier must be plus|premium"),
            };
            let issued_days = (SystemTime::now().duration_since(UNIX_EPOCH)
                .unwrap().as_secs() / 86_400) as u32;
            let payload = Payload {
                tier,
                license_id: opts.get("license-id").and_then(|s| s.parse().ok()).unwrap_or(0),
                issued_days,
                name: opts.get("name").cloned().unwrap_or_default(),
                email: opts.get("email").cloned().unwrap_or_default(),
            };
            let key = encode_key(&payload, &sk);
            println!("Key:\n{key}");
            if let Some(out) = opts.get("out") {
                std::fs::write(out, &key).expect("write .lic");
                println!("\nFile: {out}");
            }
        }
        _ => eprintln!("usage: mint_license <keygen|mint> [--flags]"),
    }
}
```

- [ ] **Step 2: Build the binary**

Run: `cd src-tauri && cargo build --bin mint_license`
Expected: builds. (`Payload`, `encode_key`, `TIER_*` must be `pub` in `license.rs` — they are.)

- [ ] **Step 3: Generate your real keypair**

Run:
```bash
cd src-tauri
mkdir -p ~/.sakoram
cargo run --quiet --bin mint_license -- keygen --out ~/.sakoram/license-signing.key
```
Expected: writes the private key file, prints the PUBLIC key hex. **Copy the public key hex.**

- [ ] **Step 4: Smoke-test minting**

Run:
```bash
cargo run --quiet --bin mint_license -- mint --tier premium \
  --name "Test Buyer" --email "t@x.lk" --license-id 1 --key-file ~/.sakoram/license-signing.key
```
Expected: prints `SAKORAM-PREMIUM-…`. Keep this string for Task 4's test.

- [ ] **Step 5: Commit (tool only — NOT the key)**

```bash
git add src-tauri/src/bin/mint_license.rs
git commit -m "feat(license): mint_license CLI (keygen + mint)"
```

---

### Task 4: Embed the public key + `validate_license`

**Files:**
- Modify: `src-tauri/src/license.rs`
- Modify: `.gitignore`

- [ ] **Step 1: Add the embedded key + validate, with a test using your real key**

In `license.rs`, replace the `tests` module's imports area by adding the public constant and the `validate_license` helper above the tests. Paste the **public key hex from Task 3 Step 3**:

```rust
/// Your Ed25519 public key (hex, 32 bytes). Generated once via
/// `mint_license keygen`. Safe to be public — it can only verify, not sign.
pub const EMBEDDED_PUBLIC_KEY: &str = "PASTE_PUBLIC_KEY_HEX_HERE";

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
```

- [ ] **Step 2: Add a round-trip test against the embedded key**

Add to the `tests` module (replace `PASTE_REAL_KEY` with the key string from Task 3 Step 4):

```rust
    #[test]
    fn validates_a_real_minted_key() {
        let info = validate("PASTE_REAL_KEY").expect("real key validates");
        assert_eq!(info.tier, TIER_PREMIUM);
        assert_eq!(info.email, "t@x.lk");
    }
```

- [ ] **Step 3: Run the test**

Run: `cd src-tauri && cargo test --lib license`
Expected: all license tests PASS, including `validates_a_real_minted_key`.

- [ ] **Step 4: Guard the private key in .gitignore**

Append to `.gitignore`:

```
# License signing private key — must never be committed.
*.signing.key
license-signing.key
*.lic
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/license.rs .gitignore
git commit -m "feat(license): embed public key + validate(); ignore key files"
```

---

### Task 5: Trial state file + Tauri commands

**Files:**
- Modify: `src-tauri/src/license.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the state struct + file I/O + commands**

Add to `license.rs` (above the tests). This stores the per-install state in `license.json` under the app-data dir; trial math is done in TS (Task 7):

```rust
use serde::Deserialize;
use std::path::PathBuf;
use tauri::Manager;

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

#[tauri::command]
pub fn read_license_state(app: tauri::AppHandle) -> Result<LicenseState, String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(LicenseState::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_license_state(app: tauri::AppHandle, state: LicenseState) -> Result<(), String> {
    let path = state_path(&app)?;
    let raw = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn validate_license(key: String) -> Result<LicenseInfo, String> {
    validate(&key)
}
```

- [ ] **Step 2: Register the commands**

In `src-tauri/src/lib.rs`, find the `tauri::generate_handler!` macro and add the three commands to the list:

```rust
            license::validate_license,
            license::read_license_state,
            license::write_license_state,
```

- [ ] **Step 3: Build**

Run: `cd src-tauri && cargo build --lib`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/license.rs src-tauri/src/lib.rs
git commit -m "feat(license): license.json state + validate/read/write commands"
```

---

### Task 6: TS licensing library — registry + `hasFeature` (TDD)

**Files:**
- Create: `app/lib/licensing.ts`
- Create: `app/lib/licensing.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/licensing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BUSINESS_LIMITS, hasFeature, Tier } from "./licensing";

describe("hasFeature", () => {
	it("basic gets core features, not plus/premium", () => {
		expect(hasFeature(Tier.Basic, "invoices")).toBe(true);
		expect(hasFeature(Tier.Basic, "reports.profit_loss")).toBe(true);
		expect(hasFeature(Tier.Basic, "recurring")).toBe(false);
		expect(hasFeature(Tier.Basic, "payroll")).toBe(false);
	});
	it("plus gets plus features, not premium", () => {
		expect(hasFeature(Tier.Plus, "recurring")).toBe(true);
		expect(hasFeature(Tier.Plus, "encryption")).toBe(true);
		expect(hasFeature(Tier.Plus, "payroll")).toBe(false);
	});
	it("premium gets everything", () => {
		expect(hasFeature(Tier.Premium, "payroll")).toBe(true);
		expect(hasFeature(Tier.Premium, "recurring")).toBe(true);
	});
	it("unknown feature keys default to available (never accidentally lock core)", () => {
		expect(hasFeature(Tier.Basic, "totally.unknown")).toBe(true);
	});
});

describe("BUSINESS_LIMITS", () => {
	it("basic caps at 2; plus/premium unlimited", () => {
		expect(BUSINESS_LIMITS[Tier.Basic]).toBe(2);
		expect(BUSINESS_LIMITS[Tier.Plus]).toBe(Number.POSITIVE_INFINITY);
		expect(BUSINESS_LIMITS[Tier.Premium]).toBe(Number.POSITIVE_INFINITY);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test app/lib/licensing.test.ts`
Expected: FAIL — cannot import from `./licensing`.

- [ ] **Step 3: Implement `licensing.ts` (registry + helpers)**

Create `app/lib/licensing.ts`:

```ts
// Feature-tier registry + pure entitlement helpers. Single source of truth for
// which features belong to which tier (see the design spec §2). Pure and
// unit-tested; the Pinia store and gating surfaces consume these.

export enum Tier { Basic = 0, Plus = 1, Premium = 2 }

// Every gated feature key -> the minimum tier that includes it. A key absent
// here is treated as Basic (available to all) — we never want a typo to lock a
// core feature.
export const FEATURES: Record<string, Tier> = {
	// Plus
	"recurring": Tier.Plus,
	"credit_notes": Tier.Plus,
	"statements": Tier.Plus,
	"reconcile": Tier.Plus,
	"reports.aged_receivables": Tier.Plus,
	"reports.aged_payables": Tier.Plus,
	"reports.cash_flow": Tier.Plus,
	"reports.sales_by_client": Tier.Plus,
	"reports.expenses_by_vendor": Tier.Plus,
	"pdf_protection": Tier.Plus,
	"encryption": Tier.Plus,
	// Premium
	"payroll": Tier.Premium,
	// Explicitly-Basic keys (documented; same as omitting them)
	"invoices": Tier.Basic,
	"reports.profit_loss": Tier.Basic,
	"reports.vat": Tier.Basic,
};

export const BUSINESS_LIMITS: Record<Tier, number> = {
	[Tier.Basic]: 2,
	[Tier.Plus]: Number.POSITIVE_INFINITY,
	[Tier.Premium]: Number.POSITIVE_INFINITY,
};

export function hasFeature(tier: Tier, key: string): boolean {
	const required = FEATURES[key] ?? Tier.Basic;
	return tier >= required;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun run test app/lib/licensing.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/licensing.ts app/lib/licensing.test.ts
git commit -m "feat(license): TS feature-tier registry + hasFeature"
```

---

### Task 7: Trial math + `effectiveEntitlement` (TDD)

**Files:**
- Modify: `app/lib/licensing.ts`
- Modify: `app/lib/licensing.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/licensing.test.ts`:

```ts
import { effectiveEntitlement, TRIAL_DAYS, trialDaysRemaining } from "./licensing";

describe("trialDaysRemaining", () => {
	it("counts down from TRIAL_DAYS", () => {
		expect(trialDaysRemaining("2026-06-01", "2026-06-01", "2026-06-01")).toBe(TRIAL_DAYS);
		expect(trialDaysRemaining("2026-06-01", "2026-06-11", "2026-06-11")).toBe(TRIAL_DAYS - 10);
	});
	it("never extends when the clock is rolled back (uses last_seen)", () => {
		// now is earlier than last_seen -> elapsed measured from last_seen
		expect(trialDaysRemaining("2026-06-01", "2026-06-02", "2026-06-20"))
			.toBe(trialDaysRemaining("2026-06-01", "2026-06-20", "2026-06-20"));
	});
	it("clamps at 0", () => {
		expect(trialDaysRemaining("2026-06-01", "2026-09-01", "2026-09-01")).toBe(0);
	});
});

describe("effectiveEntitlement", () => {
	const trialActive = { trialStart: "2026-06-01", lastSeen: "2026-06-05" };
	const trialExpired = { trialStart: "2026-06-01", lastSeen: "2026-09-01" };

	it("trial active -> Premium, isTrial true", () => {
		const e = effectiveEntitlement(null, trialActive, "2026-06-05");
		expect(e.tier).toBe(Tier.Premium);
		expect(e.isTrial).toBe(true);
		expect(e.trialDaysLeft).toBeGreaterThan(0);
	});
	it("trial expired, no key -> Basic", () => {
		const e = effectiveEntitlement(null, trialExpired, "2026-09-01");
		expect(e.tier).toBe(Tier.Basic);
		expect(e.isTrial).toBe(false);
	});
	it("a Plus key beats an expired trial", () => {
		const e = effectiveEntitlement(Tier.Plus, trialExpired, "2026-09-01");
		expect(e.tier).toBe(Tier.Plus);
		expect(e.isTrial).toBe(false);
	});
	it("a valid key during trial uses the higher of key/Premium-trial", () => {
		const e = effectiveEntitlement(Tier.Plus, trialActive, "2026-06-05");
		expect(e.tier).toBe(Tier.Premium); // trial Premium still higher than Plus
	});
	it("exposes businessLimit for the effective tier", () => {
		expect(effectiveEntitlement(null, trialExpired, "2026-09-01").businessLimit).toBe(2);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test app/lib/licensing.test.ts`
Expected: FAIL — `trialDaysRemaining` / `effectiveEntitlement` not exported.

- [ ] **Step 3: Implement trial math + entitlement**

Append to `app/lib/licensing.ts`:

```ts
export const TRIAL_DAYS = 30;

export interface TrialState { trialStart: string | null; lastSeen: string | null }
export interface Entitlement {
	tier: Tier;
	isTrial: boolean;
	trialDaysLeft: number;
	businessLimit: number;
}

function daysBetween(aIso: string, bIso: string): number {
	const a = Date.parse(`${aIso}T00:00:00Z`);
	const b = Date.parse(`${bIso}T00:00:00Z`);
	return Math.round((b - a) / 86_400_000);
}

// Effective "now" never goes backwards: a rolled-back clock can't buy trial days.
function effectiveNow(nowIso: string, lastSeenIso: string | null): string {
	if (!lastSeenIso) return nowIso;
	return daysBetween(lastSeenIso, nowIso) < 0 ? lastSeenIso : nowIso;
}

export function trialDaysRemaining(trialStart: string, nowIso: string, lastSeenIso: string | null): number {
	const eff = effectiveNow(nowIso, lastSeenIso);
	const elapsed = daysBetween(trialStart, eff);
	return Math.max(0, TRIAL_DAYS - elapsed);
}

// `licenseTier` is the verified tier of an entered key, or null if none/invalid.
export function effectiveEntitlement(
	licenseTier: Tier | null,
	trial: TrialState,
	nowIso: string,
): Entitlement {
	const trialLeft = trial.trialStart
		? trialDaysRemaining(trial.trialStart, nowIso, trial.lastSeen)
		: 0;
	const trialTier = trialLeft > 0 ? Tier.Premium : null;
	const candidates = [licenseTier, trialTier].filter((t): t is Tier => t !== null);
	const tier = candidates.length ? Math.max(...candidates) as Tier : Tier.Basic;
	return {
		tier,
		isTrial: trialTier !== null && tier === Tier.Premium && licenseTier !== Tier.Premium,
		trialDaysLeft: trialLeft,
		businessLimit: BUSINESS_LIMITS[tier],
	};
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun run test app/lib/licensing.test.ts`
Expected: all PASS.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint
git add app/lib/licensing.ts app/lib/licensing.test.ts
git commit -m "feat(license): trial math + effectiveEntitlement"
```

---

### Task 8: Pinia license store

**Files:**
- Create: `app/stores/license.ts`

- [ ] **Step 1: Implement the store**

Create `app/stores/license.ts` (follows the simple-store pattern; loads once at startup, persists `last_seen` on load):

```ts
// Per-install licensing store. Reads license.json via Rust, verifies any
// entered key via Rust (validate_license), computes the effective entitlement
// (tier + trial) via app/lib/licensing.ts, and updates last_seen on load.

import { invoke } from "@tauri-apps/api/core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { effectiveEntitlement, hasFeature as hasFeatureFor, Tier } from "~/lib/licensing";

interface LicenseState { license_key: string | null; trial_start: string | null; last_seen_date: string | null }
interface LicenseInfo { tier: number; license_id: number; name: string; email: string }

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

export const useLicenseStore = defineStore("license", () => {
	const loaded = ref(false);
	const licenseTier = ref<Tier | null>(null);
	const buyerName = ref("");
	const buyerEmail = ref("");
	const trialStart = ref<string | null>(null);
	const lastSeen = ref<string | null>(null);

	const entitlement = computed(() =>
		effectiveEntitlement(licenseTier.value, { trialStart: trialStart.value, lastSeen: lastSeen.value }, todayIso()));
	const tier = computed(() => entitlement.value.tier);
	const isTrial = computed(() => entitlement.value.isTrial);
	const trialDaysLeft = computed(() => entitlement.value.trialDaysLeft);
	const businessLimit = computed(() => entitlement.value.businessLimit);

	const hasFeature = (key: string) => hasFeatureFor(tier.value, key);
	const canCreateBusiness = (currentCount: number) => currentCount < businessLimit.value;

	async function ensureLoaded() {
		if (loaded.value) return;
		const st = await invoke<LicenseState>("read_license_state");
		const today = todayIso();
		// Seed trial start on first ever launch.
		const seededStart = st.trial_start ?? today;
		// last_seen never goes backwards.
		const seededLastSeen = !st.last_seen_date || st.last_seen_date < today ? today : st.last_seen_date;
		trialStart.value = seededStart;
		lastSeen.value = seededLastSeen;

		if (st.license_key) {
			try {
				const info = await invoke<LicenseInfo>("validate_license", { key: st.license_key });
				licenseTier.value = info.tier as Tier;
				buyerName.value = info.name;
				buyerEmail.value = info.email;
			} catch { licenseTier.value = null; }
		}
		await invoke("write_license_state", {
			state: { license_key: st.license_key ?? null, trial_start: seededStart, last_seen_date: seededLastSeen },
		});
		loaded.value = true;
	}

	// Returns null on success, or an error message.
	async function enterKey(key: string): Promise<string | null> {
		try {
			const info = await invoke<LicenseInfo>("validate_license", { key });
			licenseTier.value = info.tier as Tier;
			buyerName.value = info.name;
			buyerEmail.value = info.email;
			await invoke("write_license_state", {
				state: { license_key: key, trial_start: trialStart.value, last_seen_date: lastSeen.value },
			});
			return null;
		} catch (e) { return String(e); }
	}

	async function clearKey() {
		licenseTier.value = null;
		buyerName.value = "";
		buyerEmail.value = "";
		await invoke("write_license_state", {
			state: { license_key: null, trial_start: trialStart.value, last_seen_date: lastSeen.value },
		});
	}

	return { loaded, tier, isTrial, trialDaysLeft, businessLimit, buyerName, buyerEmail,
		hasFeature, canCreateBusiness, ensureLoaded, enterKey, clearKey, Tier };
});
```

- [ ] **Step 2: Load it at startup**

In `app/middleware/tenant.global.ts`, after `tenants.ensureLoaded()` succeeds, also warm the license store so entitlement is ready before any page renders. Add near the top of the middleware body:

```ts
	const license = useLicenseStore();
	if (!license.loaded) {
		try { await license.ensureLoaded(); } catch { /* no Tauri (dev web) — stays Basic */ }
	}
```

And import it: `import { useLicenseStore } from "~/stores/license";`

- [ ] **Step 3: Verify build + lint**

Run: `bun run lint && bunx nuxi prepare`
Expected: no lint errors.

- [ ] **Step 4: Commit**

```bash
git add app/stores/license.ts app/middleware/tenant.global.ts
git commit -m "feat(license): Pinia store + startup load"
```

**Phase 1 done — bump version (minor), open PR, merge. The engine exists and is tested; nothing is gated yet.**

---

## PHASE 2 — Gating surfaces + UI

### Task 9: Reusable gating components

**Files:**
- Create: `app/components/FeatureLock.vue`
- Create: `app/components/UpgradeButton.vue`

- [ ] **Step 1: `UpgradeButton.vue`** — a small pill that routes to `/upgrade`.

```vue
<template>
	<UButton :to="`/upgrade${feature ? `?feature=${feature}` : ''}`" size="xs" color="primary"
		variant="soft" icon="i-lucide-sparkles" class="shrink-0">
		{{ label ?? "Upgrade" }}
	</UButton>
</template>

<script setup lang="ts">
	defineProps<{ feature?: string, label?: string }>();
</script>
```

- [ ] **Step 2: `FeatureLock.vue`** — an in-page banner shown at the top of a locked feature page. `tierLabel` is "Plus" or "Premium".

```vue
<template>
	<div class="rounded-lg border border-(--ui-primary)/30 bg-(--ui-primary)/5 p-4 flex items-start gap-3 mb-4">
		<UIcon name="i-lucide-lock" class="size-5 text-(--ui-primary) mt-0.5 shrink-0" />
		<div class="min-w-0 flex-1">
			<div class="font-medium">{{ title }} is a {{ tierLabel }} feature</div>
			<p class="text-sm text-(--ui-text-muted) mt-0.5">
				<slot>Upgrade to unlock it. Anything you created during your trial stays viewable below.</slot>
			</p>
		</div>
		<UpgradeButton :feature="feature" label="See plans" />
	</div>
</template>

<script setup lang="ts">
	defineProps<{ title: string, tierLabel: string, feature: string }>();
</script>
```

- [ ] **Step 3: Lint + commit**

```bash
bun run lint
git add app/components/FeatureLock.vue app/components/UpgradeButton.vue
git commit -m "feat(license): FeatureLock + UpgradeButton components"
```

---

### Task 10: Nav lock badges + License entry

**Files:**
- Modify: `app/layouts/default.vue`

- [ ] **Step 1: Tag nav items with their feature**

In the `nav` array, add `feature` to the gated items. The `NavItem`/`NavChild` interfaces gain `feature?: string`. Examples:

```ts
{ to: "/recurring-invoices", label: "Recurring invoices", icon: "i-lucide-repeat", feature: "recurring" },
{ to: "/credit-notes", label: "Credit notes", icon: "i-lucide-rotate-ccw", feature: "credit_notes" },
{ to: "/recurring-bills", label: "Recurring bills", icon: "i-lucide-repeat-2", feature: "recurring" },
{ to: "/reconcile", label: "Reconcile", icon: "i-lucide-scale", feature: "reconcile" },
```
For the Payroll group parent and its children, set `feature: "payroll"`. For the Reports children, set `feature` on the Plus reports (`reports.aged_receivables`, etc.) and leave P&L / VAT ungated.

- [ ] **Step 2: Render a lock badge on locked items**

Add `const license = useLicenseStore();` to the script and `import { useLicenseStore } from "~/stores/license";`. In the leaf/child link template, after `{{ item.label }}`, add:

```vue
<UIcon v-if="item.feature && !license.hasFeature(item.feature)"
	name="i-lucide-lock" class="size-3 text-(--ui-text-dimmed) ml-auto shrink-0" />
```
(Use the same expression for child items via `child.feature`.) Locked items still navigate to their page — the page shows the `FeatureLock` banner (Task 12). This honours "visible but locked" while keeping trial-created data reachable.

- [ ] **Step 3: Add a License nav item**

Under the Settings group children, add:

```ts
{ to: "/settings/license", label: "License", icon: "i-lucide-key-round" },
```

- [ ] **Step 4: Lint + commit**

```bash
bun run lint
git add app/layouts/default.vue
git commit -m "feat(license): nav lock badges + License settings entry"
```

---

### Task 11: Trial banner

**Files:**
- Create: `app/components/TrialBanner.vue`
- Modify: `app/layouts/default.vue`

- [ ] **Step 1: Implement the banner**

```vue
<template>
	<div v-if="show" class="px-4 py-1.5 text-xs flex items-center justify-center gap-2
		bg-(--ui-primary)/10 text-(--ui-primary) border-b border-(--ui-primary)/20">
		<UIcon name="i-lucide-sparkles" class="size-3.5" />
		<span>Trial: <b>{{ license.trialDaysLeft }}</b> day{{ license.trialDaysLeft === 1 ? "" : "s" }} left — you're trying Premium.</span>
		<UpgradeButton label="Get a license" />
	</div>
</template>

<script setup lang="ts">
	import { useLicenseStore } from "~/stores/license";
	const license = useLicenseStore();
	const show = computed(() => license.isTrial && license.trialDaysLeft > 0);
</script>
```

- [ ] **Step 2: Mount it** at the top of the main content area in `default.vue` (just inside the content column, above the page). Add `<TrialBanner />`.

- [ ] **Step 3: Lint + commit**

```bash
bun run lint
git add app/components/TrialBanner.vue app/layouts/default.vue
git commit -m "feat(license): trial countdown banner"
```

---

### Task 12: In-page lock + view-only on feature pages

**Files:**
- Modify (each gated list/detail page): `app/pages/recurring-invoices/index.vue`, `app/pages/recurring-bills/index.vue`, `app/pages/credit-notes/index.vue`, `app/pages/reconcile.vue`, `app/pages/payslips/index.vue`, `app/pages/employees/index.vue`, `app/pages/payroll/index.vue`, `app/pages/payroll/dashboard.vue`, and the Plus report pages under `app/pages/reports/`.

For EACH page, apply this uniform pattern (keeps existing data viewable, blocks creation):

- [ ] **Step 1: Add the store + a locked flag**

In `<script setup>`:
```ts
import { useLicenseStore } from "~/stores/license";
const license = useLicenseStore();
const locked = computed(() => !license.hasFeature("<feature-key>")); // e.g. "recurring", "payroll", "reports.cash_flow"
```

- [ ] **Step 2: Show the lock banner + disable creation**

At the top of the page template (inside the root), add:
```vue
<FeatureLock v-if="locked" title="<Feature title>" tier-label="<Plus|Premium>" feature="<feature-key>" />
```
Wrap the page's primary "New …" button with `v-if="!locked"` (or `:disabled="locked"`), so existing rows still render and open read-only, but creation is blocked. For report pages that have no "New" action, the banner alone is the gate (the report still renders from existing data — acceptable, it's read-only by nature; OR hide the report body with `v-if="!locked"` and show only the banner — choose hide-body for the *paid reports* since a report is the deliverable).

- [ ] **Step 3: Lint after each page; commit in logical groups**

```bash
bun run lint
git add app/pages/recurring-invoices/index.vue app/pages/recurring-bills/index.vue app/pages/credit-notes/index.vue app/pages/reconcile.vue
git commit -m "feat(license): in-page lock on Plus document features"
```
```bash
git add app/pages/payslips/index.vue app/pages/employees/index.vue app/pages/payroll/index.vue app/pages/payroll/dashboard.vue
git commit -m "feat(license): in-page lock on Premium payroll pages"
```
```bash
git add app/pages/reports
git commit -m "feat(license): gate Plus reports, leave P&L/VAT open"
```

---

### Task 13: Gate the "New …" modals / detail creation actions

**Files:**
- Modify: `app/components/NewPayslipModal.vue`, `app/components/NewRecurringInvoiceModal.vue`, `app/components/NewRecurringBillModal.vue`, `app/components/NewCreditNoteModal.vue`, and the document detail pages' "Issue/Edit" actions for higher-tier docs.

- [ ] **Step 1: Guard each modal's submit**

In each "New …" modal's submit handler, early-return with an upsell if locked:
```ts
import { useLicenseStore } from "~/stores/license";
const license = useLicenseStore();
// in the create handler, first line:
if (!license.hasFeature("<feature-key>")) { await navigateTo("/upgrade?feature=<feature-key>"); return; }
```
Also disable the modal's primary button when locked (`:disabled="!license.hasFeature('<key>')"`) and show a one-line upsell note.

- [ ] **Step 2: View-only on existing higher-tier detail pages**

On `app/pages/payslips/[id].vue`, `app/pages/recurring-invoices/[id].vue`, `app/pages/recurring-bills/[id].vue`, `app/pages/credit-notes/[id].vue`: when `locked`, disable the save/issue/generate buttons and show an inline `FeatureLock` note, but keep the PDF/print + read-only view working.

- [ ] **Step 3: Lint + commit**

```bash
bun run lint
git add app/components/New*Modal.vue app/pages/payslips/[id].vue app/pages/recurring-invoices/[id].vue app/pages/recurring-bills/[id].vue app/pages/credit-notes/[id].vue
git commit -m "feat(license): block creation/edit of higher-tier docs (view-only preserved)"
```

---

### Task 14: Business-count cap

**Files:**
- Modify: `app/stores/tenants.ts`
- Modify: `app/pages/welcome.vue` and `app/pages/settings/businesses.vue` (the create entry points)

- [ ] **Step 1: Expose a guard in the create flow**

Where a new business is created (the "Create business" handler in `businesses.vue` and `welcome.vue`), before creating:
```ts
import { useLicenseStore } from "~/stores/license";
const license = useLicenseStore();
if (!license.canCreateBusiness(tenants.tenants.length)) {
	await navigateTo("/upgrade?feature=businesses");
	return;
}
```
Add `"businesses"` to `FEATURES`? No — it's a count cap, not a feature. Instead, `/upgrade` reads `?feature=businesses` and shows the "Basic is limited to 2 businesses" message. Existing businesses always open (no change to activate/switch).

- [ ] **Step 2: Disable the "New business" button when at the cap**

Bind `:disabled="!license.canCreateBusiness(tenants.tenants.length)"` on the create button and show a small "Basic is limited to 2 businesses — upgrade for more" note.

- [ ] **Step 3: Lint + commit**

```bash
bun run lint
git add app/stores/tenants.ts app/pages/welcome.vue app/pages/settings/businesses.vue
git commit -m "feat(license): cap Basic at 2 businesses (existing always open)"
```

---

### Task 15: `/upgrade` page + Settings → License page

**Files:**
- Create: `app/pages/upgrade.vue`
- Create: `app/pages/settings/license.vue`

- [ ] **Step 1: `/upgrade` page**

A read-only tier-comparison (three columns: Basic / Plus / Premium with the §2 feature lists), honoring `?feature=` to highlight what the user just hit, a "where to buy" link (constant URL — set the storefront here), and a **key entry box** that calls `license.enterKey()`. On success, toast + `navigateTo` back. Use existing UCard / UButton patterns. Include `PasswordInput`-style paste box (plain `UTextarea` for the long key) + an "Import .lic file" button that reads a file via `@tauri-apps/plugin-dialog` open + `@tauri-apps/plugin-fs` readTextFile and feeds it to `enterKey`.

- [ ] **Step 2: Settings → License page**

`app/pages/settings/license.vue`: shows current tier, `buyerName`/`buyerEmail` (when keyed), trial countdown, the same key-entry box (paste/import), and a "Remove key" button (`license.clearKey()`), plus a short "How tiers work" blurb linking to `/upgrade`. Mirror the layout of other settings pages (e.g. `settings/appearance.vue`).

- [ ] **Step 3: Lint + commit**

```bash
bun run lint
git add app/pages/upgrade.vue app/pages/settings/license.vue
git commit -m "feat(license): upgrade page + License settings page"
```

---

### Task 16: Buyer name in About modal + final QA

**Files:**
- Modify: `app/layouts/default.vue` (the About `UModal`)

- [ ] **Step 1: Show buyer name when keyed**

In the About modal body, when `license.buyerName` is non-empty, render: `Licensed to {{ license.buyerName }} ({{ license.buyerEmail }})`. When on free Basic / trial, show the tier + trial status instead.

- [ ] **Step 2: Manual QA across the tier matrix**

Run `bun run tauri:dev` and verify:
- Fresh install (delete `license.json` from app-data dir) → trial banner shows ~30 days, all features open.
- Simulate expiry: edit `license.json` `trial_start` to 40 days ago → after reload, Payroll/Recurring/etc. show `FeatureLock`; P&L/VAT/invoices/bills work; existing trial data still opens read-only; 3rd business creation blocked.
- Mint a Plus key (`mint_license`), paste in Settings → License → Plus features unlock, Payroll stays locked, businesses uncapped, About shows the buyer name.
- Mint a Premium key → everything unlocks.

- [ ] **Step 3: Lint, bump version (minor), commit**

```bash
bun run lint
# bump package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml (+ Cargo.lock)
git add -A
git commit -m "feat(license): buyer name in About; tier-matrix QA"
```

**Phase 2 done — open PR, merge.**

---

## Self-review notes (coverage check vs spec)

- §2 tier mapping → Task 6 `FEATURES` + Task 12/13 enforcement. ✓
- §3 trial (30d, rollback guard) → Task 7 trial math + Task 8 last_seen update. ✓
- §4 key format (Ed25519, magic, base32, prefix) → Task 2. ✓
- §5 key management (where keys live, keygen, mint) → Tasks 3–4 + `.gitignore`. ✓
- §6 components (Rust core, lib, store, nav/route/action gates, UI) → Tasks 2–16. ✓
- §6.4 nav "visible but locked" → Task 10 badges + Task 12 in-page lock (refinement: locked nav navigates to the page's lock banner rather than straight to `/upgrade`, so trial-created data stays reachable — consistent with the keep+view-only rule). ✓
- §7 downgrade (keep + view-only, cap gates creation) → Tasks 12–14. ✓
- §8 testing → Tasks 2,4,6,7 (Rust + TS unit tests). ✓
- §9 deferred (PDF footer, multi-key rotation) → intentionally NOT in plan. ✓
