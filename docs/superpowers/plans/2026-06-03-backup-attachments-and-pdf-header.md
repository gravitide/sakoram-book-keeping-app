# Backup completeness — bundle attachments + PDF header logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a business backup self-contained: in addition to the DB rows + identity logo, also bundle the **uploaded document attachments** (scans/photos on quotes/invoices/bills/vouchers) and the **PDF header logo**, and restore them (with paths rewritten) on import. Works for both plaintext and encrypted bundles.

**Architecture:** Extend `data_io.rs` only. Export reads each `document_attachments` row's `file_path`, bundles the file bytes keyed by a tenant-independent relative path `<document_type>/<document_id>/<basename>`; also bundles the PDF header logo. Encrypted bundles fold these into the existing encrypted `payload.enc` JSON; plaintext bundles add zip entries. Import writes the files under the **new** tenant's `attachments/` + `pdf-headers/` dirs and rewrites `document_attachments.file_path` + `company_settings.pdf_header_logo_path` to the new locations (mirroring how `logo_path` is already rewritten).

**Tech Stack:** Rust (`src-tauri/src/data_io.rs`), `zip`, `data-encoding` (base64), `serde_json`.

**Context (verified):**
- Attachment files live at `app_data/attachments/<tenant>/<document_type>/<document_id>/<stored-name>`. The on-disk `<stored-name>` is a UUID; the `document_attachments.filename` column is the *display* name (different). So the on-disk name = `basename(file_path)`, NOT `filename`.
- `document_attachments` columns include `document_type` (text), `document_id` (integer), `file_path` (absolute), `filename`, `size_bytes`, `mime`, `source`.
- PDF header logo: file at `app_data/pdf-headers/<tenant>.<ext>`; `company_settings.pdf_header_logo_path` holds its absolute path.

**Branch:** Continue on `feat/encrypted-exports`. Do not branch or touch `main`.

**Build/test:** `cargo check`/`cargo test --manifest-path src-tauri/Cargo.toml`, plus a manual export→import round-trip verifying an attachment + PDF header survive (Task 4).

---

## Bundle shape (additions)

**Encrypted** (`payload.enc` JSON — extend the existing object):
```json
{
  "data": {...},
  "logo_name": ..., "logo_bytes_b64": ...,
  "pdf_header_name": "pdf-header.png" | null,
  "pdf_header_bytes_b64": <base64> | null,
  "attachments": [ { "path": "invoice/42/<uuid>.jpg", "bytes_b64": <base64> }, ... ]
}
```

**Plaintext** (zip entries, in addition to `data.json` + `assets/logo.*`):
```
assets/pdf-header.<ext>
attachments/<document_type>/<document_id>/<basename>   (one per attachment file)
```

`FORMAT_VERSION` stays `1`. Older bundles (no attachments / pdf-header) import unchanged.

## File structure
- **Modify** `src-tauri/src/data_io.rs` only.

---

### Task 1: Export — collect attachments + PDF header logo

**Files:**
- Modify: `src-tauri/src/data_io.rs`

- [ ] **Step 1: Add a collector helper**

Add near the other helpers (after `dump_table`). It walks the already-dumped `document_attachments` rows and reads each file from disk, returning `(relative_path, bytes)` pairs. Missing files are skipped (a row can outlive its file).

