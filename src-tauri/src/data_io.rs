// Export / import a tenant's data as a portable .zip bundle.
//
// Bundle layout:
//
//   manifest.json     metadata: schema version, app version, business name
//   data.json         { "<table>": [...rows...], ... }
//   assets/logo.<ext> the tenant's logo file, if any
//
// For ENCRYPTED bundles `manifest.json` stays cleartext (so the import
// preview can show the business name / timestamp / version without the
// passphrase) and therefore still reveals those fields. The actual data
// rows and logo bytes are sealed inside `payload.enc`. This leakage is
// intentional and documented here as a trade-off.
//
// We refuse to import a bundle whose schema_version doesn't match the
// current schema. A backup made on v0.9.0 (schema 4) won't apply on a
// future v1.0.0 with new columns until we add a per-version restore
// adapter — out of scope for now.
//
// Two import modes:
//   "new"     creates a fresh tenant from the bundle
//   "replace" wipes the target tenant's data and restores from the bundle
//
// Both modes rewrite `company_settings.logo_path` to point at the freshly
// extracted logo file under our `logos/` directory — the original path
// in the bundle was an absolute path on the exporter's machine and would
// be meaningless here.
//
// Accepted trade-offs (documented for reviewers):
//   - The export/import pipeline builds the whole payload — including all
//     attachment bytes (base64-encoded in the encrypted case) — in memory.
//     This is fine at realistic single-user volumes.
//   - "replace" mode is non-atomic past the wipe point: it deletes the
//     target tenant's data and attachments before restoring. A crash
//     mid-restore would leave the tenant in a blank state. This is
//     consistent with the pre-existing replace behaviour and acceptable
//     for a single-user desktop app (the user always exports first).

use std::io::{Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager};

use crate::tenants;
use crate::vault;
use data_encoding::BASE64;

const FORMAT_VERSION: i32 = 1;
/// Increment when adding migrations beyond what existing exports can carry.
const SCHEMA_VERSION: i32 = 36;

