# Per-business encryption — design spec

**Date:** 2026-06-02
**Status:** Approved design, pending implementation plan
**Feature:** Optional, per-business at-rest encryption of the SQLite
database, gated by a password, with a recovery key.

---

## 1. Summary

Add **opt-in, per-business password protection** that encrypts a
business's SQLite database at rest. A business the user chooses to
protect is stored on disk as an encrypted blob; opening it requires the
correct password (or a recovery key). This defends against **data theft**
— a stolen laptop, a copied database file, a business `.db` sitting on a
shared or cloud-synced drive — not merely casual UI snooping.

The feature is **purely additive and dormant by default**. Businesses
are unencrypted unless the user explicitly turns protection on for that
specific business.

---

## 2. Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Threat model | Real at-rest protection (data theft) | A copied/stolen DB file must be useless without the password. A UI-only lock doesn't achieve this. |
| Granularity | **Per-business** password | Fits the DB-per-business model; one DB file = one independently encrypted unit. A leaked password exposes only one business. |
| Recovery | **Recovery key** (one-time, shown at setup) | Financial/tax records are catastrophic to lose. A high-entropy recovery key is the responsible default. No silent backdoor. |
| Mechanism | **Decrypt-on-unlock** (encrypted blob at rest, plaintext working file while unlocked) | `tauri-plugin-sql` cannot key its connection pool, so transparent SQLCipher would require forking the plugin or rewriting the entire JS data layer into Rust. Decrypt-on-unlock needs **zero** data-layer changes. |
| Default | **Unencrypted** | Existing behavior preserved; zero friction for users who never enable it. |

### Rejected: transparent SQLCipher

The gold standard (DB never plaintext on disk, `PRAGMA key` per
connection) was rejected for v1. All app queries flow through
`tauri-plugin-sql`'s pool (the `getDb()` path in every store), which
exposes no hook to key connections. Adopting SQLCipher would mean
forking the plugin or moving every store's `select`/`execute` into Rust
commands — a large, risky rewrite that fights the architecture. May be
revisited post-1.0 if the runtime-plaintext window proves unacceptable.

---

## 3. Goals / Non-goals

### Goals

- Encrypt a chosen business's database at rest with a password.
- Recovery key so a forgotten password isn't a total loss.
- Per-business opt-in; unencrypted is the default and is untouched.
- No changes to the existing data-access layer (stores, `db.ts`,
  `tauri-plugin-sql`).
- Encrypted businesses produce **encrypted** export bundles.

### Non-goals

- **Per-page / view-vs-edit locking.** This gates *access to a whole
  business*. Once unlocked, everything in that business is editable —
  rendering any page requires decryption, which is full access. A
  separate "require password to edit" UX is explicitly out of scope.
- **App-wide single master password.** Granularity is per-business.
  (A future iteration could add an app-level lock on top.)
- **Protecting data while a business is actively unlocked.** The
  working file is plaintext during a session (see §8.3).
- **Encrypting `tenants.json` or logo files.** The registry holds only
  business names/ids; logos are identity, not financial data. Minor
  metadata, left in cleartext.
- **Transparent/always-encrypted storage** (SQLCipher) — see §2.

---

## 4. Cryptographic design

Envelope encryption. A random **Data Encryption Key (DEK)** encrypts the
database; the DEK itself is wrapped (encrypted) by keys derived from the
password and the recovery key.

### 4.1 Keys

- **DEK** — 256-bit random (OS CSPRNG). The only key that touches the DB.
- **KEK_pw** — `Argon2id(password, salt, params)`. Wraps the DEK.
- **Recovery key** — 256-bit random, shown to the user once, encoded as a
  human-friendly grouped string (e.g. base32 in dash-separated groups).
  Used directly (or via HKDF) as **KEK_rec**, which wraps the DEK a
  second time.

### 4.2 What encrypts what

- **DB file**: encrypted with the DEK using a **streaming AEAD**
  (XChaCha20-Poly1305 STREAM, chunked) so a large DB is never fully
  loaded into memory.