```rust
/// Read the on-disk bytes for every attachment referenced by the dumped
/// `document_attachments` rows. Returns (relative_path, bytes), where
/// relative_path = "<document_type>/<document_id>/<basename(file_path)>" — a
/// tenant-independent key that reconstructs under the new tenant on import.
/// Files that no longer exist on disk are silently skipped.
fn collect_attachment_files(data: &serde_json::Map<String, Value>) -> Vec<(String, Vec<u8>)> {
    let mut out = Vec::new();
    let Some(Value::Array(rows)) = data.get("document_attachments") else {
        return out;
    };
    for row in rows {
        let Some(obj) = row.as_object() else { continue };
        let dtype = obj.get("document_type").and_then(|v| v.as_str()).unwrap_or("");
        let did = match obj.get("document_id") {
            Some(Value::Number(n)) => n.to_string(),
            Some(Value::String(s)) => s.clone(),
            _ => continue,
        };
        let file_path = obj.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
        if dtype.is_empty() || file_path.is_empty() {
            continue;
        }
        let basename = match Path::new(file_path).file_name().and_then(|n| n.to_str()) {
            Some(b) => b.to_string(),
            None => continue,
        };
        if let Ok(bytes) = std::fs::read(file_path) {
            out.push((format!("{dtype}/{did}/{basename}"), bytes));
        }
    }
    out
}

/// Resolve the PDF header logo (path on company_settings.pdf_header_logo_path)
/// to (asset_name, bytes), if it exists. asset_name carries just the extension.
fn collect_pdf_header(data: &serde_json::Map<String, Value>) -> Option<(String, Vec<u8>)> {
    let settings = data.get("company_settings")?.as_array()?.first()?.as_object()?;
    let path = settings.get("pdf_header_logo_path").and_then(|v| v.as_str())?;
    if path.is_empty() {
        return None;
    }
    let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("png");
    let bytes = std::fs::read(path).ok()?;
    Some((format!("pdf-header.{ext}"), bytes))
}
```

- [ ] **Step 2: Collect them in `export_tenant_data` (after `data` is built, before the manifest/branch)**

After the `pool.close().await;` that follows the table-dump loop and after `logo_payload` is resolved, add:

```rust
    let attachment_files = collect_attachment_files(&data);
    let pdf_header = collect_pdf_header(&data);
```

- [ ] **Step 3: Include them in the encrypted payload**

In the `if encrypt { ... }` block, extend the `serde_json::json!` payload:

```rust
        let payload = serde_json::json!({
            "data": Value::Object(data.clone()),
            "logo_name": logo_payload.as_ref().map(|(name, _)| name.clone()),
            "logo_bytes_b64": logo_payload.as_ref().map(|(_, bytes)| BASE64.encode(bytes)),
            "pdf_header_name": pdf_header.as_ref().map(|(name, _)| name.clone()),
            "pdf_header_bytes_b64": pdf_header.as_ref().map(|(_, bytes)| BASE64.encode(bytes)),
            "attachments": attachment_files.iter()
                .map(|(path, bytes)| serde_json::json!({ "path": path, "bytes_b64": BASE64.encode(bytes) }))
                .collect::<Vec<_>>(),
        });
```

- [ ] **Step 4: Include them as zip entries in the plaintext branch**

In the `else` (plaintext) write branch — after the existing `assets/{name}` logo write — add the PDF header + attachment entries:

```rust
        if let Some((name, bytes)) = &pdf_header {
            zip.start_file(format!("assets/{name}"), opts).map_err(|e| e.to_string())?;
            zip.write_all(bytes).map_err(|e| e.to_string())?;
        }
        for (rel, bytes) in &attachment_files {
            zip.start_file(format!("attachments/{rel}"), opts).map_err(|e| e.to_string())?;
            zip.write_all(bytes).map_err(|e| e.to_string())?;
        }
```

(The encrypted branch must NOT also write these as plaintext zip entries — they live only in `payload.enc`. Keep them inside the existing `if let Some(blob) = encrypted_blob { ... } else { ... }` split, in the `else` arm.)