/// Tables exported in dependency order — parents first. Restore uses
/// the same order; replace-mode wipe uses the reverse.
const TABLES: &[&str] = &[
	"company_settings",
	"business_banks",
	"clients",
	"vendors",
	"employees",
	"document_counters",
	"quotes",
	"quote_lines",
	"invoices",
	"invoice_lines",
	"credit_notes",
	"credit_note_lines",
	"recurring_invoices",
	"recurring_invoice_lines",
	"bill_categories",
	"bills",
	"bill_lines",
	"recurring_bills",
	"recurring_bill_lines",
	"payslips",
	"payslip_lines",
	"vouchers",
	"document_attachments",
	"bank_statement_imports",
	"bank_statement_rows",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportManifest {
	pub format: String,
	pub format_version: i32,
	pub schema_version: i32,
	pub app_version: String,
	pub exported_at: String,
	pub business_name: String,
	pub tenant_id: String,
	/// Filename of the bundled logo asset (e.g. "logo.png") or null.
	pub logo_asset: Option<String>,
	/// True when the data payload is encrypted (`payload.enc` instead of
	/// `data.json` + `assets/`). Defaults false for older bundles.
	#[serde(default)]
	pub encrypted: bool,
	/// base64 Argon2id salt for the export passphrase (encrypted bundles only).
	#[serde(default)]
	pub kdf_salt: Option<String>,
}

// ---------- Helpers ---------------------------------------------------------

async fn open_pool(path: &Path) -> Result<SqlitePool, String> {
	let url = format!("sqlite:{}", path.to_string_lossy());
	let opts = SqliteConnectOptions::from_str(&url).map_err(|e| e.to_string())?;
	SqlitePool::connect_with(opts).await.map_err(|e| format!("connect: {e}"))
}

async fn table_columns(pool: &SqlitePool, table: &str) -> Result<Vec<String>, String> {
	// PRAGMA returns one row per column with name in the second slot. We
	// read it dynamically so future migrations that add columns are
	// picked up without touching this module.
	let rows = sqlx::query(&format!("PRAGMA table_info(\"{}\")", table))
		.fetch_all(pool)
		.await
		.map_err(|e| format!("pragma {table}: {e}"))?;
	Ok(rows
		.iter()
		.map(|r| r.try_get::<String, _>("name").unwrap_or_default())
		.collect())
}

/// Dump a table as a JSON array of row objects. Uses SQLite's json_object
/// + json_group_array so the heavy lifting stays server-side and we don't
/// have to per-type-decode every cell from JS.
async fn dump_table(pool: &SqlitePool, table: &str) -> Result<Value, String> {
	let cols = table_columns(pool, table).await?;
	if cols.is_empty() {
		return Ok(Value::Array(vec![]));
	}
	let pairs: Vec<String> =
		cols.iter().map(|c| format!("'{c}', \"{c}\"")).collect();
	let sql = format!(
		"SELECT COALESCE(json_group_array(json_object({})), '[]') FROM \"{}\"",
		pairs.join(", "),
		table
	);
	let row: (String,) =
		sqlx::query_as(&sql).fetch_one(pool).await.map_err(|e| format!("dump {table}: {e}"))?;
	serde_json::from_str(&row.0).map_err(|e| format!("parse {table}: {e}"))
}

/// Insert one row by binding values dynamically based on the JSON type.
/// Tolerant of extra columns the current schema doesn't have (would
/// trigger a SQL error which we surface) and missing optional columns
/// (just not bound — relies on the column's default or NULL).
async fn restore_row(pool: &SqlitePool, table: &str, row: &Value) -> Result<(), String> {
	let obj = row.as_object().ok_or_else(|| format!("row in {table} is not an object"))?;
	let cols: Vec<&str> = obj.keys().map(|s| s.as_str()).collect();
	if cols.is_empty() {
		return Ok(());
	}
	let placeholders = std::iter::repeat("?").take(cols.len()).collect::<Vec<_>>().join(", ");
	let cols_quoted: Vec<String> = cols.iter().map(|c| format!("\"{c}\"")).collect();
	let sql = format!(
		"INSERT INTO \"{}\" ({}) VALUES ({})",
		table,
		cols_quoted.join(", "),
		placeholders
	);
	let mut q = sqlx::query(&sql);
	for col in &cols {
		let val = &obj[*col];
		q = match val {
			Value::Null => q.bind(None::<String>),
			Value::Bool(b) => q.bind(*b),
			Value::Number(n) => {
				if let Some(i) = n.as_i64() {
					q.bind(i)
				} else if let Some(f) = n.as_f64() {
					q.bind(f)
				} else {
					return Err(format!("bad number in {table}.{col}"));
				}
			}
			Value::String(s) => q.bind(s.clone()),
			_ => {
				return Err(format!(
					"unsupported JSON type for {table}.{col} (arrays/objects not allowed)"
				));
			}
		};
	}
	q.execute(pool).await.map_err(|e| format!("insert into {table}: {e}"))?;
	Ok(())
}

async fn restore_table(pool: &SqlitePool, table: &str, rows: &Value) -> Result<(), String> {
	let array = match rows {
		Value::Array(a) => a,
		_ => return Err(format!("data.{table} is not an array")),
	};
	for row in array {
		restore_row(pool, table, row).await?;
	}
	Ok(())
}

async fn wipe_tenant_data(pool: &SqlitePool) -> Result<(), String> {
	// Disable FK enforcement so we can delete in any order without tripping
	// CASCADE rules. Re-enabled afterwards.
	sqlx::query("PRAGMA foreign_keys = OFF").execute(pool).await.ok();
	for table in TABLES.iter().rev() {
		sqlx::query(&format!("DELETE FROM \"{table}\""))
			.execute(pool)
			.await
			.map_err(|e| format!("wipe {table}: {e}"))?;
	}
	sqlx::query("PRAGMA foreign_keys = ON").execute(pool).await.ok();
	Ok(())
}

fn current_iso_utc() -> String {
	use std::time::{SystemTime, UNIX_EPOCH};
	let secs = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|d| d.as_secs())
		.unwrap_or(0);
	// Cheap epoch → ISO-ish formatter (we only need a coarse timestamp,
	// not perfect calendar math).
	let days = secs / 86_400;
	let secs_today = secs % 86_400;
	let h = secs_today / 3600;
	let m = (secs_today % 3600) / 60;
	let s = secs_today % 60;

	// Days since 1970-01-01 → date. Standard algorithm.
	let mut z = days as i64 + 719_468;
	let era = z.div_euclid(146_097);
	let doe = (z - era * 146_097) as u64;
	let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
	let y = yoe as i64 + era * 400;
	let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
	let mp = (5 * doy + 2) / 153;
	let d = doy - (153 * mp + 2) / 5 + 1;
	let m_cal = if mp < 10 { mp + 3 } else { mp - 9 };
	let y = if m_cal <= 2 { y + 1 } else { y };
	z = y;
	format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", z, m_cal, d, h, m, s)
}

