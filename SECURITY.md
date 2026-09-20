# Security policy

Sakoram keeps people's financial records, so security reports are taken
seriously and handled privately.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

- Preferred: use GitHub's private reporting — the **Security** tab of this
  repository → **Report a vulnerability**. Only the maintainers can see it.
- Or email **hello@gravitide.com** with "Sakoram security" in the subject.

Include what you found, how to reproduce it, the Sakoram version (About panel),
and your operating system. A proof of concept helps, but is not required.

You can expect an acknowledgement within 7 days. Sakoram is a free project
maintained by a small team, so please allow reasonable time for a fix before
disclosing publicly — we will keep you informed and credit you in the release
notes unless you prefer otherwise.

## Supported versions

Only the **latest release** receives security fixes. Sakoram is pre-1.0 and
updates are cumulative — the fix for any issue is to install the newest version.

## What is in scope

- **Database encryption** — the per-business vault (`src-tauri/src/vault.rs`,
  `vault_fs.rs`): key derivation, the recovery key, plaintext left on disk after
  a lock, anything that lets a locked business be read.
- **Google Drive backup** (`src-tauri/src/drive/`): the OAuth flow and loopback
  listener, token storage, archive extraction (path traversal), anything that
  lets a backup be read, altered or deleted by someone else.
- **Phone upload** (`src-tauri/src/phone_upload.rs`): the LAN HTTP server —
  token bypass, uploads landing outside the attachments folder, reachability
  from outside the local network.
- **Backup import / export** (`data_io.rs`) and business-folder handling
  (`tenants.rs`): path traversal, reading or writing outside the chosen folder.
- **PDF protection**, the Tauri capability configuration, and anything that lets
  a crafted business folder, backup, CSV or image run code or escape the app.
- **The release pipeline** — anything that could put a tampered installer on the
  Releases page.

## Known and accepted

These are deliberate trade-offs, documented in `CLAUDE.md`; they are not
vulnerabilities on their own, though a way to make them worse would be.

- **The Google OAuth client secret is inside the installer.** Google documents
  that an installed-app client secret is not confidential. It cannot reach any
  user's Drive; each user's own sign-in stays in their OS keychain.
- **An unlocked business is plaintext on disk.** Encryption is decrypt-on-unlock;
  the database is sealed again on lock, close and business switch.
- **Attachments are not encrypted**, locally or in a Drive backup — the vault
  covers the database only.
- **Installers are unsigned**, so Windows SmartScreen warns on first run.
- Issues that require an attacker who already controls the user's operating
  system account.
