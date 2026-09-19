fn main() {
  // option_env! in src/drive/oauth.rs is compile-time; without these lines cargo
  // would not rebuild when the credentials change.
  println!("cargo:rerun-if-env-changed=SAKORAM_GOOGLE_CLIENT_ID");
  println!("cargo:rerun-if-env-changed=SAKORAM_GOOGLE_CLIENT_SECRET");
  tauri_build::build()
}