// ---------- Export ----------------------------------------------------------

#[tauri::command]
pub async fn export_tenant_data(
	app: AppHandle,
	tenant_id: String,
	output_path: String,
	encrypt: bool,
	passphrase: Option<String>,
) -> Result<(), String> {
	let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
	let db_path = app_data.join("businesses").join(format!("{tenant_id}.db"));
	if !db_path.exists() {
		return Err(format!("Tenant DB not found: {}", db_path.display()));
	}

	// Look up the tenant's display name from the registry (for the manifest).
	let reg = tenants::read_registry_public(&app)?;
	let tenant = reg
		.tenants
		.iter()
		.find(|t| t.id == tenant_id)
		.ok_or_else(|| format!("Tenant {tenant_id} not registered"))?
		.clone();

	let pool = open_pool(&db_path).await?;

	// Collect every table.
	let mut data = serde_json::Map::new();
	for table in TABLES {
		let rows = dump_table(&pool, table).await?;
		data.insert(table.to_string(), rows);
	}
	pool.close().await;

	// Collect attachments + PDF header before sealing the bundle.
	let attachment_files = collect_attachment_files(&data);
	let pdf_header = collect_pdf_header(&data);

	// Resolve the logo file (if present).
	let mut logo_payload: Option<(String, Vec<u8>)> = None;
	if let Some(logo_file) = &tenant.logo_file {
		let logo_path = app_data.join("logos").join(logo_file);
		if logo_path.exists() {
			let bytes = std::fs::read(&logo_path).map_err(|e| format!("read logo: {e}"))?;
			let ext = logo_path
				.extension()
				.and_then(|e| e.to_str())
				.unwrap_or("png");
			logo_payload = Some((format!("logo.{ext}"), bytes));
		}
	}

	if encrypt && passphrase.as_deref().map(|p| p.trim().is_empty()).unwrap_or(true) {
		return Err("Encryption was requested but no password was provided.".into());
	}

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
			"pdf_header_name": pdf_header.as_ref().map(|(name, _)| name.clone()),
			"pdf_header_bytes_b64": pdf_header.as_ref().map(|(_, bytes)| BASE64.encode(bytes)),
			"attachments": attachment_files.iter()
				.map(|(path, bytes)| serde_json::json!({ "path": path, "bytes_b64": BASE64.encode(bytes) }))
				.collect::<Vec<_>>(),
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
		if let Some((name, bytes)) = &pdf_header {
			zip.start_file(format!("assets/{name}"), opts).map_err(|e| e.to_string())?;
			zip.write_all(bytes).map_err(|e| e.to_string())?;
		}
		for (rel, bytes) in &attachment_files {
			zip.start_file(format!("attachments/{rel}"), opts).map_err(|e| e.to_string())?;
			zip.write_all(bytes).map_err(|e| e.to_string())?;
		}
	}

	zip.finish().map_err(|e| format!("finalize zip: {e}"))?;
	Ok(())
}

// ---------- Manifest peek (called before commit) ----------------------------

