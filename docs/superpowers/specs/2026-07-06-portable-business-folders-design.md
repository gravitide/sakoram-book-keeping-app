# Portable business folders — design

**Date:** 2026-07-06
**Status:** Approved design, pending spec review → plan

## Goal

Make each business's data a **portable folder the user owns and controls** — a
"document" they can open, close, and move anywhere on disk (external drive,
another PC via USB, a synced-cloud folder at their own risk). The app opens a
business from its folder rather than forcing all data into `%APPDATA%`. This
reinforces the app's local-first, own-your-data ethos (fully offline, no cloud
service).

Explicit **non-goal**: putting a *live* SQLite database in an actively-syncing
cloud folder is a known corruption risk (WAL/-shm/-journal sidecars uploaded
mid-write, conflict copies, two machines opening the same file). We do **not**
solve cloud backup by relocating the live DB. Cloud backup, if wanted, is a
future phase that copies the existing consolidated `.zip` export to a chosen
folder on a schedule. We *warn* about sync folders but never block them.

## Philosophy / decisions locked in

- A business is a **folder** (not a single packed file). The live `.db` stays a
  real on-disk file — no pack/unpack — so there is no crash-safety/corruption
  risk and it's fast.
- The existing consolidated **`.zip` export stays** as the single-file
  snapshot/transport format (hand to accountant, archive, drop in cloud).
- **App-level state stays in `%APPDATA%`**; only *business* data moves to the
  folder.
- **Clean cutover, no migration.** Pre-1.0, data is disposable
  (CLAUDE.md "Pre-1.0 status"). The old `%APPDATA%/businesses|logos|pdf-headers|attachments`
  layout is dropped, not migrated.

## Storage layout

**`%APPDATA%\com.sakoram.billing\`** — app-level / per-machine only:

```
tenants.json     ← registry (index of known businesses + where they are)
license.json     ← per-install trial/license state (per-machine; never travels)
```

**A business folder** (user-chosen location) — everything for that business:

```
<Safe Business Name>/
  business.json                       ← marker (self-describing)
  business.db                         ← the SQLite file (fixed name)
  attachments/<document_type>/<document_id>/…
  logos/logo.<ext>                    ← square identity logo
  pdf-header.<ext>                    ← optional wide letterhead image
  business.db.enc + business.vault.json   ← only when encrypted
  .lock                               ← present while the business is open (P2)
```

### Marker file `business.json`

Makes the folder self-describing so "Open" can validate a folder and rebuild a
registry entry even on a fresh machine:

```json
{
  "id": "<stable id>",
  "name": "Acme Trading",
  "schema_version": 39,
  "created_at": "2026-07-06T…",
  "encrypted": false
}
```

`id` is the stable business identity (used by the registry, vault session keys,
etc.). Filenames inside the folder are **fixed** (`business.db`), since the
folder is the container — the id is not encoded in filenames anymore.

## Registry (`tenants.json`)

```json
{
  "active_tenant_id": "<id | null>",
  "tenants": [
    { "id": "…", "name": "…", "path": "<abs folder path>", "logo_file": "logo.png", "encrypted": false }
  ]
}
```

`path` is the absolute business-folder path. The registry is a **recent-list
index**; the folder is the source of truth (via its marker).

## Folder naming (safe name from business name)

When creating a business the folder name derives from the business name,
sanitized to a filesystem-safe name:

- Replace illegal characters `\ / : * ? " < > |` and control chars (0x00–0x1F).
- Trim leading/trailing whitespace and trailing dots (Windows).
- Collapse repeated whitespace; cap length (~64 chars).
- Guard Windows reserved device names (`CON PRN AUX NUL COM1–9 LPT1–9`) by
  suffixing (e.g. `CON` → `CON_`).
- If the result is empty, fall back to the `id`.
- De-dupe within the chosen parent: append ` (2)`, ` (3)`, … if the folder
  already exists.

