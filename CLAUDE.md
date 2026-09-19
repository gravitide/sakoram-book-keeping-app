# Sakoram — handoff notes

A single-user desktop bookkeeping app for a Sri Lankan business. Manages
quotes, invoices, bills, vouchers, employees, payslips, and renders
professional PDFs. Runs fully offline by default with local SQLite (the only
network feature is the optional, user-initiated Google Drive backup). Multi-tenant:
one SQLite file per business.

If you're a fresh Claude session picking this up, read this whole file
before touching code. The conventions and invariants below are
load-bearing — there are landmines around money math, the connection
pool, multi-tenancy, and the Tauri capability layer.

---

## Tech stack (non-negotiable)

| Layer | Choice |
|---|---|
| Shell | **Tauri 2** (Rust) on Windows + macOS |
| Frontend | **Nuxt 4 SSG** (`ssr: false`, `nuxi generate`) |
| UI | **NuxtUI 4** (`@nuxt/ui` ^4.4) + **Tailwind v4** |
| Icons | **Lucide** via `@iconify-json/lucide`, bundled into the client (no runtime API fetches) |
| Fonts | **Inter**, **Inter Tight**, **Stack Sans Text**, **Miriam Libre**, **Amarna**, **Akt** — all bundled (UI via `@font-face`, PDF via Typst `--font-path`) |
| Lang | **TypeScript** strict |
| State | **Pinia** (composition stores) |
| Validation | **Zod** |
| Package manager | **bun** (only — `preinstall` script blocks npm/yarn/pnpm) |
| DB | **SQLite** via `tauri-plugin-sql` (sqlx 0.8 underneath) |
| PDFs | **Typst** sidecar binary (`src-tauri/binaries/typst-*.exe`) |
| Window chrome | Custom — `decorations: false` on Windows; macOS uses `titleBarStyle: "Overlay"` to keep OS-drawn traffic lights while our chrome paints behind. `app/components/TitleBar.vue` adapts per platform. |
| Testing | **Vitest** |

`bun` is **mandatory** — `bun run`, `bun add`, etc. The user runs **bash
on Windows** (Git Bash) — give shell commands accordingly.

The product is named **Sakoram** at the OS level (Tauri `productName`,
installer filename, Start menu / Dock entry, Add/Remove Programs). The
full tagline **"Sakoram — The desktop bookkeeper!"** is the in-app
identity — window title, sidebar tooltip, About modal subtitle, README
H1. Don't slip back to "Bookkeeping" / "Book Keeping" anywhere; those
were earlier names that have been retired.

---

## Pre-1.0 status

**The app is pre-production.** No real users have data on this build.
That has two practical consequences:

- **Schema redesigns are fair game.** When a refactor wants different
  columns (e.g. swapping free-text vendor fields for a `vendor_id` FK
  + `vendor_snapshot` JSON), write a migration that *drops and
  recreates* the affected tables rather than ALTER-ing into a wonky
  intermediate state. Any data on dev machines is disposable.
- **No backfill / data-preservation migrations.** Don't bend over
  backwards to keep test data working — the user explicitly opted out.
  Once we ship 1.0 this rule flips and migrations must preserve data.

This applies to the `migrations/` directory and to `SCHEMA_VERSION` in
`data_io.rs`. Every breaking schema change still bumps SCHEMA_VERSION
so backups stay version-aligned.

## Golden rules

These are invariants, not guidelines. Breaking them silently corrupts
data.

1. **Money is integer cents (minor units). Never floats.** Always store
   and compute in cents. Use `formatMoney()` (or its backward-compat
   alias `formatLKR()`) and `toCents()` from `app/lib/money.ts`.
   Banker's (half-even) rounding. Only 100-minor-unit currencies are
   supported — JPY/KRW (no decimals) and Gulf 1000-mil currencies are
   deliberately out of scope.

2. **Quantities are `quantity_milli`** — qty × 1000 stored as INTEGER.
   Supports 3 decimal places. `formatQty()` for display.

3. **Tax rates are basis points** — 18% = 1800. INTEGER. `formatRate()`
   for display.

4. **Snapshot party info on issued documents**. `client_snapshot` /
   `vendor_snapshot` / `employee_snapshot` is a JSON-serialised copy
   of the party at issue time. Do NOT join `clients` / `vendors` /
   `employees` to render an old quote / invoice / bill / payslip.

5. **Issued documents are immutable** (sent / accepted / etc.). Only
   `notes` stays editable post-issue. Never edit historical totals.
   Payslips follow the same rule — see `app/pages/payslips/[id].vue`'s
   locked-form path.

6. **Document numbering is atomic and continuous per type** — one
   ever-incrementing counter per `document_type`, NO fiscal year in the
   number (migration 0047: `QUO-2026-0004` → `QUO-0004`). Implemented as
   `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` in
   `app/lib/numbering.ts`. Do NOT replace this with read-then-write logic
   — see "Connection pool caveat" below. The `DocumentType` union covers
   `quote | invoice | bill | voucher | payslip | credit_note | letter`.
   The issue date no longer affects the number (so converting a quote to
   an invoice just takes the next INV number; there's no year jump and no
   back-date "renumber" step). `computeFiscalYear` still exists but only
   for stamping a fiscal year on payslips (payroll grouping), not numbers.

7. **Status transitions live in the store, not free-form**. See
   `STATUS_TRANSITIONS` maps in each store. The DB also enforces via
   CHECK constraints. Keep them in sync.

8. **One currency per business**, picked in Company settings and stored
   on `company_settings.currency_code` as an ISO 4217 alpha code (LKR,
   USD, EUR, GBP, INR, AED, AUD, SGD — see `CURRENCIES` map in
   `app/lib/money.ts`). Symbol/locale derives from the code. No FX
   conversion, no per-document override. The settings store keeps the
   formatter cache in sync via `setActiveCurrency()` after every load.
   Fiscal year defaults to April→March (Sri Lanka government FY).

9. **Dates are ISO `YYYY-MM-DD` strings everywhere** — DB columns,
   Pinia state, PDF JSON payloads, function args. Conversion to
   `CalendarDate` is hidden inside `app/components/DateField.vue`
   (which now also accepts optional `min-value` / `max-value` ISO
   strings — used to constrain the period / pay-date pickers on
   payslips and the voucher date when recording a salary payment).

---

## Connection pool caveat (READ THIS)

`tauri-plugin-sql` uses a **connection pool**. Implications:

- **You cannot run multi-statement transactions from JS.** A `BEGIN
  IMMEDIATE` on one pool connection followed by an `INSERT` on another
  yields `SQLITE_BUSY` ("database is locked").
- Every operation must be **a single SQL statement** to be atomic.
- Multi-step writes (e.g. "delete all line rows, then insert new ones")
  run as **sequential auto-commits**. Acceptable for this single-user
  app: a crash mid-write only loses unsaved edits, never issued
  documents (which are immutable).
- Cascading deletes (e.g. removing a draft) rely on `ON DELETE CASCADE`
  in the schema — not on JS orchestration.

If you need atomicity across multiple tables, write it as a single
`INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` or move the logic
into a Rust `#[tauri::command]`.

---

## Multi-tenancy model

Each business is a **separate SQLite file**. The Rust side runs
migrations per DB via sqlx directly (we deliberately do NOT use
`tauri-plugin-sql`'s `add_migrations` because it can't register URLs
added at runtime).

### Portable business folders (since migration 0037 / v0.129)

Each business is a **portable folder the user chooses the location of** —
a "document" they own, can move to an external drive, and Open / Close /
Forget like a file. Only two app-level files stay in `%APPDATA%`:

```
%APPDATA%\com.sakoram.billing\
  ├─ tenants.json     ← registry: { active_tenant_id, tenants: [{ id, name, path, logo_file, encrypted }] }
  └─ license.json     ← per-install trial/license (per-machine; NEVER travels with a folder)
```

A **business folder** (anywhere the user picks) holds everything for that
business, with **fixed filenames** (the folder is the container — the id
is no longer encoded in filenames):

```
<Safe Business Name>/
  ├─ business.json                       ← self-describing marker { id, name, schema_version, created_at, encrypted }
  ├─ business.db                         ← the SQLite file (fixed name)
  ├─ attachments/<document_type>/<document_id>/…
  ├─ logos/logo.<ext>                    ← square identity logo (sidebar, tenant switcher, hero); the CROPPED derivative
  ├─ logos/logo-original.<ext>           ← untouched upload, source for Re-crop (local-only, not in backups)
  ├─ pdf-header.<ext>                    ← optional wide letterhead logo printed on PDFs
  └─ business.db.enc + business.vault.json   ← only when encrypted (decrypt-on-unlock working file is business.db)
```

- **`tenants.json` gained an absolute `path` per tenant** — the registry
  is a recent-list index; the folder (via its `business.json` marker) is
  the source of truth. `tenant.id` is still the stable identity (registry,
  vault session keys, business_name in the DB) but is **no longer** a
  filename stem — filenames inside a folder are fixed.
- **Folder name is cosmetic**, derived from the business name via
  `app/lib/safe-folder-name.ts` (illegal-char strip, Windows reserved-name
  guard, length cap; Rust de-dupes with ` (2)`…). Renaming a business
  updates `name` in the marker + registry only — the folder is **not**
  moved/renamed (matches the old "rename changes name only" invariant).
- **Logo (`logos/logo.<ext>`) is mirrored into `tenants.json` as
  `logo_file`** because the welcome/sidebar UI reads it directly without
  going through the DB. The wide PDF-header logo lives at the folder root
  and only on `company_settings.pdf_header_logo_path`. Both frontend
  writers (`settings/company.vue`, `settings/pdf.vue`, `onboarding.vue`)
  resolve their target from `tenants.activeFolder` (the active tenant's
  `path`), not from `appDataDir()`.
- **Clean cutover, no migration.** The old
  `%APPDATA%/{businesses,logos,pdf-headers,attachments}` layout is
  **retired** (pre-1.0, disposable data). Businesses created on an old
  build won't appear — their registry entries lack a `path`. `migrate_legacy_db`
  was dropped.

### Tenant lifecycle

- **App startup** — `app/middleware/tenant.global.ts` redirects every
  navigation to `/welcome` unless an active tenant is set.
- **New** — enter a name → **pick a parent folder** (folder dialog) →
  `tenants.create(name, parentDir)` invokes `create_tenant({ name, parentDir,
  folderName: safeFolderName(name) })`; Rust creates `<parentDir>/<folderName>`,
  migrates + seeds `business.db`, writes the marker, registers it. Then
  the welcome page activates + hard-reloads into onboarding. The demo
  business skips the dialog and defaults its parent to `appDataDir()`
  (one-click; the throwaway lands in `%APPDATA%`).
- **Open** — folder dialog → `tenants.open(path)` → `open_tenant({ path })`
  validates the marker + `business.db`, runs pending migrations, upserts
  the registry entry keyed on the marker `id` → activate + hard-reload.
- **Close** — `tenants.close()` → `resetDbCache()`, seals an encrypted
  active tenant, `clear_active_tenant()`, nulls active state → `/welcome`.
- **Delete vs Forget** — `tenants.remove(id)` (`delete_tenant`) removes the
  whole folder from disk; `tenants.forget(id)` (`forget_tenant`) drops the
  registry entry only, leaving the files untouched (re-Openable later).
- **Missing folder** — welcome + Businesses check each registry `path` with
  `exists()` on load; a missing folder shows a "Not found" badge + a Forget
  action (full Locate/relocate is a P2 follow-up).
- **Switching** — `tenants.activate(id)` then **`window.location.assign("/")`** to hard-reload. This wipes every Pinia store's in-memory state cleanly. Don't try to manually `$reset()` everything — it's bug-prone.

### Bundle identifier

`com.sakoram.billing` is the Tauri bundle identifier. **Do not change
it** — it still determines `app_data_dir` (home of `tenants.json` +
`license.json`). Renaming would orphan the registry + license state.

---

## Per-business encryption (optional, opt-in)

Off by default; unencrypted businesses are unaffected.

- **Crypto core** — `src-tauri/src/vault.rs`: envelope encryption (random DEK
  encrypts the DB via XChaCha20-Poly1305 STREAM; DEK wrapped by an Argon2id
  password key AND a one-time recovery key). Tenant id bound as AAD; keys
  `Zeroizing`. Also `encrypt_bytes`/`decrypt_bytes` for encrypted export bundles.
- **Orchestration** — `src-tauri/src/vault_fs.rs`: on-disk vault
  (`{id}.db.enc` blob + `{id}.vault.json`), in-memory session DEK state
  (`VaultSessions`), and commands `enable_tenant_encryption` / `unlock_tenant`
  / `lock_tenant` / `disable_tenant_encryption` / `change_tenant_password` /
  `tenant_lock_state`.
- **Model: decrypt-on-unlock** — `tauri-plugin-sql` can't be keyed (no
  SQLCipher). Unlock decrypts the blob to the working `{id}.db`; lock /
  window-close / tenant-switch reseals + wipes the plaintext. Working file is
  plaintext while unlocked (accepted trade-off).
- **Registry/UI:** `tenants.json` per-tenant gains `encrypted: bool` (serde
  default false). `/unlock` page, guard in `tenant.global.ts`, Security
  settings page (`/settings/security#encryption`), titlebar quick-lock.
- **Backups** (`data_io.rs`): export optionally passphrase-seals the payload
  (`payload.enc`) + bundles attachments + PDF header logo; import rewrites
  paths and rolls back a failed "new" import.

**Landmines:**
- **`resetDbCache()` (closes the sql pool) before any op that re-encrypts or
  renames `.db`** (`lock_tenant`, enable) — Windows can't delete/rename an open
  file. `activate()` + the lock-on-close plugin already do this.
- **Never `ensure_tenant_db` for an encrypted-and-locked tenant** — it runs
  migrations on a missing file and creates an EMPTY plaintext DB (the empty-DB
  hazard). The tenants store gates `refresh()`/`activate()` on
  `tenant_lock_state` (returns `unlocked` only when the session holds the key
  AND `{id}.db` exists).
- **Enable keeps the working `.db`** (sealed on the next lock) — don't remove
  the plaintext on enable.
- **Titlebar lock / lock-on-close gate to the `main` window only** — the help
  window must never drive the vault lifecycle.
- **The `encrypted` flag lives in THREE places that must agree**: the registry
  (`tenants.json`), the folder marker (`business.json`), and the ground truth —
  whether `business.db.enc` exists. `set_tenant_encrypted` writes registry +
  marker; `open_tenant` and `list_tenants` infer from the blob and self-heal a
  stale `false`. Until v0.159.2 the marker was only ever written `false`, so
  Forget → Open (or moving the folder to another machine) registered an
  encrypted business as plain and walked straight into the empty-DB hazard.
  `ensure_tenant_db` now also refuses outright when it finds a blob with no
  working db (`guard_locked_vault`) — the backstop for a wrong flag.
- **`secure_remove` renames BEFORE it zero-fills.** On Windows a file the sqlx
  pool still holds open can be written but not renamed/deleted (SQLite opens
  without `FILE_SHARE_DELETE`). The old order (zero, then delete) left a
  same-length file of NULs behind when the delete failed, and `unlock_at`
  treated that leftover as "newest truth" over the good blob. Now a failed
  rename aborts with the plaintext untouched, and `unlock_at` only trusts a
  leftover that starts with the SQLite magic header (`looks_like_sqlite`).
  Test fixtures for a "leftover db" must therefore be SQLite-shaped
  (`sqlite_like()` in the vault_fs tests), and a Windows test that simulates
  the held-open file must pass `share_mode(READ | WRITE)` — Rust's default
  `File::open` grants delete-sharing and won't reproduce it.
- **Three columns store ABSOLUTE paths** — `document_attachments.file_path`,
  `company_settings.pdf_header_logo_path` and `logo_path` — in a folder that is
  supposed to be portable. `relocate_stored_paths` (tenants.rs) re-points them
  at the current folder on every `ensure_tenant_db`, only where the file
  actually exists at the derived location. It runs there, not in
  `open_tenant`, because an encrypted business has no db at Open time. If you
  add another path column, add it to that function — nothing else will.