#[tauri::command]
pub async fn peek_export_manifest(input_path: String) -> Result<ExportManifest, String> {
	let manifest = read_manifest(&PathBuf::from(input_path))?;
	if manifest.format != "sakoram-export" {
		return Err("Not a Sakoram export bundle.".into());
	}
	if manifest.format_version != FORMAT_VERSION {
		return Err(format!(
			"Bundle uses format version {} but this app expects {FORMAT_VERSION}.",
			manifest.format_version
		));
	}
	if manifest.schema_version != SCHEMA_VERSION {
		return Err(format!(
			"This backup was made on a different version of Sakoram (schema {} vs current {SCHEMA_VERSION}). Open it on the matching version to import.",
			manifest.schema_version
		));
	}
	Ok(manifest)
}

fn read_manifest(input_path: &Path) -> Result<ExportManifest, String> {
	let file = std::fs::File::open(input_path).map_err(|e| format!("open zip: {e}"))?;
	let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {e}"))?;
	let mut entry = archive
		.by_name("manifest.json")
		.map_err(|_| "Bundle is missing manifest.json".to_string())?;
	let mut buf = String::new();
	entry.read_to_string(&mut buf).map_err(|e| format!("read manifest: {e}"))?;
	serde_json::from_str(&buf).map_err(|e| format!("parse manifest: {e}"))
}

// ---------- Import ----------------------------------------------------------

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

	let (mut data, logo_name, logo_bytes, pdf_header, attachments): (
		Value,
		Option<String>,
		Option<Vec<u8>>,
		Option<(String, Vec<u8>)>,
		Vec<(String, Vec<u8>)>,
	) = if manifest.encrypted {
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
		(data, logo_name, logo_bytes, pdf_header, attachments)
	} else {
		let data: Value = read_zip_json(&mut archive, "data.json")?;
		let logo_name = manifest.logo_asset.clone();
		let logo_bytes = match &manifest.logo_asset {
			Some(name) => Some(read_zip_bytes(&mut archive, &format!("assets/{name}"))?),
			None => None,
		};
		// PDF header logo (assets/pdf-header.<ext>) and attachment files —
		// discover by scanning entry names.
		let mut pdf_header: Option<(String, Vec<u8>)> = None;
		let mut attachments: Vec<(String, Vec<u8>)> = Vec::new();
		{
			let names: Vec<String> = (0..archive.len())
				.filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
				.collect();
			for name in names {
				if let Some(ext) = name.strip_prefix("assets/pdf-header.") {
					let bytes = read_zip_bytes(&mut archive, &name)?;
					pdf_header = Some((format!("pdf-header.{ext}"), bytes));
				} else if let Some(rel) = name.strip_prefix("attachments/") {
					if !rel.is_empty() && !name.ends_with('/') {
						let bytes = read_zip_bytes(&mut archive, &name)?;
						attachments.push((rel.to_string(), bytes));
					}
				}
			}
		}
		(data, logo_name, logo_bytes, pdf_header, attachments)
	};
	drop(archive);

	if !data.is_object() {
		return Err("Backup is malformed — its data is missing or unreadable.".into());
	}

	match mode.as_str() {
		"new" => {
			let name = target_name.unwrap_or_else(|| manifest.business_name.clone());
			import_as_new_tenant(&app, &name, &mut data, logo_name.as_deref(), logo_bytes, &pdf_header, &attachments).await
		}
		"replace" => {
			let id = target_tenant_id
				.ok_or_else(|| "Replace mode requires a target tenant ID.".to_string())?;
			rewrite_attachment_paths(&app, &id, &mut data)?;
			import_replace(&app, &id, &data, logo_name.as_deref(), logo_bytes, &pdf_header, &attachments).await
		}
		other => Err(format!("Unknown import mode: {other}")),
	}
}

