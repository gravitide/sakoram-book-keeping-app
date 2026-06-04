# Licensing & feature tiers — design

**Date:** 2026-06-04
**Status:** Approved design, pending implementation plan
**Author:** Sakoram dev + Claude (brainstorming session)

---

## 1. Goal

Turn Sakoram into a sellable product with three perpetual, one-time-purchase
tiers, gated by **offline-verifiable license keys**. No server, no "phone
home" — consistent with the app's fully-offline, no-backend design.

- **Basic** — free after trial. Core invoicing + expenses.
- **Plus** — paid. Automation (recurring), credit notes, statements, bank
  reconciliation, all reports, per-business encryption.
- **Premium** — paid. Everything, including the full Payroll module.

Fresh install runs the **full Premium app for a 30-day trial**, then falls
back to free **Basic** forever. A paid key permanently unlocks Plus or
Premium.

### Non-goals (explicit)

- **We are NOT trying to defeat reverse-engineering.** The app is offline and
  the tier gate is client-side; a determined cracker can patch the binary to
  bypass tiers. That is an accepted limitation, consistent with the
  "soft-deterrent" decisions below.
- What we *do* enforce cryptographically: keys **cannot be forged** (Ed25519
  signature — you can't mint a valid key without the private key).
- The deterrent against *sharing* a legitimately-bought key is **social**: the
  buyer's name/email is embedded in the key and shown in-app.
- No subscription/expiry logic. Keys are perpetual.
- No per-business licensing — one license covers the whole install.

---

## 2. Tiers & feature mapping

The mapping below is the **single source of truth**, implemented as a
feature→min-tier registry in `app/lib/licensing.ts`. Tiers are ordered:
`basic (0) < plus (1) < premium (2)`.

### Always available — every tier, including expired-trial Basic
Data ownership and the app shell are never gated:
- Dashboard, Calendar
- Clients, Vendors, Bill categories (address books / lookups)
- All Settings: Business details, Appearance, PDF font/header logo
- **Multiple businesses + Export/Import backup** — data portability is never
  gated (subject to the Basic business *count* cap below — but export/import
  of existing data always works)
- Help

### 🟢 Basic (free after trial)
- **Quotes**, **Invoices** (incoming core)
- **Bills** (outgoing core)
- **Vouchers** (record money in/out — needed to mark things paid)
- **Profit & Loss** report + **VAT** report (the two a Sri Lankan business
  must file)
- PDF generation for those documents
- Local file attachments **and phone-upload attachments** (phone upload is in
  *all* tiers — a strong "try it" hook during the trial)
- **Business count capped at 2.**

### 🔵 Plus (paid) — Basic plus:
- **Recurring invoices** + **Recurring bills**
- **Credit notes**
- **Customer statements**
- **Bank reconciliation** (Reconcile + CSV import)
- **All remaining reports**: aged receivables, aged payables, cash flow,
  sales-by-client, expenses-by-vendor
- **PDF password protection**
- **Per-business encryption** (the vault)
- **Unlimited businesses.**

### 🟣 Premium (paid) — Plus plus:
- The entire **Payroll module**: Employees, Payslips (+ bulk run), Payroll
  dashboard, EPF/ETF/PAYE auto-compute, Payroll settings, Payroll register
  report
- **Unlimited businesses.**

### Business-count cap summary
| Tier | Max businesses |
|---|---|
| Basic | 2 |
| Plus | unlimited |
| Premium | unlimited |

The cap gates **creating** a new business. Existing businesses are always
openable (see §6, downgrade behavior).

---

## 3. Trial model

- **Length:** 30 days (constant — generous enough to run a full monthly cycle
  incl. a payroll run, so Premium gets a fair trial).
- **Start:** recorded on first launch (first time the license module
  initializes on a machine), stored in `license.json` (see §7).
- **During trial:** effective tier = **Premium** (full app), with a slim
  banner showing days remaining ("Trial: 23 days left — you're trying
  Premium").
- **At expiry:** effective tier drops to **Basic**; a one-time notice
  explains the change and points to `/upgrade`.
- **Clock-rollback guard:** `license.json` stores a `last_seen_date` (the max
  date the app has ever observed). If the current system date is *earlier*
  than `last_seen_date`, the trial clock does not gain extra days (we use
  `max(now, last_seen_date)` for elapsed-time math). This is a soft
  deterrent — reinstalling / clearing app-data resets the trial, and that is
  accepted.

---

## 4. License key format

An **Ed25519-signed token**. The app embeds only the **public key** and
verifies fully offline; only the holder of the **private key** can mint a
valid key.

### Payload (compact, binary — keeps the key string manageable)
| Field | Bytes | Notes |
|---|---|---|
| magic | 4 | ASCII `SKRM` — rejects keys for other products |
| format_version | 1 | currently `1` |
| tier | 1 | `1 = plus`, `2 = premium` (Basic needs no key) |
| license_id | 8 | your reference number for this sale |
| issued_date | 4 | days since 1970-01-01 (record-keeping only; perpetual) |
| name_len | 1 | length of buyer name in bytes |
| name | n | UTF-8 buyer name |
| email_len | 1 | length of buyer email in bytes |
| email | m | UTF-8 buyer email |

Then a **64-byte Ed25519 signature** over the payload bytes is appended.

### Encoding (the string the buyer pastes)
`SAKORAM-<TIER>-<base32 of (payload || signature), Crockford, hyphen-grouped>`

- The leading `SAKORAM-PREMIUM-…` is **cosmetic / support-friendly only**.
  The authoritative tier comes from the **verified payload**, never from the
  prefix.
- Because the blob is ~140–200 bytes (→ ~230–320 base32 chars), the key is
  long. The License UI accepts it as **either** a pasted string **or** an
  imported **`.lic` file** (same bytes, just file-delivered).
- `data-encoding` (already a dependency) provides base32; `ed25519-dalek` (new
  dependency) provides signing/verification.

### Verification (in the app, Rust)
`validate_license(key) -> LicenseInfo`:
1. Strip prefix + hyphens, base32-decode to bytes.
2. Split into payload + 64-byte signature.
3. Verify signature against the **embedded public key**. Reject on failure.
4. Check `magic == SKRM` and a supported `format_version`.
5. Parse and return `{ tier, license_id, name, email, issued_date }`.

Verification lives in **Rust** (not JS) so the public key and check aren't
sitting in the patchable JS bundle. (A cracker can still patch the frontend
gate — accepted; this just raises the bar to match the soft-deterrent
posture.)

---

## 5. Key management & minting workflow

> This section answers: *how do I generate keys, and where do the private &
> public keys live?*

### 5.1 Where the keys live

| Key | Location | In git? | Notes |
|---|---|---|---|
| **Private (signing) key** | A file on **your machine only**, outside the repo — recommended `~/.sakoram/license-signing.key`. The mint tool also accepts it via the `SAKORAM_LICENSE_PRIVATE_KEY` env var or `--key-file`. | **NEVER** | Back it up securely (password manager / encrypted vault). If lost, you can't mint new keys until you ship a new public key (see rotation). |
| **Public (verify) key** | Committed in the app as a constant in **`src-tauri/src/license.rs`** (32 bytes, hex/base64). Compiled into the binary. | **Yes** | Safe to be public — it can only *verify*, not *sign*. |

A `.gitignore` entry guards against accidentally committing a key file
(`*.signing.key`, `license-signing.key`).

### 5.2 The minting tool

A small **Rust binary target**, `src-tauri/src/bin/mint_license.rs`, that
**shares the payload-encoding code with the app** (`license.rs` exposes the
encode/decode + format constants; the app side verifies, the tool side
signs). It is a dev/ops tool — **not** bundled into the shipped app.

#### One-time: create your keypair
```bash
# from src-tauri/
cargo run --quiet --bin mint_license -- keygen --out ~/.sakoram/license-signing.key
# Prints the PUBLIC key (hex). Paste it into the PUBLIC_KEY constant in
# src-tauri/src/license.rs and commit that.
# The PRIVATE key is written to the --out file. Back it up; never commit it.
```

#### Per sale: mint a key
```bash
export SAKORAM_LICENSE_PRIVATE_KEY=$(cat ~/.sakoram/license-signing.key)   # or use --key-file
cargo run --quiet --bin mint_license -- mint \
  --tier premium \
  --name "Acme (Pvt) Ltd" \
  --email "owner@acme.lk" \
  --license-id 1042            # your running reference number
# Output:
#   Key:  SAKORAM-PREMIUM-XXXX-XXXX-XXXX-…
#   File: ./acme-1042.lic      (optional, with --out)
```
Send the buyer the key string (and/or the `.lic` file). They paste/import it
into **Settings → License**.

#### Keep a simple ledger
Maintain a spreadsheet of `license_id → buyer name/email/tier/date` for
support and reference. The mint tool does not store anything itself.

### 5.3 Rotation / compromise
If the private key leaks: generate a new keypair, ship an app update with the
new public key, and re-issue keys to existing customers. To avoid breaking
already-sold keys, `license.rs` can hold an **array** of accepted public keys
(old + new) and accept a signature that verifies against any of them.

---

## 6. Gating architecture & components

Each unit has one purpose and a clear interface (mirrors the existing
`resolveTenantGuard` pattern).

### 6.1 `app/lib/licensing.ts` (pure, unit-tested)
- `Tier` enum + ordering.
- `FEATURES`: the feature→min-tier registry (the §2 mapping). Feature keys are
  stable strings, e.g. `"recurring"`, `"credit_notes"`, `"reconcile"`,
  `"reports.aged_receivables"`, `"payroll"`, `"encryption"`,
  `"pdf_protection"`.
- `BUSINESS_LIMITS: Record<Tier, number>` (Basic = 2, else `Infinity`).
- `hasFeature(tier, key): boolean`.
- `effectiveEntitlement(license, trial, now): { tier, isTrial, trialDaysLeft, businessLimit }`
  — combines a validated license (if any) with trial state to produce the
  *effective* tier (trial → Premium; else license tier; else Basic).

### 6.2 `src-tauri/src/license.rs` (Rust)
- `PUBLIC_KEY` constant(s).
- `validate_license(key: String) -> Result<LicenseInfo, String>` (§4).
- Trial state read/write in `license.json` (§7) with the clock-rollback guard.
- Tauri commands: `validate_license`, `get_license_state`,
  `set_license_key`, `clear_license_key`. Registered in `lib.rs`'s
  `invoke_handler!`.
- Shares format/encode code with `bin/mint_license.rs`.

### 6.3 `app/stores/license.ts` (Pinia)
- Loads license + trial state at startup via the Rust commands.
- Exposes `tier`, `isTrial`, `trialDaysLeft`, `buyerName`, `hasFeature(key)`,
  `canCreateBusiness(currentCount)`.
- `enterKey(key)` → calls Rust to validate + persist; updates state.

### 6.4 Gating surfaces
- **Nav** (`app/layouts/default.vue`): nav items gain an optional `feature`.
  Locked items render with a lock badge; clicking routes to
  `/upgrade?feature=…` instead of the page.
- **Routes**: a pure `resolveLicenseGuard(routePath, entitlement)` +
  `app/middleware/license.global.ts` (mirrors `tenant.global.ts`), redirecting
  locked *create/edit* routes to the upsell. **Read/view routes for existing
  data are NOT blocked** (see §7 downgrade rule).
- **Actions**: "New payslip / recurring / credit note / statement / reconcile
  import" and "Create business" entry points check `hasFeature()` /
  `canCreateBusiness()` and show the upsell instead of acting.

### 6.5 UI
- **`/upgrade` page** — a tier-comparison + "what you're missing" screen with
  the **license key entry box** (paste or import `.lic`), and a "where to buy"
  link.
- **Settings → License** (new page under the Settings group) — current tier,
  buyer name/email, trial countdown, enter/replace key, import `.lic`,
  clear key.
- **Trial banner** — slim, dismissible-per-session, shows days left + upgrade
  link; one-time "trial ended → Basic" notice at expiry.
- **About modal** — shows buyer name when a paid key is active (soft
  deterrent).

---

## 7. Data storage & downgrade behavior

### License state file
`{app_data_dir}/license.json` (per-install, **not** per-tenant):
```json
{
  "license_key": "SAKORAM-PREMIUM-…",   // null when none entered
  "trial_start": "2026-06-04",          // ISO date, set on first launch
  "last_seen_date": "2026-06-20"        // max date observed (rollback guard)
}
```
The validated tier is derived from `license_key` at runtime; we don't trust a
cached tier field.

### Downgrade rule (settled: keep + view-only, block new)
When the effective tier is below a feature's tier (trial ended, or Basic with
trial-created data):
- **Existing higher-tier records stay openable and printable.** A payslip,
  recurring template, credit note, or 3rd business created earlier can still be
  viewed and its PDF re-generated.
- **Create / edit / issue actions on those records are disabled**, with an
  inline upsell note.
- **Business cap** blocks *creating* a 3rd business on Basic; existing
  businesses always open and export.
- Data is **never deleted or hidden** — important for trust and because issued
  invoices/payslips are financial records.

---

## 8. Testing

- **Pure TS unit tests** (`app/lib/licensing.test.ts`): feature→tier mapping,
  `hasFeature`, business limits, `effectiveEntitlement` (trial active / trial
  expired / Plus key / Premium key), and `resolveLicenseGuard` redirects.
- **Rust unit tests** (`license.rs`): sign→verify round-trip (using a
  test keypair), tampered-payload rejection, wrong-magic rejection,
  truncated-key rejection, and the clock-rollback guard.
- The mint tool is exercised indirectly by the round-trip test (shared code).

---

## 9. Open / deferred items

- **PDF-footer buyer name** — deferred. Buyer name shows in About + Settings
  for v1; a PDF-footer toggle can be added later if sharing becomes a problem.
- **Accepted-public-keys array** for rotation — design accommodates it;
  ship with a single key initially.
- **Where to buy** link target (Gumroad / Lemon Squeezy / direct) — a config
  constant; pick the storefront at implementation time.
- **Trial reset hardening** beyond the clock-rollback guard (e.g., a hidden
  marker outside app-data) — out of scope; accepted as a soft deterrent.

---

## 10. Build sequence (for the implementation plan)

1. Rust `license.rs` core: payload encode/decode, Ed25519 verify, `PUBLIC_KEY`
   constant, unit tests. + `bin/mint_license.rs` (keygen + mint). Generate the
   real keypair, paste the public key in.
2. Trial state in `license.json` + commands (`get_license_state`,
   `set_license_key`, `clear_license_key`) + clock-rollback guard.
3. `app/lib/licensing.ts` (registry + pure functions) + tests.
4. `app/stores/license.ts` + startup load.
5. Gating surfaces: nav lock badges, `resolveLicenseGuard` + middleware,
   action-level checks, business-cap check on tenant create.
6. UI: `/upgrade` page, Settings → License page, trial banner, About-modal
   buyer name.
7. Downgrade view-only enforcement on higher-tier detail pages.
8. End-to-end manual QA across the tier matrix; bump version; PR.