- **Any file op on a business folder goes through a Rust command, never the fs
  plugin.** The plugin's scopes are `$APPDATA` / `$APPLOCALDATA` / `$HOME`;
  business folders live on any drive. `remove()` on a `D:\` path fails, and the
  failure was being swallowed, orphaning attachment files. See
  `remove_document_attachment` / `clear_document_attachments`.
- **`create_business_folder` sanitises the name itself** (`safe_folder_name`,
  a rule-for-rule mirror of `app/lib/safe-folder-name.ts`). Import-as-new
  passes the raw name from a backup manifest: unsanitised, `A/B` nested a
  directory, `CON` failed with a raw OS error, and `..\..\x` escaped the
  parent the user chose. Keep the two implementations in sync.
- **Tray Quit closes the main window; it does not `app.exit()`.** That routes
  it through the JS lock-on-close plugin, which closes the pool first. The
  app exits when the `main` window is destroyed (`on_window_event` in
  `lib.rs`), even if the help window is open.

---

## Google Drive backup (optional, opt-in)

Disaster recovery, not sync. The user connects **their own** Google Drive
("Sign in with Google" — we host nothing, it costs us nothing) and presses
**Back up now**; on another machine, welcome → **Restore from Google Drive**.
Spec/plan: `docs/superpowers/{specs,plans}/2026-09-19-google-drive-backup*`.

- **One-way push, explicit restore. No sync, no merge, no scheduler.** A
  reminder banner (`BackupReminderBanner.vue`, default layout) nudges when the
  last backup is older than `reminder_days` (1/7/14/30/off). Restoring on a
  second machine is a deliberate point-in-time copy — newest restore wins.
- **Module map** — `src-tauri/src/drive/`: `plan.rs` (pure: upload diff,
  snapshot naming, retention, attachment GC, `backup_key`), `state.rs`
  (`backup.json`), `snapshot.rs` (`VACUUM INTO`, sealing, zip, safe extract),
  `remote.rs` (`RemoteStore` trait + test-only `MemoryStore`), `backup.rs` /
  `restore.rs` (orchestration, written against the TRAIT so they are tested
  end-to-end with no network), `oauth.rs` (PKCE + loopback listener +
  keychain), `gdrive.rs` (Drive v3 REST — the only real `RemoteStore`),
  `mod.rs` (`DriveState` + the `drive_*` commands).
- **Drive layout mirrors the business folder** so a restore can be done by
  hand: `Sakoram Backups/<Business name>/{snapshots/<stem>.zip + .manifest.json,
  attachments/<type>/<id>/<uuid>.<ext>}`. The snapshot zip holds `business.db`
  (or `business.db.enc` + `business.vault.json`), `business.json`, `logos/*`,
  `pdf-header*` and `backup-manifest.json` — **not** attachments, which upload
  once each and are reused by later backups (diffed on size + Drive's native
  `md5Checksum`).
- **Lookup is by `appProperties`, never by name or folder walk**: `skKind`
  (`root` / `business` / `dir` / `file`), `skKey`, `skPath`. One paginated
  query lists a whole business. Drive caps each property at **124 UTF-8 bytes
  key+value** — `plan::fits_app_property` guards uploads, and device names are
  ASCII-sanitised to 20 chars for the same reason.
- **Upload order: attachments → sidecar manifest → zip LAST.** The zip is the
  commit marker; an interrupted run leaves no zip, is not a backup, and the
  retry re-uploads nothing. Retention keeps the 10 newest complete snapshots;
  everything removed goes to Drive **trash** (30-day recovery), never a
  permanent delete. Attachment GC is switched OFF entirely if any retained
  manifest is unreadable — never delete on incomplete knowledge.
- **Restore**: `fetch_snapshot` → `check_schema` (a backup from a NEWER app is
  refused before anything is written; older migrates forward) →
  `create_business_folder` → `materialise` (zip-slip-safe extract, then every
  attachment MD5-verified with one retry; failures are reported by path, never
  silent, never fatal) → `open_tenant`, which upserts the registry by marker id
  and leaves any existing folder untouched. `relocate_stored_paths` heals the
  absolute attachment/logo paths on the next `ensure_tenant_db`.
- **Per-machine state** is `%APPDATA%/com.sakoram.billing/backup.json`
  (`reminder_days`, `account_email`, `last_backups`). No tenant-DB column, no
  migration, no `SCHEMA_VERSION` bump.

**Landmines:**
- **Never on the window-close path.** `lock-on-close.client.ts` races the vault
  seal against a 5 s timeout; a network call there hangs quit. Backups snapshot
  a LIVE db via `VACUUM INTO` on their own connection instead.
- **The refresh token is keychain-only** (`keyring`, service
  `com.sakoram.billing.gdrive`). Not `tenants.json`, not `backup.json`, and
  never a business folder — those are portable and would carry the login along.
- **`backup_key = md5(tenant_id + "\n" + marker.created_at)` identifies a
  business on Drive, NOT the tenant id.** Ids are slugs of the business name;
  two businesses called the same thing share one.
- **Cloud backups carry the raw SQLite file, NOT the `data_io` JSON export.**
  `import_tenant_data` refuses a bundle whose `schema_version` differs from the
  running build — fatal for a recovery months later. `open_tenant` migrates.
- **Google credentials are `option_env!`** (`SAKORAM_GOOGLE_CLIENT_ID` /
  `_SECRET`, CI secrets on both release workflows). `build.rs` carries the
  `rerun-if-env-changed` lines — without them a changed secret silently doesn't
  rebuild. Absent/empty ⇒ `drive_status.configured = false` ⇒ the card, banner
  and welcome button all hide. For dev, export both in the shell that runs
  `bun run tauri:dev`. The Google OAuth consent screen must be **published to
  Production** — Testing-mode refresh tokens die after 7 days.
- **No `std::sync::MutexGuard` across an `.await`** in `gdrive.rs` / `mod.rs`
  (the command futures must be `Send`): id-cache access goes through
  `cached`/`remember`, and `drive_connect_finish` `take()`s the `PendingAuth`
  before awaiting.
- **Encrypted businesses**: the snapshot is sealed with the session DEK
  (`prepare_db` → `vault::encrypt_file` → `secure_remove` of the plaintext
  temp), so "Back up now" is disabled while locked. **Attachments are plaintext
  on Drive**, exactly as they are on disk — the vault only ever covered the db.
- **Error strings are an API.** `RemoteError`'s `Display` begins with a stable
  code (`DRIVE_OFFLINE` / `DRIVE_RECONNECT` / `DRIVE_QUOTA` / `DRIVE_NOT_FOUND` /
  `DRIVE_ERROR`, plus `DRIVE_CANCELLED` from `backup.rs`) that
  `app/lib/drive-errors.ts` maps to copy. `DRIVE_RECONNECT` also makes the
  command layer drop the dead keychain token. Keep both sides in sync.

---

## Licensing & feature tiers

> **The app is now FREE (since v0.130.0). No tiers, no trial, no gating.**
> `app/stores/license.ts` was neutered to report `tier = Premium`,
> `isTrial = false`, `businessLimit = ∞`, and `hasFeature`/`canCreateBusiness`
> always `true` — so every gated UI element (lock badges, `<FeatureLock>`,
> `<UpgradeButton>`, capped business creation) auto-hides with zero callsite
> edits. The **reachable** licensing UI is deleted: `/upgrade` page,
> `/settings/license` page, the License nav entry, the trial banner, and the
> About-modal tier line. Left **dormant** pending a follow-up cleanup PR:
> `src-tauri/src/license.rs` + `bin/mint_license.rs` + their crate deps,
> `app/lib/licensing.ts` (+ its unit test), and `FeatureLock` / `UpgradeButton`
> — none of these render or run once the store is neutered.
>
> **First-run Terms gate** replaces licensing as the only pre-use wall.
> `app/lib/terms.ts` (`TERMS_VERSION` + `hasAcceptedTerms`) + `useTerms()`
> composable store a versioned acceptance flag in localStorage
> (`sakoram.terms.acceptedVersion`, per-machine). `tenant.global.ts` redirects
> to `/terms` until accepted; the Terms are re-readable via the About modal.
> The disclaimer is a liability/as-is/backup-your-own-data notice — bump
> `TERMS_VERSION` to force everyone to re-accept after a material copy change.

The historical commercial 3-tier design (now dormant) — spec/plan:
`docs/superpowers/{specs,plans}/2026-06-04-licensing-tiers.*`.

- **Tiers:** Basic (free) < Plus < Premium. Fresh install = 30-day full
  **Premium trial** → then free **Basic**; a paid key unlocks Plus/Premium
  permanently (perpetual one-time purchase).
- **Keys = offline Ed25519-signed tokens.** `src-tauri/src/license.rs` holds
  the embedded **public** key + `validate()`; only the **private** key
  (off-repo at `~/.sakoram/license-signing.key`, gitignored `*.signing.key` /
  `*.lic`) can mint one. Forge-proof, but the client-side gate is an accepted
  soft deterrent (we don't fight binary patching). Buyer name/email embedded
  as a sharing deterrent.
- **Mint:** `scripts/mint-license.sh <plus|premium> "Name" email` (wraps the
  `mint_license` bin; auto-IDs + CSV ledger under `~/.sakoram`). Keypair via
  `cargo run --bin mint_license -- keygen`; paste the printed key into
  `EMBEDDED_PUBLIC_KEY` in `license.rs`.
- **Per-install, not per-tenant:** state lives in
  `{app_data_dir}/license.json` (`license_key` + `trial_start` +
  `last_seen_date` clock-rollback guard) — NOT a tenant DB, no migration.
  Delete it + restart the app to reset trial/license for testing.
- **`app/lib/licensing.ts` is the source of truth:** `Tier` enum, the
  **`FEATURES` feature→min-tier registry**, `hasFeature`, trial math, and
  `effectiveEntitlement` (**a valid license supersedes the trial** — a paying
  customer is never "on trial"). Pure + unit-tested. `app/stores/license.ts`
  loads it at startup (warmed in `tenant.global.ts`).
- **Gating (client-side, view-only on downgrade):** nav items carry an
  optional `feature` (lock badge in `default.vue`); `<FeatureLock>` /
  `<UpgradeButton>` banners + hidden create actions on paid pages (existing
  data stays viewable); `New*Modal` submits + higher-tier detail edits gated;
  Basic capped at 2 businesses (gates creation only). UI: `/upgrade` +
  `/settings/license`.

---

## Project layout

```
sakoram_app/
├─ CLAUDE.md                          ← this file
├─ package.json                       ← bun deps, scripts (dev, lint, test, tauri:build)
├─ nuxt.config.ts                     ← SSR off, head title, modules
├─ app/
│  ├─ app.config.ts                   ← global NuxtUI overrides: primary green / neutral zinc, uppercase + small button text, shadowed UCard, w-full inputs, cursor-pointer buttons
│  ├─ layouts/
│  │  ├─ default.vue                  ← TitleBar + floating sidebar + main content
│  │  └─ welcome.vue                  ← TitleBar + minimal centered content
│  ├─ assets/
│  │  ├─ css/main.css                 ← Tailwind + @font-face for the 6 bundled fonts; chrome user-select rules; thin scrollbars; DataTable theming tokens
│  │  ├─ fonts/                       ← static-weight TTFs per family (Regular/Medium/Bold) generated by scripts/instance-fonts.py
│  │  ├─ sakoram-icon.svg             ← square mark used in the titlebar
│  │  └─ sakoram-wordmark.svg         ← wide wordmark used in the welcome screen + About modal
│  ├─ pages/
│  │  ├─ index.vue                    ← Dashboard (KPI tiles + cashflow/expenses row + Upcoming calendar embed + receivables aging + recent activity + top clients). A range chip row (This month … Fiscal year / All time, persisted per business via useDashboardRange) drives the FLOW widgets — net-cash tile + the three charts; snapshot tiles (receivables/payables/open quotes/aging) always read "as of today". KPIs reload on every onActivated (keep-alive) AND on range change.
│  │  ├─ welcome.vue                  ← business picker (landing screen); demo-seed overlay while building
│  │  ├─ onboarding.vue               ← 4-step wizard after creating a new tenant
│  │  ├─ calendar.vue                 ← full-page month-grid view of every upcoming due-date (invoices / bills / quote expiries / payslips), with kind filter chips
│  │  ├─ clients/                     ← list w/ row context menu (View quotes/invoices), [id]
│  │  ├─ vendors/                     ← list, [id] (mirrors clients)
│  │  ├─ employees/                   ← list w/ row context menu, [id] (mirrors vendors + payroll fields)
│  │  ├─ categories/                  ← list w/ row context menu (Show bills) + bill counts — modal-driven CRUD
│  │  ├─ quotes/                      ← list w/ row context menu, [id] (PDF, convert to invoice — the dialog picks the invoice's issue date, due derives from it + payment terms; a converted quote offers "Revert to draft" which deletes the linked invoice, guarded on recorded payments). "New quote" opens NewQuoteModal — no /new page.
│  │  ├─ invoices/                    ← list w/ row context menu, [id] (PDF, payment ledger). "New invoice" opens NewInvoiceModal.
│  │  ├─ credit-notes/                ← list, [id] (negative-invoice document for refunds / returns; optional source_invoice_id link). "New credit note" opens NewCreditNoteModal. No PDF yet — follow-up PR.
│  │  ├─ recurring-invoices/         ← list, [id] (invoice TEMPLATES that materialise as draft invoices on a user-initiated cadence). "New recurring" opens NewRecurringInvoiceModal. Pending count + RecurringGenerateModal for bulk generation. No PDF — templates aren't issued documents.
│  │  ├─ bills/                       ← list, [id] (vendor-FK + snapshot). "New bill" opens NewBillModal.
│  │  ├─ recurring-bills/            ← list, [id] (vendor-side mirror of recurring-invoices — bill TEMPLATES that materialise as unpaid bills on a user-initiated cadence). "New recurring" opens NewRecurringBillModal. Pending count + RecurringGenerateBillsModal for bulk generation. Carries a CATEGORY picker (bills have categories, invoices don't); no bank, no project title. Generated bills land in status `unpaid` (not draft — bills don't have a draft state).
│  │  ├─ vouchers/                    ← list, new, [id] (money in/out; read-only by default → click Edit to mutate). Still uses a /new page — form is too heavy for a modal (8+ fields, prefill from ?bill=/?invoice=/?payslip=, overpayment guard).
│  │  ├─ reconcile.vue                ← bank reconciliation: import bank statement CSV, match rows to vouchers, create vouchers from unmatched. /reconcile route.
│  │  ├─ letters/                     ← list w/ row context menu, [id] (free-form rich-text letters rendered on the business letterhead — service letters, internship confirmations, etc.). "New letter" opens NewLetterModal. Rich text via TipTap (body_json); pre-printed toggle switches app-rendered letterhead vs blank top space. No lines, no snapshot, always editable. Duplicate-to-clone.
│  │  ├─ payroll/                     ← index.vue is a landing card grid (mirrors /reports); dashboard.vue holds the upcoming-cycle hero + MoM chart + recent runs + outstanding
│  │  ├─ payslips/                    ← list w/ row context menu (multi-select bulk PDF), [id], bulk (auto-issue + auto-pay). "New payslip" opens NewPayslipModal.
│  │  ├─ reports/                     ← aggregate views over the books. index.vue lists available + upcoming reports; profit-loss.vue (accrual P&L), vat.vue (output VAT vs input VAT), aged-receivables.vue (open-invoice snapshot by days past due), aged-payables.vue (open-bill mirror), and cash-flow.vue (receipts in − payments out by month, cash basis) are wired up. No DB writes.
│  │  ├─ lists/                       ← index.vue is a landing card grid (mirrors /reports + /payroll) linking to /clients, /vendors, /categories. The list pages themselves live at their existing top-level URLs.
│  │  ├─ help/                        ← in-app help library. /help index lists all topics grouped by category; /help/[slug] is the full-page reading view. Plain-English bookkeeping explainers tuned for SL businesses (LKR examples, IRD references, fiscal year April–March).
│  │  └─ settings/
│  │     ├─ index.vue                 ← redirect to /settings/company
│  │     ├─ company.vue               ← business info, address, bank, signatures, defaults, logo
│  │     ├─ pdf.vue                   ← PDF font + PDF header logo
│  │     ├─ appearance.vue            ← UI font, theme color (8-swatch), light/dark/system toggle, zoom (6 discrete steps)
│  │     ├─ payroll.vue               ← cycle template (period_start_day / period_end_day / pay_day)
│  │     ├─ letters.vue               ← manage letter_categories (name-only lookup) + pre-printed top/bottom margins (letter_preprinted_top/bottom_margin_mm) with a live A4 preview + letterhead-templates placeholder. (Signatures moved to /settings/company#signatures — they're shared across letters + quote/invoice "Prepared by".)
│  │     └─ businesses.vue            ← tenant CRUD + Export/Import
│  ├─ components/
│  │  ├─ TitleBar.vue                 ← custom titlebar — Windows: full chrome (sidebar toggle + back + drag region + min/max/close). macOS: 78px reservation for OS traffic lights + sidebar toggle + back; OS owns close/min/max. Pixel-pinned sizing so zoom doesn't scale it.
│  │  ├─ BreakpointBadge.vue          ← dev-only floating chip at bottom-right showing current Tailwind breakpoint + viewport width
│  │  ├─ ResizableDataTable.vue       ← shared wrapper around PrimeVue DataTable: drag-pan, sort/page state in localStorage, auto-fit columns, "Fit" page-size that adapts to viewport, right-click row context menu, multi-select checkbox column
│  │  ├─ ClientPicker.vue             ← UPopover with search
│  │  ├─ VendorPicker.vue             ← clone of ClientPicker, used by bill creation
│  │  ├─ EmployeePicker.vue           ← clone of VendorPicker, used by payslip creation
│  │  ├─ CategoryPicker.vue           ← bill-category dropdown w/ inline "+ New" modal
│  │  ├─ CategoryFormModal.vue        ← create/edit category (8-color × 16-icon picker)
│  │  ├─ CurrencyPicker.vue           ← onboarding + Settings → Business details currency dropdown. Built-in CURRENCIES list plus a "Custom currency…" option that reveals Code + Symbol inputs; emits both v-models so parents just bind code + symbol-override.
│  │  ├─ BusinessBankFormModal.vue    ← create/edit modal for managed bank accounts (label + bank fields + 8-swatch colour tag; new banks pre-pick the least-used swatch). Auto-marks the first bank as default so freshly-created accounts immediately seed new quotes / invoices.
│  │  ├─ BankColorDot.vue             ← the bank-account colour marker (business_banks.color → themeHex dot, grey fallback) rendered in front of bank identities everywhere
│  │  ├─ NewQuoteModal.vue            ← "New quote" form-in-a-modal (client + project title) — replaces /quotes/new
│  │  ├─ NewInvoiceModal.vue          ← "New invoice" form-in-a-modal — replaces /invoices/new
│  │  ├─ NewBillModal.vue             ← "New bill" form-in-a-modal (vendor picker) — replaces /bills/new
│  │  ├─ NewPayslipModal.vue          ← "New payslip" form-in-a-modal (employee + 3 dates + dup-period guard) — replaces /payslips/new
│  │  ├─ SectionCard.vue              ← header-with-icon card; used on company / client / vendor / employee edit pages
│  │  ├─ DateField.vue                ← UInputDate + UCalendar wrapper; ISO-string v-model + min/max with is-date-unavailable strikethrough. Renders shrink-to-content by default — pass class="w-full" when it sits in a row next to full-width inputs (heights already match; width is the only mismatch)
│  │  ├─ DateRangeField.vue           ← same idea, range mode (v-model:from / v-model:to)
│  │  ├─ DayOfMonthField.vue          ← 1–31 integer input + "Last day of month" toggle (used on payroll settings)
│  │  ├─ DocumentLineEditor.vue       ← bundle/itemized line-item editor for quotes/invoices/bills
│  │  ├─ PayslipLineEditor.vue        ← two-section earnings/deductions editor with live subtotals + net
│  │  ├─ MoneyInput.vue               ← integer-cents v-model
│  │  ├─ PasswordInput.vue            ← UInput wrapper with a show/hide eye toggle; v-model + @enter. Used by every password field (unlock, Security, onboarding, backup import).
│  │  ├─ PdfPreviewModal.vue          ← chromeless PDF preview (header sr-only, PDFium toolbar suppressed via #toolbar=0). iframe loads from a same-origin blob URL (built from the temp file via tauri-plugin-fs readFile) so the footer "Print" button can call contentWindow.print() without tripping same-origin policy.
│  │  ├─ PhoneUploadModal.vue         ← QR + LAN-server flow to attach a photo from a phone
│  │  ├─ AttachmentsCard.vue          ← shared attachments card (local + phone upload) for all document detail pages
│  │  ├─ StatusBadge.vue              ← color-coded status badges (no `primary` — theme-stable semantic colours only). min-w-24 + uppercase + tracking-wider so every badge sits at uniform width.
│  │  ├─ StatChip.vue                 ← joined-pill stat readout (filled label + outlined value). Used for the filtered-totals row above every list table.
│  │  ├─ LinkedBillField.vue          ← USelectMenu of open bills with status badge + remaining balance — used by the new-voucher form
│  │  ├─ LinkedInvoiceField.vue       ← same shape, open invoices
│  │  ├─ LinkedPayslipField.vue       ← same shape, unpaid payslips
│  │  ├─ SignaturePicker.vue          ← shared "insert a saved sign-off" popover for rich-text signature fields (quote/invoice "Prepared by" + letter Signature). Multi-line preview per saved signature (signaturePreviewLines), "Save current as new signature…", + a "Manage in Business details" link. Backed by useLetterSignaturesStore; owns its own ensureLoaded.
│  │  ├─ UpcomingCalendar.vue         ← month-grid view of every due-date event from useCalendarEvents. Two densities: "full" for the /calendar page, "compact" for the dashboard embed. Day-detail modal footer + per-cell right-click UContextMenu both expose a quick-create flow (Quote / Invoice / Bill / Voucher) routed through one `createForDate(kind, date)` helper that threads the picked date through as the new doc's issue_date (or voucher_date).
│  │  ├─ MonthlyCashFlowChart.vue     ← dashboard: 12-month receipts vs payments (drops to 6 months at lg / xl-expanded)
│  │  ├─ MonthlySalaryPaidChart.vue   ← payroll dashboard: 12-month salary-paid bars
│  │  ├─ ReceivablesAgingChart.vue    ← dashboard: outstanding invoices by days-past-due bucket
│  │  ├─ ExpensesByCategoryChart.vue  ← dashboard: bills donut by category, last 90 days
│  │  ├─ DriveBackupCard.vue          ← Settings → Businesses card: connect / disconnect Google Drive, reminder interval, per-business last-backup + "Back up now" (active business only). Hidden when the build has no Google credentials.
│  │  ├─ DriveBackupProgressModal.vue ← store-driven progress modal for backup (mounted once, in the default layout)
│  │  ├─ BackupReminderBanner.vue     ← "Last backup N days ago · Back up now · Later" banner in the default layout; shows only when Drive is connected, the business is unlocked and the backup is due
│  │  ├─ RestoreFromDriveModal.vue    ← welcome-screen restore flow: connect → pick business + snapshot → folder dialog → progress → "N of N attachments restored" → open
│  │  └─ TopClientsChart.vue          ← dashboard: top clients by invoiced revenue, last 12 months
│  ├─ composables/
│  │  ├─ usePdfPreview.ts             ← preview→commit flow used by every detail page that has a PDF button
│  │  ├─ useDocumentNumber.ts         ← editable sequence + live formatted preview + uniqueness check for the New* forms
│  │  ├─ useUiState.ts                ← localStorage-backed UI prefs: sidebarCollapsed, zoomLevel
│  │  ├─ useWindowState.ts            ← reactive isMaximized; subscribes to Tauri onResized
│  │  ├─ useActiveCurrency.ts         ← live ref of the active business's currency meta
│  │  ├─ useUserPlatform.ts           ← cached host platform via @tauri-apps/plugin-os — exposes isMac / isWindows / isLinux for platform-conditional UI (e.g. macOS titlebar layout)
│  │  ├─ useDragToScroll.ts           ← left-click-drag panning for the PrimeVue DataTable body. Listens on a stable wrapper and resolves the scroller per-mousedown so it survives DataTable remounts (auto-fit-columns triggers a remount).
│  │  ├─ useCalendarEvents.ts         ← aggregates due-date events from invoices / bills / quotes / payslips into a Map<YYYY-MM-DD, CalendarEvent[]>. Per-source emitters are easy to extend — just add another computed + push into the sources array.
│  │  ├─ usePageLoading.ts            ← per-page loading flag with a guaranteed rAF yield around the async work so list / detail pages actually paint a skeleton before stores load. Pair with ListPageSkeleton for content-shaped placeholders.
│  │  ├─ useCsvParser.ts              ← parseCsv(input) → { headers, rows } for bank reconciliation imports. Handles quoted fields, escaped quotes, CR/LF/CRLF, empty fields, UTF-8 BOM. Pure function, fully unit-tested.
│  │  ├─ useHelpWindow.ts             ← spawns / focuses the help WebviewWindow (single stable label `help-main` so clicking Help twice doesn't pile up windows). Emits `help:navigate` Tauri event when a slug is supplied so an existing window routes to that topic. Falls back to in-place router push outside the Tauri runtime.
│  │  ├─ useQueryTrigger.ts           ← one-shot `?new=1` route triggers that survive keep-alive (a watch on the query, not onMounted). Used by every list page's quick-create shortcut. See the keep-alive landmine.
│  │  └─ useRehydrateOnActivate.ts    ← re-hydrates a kept-alive detail page on every re-activation: skips the first activation, preserves dirty edits, bounces to the list when the row is gone. On every document + address-book detail page.
│  ├─ help/                           ← in-app help library. `index.ts` is the topic registry (slug, title, summary, category, icon, lazy component); one `.vue` per topic under `topics/`. See "Why help topics are Vue components" decision below.
│  ├─ lib/
│  │  ├─ db.ts                        ← getDb() (lazy, reads active tenant URL), select/execute
│  │  ├─ demo-seed.ts                 ← createDemoBusiness() — curated + bulk-fill at real-business volume: 200 clients / 150 vendors / 600 quotes / 800 invoices / 1000 bills / 400 standalone vouchers spread across ~18 months, 15 employees, 14 months of payslips, ~10 sample attachments. Takes 2-3 min; surfaces SeedProgress callback so the welcome page + Settings → Businesses can show a live stage label.
│  │  ├─ money.ts                     ← toCents, formatMoney/formatLKR, computeLineTotals (integer math). Plus the runtime currency registry: built-in CURRENCIES map + registerCurrency() / isBuiltinCurrency() helpers so user-defined currencies (slotted in by the settings store on load from company_settings.currency_symbol_override) work everywhere formatMoney does.
│  │  ├─ numbering.ts                 ← allocateDocumentNumber (single-statement atomic)
│  │  ├─ pdf.ts                       ← preview/commit/legacy export helpers; PdfCommand union
│  │  ├─ quote-pdf.ts                 ← shared payload builder; detail page + list-row Generate-PDF call this
│  │  ├─ invoice-pdf.ts               ← same shape as quote-pdf; takes paidCents for the paid/balance row
│  │  ├─ bill-pdf.ts                  ← same shape as invoice-pdf; "Bill from" party block, no bank, no prepared_by
│  │  ├─ voucher-pdf.ts               ← shared builder for the one-page voucher.typ template + resolveVoucherRelatedLabel helper for the linked-doc tag
│  │  ├─ payslip-pdf.ts               ← shared payload builder used by both payslip detail page and list-row Generate-PDF action
│  │  ├─ payroll-cycle.ts             ← resolvePayrollCycle + nextPayrollCycle: turn (year, month, settings) → ISO dates with clamping (31 = last day of month)
│  │  ├─ report-pdf.ts                ← PDF payload builders for every report page (P&L / VAT / aged receivables + payables / cash flow / sales-by-client / expenses-by-vendor / payroll register). All consumed by `export_report_pdf` against `src-tauri/templates/report.typ`.
│  │  ├─ statement-pdf.ts             ← customer statement PDF payload builder — point-in-time snapshot of one client's outstanding invoices with aging buckets. Fed to `export_statement_pdf` against `src-tauri/templates/statement.typ`. Ad-hoc, never archived.
│  │  ├─ dashboard-data.ts            ← SQL-side aggregates for the dashboard KPI tiles + charts. Pushes reduction into SQLite so first paint doesn't wait on ~3400 rows of snapshot JSON across the IPC bridge.
│  │  ├─ validation.ts                ← Zod schemas for UI ↔ DB boundary; currently settings + clients only.
│  │  ├─ date-parse.ts                ← parseStatementDate(raw, format) for bank reconciliation CSV imports. Supports YYYY-MM-DD / DD/MM/YYYY / DD-MM-YYYY / DD-MMM-YYYY with Date-roundtrip validation (Feb 31 → null). Pure function, fully unit-tested.
│  │  ├─ reconcile-match.ts           ← pure scored matcher used by bank reconciliation. ±1 day = 100, ±2 = 90, ±3 = 80; +20 for shared reference token. No Pinia / Vue deps so it's trivially testable.
│  │  ├─ document-guards.ts           ← pure lifecycle rules: `invoiceMutationBlocker` (receipts / issued credit notes pin an invoice), the credit-note FSM, and `assertEditable` (Golden Rule #5 enforced store-side). The stores do the SQL counting and hand the numbers here.
│  │  ├─ route-query.ts               ← `queryString` / `queryInt` / `withoutQueryKeys` — typed readers for vue-router query values.
│  │  ├─ recurring-schedule.ts        ← `advanceDate(iso, frequency, anchorDay?)` + `anchorDayOf`. The anchor (the template's start day) stops one short month permanently decaying a schedule (31st → 28th forever); a hand-typed day is still respected. Re-exported from the recurring_invoices store.
│  │  ├─ backup-reminder.ts           ← pure: `isBackupDue` / `daysSinceBackup` / `backupAgeLabel` + REMINDER_OPTIONS for the Google Drive backup reminder
│  │  ├─ drive-errors.ts              ← pure: maps the stable `DRIVE_*` error codes from src-tauri/src/drive to friendly copy (+ reconnect / cancelled flags)
│  │  ├─ load-once.ts                 ← `createLoadOnce(load, isLoaded)` — the shared-in-flight-promise rule behind `ensureLoaded()`. Use it; don't write `if (!loaded && !loading) await load()`, which lets a concurrent caller return with state still null.
│  │  ├─ licensing.ts                 ← tier registry (FEATURES) + hasFeature + trial math + effectiveEntitlement (license supersedes trial)
│  │  └─ theme.ts                     ← THEME_COLORS palette (name → hex)
│  ├─ middleware/
│  │  └─ tenant.global.ts             ← redirect to /welcome if no active tenant
│  ├─ plugins/
│  │  ├─ window-title.client.ts       ← syncs Tauri window title with active tenant
│  │  ├─ disable-context-menu.client.ts ← suppresses webview right-click on chrome (skips inputs / Shift bypass)
│  │  ├─ disable-file-drop-nav.client.ts ← preventDefaults document dragover/drop so a stray file drop can't navigate the webview
│  │  └─ apply-zoom.client.ts         ← writes the user's zoomLevel onto the root <html> font-size
│  └─ stores/                         ← Pinia composition stores
│     ├─ settings.ts                  ← company_settings (singleton, per-tenant)
│     ├─ clients.ts
│     ├─ vendors.ts
│     ├─ employees.ts                 ← payroll address book
│     ├─ bill_categories.ts           ← managed lookup powering CategoryPicker
│     ├─ business_banks.ts            ← managed list of business bank accounts (label + bank fields + is_default + archived). Atomic setDefault via single CASE-WHEN UPDATE. Quotes / invoices snapshot from here on save via buildSnapshotForId().
│     ├─ quotes.ts                    ← quotes + quote_lines, status FSM, pricing modes, date filters
│     ├─ invoices.ts                  ← invoices + invoice_lines. Payments live on vouchers; derivedStatus/paidCentsFor sum vouchers.related_invoice_id.
│     ├─ document_attachments.ts      ← scans / photos attached to any document (local file + phone upload)
│     ├─ bills.ts                     ← vendor_id FK + vendor_snapshot + category_snapshot. Payments via vouchers.related_bill_id.
│     ├─ payslips.ts                  ← payslips + payslip_lines, status FSM, derivedStatus/paidCentsFor sum vouchers.related_payslip_id.
│     ├─ vouchers.ts                  ← receipts/payments; carries related_invoice_id, related_bill_id, related_payslip_id, business_bank_id, reconciled_at
│     ├─ credit_notes.ts              ← negative-invoice document for refunds / returns; mirrors invoice shape with optional source_invoice_id link. Status FSM draft → issued → cancelled. Exposes `creditedCentsFor(invoiceId)` / `unappliedCreditFor(clientId)` / `linkedCreditNotes(invoiceId)` — the aggregates invoices, reports, statements and the dashboard read (issued-only).
│     ├─ recurring_invoices.ts        ← invoice TEMPLATES that materialise as draft invoices on a user-initiated cadence. generateOne(id) clones lines with recomputed totals and advances next_issue_date.
│     ├─ recurring_bills.ts           ← vendor-side mirror of recurring_invoices; generated bills land in status `unpaid` (not draft — bills have no draft state).
│     ├─ bank_statements.ts           ← imported bank statement rows + imports table. linkMatch / unlinkMatch run as two sequential auto-commits per the connection-pool caveat. suggestMatchesFor wraps the pure matcher in app/lib/reconcile-match.ts.
│     ├─ license.ts                   ← per-install entitlement store (tier/trial); loaded at startup via tenant.global.ts
│     ├─ drive_backup.ts              ← per-INSTALL Google Drive backup state (status / busy / progress) bridging the `drive_*` commands; works on the welcome screen with no active tenant
│     └─ tenants.ts                   ← bridges JS to Rust tenant registry
└─ src-tauri/
   ├─ Cargo.toml                      ← Rust deps (tauri 2.10, sqlx 0.8, zip 2, qpdf 0.3 vendored)
   ├─ tauri.conf.json                 ← productName, identifier, sidecars, capabilities, decorations: false (Windows-shaped)
   ├─ tauri.macos.conf.json           ← macOS overlay: decorations:true + titleBarStyle:"Overlay" so OS-drawn traffic lights stay visible while our custom titlebar paints behind them. Tauri 2 deep-merges this onto tauri.conf.json for macOS builds.
   ├─ capabilities/
   │  └─ main.json                    ← fs scopes, sql, dialog, window controls, shell-execute (typst arg validators)
   ├─ binaries/
   │  └─ typst-x86_64-pc-windows-msvc.exe   (gitignored, ~48 MB, target-triple naming required)
   ├─ fonts/                          ← same 6 families as app/assets/fonts (Typst reads from here). Statics-per-weight TTFs generated via scripts/instance-fonts.py — see "Why bundle fonts" decision below.
   │  ├─ Inter-{Regular,Medium,Bold}.ttf
   │  ├─ InterTight-{Regular,Medium,Bold}.ttf
   │  ├─ StackSansText-{Regular,Bold}.ttf
   │  ├─ MiriamLibre-{Regular,Bold}.ttf
   │  ├─ Amarna-{Regular,Bold}.ttf
   │  └─ Akt-{Regular,Medium,Bold}.ttf  ← default UI + PDF font since migration 0024
   ├─ migrations/                     ← see "Migrations" section below
   ├─ templates/
   │  ├─ document.typ                 ← unified Typst template for quotes/invoices/bills
   │  ├─ voucher.typ                  ← simpler one-page receipt layout
   │  └─ payslip.typ                  ← employee block + side-by-side earnings/deductions + net pay card
   └─ src/
      ├─ lib.rs                       ← entry point, plugin registration, command handler list
      ├─ tenants.rs                   ← tenant registry, per-DB migration runner, legacy migration
      ├─ pdf.rs                       ← export_*_pdf commands (quote/invoice/bill/voucher/payslip), copy_file, open_path
      ├─ phone_upload.rs              ← LAN HTTP server (axum) for phone→invoice photo uploads + import_invoice_attachment
      ├─ data_io.rs                   ← export_tenant_data / import_tenant_data (.zip bundles)
      ├─ drive/                       ← Google Drive backup & restore (plan / state / snapshot / remote / backup / restore / oauth / gdrive / mod) — see "Google Drive backup"
      ├─ license.rs                   ← Ed25519 license-key verify + license.json trial state + commands (per-install)
      └─ bin/mint_license.rs          ← local key-minting CLI (keygen + mint); NOT bundled into the app
.github/
└─ workflows/
   ├─ release-windows.yml             ← Windows MSI + NSIS build, triggered by tag push or manual dispatch. Also mirrors installers to Cloudflare R2 (when secrets configured).
   ├─ release-macos.yml               ← macOS Apple Silicon DMG + .app.tar.gz build, same triggers + R2 mirror.
   └─ publish-latest.yml              ← manual workflow_dispatch that points `sakoram/releases.json` in R2 at an already-uploaded build, per platform (windows/mac/linux). Builds nothing — it lists the version's R2 prefix to derive filename/size/upload-date, then merges one platform's entry into the manifest. Merge logic is the pure, unit-tested `scripts/release-manifest.mjs`. `latest.json` (the old flat manifest the website still reads) is deliberately left frozen — migrating the site to `releases.json` is separate work.
```

---

## How data flows (worth tracing once)

**Creating a quote**:
1. User clicks **New quote** on `/quotes` → `<NewQuoteModal>` opens.
   Pick a client + optional project title → store calls
   `allocateDocumentNumber("quote", today_iso)` (one atomic SQL).
2. Quote row inserted, modal closes, navigate to `/quotes/{id}`.
3. User edits items; `DocumentLineEditor` emits `LineDraft[]`.
4. On save: `replaceLines()` does DELETE + INSERTs (sequential
   auto-commits — see Connection pool caveat).
5. Marking sent: `setStatus("sent")` validates against
   `STATUS_TRANSITIONS` map and updates the DB. After this point the
   editor is mostly read-only.
6. PDF: `usePdfPreview` composable renders to a temp file under
   `app_local_data_dir/pdf-previews/`, shows in `PdfPreviewModal`,
   user clicks Save as → Rust `copy_file` to chosen path.

**Creating a payslip** (mirrors the quote flow):
1. User clicks **New payslip** on `/payslips` → `<NewPayslipModal>`
   opens. Pick employee (or arrive with `?employee=ID` preselect from
   the employees list), period (auto-snaps to month bounds), pay date
   (clamped to `[period_start, period_end]`).
2. Store allocates `PSL-YYYY-NNN`, snapshots the employee, seeds a
   single "Basic" earning equal to `employee.basic_salary_cents`.
3. `/payslips/[id]` shows the editor — user adds allowances / deductions
   in `PayslipLineEditor`.
4. **Mark issued** locks the form (only `notes` stays editable).
5. **Record payment** routes to `/vouchers/new?payslip=N`. Voucher
   form is prefilled (type / party / linked-doc locked, date /
   amount editable). Date min = payslip's pay_date.
6. Multiple partial vouchers per payslip are normal — `derivedStatus`
   moves the payslip through `unpaid → partial → paid` automatically.
7. `/payslips/bulk` — pick a period, get every active employee with a
   checkbox; Create iterates `createPayslip` for each.

**Upcoming due-dates calendar**:
1. `useCalendarEvents` reads invoices / bills / quotes / payslips
   stores. Per-source emitters filter out paid / cancelled rows and
   shape what's left into `CalendarEvent` objects keyed by ISO date.
2. `<UpcomingCalendar>` renders a 6×7 month grid (always rectangular
   thanks to leading/trailing days from adjacent months). Two
   densities: `full` for `/calendar`, `compact` for the dashboard
   embed.
3. Click a day → modal lists every event for that day with full
   context (kind, party, balance, overdue badge). Click an event →
   navigate to its detail page.
4. Overdue events override their kind colour to error red; a `!N`
   badge on the day cell surfaces overdue counts. Adding a new
   event source = add one computed in `useCalendarEvents` and push
   it onto the `sources` array.

**PDF rendering**:
1. JS builds a JSON payload (a `buildPdfPayload` per detail page; the
   payslip builder lives in `app/lib/payslip-pdf.ts` so the list-row
   "Generate PDF" action and the detail page share one shape).
2. Invokes the matching `export_*_pdf` Rust command. document.typ
   covers quotes/invoices/bills; voucher.typ and payslip.typ have
   their own templates.
3. Rust writes `data.json` + (optionally) `logo.{ext}` into a per-render
   work dir under `app_local_data_dir/pdf-work/`.
4. Spawns the typst sidecar:
   `typst compile --root <work_dir> --font-path <fonts_dir> <template> <output>`.
5. Sidecar arg validators in `capabilities/main.json` enforce shape.

---

## Setup, build, and dev commands

```bash
# First-time setup
bun install                              # bun is required (preinstall hook blocks others)

# Dev (Rust + Vite + Webview, hot reload)
bun run tauri:dev                        # background process; closes the window → exits
                                         # dev server runs on port 4004 (see gotcha below)

# Frontend-only
bun run dev                              # nuxt dev (no Tauri shell)

# Quality gates
bun run lint                             # eslint --fix
bun run test                             # vitest run
bun run verify:sql                       # applies all migrations to an in-memory
                                         # SQLite DB and runs the REAL shipped
                                         # query strings (see scripts/verify-derived-sql.ts).
                                         # Guards the derived-balance copies — vitest
                                         # can't, it only sees query strings.

# Production build
bun run tauri:build                      # outputs MSI + NSIS installers under
                                         # src-tauri/target/release/bundle/
bun run tauri:build:debug                # faster, with debug symbols
```

Installers land at `src-tauri/target/release/bundle/{msi,nsis}/`.

The build is **unsigned** — Windows SmartScreen will warn on first run.
Code-signing requires a CA cert (~$200–400/year), out of scope.

### Common gotchas

- **`.nuxt` directory missing or stale**: `rm -rf .nuxt && bunx nuxi prepare`.
- **Tauri capability changes** require a Rust rebuild (capabilities are
  baked in at compile time).
- **Tauri/JS plugin version mismatch** errors on `tauri:build`: the
  Rust crate and JS package must match on **major.minor**. If `tauri`
  bumps, `@tauri-apps/api` must follow.
- **Browser-testing a DB-free component** (no Tauri shell): plain
  `bun run dev` crashes at boot (window-title plugin calls Tauri APIs;
  tenant guard redirects everything). Recipe: temporarily add
  `if (!("__TAURI_INTERNALS__" in window)) return;` at the top of
  `app/plugins/window-title.client.ts`, early-return your scratch route in
  `app/middleware/tenant.global.ts`, drop a throwaway page under
  `app/pages/`, and hit it on the dev server (port 4004 — already running
  when `tauri:dev` is up, HMR picks the edits up). Revert all three after.
- **Background dev server exit code 255** = user closed the window. Not
  an error.
- **Dev server port lives in `scripts/tauri-dev.ts`, not `tauri.conf.json`.**
  `bun run tauri:dev` runs that script, which takes `DEFAULT_PORT` (4004),
  finds the next free port from there, and spawns `tauri dev` with a
  `--config` that overrides `build.devUrl` + `beforeDevCommand`
  (`bun run dev --port N`). So editing `tauri.conf.json`'s `devUrl` or
  `nuxt.config.ts`'s `devServer.port` alone has **no effect** on
  `tauri:dev` — change `DEFAULT_PORT`. (Those two configs only drive the
  standalone `tauri dev` / `bun run dev` paths, kept in sync at 4004.)
- **Page must have a single root node.** Vue/Nuxt warn loudly if a page
  has a leading template comment outside the root `<div>` — and the
  symptom on subsequent navigations is a blank/empty page after route
  transitions. Comments must live *inside* the root.
- **`cargo check`/`cargo test` "Blocking waiting for file lock on build
  directory"** = `tauri:dev` is already running; just wait. While it holds the
  lock, rust-analyzer may not auto-update `Cargo.lock` on a version bump — edit
  the `sakoram_billing` version line directly.
- **TS-server flags `.vue` imports in `app/help/index.ts` as "Cannot find
  module"** — false positive (Vue SFC resolution); `bun run lint` / the build
  are the source of truth.

---

## Key architectural decisions and why

### Why DB-per-business (not `business_id` columns)

Single-user app. Switching is a deliberate context change. DB-per-file:
- Zero changes to existing query code (no `WHERE business_id = ?` everywhere).
- Document number sequences naturally isolated.
- Backups are file-level (export = copy the SQLite + assets to a zip).
- Migrations apply per-DB cleanly.

### Why hard-reload on tenant switch

`window.location.assign("/")` wipes every Pinia store's in-memory state.
Manually `$reset`-ing each store is bug-prone (forget one, and stale
data leaks across tenants). The reload takes ~200ms in a webview —
imperceptible.

### Why we run our own migrations (not plugin-sql's)

`tauri-plugin-sql`'s `add_migrations(url, ...)` registers migrations at
build time keyed by URL. New tenants created at runtime get URLs the
plugin doesn't know about. We use sqlx directly in
`tenants::run_migrations()`, matching plugin-sql's `_sqlx_migrations`
table format so legacy DBs still work.

### Why the `--font-sans` CSS variable trick

NuxtUI / Tailwind v4 preflight sets `body { font-family: var(--font-sans) }`.
Setting `font-family` on `<html>` doesn't reach `<body>` (specificity).
Overriding `--font-sans` at `:root` cascades through the variable into
every element — including teleported overlays (popovers, modals,
calendar). See `app/layouts/default.vue`.

### Why root-`font-size` for UI zoom (not CSS `zoom` or `transform: scale`)

User-facing zoom levels (80, 90, 100, 110, 125, 150 %) are applied via
`document.documentElement.style.fontSize = '<level%>'`. Tailwind v4 +
NuxtUI 4 are almost entirely rem-based, so the whole interface scales
proportionally — fonts, paddings, icons, gaps, modals, teleported
overlays — in one shot. Avoids CSS `zoom` (subpixel artifacts, Firefox
quirks) and `transform: scale` (scrollbar / layout breakage).

The custom titlebar pins its sizing to **px arbitrary values**
(`h-[36px]`, `w-[44px]`, `text-[12px]`, `size-[16px]`) so it sits out
of the rem cascade and stays at its reference size regardless of zoom.
PDFs are unaffected — Typst is fixed-layout.

The plugin lives at `app/plugins/apply-zoom.client.ts` (not in a layout)
so it covers welcome and survives layout transitions.

### Why a custom titlebar

`tauri.conf.json` sets `decorations: false` on the main window
(Windows-shaped). The native chrome is replaced by
`app/components/TitleBar.vue`, which:

- Has `data-tauri-drag-region` on the bar so the OS handles dragging
  and double-click-to-maximize.
- Hosts the sidebar collapse toggle and **global back button** (left,
  back arrow uses Vue Router's `window.history.state.position`
  counter to disable cleanly at the landing entry), Sakoram mark +
  window title (centre), and minimize / restore-maximize / close
  buttons (right, **Windows only**).
- Uses `useWindowState` (subscribes to `onResized`) for the reactive
  `isMaximized` flag so the maximize icon flips to "restore" while
  maximized.
- Pixel-pinned sizing so zoom doesn't scale it (see above).

**Per-platform adaptation:** `useUserPlatform` (wraps
`@tauri-apps/plugin-os`) reports the host; the titlebar branches on
`isMac`:

- **Windows** (default): 36px tall, custom min/max/close cluster on
  the right.
- **macOS**: 28px tall (system small-toolbar convention), 78px left
  reservation strip for the OS-drawn traffic lights, no right-side
  cluster — the OS owns close/min/max. Tighter 36px button cells on
  the left so the sidebar toggle + back button fit the shorter bar.

The macOS look-and-feel is wired via `src-tauri/tauri.macos.conf.json`
— a platform overlay that flips `decorations: true` + sets
`titleBarStyle: "Overlay"`, which makes the system titlebar
transparent while keeping the traffic lights visible. Tauri
deep-merges that file onto `tauri.conf.json` for macOS builds.

Capabilities the titlebar needs: `core:window:allow-start-dragging`,
`allow-minimize`, `allow-toggle-maximize`, `allow-is-maximized`,
`allow-close` — all listed in `capabilities/main.json`.

### Why disable the webview's default context menu

A right-click anywhere outside an `<input>` / `<textarea>` /
`[contenteditable]` would show the browser's "Reload / Inspect"
context menu — instantly outs the app as a webview. The
`disable-context-menu.client.ts` plugin captures `contextmenu` at the
document level and `preventDefault`s on chrome. Inputs are skipped so
the user keeps cut / copy / paste / spellcheck. **Shift + right-click**
bypasses the suppression so 'Inspect element' is still reachable
during development without flipping a build flag.

Custom per-element context menus (e.g. row right-click) just register
their own `contextmenu` handler — it runs first via bubbling, opens
the custom menu, calls `preventDefault`. The document-level handler is
a harmless no-op afterwards.

### Why `dragDropEnabled: false` on the window

Tauri 2 windows default to `dragDropEnabled: true`, which makes the
native layer intercept OS file drops — the webview never sees an HTML5
`drop` event, so the logo upload drop zones (PDF header, company
identity logo) silently don't work. We don't use Tauri's native
drag-drop API anywhere, so the window sets `dragDropEnabled: false`
and the webview handles drops natively.

The trade-off: a webview navigates to any file dropped on the page,
so a stray miss would replace the whole UI. The
`disable-file-drop-nav.client.ts` plugin `preventDefault`s document
`dragover` / `drop` so a miss does nothing. Real drop zones register
their own `drop` handler — it runs first in the bubble chain and reads
the file; the document-level guard is a no-op afterwards.

### Why row context menus use `UContextMenu` with as-child trigger

Reka UI's `<ContextMenuTrigger as-child>` (which `UContextMenu` uses
when its default slot is populated) means the trigger element passes
through — no wrapper `<div>` between `<tbody>` and `<tr>`. Valid HTML,
no layout breakage. Wrapping each row that way gives right-click → the
same `itemsFor(row)` callback the overflow ⋯ button consumes — so any
new action lands in both menus automatically. The pattern is on the
quotes, invoices, payslips, employees, clients, and bill-categories
list pages — see `app/pages/payslips/index.vue` for a reference.

### Why no text selection on chrome

Sidebar labels, button text, the titlebar title — none of those should
be drag-selectable. `app/assets/css/main.css` applies `user-select: none`
to `button`, `a`, `[role="button"]`, `[role="tab"]`, `[role="menuitem"]`,
and anything inside an element marked `.app-chrome` (e.g. the floating
sidebar).

Beyond chrome, most **list, dashboard, and settings pages opt their
whole root out of selection** with a `select-none` class — they're
surfaces for navigating and configuring, not for copying text out of.
To keep form editing usable, `main.css` has a companion rule that
forces `input` / `textarea` / `[contenteditable]` back to
`user-select: text`, so drag-select and double-click-a-word still work
inside a `select-none` page. A leading template comment must stay
*inside* the root `<div>` — see the single-root-node landmine.

### Why the PDF preview uses a blob URL (not asset://)

We render once to `app_local_data_dir/pdf-previews/{slug}.pdf`. **The
iframe doesn't bind directly to the asset URL** — Tauri's
`convertFileSrc()` returns an `asset://` URL that's *cross-origin* to
the renderer (different origin in dev and in prod), and the modal's
**Print** button needs `iframe.contentWindow.print()` to work, which
same-origin policy blocks across origins.

Workaround: the modal reads the temp file's bytes via
`@tauri-apps/plugin-fs` `readFile`, wraps them in a `Blob` with
`type: "application/pdf"`, and creates a `URL.createObjectURL()` blob
URL. Blob URLs inherit the renderer's origin → `contentWindow.print()`
reaches into the iframe and pops the OS print dialog. The blob is
revoked on close / unmount / re-render to release memory.

The modal also drops PDFium's built-in toolbar via the
`#toolbar=0&navpanes=0` fragment, and the UModal's own title bar is
hidden via `ui.header: 'sr-only'` — the result is a chromeless
preview that fills the modal. Footer keeps **Cancel · Print · Save
as…** explicit. Save-as copies the temp via the Rust `copy_file`
command — zero re-render on save.

Detail/list pages thread `:temp-path="pdf.state.tempPath"` into
`<PdfPreviewModal>` (alongside the legacy `assetUrl` prop, kept for
back-compat / debugging but no longer consumed by the iframe).
`fs:allow-read-file` already permits `$APPLOCALDATA/**` so no
capability change is needed.

### Why `DateField.vue` exists

`UInputDate` + `UCalendar` v-model on `CalendarDate` from
`@internationalized/date`. The whole codebase stores dates as ISO
strings (DB, store types, PDF payloads). `DateField` wraps both
components, converts ISO ↔ `CalendarDate` in one place, and exposes
optional `min-value` / `max-value` (also ISO strings) for the
constrained date pickers on payslip period / pay date and salary-payment
voucher dates.

### Why `tenants.json` instead of a tenants DB

The registry is small (~10 entries max in practice). JSON avoids:
- a separate migration system for the registry itself
- a chicken-and-egg "which DB do we open to read the tenants?" problem

### Why bundle the Typst binary instead of generating PDFs in JS

Deterministic typography across machines, far higher quality than
`window.print()`, font-path control, native PDF output. ~48 MB sidecar
is acceptable for a desktop app.

### Why bundle fonts (and which ones)

The app must work offline and look the same on every machine. Naming
a font in CSS that isn't installed locally silently falls back to
system-ui — defeats the point of having a chosen font. Same hazard
for Typst's font-path lookup.

Ten families ship in two places. Each family is **multiple static-weight
TTFs** (Regular + Bold, plus Medium for the sans-serif body fonts) rather
than a single variable file: Typst 0.14 only renders the default weight
from a variable TTF unless it has STAT-named instances at every weight
(which most Google Fonts variable files don't), so a "bold" request on
a variable-only bundled font would silently fall back. Statics fix that
— Typst indexes each `<Family>-<Style>.ttf` as a separate face of the
shared family name and selects the right one for each weight request.

| Family | Weights bundled | License |
|---|---|---|
| Akt | Regular / Medium / Bold | OFL. **Default** for both UI and PDF (since migration 0024). Geometric sans from Google Fonts. |
| Inter | Regular / Medium / Bold | OFL. Previous default, kept as the universal fallback in font cascades. |
| Inter Tight | Regular / Medium / Bold | OFL. Tighter sibling — useful for invoice headers. |
| Stack Sans Text | Regular / Bold | OFL. Extra bundled choice. |
| Miriam Libre | Regular / Bold | OFL. |
| Amarna | Regular / Bold | OFL. Decorative-leaning sans. |
| Geomini | Regular / Medium / Bold | OFL. Geometric sans (fontbob, added to Google Fonts 2026-05). **Its variable default is ExtraLight (wght 200), not 400** — the JOBS entry pins each weight explicitly, so don't "simplify" it to rely on axis defaults. |

**Licensing.** Every bundled family is **SIL OFL 1.1**, which requires the
copyright notice and licence to accompany the fonts in *all* copies —
redistribution triggers it, not sale, so shipping them in a free app does
not exempt us. Two artefacts satisfy that and must stay in sync with the
font set:

- `src-tauri/fonts/OFL.txt` — all ten copyright blocks + the full licence
  body. Bundled automatically by the `fonts/*` resources glob.
- `app/lib/font-licences.ts` — the same attribution, structured, rendered
  under **About → Fonts & licences**. Values are transcribed from each
  TTF's own name table (IDs 0 / 9 / 11), which is authoritative for the
  exact cut we ship.

`font-licences.test.ts` fails if `FONT_LICENCES` and `BUNDLED_FONTS` drift
in either direction — bundling a font without attribution is a compliance
failure *and* a silent one, so it has to break the build.

The statics are generated from upstream variable files via
`scripts/instance-fonts.py` (run with `uv run scripts/instance-fonts.py`
— the script's PEP 723 header resolves fontTools into an ephemeral env,
no global install required). Add a new family by dropping the variable
TTF into `src-tauri/fonts/`, appending a `JOBS` entry, and re-running. The
script pins **every** axis to its default (not just `wght`), so multi-axis
variable fonts (e.g. Martian Mono's `wdth`) instance to true statics — a
partially-pinned font keeps an `fvar` and Typst then renders bold at the
regular weight. Verify a new font's bold with
`typst fonts --font-path src-tauri/fonts --variants` (both 400 + 700 indexed,
no `fvar`). Some Google Fonts ship static per-weight files already (Iosevka
Charon Mono), others variable (Martian Mono, Google Sans Code) — check
`gh api repos/google/fonts/contents/ofl/<family>`. Bundled **monospaced**
families (Iosevka Charon Mono, Martian Mono, Google Sans Code) are offered for
figure-aligned numbers; the UI/PDF font pickers split bundled fonts into a
"Monospaced" sub-section and render each chip in its own face.

`app/assets/fonts/*.ttf` — referenced from `app/assets/css/main.css`
via `@font-face` (one declaration per weight, `format("truetype")`),
hashed and emitted by Vite into `_nuxt/`. `src-tauri/fonts/*.ttf` —
picked up by Typst via `--font-path` (set in `pdf.rs`), bundled into
the installer via `tauri.conf.json`'s `bundle.resources` glob
(`fonts/*` — adding a font to the directory auto-bundles it).

UI font and PDF font are independent (`company_settings.ui_font` and
`company_settings.pdf_font`). The Typst template reads
`data.font_family` from the per-render JSON payload, then falls back
through the bundled families for any missing glyph.

### Why icons are bundled (not fetched at runtime)

NuxtUI / `@nuxt/icon` defaults to fetching SVGs from the Iconify API.
We're a desktop app expected to work offline — that fails. Fix:
`@iconify-json/lucide` as a dev dep + `icon.clientBundle.scan: true`
in `nuxt.config.ts`. Vite scans templates and inlines only the icons
actually used (~70 icons). Zero runtime network dependency.

### Why help topics are Vue components, not Markdown

The in-app help library (`app/help/`) renders contextual bookkeeping
explainers — what a credit note is, when to use it, how it maps to
Sakoram's UI. Three serious options were on the table:

| Approach | Pros | Cons |
|---|---|---|
| `@nuxt/content` Markdown | conventional, easy editing | adds a heavy module + MDC parser; another build step |
| Plain Markdown + `markdown-it` | lighter dep, simple | still need a parser at runtime; HTML extension points awkward |
| **Vue components (chosen)** | native, no parser, full styling control, embed `<NuxtLink>` to app pages, reuse Tailwind tokens | less convenient for non-coder editors |

The clinching trade-off was **deep linking into the app**. A help
topic about credit notes naturally wants to say "go to
`/credit-notes` and click New credit note" with that path being a
live `<NuxtLink>`. Same for "see the VAT report" or "open your
business defaults at `/settings/company`." With Markdown those have
to round-trip through a custom MDC component or `[link](path)`
post-processing; with a `.vue` topic they're plain JSX-ish template
syntax with full IDE support.

Topics live under `app/help/topics/` with one `.vue` per topic.
`app/help/index.ts` is the registry — adding a topic is "drop the
component, append one row to `HELP_TOPICS`." Each component uses
two shared primitives:

  - **`HelpSection`** — titled section with optional icon
  - **`HelpCallout`** — coloured callout boxes for tips / warnings /
    info / SL-tax notes (`variant="tip|info|warning|tax"`)

Topics are surfaced through two parallel UI surfaces, both backed by
the same `HelpTopicView` renderer:

  - **`HelpButton`** + **`HelpModal`** — drops a `?` icon on any
    page header that opens an in-context modal for quick reference.
    The modal's footer has an **"Open in docs window"** button that
    escalates to the dedicated WebviewWindow.
  - **The docs window** — `/help` and `/help/[slug]` routes always
    use the `help-window` layout (no main-app chrome, custom
    `HelpSidebar` for topic navigation, sticky `HelpTopicNav` TOC).
    These routes are not navigated to from inside the main app —
    they live exclusively inside the spawned WebviewWindow.

**The docs window architecture:**

  - `useHelpWindow` composable owns the spawn. Uses a single
    stable label `help-main` so only one help window can be open
    at a time — clicking "Help" again focuses the existing window
    rather than piling up duplicates. When the spawner asks to
    navigate to a specific slug, it emits a `help:navigate` Tauri
    event; the `help-window` layout has a listener that calls
    `router.push` on the existing window.
  - **Capability config** (`src-tauri/capabilities/main.json`): the
    main window has `core:webview:allow-create-webview-window` so it
    can spawn. The windows array includes `help-main` (and the
    wildcard `help-*` is kept too, harmlessly, in case we ever
    re-enable multi-window).
  - **Sidebar Help entry** uses the nav item's `action` field
    (instead of `to`) to call `openHelpWindow()` directly — there's
    no in-app navigation to `/help`, so we don't render the
    sidebar item as a NuxtLink.
  - Dev fallback: outside the Tauri runtime (`bun run dev` without
    the shell), `openHelpWindow` falls back to `router.push("/help")`
    so dev iteration still works without spawning real windows.

Trade-off acknowledged: external links inside topic prose (e.g.
"go to /invoices" inside the credit-notes topic) navigate the docs
window away from `/help/*` to whatever URL they point at — the
docs window then renders that page with the help-window layout,
which looks empty (no sidebar, no app chrome). Inter-window
communication for "main window navigates, docs window stays" is a
future improvement; v1 users either avoid those links or close
the window and re-open from Help.

### Global UI tokens via `app/app.config.ts`

NuxtUI 4 takes a `ui.<component>.slots` config that applies classes
to every instance of a component app-wide. We use it for the
typographic and visual rhythm that would otherwise be sprinkled
across every page:

- `ui.button.slots.base: "cursor-pointer uppercase tracking-wide
  !text-xs"` — every UButton renders **uppercase**, with light
  letter-spacing, at 12px (one step below the per-size variant's
  default text-sm). Uppercase glyphs hit cap-height on every letter
  so 12px sits at roughly the optical weight of mixed-case text-sm
  body. The `!` important modifier is needed because each size
  variant (md → text-sm) would otherwise win.
- `ui.card.slots.root: "shadow-md shadow-black/10"` — every UCard
  picks up the same softened drop shadow as the floating sidebar.
  Tailwind-merge overrides UCard's default `shadow-sm`.
- `ui.formField.slots: { root: "w-full", hint: "select-none",
  description: "select-none", help: "select-none" }` — form fields
  always span their container; helper text doesn't drag-select like
  data would.
- `ui.input.slots.root` / `ui.textarea.slots.root` → `w-full`.
- `ui.modal.slots.title` / `ui.modal.slots.description` → `select-none`
  so the modal header / supporting text stops drag-selecting (matches
  the rest of the chrome). Form inputs inside the body still pick up
  `user-select:text` via the global rule in main.css.
- `ui.colors: { primary: "green", neutral: "zinc" }` — the source of
  the app's accent. Settings → Appearance overrides it at runtime via
  `applyPrimaryColor()` in `app/lib/color-ramp.ts`, which every accent
  call site routes through (the `default.vue` settings watcher and the
  Appearance live preview). Two paths:
  - **A named preset** sets `appConfig.ui.colors.primary`, which is what
    NuxtUI is built for — it emits a `:root` block mapping
    `--ui-color-primary-{50..950}` onto the Tailwind palette and derives
    `--ui-primary` from shade 500 (light) / 400 (dark).
  - **A custom hex** can't use that path: NuxtUI needs all eleven steps,
    not one colour. `buildPrimaryRamp()` synthesises them in OKLCH —
    taking only the input's hue and chroma and forcing Tailwind's
    lightness curve, so a near-white or near-black pick still lands at a
    readable 500 lightness — and writes them as **inline styles on
    `<html>`, with `!important`**. Inline already outranks any selector,
    but a plain declaration still loses to an `!important` in NuxtUI's
    own `:root` block; NuxtUI doesn't use one today, but a future release
    could, which would silently kill every custom colour. Inline +
    important is the top of the author cascade, so it can't.
    `--ui-primary` re-derives automatically, so light and dark both work
    with no extra branch. Switching back to a preset must clear those
    inline properties or they keep winning (`removeProperty` clears them
    regardless of priority).
  - The residual risk is NuxtUI **renaming** these variables: our writes
    would become no-ops nobody reads and the accent would quietly stay on
    the last preset. `!important` can't help, so `assertRampApplied()`
    reads `--ui-primary` back after applying and `console.warn`s when it
    isn't one of the values just written — dev-only (`import.meta.dev`),
    and deliberately does NOT auto-revert, because if it fires we don't
    know what the right colour is.

  Note `bg-primary` compiles to `--color-primary`, which tracks shade
  **500** in both modes, while `--ui-primary` tracks 400 in dark. Both
  read from the same ramp, so a custom accent flows to both.

`<UApp :toaster="{ position: 'top-center' }">` in `app/app.vue`
pushes every toast to top-centre — keeps them out of the way of the
sticky save bar pinned bottom-right on every detail / settings page.

When a future component-wide rule is needed (e.g. "all USelect get a
border radius nudge"), drop it here rather than chasing per-call
classes. The exception is **`StatusBadge`** — that's a thin wrapper
around UBadge with its own min-w + uppercase + tracking, kept as a
component because the colour-by-status logic doesn't belong in
config.

### Address-book detail pages share one hero pattern

Employees, clients, and vendors all use the same detail-page hero
shape (`app/pages/{employees,clients,vendors}/[id].vue`):

```
[avatar]  Name + status badge                         [View … · Archive · Delete]
          chip · chip · chip · chip                   (or ⋯ dropdown below lg)
```

- **Avatar**: 80px circle, `bg-(--ui-primary)/15`, initials in
  primary colour (`text-2xl font-semibold`). Falls back to
  `i-lucide-user` (employee), `i-lucide-user-round` (client), or
  `i-lucide-store` (vendor) when no initials are available.
- **Right cluster**: `hidden lg:flex` inline buttons at lg+, swaps
  to a `lg:hidden` `⋯` `UDropdownMenu` trigger below. Both paths
  share the same handlers via a `actionMenuItems` computed declared
  at the end of the script so its handler references are in scope.
  Items grouped so the menu draws a separator between View+Archive
  and Delete; Delete row carries
  `class: "text-(--ui-error) hover:bg-(--ui-error)/10 [&>span>span:first-child]:text-(--ui-error)"`
  to tint the icon + text in error tone.
- **Cross-doc shortcuts** — View payslips / View quotes+invoices /
  View bills — set the destination store's `…Filter` field, clear
  the other filters on that store, then `router.push`. Matches the
  same-named row actions on each list page.
- **Hard delete**: each store gained a `remove(id)` method that does
  `DELETE FROM <table> WHERE id = ?`. The FK on related rows is
  RESTRICT / NO ACTION (payslips → employees, quotes+invoices →
  clients, bills → vendors), so SQLite blocks the delete once
  history exists. The page handler catches the constraint error
  with `/foreign key|constraint|RESTRICT/i.test(raw)` and surfaces
  a friendly warning toast nudging the user toward Archive instead
  of dumping the raw SQL error.

Document detail pages (quote / invoice / bill / voucher / payslip)
don't share the avatar but follow the same right-cluster collapse
pattern: inline header buttons from lg+ that swap to a `⋯` dropdown
below. Quote and invoice headers carry an `actionMenuItems` computed
that flattens primary actions + transition actions + a destructive
Delete into the dropdown.

### Why the light theme uses a paper palette (not pure white)

Pure-white surfaces feel clinical for an app you stare at for hours
of bookkeeping. The light-mode override under `html:not(.dark)` in
`main.css` swaps `--ui-bg` and its lifted variants for a warm cream
(`#fbf7ee` page bg, `#f4efe2` cards, `#fffefa` popovers,
`#ede6d5` hover). Borders shift to a matching warm tone so they
don't fight the cream. Dark mode keeps NuxtUI's stock zinc — it
already reads well.

The picker on `/settings/appearance` uses `useColorMode()` from
`@nuxtjs/color-mode` (transitive of `@nuxt/ui`), with three values:
`system` (default — follows the OS), `light`, `dark`. Preference is
per-machine (localStorage), not per-tenant — doesn't ride the export
bundle.

---

## Schema overview

See `src-tauri/migrations/` for the source of truth. High-level:

- `company_settings` — singleton (`id=1` CHECK), per-tenant. Includes
  `ui_font`, `pdf_font`, `theme_color`, `currency_code`,
  `pdf_header_logo_path`, fiscal-year start, and the **payroll cycle
  template**: `payroll_period_start_day`, `payroll_period_end_day`,
  `payroll_pay_day` (1–31 integers, clamped to month length at
  runtime — 31 ≡ last day of month). Resolved via
  `app/lib/payroll-cycle.ts`. Also holds **PDF protection**:
  `pdf_protect_password` (owner password; null/empty = off) and five
  `pdf_protect_{quote,invoice,bill,voucher,payslip}` 0/1 flags.
- `clients` — id, name, contact info, archived flag.
- `vendors` — same shape as `clients`. Address book for the bills side
  of the ledger.
- `employees` — payroll address book. Same identity / contact /
  archive shape as vendors plus payroll fields: `employee_number`
  (nullable, no UNIQUE), `nic`, `designation`, `joining_date`,
  `basic_salary_cents`, and a per-employee bank-payment block
  (`bank_name`, `bank_branch`, `bank_account_number`,
  `bank_account_name`).
- `bill_categories` — small managed lookup (`name` UNIQUE, `color`
  swatch name, `icon` Lucide name, archived flag). Powers
  `CategoryPicker` on the bill page.
- `document_counters` — `document_type` → `last_number` (one row per
  type, no fiscal year since migration 0047), for atomic continuous
  allocation.
- `quotes` + `quote_lines` — `pricing_mode` ∈ {bundle, itemized},
  `status` FSM, `client_snapshot` (JSON), `bank_details_snapshot`
  (JSON, frozen at issue), `converted_invoice_id` link.
- `invoices` + `invoice_lines` — clients we've billed. **No
  `paid_cents` column** — removed in migration 0014. **No
  `invoice_payments` table** — also dropped in 0014. Payments live on
  the voucher ledger; `vouchers.related_invoice_id` links each
  receipt voucher back to its invoice. The persisted `status` only
  stores the user's explicit decision (`draft` | `sent` | `cancelled`);
  the user-visible draft / sent / partial / paid / overdue state is
  **derived** in JS from the sum of linked receipt vouchers +
  `total_cents` + today vs `due_date`. See `app/stores/invoices.ts`:
  `derivedStatus()`, `paidCentsFor()`, `linkedPayments()`. Cancelling
  an invoice with recorded receipts is refused at the store level
  (`setStatus("cancelled")` throws); delete the receipt vouchers
  first.
- `credit_notes` + `credit_note_lines` — negative-invoice document for
  refunds / returns (migration 0029). Mirrors the invoice shape:
  `client_id` FK + `client_snapshot` + denormalised `client_name`,
  `project_title`, `vat_rate_basis_points`, subtotal / tax / total cents.
  `source_invoice_id` (nullable FK, ON DELETE SET NULL) links the credit
  to the invoice it settles. Status FSM `draft | issued | cancelled` —
  **only `issued` counts anywhere**. A linked issued credit note reduces
  that invoice's derived balance alongside receipt vouchers; an unlinked
  one reduces the client's total as an "unapplied credit". Reversals of
  output VAT / P&L income land in the period of the CREDIT NOTE's own
  `issue_date`, not the original invoice's. No PDF template yet.
- `business_banks` — managed list of the business's own bank accounts
  (label + bank fields + `color` swatch + `is_default` + archived,
  migrations 0023 / 0048). Replaced the single bank block that used to
  live on `company_settings`. Quotes / invoices snapshot from here into
  `bank_details_snapshot` at save time, and carry an informational
  `business_bank_id` FK; vouchers carry one too for per-bank
  reconciliation scoping. `setDefault` is a single atomic CASE-WHEN
  UPDATE. Rendered with `BankColorDot.vue` wherever a bank is named.
- `letters` — free-form rich-text correspondence on the business
  letterhead (migration 0040). No lines, no party snapshot, no money,
  and **always editable** (the issued-documents-are-immutable rule does
  not apply). `number` is a NON-UNIQUE, editable, clearable reference —
  letters are deliberately not gapless-numbered. `body_json` and
  `signature_json` hold TipTap ProseMirror documents; `pre_printed`
  (0/1) swaps app-rendered letterhead for reserved blank top/bottom
  space sized by `company_settings.letter_preprinted_{top,bottom}_margin_mm`.
- `letter_categories` — name-only managed lookup (migration 0041) behind
  the letter Category picker. The letter stores `category` as plain
  text, so archiving or deleting a category never rewrites past letters.
- `letter_signatures` — reusable rich-text sign-offs (name + `body_json`
  + `is_default`, migration 0045). Applying one COPIES its `body_json`
  into the letter's own `signature_json` — no FK, so letters stay
  self-contained. At most one `is_default` (atomic CASE-WHEN, same shape
  as `business_banks`). Shared by letters AND the quote / invoice
  "Prepared by" field via `SignaturePicker.vue`.
- `bills` + `bill_lines` — vendor bills. `vendor_id` FK → `vendors`
  with a `vendor_snapshot` JSON copy frozen at creation time;
  `category_id` FK → `bill_categories` with a `category_snapshot` JSON
  copy. **No `paid_cents` column** — removed in migration 0013.
  Payments via `vouchers.related_bill_id`. Persisted `status` is
  `open | cancelled`; user-visible unpaid / partial / paid / overdue
  state is **derived** in JS the same way invoices work. Cancelling a
  fully-paid bill is refused at the store level — payment vouchers
  must be deleted first.
- `payslips` + `payslip_lines` — per-employee, per-period pay records.
  `employee_id` FK + `employee_snapshot` (JSON, frozen at create).
  `UNIQUE (employee_id, period_start)` enforces "one payslip per
  period" at the DB level. Lines split by `kind` ∈ {earning, deduction}
  with a free-text label and integer amount — no per-line tax/qty.
  Net = Σ earnings − Σ deductions (computed and stored on the row).
  Persisted `status` is `draft | issued | cancelled`; the
  user-visible unpaid / partial / paid state is **derived** in JS
  from `vouchers.related_payslip_id` (added in migration 0017).
  Cancelling an issued payslip with linked payments is refused at
  the store level — vouchers must be deleted first. See
  `app/stores/payslips.ts`: `derivedStatus()`, `paidCentsFor()`,
  `linkedPayments()`, `canTransition()`, `setStatus()`.
- `vouchers` — money in (receipt) / money out (payment). Standalone or
  optionally linked to an invoice (`related_invoice_id`), bill
  (`related_bill_id`), or payslip (`related_payslip_id`). For all
  three, a voucher with the matching link is the **only** way money
  flow against the document is recorded — the document's "paid" /
  "balance" / status all derive from these voucher rows. The voucher
  detail page is **read-only by default**; the user clicks Edit to
  enter mutate-mode (Cancel re-hydrates from DB, Save persists +
  exits edit mode).
- `bank_statement_imports` — one row per CSV statement upload.
  business_bank_id FK + filename + imported_at + column_mapping
  (JSON, so re-imports remember the column assignment).
- `bank_statement_rows` — one row per parsed statement line.
  Signed amount_cents, optional balance, dedupe_hash (sha256 of
  date|amount|description|reference) UNIQUE per bank so re-imports
  silently skip duplicates. matched_voucher_id nullable FK to
  vouchers (SET NULL on voucher delete so statement history
  survives).
- `vouchers.business_bank_id` — explicit FK to business_banks for
  per-bank reconciliation scoping. NULL for cash vouchers.
  Backfilled to default bank for existing non-cash vouchers in
  migration 0033.
- `vouchers.reconciled_at` — ISO timestamp set when a voucher is
  matched to a statement row; cleared on unlink.
- `document_attachments` — scans / photos attached to any document
  (quote / invoice / bill / voucher). Polymorphic: keyed by
  `(document_type, document_id)`, **no FK** — so each document store's
  delete path calls `purgeDocumentAttachments()` to clear the rows +
  files. The file bytes live on disk under
  `app_data_dir/attachments/<tenant_id>/<document_type>/<document_id>/`;
  the row stores `file_path` + `filename` + `size_bytes` + `mime` +
  `source` (`local` = desktop file dialog, `phone` = LAN phone upload).
  Managed by `app/stores/document_attachments.ts`; the shared
  `AttachmentsCard.vue` renders it on every document detail page.
- `recurring_invoices` + `recurring_invoice_lines` — invoice TEMPLATES
  that the user materialises into real draft invoices on a cadence.
  Templates carry `client_id` FK + `client_snapshot` + denormalised
  `client_name`, a schedule (`frequency` ∈ weekly/monthly/quarterly/
  yearly, `start_date`, `next_issue_date`, optional `end_date`), and
  invoice defaults (`pricing_mode`, `vat_rate_basis_points`,
  `payment_terms_days`, `project_title`, `notes`, `business_bank_id`)
  cloned onto each generation. `is_paused` flips a template off
  without deleting it. `invoices_generated` + `last_generated_at`
  track materialisation history. Lines table uses a simpler shape
  than `invoice_lines` — no `unit`, no per-line computed totals
  (recomputed at generation time from the qty / unit price / VAT bp
  so a rate edit on the template flows into the next generated
  invoice cleanly). Generation is **user-initiated** —
  `useRecurringInvoicesStore.generateOne(id)` allocates an invoice
  number, inserts an `invoices` row in `draft` status, clones the
  lines with recomputed totals, advances `next_issue_date` by one
  frequency step, increments the counter. No background job, no
  Tauri command — pure sequential SQL inserts. The list page shows
  a "pending count" of templates ready to generate
  (`is_paused=0 AND next_issue_date <= today AND
  (end_date IS NULL OR next_issue_date <= end_date)`) and a
  RecurringGenerateModal lets the user bulk-confirm.
- `recurring_bills` + `recurring_bill_lines` — vendor-side mirror of
  `recurring_invoices`. Templates that materialise into real bills
  (status `unpaid`) on a user-initiated cadence. Same schedule shape
  (`frequency`, `start_date`, `next_issue_date`, optional `end_date`)
  and the same `is_paused` flag. Carries `vendor_id` FK +
  `vendor_snapshot` + denormalised `vendor_name`, plus an optional
  `category_id` FK + `category_snapshot` + the denormalised trio
  (`category_name`/`color`/`icon`) so the list page can render the
  category cell without parsing the snapshot — mirrors the bills
  table's shape post-migration 0028. Bill defaults cloned onto each
  generation: `pricing_mode`, `bundle_subtotal_cents`,
  `vat_rate_basis_points`, `payment_terms_days`, `notes`. No
  `business_bank_id` (bills don't carry one — we're paying THEM) and
  no `project_title` (vendor invoices typically don't have one). Lines
  table mirrors `recurring_invoice_lines` verbatim — no per-line
  computed totals (recomputed at generation time). Generation is
  **user-initiated** — `useRecurringBillsStore.generateOne(id)`
  allocates a bill number, inserts a `bills` row in status `open` (the
  bills store derives `unpaid` from it), clones the lines with
  recomputed totals, advances `next_issue_date` by one frequency step,
  increments `bills_generated`. Unlike recurring invoices (which
  produce drafts for review), generated bills are real liabilities the
  moment they land — the user records payment via a voucher on the
  bills page when it's actually paid. `RecurringGenerateBillsModal` is
  the bulk-confirm flow.

`PRAGMA table_info(...)` is used in `data_io.rs` to discover columns
dynamically — adding a column to a migration auto-flows into export.

---

## Migrations

```
0001_initial.sql                        ← settings, clients, document_counters
0002_documents.sql                      ← quotes, invoices, invoice_payments (latter dropped in 0014)
0003_bills_vouchers.sql                 ← bills, vouchers + their line tables (original schema)
0004_appearance.sql                     ← ui_font, theme_color on company_settings
0005_default_font_google_sans.sql       ← (historical) Miriam Libre default → Google Sans Flex
0006_pdf_font.sql                       ← adds pdf_font column (separate from ui_font)
0007_vendors.sql                        ← vendors table (mirrors clients shape)
0008_bills_use_vendors.sql              ← drop+recreate bills with vendor_id FK + vendor_snapshot
0009_bill_categories.sql                ← bill_categories lookup; bills get category_id + category_snapshot
0010_default_font_inter.sql             ← drop Google Sans Flex; default ui_font/pdf_font → Inter
0011_currency.sql                       ← per-business currency_code on company_settings
0012_pdf_header_logo.sql                ← pdf_header_logo_path column (wide PDF letterhead)
0013_bills_payments_via_vouchers.sql    ← drop bills.paid_cents; status collapses to open|cancelled
0014_invoices_payments_via_vouchers.sql ← drop invoices.paid_cents + invoice_payments table
0015_employees.sql                      ← employees address book (payroll)
0016_payslips.sql                       ← payslips + payslip_lines, UNIQUE (employee_id, period_start)
0017_vouchers_payslip_link.sql          ← vouchers.related_payslip_id (ON DELETE SET NULL)
0018_employee_number.sql                ← nullable text column on employees, indexed
0019_payroll_cycle.sql                  ← payroll_period_start_day / payroll_period_end_day / payroll_pay_day on company_settings
0020_pdf_protection.sql                 ← pdf_protect_password + 5 per-type pdf_protect_* flags on company_settings
0021_invoice_attachments.sql            ← invoice_attachments table (scans / photos per invoice)
0022_document_attachments.sql           ← drop invoice_attachments; polymorphic document_attachments table
0023_business_banks.sql                 ← multi-bank business accounts: business_banks table + business_bank_id FK on quotes/invoices; bank cols dropped from company_settings
0024_default_font_akt.sql               ← flip default ui_font / pdf_font Inter → Akt
0025_currency_symbol_override.sql       ← allow custom (non-curated) currency_code by persisting a user-supplied symbol
0026_drop_attachment_path.sql           ← drop the dead bills.attachment_path / vouchers.attachment_path columns (the polymorphic document_attachments table from 0022 has owned attachments for a while)
0027_title_override.sql                 ← optional `title_override` text column on quotes / invoices / bills so the PDF big-header can be customised per document ("Development quote" instead of "QUOTATION")
0028_denormalize_list_party_names.sql   ← denormalised `client_name` / `vendor_name` / `employee_name` columns on quotes / invoices / bills / payslips (plus `category_name/color/icon` on bills) so list pages render + sort + search without parsing the snapshot JSON per row. Backfilled from existing snapshots via SQLite's `json_extract`. Stores set the column whenever the snapshot is set; detail pages still use the full snapshot.
0029_credit_notes.sql                   ← `credit_notes` + `credit_note_lines` tables for the Tier 2 credit-note feature. Mirrors invoice shape (client_id FK + client_snapshot + denormalised client_name, project_title, vat_rate_basis_points, subtotal/tax/total cents, notes, title_override) plus `source_invoice_id` (nullable FK ON DELETE SET NULL) for the "credit against invoice X" link. Status FSM: `draft | issued | cancelled`. Document numbering type `credit_note` added to `app/lib/numbering.ts` (prefix CRN).
0030_recurring_invoices.sql             ← `recurring_invoices` + `recurring_invoice_lines` tables for the Tier 2 recurring-invoice templates feature. Templates carry a client_id FK + client_snapshot + denormalised client_name, a schedule (frequency / start_date / next_issue_date / optional end_date), and invoice defaults (pricing_mode, vat_rate_basis_points, payment_terms_days, project_title, notes, business_bank_id) cloned onto each generated invoice. `is_paused` flips a template inactive without losing data. `invoices_generated` + `last_generated_at` track materialisation. Generation is user-initiated via `useRecurringInvoicesStore.generateOne()` — no Tauri command, just sequential SQL inserts + a `next_issue_date` advance.
0031_recurring_bundle_subtotal.sql      ← adds `bundle_subtotal_cents` to `recurring_invoices` so bundle-mode templates can store a lump-sum amount independent of the lines table (mirrors how issued invoices already store `subtotal_cents`).
0032_recurring_bills.sql                ← `recurring_bills` + `recurring_bill_lines` tables — vendor-side mirror of recurring_invoices. Templates carry a vendor_id FK + vendor_snapshot + denormalised vendor_name, an optional category_id FK + category_snapshot + denormalised category_name/color/icon (bills have categories, invoices don't), a schedule (same frequency / start_date / next_issue_date / optional end_date shape), and bill defaults (pricing_mode, bundle_subtotal_cents, vat_rate_basis_points, payment_terms_days, notes). NO business_bank_id (bills don't carry one — we're paying THEM) and NO project_title. `bundle_subtotal_cents` folded in from the start, no separate migration. `bills_generated` + `last_generated_at` track materialisation. Generation user-initiated via `useRecurringBillsStore.generateOne()` — same shape as recurring invoices, but generated bills land in status `unpaid` (not draft — bills don't have a draft state).
0033_voucher_bank_id.sql                ← `vouchers.business_bank_id` FK to business_banks (ON DELETE SET NULL) + index. Backfilled non-cash existing vouchers to the default bank.
0034_bank_reconciliation.sql            ← `bank_statement_imports` + `bank_statement_rows` tables. `vouchers.reconciled_at` ISO timestamp column. Bank FKs are RESTRICT (a bank with reconciliation history can't be deleted without clearing imports first). `matched_voucher_id` is SET NULL so deleting a voucher quietly unmatches its statement row.
0035_payslip_statutory.sql              ← EPF/ETF statutory auto-compute. company_settings gains statutory_auto_compute (master toggle) + epf_employee_rate_bp (800) / epf_employer_rate_bp (1200) / etf_rate_bp (300). payslip_lines gains epf_liable (0/1) + auto_source ('epf_employee' tags the managed EPF deduction line). payslips gains epf_employee_cents / epf_employer_cents / etf_cents (frozen figures) + statutory_enabled (per-payslip toggle, seeded from settings). Pure math in app/lib/statutory.ts.
0036_payslip_paye.sql                   ← PAYE/APIT monthly tax-table auto-compute. company_settings gains paye_auto_compute (master toggle, default off) + paye_relief_cents (15000000) + paye_deduct_epf (1) + paye_brackets (JSON: taxable-income bands, seeded with the SL 2025/26 table). payslips gain paye_cents (frozen) + paye_enabled (per-payslip, seeded from settings). payslip_lines reuse auto_source = 'paye' for the managed PAYE deduction line. Progressive math in app/lib/statutory.ts computePaye().
(0037_pdf_templates / 0038_default_prepared_by / 0039_pdf_theme_color landed between here and 0040 — see the MIGRATIONS array in tenants.rs for the authoritative list.)
0040_letters.sql                        ← `letters` table (free-form correspondence rendered on the business letterhead). No lines table, no snapshot, no money. `number` is a NON-UNIQUE editable reference (auto-suggested LET-YYYY-NNNN but user can override/clear it — letters aren't gapless-numbered). `body_json` holds the TipTap rich-text document; `pre_printed` (0/1) toggles app-rendered letterhead vs reserved blank top space for physical stationery. SCHEMA_VERSION → 40.
0041_letter_settings.sql                ← `letter_categories` managed lookup (name-only — no colour/icon) that powers the letter Category picker; the letter still stores `category` as plain text so archiving/deleting a category never rewrites existing letters. Adds `company_settings.letter_preprinted_top_margin_mm` (INTEGER, default 55) — the blank top space `letter.typ` reserves in pre-printed mode. SCHEMA_VERSION → 41.
0042_letter_signature.sql               ← (superseded by 0043) added structured signatory_company / signatory_email / signatory_phone to letters. SCHEMA_VERSION → 42.
0043_letter_signature_richtext.sql      ← replace the structured signature fields with a single `letters.signature_json` (TipTap rich text, same shape as body_json) — the whole sign-off is now free-form. DROPs signatory_name/title/company/email/phone via `ALTER … DROP COLUMN` (rows preserved; old values discarded, pre-1.0). Rendered below a signature line in `letter.typ` via the shared `render-blocks`. SCHEMA_VERSION → 43.
0044_letter_preprinted_bottom_margin.sql ← `company_settings.letter_preprinted_bottom_margin_mm` (INTEGER, default 20) — pre-printed mode now reserves blank space at the bottom (physical footer band) as well as the top. `letter.typ` reads both; `/settings/letters` shows both inputs + a live A4 preview. SCHEMA_VERSION → 44.
0045_letter_signatures.sql              ← `letter_signatures` table (reusable rich-text sign-offs, name + body_json + is_default). Applying one COPIES its body_json into the letter's own signature_json (no FK — letters stay self-contained); at most one is_default (atomic CASE-WHEN in the store, like business_banks) pre-fills new letters via `useLettersStore.create`. Managed on `/settings/company#signatures` (Business details → Signatures) since v0.140.0 — shared across letters AND the quote/invoice "Prepared by" field, injected via the shared `SignaturePicker.vue` + `LetterSignatureFormModal`. SCHEMA_VERSION → 45.
0046_quote_include_bank.sql             ← `quotes.include_bank_details` (INTEGER, default 0) — opt-in flag for printing the payment/bank block on the quote PDF (off by default; quotes are often sent before payment terms are agreed). SCHEMA_VERSION → 46.
0047_continuous_document_numbering.sql  ← drop the fiscal-year scope from document numbering. `document_counters` is dropped + recreated keyed on `document_type` alone (was `(document_type, fiscal_year)`); numbers go `{PREFIX}-{YYYY}-{NNNN}` → `{PREFIX}-{NNNN}` (QUO-0004). Numbering is now date-independent — no year reset, no year jump on quote→invoice conversion, no back-date renumber. `numbering.ts` dropped `parseDocumentNumber` + `renumberForIssueDate`; `formatDocumentNumber(type, seq)` lost its fiscalYear arg; `useDocumentNumber` dropped its `issueDate` option. Old YYYY-format numbers on existing docs keep their stored strings (pre-1.0, disposable). SCHEMA_VERSION → 47.
0048_bank_colors.sql                    ← `business_banks.color` (TEXT NOT NULL DEFAULT 'green') — one of the 8 predefined THEME_COLORS swatch names (same palette bill categories use). Auto-assigns distinct swatches to existing banks by id order (interleaved hue families) so markers work with zero setup. Rendered by the shared `BankColorDot.vue` in front of the bank identity everywhere: settings bank list, vouchers-list Method cell, bank USelects on quote/invoice/recurring-invoice/voucher pages (+ /reconcile) via `#leading` / `#item-leading` slots. SCHEMA_VERSION → 48.
0049_payslip_signatures.sql             ← `company_settings.payslip_show_signatures` (INTEGER, default 0) — opt-in two-column sign-off block ("Authorised by" / "Received by (employee)") at the foot of the payslip PDF. Business-wide, not per-payslip (a business either wants sign-off lines or it doesn't; a per-payslip flag would fight the issued-payslips-are-immutable rule and make bulk PDF export inhomogeneous). The 72pt lead-in lives INSIDE the `#if data.show_signatures == true` in `payslip.typ`, so with signatures off the page ends cleanly after notes instead of trailing an inch of whitespace. Toggled on `/settings/payroll` (`#signatures` card); threaded into the payload by `app/lib/payslip-pdf.ts`, which every render path (detail page, list row, bulk export) already shares. Defaults OFF, so existing tenants stop printing the block until they opt in. SCHEMA_VERSION → 49.
0050_unified_pdf_template.sql           ← collapse `pdf_template_invoice` + `pdf_template_quote` into a single `company_settings.pdf_template` (TEXT NOT NULL DEFAULT 'classic'); the invoice choice wins the collapse. One picker on /settings/pdf now drives quote / invoice / bill / payslip alike. `common.typ` gained `template-config(data)` (page margins / base size / par / footer per key) + `doc-header(data)` (the 5 header treatments); `payslip.typ` imports common.typ for the first time and consumes both, so `letterhead`'s 45mm top reservation and `compact`'s density finally reach payslips — and `export_payslip_pdf` now writes `common.typ` alongside. `export_bill_pdf` stopped hardcoding doc-classic. **The 5 `doc-*.typ` files still carry their own inline header copies** — unifying them is a deliberate follow-up, kept out of scope so client-facing render paths stayed untouched. SCHEMA_VERSION → 50.
0051_pdf_logo_controls.sql              ← `company_settings.pdf_logo_scale` (INTEGER, default 100 — percent, UI 50..150 step 5) + `pdf_logo_crop` (TEXT JSON {x,y,w,h} in source px, NULL for SVG/uncropped). Header-logo revamp: raster uploads keep the untouched original at `pdf-header-original.<ext>` (business-folder root) and a hand-rolled canvas cropper (`ImageCropModal.vue` + pure `app/lib/crop-rect.ts`) writes the `pdf-header.<ext>` derivative the PDFs render; "Re-crop" reopens the original with the stored rect via the `read_business_asset` command (bytes, because asset:// URLs are cross-origin and taint the canvas). SVG passes through uncropped (stays vector). All 9 template logo sites now render through `header-logo(data, base-h)` in common.typ — baseline × scale with a fixed 55mm width clamp via measure() so banner crops shrink instead of colliding with the title (note: Typst rejects length×length, so ratios must be parenthesised — `h * (m.width / m.height)`). voucher/report/statement gained a SELECTIVE `#import "common.typ": header-logo` (a wildcard would shadow their local label/faint — the payslip landmine from #315) + common.typ as a render companion. The upload tile + crop stage are fixed white in both themes: they preview against the PDF's actual background. SCHEMA_VERSION → 51.
0052_pdf_header_footer_text.sql         ← `company_settings.pdf_header_custom` / `pdf_header_text` / `pdf_footer_custom` / `pdf_footer_text`. Opt-in rich-text page chrome: when a flag is on, the stored TipTap JSON replaces the built-in header block (printed opposite the logo) or the footer line. Flags default 0 so existing tenants render byte-identically — proven by sha256 over all 5 doc templates before/after. `{business_name}` / `{address}` / `{city}` / `{phone}` / `{email}` / `{website}` / `{tax_id}` tokens are substituted over the BLOCK TREE by `app/lib/pdf-tokens.ts` (so a token inside a bold run stays bold); unknown tokens render literally so typos are visible. `app/lib/pdf-chrome.ts` turns settings into the `header_blocks` / `footer_blocks` payload arrays for all 9 builders and caps the footer at 3 blocks — the page footer is a FIXED region repeated on every page. `render-blocks` gained a `spacing` param (default 8pt = unchanged) and **`footer-content` MOVED below it** in common.typ (definition-order rule — it now calls render-blocks). Header text reaches the 5 doc-* templates + payslip via `doc-header`; voucher/report/statement/letter get the footer only (bespoke headers). Letterhead skips header text by design. `RichTextEditor` gained a `minimal` prop (marks + align only) and an exposed `insertText()` for the Insert-field menu. SCHEMA_VERSION → 52.
0053_logo_crop.sql                      ← `company_settings.logo_crop` (TEXT JSON {x,y,w,h} in source px, NULL for SVG/uncropped) — the square-identity-logo mirror of `pdf_logo_crop`. Raster uploads now keep the untouched original at `logos/logo-original.<ext>` and the CROPPED derivative at `logos/logo.<ext>`; `save_business_asset`/`read_business_asset` gained a `logo-original` kind (the stale-ext sweep keys on `file_stem`, and `logo-original` != `logo`, so the pair never collide). `ImageCropModal` gained `aspect` (1 = square; omitted keeps the wide PDF letterhead free-form) plus `title`/`hint` props — its copy was hardcoded to the PDF header and leaked into the logo modal. Aspect math lives in the pure `fullRect(w,h,aspect)` / `resizeRect(...,aspect)`; clamping at an image edge shrinks BOTH axes so the ratio survives. **The sharp edge: cropping emits PNG, so a JPEG upload lands as `logo.png` — `tenants.setLogoFile` must get the extension of the file ACTUALLY written**, because welcome + Businesses read `tenants.json` directly, not the DB. The logo now renders on a WHITE PLATE (sidebar / welcome / Businesses / uploader tile) but only when a logo is set — the empty-state icon keeps the muted bg, since a white square holding a grey icon reads as a broken image in dark mode. Originals are local-only: `data_io` bundles the derivative alone (same as `pdf-header-original`), so Re-crop falls back to cropping the derivative after a backup import. SCHEMA_VERSION → 53.
```

**Adding a migration**: drop the SQL into `src-tauri/migrations/`,
register it in the `MIGRATIONS` array in `src-tauri/src/tenants.rs`,
bump `SCHEMA_VERSION` in `src-tauri/src/data_io.rs`, and (if a new
table) add it to the `TABLES` list in the same file so export/import
covers it.

---

## Status state machines

Each store has a `STATUS_TRANSITIONS` map and a `canTransition()`
predicate. The UI offers only legal transitions in dropdowns; the DB
also enforces via CHECK constraints. **If you add a state, update both
sides.**

```
quotes:    draft → sent → accepted → converted (terminal)
                       ↘ rejected | expired
                draft → rejected (cancel)
                sent | accepted | rejected | expired → draft (reopen — common
                mistake escape; sent = un-send, accepted = misclick /
                renegotiation before conversion. Quotes carry no payments,
                so nothing to guard)
                converted → draft (revertConversion() — NOT a STATUS_TRANSITIONS
                entry; a named compound op that DELETES the linked invoice and
                reopens the quote. Refused while receipt vouchers exist on the
                invoice — the confirm dialog lists them with links. v0.141.0)

invoices:  persisted: draft ↔ sent ↔ cancelled (the only user transitions)
           derived:   draft           → draft
                      sent + payments → partial | paid
                      sent + credits  → partial | credited
                      sent + due < today + balance > 0 → overdue
                      cancelled is sticky
           Derived precedence (deriveInvoiceStatus in app/lib/derived-status.ts):
                      paid       — receipts ALONE cover the total
                      credited   — receipts + issued credit notes cover it,
                                   but cash alone didn't. A mixed 40-cash /
                                   60-credit settlement lands here: the point
                                   of the state is surfacing that the invoice
                                   was not collected in full.
                      overdue    — balance > 0 and due_date < today
                      partial    — some receipts OR credit, short of total
                      sent       — nothing paid or credited
           Only `issued` credit notes count (drafts aren't real, cancelled
           are void), and only when their source_invoice_id names this
           invoice. `credited` is DERIVED — never persisted on the row.
           ("Record payment" creates a receipt voucher with
            related_invoice_id; partial/paid/overdue states fall
            out of that.) Cancel AND revert-to-draft are refused once
            any receipt voucher is linked — vouchers must be deleted
            first (the setStatus guard counts vouchers via direct SQL,
            not the maybe-unloaded vouchers store). "Revert to draft"
            is offered on sent-with-no-payments and on cancelled
            (detail header + list row menu, v0.142.0). The detail page
            also hides "Record payment" once the balance hits zero.

bills:     persisted: open ↔ cancelled (the only user transitions)
           derived:   open + payments → unpaid | partial | paid
                      open + due_date < today + balance > 0 → overdue
                      cancelled is sticky
           ("Record payment" creates a voucher with related_bill_id.)
           Cancel is refused once the bill is fully paid — payment
           vouchers must be deleted first.

payslips:  persisted: draft ↔ issued ↔ cancelled
           derived:   draft           → draft
                      issued + payments → unpaid | partial | paid
                      cancelled is sticky
           ("Record payment" creates a payment voucher with
            related_payslip_id. Cancel AND revert-to-draft are refused
            once any payment is linked — voucher must be deleted first
            (setStatus guard counts vouchers via direct SQL). "Revert
            to draft" is offered on issued-with-no-payments and on
            cancelled — detail header + list row menu, v0.142.0. The
            detail page hides Cancel in that state.)

vouchers:  no transitions; voucher_type (receipt/payment) is locked at create

Detail-page UI for transitions: each legal next-state is rendered as an
explicit button in the header (no dropdown). On the list pages, the
row context menu and overflow ⋯ menu surface the most common ones.

Date invariants enforced via DateField's min-value + a watcher that
drags the second date forward when the first moves past it:
  - quotes:    valid_until >= issue_date
  - invoices:  due_date    >= issue_date
  - bills:     due_date    >= issue_date
  - payslips:  pay_date in [period_start, period_end]
```

---

## List view conventions

Every list page (clients, vendors, employees, bill categories, quotes,
invoices, bills, vouchers, payslips) follows the same shape so the UX
stays consistent and each page stays small:

1. **Store** owns the data and `filtered` computed (search / status /
   date filters live here as refs the page binds to in the header).
2. **Page** renders `<ResizableDataTable :rows="…" state-key="…"
   :row-actions="itemsFor" default-sort-field="…">` with PrimeVue
   `<Column>` children for each column. ResizableDataTable is a thin
   wrapper around PrimeVue DataTable that bundles every cross-list
   piece of UX: drag-pan, sort/page localStorage persistence (per
   `state-key`), auto-fit-columns, "Fit" page-size, the right-click
   row context menu, and an optional multi-select checkbox column.
3. **Row actions** are defined as a single `itemsFor(row)` callback
   that returns grouped arrays `[[…], […]]` — rendered into both
   PrimeVue's context menu and (where present) the overflow ⋯ menu.
   Group boundaries become separators. New actions land in both
   places automatically. Pattern is on the quotes, invoices,
   payslips, employees, clients, and bill-categories lists.
4. **Filter strip** is consistent across the document lists (quotes,
   invoices, bills, vouchers, payslips):
   - Row 1: search + FK pickers (client/vendor/employee) + **Advanced**
     button (a `UPopover` hosting the date-range fields, with a small
     info-dot indicating when any date filter is active) + **Reset**.
   - Row 2 + 3 share a `grid grid-cols-1 md:grid-cols-2 items-start`
     wrapper — status chips on the left, date-preset chips on the
     right at md+; stacked at sm. `items-start` keeps each column
     flush with the top of the row when one wraps to two lines.
   - **Status chips**: multi-select. Empty set = show everything.
     Each chip's active colour matches the row's `StatusBadge` for
     visual continuity. Stored as `store.statusFilters` (array)
     with `toggleStatusFilter` / `clearStatusFilters` helpers.
   - **Date-preset chips** (Today / This week / This month / This
     year): each resolves to concrete ISO bounds at click time, so
     "This month" is always the current calendar month — no
     staleness. Clicking the active preset clears the range.
     Payslips replaces this with a month picker since the common
     payroll query is "show me April 2026".
5. **Table action bar** sits just below the header divider, above the
   table proper:
   - Left: **Auto-fit columns** button — strips persisted column
     widths and remounts the table so the browser re-measures from
     content.
   - Right: **filtered-rows summary** as a `<StatChip>` showing the
     sum of currently visible rows' totals (success/error/net split
     on vouchers). `X of Y shown` appendix appears when filters are
     narrowing the list.
6. **PrimeVue paginator** at the foot of the table, with our own
   page-size picker injected into `#paginatorend`. Options are
   **Fit (N) · 10 · 15 · 25 · 50 · 100**. "Fit" is the default for
   first-visit tables — it measures available viewport height and
   computes how many rows fit (a `FIT_SAFETY_ROWS = 2` nudge keeps
   the last row off the paginator border). Re-measures on resize and
   when the user switches into Fit. A picked numeric value persists
   per `stateKey` to localStorage and opts out of auto-sizing for
   that table.

**Sort defaults that match user expectations:** declared via
`default-sort-field` / `default-sort-order` on `<ResizableDataTable>`:
- Documents (quotes / invoices / bills): `issue_date` desc — newest first.
- Vouchers: `voucher_date` desc.
- Payslips: `period_start` desc.
- Clients / vendors / employees / categories: name (or full_name) asc.

**Snapshot-derived columns** (e.g. client name on a quote, employee
name on a payslip) are surfaced as `_client` / `_employee` / `_status`
fields on the view-model row so PrimeVue's by-field sorting matches
the visible cell, not the underlying JSON blob.

**Row click — first cell only.** ResizableDataTable's `@row-click`
emits the typed row but only when the click landed on the first
non-selection cell. Two reasons: drag-to-pan would otherwise tug on
a 5px threshold and risk an accidental nav; and the leading column
(number, name) reads as "the link" the way GitHub / GitLab tables
do. Right-click still opens the context menu on the whole row.

**Server-side pagination (opt-in, the norm for high-volume lists).**
`useServerTable` (composable) + `ResizableDataTable`'s opt-in lazy mode
(pass a `total` prop → PrimeVue lazy + `@request`) page / sort / filter /
sum in SQLite. Converted: quotes, vendors, employees, categories,
credit-notes, invoices, bills, payslips, clients. recurring-invoices /
recurring-bills stay client-mode (tiny + bulk-generate coupling).
**Converting a list:** build the WHERE from `app/lib/list-query.ts`
helpers (`likeClause` / `andClauses` / `inClause` / `eqClause` /
`rangeClause` + a `makeSortResolver` ORDER-BY allowlist), keep the store's
filter refs (cross-doc nav sets them) + add a `listFilters` computed
(the refetch dep) and a `fetchHeaderStats` / counts query, bind
`:rows :total @request`, and call `table.reload()` after in-page
mutations / New-modal close. Any list still small enough to stay
client-mode keeps `store.load()` + `:rows="store.filtered"`.

**Derived-status lists** (invoices / bills / payslips / clients) filter /
sort / sum on voucher-derived state via a subquery: `app/lib/derived-status.ts`
holds the pure `deriveX` fns (the stores' `derivedStatus` calls these —
single source of truth) + `xDerivedFrom(today)` SQL builders exposing
`_paid` / `_balance` / `_status` (`today` inlined as a literal to dodge
FROM-subquery param ordering). These pages also dropped the vouchers-store
load — the row carries `_paid` / `_balance` for the record-payment gate + PDFs.

**Legacy components** `ListPagination.vue`, `SortableTh.vue`, and
`useListView.ts` were removed in the post-PrimeVue cleanup — every
list page is on `ResizableDataTable` now.

---

## Capabilities (Tauri permissions)

Edit `src-tauri/capabilities/main.json`. Hot reload doesn't catch this
— restart `tauri:dev`.

Notable allowances:
- `fs:allow-{read,write}-file` scoped to `$APPDATA/**`,
  `$APPLOCALDATA/**`, plus user-document/download/desktop dirs.
- `shell:allow-execute` for the `binaries/typst` sidecar with
  arg validators ensuring `.typ` and `.pdf` extensions.
- `core:window:allow-set-title` for the dynamic window title plugin.
- `core:window:allow-start-dragging`, `allow-minimize`,
  `allow-toggle-maximize`, `allow-is-maximized`, `allow-close` —
  all needed by the custom titlebar.
- `dialog:allow-{open,save}` for file pickers.
- **`shell:allow-open` does NOT support raw file paths** — its scope
  validator hard-codes URL schemes. We bypass it with our own
  `open_path` Rust command (`pdf.rs`).

---

## Sidebar grouping

```
Dashboard
Calendar              ← month-grid view of every upcoming due date
─── (divider)
Quotes
Invoices
Recurring             ← /recurring-invoices — invoice templates that generate drafts on a user-initiated cadence
Credit notes          ← /credit-notes — negative invoices for refunds / returns; optional link to source invoice
Bills
Recurring bills       ← /recurring-bills — vendor-side mirror of /recurring-invoices; generates real unpaid bills (not drafts) on a user-initiated cadence
Vouchers
Reconcile             ← /reconcile — bank reconciliation; import CSV statement, match rows to vouchers, create vouchers from unmatched rows
─── (divider)
Payroll               ← /payroll — landing card grid mirroring /reports
  ├─ Dashboard       ← /payroll/dashboard — cycle / KPIs / MoM chart / recent runs
  ├─ Employees
  ├─ Payslips
  └─ Settings        ← /settings/payroll — cycle template (period_start_day / period_end_day / pay_day)
─── (divider)
Reports               ← aggregate views over the books (no editing)
  ├─ Profit & Loss   ← /reports/profit-loss — income − bills − payroll, accrual
  ├─ VAT             ← /reports/vat — output VAT − input VAT, net payable for the period
  ├─ Aged receivables ← /reports/aged-receivables — open-invoice snapshot by days past due
  ├─ Aged payables    ← /reports/aged-payables    — open-bill mirror, per-vendor breakdown
  └─ Cash flow        ← /reports/cash-flow        — receipts in − payments out by month (cash basis)
─── (divider)
Lists                 ← /lists — landing card grid mirroring /reports + /payroll
  ├─ Clients         ← /clients
  ├─ Vendors         ← /vendors
  └─ Bill categories ← /categories
─── (divider)
Business                ← per-business config (mostly exported in backups)
  ├─ Business details
  ├─ PDF
  │   ├─ Font                ← third-level in-page #anchors, shown only
  │   ├─ Header logo            while /settings/pdf is the active route
  │   └─ Footer notes
  └─ Security             ← all security for this business in one place
      ├─ Database            ← #encryption — at-rest DB password (per-business vault)
      └─ PDF protection      ← #pdf-protection — owner password on generated PDFs
─── (divider)
Settings                ← app-wide prefs + multi-tenant administration
  ├─ Appearance
  │   ├─ UI font             ← same in-page #anchor pattern as PDF,
  │   ├─ Theme color            shown only on /settings/appearance
  │   ├─ Theme
  │   └─ Zoom
  └─ Businesses
─── (divider)
Help                  ← /help — in-app library of bookkeeping explainers + how-to guides. Per-page `?` icon (HelpButton) drops users into the relevant topic via modal; this entry exposes the full library.
```

URLs all live under `/settings/*` regardless of group — only the
sidebar grouping splits them. The **Business** group is per-business
data/config (mostly travels with the export bundle); the **Settings**
group is app-wide UI prefs (Appearance, per-machine) + multi-tenant
admin (Businesses) that don't belong to any single business.

**Security page** (`/settings/security`, Business group) holds *both*
kinds of business protection, on two `#anchor` sections: `#encryption`
(at-rest database password — the per-business vault, see "Per-business
encryption" below) and `#pdf-protection` (owner password applied to
generated PDFs). The two passwords are unrelated. PDF protection lives
on `company_settings.pdf_protect_*`; the PDF settings page keeps a
pointer link to it.

The sidebar nav supports three levels: top-level items, `children`
(always visible), and an optional third level of `sections` — in-page
`#anchor` links that appear under a child only while that child's own
route is active (currently PDF and Appearance). Section links scroll
to the matching card; the active section is matched on `route.hash`.
Each target card is wrapped in an `id`'d `<div>` with `scroll-mt-*`,
and `scrollToSection()` in `default.vue` does the scroll by hand
(the main content scrolls in its own container, so Vue Router's
window-level hash handling doesn't reach it).

The sidebar itself is a floating card (`m-2 mt-0 rounded-lg shadow-lg`)
sitting against the floor of the titlebar; main content is flush with
the right and bottom of the window. Collapsible via the toggle on the
left of the titlebar (state in `useUiState.sidebarCollapsed`,
persisted to localStorage).

---

## What's done / what's not

### Done

- ✅ DB schema + migrations 0001..0053 (`SCHEMA_VERSION` 53)
- ✅ Clients / Vendors / Employees CRUD (hero + SectionCard layout)
- ✅ Quotes (full lifecycle, PDF, convert-to-invoice; default VAT seeded
  from settings on draft creation)
- ✅ Invoices (lifecycle, PDF; payments via receipt vouchers, status
  derived from voucher sums + due date)
- ✅ Bills (vendor FK + snapshot + category FK + snapshot; payments via
  payment vouchers, status derived)
- ✅ **Credit notes wired into the books** (v0.159.0) — issued credit
  notes reduce the linked invoice's derived balance (new `credited`
  status), and are deducted from output VAT + P&L income by their own
  issue_date. Unlinked ones come off the client total as an unapplied
  credit in aged receivables + the statement PDF. Also reaches the
  dashboard receivables tile and the clients-list outstanding column.
  `bun run verify:sql` guards the SQL copies of the balance (seven sites in all — see Known landmines).
- ✅ **Employer EPF + ETF counted as payroll expense** (v0.158.5) in
  both the P&L and the payroll register — previously gross-only, which
  overstated profit by up to ~15% of EPF-liable payroll.
- ✅ **VAT entry mode on bundle totals** — every bundle-mode doc (quote /
  invoice / bill / credit-note / recurring invoice / recurring bill) has a
  "Charge VAT" toggle + a "Before VAT / VAT-inclusive" switch on the totals
  card. Inclusive mode back-calculates the net subtotal from an entered
  gross (`tax = total × rate / (100% + rate)`). Persisted data is unchanged
  — always net `subtotal_cents` / `bundle_subtotal_cents` + rate — so PDFs /
  reports / recurring generation are unaffected; the mode is ephemeral UI
  state that re-derives from the stored rate on load.
- ✅ Vouchers (money in/out, PDF, big amount card layout; "Record
  payment" prefill + bounce-back; voucher detail page is read-only
  by default with explicit Edit toggle)
- ✅ **Payroll** (huge surface):
  - Employees CRUD with payroll fields (basic salary, bank, NIC, etc.)
  - Payslips lifecycle: create, edit lines, issue, cancel, pay; PDF
  - **Cycle template** on `company_settings` (period_start_day /
    period_end_day / pay_day, 1–31 with month-length clamping;
    settable at `/settings/payroll`). Resolved via
    `app/lib/payroll-cycle.ts`.
  - **Bulk payslip flow** at `/payslips/bulk` — pick a month, the
    three dates fall out of the cycle template; chain auto-issue
    and auto-record-payment in one run. Per-row payment references
    (TXN ID / cheque #); voucher defaults (method, description)
    bulk for the run.
  - **Bulk PDF export** on the payslips list — multi-select rows
    via checkbox column, pick output folder, progress modal, one
    `{number}.pdf` per row.
  - **Payroll dashboard** at `/payroll` — upcoming-cycle hero with
    urgency badge (overdue red / 7-day amber / further green), KPI
    tiles (active employees / outstanding payroll / paid this year),
    12-month salaries-paid bar chart, recent runs panel, outstanding
    list.
  - **Statutory auto-compute (EPF/ETF)** — employee EPF 8% as a
    live-recomputed managed deduction line; employer EPF 12% + ETF 3%
    stored + printed. Rates + master toggle on /settings/payroll;
    per-payslip override. Pure math in app/lib/statutory.ts.
  - **PAYE / APIT auto-compute** — monthly tax-table method: a
    configurable relief + progressive bracket table on /settings/payroll
    (pre-seeded with the SL 2025/26 table; editable when budgets change),
    an optional "deduct employee EPF first" flag, and a managed
    `auto_source='paye'` deduction line that recomputes live. Per-payslip
    "Apply PAYE" toggle, master toggle defaults off. Pure math in
    app/lib/statutory.ts computePaye().
- ✅ Universal delete on quotes/invoices/bills/payslips. Linked
  vouchers stay intact (their `related_*_id` is nulled on delete).
- ✅ Dashboard (KPI tiles, monthly cash-flow chart, receivables aging,
  expenses by category donut, top clients horizontal bars, recent
  activity, overdue list, quick actions). Hand-rolled SVG charts —
  no Chart.js / D3 — theme-aware via CSS variables.
- ✅ PDF generation via bundled Typst sidecar (5 bundled fonts, theme
  color from settings, user-chosen `pdf_font`, business-name
  wordmark fallback when no PDF logo uploaded)
- ✅ PDF preview modal (iframe-embedded, save-as via temp file copy)
- ✅ **Document attachments** — scans / photos attached to any document
  (quote / invoice / bill / voucher). Polymorphic `document_attachments`
  table (migration 0022, supersedes the invoice-only 0021). The shared
  `AttachmentsCard.vue` is on every document detail page (voucher card
  gated to edit mode). Two upload paths: a local file picker
  (`import_document_attachment` Rust command) and **phone upload** —
  `phone_upload.rs` runs a token-gated LAN HTTP server (axum) and shows
  a QR; the user captures photos in their phone's browser and they
  attach over the network (`PhoneUploadModal.vue` + `phone-upload-received`
  event). Multi-photo per session; the LAN IP is resolved from the
  routing table.
- ✅ **Password-protected PDFs** — optional owner-password encryption
  (AES-256 / R6) applied by the `qpdf` crate as a post-process after
  Typst renders. Owner-password only: the PDF opens with no prompt but
  editing / copying / annotating are blocked, printing stays allowed.
  Configured at `/settings/security#pdf-protection` (Security page) —
  one owner password + a per-document-type toggle (quote / invoice /
  bill / voucher / payslip). `lib/pdf.ts` resolves the password from
  settings and threads it to the matching `export_*_pdf` command;
  `encrypt_pdf()` in `pdf.rs` does the work.
- ✅ Settings split into two sidebar groups: **Business** (per-business
  config — Business details / PDF / Security) and **Settings**
  (app-wide UI prefs + multi-tenant admin — Appearance / Businesses). URLs
  all stay at `/settings/*`.
- ✅ Appearance: independent UI/PDF font pickers (5 bundled +
  free-text), 8-color theme palette, **UI zoom** (80–150% in 6
  steps) via root-`font-size` cascade, and **light/dark/system
  theme toggle** backed by `useColorMode()` (persists to
  localStorage; flips the `.dark` class on `<html>` live).
  Light mode uses a warm paper palette (`#fbf7ee` page bg with
  matching warmer borders) under `html:not(.dark)` in `main.css`
  so it doesn't feel clinical; dark mode keeps NuxtUI's zinc
  defaults.
- ✅ Bundled fonts (Inter / Inter Tight / Stack Sans Text / Miriam
  Libre / Amarna) — UI via `@font-face`, PDF via Typst `--font-path`
- ✅ Bundled icons (Lucide) — zero runtime network dependency
- ✅ DateField (single date) and DateRangeField with optional
  min/max constraints — used to keep payslip dates / salary-payment
  dates inside their valid windows
- ✅ Multi-tenancy (DB-per-business, welcome screen, tenant switcher)
- ✅ Export/Import (.zip bundles with manifest, schema-version gate)
- ✅ **Custom titlebar** — `decorations: false`, drag region,
  collapse-sidebar toggle, sidebar floating-card design, slim
  scrollbars, native window controls. Pixel-pinned so it doesn't
  scale with UI zoom.
- ✅ **Disabled defaults**: webview right-click context menu (except
  on inputs), text selection on UI chrome (sidebar, buttons, etc.)
- ✅ **Row context menus** on the quotes, invoices, payslips,
  employees, clients, and bill-categories list pages — same items the
  overflow ⋯ button shows; uses `UContextMenu` with `as-child` trigger
  so the `<tr>` stays the actual DOM element. Quote / invoice row PDF
  generation calls shared payload builders in `app/lib/quote-pdf.ts`
  and `app/lib/invoice-pdf.ts`. The clients menu also offers View
  quotes / View invoices, and bill categories offers Show bills —
  each hands a filter to the target list store before navigating.
- ✅ **Chip-style multi-select filters + Advanced popover** on every
  document list page (quotes, invoices, bills, vouchers, payslips).
  Empty chip set = show everything; multiple chips = union. Date
  ranges hide in a single Advanced popover with an active-state dot.
  Quick date presets (Today / This week / This month / This year)
  live under the status row.
- ✅ **Sticky save bar** on detail pages (quote / invoice / bill /
  voucher / payslip / client / vendor / employee / settings):
  primary-coloured border at 50% opacity + shadow-2xl + backdrop
  blur. Fades in when the form is dirty; Discard / Save changes.
  Reka UI popper panels share the same border treatment globally
  via a CSS rule in `main.css`.
- ✅ **Explicit transition buttons** on detail page headers (quote /
  invoice) — replaces the opaque "Status ▾" dropdown so available
  next-states are visible at a glance. Short verb labels (Send /
  Accept / Reject / Expire / Reopen / Cancel) keep the row compact.
  A small vertical separator sits before the Delete button.
- ✅ **Reopen rejected/expired quotes back to draft** — saves the
  user from burning a quote number on a misclick or a client change
  of mind.
- ✅ **Cancel guards** on invoices and bills — refused at the store
  level once payment vouchers exist (delete vouchers first). UI
  hides the cancel button in that state.
- ✅ **Date invariants** on quote (valid >= issue), invoice / bill
  (due >= issue) via `DateField` `min-value` + an issue-date
  watcher. `is-date-unavailable` strikes through out-of-range dates
  on the calendar.
- ✅ Window title syncs with active tenant
- ✅ Sidebar grouped (Dashboard / documents / Payroll / Lists /
  Settings) with thin separators between groups
- ✅ Bill categories — managed lookup with name + color (8 swatches)
  + icon (16 Lucide options); inline "+ New" modal on the bill page
- ✅ Default bill categories seeded into every fresh tenant
- ✅ Welcome screen with the new Sakoram wordmark and side-by-side
  cards on first run. **Demo seed overlay** blocks the welcome page
  while the demo business is being built so the user can't click
  the half-seeded tenant.
- ✅ **Onboarding wizard** at `/onboarding` — 4-step flow after
  creating a new tenant (Identity / Contact / Money defaults /
  Banking). Each step saves directly so partial completion sticks.
  Step 1 has a "Skip onboarding" link for power users.
- ✅ Allow deleting the active / last business
- ✅ Pagination + click-to-sort columns on every list page
- ✅ **Demo seed at real-business volume** — `createDemoBusiness()`
  now builds ~18 months of activity at the scale a real Sri Lankan
  small business would generate: 200 clients, 150 vendors, 600
  quotes, 800 invoices, 1000 bills, 400 standalone vouchers, 15
  employees, 14 months of payslips, plus ~10 sample image
  attachments scattered across documents. Bulk loops use coprime
  date strides against a 540-day spread so issue dates land
  uniformly across the range (the P&L fiscal-year preset and the
  Last-year / This-year date chips all return meaningfully
  different slices). Seed takes 2-3 minutes; a `SeedProgressFn`
  callback feeds a live stage label ("Seeding bills · 425 / 1000")
  into the welcome page + Settings → Businesses overlay so the
  spinner has context. Original curated set (4 clients / 3
  vendors / 3 quotes / 4 invoices / 3 bills / 4 vouchers) is
  preserved as the "feature showcase" — those rows still drive the
  dashboard's recent-activity feed and the detail-page demos.
- ✅ Line-ending normalization via `.gitattributes`
- ✅ Production build pipeline (MSI + NSIS installers)
- ✅ **CI release workflows split per platform** — `release-windows.yml`
  + `release-macos.yml` (Apple Silicon). Both trigger on a `v*.*.*`
  tag push (parallel) and have their own "Run workflow" button on
  the Actions tab for one-platform rebuilds. Each handles its own
  tag resolution + published-release guard.
- ✅ **Cloudflare R2 mirror for installers** — both release workflows
  upload the produced installer files to an R2 bucket under
  `sakoram/<version>/<filename>` (with spaces in Tauri-produced
  filenames replaced by dots for clean URLs). R2 has a connected
  custom domain so installers are served at
  `https://downloads.gravitide.dev/sakoram/<version>/...` directly,
  no GitHub-Releases hop. The mirror step skips cleanly when the
  required secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_ACCOUNT_ID`, `R2_BUCKET`) aren't configured on the repo, so
  forks / contributor branches aren't coupled to the
  gravitide.dev bucket.
- ✅ **Calendar** — `/calendar` page with month-grid view of every
  upcoming due date (invoices, bills, quote expiries, payslips).
  Hand-rolled grid (no FullCalendar / VCal dep). Filter chips for
  each event kind, per-kind counts on the chips, summary line with
  visible / overdue counts. Compact density embedded on the
  dashboard between cashflow/expenses and receivables aging.
- ✅ **Global back button** in the titlebar, gated on Vue Router's
  history-state position counter so the disabled state stays in
  sync with whether there's actually somewhere to go back to.
- ✅ **Native macOS titlebar treatment** — `tauri.macos.conf.json`
  overlay flips `decorations: true` + sets `titleBarStyle: "Overlay"`
  on Mac builds so the OS-drawn traffic-light buttons stay visible
  while our custom titlebar paints behind them. `useUserPlatform`
  composable + per-platform branches in `TitleBar.vue` adapt the
  layout (28px height, 78px left reservation, no right-side cluster).
- ✅ **"New …" modals** for quotes / invoices / bills / payslips —
  small two-to-four-field forms moved off standalone `/new` pages
  into modals that open over the list. Dashboard "New" menu and
  employees' "Create payslip" row action use `?new=1` query
  shortcuts that auto-open the matching modal on mount. Vouchers
  still uses a full page (8+ fields, prefill from multiple query
  params, conditional fields).
- ✅ **`<ResizableDataTable>`** — shared wrapper around PrimeVue
  DataTable adopted across every document list page. Bundles
  drag-pan, sort/page localStorage persistence, auto-fit columns,
  "Fit" page-size, right-click row context menu, and an optional
  multi-select checkbox column.
- ✅ **"Fit" page-size** — table page size auto-adapts to viewport
  height. Default on first visit; a picked numeric value persists
  per table. Recomputes on window resize.
- ✅ **Filtered-row totals** as a joined-pill **`<StatChip>`** above
  every list table (TOTAL · Rs N for quotes/invoices/bills; IN · OUT
  · NET split for vouchers). `X of Y shown` appendix when filters
  narrow the list.
- ✅ **Chromeless PDF preview + in-line Print** — header `sr-only`,
  PDFium toolbar suppressed via `#toolbar=0`, iframe loads from a
  same-origin blob URL (built from the temp file via fs plugin) so
  `contentWindow.print()` works without tripping same-origin policy.
  Footer is Cancel · Print · Save as…. Launcher buttons relabelled
  **PDF & Print** / **Generate PDF & Print** across all detail and
  list pages.
- ✅ **Dashboard KPI strip overhaul** — 4-up at md+ (was 1/2/4 by
  breakpoint), compact money format at md+lg where tile widths are
  tightest, smaller uppercase labels at md+lg, uniform tile heights,
  tiles prefilter the destination list (Receivables → invoices with
  sent/partial/overdue chips active, etc.).
- ✅ **List filter strip 2-col grid** — status chips + date-preset
  chips share a row from md+ (stack at sm). `items-start` keeps each
  column flush with the top when one wraps. Auto-fit columns moved
  out of the filter strip into the table action bar (it's a table
  action, not a filter).
- ✅ **Uniform-width uppercase `<StatusBadge>`** — every badge sits at
  `min-w-24` with `justify-center uppercase tracking-wider`, so
  status columns read as a tidy stack of equal-width pills.
- ✅ **Global UI typography** via `app/app.config.ts` — uppercase +
  `text-xs` on every UButton, softened `shadow-md shadow-black/10`
  on every UCard, `w-full` on UFormField / UInput / UTextarea by
  default. See "Global UI tokens" decision section above.
- ✅ **Softened sidebar shadow** (`shadow-md shadow-black/10`) +
  **tighter, symmetric content padding** (`p-4 pb-2` — was
  asymmetric `pl-4 pr-8 py-6`). Bottom matches the sidebar's `m-2`
  floor gap so both surfaces line up.
- ✅ **Address-book detail-page hero pattern** — employees, clients,
  and vendors share one shape: 80px circular avatar with primary-tinted
  bg + initials, name + chip strip in the middle, and a right cluster
  with a cross-doc shortcut + Archive + Delete. Right cluster collapses
  to a `⋯` dropdown below lg. See the "Address-book detail pages share
  one hero pattern" decision section above.
- ✅ **Hard-delete for employees / clients / vendors** — each store
  gained a `remove(id)` method; the FK-constraint error
  (`payslips → employees ON DELETE RESTRICT`, `quotes`/`invoices →
  clients` and `bills → vendors` NO ACTION) is caught by a regex
  match in the page handler and translated into a friendly toast
  nudging the user toward Archive instead of dumping raw SQL.
- ✅ **Responsive header dropdowns on document detail pages** —
  quote / invoice headers swap their inline button cluster for a `⋯`
  dropdown below lg. The dropdown items computed flattens primary
  actions + transition actions + Delete (with error-tone class).
  Bill / voucher / payslip headers stay inline; payslip uses
  `flex-wrap` so it can spill onto a second row at narrow widths.
- ✅ **Detail-page button styling uniformity** — `size="sm"` on every
  header button across all 5 docs (icons no longer dominate the 12px
  uppercase text), `variant="soft"` on every destructive Delete
  button (was a mix of soft / ghost), voucher Type badge picks up
  the StatusBadge `min-w-24 + uppercase + tracking-wider` shape.
- ✅ **Payroll Outstanding payroll tile** is clickable — sets
  `payslipsStore.statusFilters = ['unpaid', 'partial']` before
  navigating to `/payslips`, matching the dashboard KPI prefilter
  pattern.
- ✅ **Appearance settings 2-col layout at lg+** — UI font card on
  the left, Theme color + Theme + Zoom stacked on the right inside
  `max-w-5xl`. Sticky save bar stays outside the grid so it spans
  both columns.
- ✅ **Toasts pop top-centre** via `<UApp :toaster="{ position:
  'top-center' }">` so they don't fight the sticky save bar pinned
  bottom-right on every detail / settings page.
- ✅ **Modal title + description `select-none`** via
  `ui.modal.slots` in app.config — modal chrome stops drag-selecting.
- ✅ **Payslips list table action bar** — Auto-fit columns moved out
  of the filter strip into the table action bar (left); StatChip
  summing `net_cents` across visible rows on the right with `X of Y
  shown` appendix when filtered.
- ✅ **KPI headline at xl now stays at `text-xl`** (was bumping back
  to text-2xl). Full money strings still wrapped to two lines at
  240-300px tile widths; text-2xl now only kicks back in at 2xl.
- ✅ **Multi-bank business accounts** (migration 0023) — the single
  bank record on `company_settings` became a managed list in
  `business_banks`. One bank is marked default and auto-applies to
  new quotes / invoices via the picker on each detail page. The
  existing `bank_details_snapshot` JSON on quote / invoice rows is
  unchanged, so Typst templates need no edit; the new
  `business_bank_id` FK is informational. Settings → Business
  details renames from "Company details" and gains a "Bank
  accounts" SectionCard + sidebar sub-link sections (#company /
  #address / #bank-accounts / #defaults).
- ✅ **Custom currencies** (migration 0025) — the currency picker on
  onboarding + Business details offers a "Custom currency…" option
  that takes a free-text code + symbol (persisted as
  `company_settings.currency_symbol_override`). On load the settings
  store calls `registerCurrency()` to slot the override into
  `money.ts`'s CURRENCIES map so `formatMoney()` works for any code.
- ✅ **Default UI / PDF font flipped to Akt** (migration 0024) —
  geometric sans replaces Inter as the default for both ui_font and
  pdf_font. Inter is still bundled as a secondary fallback in the
  CSS / Typst cascades for missing glyphs.
- ✅ **Quick-create from calendar** — every cell on `/calendar` (and
  the dashboard embed) offers two paths to spin off a new document:
  left-click for the day-detail modal's "Create on this day" footer
  buttons, right-click for a UContextMenu with the same actions.
  The picked date threads through to the New modal as the draft's
  `issue_date` (for quote / invoice / bill) or `voucher_date` (for
  voucher). Quote / invoice / bill takes
  `?new=1&issued=YYYY-MM-DD`; voucher takes `/vouchers/new?date=…`.
- ✅ **StatChip `neutral` colour variant** for informational counts
  (muted-text filled label + matching outline). Used on the
  calendar's `Shown` summary chip; available for any future
  count-with-no-semantic-tone use case.
- ✅ **Row context menu + bulk PDF on bills / vouchers / vendors** —
  brings the last three holdouts into the same shape every other
  list page uses. Bills and vouchers get the multi-select column +
  selection action bar + progress modal for bulk PDF; vendors gets
  the row-action menu with View bills / Edit / Archive (no PDF —
  vendor records don't generate documents on their own). The
  per-document detail pages now delegate their PDF payload building
  to two new shared libs: `bill-pdf.ts` and `voucher-pdf.ts`
  (matching the quote / invoice / payslip pattern).
- ✅ **Per-document PDF header override** — quotes / invoices / bills
  gain an optional `title_override` column (migration 0027). A small
  "PDF header" input on each detail page lets the user replace the
  default big header (QUOTATION / INVOICE / BILL) with anything they
  type — "Development quote", "Pro-forma invoice", "Recurring bill".
  The PDF builder upper-cases the value at render time; leaving the
  field blank falls through to the hardcoded default. Vouchers and
  payslips are left as-is — voucher meaning is Receipt/Payment, and
  PAYSLIP is legally constrained.
- ✅ **Split party-snapshot cards on quote / invoice / bill detail
  pages** — the single Client & project / Bill from card became two
  side-by-side UCards at lg+: a Reference card (form fields,
  col-span-2) and a party-snapshot card (Quote to / Bill to / Bill
  from, col-span-1, `lg:col-start-3` + `lg:row-start-1`). At md they
  stack with the snapshot on top via DOM order so the "who is this
  for / from" block leads the page when the column is single.
  Refresh-snapshot button is icon-only on all three pages so the
  narrow card title doesn't squeeze.
- ✅ **Cross-doc shortcuts on the party-snapshot card** — quote /
  invoice / bill detail pages now expose two actions on the party
  snapshot card: **Open client / Open vendor** (routes to the
  address-book detail page) and **View all quotes / View all invoices
  / View all bills** (pre-filters the destination list by the party,
  same setStore-filter + route pattern the clients / vendors detail
  pages already use). Sits below the snapshot block separated by a
  border-t so it reads as a footer action row.
- ✅ **Reports module — Profit & Loss** (Tier 1, first cut). New
  `/reports` section under its own sidebar group with a landing card
  grid. The P&L page (`/reports/profit-loss`) is accrual-basis:
  income from issued invoices, less expenses from open bills and
  issued payslips, filtered by a date range. Six preset chips (This
  month / Last month / This quarter / This year / Last year /
  Fiscal year — the last reads `company_settings.fiscal_year_start_month`
  so SL gov FY works without configuration). Amounts use
  `subtotal_cents` on invoices / bills (VAT is a pass-through, not
  revenue / expense) and `earnings_cents` (gross) on payslips. Three
  KPI tiles + breakdown table with `% of income` column + per-source
  drill-down tables (clickable rows route to the underlying document).
  All math in-memory on already-loaded stores — fine at expected
  per-tenant volumes; SQL-side aggregation is a future PR if a tenant
  ever crosses ~10k rows.
- ✅ **Reports module — VAT report** (Tier 1, second cut). New
  `/reports/vat` page mirroring the P&L's shape: same filter strip,
  same six date presets, same three-tile layout (Output VAT / Input
  VAT / Net VAT). The math is the VAT-only complement of the P&L:
  Output VAT = sum of `invoices.tax_cents` for sent invoices in
  range, Input VAT = sum of `bills.tax_cents` for non-cancelled bills
  in range, Net = Output − Input. Negative net renders as an
  Input-VAT credit carrying forward (Sri Lankan IRD treatment).
  Drill-down tabs (Invoices / Bills) include a VAT column alongside
  subtotal so users can verify line-by-line against tax-return source
  data. The roadmap landing card grid now lists both P&L and VAT
  live; aged receivables / payables / cash flow / sales-by-client /
  payroll-register remain "Coming" tiles.
- ✅ **Reports module — Cash flow** (Tier 1, fifth cut). New
  `/reports/cash-flow` page — the cash-basis complement to P&L. Where
  P&L counts on document issue dates (accrual), cash flow counts on
  voucher dates (when the money actually moved). They can legitimately
  disagree for the same period — both correct, different questions.
  Three KPI tiles (Receipts in / Payments out / Net), monthly
  breakdown table that emits a row for every month in the picked
  range (even empty ones, dashed, so the user can see the full extent
  of the period and spot dry months), and drill-down tabs (Receipts /
  Payments) on ResizableDataTable with the standard 50-per-page
  default. Math is pure voucher-store aggregation —
  `voucher_type === 'receipt'` summed for in, `payment` for out, both
  filtered by `voucher_date` in range. PDF export via the existing
  `report.typ` template — same shape as P&L / VAT.
- ✅ **Reports module — Aged payables** (Tier 1, fourth cut). New
  `/reports/aged-payables` page — exact mirror of aged receivables
  with bills + vendors swapped in: "who we owe money RIGHT NOW",
  same five buckets keyed off `bills.due_date`, same KPI shape, same
  per-vendor ResizableDataTable + PDF export. Only `open` bills with
  positive balance count; cancelled and fully-paid drop off
  naturally. Click a vendor row to jump to `/bills` pre-filtered by
  vendor_id. Builder is a verbatim mirror of the receivables
  payload — same `report.typ` 7-column case, same currency-stripped
  per-cell amounts, same grid lines. The only structural change
  needed across the codebase was the new page + builder + landing
  card + sidebar link.
- ✅ **Reports module — Aged receivables** (Tier 1, third cut). New
  `/reports/aged-receivables` page — a snapshot report ("who owes us
  money RIGHT NOW") rather than a date-range view. Outstanding invoice
  balances are bucketed by days past `due_date`: Current (not yet due)
  / 1-30 / 31-60 / 61-90 / 90+. Only sent invoices with a positive
  balance count — drafts and cancelled never appear, fully-paid drop
  off naturally. Balance is `invoicesStore.balanceCentsFor()` so this
  report can never disagree with the dashboard tile or P&L drill-downs.
  Three KPI tiles (Total outstanding / Overdue / Current) + a bucket
  distribution table with count + amount + % of total + a per-client
  breakdown sorted by total descending (worst-aged clients at the top).
  Click a client row to jump to `/invoices` pre-filtered by client_id.
  Same PDF export pipeline as P&L + VAT — `report.typ` learned a
  7-column case for the per-client table (Client + 5 buckets + Total)
  with the client name in a 1fr column and every amount column
  right-aligned.
- ✅ **Reports module — PDF export** for P&L + VAT. New generic Typst
  template `src-tauri/templates/report.typ` shared by both reports —
  the JSON payload drives title, period subtitle, three KPI summary
  tiles, breakdown table with totals row, and per-source detail
  sections (each on its own page so the summary is filable
  separately). Adding a new report = a new payload builder in
  `app/lib/report-pdf.ts`, no Rust change. New Rust command
  `export_report_pdf` registered alongside the existing
  `export_*_pdf` commands; reuses the shared `render_pdf()`
  plumbing for logo handling + font path + typst sidecar. PDF
  preview modal + Save-as flow uses the same `usePdfPreview`
  composable every document detail page already does. Reports
  skip the per-type owner-password protection toggle (entry in
  `PROTECT_FLAG` is null — reports always render unencrypted; the
  per-type protection is an invoice/quote/bill/voucher/payslip
  concern).
- ✅ **Bank reconciliation** — shipped. Standard-scope reconciliation:
  CSV import with column-mapping UI (per-bank last-mapping recall),
  auto-suggest matches (amount + date ±3d + reference token overlap,
  scored), one-click voucher creation from unmatched rows. Persisted
  statement rows via two new tables (`bank_statement_imports` +
  `bank_statement_rows`), dedupe via sha256 hash so re-imports skip
  duplicates. `vouchers.business_bank_id` FK added (migration 0033)
  so matching is cleanly scoped per bank.
- ✅ **Google Drive backup & restore** (v0.160.0) — manual "Back up now" +
  reminder banner, restore from the welcome screen. User's own Drive via
  OAuth (`drive.file` scope only); DB snapshot zip + attachments uploaded once
  each; 10-snapshot retention to Drive trash; encrypted businesses stay sealed.
  See the "Google Drive backup" section for the layout + landmines.
- ✅ **Letters** — shipped. Free-form rich-text correspondence
  (service letters, internship confirmations, anything) composed on
  the business letterhead and rendered to PDF via `letter.typ`. New
  `letters` table (migration 0040) — no lines, no snapshot, always
  editable. Rich text via **TipTap** (`RichTextEditor.vue`, StarterKit:
  bold / italic / underline / heading / bullet + numbered lists),
  stored as ProseMirror JSON in `body_json`; a pure, unit-tested
  `app/lib/letter-body.ts` normalises it to a block tree that the Typst
  template renders recursively (no markup-injection risk). Per-letter
  **pre-printed** toggle switches between app-rendered letterhead
  (header logo + footer, like invoices) and reserved blank top space for
  physical stationery. Editable, clearable, non-gapless `LET-YYYY-NNNN`
  reference. `/letters` list (search + category filter + row actions) +
  `NewLetterModal` + `/letters/[id]` detail (Letter-details + Recipient cards
  side by side); duplicate-to-clone. Sidebar "Correspondence" group.
  **Categories are a managed list** (`letter_categories`, migration 0041) —
  `LetterCategoryPicker` (search-or-create) on the modal + detail; managed on
  the new **`/settings/letters`** page (Business group) alongside the
  **pre-printed top margin** (`company_settings.letter_preprinted_top_margin_mm`,
  read by `letter.typ`) and a "coming soon" letterhead-templates placeholder.
  Rich text uses TipTap's official `useEditor` + `immediatelyRender: false`
  (a hand-rolled `new Editor` in `onMounted` did NOT bind to `EditorContent` —
  that was the "rich text doesn't work" bug); `@tiptap/pm` is an explicit dep.

### Deferred / open items

- **Cmd/Ctrl+K command palette** — biggest "feels native" win still
  outstanding. Routes + recent docs + new-thing actions in one input.
- **Mac titlebar visual QA** — Approach A (overlay-style traffic
  lights) was committed but never hands-on tested. Need to verify the
  78px reservation, 28px height, and title alignment on real macOS
  builds.
- **Firewall rule for the phone-upload server** — the phone-upload
  feature runs a LAN HTTP server, so the OS firewall must allow inbound
  connections to the app. It works on machines where the user has
  already allowed the app; the production installer should add a
  program-scoped inbound rule so end users don't hit a silent block.
- **Drag-drop reorder for `PayslipLineEditor`** —
  `DocumentLineEditor` already has it (grip handle + HTML5
  drag/drop in both bundle + itemized modes); `PayslipLineEditor`
  still uses up/down arrow buttons.
- **Localised dates in list pages** — list tables show raw
  `2026-05-05` strings. Could use `Intl.DateTimeFormat`.
- **Soften schema-version gate on import** — currently refuses if
  bundle's `schema_version != current`. Future: per-version restore
  adapters.
- **Statutory auto-compute — cumulative/YTD APIT** — EPF/ETF (migration
  0035) and monthly-table PAYE/APIT (migration 0036, app/lib/statutory.ts
  `computePaye`) now auto-compute on payslips. Cumulative (IRD Table 5),
  lump-sum/bonus tables, and per-line PAYE-exempt flags remain future work.
- **Per-tenant default payslip lines** — settings panel that seeds
  every new payslip with a configurable list (Basic, EPF, etc.).
- **Code-signing the installers** — currently unsigned; SmartScreen
  warns on first run.

### Roadmap — what's missing to call this a complete bookkeeping app

Snapshot taken 2026-05-24 after the multi-bank / custom-currency /
calendar-quick-create batch landed. The app today is solidly an
**invoicing + expense + payroll tracker with PDFs**. To cross into
"real bookkeeping software" territory in the user's perception, this
is the gap list — ordered by impact, not effort.

**Tier 1 — biggest single gap: a reports module.** All the data is
already in the DB; nothing aggregates it for a date range. Build a
`/reports` section that mirrors the document-list shape (filter strip
+ printable Typst PDF) and bake in:

- **Profit & Loss** — invoice income − bill expenses − payslip net,
  by date range. Could group by month or by category.
- **VAT / tax report** — output VAT (sum of tax lines on issued
  invoices) vs input VAT (sum of tax lines on open/paid bills), net
  payable for the period. This is the one a Sri Lankan business
  *actually needs* to file VAT returns.
- **Aged receivables** — outstanding invoices bucketed by days past
  due (0–30 / 31–60 / 61–90 / 90+). Dashboard chart exists but no
  printable / per-client breakdown.
- **Aged payables** — same shape on bills.
- **Cash flow report** — receipts − payments by month for any range.
  The dashboard chart is 12-month only.
- **Sales by client** + **expenses by vendor** for a date range,
  with drill-down to underlying documents.
- **Payroll register** — every payslip in a period with employee /
  earnings / deductions / net / paid columns. Most of the data is
  already on the payroll dashboard; this just exports it.

**Tier 2 — meaningful workflow features still missing:**

- ✅ **Credit notes / refunds** — shipped. `credit_notes` +
  `credit_note_lines` (migration 0029) mirror the invoice shape with an
  optional `source_invoice_id`. Since v0.159.0 they actually move the
  books: a linked issued credit note reduces that invoice's derived
  balance (and can flip it to the `credited` status), and issued credit
  notes are deducted from output VAT and P&L income by their OWN
  issue_date. Unlinked ones come off the client total as an "unapplied
  credit" in aged receivables + the statement PDF. Credit-note PDF
  rendering is still outstanding.
- ✅ **Customer statements** — shipped. Printable point-in-time PDF of
  every outstanding invoice for one client, with five aging-bucket
  tiles + per-invoice rows (issue / due / total / paid / balance /
  days overdue). Generated from `/clients/[id]` via the "Statement"
  header button; disabled when the client has nothing outstanding.
  Uses a dedicated `statement.typ` (party-block hero + bucket tiles +
  7-column invoice table) — too far off the report.typ shape to
  reuse cleanly. New `export_statement_pdf` Rust command +
  `app/lib/statement-pdf.ts` payload builder. No DB schema — like
  reports, statements are ad-hoc and never archived.
- ✅ **Recurring invoices** — shipped. Templates that materialise as
  draft invoices on a user-initiated cadence (weekly / monthly /
  quarterly / yearly). `/recurring-invoices` list page shows the
  pending count and a one-click bulk-generate modal; per-template
  detail page tunes the schedule + invoice defaults + line items.
  Generation is **user-initiated** — no background job, no Tauri
  command, just sequential SQL inserts that allocate the next
  invoice number, clone the template's lines (with totals recomputed
  from current qty/price/VAT), advance `next_issue_date` by one
  frequency step, and bump the `invoices_generated` counter.
  Generated invoices are always drafts — the user reviews on
  /invoices before issuing, which is the safety net for one-off
  edits. Templates can be paused (kept in the list, doesn't show as
  pending) or deleted (already-generated invoices stay intact, since
  they're real rows independent of the template).
- ✅ **Recurring bills** — shipped. Vendor-side mirror of recurring
  invoices: templates that generate real unpaid bills on the same
  user-initiated cadence (weekly / monthly / quarterly / yearly).
  `/recurring-bills` list page shows the pending count and a
  one-click bulk-generate modal; per-template detail page tunes the
  schedule + bill defaults + line items + the bill-category picker
  (bills have categories, invoices don't). Generated bills land in
  status `unpaid` (not draft — bills don't have a draft state), so
  they're real liabilities on your books the moment they materialise.
  Payment via the existing voucher flow. Same store / page shape as
  recurring invoices with vendor swapped for client and no bank /
  project-title fields (vendor invoices don't carry those).
- ✅ **Bank reconciliation** — shipped. CSV statement import with
  column-mapping UI (per-bank last-mapping recall), scored
  auto-suggest matches (amount + date ±3d + reference token overlap),
  one-click voucher linking, and a "create voucher from unmatched
  row" flow. Persisted statement rows via two new tables; SHA-256
  dedupe so re-imports skip duplicates. `vouchers.business_bank_id`
  FK added so matching scopes per bank. See migrations 0033 + 0034.
  Manual tick-off mode (for users whose bank only emits PDFs) is a
  planned follow-up.

**Tier 3 — niceties, low-leverage:**

- **Products / services catalog** — reusable line items so users
  stop retyping descriptions on every invoice.
- **Year-end closing / period lock** — refuse edits to documents
  in a closed fiscal year. The immutability rules cover most of
  this already; this would just lock everything older than X.
- **Cmd/Ctrl+K command palette** — also on the Deferred list above.
- **Email invoice directly** — currently PDF + manual attach.
  Requires SMTP config + an outbox UI.

**Explicitly out of scope:**

- Full double-entry chart of accounts. Overkill for the audience;
  the immutable-document + voucher-ledger model already gives them
  what they need without making them learn debits / credits.
- Multi-currency *per document*. One currency per business is a
  golden rule (Golden rule #8).
- Inventory with stock levels. Service-business focus; only matters
  if they sell physical goods.
- Time tracking. Out of scope for the audience.

If you're planning the next iteration: **Tier 1 reports first** —
P&L + VAT + aged receivables alone close 80% of the "is this real
bookkeeping software" perception gap. Credit notes are the
next-most-impactful add after that.

**Status (2026-05-28):** P&L + VAT + aged receivables + aged payables
+ cash flow + report PDF export shipped — Tier 1 reports module is
complete. **Sales by client + Expenses by vendor + Payroll register**
also shipped. Credit notes (Tier 2) shipped. Customer statements
(Tier 2) shipped. Recurring invoices + Recurring bills (Tier 2)
shipped. **Bank reconciliation (Tier 2) shipped** — CSV import,
suggestion-based matching, voucher creation from unmatched rows.
EPF/ETF statutory auto-compute shipped (migration 0035) and
monthly-table PAYE/APIT shipped (migration 0036, app/lib/statutory.ts
`computePaye`). The remaining payroll niceties are cumulative/YTD APIT
+ lump-sum tables. After that, the **Cmd/Ctrl+K command palette** is
the next "feels native" win.

**Status (2026-09-08)** — an audit of the books found three correctness
bugs, all now fixed:

- **Credit notes were inert.** The feature shipped end-to-end in the UI
  and moved no figure anywhere — the only SQL reading `credit_notes` was
  in its own store, for its own list-page count. Issuing a credit note
  for a returned sale still declared the original output VAT. Worse, the
  store's comments *claimed* the offset existed and deferred it to the
  invoices store, where no such code lived. Wired into invoice balance /
  derived status / output VAT / P&L income / aged receivables / statement
  PDF / dashboard tile / clients-list outstanding in v0.159.0.
- **P&L understated payroll** by employer EPF (12%) + ETF (3%) —
  `earnings_cents` (gross) only. Profit was overstated by up to ~15% of
  EPF-liable payroll. The correct figure already existed in
  `app/lib/payslip-pdf.ts`, which prints total employer cost on every
  payslip; only the reports disagreed. Fixed in v0.158.5.
- **Test coverage was inverted.** 290 tests, all pure functions, but the
  three most invariant-critical modules had none — `money.ts` (Golden
  Rule #1), `numbering.ts` (Golden Rule #6), `payroll-cycle.ts` — while
  `license.rs` (dead code) did. Backfilled in v0.158.4; suite is now 337.

Two behaviours were pinned as-is rather than changed, both documented in
`money.test.ts`: `toCents("-0.005")` returns `-0` (harmless — `-0 === 0`,
and `formatMoney`'s sign test is false for it), and `formatMoney(-5)`
renders `"$ -0.05"` with the sign after the symbol.

**Still open from that audit** (deliberately not acted on): no balance
sheet is possible without double-entry (out of scope — see "Explicitly
out of scope" above, reconfirmed 2026-09-08);
inter-bank transfers and owner capital / drawings have nowhere to go and
currently distort cash flow + P&L; `bill_categories` is flat, so a laptop
and an electricity bill both land in P&L as expense; and the dead
licensing surface is still compiled with three registered Tauri commands.

---

## Known landmines

- **Don't `await` Pinia state assignments inside the store's setup** —
  the store hasn't returned yet, so dependent stores see undefined.
  Use `onMounted` or method calls.
- **Navigating away does NOT reset page state — `app.vue` renders
  `<NuxtPage keepalive>`.** The component is cached, not unmounted, so every
  `ref` survives and comes back the next time the page activates. Any handler
  that ends in `router.replace(...)` must explicitly clear what it set;
  relying on unmount is a bug. This shipped twice: the payslip and credit-note
  delete handlers left `confirmDelete = true` and `busy = true` on the success
  path, so the confirm dialog reopened — Delete button spinning — on the next
  document the user viewed. The other five detail pages were unaffected only
  because they close the dialog before awaiting. Reset in a `finally`, and
  remember this applies to any long-lived flag (modals, loading, wizard step),
  not just delete.
- **Keep-alive has THREE more faces — know how pages are keyed.** Nuxt keys a
  cached page on its PATH with params substituted, NOT the query. So
  `/invoices/12` and `/invoices/13` are separate instances (reading
  `route.params.id` once in setup is fine), while `/invoices` and
  `/invoices?new=1` — and `/vouchers/new?invoice=1` visited twice — are the
  SAME instance whose `setup()` / `onMounted` already ran. Use the shared tools:
  - **`useQueryTrigger`** for one-shot `?new=1` shortcuts. Never read a
    trigger query in `onMounted` — it fires once per session, then the
    shortcut silently does nothing and the param sticks in the URL. It is a
    WATCH, not `onActivated` (the query isn't reliably settled at activation —
    see the note in `vouchers/new.vue`). Consume a param after applying it, or
    an unchanged value never re-fires (`/payslips?employee=` does this by hand).
  - **`useRehydrateOnActivate`** on every detail page. Without it a document
    issued/archived/deleted elsewhere renders its stale cached copy, and Back
    after Delete resurrects the row. It skips while dirty to preserve edits —
    which is exactly why Golden Rule #5 is ALSO enforced in the stores
    (`assertEditable` in `app/lib/document-guards.ts`): a stale "draft" page
    must not be able to save over an issued document.
  - **A `/new` route is one cached instance.** After a successful create,
    reset the form BEFORE/after navigating away (`BLANK_FORM` on the
    address-book pages, `applyPrefill()` on `/vouchers/new`), or the next
    "New" reopens pre-filled with the save bar up — one click from a duplicate.
  List pages must also refresh their header stats in `onActivated`
  (`useServerTable` only refetches the rows), and a redirect-only page must use
  `definePageMeta({ redirect })`, not `router.replace()` in setup.
- **Invoice balance is computed in SEVEN places and they must move together.**
  `total − receipts − issued credit notes`, floored at zero, lives in:
  1. `deriveInvoiceStatus` / `balanceCentsFor` — the pure TS path
  2. `invoiceDerivedFrom()` in `app/lib/derived-status.ts` — the mirrored SQL
     for server-paginated lists (its header comment states the mirror rule)
  3. `getInvoiceKpis()` in `app/lib/dashboard-data.ts` — a hand-rolled query
     that aggregates server-side in one round trip
  4. `buildCustomerStatementPdfPayload` in `app/lib/statement-pdf.ts` — takes
     `paidCentsFor` / `creditedCentsFor` injected and does its own arithmetic
  5. `buildInvoicePdfPayload` in `app/lib/invoice-pdf.ts` — takes `paidCents` +
     `creditedCents`; `paid-block` in `common.typ` prints a Credited row
  6. `fetchInvoiceEvents` in `app/composables/useCalendarEvents.ts` (SQL) +
     `buildInvoiceEvent` in `app/lib/calendar-events.ts`
  7. `/vouchers/new` — Remaining + the overpayment warning
  Only 1 routes through `balanceCentsFor`. Copies 3–4 were missed when credit
  notes were first wired in, and 5–7 were missed AGAIN by that fix — a fully
  credited invoice went to the client as a PDF showing its whole total due.
  The symptom of drift is two surfaces disagreeing about one invoice.
  **`bun run verify:sql` is the guard** for the SQL copies: it runs the real
  query strings (dashboard, calendar, and the lifecycle-guard counts, each read
  out of its source file so it can't drift from what's asserted) against a real
  SQLite DB built from the migrations. Run it after touching any of them.
- **An issued credit note PINS its invoice.** Cancel, revert-to-draft, the
  universal delete, and quote revert-conversion all go through
  `invoices.assertMutable` (→ `invoiceMutationBlocker`), which counts receipts
  AND issued linked credit notes via direct SQL. `credit_notes.source_invoice_id`
  is `ON DELETE SET NULL`, so deleting the invoice would otherwise silently turn
  the note into an UNAPPLIED client credit that nets off unrelated invoices;
  cancelling it would leave the note reversing income + VAT that was never
  recognised. Cancel or un-issue the credit note first.
- **Every Typst template with a bespoke footer must read `footer_blocks`.** The
  builders always send it; `voucher.typ` / `report.typ` / `statement.typ`
  hard-coded their footer line and silently ignored the custom footer for
  months. When touching a template, prove the DEFAULT output is unchanged:
  build a real payload with the shipped builder, render through the sidecar
  before and after, and compare hashes (footer off must be byte-identical,
  footer on must differ). Also: never pass a nullable field straight to
  `#set document(author:)` — `none` is a type error; use
  `if x != none { x } else { () }`.
- **PDF builders in `app/lib` use RELATIVE runtime imports** (`./money`, not
  `~/lib/money`). The `~/` alias resolves in Nuxt but not under vitest or bun,
  so an aliased runtime import makes the builder untestable and unusable from
  a verification script. `import type … from "~/…"` is fine (erased).
- **Letter references use `advanceDocumentCounter` / `allocateNextFreeReference`,
  never `allocateSpecificDocumentNumber`.** Letters are non-unique by design, and
  the uniqueness pre-check caused a permanent stall: a letter hand-numbered
  ahead made every later suggestion collide, the throw was swallowed, and the
  counter never moved. Every OTHER document type must keep the checking path.
- **Frozen payroll figures stay frozen on screen too.** `PayslipLineEditor`
  takes `frozenEmployer`; on an issued payslip pass the row's
  `epf_employer_cents` / `etf_cents` rather than letting it recompute from the
  live settings rates, or a rate change rewrites history on screen only.
- **SQLite `date('now')` is UTC.** Compare due dates against
  `date('now', 'localtime')` (or an inlined local ISO date, as the
  `xDerivedFrom(today)` builders do). Plain `date('now')` made the dashboard
  overdue counts disagree with every other surface for 5.5 hours a day.
- **VAT-inclusive totals are not all representable.** Bundle documents store a
  NET subtotal + rate and derive tax (`bundleTaxCents`, banker's rounding — use
  it, never `Math.round`). `gross = net + round(net × rate)` skips values: at
  18%, ~15% of cent amounts (Rs 100.00 among them) have no net that produces
  them. `splitInclusiveTotal` already lands on the nearest one and returns
  `exact: false`; the pages surface that as a note under the field. Do not try
  to "fix" the one-cent drift arithmetically — brute force shows every drifting
  total is unreachable. Exact inclusive totals need the gross (or tax)
  persisted independently, which is a schema change.
- **Don't add `BEGIN`/`COMMIT` from JS.** See "Connection pool caveat".
- **Don't change `com.sakoram.billing` bundle identifier** — orphans
  user data.
- **Don't change `productName`** lightly — installer filenames change
  + a Windows-installed previous version won't auto-replace. The
  current value is `"Sakoram"` (one word, no tagline). Earlier dev
  builds shipped as `"Sakoram Bookkeeping"`; users who installed
  those have to uninstall the old entry manually since Add/Remove
  Programs keys off the productName.
- **Don't rename `_sqlx_migrations`** — would fail to detect already-
  applied migrations on legacy DBs.
- **Don't `Database.load()` a tenant URL before
  `ensure_tenant_db(id)`** — migrations need to run first.
- **Don't hand-build Windows paths with `${a}\\${b}`** for fs commands.
  Tauri's scope matcher is picky. Use `join()` from
  `@tauri-apps/api/path`.
- **Don't put `font-family` on a layout `<div>`** — overlays teleport
  to `<body>` and miss it. Set `--font-sans` on `:root` instead.
- **Pages must have a single root node.** A leading template comment
  outside the root `<div>` makes Nuxt route transitions render blank.
  Comments live *inside* the root.
- **A new migration file isn't enough** — the SQL is `include_str!`'d
  into the `MIGRATIONS` array in `src-tauri/src/tenants.rs`. Drop a new
  `0019_*.sql` into `migrations/` and forget to add it to that array
  and the migration silently never runs. Bump `SCHEMA_VERSION` in
  `src-tauri/src/data_io.rs` too — and if the migration adds a table
  the user will want exported, append it to the `TABLES` list in the
  same file.
- **Don't expose new Tauri commands without registering them** in
  `src-tauri/src/lib.rs` `invoke_handler!`. The error message ("command X
  not allowed") looks like a permissions issue but is just a missing
  registration.
- **A second `src/bin/*.rs` binary breaks `tauri dev`** unless
  `default-run = "sakoram_billing"` is set in `Cargo.toml` `[package]` —
  `tauri dev` runs `cargo run`, which is ambiguous with >1 binary
  (`mint_license` + the app). `cargo build` / `cargo test` pass anyway; only
  `cargo run` / `tauri dev` surface it (error: "could not determine which
  binary to run").
- **Before merging any old/leftover branch, diff it against main**
  (`git diff --stat main..<branch>`). Two abandoned early-project branches
  (`docs/per-business-encryption-spec`, `style/appearance-2col`) predate most
  of the codebase and would DELETE thousands of lines (license / vault /
  reports) if merged. Don't merge a branch you didn't create this session
  without checking the diff.
- **The `bun run dev` script** runs Nuxt only — no Tauri shell, so
  Tauri-specific APIs (fs, dialog, invoke) will fail. Always use
  `tauri:dev` for full app testing.
- **UModal slot is `#body`, not `#content`.** Putting body content in
  a `#content` slot eats the sibling `#footer` and the dialog renders
  with no buttons — confusing failure mode.
- **Typst resolves module names in DEFINITION ORDER.** A `#let` function can
  only reference names defined *above* it in the same file — self-recursion
  works, but calling a helper defined later fails at render time with
  `unknown variable: <name>`. Appending a new helper to the bottom of
  `common.typ` is therefore only safe if nothing above it calls it. This
  shipped a real bug once: `header-logo` was appended below `doc-header`,
  which calls it, so **any payslip with a header logo failed to render** —
  and it survived review because the verification renders all used
  `logo_file: null`, exercising only the wordmark fallback. When adding a
  shared Typst helper, place it above its callers and render at least one
  case that actually takes the new branch.
- **Typst rejects `length * length`.** `h * m.width / m.height` parses
  left-to-right and multiplies two lengths; parenthesise so the ratio is
  computed first: `h * (m.width / m.height)`.
- **Typst markup quirks** — bare `#` in markup starts an expression;
  `#:` inside a string is fine, but `Account #:` outside a string
  trips the parser. Same for `.map().flatten()` style — use
  `..for x in arr { ( a, b, ) }` to produce table rows.
- **Bundled `.ttf` files must be real fonts.** A saved GitHub HTML
  preview page renamed to `.ttf` will silently fall through the
  `@font-face` parser to system-ui (this happened with Miriam Libre
  before — replaced with the upstream variable file). Verify with
  `strings <file>.ttf | head` — a real TTF starts with binary table
  names like `GPOS`, `GSUB`, `OS/2`, `cmap`.
- **`tauri.conf.json` rejects unknown top-level fields.** JSON has no
  native comment syntax — don't add a `$comment` (or any other
  custom property) to `tauri.conf.json` / `tauri.<platform>.conf.json`
  to document something. Tauri's schema validator fails the build
  with `Additional properties are not allowed`. Put the explanation
  in code comments or the workflow file header instead.
- **iframe `contentWindow.print()` needs same-origin.** Binding an
  iframe directly to a Tauri `asset://` URL (from `convertFileSrc()`)
  means the iframe is cross-origin to the renderer, and any
  programmatic `print()` call is blocked by same-origin policy.
  Build a blob URL from the file's bytes (read via the fs plugin)
  and point the iframe at that — blob URLs inherit the renderer's
  origin. The `PdfPreviewModal` shows the pattern.
- **Tauri checkout actions need v5 for Node 24.** GitHub deprecated
  Node 20 on Actions in June 2026; `actions/checkout@v4` runs on
  Node 20 and will start warning. Use `@v5`. Other actions used
  here (`oven-sh/setup-bun@v2`, `Swatinem/rust-cache@v2`,
  `softprops/action-gh-release@v2`, `dtolnay/rust-toolchain@stable`)
  are already Node-24 compatible.
- **TipTap needs a single ProseMirror copy — `nuxt.config.ts` dedupes it.**
  `@nuxt/ui` bundles its OWN TipTap at a different `prosemirror-model` version
  than the one our Letters editor uses. With both loaded, node schema identity
  differs across copies and every *structural* editor command (bullet/numbered
  lists, Enter/`splitBlock`) throws `RangeError: … multiple versions of
  prosemirror-model` while inline ops (typing, bold) still work — a confusing
  partial failure. Fix: `vite.resolve.dedupe` lists every `prosemirror-*`
  package + `@tiptap/pm`. **Don't remove that dedupe block**, and if you add a
  TipTap extension that pulls a new `prosemirror-*` package, add it to the list.
  A related symptom, `RangeError: Duplicate use of selection JSON ID gapcursor`,
  is HMR state pollution from editing TipTap files with the dev server running —
  restart the server + clear `node_modules/.cache/vite` to clear it.

---

## When in doubt

- Check the comment block at the top of any source file — they explain
  the *why* of decisions that aren't obvious from the code.
- For DB queries, mirror what existing stores do (`select`, `selectOne`,
  `execute` from `app/lib/db.ts`).
- For new Tauri commands, follow the pattern in `src/pdf.rs` —
  `#[tauri::command]`, `Result<T, String>`, register in `lib.rs`.
- For new stores, follow the pattern of `app/stores/clients.ts` (simple
  CRUD) or `app/stores/payslips.ts` (FSM + derived-from-vouchers).
- For new list pages, copy the shape from
  `app/pages/payslips/index.vue` — `<ResizableDataTable>` with PrimeVue
  `<Column>` children, an `itemsFor(row)` callback feeding the row
  context menu and the optional ⋯ overflow, and synthetic `_…` fields
  on each row so by-field sorting matches the rendered cell.
- For lint conformance, the project uses tabs and a fairly strict
  eslint config. `bun run lint` auto-fixes most issues.
- For mount-time store loads on a detail page, use
  `store.ensureLoaded()`, NOT `store.load()`. `ensureLoaded` is the
  load-once cache (Pinia state survives navigation; tenant switch
  hard-reloads the whole page). `.load()` is for explicit refresh
  after a write — keep that path as-is. Detail pages doing `.load()`
  on mount were re-fetching hundreds of rows per click; see PR #216.

---

## Conventions for AI-authored code

The user's `~/.claude/CLAUDE.md` says:
- Use **bash on Windows 11** (Git Bash). Frame shell commands accordingly.
- **Don't add Claude Code footer** to git commit messages.
- Never push directly to `main` — always branch and open a PR.

The project itself doesn't enforce a commit-message format — match the
existing `git log` style if making commits.

**Pure, unit-testable logic goes in `app/lib/`, never in a store** —
vitest runs in node; importing a Pinia store drags in `~/lib/db` (Tauri)
and the test fails to resolve the module. Pattern: a pure `*.ts` +
`*.test.ts` in `app/lib/` (e.g. `calendar-events`, `quote-query`,
`list-query`, `derived-status`), imported by the store / composable / page.

**`ResizableDataTable`'s generic is `T extends Record<string, unknown>`** —
concrete row interfaces (QuoteRow, etc.) trip a `:rows` / `:row-actions`
typecheck error on *every* list page. Pre-existing + codebase-wide; the
gate is `bun run lint` / `bun run generate`, not `nuxi typecheck`.

**Branch workflow — every new piece of work follows this.** No
exceptions, even for one-line fixes:

1. **Sync main first.** `git checkout main && git fetch origin && git pull --ff-only`. If the pull refuses because of leftover edits from a prior merged PR (typical after `gh pr merge --squash`), stash or `git checkout --` the offending file and pull again.
2. **Branch from main.** `git checkout -b <type>/<short-slug>` (e.g. `feat/quote-date-filters`, `fix/save-button-disabled`, `chore/gitignore-tsbuildinfo`).
3. Do the work, lint, commit. Bump the version (rules below).
4. `git push -u origin <branch>` then `gh pr create …`.
5. After review, `gh pr merge <num> --squash --delete-branch`.
6. Back to step 1 for the next task — pull main again before branching.

Never start work directly on `main`, never branch off another feature
branch, and don't reuse a branch after its PR was merged (the squash
commit on remote has different content than the local branch tip).

**Don't auto-open PRs.** The user prefers to confirm before `gh pr create`
fires. Push the branch, summarise what shipped, then wait for "open the
PR" or "make a pr" before opening.

**Bump the version on every PR.** Pre-1.0, use a minor bump (`0.X.0`)
for new features and a patch bump (`0.X.Y`) for fixes / chores. Three
files must stay in sync:

- `package.json` → `version`
- `src-tauri/Cargo.toml` → `[package].version`
- `src-tauri/tauri.conf.json` → `version`

`src-tauri/Cargo.lock` picks up the new version automatically the next
time cargo runs (rust-analyzer in the editor usually does it for you);
commit it alongside the other three.
