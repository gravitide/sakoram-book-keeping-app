# Google Drive backup & restore — design

**Date:** 2026-09-19
**Status:** Approved 2026-09-19 → plan: `docs/superpowers/plans/2026-09-19-google-drive-backup.md`

## Goal

Disaster recovery. If the user's PC dies, they install Sakoram on another
machine, sign in to Google, and get their business back — database, logos and
every attachment.

Sakoram is free, so we cannot host storage. The backup lives in **the user's own
Google Drive** (their free 15 GB). Setup is "Sign in with Google" — no API keys,
no bucket, no card.

Secondary use: the same restore moves a business to a second machine (PC →
laptop). That is a deliberate restore of a point-in-time copy, **not sync**.

## Decisions locked in (from brainstorming)

- **Google Drive, not Cloudflare R2/D1.** R2 needs an account + card + scoped
  token — too much friction for the audience. D1 cannot hold a SQLite file and
  row-level sync would break atomic numbering (Golden Rule #6).
- **Backup and restore only. No sync, no merge, no conflict handling.** Backup is
  a one-way push; restore is an explicit user action. Snapshots are timestamped
  and never overwritten, so there is nothing to conflict.
- **Manual trigger + reminder.** A "Back up now" button, and an in-app reminder
  when the last backup is stale. No scheduler, no background job, and **nothing
  on the window-close path** — `lock-on-close.client.ts` races the vault seal
  against a 5 s timeout and must never wait on a network.
- **Carry the SQLite file, not the JSON export.** `import_tenant_data` refuses a
  bundle whose `schema_version` differs from the running app — fatal for
  recovery months later on a newer build. A raw `business.db` restores through
  `open_tenant`, which already runs pending migrations. The existing `.zip`
  export is untouched and stays the offline fallback.
- **Split layout: small DB snapshot + attachments uploaded once each.** One
  self-contained zip per backup was rejected on size (200 scans ≈ 600 MB per
  backup × retention, against a 15 GB quota shared with Gmail/Photos).

## Drive layout

The Drive folder **mirrors the business folder**, so a restore can also be done
by hand (download the folder from drive.google.com, unzip the newest snapshot
into it, Open it in Sakoram). The feature never locks data inside itself.

```
Sakoram Backups/
  └─ <Business name>/                         ← appProperties.skKey = <backup key>
       ├─ snapshots/
       │    ├─ 2026-09-19 09-02-11 UTC · DESKTOP-PC.zip
       │    └─ 2026-09-19 09-02-11 UTC · DESKTOP-PC.manifest.json   ← sidecar copy of the manifest
       └─ attachments/<document_type>/<document_id>/<uuid>.<ext>
```

- The business folder is found by **`appProperties.skKey`**, never by name. The
  key is `md5(tenant_id + newline + marker.created_at)` — NOT the raw tenant id,
  which is a slug of the business name (two businesses called the same thing
  would collide) and could overflow Drive's 124-byte appProperty limit. The
  folder name is cosmetic; renaming a business does not orphan its backups.
- Every uploaded file carries `skKind=file`, `skKey` and `skPath`, so the whole
  business is listed in ONE paginated query instead of one call per document
  folder. The visible folder tree exists for humans and the by-hand restore.
- Snapshot names are UTC (sortable as plain strings; the UI shows local time).
- Attachment filenames are UUIDs minted at import (`phone_upload.rs`), so a path
  is never reused for different bytes — upload-once is safe.

**Snapshot zip contents**

| Entry | Notes |
|---|---|
| `business.db` | plain business — a `VACUUM INTO` copy |
| `business.db.enc` + `business.vault.json` | encrypted business — instead of `business.db` |
| `business.json` | folder marker |
| `logos/*`, `pdf-header*` | everything present, originals included (small) |
| `backup-manifest.json` | see below |

**Manifest**

```json
{
  "format": "sakoram-drive-backup", "format_version": 1,
  "tenant_id": "…", "business_name": "…",
  "schema_version": 53, "app_version": "0.160.0",
  "created_at": "2026-09-19T09:02:11Z", "device_name": "DESKTOP-PC",
  "encrypted": false,
  "attachments": [{ "path": "invoice/412/<uuid>.jpg", "size": 2381144, "md5": "…" }]
}
```

MD5 because Drive reports `md5Checksum` natively for every file — presence and
integrity are checked against Google's own value, not metadata we wrote. The
attachment list comes from **walking `attachments/` on disk** (a folder mirror),
not from DB rows; orphan files ride along harmlessly.

## Backup flow

1. Preconditions: Drive connected; business open (and unlocked if encrypted).
2. **Snapshot.** Rust opens its own sqlx connection and runs
   `VACUUM INTO '<app_local_data>/backup-work/<uuid>/business.db'` — a consistent
   copy of a live DB; the JS pool stays open and the user keeps working.
   Encrypted business: `vault::encrypt_file(tmp_db → tmp_enc, session DEK)` using
   `VaultSessions`, then `secure_remove` the plaintext temp; copy
   `business.vault.json`. Plaintext never leaves the machine.
3. Walk `attachments/`, compute size + MD5, build the manifest.
4. Find-or-create the Drive folders. List Drive `attachments/` once
   (path → size, md5).
5. **Upload attachments first** — only those missing or mismatched. Resumable
   upload, per-file progress events.
6. Upload the sidecar manifest, then **the snapshot zip LAST**. The zip's
   existence is the commit marker: an interrupted run leaves no zip, is not
   counted as a backup, and the next run resumes cheaply because the attachments
   are already there. A sidecar with no zip is debris, pruned once a newer
   complete snapshot exists (a NEWER one may be another device mid-backup).
7. **Retention.** Keep the 10 newest snapshots. For each pruned snapshot, trash
   the zip + sidecar. Then trash any Drive attachment not referenced by the
   union of the retained sidecar manifests. "Trash", not permanent delete —
   Google keeps it 30 days.
8. Record `last_backup_at` locally; clear the work dir.

Cancellable between files. Progress via a `drive-progress` Tauri event
`{ stage, done, total }`.

## Restore flow

Entry point: **welcome screen → "Restore from Google Drive"** (no active tenant,
so nothing is open to collide with).

1. Connect if needed. List business folders (query on `appProperties`), then the
   snapshots of the picked business — newest first, showing date + device name
   from the filename/sidecar.
2. User picks a snapshot and a parent directory (folder dialog).
3. Refuse early if `manifest.schema_version > SCHEMA_VERSION` — "this backup was
   made by a newer Sakoram; update first". Older is fine (migrates forward).
4. `create_business_folder(parent, safe_folder_name(name))` (existing, de-dupes
   with ` (2)`). Download + unzip the snapshot into it, with a **zip-slip guard**
   (reject any entry whose normalised path escapes the target).
5. Download every manifest attachment to the same relative path; verify MD5.
6. Report explicitly: "312 of 312 attachments restored", or list the failures by
   path. A failed attachment does not fail the restore — the books are intact —
   but it is never silent.
7. `open_tenant(path)`. This runs pending migrations, infers `encrypted` from the
   blob, and **upserts the registry by marker id** — so restoring a business this
   machine already knows simply re-points the registry at the fresh folder; the
   old folder is left untouched on disk. Absolute attachment / logo paths are
   healed by `relocate_stored_paths` on the next `ensure_tenant_db`, exactly as
   for a folder moved between drives.
8. Encrypted business: lands locked; the normal `/unlock` page takes the same
   password or recovery key as before.

If any step before 7 fails, delete the partially-created folder (same rollback
shape as import-as-new).

## Google auth

- **OAuth 2.0 for installed apps**: system browser + PKCE + loopback redirect to
  `http://127.0.0.1:<ephemeral port>`, caught by a one-shot `axum` listener (the
  phone-upload pattern). `state` parameter checked.
- **Scopes: `drive.file` + `userinfo.email`** (the second added 2026-09-19 so
  the card can always show WHICH account is connected — Drive's `about.user`
  withholds the address from a drive.file-only app). Two scopes make Google show
  per-permission checkboxes, so connect verifies `drive.file` was actually
  granted and refuses otherwise. For Drive itself: the app sees only files it created. Lowest-risk
  scope tier; consent screen reads "files created by this app". Access is per
  app + Google account, so a second machine sees the first machine's backups.
  Connected-account email via `about.get` (no extra scope).
- **Refresh token in the OS keychain** via the existing `keyring` crate (service
  `com.sakoram.billing.gdrive`). Never in `tenants.json`, never in the business
  folder (portable — it would carry the login with it). Access tokens are
  memory-only.
- **One Google account per install.** Connect / Disconnect (disconnect revokes
  the token and deletes the keychain entry; backups on Drive are untouched).
- **Client credentials injected at build time** (`option_env!` of
  `SAKORAM_GOOGLE_CLIENT_ID` / `_SECRET`, CI secrets). Google's desktop-app
  "secret" is not confidential by design, but it stays out of the repo; when
  absent the feature hides itself ("not configured") so forks and contributor
  builds aren't coupled to our Google project — same stance as the R2 mirror.

**Prerequisites (owner, outside the codebase):** Google Cloud project with the
Drive API enabled; OAuth consent screen with homepage + privacy-policy URLs on
the marketing site; **published to Production** (Testing-mode refresh tokens
expire after 7 days). Verify Google's current verification requirements for a
`drive.file`-only app before release — they change.

## Local state

`%APPDATA%/com.sakoram.billing/backup.json` — per-machine, isolated from the
tenant registry:

```json
{ "reminder_days": 7, "account_email": "…",
  "last_backups": { "<tenant id>": "2026-09-19T09:02:11Z" } }
```

`reminder_days`: 1 / 7 / 14 / 30 / off. No tenant-DB column, no migration, no
`SCHEMA_VERSION` bump.

## UI

- **Settings → Businesses — "Google Drive backup" card.** Connect / connected-as
  / Disconnect; reminder interval; last backup time per business. **Back up
  now** acts on the ACTIVE business only (it needs the open DB and, if
  encrypted, the session key) — other rows show their last-backup time and
  nothing else. Progress modal (stage + n / total, Cancel).
- **Reminder banner** in the default layout when Drive is connected and the
  active business's last backup is older than `reminder_days` (never backed up =
  due): "Last backup 9 days ago · **Back up now** · Later". "Later" hides it for
  the session. Not a toast — toasts vanish. Main window only.