- [ ] **Step 5: Compile**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles (import side still ignores the new payload keys — handled in Task 2/3).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/data_io.rs
git commit -m "feat(data_io): bundle attachments + PDF header logo into exports"
```

---

### Task 2: Import — parse attachments + PDF header from both bundle formats

**Files:**
- Modify: `src-tauri/src/data_io.rs`

- [ ] **Step 1: Extend the import extraction to produce attachments + pdf-header**

In `import_tenant_data`, the encrypted/plaintext branch currently yields `(data, logo_name, logo_bytes)`. Extend both arms to also produce `pdf_header: Option<(String, Vec<u8>)>` and `attachments: Vec<(String, Vec<u8>)>`.

Encrypted arm — after the existing logo extraction from `payload`:

```rust
        let pdf_header = match (
            payload.get("pdf_header_name").and_then(|v| v.as_str()),
            payload.get("pdf_header_bytes_b64").and_then(|v| v.as_str()),
        ) {
            (Some(name), Some(b64)) => Some((
                name.to_string(),
                BASE64.decode(b64.as_bytes()).map_err(|e| format!("bad pdf header: {e}"))?,
            )),
            _ => None,
        };
        let mut attachments: Vec<(String, Vec<u8>)> = Vec::new();
        if let Some(Value::Array(list)) = payload.get("attachments") {
            for a in list {
                let path = a.get("path").and_then(|v| v.as_str()).unwrap_or("");
                let b64 = a.get("bytes_b64").and_then(|v| v.as_str()).unwrap_or("");
                if path.is_empty() || b64.is_empty() {
                    continue;
                }
                let bytes = BASE64.decode(b64.as_bytes()).map_err(|e| format!("bad attachment: {e}"))?;
                attachments.push((path.to_string(), bytes));
            }
        }
```

Plaintext arm — read the entries from the archive (after the logo read):

```rust
        // PDF header logo (assets/pdf-header.<ext>) — discover by scanning entry names.
        let mut pdf_header: Option<(String, Vec<u8>)> = None;
        let mut attachments: Vec<(String, Vec<u8>)> = Vec::new();
        {
            let names: Vec<String> = (0..archive.len())
                .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
                .collect();
            for name in names {
                if let Some(asset) = name.strip_prefix("assets/pdf-header.") {
                    let bytes = read_zip_bytes(&mut archive, &name)?;
                    pdf_header = Some((format!("pdf-header.{asset}"), bytes));
                } else if let Some(rel) = name.strip_prefix("attachments/") {
                    if !rel.is_empty() && !name.ends_with('/') {
                        let bytes = read_zip_bytes(&mut archive, &name)?;
                        attachments.push((rel.to_string(), bytes));
                    }
                }
            }
        }
```

Change the tuple binding at the top of the branch to include the new values, e.g.:

```rust
    let (mut data, logo_name, logo_bytes, pdf_header, attachments): (
        Value, Option<String>, Option<Vec<u8>>, Option<(String, Vec<u8>)>, Vec<(String, Vec<u8>)>,
    ) = if manifest.encrypted {
        // ... (existing decrypt) ... then build the 5-tuple
        (data, logo_name, logo_bytes, pdf_header, attachments)
    } else {
        // ... (existing data.json + logo read) ... then the pdf_header/attachments scan above
        (data, logo_name, logo_bytes, pdf_header, attachments)
    };
```

Note `data` is now `mut` (Task 3 rewrites attachment paths in it). Keep the existing `if !data.is_object()` guard after `drop(archive)`.

- [ ] **Step 2: Compile**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles (the new `pdf_header`/`attachments` are unused until Task 3 — `cargo check` will warn "unused variable"; that's fine until Task 3 consumes them. If you prefer zero warnings between commits, prefix with `_` here and rename in Task 3, or just do Tasks 2+3 before checking).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/data_io.rs
git commit -m "feat(data_io): parse bundled attachments + pdf-header on import"
```

---

### Task 3: Import — rewrite paths + write the files

**Files:**
- Modify: `src-tauri/src/data_io.rs`

- [ ] **Step 1: Rewrite `document_attachments.file_path` in `data` before restore + thread new params**

The `import_as_new_tenant` / `import_replace` functions need the new tenant id to compute paths. Rewrite the attachment file_paths in `data` and pass `pdf_header` + `attachments` through. Add a helper:

