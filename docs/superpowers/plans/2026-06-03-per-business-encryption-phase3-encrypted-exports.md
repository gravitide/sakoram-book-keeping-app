# Per-business encryption — Phase 3 (encrypted export bundles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business backup `.zip` be encrypted with a passphrase, so exporting an encrypted business no longer leaks its data as plaintext. Optional and passphrase-gated; old unencrypted bundles still import.

**Architecture:** Keep `manifest.json` cleartext (preview still works) and move the sensitive payload (all table rows + logo bytes) into an encrypted `payload.enc` blob inside the same zip. The passphrase derives a key via Argon2id; the payload is sealed with XChaCha20-Poly1305 — reusing the Phase-1 `vault.rs` primitives (two new byte-oriented helpers). An `encrypted` flag (serde-default false) on the manifest drives the branch, so unencrypted bundles — old and new — import unchanged.

**Tech Stack:** Rust (`vault.rs`, `data_io.rs`), `zip`, `data-encoding` (base64), Argon2id + XChaCha20-Poly1305 (existing deps), Nuxt/Vue/NuxtUI (`businesses.vue`).

**Spec:** `docs/superpowers/specs/2026-06-02-per-business-encryption-design.md` §8.2 (encrypted exports).

**Decisions (locked):** encrypted exports only (idle-lock deferred); for an encrypted business the export dialog **defaults encryption ON and warns if unchecked**, but a plaintext export is still allowed. A **separate export passphrase** (no recovery key — forget it, re-export).

**Branch:** New branch off `main`: `feat/encrypted-exports`. Do not work on `main`.

**Build/test:** `cargo test --manifest-path src-tauri/Cargo.toml <filter>`, `cargo check --manifest-path src-tauri/Cargo.toml`, `bun run lint`, plus a manual export→import round-trip smoke test (Task 6). Builds are incremental.

---

## Bundle format

**Unencrypted (unchanged, back-compat):**
```
manifest.json   (encrypted: false)
data.json       { "<table>": [...rows...] }
assets/logo.ext (optional)
```

**Encrypted (new):**
```
manifest.json   (cleartext: encrypted: true, kdf_salt: <base64>, logo_asset: null)
payload.enc      XChaCha20-Poly1305( Argon2id(passphrase, salt) ) over the JSON:
                 { "data": {...tables...}, "logo_name": "logo.png"|null, "logo_bytes_b64": <base64>|null }
```

`FORMAT_VERSION` stays `1`; the `encrypted` flag drives behaviour.

## File structure

- **Modify** `src-tauri/src/vault.rs` — add `generate_salt()`, `derive_export_key()`, `encrypt_bytes()`, `decrypt_bytes()` + tests.
- **Modify** `src-tauri/src/data_io.rs` — `ExportManifest` gains `encrypted` + `kdf_salt`; `export_tenant_data` + `import_tenant_data` gain a `passphrase: Option<String>`; encrypted payload build/parse; refactor logo threading.
- **Modify** `app/pages/settings/businesses.vue` — export-options modal (encrypt toggle + passphrase) and an import passphrase field.

---

### Task 1: `vault.rs` — byte-oriented export crypto helpers

**Files:**
- Modify: `src-tauri/src/vault.rs`

- [ ] **Step 1: Add the failing tests**

Inside `vault.rs`'s `mod tests`, add:

```rust
    #[test]
    fn export_bytes_round_trip_and_reject_wrong_key() {
        let salt = generate_salt();
        let key = derive_export_key("backup-pass", &salt).unwrap();
        let plaintext = b"some export payload bytes \x00\x01\x02 and more".to_vec();

        let blob = encrypt_bytes(&plaintext, &key).unwrap();
        assert_ne!(blob, plaintext);
        // Correct key round-trips.
        assert_eq!(decrypt_bytes(&blob, &key).unwrap(), plaintext);

        // Wrong passphrase (same salt) is rejected.
        let wrong = derive_export_key("nope", &salt).unwrap();
        assert!(matches!(decrypt_bytes(&blob, &wrong), Err(VaultError::Auth)));

        // Tampered ciphertext is rejected.
        let mut bad = blob.clone();
        let last = bad.len() - 1;
        bad[last] ^= 0xFF;
        assert!(decrypt_bytes(&bad, &key).is_err());
    }

    #[test]
    fn export_key_is_salt_sensitive() {
        let k1 = derive_export_key("pw", &[1u8; 16]).unwrap();
        let k2 = derive_export_key("pw", &[2u8; 16]).unwrap();
        assert_ne!(*k1, *k2);
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault::tests::export_bytes_round_trip_and_reject_wrong_key`
Expected: FAIL — `cannot find function generate_salt` / `derive_export_key` / `encrypt_bytes`.