- **Welcome → "Restore from Google Drive"** modal: business list → snapshot list
  → folder dialog → progress → result summary.
- Help topic `backup-google-drive`; marketing/README copy changes "fully
  offline" to "offline by default, optional Google Drive backup".

## Architecture

Rust — new `src-tauri/src/drive/`:

| File | Responsibility |
|---|---|
| `oauth.rs` | PKCE, loopback listener, token exchange / refresh / revoke, keychain |
| `remote.rs` | `RemoteStore` trait (list businesses, ensure business, list, upload, download, trash) + a test-only in-memory fake |
| `gdrive.rs` | the Drive v3 REST impl over `reqwest` (rustls). Hand-written — ~6 endpoints; no generated Google SDK |
| `snapshot.rs` | `VACUUM INTO`, sealing for encrypted tenants, zip build, manifest, zip-slip-safe extract |
| `plan.rs` | **pure**: attachment diff (local vs remote), retention + attachment-GC selection, snapshot naming |
| `backup.rs` / `restore.rs` | orchestration against `RemoteStore`; progress events; rollback |
| `state.rs` | `backup.json` |

Commands: `drive_status`, `drive_connect_begin` / `drive_connect_finish` (the
frontend opens the consent URL between the two), `drive_disconnect`,
`drive_set_reminder_days`, `drive_backup_now`, `drive_cancel`,
`drive_list_businesses`, `drive_list_snapshots`, `drive_restore` — registered in
`lib.rs`. All file I/O on the business folder is Rust `std::fs` (folders live on
any drive; the fs plugin's scopes don't reach them). HTTP is Rust-side, so no
CSP or capability change beyond opening the consent URL in the system browser.