- **DEK wrapping**: the 32-byte DEK is AEAD-encrypted twice — once under
  KEK_pw, once under KEK_rec. Each wrap stores its own nonce + tag. The
  AEAD tag doubles as the "is this password/recovery key correct?"
  verifier (decrypt-the-wrap succeeds only with the right key).

### 4.3 Operations that fall out of this design

- **Unlock (password)**: derive KEK_pw → unwrap DEK → decrypt DB.
- **Unlock (recovery key)**: KEK_rec → unwrap DEK → decrypt DB.
- **Change password**: derive new KEK_pw → re-wrap the *same* DEK. The DB
  is **not** re-encrypted (fast, no large I/O).
- **Enable encryption**: generate DEK + recovery key, encrypt the
  existing plaintext DB, write vault metadata.
- **Disable encryption**: unwrap DEK with current password, decrypt DB
  permanently, delete `.enc` + vault metadata, clear the flag.

### 4.4 Algorithm agility

The vault metadata records an algorithm/version tag and KDF parameters so
primitives or Argon2id cost can change in future without breaking
existing vaults.

---

## 5. Storage layout

```
%APPDATA%\com.sakoram.billing\
  ├─ tenants.json                  ← registry; per-tenant gains `encrypted: bool`
  └─ businesses\
      ├─ {tenant_id}.db            ← working DB, plaintext — exists ONLY while unlocked
      ├─ {tenant_id}.db.enc        ← encrypted blob at rest
      └─ {tenant_id}.vault.json    ← salt, KDF params, both wrapped DEKs,
                                       nonces/tags, alg version (NOT secret)
```

- `vault.json` is **not** secret — it contains no usable key material
  without the password or recovery key. It must never be inside the
  encrypted DB (we need it to decrypt).
- The **unlocked DEK lives in Rust process memory** for the session.
  This survives the webview reload that happens on tenant switch /
  `window.location.assign("/")` because the Rust **process** stays
  alive — so the user is not re-prompted on every navigation.

---

## 6. Lifecycle

### 6.1 Unlock

1. Welcome screen shows encrypted businesses with a lock indicator.
2. Selecting one prompts for the password (with a "use recovery key"
   fallback).
3. Rust `unlock_tenant(id, secret)` decrypts `.enc` → working `.db`,
   holds the DEK in memory, marks the session unlocked.
4. Activate tenant → `window.location.assign("/")`.

### 6.2 Access guard

A global middleware (extending `tenant.global.ts`) redirects to an
`/unlock` screen when the active business is `encrypted` and the Rust
session is not currently unlocked.

### 6.3 Lock

Lock = re-encrypt working `.db` → `.enc`, then securely wipe the
plaintext working file. Triggered by:

- App exit (`RunEvent::ExitRequested` / window close).
- Switching away to another business (lock the previous, then unlock the
  next).
- Manual "Lock now".
- Optional idle timeout (Phase 3).

### 6.4 Crash recovery

A hard crash / power loss can leave a plaintext working `.db` behind. The
working `.db` is always the **newest** truth and is **never** overwritten
by the stale `.enc`. On next launch, if a working `.db` exists for an
encrypted tenant, the app requires the password to re-seal (re-encrypt)
it, then deletes the plaintext. Until re-sealed, that business stays in a
"needs re-lock" state.

---

## 7. UI surfaces

- **Unlock screen** (`/unlock`) — password field + "use recovery key"
  fallback. Uses the `welcome` layout (no main app chrome).
- **Enable encryption** — a new **Security** area (App settings group):
  set + confirm password → **show the recovery key once** with
  copy/print and an explicit "I have saved this" confirmation gate →
  encrypt in place.
- **Change password** — requires current password; re-wraps the DEK.
- **Disable encryption** — requires current password; decrypts
  permanently.
- **Lock now** — manual lock action (sidebar or Security area).
- **Welcome screen** — lock indicator on encrypted businesses; unencrypted
  ones open with a single click exactly as today.

---

## 8. Edge cases & boundaries

### 8.1 Unencrypted is the default (load-bearing)