```rust
/// Rewrite each document_attachments row's file_path to point under the given
/// tenant's attachments dir, and return the absolute path each row maps to so
/// the caller can drop the bundled bytes there. New path =
/// <app_data>/attachments/<tenant_id>/<document_type>/<document_id>/<basename>.
fn rewrite_attachment_paths(app: &AppHandle, tenant_id: &str, data: &mut Value) -> Result<(), String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?
        .join("attachments").join(tenant_id);
    let Some(rows) = data.get_mut("document_attachments").and_then(|v| v.as_array_mut()) else {
        return Ok(());
    };
    for row in rows {
        let Some(obj) = row.as_object_mut() else { continue };
        let dtype = obj.get("document_type").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let did = match obj.get("document_id") {
            Some(Value::Number(n)) => n.to_string(),
            Some(Value::String(s)) => s.clone(),
            _ => continue,
        };
        let old = obj.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
        let Some(basename) = Path::new(old).file_name().and_then(|n| n.to_str()) else { continue };
        let new_path = base.join(&dtype).join(&did).join(basename);
        obj.insert("file_path".into(), Value::String(new_path.to_string_lossy().to_string()));
    }
    Ok(())
}

/// Write the bundled attachment files under the tenant's attachments dir, using
/// the same relative path (`<type>/<id>/<basename>`) they were bundled with.
fn write_attachment_files(app: &AppHandle, tenant_id: &str, attachments: &[(String, Vec<u8>)]) -> Result<(), String> {
    if attachments.is_empty() {
        return Ok(());
    }
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?
        .join("attachments").join(tenant_id);
    for (rel, bytes) in attachments {
        // Guard against path traversal in a crafted bundle.
        if rel.contains("..") {
            continue;
        }
        let dest = base.join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("mkdir attachments: {e}"))?;
        }
        std::fs::write(&dest, bytes).map_err(|e| format!("write attachment {rel}: {e}"))?;
    }
    Ok(())
}

/// Write the PDF header logo under pdf-headers/<tenant>.<ext>, returning its
/// absolute path so company_settings.pdf_header_logo_path can be rewritten.
fn write_pdf_header(app: &AppHandle, tenant_id: &str, header: &Option<(String, Vec<u8>)>) -> Result<Option<String>, String> {
    let Some((name, bytes)) = header else { return Ok(None) };
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("png");
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("pdf-headers");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{tenant_id}.{ext}"));
    std::fs::write(&path, bytes).map_err(|e| format!("write pdf header: {e}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
}
```

- [ ] **Step 2: Call them in `import_as_new_tenant` and `import_replace`**

Both take the new `pdf_header: &Option<(String, Vec<u8>)>` and `attachments: &[(String, Vec<u8>)]`. The `data` they receive must already have rewritten attachment paths — do the rewrite in `import_tenant_data` right before dispatch (it owns `mut data` + knows the target id for replace; for "new" the id is created inside `import_as_new_tenant`, so do the rewrite there instead).

Cleanest split:
- **`import_replace`** (target id known up front): at the start, `rewrite_attachment_paths(app, target_id, data_mut)` — but it receives `&Value`. Change its signature to take `data: &mut Value`, OR rewrite in `import_tenant_data` for the replace arm (the id is `target_tenant_id`). **Do the replace-arm rewrite in `import_tenant_data`** before calling `import_replace`, since the id is known there.
- **`import_as_new_tenant`** (id created inside): after `create_tenant_internal` yields `tenant.id`, call `rewrite_attachment_paths(app, &tenant.id, &mut data_owned)`. Since it currently takes `data: &Value`, change it to take `data: Value` (owned) so it can rewrite, OR pass the id back out. **Simplest: change `import_as_new_tenant` to take `data: &mut Value`** and rewrite inside after the tenant is created, before the restore loop.

