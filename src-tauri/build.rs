use std::path::Path;

// Compile-time Google OAuth credentials for the Drive backup feature
// (src/drive/oauth.rs reads them with option_env!).
//
// Resolution order, per key:
//   1. a real, non-empty environment variable  — CI secrets, or an `export`
//   2. the repo-root `.env` file (gitignored)  — local development
//   3. nothing                                 — the feature reports itself as
//                                                not configured and hides
//
// Read here rather than relying on bun auto-loading `.env`: that only covers
// `bun run …`, so a bare `cargo test` / `cargo check` would see different
// values and every switch between the two would flip the build between
// configured and not. ONLY these keys are forwarded — the rest of `.env`
// never reaches rustc.
const GOOGLE_KEYS: [&str; 2] = ["SAKORAM_GOOGLE_CLIENT_ID", "SAKORAM_GOOGLE_CLIENT_SECRET"];

/// `KEY=value` lookup in dotenv text. Skips blanks and `#` comments, tolerates
/// an `export ` prefix and one pair of surrounding quotes. Last match wins.
fn dotenv_value(text: &str, key: &str) -> Option<String> {
  let mut found = None;
  for line in text.lines() {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
      continue;
    }
    let line = line.strip_prefix("export ").unwrap_or(line);
    let Some((k, v)) = line.split_once('=') else { continue };
    if k.trim() != key {
      continue;
    }
    let v = v.trim();
    let unquoted = v
      .strip_prefix('"')
      .and_then(|s| s.strip_suffix('"'))
      .or_else(|| v.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')))
      .unwrap_or(v);
    found = Some(unquoted.to_string());
  }
  found.filter(|v| !v.is_empty())
}

fn main() {
  let dotenv_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".env");
  // Also fires when the file is created or deleted, not just edited.
  println!("cargo:rerun-if-changed={}", dotenv_path.display());
  let dotenv = std::fs::read_to_string(&dotenv_path).unwrap_or_default();

  for key in GOOGLE_KEYS {
    // Without this a changed secret silently doesn't rebuild.
    println!("cargo:rerun-if-env-changed={key}");
    let from_env = std::env::var(key).ok().filter(|v| !v.is_empty());
    if from_env.is_none() {
      if let Some(value) = dotenv_value(&dotenv, key) {
        println!("cargo:rustc-env={key}={value}");
      }
    }
  }

  tauri_build::build()
}