fn read_zip_json<R: Read + Seek>(
	archive: &mut zip::ZipArchive<R>,
	name: &str,
) -> Result<Value, String> {
	let mut entry = archive
		.by_name(name)
		.map_err(|_| format!("Bundle missing {name}"))?;
	let mut buf = String::new();
	entry.read_to_string(&mut buf).map_err(|e| format!("read {name}: {e}"))?;
	serde_json::from_str(&buf).map_err(|e| format!("parse {name}: {e}"))
}

fn read_zip_bytes<R: Read + Seek>(
	archive: &mut zip::ZipArchive<R>,
	name: &str,
) -> Result<Vec<u8>, String> {
	let mut entry = archive
		.by_name(name)
		.map_err(|_| format!("Bundle missing {name}"))?;
	let mut buf = Vec::new();
	entry.read_to_end(&mut buf).map_err(|e| format!("read {name}: {e}"))?;
	Ok(buf)
}

async fn import_as_new_tenant(
	app: &AppHandle,
	name: &str,
	data: &mut Value,
	logo_name: Option<&str>,
	logo_bytes: Option<Vec<u8>>,
	pdf_header: &Option<(String, Vec<u8>)>,
	attachments: &[(String, Vec<u8>)],
) -> Result<tenants::Tenant, String> {
	// Use the existing create_tenant path — produces a unique slug, a
	// fresh DB with migrations applied, and a registry entry.
	let tenant = tenants::create_tenant_internal(app, name).await?;

	// Run the actual restore; if anything fails partway, tear the freshly-
	// created tenant back down so a failed import never leaves a broken
	// business (registered + empty DB + orphaned files) in the picker.
	match populate_new_tenant(app, &tenant.id, data, logo_name, logo_bytes, pdf_header, attachments).await {
		Ok(()) => tenants::get_tenant(app, &tenant.id),
		Err(e) => {
			tenants::discard_tenant(app, &tenant.id);
			Err(e)
		}
	}
}

/// Restore an import bundle into the just-created tenant `tenant_id`. Factored
/// out of `import_as_new_tenant` so the caller can roll the tenant back if any
/// step here fails.
async fn populate_new_tenant(
	app: &AppHandle,
	tenant_id: &str,
	data: &mut Value,
	logo_name: Option<&str>,
	logo_bytes: Option<Vec<u8>>,
	pdf_header: &Option<(String, Vec<u8>)>,
	attachments: &[(String, Vec<u8>)],
) -> Result<(), String> {
	// Rewrite attachment paths now that we know the new tenant id.
	rewrite_attachment_paths(app, tenant_id, data)?;

	let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
	let db_path = app_data.join("businesses").join(format!("{tenant_id}.db"));
	let pool = open_pool(&db_path).await?;

	// Brand-new DB has the seeded company_settings row — wipe it before
	// inserting the imported one so we don't violate the singleton CHECK.
	wipe_tenant_data(&pool).await?;

	// Restore tables in dependency order.
	for table in TABLES {
		if let Some(rows) = data.get(*table) {
			restore_table(&pool, table, rows).await?;
		}
	}

	// Logo: extract bytes to logos/{tenant_id}.{ext}, point the DB at it.
	let updated_logo_file = write_logo(app, tenant_id, logo_name, logo_bytes.as_deref()).await?;
	let new_logo_path = updated_logo_file
		.as_ref()
		.map(|f| logos_path(app, f))
		.transpose()?;

	// Rewrite logo_path in the imported row (it referenced the
	// exporter's machine).
	sqlx::query("UPDATE company_settings SET logo_path = ? WHERE id = 1")
		.bind(new_logo_path.as_ref().map(|p| p.to_string_lossy().to_string()))
		.execute(&pool)
		.await
		.map_err(|e| format!("rewrite logo_path: {e}"))?;

	// Restore the PDF header logo + rewrite its settings path.
	if let Some(new_header_path) = write_pdf_header(app, tenant_id, pdf_header)? {
		sqlx::query("UPDATE company_settings SET pdf_header_logo_path = ? WHERE id = 1")
			.bind(new_header_path)
			.execute(&pool)
			.await
			.map_err(|e| format!("rewrite pdf_header_logo_path: {e}"))?;
	} else {
		// No header in the bundle → clear the stale path so the app doesn't
		// point at a missing file from the exporter's machine.
		sqlx::query("UPDATE company_settings SET pdf_header_logo_path = NULL WHERE id = 1")
			.execute(&pool)
			.await
			.map_err(|e| format!("clear pdf_header_logo_path: {e}"))?;
	}
	write_attachment_files(app, tenant_id, attachments)?;

	pool.close().await;

	// Sync logo filename + display name into the registry.
	tenants::set_tenant_logo_internal(app, tenant_id, updated_logo_file)?;
	Ok(())
}

