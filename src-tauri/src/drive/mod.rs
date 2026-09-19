// Google Drive backup & restore. See
// docs/superpowers/specs/2026-09-19-google-drive-backup-design.md.
//
// Backup is a manual, one-way push; restore is an explicit user action. There
// is no sync and NOTHING here may run on the window-close path.

pub mod plan;