Then in BOTH functions, after the restore loop + the existing logo write:
```rust
    // Restore the PDF header logo + rewrite its settings path.
    if let Some(new_header_path) = write_pdf_header(app, &tenant_id_here, pdf_header)? {
        sqlx::query("UPDATE company_settings SET pdf_header_logo_path = ? WHERE id = 1")
            .bind(new_header_path)
            .execute(&pool)
            .await
            .map_err(|e| format!("rewrite pdf_header_logo_path: {e}"))?;
    } else {
        // No header in the bundle → clear the stale path so the app doesn't
        // point at a missing file from the exporter's machine.
        sqlx::query("UPDATE company_settings SET pdf_header_logo_path = NULL WHERE id = 1")
            .execute(&pool).await.map_err(|e| format!("clear pdf_header_logo_path: {e}"))?;
    }
    write_attachment_files(app, &tenant_id_here, attachments)?;
```
(`tenant_id_here` = `tenant.id` in new mode, `target_id` in replace mode.)

For **replace mode**, also delete the old tenant's existing `attachments/<target_id>/` dir before writing the restored ones (so stale files don't linger), mirroring how the old logo is deleted:
```rust
    let _ = std::fs::remove_dir_all(
        app.path().app_data_dir().map_err(|e| e.to_string())?.join("attachments").join(target_id)
    );
```
(place near the existing old-logo removal in `import_replace`.)

Update the two call sites in `import_tenant_data` to pass `&pdf_header` and `&attachments` (and `&mut data` where the signature now needs it). For the replace arm, call `rewrite_attachment_paths(&app, &id, &mut data)?;` before `import_replace`.

- [ ] **Step 3: Compile + test**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles, ZERO warnings.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all green (no new unit tests; behaviour verified by the Task 4 manual round-trip + existing crypto tests).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/data_io.rs
git commit -m "feat(data_io): restore attachments + pdf-header on import (paths rewritten)"
```

---

### Task 4: Manual round-trip smoke test

Verification only (Tauri runtime + real DB).

- [ ] **Step 1: Build + launch** — `bun run tauri:dev`.

- [ ] **Step 2: Set up** — in a business, upload a document attachment (a scan/photo on any invoice/bill/voucher) AND set a PDF header logo (Settings → Business → PDF → Header logo).

- [ ] **Step 3: Export encrypted** — export the business with Encrypt on; save the `.zip`.

- [ ] **Step 4: Import** — import the `.zip` as a new business (enter the password). Open the imported business:
  - The document still shows its **attachment** (image opens / preview works).
  - The PDF header logo is present (Settings → Business → PDF, and on a generated PDF).
  - Under `%APPDATA%\com.sakoram.billing\attachments\<new-id>\…` the file exists; `pdf-headers\<new-id>.<ext>` exists.

- [ ] **Step 5: Plaintext path** — repeat export with Encrypt OFF → confirm the `.zip` now contains `attachments/…` + `assets/pdf-header.*` entries, and importing it restores them too.

- [ ] **Step 6: Record** pass/fail per step for the PR. No code commit.

---

## Self-review notes
- **Goal coverage:** attachments bundled (Task 1) + parsed (Task 2) + written with rewritten `file_path` (Task 3) ✓; PDF header bundled + restored + path rewritten (Tasks 1–3) ✓; both encrypted and plaintext formats (Tasks 1–2) ✓; back-compat — older bundles have neither key/entry, so `attachments` is empty + `pdf_header` None (Task 2) ✓.
- **Path safety:** import rewrites `file_path` from the row's own `(type,id,basename)` so it never trusts the exporter's absolute path; `write_attachment_files` skips `..` to block traversal from a crafted bundle.
- **Replace mode:** old `attachments/<id>/` dir + stale pdf-header cleared before restore.
- **No new deps; `data_io.rs` only.** No FORMAT_VERSION bump (additive, flag/entry-driven).
- **Placeholder scan:** none — Task 4 is the explicit manual round-trip (Tauri runtime).

## Versioning / PR
Bump the version (minor) in the three files only when opening the PR. This lands on the same `feat/encrypted-exports` branch as Phase 3.