All lock/unlock/guard machinery activates **only** when a business's
`encrypted` flag is true. New businesses are created unencrypted. An
unencrypted business never hits an unlock screen or any crypto code path.
Mixed state (some businesses encrypted, some not) is normal and
supported.

### 8.2 Encrypted exports

The export/backup `.zip` currently bundles the plaintext DB. For an
encrypted business the export **must** itself be encrypted
(passphrase-protected), or it's a trivial bypass of the whole feature.
The import side detects and prompts for the passphrase. (Phase 3.)
`SCHEMA_VERSION` gating in `data_io.rs` is unaffected.

### 8.3 Runtime plaintext window (accepted trade-off)

While a business is unlocked and in use, its working `.db` is plaintext
on disk. This is inherent to decrypt-on-unlock and was accepted: the
threat is a copied/stolen file when the app is closed/locked, at which
point only `.enc` exists. An attacker with access to a running, unlocked
session already has the data.

### 8.4 Password loss

By design there is no backdoor. If **both** the password and the recovery
key are lost, that business's data is unrecoverable. The setup flow makes
the recovery key's importance explicit and gates completion on the user
confirming they've saved it.

### 8.5 Performance

Unlock decrypts the whole DB (proportional to size — sub-second to a few
seconds for a large demo-scale DB) plus the intentional Argon2id cost
(~0.5 s). Acceptable for a deliberate "open this business" action.

---

## 9. Components (new / changed)

### New (Rust)

- `src-tauri/src/vault.rs` — crypto core: envelope encrypt/decrypt,
  Argon2id KDF, recovery-key generation/encoding, streaming AEAD over the
  DB file, and the `#[tauri::command]`s: `enable_encryption`,
  `disable_encryption`, `unlock_tenant`, `lock_tenant`, `change_password`,
  `is_tenant_unlocked`, plus crash-recovery sealing. Registered in
  `lib.rs`'s `invoke_handler!`.
- Session state (unlocked DEKs) held via Tauri `manage`d state.
- New crates: `argon2`, an AEAD crate (`chacha20poly1305` w/ `stream`),
  CSPRNG (`rand`/`getrandom`), an encoder for the recovery key.

### Changed

- `src-tauri/src/tenants.rs` — registry gains `encrypted` flag; activate
  path coordinates with unlock; lock on switch.
- `src-tauri/src/data_io.rs` — encrypted export/import (Phase 3).
- `src-tauri/src/lib.rs` — register vault commands; exit hook to lock.
- `app/middleware/tenant.global.ts` — guard for locked encrypted tenants.
- `app/pages/unlock.vue` (new), Security settings page (new), welcome
  screen lock indicators, businesses settings entry points.
- `app/stores/tenants.ts` — bridge new commands + encrypted flag.

---

## 10. Testing

- **Rust unit tests** (`vault.rs`): round-trip encrypt/decrypt; wrong
  password/recovery key rejected; recovery-key path unwraps the same DEK;
  change-password preserves DB without re-encryption; tamper (flipped
  byte) fails AEAD; large-file streaming.
- **Lifecycle**: unlock → use → lock leaves only `.enc`; switch locks the
  previous; simulated crash (leftover working `.db`) re-seals correctly.
- **Default path regression**: unencrypted businesses behave exactly as
  before (no prompts, no crypto path).
- **Export/import**: encrypted bundle round-trips; wrong passphrase
  rejected.

---

## 11. Phasing

One design doc, three implementation cycles (each its own
spec→plan→PR per the project's branch workflow):

1. **Crypto core** — `vault.rs` envelope encrypt/decrypt + Argon2id +
   recovery key + unit tests. No UI, no lifecycle wiring.
2. **Lifecycle + UI** — unlock screen, enable/disable, recovery-key
   display, tenant-switch / exit / crash handling, access guard.
3. **Hardening** — encrypted exports, change-password, optional
   idle-lock.

---

## 12. Open questions for spec review

- Recovery-key encoding: base32 dash-groups vs. BIP39 word list
  (friendlier to transcribe). Defer to implementation; not
  architecturally significant.
- Idle-lock default (on/off, timeout length) — Phase 3, can decide later.