The folder name is **cosmetic** — identity is the `id`. Renaming a business
later updates `name` in the marker + registry but does **not** move/rename the
folder (avoids moving files that may be open; matches the current "rename
changes name only" invariant). Pure logic lives in a unit-tested
`app/lib/safe-folder-name.ts`.

## Operations

- **New business** — enter name → pick a **parent** location (folder dialog) →
  app creates `<parent>/<safeName>/`, writes `business.json`, creates
  `business.db` and runs migrations, seeds default categories/settings →
  registry entry → activate (hard-reload to `/`).
- **Open business** — folder dialog → validate the folder has `business.json` +
  `business.db` → add/refresh registry entry (rebuild from marker) → activate.
- **Close business** — deactivate → welcome screen. Registry entry stays.
- **Missing/moved folder** — when a registry `path` no longer exists, show
  "Not found at `<path>` — **Locate** / **Forget**" rather than crashing;
  Locate re-points to the moved folder (validated via marker), Forget drops the
  registry entry (files untouched).
- **Forget** (remove from list, keep files) vs **Delete** (remove the folder).
- **Export** — unchanged consolidated `.zip`.

## Path-resolution refactor

Replace "`app_data_dir()` + `<type>/<id>`" with "`businessDir(id)` +
`<type>/…`". `businessDir(id)` resolves from the registry `path`.

Surface:

- **Rust:** `tenants.rs` (registry, ensure/create DB, migrations, stale-file
  cleanup — drop legacy `migrate_legacy_db`), `pdf.rs` (attachment import, PDF
  header logo, work dirs already use `app_local_data_dir` and are unaffected),
  `data_io.rs` (export/import read/write within the folder), `phone_upload.rs`
  (attachment import target), `vault_fs.rs` (vault blob/json + working `.db`
  paths now inside the business folder).
- **JS:** `stores/tenants.ts` (registry bridge, `dbUrl` = `sqlite:<path>/business.db`),
  `lib/db.ts` (unchanged — already reads `tenants.dbUrl`), `stores/document_attachments.ts`
  (attachment paths), logo/PDF-header uploads in `pages/settings/company.vue`,
  `pages/settings/pdf.vue`, `pages/onboarding.vue`, and the welcome / Businesses
  pages (New/Open/Close/Locate/Forget/Delete UI).

## Capability / fs scope

Rust file IO uses `std::fs`, which is **not** gated by Tauri capabilities — so
all Rust-side ops on arbitrary paths already work. Only a few **frontend
`@tauri-apps/plugin-fs`** calls touch the business folder (logo / PDF-header
upload writes; PDF-preview reads a temp under `$APPLOCALDATA`, unaffected).

Decision: **broaden the frontend `fs` scope** (`capabilities/main.json`
`fs:allow-{read,write,mkdir,exists,remove}`) to cover user-chosen paths — add
`$HOME/**` (and equivalents) so writes into an arbitrary business folder are
permitted. Alternative (kept in reserve): route those specific writes through a
Rust command to keep the scope tight. Capability changes require a Rust rebuild.

## Encryption + license

- **License** stays in `%APPDATA%/license.json` — trial/license is per-machine
  (bound to OS keychain + machine id), must never travel with a portable folder.
- **Encryption** (vault) moves into the business folder: `business.db.enc` +
  `business.vault.json`, with the decrypt-on-unlock working file being
  `business.db` inside the folder. The `resetDbCache()`-before-reseal landmine
  and the "never `ensure_tenant_db` on an encrypted-locked tenant" gate carry
  over unchanged, just repathed. The cloud-sync caution matters doubly here
  (the plaintext working `.db` exists while unlocked).

## Safety rails

- **Cloud-sync caution (P2):** when the chosen path matches known sync roots
  (OneDrive, Dropbox, Google Drive, iCloud Drive), show a non-blocking warning
  that a live DB in a syncing folder can corrupt and to use Export for cloud
  backup instead. Never blocks.
- **Single-instance lock (P2):** write a `.lock` file in the folder while open
  (pid/host/timestamp); on open, if a fresh lock exists, warn that the business
  looks open elsewhere. Guards the two-machines-on-one-synced-folder case.
  Cleared on close / lock-on-window-close.

## Phasing

- **P1 — core:** registry-with-paths; New / Open / Close; all business file
  paths resolve from the folder; safe-folder-name util; fs scope broadened;
  welcome + Businesses UI; clean cutover (drop old appdata layout). Encryption
  repathed in lockstep (or temporarily gated if it balloons — decide in plan).
- **P2 — robustness:** missing-folder Locate/Forget, marker validation on Open,
  cloud-sync caution, single-instance `.lock`.
- **P3 — later, separate spec:** automatic scheduled backup (copy the `.zip`
  export to a chosen folder on a cadence).

## Testing

- Pure `safe-folder-name.ts` fully unit-tested (illegal chars, reserved names,
  empty fallback, length cap, de-dupe).
- Manual: create in a custom folder; close/reopen; move the folder and Locate;
  Forget vs Delete; encrypted business round-trip; export/import within the new
  layout; sync-path caution copy.

## Open questions (proposed defaults; flag to change)

- Folder name is a **plain folder** (no `.sakoram` suffix — dotted folders are
  awkward on Windows). ✅ proposed.
- New picks a **parent** and we create the safe-named subfolder. ✅ proposed.
- Rename updates name only, not the folder. ✅ proposed.