Frontend: `app/stores/drive_backup.ts`; pure `app/lib/backup-reminder.ts`
(`isBackupDue(lastIso, days, today)`); `DriveBackupCard.vue`,
`BackupReminderBanner.vue`, `RestoreFromDriveModal.vue`.

New crates: `reqwest` (rustls, no default features), `md-5`. Already present:
`keyring`, `axum`, `tokio`, `zip`, `uuid`, `sqlx`.

## Error handling

| Case | Behaviour |
|---|---|
| Offline / timeout | Clear message; nothing recorded; retry is just pressing the button again |
| `invalid_grant` (revoked / expired) | Mark disconnected, prompt to reconnect |
| `storageQuotaExceeded` | "Your Google Drive is full" + size needed |
| Interrupted mid-upload | No snapshot ⇒ not a backup; uploaded attachments are reused next run |
| Encrypted + locked | Back up is disabled (no session key) — unlock first |
| Attachment unreadable locally | Listed in the result as skipped; backup still completes |
| Restore: checksum mismatch | One retry, then reported by path |
| Restore: backup newer than app | Refused before anything is written |

## Known limitations (accepted for v1)

- **Attachments are not encrypted**, even for an encrypted business — they are
  plain files in the local folder today, and they are plain files in the user's
  own Drive. Encrypting them would break the by-hand restore. Stated in the UI
  next to the encryption note.
- The embedded client ID is a dependency on our Google project; the local `.zip`
  export remains the fallback that always works.
- With `drive.file`, files the user adds to the Drive folder by hand are
  invisible to the app.

## Out of scope

Automatic / scheduled backup; multi-device sync; replace-in-place restore;
multiple Google accounts; other providers (R2, S3, OneDrive, Dropbox);
attachment encryption; backing up an unopened business.

## Testing

- **Rust unit (pure):** attachment diff; retention + GC selection (an attachment
  referenced by any retained manifest survives); snapshot naming; PKCE challenge;
  zip-slip rejection.
- **Rust integration, no network:** `RemoteStore` in-memory fake → backup then
  restore round-trip into a temp folder, asserting DB bytes open as SQLite,
  attachments byte-identical, interrupted-run leaves no snapshot, second run
  uploads zero attachments. Encrypted round-trip: snapshot contains no
  SQLite-magic plaintext; restored blob unlocks with the original password.
  `VACUUM INTO` against a DB held open by a second connection.
- **Vitest:** `backup-reminder.test.ts`.
- **Manual E2E** (real Google account): connect, backup, restore on a second
  machine / fresh `%APPDATA%`, restore an older-schema snapshot, revoke access in
  Google account settings → reconnect path, full-quota account.

## Release

Minor bump → **0.160.0**. CLAUDE.md gains a "Google Drive backup" section
(layout, the not-on-close rule, keychain rule, build-time credentials).
