// Google Drive backup & restore. See
// docs/superpowers/specs/2026-09-19-google-drive-backup-design.md.
//
// Backup is a manual, one-way push; restore is an explicit user action. There
// is no sync and NOTHING here may run on the window-close path.

pub mod backup;
pub mod gdrive;
pub mod oauth;
pub mod plan;
pub mod remote;
pub mod restore;
pub mod snapshot;
pub mod state;