- [ ] **Step 3: Implement the helpers**

Add above the `#[cfg(test)]` block:

```rust
/// Random 16-byte salt for passphrase-based export encryption.
pub fn generate_salt() -> [u8; 16] {
    random_bytes::<16>()
}

/// Derive a 32-byte key from an export passphrase + salt (Argon2id, same cost
/// parameters as the vault). Used for encrypted backup bundles.
pub fn derive_export_key(passphrase: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>, VaultError> {
    derive_kek(passphrase.as_bytes(), salt, M_COST, T_COST, P_COST)
}

/// One-shot AEAD encrypt of an in-memory payload. Output = 24-byte random nonce
/// followed by the XChaCha20-Poly1305 ciphertext+tag. For backup bundles, which
/// are built fully in memory anyway.
pub fn encrypt_bytes(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, VaultError> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let nonce = random_bytes::<24>();
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce), plaintext)
        .map_err(|_| VaultError::Crypto)?;
    let mut out = Vec::with_capacity(24 + ct.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Inverse of `encrypt_bytes`. A wrong key or tampered blob fails authentication.
pub fn decrypt_bytes(blob: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, VaultError> {
    if blob.len() < 24 {
        return Err(VaultError::Encoding("export blob too short".into()));
    }
    let (nonce, ct) = blob.split_at(24);
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    cipher
        .decrypt(XNonce::from_slice(nonce), ct)
        .map_err(|_| VaultError::Auth)
}
```