async fn import_replace(
	app: &AppHandle,
	target_id: &str,
	data: &Value,
	logo_name: Option<&str>,
	logo_bytes: Option<Vec<u8>>,
	pdf_header: &Option<(String, Vec<u8>)>,
	attachments: &[(String, Vec<u8>)],
) -> Result<tenants::Tenant, String> {
	let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
	let db_path = app_data.join("businesses").join(format!("{target_id}.db"));
	if !db_path.exists() {
		return Err(format!("Target tenant DB not found: {}", db_path.display()));
	}

	// Delete the old logo before writing the new one (or before clearing,
	// if the bundle has none).
	if let Some(old_logo) = tenants::get_tenant(app, target_id)?.logo_file {
		let old = app_data.join("logos").join(&old_logo);
		let _ = std::fs::remove_file(&old);
	}

	// Delete the old attachments dir before writing restored ones.
	let _ = std::fs::remove_dir_all(
		app.path().app_data_dir().map_err(|e| e.to_string())?.join("attachments").join(target_id)
	);

	let pool = open_pool(&db_path).await?;
	wipe_tenant_data(&pool).await?;

	for table in TABLES {
		if let Some(rows) = data.get(*table) {
			restore_table(&pool, table, rows).await?;
		}
	}

	let updated_logo_file = write_logo(app, target_id, logo_name, logo_bytes.as_deref()).await?;
	let new_logo_path = updated_logo_file
		.as_ref()
		.map(|f| logos_path(app, f))
		.transpose()?;
	sqlx::query("UPDATE company_settings SET logo_path = ? WHERE id = 1")
		.bind(new_logo_path.as_ref().map(|p| p.to_string_lossy().to_string()))
		.execute(&pool)
		.await
		.map_err(|e| format!("rewrite logo_path: {e}"))?;

	// Restore the PDF header logo + rewrite its settings path.
	if let Some(new_header_path) = write_pdf_header(app, target_id, pdf_header)? {
		sqlx::query("UPDATE company_settings SET pdf_header_logo_path = ? WHERE id = 1")
			.bind(new_header_path)
			.execute(&pool)
			.await
			.map_err(|e| format!("rewrite pdf_header_logo_path: {e}"))?;
	} else {
		// No header in the bundle → clear the stale path so the app doesn't
		// point at a missing file from the exporter's machine.
		sqlx::query("UPDATE company_settings SET pdf_header_logo_path = NULL WHERE id = 1")
			.execute(&pool)
			.await
			.map_err(|e| format!("clear pdf_header_logo_path: {e}"))?;
	}
	write_attachment_files(app, target_id, attachments)?;

	pool.close().await;

	tenants::set_tenant_logo_internal(app, target_id, updated_logo_file)?;
	Ok(tenants::get_tenant(app, target_id)?)
}

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
		// Only allow plain relative components — rejects absolute paths, Windows
		// drive/UNC prefixes, leading separators, "..", and "." from a crafted bundle
		// (any of which could otherwise escape `base` via Path::join's absolute-path
		// replacement). Belt-and-suspenders: confirm the joined path stays under base.
		let rel_path = std::path::Path::new(rel);
		if !rel_path.components().all(|c| matches!(c, std::path::Component::Normal(_))) {
			continue;
		}
		let dest = base.join(rel_path);
		if !dest.starts_with(&base) {
			continue;
		}
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

fn logos_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
	let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("logos");
	std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
	Ok(dir.join(name))
}

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