(All imports — `XChaCha20Poly1305`, `Key`, `XNonce`, `Aead`, `Zeroizing`, `random_bytes`, `derive_kek`, `M_COST`/`T_COST`/`P_COST` — already exist in `vault.rs` from earlier phases.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml vault`
Expected: PASS — all vault tests incl. the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault.rs
git commit -m "feat(vault): passphrase byte-encryption helpers for export bundles"
```

---

### Task 2: `data_io.rs` — encrypted export path

**Files:**
- Modify: `src-tauri/src/data_io.rs`

- [ ] **Step 1: Add the manifest fields**

Add `use crate::vault;` to the imports (next to `use crate::tenants;`), and `use data_encoding::BASE64;`.

Extend `ExportManifest` with two serde-default fields so old bundles still parse:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportManifest {
    pub format: String,
    pub format_version: i32,
    pub schema_version: i32,
    pub app_version: String,
    pub exported_at: String,
    pub business_name: String,
    pub tenant_id: String,
    pub logo_asset: Option<String>,
    /// True when the data payload is encrypted (`payload.enc` instead of
    /// `data.json` + `assets/`). Defaults false for older bundles.
    #[serde(default)]
    pub encrypted: bool,
    /// base64 Argon2id salt for the export passphrase (encrypted bundles only).
    #[serde(default)]
    pub kdf_salt: Option<String>,
}
```

- [ ] **Step 2: Add a `passphrase` param to `export_tenant_data` and branch on it**

Change the signature:

```rust
#[tauri::command]
pub async fn export_tenant_data(
    app: AppHandle,
    tenant_id: String,
    output_path: String,
    passphrase: Option<String>,
) -> Result<(), String> {
```

The data-collection + logo-resolution code (building `data` and `logo_payload`) stays the same. Replace everything from the `let manifest = ExportManifest { ... }` block down to `zip.finish()` with the branch below. The key change: when a non-empty passphrase is given, build an encrypted payload + a cleartext manifest with `encrypted: true`; otherwise the existing plaintext layout.

```rust
    let encrypt = passphrase.as_deref().map(|p| !p.trim().is_empty()).unwrap_or(false);

    // Build the encrypted payload (data + logo) up front if needed.
    let mut kdf_salt_b64: Option<String> = None;
    let mut encrypted_blob: Option<Vec<u8>> = None;
    if encrypt {
        let pass = passphrase.as_deref().unwrap_or_default();
        let salt = vault::generate_salt();
        let key = vault::derive_export_key(pass, &salt).map_err(|e| e.to_string())?;

        let payload = serde_json::json!({
            "data": Value::Object(data.clone()),
            "logo_name": logo_payload.as_ref().map(|(name, _)| name.clone()),
            "logo_bytes_b64": logo_payload.as_ref().map(|(_, bytes)| BASE64.encode(bytes)),
        });
        let payload_bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
        encrypted_blob = Some(vault::encrypt_bytes(&payload_bytes, &key).map_err(|e| e.to_string())?);
        kdf_salt_b64 = Some(BASE64.encode(&salt));
    }

    let manifest = ExportManifest {
        format: "sakoram-export".into(),
        format_version: FORMAT_VERSION,
        schema_version: SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: current_iso_utc(),
        business_name: tenant.name.clone(),
        tenant_id: tenant.id.clone(),
        // Encrypted bundles keep the logo inside the encrypted payload, so the
        // cleartext manifest advertises no logo asset.
        logo_asset: if encrypt { None } else { logo_payload.as_ref().map(|(name, _)| name.clone()) },
        encrypted: encrypt,
        kdf_salt: kdf_salt_b64,
    };

    let out_path = PathBuf::from(&output_path);
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let file = std::fs::File::create(&out_path).map_err(|e| format!("create zip: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::FileOptions<'_, ()> =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("manifest.json", opts).map_err(|e| e.to_string())?;
    zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    if let Some(blob) = encrypted_blob {
        zip.start_file("payload.enc", opts).map_err(|e| e.to_string())?;
        zip.write_all(&blob).map_err(|e| e.to_string())?;
    } else {
        zip.start_file("data.json", opts).map_err(|e| e.to_string())?;
        zip.write_all(&serde_json::to_vec_pretty(&Value::Object(data)).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        if let Some((name, bytes)) = logo_payload {
            zip.start_file(format!("assets/{name}"), opts).map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| format!("finalize zip: {e}"))?;
    Ok(())
}
```

> Note: `data.clone()` is used in the encrypted branch because `data` is also moved into the plaintext branch; the borrow checker needs the clone since both arms reference it. (Only the taken arm runs.) If the compiler complains about a partial move, clone where needed.

- [ ] **Step 3: Verify it compiles (export half)**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles (import half still uses the old signature — that's Task 3). If `import_tenant_data` calls `read_zip_json(..., "data.json")` unconditionally it still compiles; we fix the runtime path in Task 3.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/data_io.rs
git commit -m "feat(data_io): encrypted export payload (passphrase-sealed payload.enc)"
```

---

### Task 3: `data_io.rs` — encrypted import path

**Files:**
- Modify: `src-tauri/src/data_io.rs`

- [ ] **Step 1: Add a `passphrase` param to `import_tenant_data` and decrypt when needed**

Replace the body of `import_tenant_data` (the parse + dispatch) so it threads a passphrase and produces `(data, logo_name, logo_bytes)` from either the encrypted payload or the plaintext layout:

```rust
#[tauri::command]
pub async fn import_tenant_data(
    app: AppHandle,
    input_path: String,
    mode: String,
    target_tenant_id: Option<String>,
    target_name: Option<String>,
    passphrase: Option<String>,
) -> Result<tenants::Tenant, String> {
    let in_path = PathBuf::from(input_path);
    let manifest = peek_export_manifest(in_path.to_string_lossy().to_string()).await?;

    let file = std::fs::File::open(&in_path).map_err(|e| format!("open zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {e}"))?;

    let (data, logo_name, logo_bytes): (Value, Option<String>, Option<Vec<u8>>) = if manifest.encrypted {
        let pass = passphrase
            .as_deref()
            .filter(|p| !p.trim().is_empty())
            .ok_or_else(|| "This backup is password-protected. Enter its password to import.".to_string())?;
        let salt_b64 = manifest
            .kdf_salt
            .as_deref()
            .ok_or_else(|| "Encrypted bundle is missing its salt.".to_string())?;
        let salt = BASE64.decode(salt_b64.as_bytes()).map_err(|e| format!("bad salt: {e}"))?;
        let key = vault::derive_export_key(pass, &salt).map_err(|e| e.to_string())?;

        let blob = read_zip_bytes(&mut archive, "payload.enc")?;
        let payload_bytes = vault::decrypt_bytes(&blob, &key)
            .map_err(|_| "Incorrect password for this backup.".to_string())?;
        let payload: Value =
            serde_json::from_slice(&payload_bytes).map_err(|e| format!("parse payload: {e}"))?;

        let data = payload.get("data").cloned().unwrap_or(Value::Null);
        let logo_name = payload.get("logo_name").and_then(|v| v.as_str()).map(|s| s.to_string());
        let logo_bytes = payload
            .get("logo_bytes_b64")
            .and_then(|v| v.as_str())
            .map(|b64| BASE64.decode(b64.as_bytes()).map_err(|e| format!("bad logo bytes: {e}")))
            .transpose()?;
        (data, logo_name, logo_bytes)
    } else {
        let data: Value = read_zip_json(&mut archive, "data.json")?;
        let logo_name = manifest.logo_asset.clone();
        let logo_bytes = match &manifest.logo_asset {
            Some(name) => Some(read_zip_bytes(&mut archive, &format!("assets/{name}"))?),
            None => None,
        };
        (data, logo_name, logo_bytes)
    };
    drop(archive);

    match mode.as_str() {
        "new" => {
            let name = target_name.unwrap_or_else(|| manifest.business_name.clone());
            import_as_new_tenant(&app, &name, &data, logo_name.as_deref(), logo_bytes).await
        }
        "replace" => {
            let id = target_tenant_id
                .ok_or_else(|| "Replace mode requires a target tenant ID.".to_string())?;
            import_replace(&app, &id, &data, logo_name.as_deref(), logo_bytes).await
        }
        other => Err(format!("Unknown import mode: {other}")),
    }
}
```

- [ ] **Step 2: Update `import_as_new_tenant`, `import_replace`, and `write_logo` to take the logo name explicitly**

These currently read the logo name from `&ExportManifest`. Change them to accept `logo_name: Option<&str>` instead (the encrypted path has no logo info in the cleartext manifest).

`write_logo`:

```rust
async fn write_logo(
    app: &AppHandle,
    tenant_id: &str,
    logo_name: Option<&str>,
    bytes: Option<&[u8]>,
) -> Result<Option<String>, String> {
    let (Some(asset_name), Some(bytes)) = (logo_name, bytes) else {
        return Ok(None);
    };
    let ext = Path::new(asset_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let file_name = format!("{tenant_id}.{ext}");
    let path = logos_path(app, &file_name)?;
    std::fs::write(&path, bytes).map_err(|e| format!("write logo: {e}"))?;
    Ok(Some(file_name))
}
```

`import_as_new_tenant` — change the signature and the single `write_logo` call:

```rust
async fn import_as_new_tenant(
    app: &AppHandle,
    name: &str,
    data: &Value,
    logo_name: Option<&str>,
    logo_bytes: Option<Vec<u8>>,
) -> Result<tenants::Tenant, String> {
```
and inside, replace `write_logo(app, &tenant.id, manifest, logo_bytes.as_deref()).await?` with
`write_logo(app, &tenant.id, logo_name, logo_bytes.as_deref()).await?`. (The `manifest` parameter is no longer used there — remove it from the signature as shown.)

`import_replace` — same change: signature takes `logo_name: Option<&str>, logo_bytes: Option<Vec<u8>>` (drop `manifest`), and the `write_logo` call passes `logo_name`.

- [ ] **Step 3: Compile + confirm all Rust tests pass**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles, no warnings.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all green (vault + vault_fs + tenants — no data_io unit tests; the round-trip is covered by the Task 6 manual smoke test and the vault byte-crypto tests).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/data_io.rs
git commit -m "feat(data_io): decrypt encrypted bundles on import (passphrase)"
```

---

### Task 4: Export-options modal (passphrase) in `businesses.vue`

**Files:**
- Modify: `app/pages/settings/businesses.vue`

- [ ] **Step 1: Add `encrypted` to the JS `ExportManifest` interface**

In the `<script setup>` `ExportManifest` interface, add:

```ts
		encrypted?: boolean
```

- [ ] **Step 2: Replace the direct-export flow with an options modal**

Currently `onExport(t)` opens the save dialog immediately. Change the row's Export button to open an options modal first. Add modal state + the encrypt fields near the other refs:

```ts
	// ---- Export options (encryption) ----
	const showExportOptions = ref(false);
	const exportTarget = ref<Tenant | null>(null);
	const exportEncrypt = ref(false);
	const exportPw = ref("");
	const exportPw2 = ref("");
	const exportPwMismatch = computed(() => !!exportPw2.value && exportPw.value !== exportPw2.value);

	const askExport = (t: Tenant) => {
		exportTarget.value = t;
		// Default ON for an encrypted business; the warning nudges them to keep it.
		exportEncrypt.value = !!t.encrypted;
		exportPw.value = "";
		exportPw2.value = "";
		showExportOptions.value = true;
	};
```

Change the per-row Export button's handler from `@click="onExport(t)"` to `@click="askExport(t)"`.

Replace the existing `onExport` body so it takes the resolved options and a passphrase:

```ts
	const exportingId = ref<string | null>(null);

	const confirmExport = async () => {
		const t = exportTarget.value;
		if (!t) return;
		if (exportEncrypt.value && (!exportPw.value || exportPwMismatch.value)) return;
		const passphrase = exportEncrypt.value ? exportPw.value : null;
		showExportOptions.value = false;

		const suffix = exportEncrypt.value ? "-encrypted" : "";
		const defaultName = `${t.id}-backup-${new Date().toISOString().slice(0, 10)}${suffix}.zip`;
		let chosen: string | null = null;
		try {
			chosen = await saveDialog({
				defaultPath: defaultName,
				filters: [{ name: "Sakoram backup", extensions: ["zip"] }]
			});
		} catch (err) {
			toast.add({ title: "Could not open save dialog", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		if (!chosen) return;

		exportingId.value = t.id;
		try {
			await invoke("export_tenant_data", { tenantId: t.id, outputPath: chosen, passphrase });
			toast.add({ title: `Exported ${t.name}`, description: chosen, color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Export failed", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			exportingId.value = null;
		}
	};
```

Add a `msg` helper near the top of the script if one isn't already present:

```ts
	const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
```

- [ ] **Step 3: Add the export-options modal markup**

Add alongside the other `<UModal>`s in the template:

```vue
		<!-- Export options -->
		<UModal v-model:open="showExportOptions" :title="`Export ${exportTarget?.name ?? ''}`">
			<template #body>
				<div class="space-y-4">
					<UCheckbox v-model="exportEncrypt" label="Encrypt this backup with a password" />

					<template v-if="exportEncrypt">
						<UFormField label="Backup password" required>
							<PasswordInput v-model="exportPw" placeholder="Choose a password for this file" />
						</UFormField>
						<UFormField label="Confirm password" required :error="exportPwMismatch ? 'Passwords don\'t match' : undefined">
							<PasswordInput v-model="exportPw2" placeholder="Re-enter the password" @enter="confirmExport" />
						</UFormField>
						<p class="text-xs text-(--ui-text-muted)">
							You'll need this password to import the backup. There's no recovery — if you forget it, just export again.
						</p>
					</template>

					<div
						v-else-if="exportTarget?.encrypted"
						class="text-sm text-(--ui-warning) bg-(--ui-warning)/10 border border-(--ui-warning)/30 rounded p-3 flex gap-2"
					>
						<UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-0.5" />
						<span>
							This business is encrypted, but the backup will <span class="font-semibold">not</span> be —
							anyone with the file could read its data. Add a password unless you have a reason not to.
						</span>
					</div>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showExportOptions = false">
						Cancel
					</UButton>
					<UButton
						icon="i-lucide-download"
						:disabled="exportEncrypt && (!exportPw || exportPwMismatch)"
						@click="confirmExport"
					>
						Export
					</UButton>
				</div>
			</template>
		</UModal>
```

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add app/pages/settings/businesses.vue
git commit -m "feat(businesses): export-options modal with optional backup encryption"
```

---

### Task 5: Import passphrase field in `businesses.vue`

**Files:**
- Modify: `app/pages/settings/businesses.vue`

- [ ] **Step 1: Add an import passphrase ref**

Near the import refs:

```ts
	const importPassphrase = ref("");
```

Reset it in `cancelImport` (add `importPassphrase.value = "";`) and after a successful import.

- [ ] **Step 2: Show the passphrase field when the bundle is encrypted**

In the import modal body (inside the `v-else` block that renders the manifest details), add — after the manifest info box:

```vue
					<UFormField v-if="importManifest.encrypted" label="Backup password" required>
						<PasswordInput v-model="importPassphrase" placeholder="Password this backup was encrypted with" @enter="confirmImport" />
						<template #help>
							This backup is password-protected. Enter the password used when it was exported.
						</template>
					</UFormField>
```

- [ ] **Step 3: Gate the import button + pass the passphrase**

Update `canImport` so an encrypted bundle requires a passphrase:

```ts
	const canImport = computed(() => {
		if (!importManifest.value || importing.value) return false;
		if (importManifest.value.encrypted && !importPassphrase.value) return false;
		if (importMode.value === "new") return true;
		return !!importReplaceTargetId.value;
	});
```

In `confirmImport`, add the passphrase to the invoke args:

```ts
			const args: Record<string, unknown> = {
				inputPath: importPath.value,
				mode: importMode.value,
				passphrase: importManifest.value.encrypted ? importPassphrase.value : null
			};
```

(Keep the existing `targetName` / `targetTenantId` assignment after this.)

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add app/pages/settings/businesses.vue
git commit -m "feat(businesses): prompt for password when importing an encrypted backup"
```

---

### Task 6: Manual smoke test (round-trip)

Verification only — the export/import commands need the Tauri runtime + a real DB.

- [ ] **Step 1: Build + launch** — `bun run tauri:dev`.

- [ ] **Step 2: Encrypted export** — Settings → Businesses → Export on a business. In the options modal, keep "Encrypt" checked, set a password, Export, save the `.zip`. Confirm the file is created with `-encrypted` in the suggested name.

- [ ] **Step 3: Inspect (optional)** — open the `.zip`: it should contain `manifest.json` (readable, `"encrypted": true`) and `payload.enc` (binary), and NO `data.json` / `assets/`.

- [ ] **Step 4: Import it** — Settings → Businesses → Import → pick the `.zip`. The preview shows the business name/date; a **Backup password** field appears. Enter the wrong password → "Incorrect password for this backup." Enter the right one → imports as a new business; open it and confirm the data is intact (clients, invoices, etc.).

- [ ] **Step 5: Plaintext path still works** — Export another business with "Encrypt" unchecked → `data.json` bundle; import it (no password prompt). Confirm an encrypted business shows the warning when you uncheck Encrypt.

- [ ] **Step 6: Record** — capture pass/fail per step for the PR. No code commit.

---

## Self-review notes

- **Spec coverage (§8.2):** encrypted export bundle (Tasks 1–2) ✓; decrypt on import with passphrase (Task 3) ✓; cleartext manifest preserves the import preview (Task 2) ✓; old/plaintext bundles still import via the serde-default `encrypted` flag (Tasks 2–3) ✓; UI to opt in + warn (Task 4) and to enter the password (Task 5) ✓.
- **Decisions honored:** optional + default-ON + warn for encrypted businesses (Task 4 `askExport` + the warning block); separate export passphrase, no recovery key (Task 4 copy); idle-lock not included.
- **Crypto:** reuses Argon2id + XChaCha20-Poly1305 from `vault.rs`; wrong passphrase → AEAD auth failure → friendly "Incorrect password" (Task 3). Salt random per export, stored base64 in the cleartext manifest (not secret).
- **Placeholder scan:** none — every code step is concrete; Task 6 is an explicit manual procedure (Tauri-runtime round-trip).
- **Type consistency:** `passphrase: Option<String>` on both commands; JS passes `passphrase` (camelCase already). `ExportManifest.encrypted` used in Rust + the JS interface. `generate_salt`/`derive_export_key`/`encrypt_bytes`/`decrypt_bytes` names match across vault + data_io.

## After this phase

Closes the §8.2 export-bypass gap. The help topic's "Backups aren't encrypted yet" callout (`app/help/topics/security.vue`) should be **updated/removed** as part of this work — fold a small edit into Task 5 or a follow-up commit so the docs match. Idle-lock remains the only deferred encryption item.

## Versioning / PR

Bump the version (minor) in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` only when opening the PR. Do not open the PR until the user asks.
