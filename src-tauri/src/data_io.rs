// Export / import a tenant's data as a portable .zip bundle.
//
// Bundle layout:
//
//   manifest.json     metadata: schema version, app version, business name
//   data.json         { "<table>": [...rows...], ... }
//   assets/logo.<ext> the tenant's logo file, if any
//   attachments/<type>/<id>/<file>  document attachments
//   stationery/<file> the folder's page-design images (item-<id>.<ext>; the
//                     DB stores only their format, no path)
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
use tauri::AppHandle;

use crate::tenants;
use crate::vault;
use data_encoding::BASE64;

const FORMAT_VERSION: i32 = 1;
/// Increment when adding migrations beyond what existing exports can carry.
/// Also stamped into each business folder's `business.json` marker.
pub const SCHEMA_VERSION: i32 = 56;

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
	"letters",
	"letter_categories",
	"letter_signatures",
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

pub(crate) fn current_iso_utc() -> String {
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

// ---------- Bundle assets ---------------------------------------------------

/// Every file a bundle carries besides `data.json`.
#[derive(Debug, Default)]
pub(crate) struct BundleAssets {
	/// (asset name e.g. "logo.png", bytes) — `assets/<name>`.
	pub logo: Option<(String, Vec<u8>)>,
	/// ("<type>/<id>/<basename>", bytes) — `attachments/<rel>`.
	pub attachments: Vec<(String, Vec<u8>)>,
	/// (file name, bytes) of everything in the folder's `stationery/` — the
	/// Full-page background artwork AND its untouched original (ADR 0001).
	/// Bundled as `stationery/<name>`. No DB column points at them (the DB
	/// stores only the extension), so import just puts them back.
	pub stationery: Vec<(String, Vec<u8>)>,
}

/// The files directly inside `<folder>/stationery/` as (name, bytes).
pub(crate) fn collect_stationery(folder: &Path) -> Result<Vec<(String, Vec<u8>)>, String> {
	let Ok(entries) = std::fs::read_dir(folder.join(tenants::STATIONERY_DIR)) else { return Ok(Vec::new()) };
	let mut out = Vec::new();
	for entry in entries.flatten().filter(|e| e.path().is_file()) {
		let bytes = std::fs::read(entry.path()).map_err(|e| format!("read stationery: {e}"))?;
		out.push((entry.file_name().to_string_lossy().to_string(), bytes));
	}
	Ok(out)
}

/// A bundled stationery file name is used only if it is a single plain file
/// name — a crafted bundle can't climb out of (or nest inside) `stationery/`.
fn plain_file_name(name: &str) -> bool {
	!name.is_empty()
		&& !name.contains(['/', '\\', ':'])
		&& Path::new(name).components().count() == 1
		&& matches!(Path::new(name).components().next(), Some(std::path::Component::Normal(_)))
}

/// Make `<folder>/stationery/` hold exactly `files` (the bundle is the truth:
/// artwork the folder had that the bundle doesn't is removed).
pub(crate) fn write_stationery(folder: &Path, files: &[(String, Vec<u8>)]) -> Result<(), String> {
	let dir = folder.join(tenants::STATIONERY_DIR);
	if let Ok(entries) = std::fs::read_dir(&dir) {
		for entry in entries.flatten().filter(|e| e.path().is_file()) {
			std::fs::remove_file(entry.path()).map_err(|e| format!("clear stationery: {e}"))?;
		}
	}
	for (name, bytes) in files.iter().filter(|(name, _)| plain_file_name(name)) {
		std::fs::create_dir_all(&dir).map_err(|e| format!("create stationery dir: {e}"))?;
		std::fs::write(dir.join(name), bytes).map_err(|e| format!("write stationery {name}: {e}"))?;
	}
	Ok(())
}

/// Stationery for the sealed payload of an encrypted bundle.
pub(crate) fn stationery_to_payload(files: &[(String, Vec<u8>)]) -> Value {
	Value::Array(files.iter().map(|(name, bytes)| serde_json::json!({ "name": name, "bytes_b64": BASE64.encode(bytes) })).collect())
}

/// Stationery back out of a decrypted payload (none for older bundles).
pub(crate) fn stationery_from_payload(payload: &Value) -> Result<Vec<(String, Vec<u8>)>, String> {
	let mut out = Vec::new();
	if let Some(Value::Array(list)) = payload.get("stationery") {
		for f in list {
			let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("");
			let b64 = f.get("bytes_b64").and_then(|v| v.as_str()).unwrap_or("");
			if name.is_empty() {
				continue;
			}
			let bytes = BASE64.decode(b64.as_bytes()).map_err(|e| format!("bad stationery bytes: {e}"))?;
			out.push((name.to_string(), bytes));
		}
	}
	Ok(out)
}

/// Write an UNENCRYPTED bundle: manifest, data.json, assets/, attachments/,
/// stationery/.
pub(crate) fn write_plain_bundle<W: Write + Seek>(w: W, manifest: &ExportManifest, data: &Value, assets: &BundleAssets) -> Result<(), String> {
	let mut zip = zip::ZipWriter::new(w);
	let opts: zip::write::FileOptions<'_, ()> =
		zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
	let entry = |zip: &mut zip::ZipWriter<W>, name: &str, bytes: &[u8]| -> Result<(), String> {
		zip.start_file(name, opts).map_err(|e| e.to_string())?;
		zip.write_all(bytes).map_err(|e| e.to_string())
	};
	entry(&mut zip, "manifest.json", &serde_json::to_vec_pretty(manifest).map_err(|e| e.to_string())?)?;
	entry(&mut zip, "data.json", &serde_json::to_vec_pretty(data).map_err(|e| e.to_string())?)?;
	if let Some((name, bytes)) = &assets.logo {
		entry(&mut zip, &format!("assets/{name}"), bytes)?;
	}
	for (rel, bytes) in &assets.attachments {
		entry(&mut zip, &format!("attachments/{rel}"), bytes)?;
	}
	for (name, bytes) in &assets.stationery {
		entry(&mut zip, &format!("{}/{name}", tenants::STATIONERY_DIR), bytes)?;
	}
	zip.finish().map_err(|e| format!("finalize zip: {e}"))?;
	Ok(())
}

/// Read an UNENCRYPTED bundle's data and assets. The logo is the one the
/// manifest names; attachments and stationery are found by
/// scanning entry names.
pub(crate) fn read_plain_bundle<R: Read + Seek>(archive: &mut zip::ZipArchive<R>, manifest: &ExportManifest) -> Result<(Value, BundleAssets), String> {
	let data: Value = read_zip_json(archive, "data.json")?;
	let mut assets = BundleAssets::default();
	if let Some(name) = &manifest.logo_asset {
		assets.logo = Some((name.clone(), read_zip_bytes(archive, &format!("assets/{name}"))?));
	}
	let names: Vec<String> = archive.file_names().map(|s| s.to_string()).collect();
	let stationery_prefix = format!("{}/", tenants::STATIONERY_DIR);
	for name in names {
		if name.ends_with('/') {
			continue;
		}
		if let Some(rel) = name.strip_prefix("attachments/") {
			if !rel.is_empty() {
				assets.attachments.push((rel.to_string(), read_zip_bytes(archive, &name)?));
			}
		} else if let Some(file) = name.strip_prefix(&stationery_prefix) {
			if plain_file_name(file) {
				assets.stationery.push((file.to_string(), read_zip_bytes(archive, &name)?));
			}
		}
	}
	Ok((data, assets))
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
	// Look up the tenant's display name + folder from the registry.
	let reg = tenants::read_registry_public(&app)?;
	let tenant = reg
		.tenants
		.iter()
		.find(|t| t.id == tenant_id)
		.ok_or_else(|| format!("Tenant {tenant_id} not registered"))?
		.clone();

	let folder = PathBuf::from(&tenant.path);
	let db_path = folder.join("business.db");
	if !db_path.exists() {
		return Err(format!("Business database not found: {}", db_path.display()));
	}

	let pool = open_pool(&db_path).await?;

	// Collect every table.
	let mut data = serde_json::Map::new();
	for table in TABLES {
		let rows = dump_table(&pool, table).await?;
		data.insert(table.to_string(), rows);
	}
	pool.close().await;

	// Collect attachments + stationery before sealing the bundle.
	let attachment_files = collect_attachment_files(&data);
	let stationery_files = collect_stationery(&folder)?;

	// Resolve the logo file (if present) from the business folder's logos/ dir.
	let mut logo_payload: Option<(String, Vec<u8>)> = None;
	if let Some(logo_file) = &tenant.logo_file {
		let logo_path = folder.join("logos").join(logo_file);
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
			"attachments": attachment_files.iter()
				.map(|(path, bytes)| serde_json::json!({ "path": path, "bytes_b64": BASE64.encode(bytes) }))
				.collect::<Vec<_>>(),
			"stationery": stationery_to_payload(&stationery_files),
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
	let Some(blob) = encrypted_blob else {
		let assets = BundleAssets {
			logo: logo_payload,
			attachments: attachment_files,
			stationery: stationery_files,
		};
		return write_plain_bundle(file, &manifest, &Value::Object(data), &assets);
	};

	// Encrypted: only the cleartext manifest + the sealed payload.
	let mut zip = zip::ZipWriter::new(file);
	let opts: zip::write::FileOptions<'_, ()> =
		zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
	zip.start_file("manifest.json", opts).map_err(|e| e.to_string())?;
	zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?)
		.map_err(|e| e.to_string())?;
	zip.start_file("payload.enc", opts).map_err(|e| e.to_string())?;
	zip.write_all(&blob).map_err(|e| e.to_string())?;

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
	// For mode="new": the PARENT directory the new business folder is created
	// under. Optional so existing JS callers (which will be updated in a later
	// task) still deserialize; required at runtime for "new".
	target_parent: Option<String>,
	passphrase: Option<String>,
) -> Result<tenants::Tenant, String> {
	let in_path = PathBuf::from(input_path);
	let manifest = peek_export_manifest(in_path.to_string_lossy().to_string()).await?;

	let file = std::fs::File::open(&in_path).map_err(|e| format!("open zip: {e}"))?;
	let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {e}"))?;

	let (mut data, assets): (Value, BundleAssets) = if manifest.encrypted {
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
		let logo = match (logo_name, logo_bytes) {
			(Some(name), Some(bytes)) => Some((name, bytes)),
			_ => None,
		};
		let stationery = stationery_from_payload(&payload)?;
		(data, BundleAssets { logo, attachments, stationery })
	} else {
		read_plain_bundle(&mut archive, &manifest)?
	};
	drop(archive);

	if !data.is_object() {
		return Err("Backup is malformed — its data is missing or unreadable.".into());
	}

	match mode.as_str() {
		"new" => {
			let name = target_name.unwrap_or_else(|| manifest.business_name.clone());
			let parent = target_parent
				.filter(|p| !p.trim().is_empty())
				.ok_or_else(|| "Importing as a new business needs a location for its folder.".to_string())?;
			import_as_new_tenant(&app, &name, &parent, &mut data, &assets).await
		}
		"replace" => {
			let id = target_tenant_id
				.ok_or_else(|| "Replace mode requires a target tenant ID.".to_string())?;
			rewrite_attachment_paths(&app, &id, &mut data)?;
			import_replace(&app, &id, &data, &assets).await
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
	parent_dir: &str,
	data: &mut Value,
	assets: &BundleAssets,
) -> Result<tenants::Tenant, String> {
	// Use the existing create path — produces a unique id, a fresh business
	// folder + migrated DB + marker, and a registry entry.
	let tenant = tenants::create_tenant_internal(app, name, parent_dir).await?;

	// Run the actual restore; if anything fails partway, tear the freshly-
	// created tenant back down so a failed import never leaves a broken
	// business (registered + empty DB + orphaned files) in the picker.
	match populate_new_tenant(app, &tenant.id, data, assets).await {
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
	assets: &BundleAssets,
) -> Result<(), String> {
	let (logo_name, logo_bytes) = logo_parts(assets);
	let attachments = &assets.attachments;
	// Rewrite attachment paths now that we know the new tenant id.
	rewrite_attachment_paths(app, tenant_id, data)?;

	let db_path = tenants::tenant_db_path_public(app, tenant_id)?;
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

	// Logo: extract bytes to <folder>/logos/logo.<ext>, point the DB at it.
	let updated_logo_file = write_logo(app, tenant_id, logo_name, logo_bytes.as_deref()).await?;
	let new_logo_path = updated_logo_file
		.as_ref()
		.map(|f| logos_path(app, tenant_id, f))
		.transpose()?;

	// Rewrite logo_path in the imported row (it referenced the
	// exporter's machine).
	sqlx::query("UPDATE company_settings SET logo_path = ? WHERE id = 1")
		.bind(new_logo_path.as_ref().map(|p| p.to_string_lossy().to_string()))
		.execute(&pool)
		.await
		.map_err(|e| format!("rewrite logo_path: {e}"))?;

	write_attachment_files(app, tenant_id, attachments)?;
	write_stationery(&tenants::folder_for(app, tenant_id)?, &assets.stationery)?;

	pool.close().await;

	// Sync logo filename + display name into the registry.
	tenants::set_tenant_logo_internal(app, tenant_id, updated_logo_file)?;
	Ok(())
}

async fn import_replace(
	app: &AppHandle,
	target_id: &str,
	data: &Value,
	assets: &BundleAssets,
) -> Result<tenants::Tenant, String> {
	let (logo_name, logo_bytes) = logo_parts(assets);
	let attachments = &assets.attachments;
	let folder = tenants::folder_for(app, target_id)?;
	let db_path = folder.join("business.db");
	if !db_path.exists() {
		return Err(format!("Target business database not found: {}", db_path.display()));
	}

	// Delete the old logo before writing the new one (or before clearing,
	// if the bundle has none).
	if let Some(old_logo) = tenants::get_tenant(app, target_id)?.logo_file {
		let old = folder.join("logos").join(&old_logo);
		let _ = std::fs::remove_file(&old);
	}

	// Delete the old attachments dir before writing restored ones.
	let _ = std::fs::remove_dir_all(folder.join("attachments"));

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
		.map(|f| logos_path(app, target_id, f))
		.transpose()?;
	sqlx::query("UPDATE company_settings SET logo_path = ? WHERE id = 1")
		.bind(new_logo_path.as_ref().map(|p| p.to_string_lossy().to_string()))
		.execute(&pool)
		.await
		.map_err(|e| format!("rewrite logo_path: {e}"))?;

	write_attachment_files(app, target_id, attachments)?;
	write_stationery(&folder, &assets.stationery)?;

	pool.close().await;

	tenants::set_tenant_logo_internal(app, target_id, updated_logo_file)?;
	Ok(tenants::get_tenant(app, target_id)?)
}

/// Rewrite each document_attachments row's file_path to point under the given
/// tenant's attachments dir, and return the absolute path each row maps to so
/// the caller can drop the bundled bytes there. New path =
/// <business folder>/attachments/<document_type>/<document_id>/<basename>.
fn rewrite_attachment_paths(app: &AppHandle, tenant_id: &str, data: &mut Value) -> Result<(), String> {
	let base = tenants::attachments_dir_for(app, tenant_id)?;
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
	let base = tenants::attachments_dir_for(app, tenant_id)?;
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

/// The bundle's logo as the (name, bytes) pair write_logo takes.
fn logo_parts(assets: &BundleAssets) -> (Option<&str>, Option<Vec<u8>>) {
	match &assets.logo {
		Some((name, bytes)) => (Some(name.as_str()), Some(bytes.clone())),
		None => (None, None),
	}
}

/// Absolute path of a logo file (by relative name) inside the business folder's
/// `logos/` dir, creating the dir if needed.
fn logos_path(app: &AppHandle, tenant_id: &str, name: &str) -> Result<PathBuf, String> {
	Ok(tenants::logos_dir_for(app, tenant_id)?.join(name))
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
	// Fixed stem inside the folder — the folder is the container, so the id is
	// not encoded in the filename.
	let file_name = format!("logo.{ext}");
	let path = logos_path(app, tenant_id, &file_name)?;
	std::fs::write(&path, bytes).map_err(|e| format!("write logo: {e}"))?;
	Ok(Some(file_name))
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::io::Cursor;

	fn temp_dir(tag: &str) -> PathBuf {
		let d = std::env::temp_dir().join(format!("sakoram-data-io-{tag}-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&d).unwrap();
		d
	}

	fn manifest() -> ExportManifest {
		ExportManifest {
			format: "sakoram-export".into(),
			format_version: FORMAT_VERSION,
			schema_version: SCHEMA_VERSION,
			app_version: "0.0.0".into(),
			exported_at: "2026-11-26T00:00:00Z".into(),
			business_name: "Acme".into(),
			tenant_id: "acme".into(),
			logo_asset: Some("logo.png".into()),
			encrypted: false,
			kdf_salt: None,
		}
	}

	/// A business folder with a Full-page background, Header & footer images
	/// and their originals.
	fn folder_with_stationery(tag: &str) -> PathBuf {
		let folder = temp_dir(tag);
		std::fs::create_dir_all(folder.join("stationery")).unwrap();
		std::fs::write(folder.join("stationery").join("background.pdf"), b"%PDF-art").unwrap();
		std::fs::write(folder.join("stationery").join("background-original.png"), b"PNG-original").unwrap();
		std::fs::write(folder.join("stationery").join("header.png"), b"PNG-header").unwrap();
		std::fs::write(folder.join("stationery").join("header-original.jpg"), b"JPG-header-original").unwrap();
		std::fs::write(folder.join("stationery").join("footer.svg"), b"<svg/>").unwrap();
		folder
	}

	fn sorted(mut files: Vec<(String, Vec<u8>)>) -> Vec<(String, Vec<u8>)> {
		files.sort();
		files
	}

	#[test]
	fn export_bundle_round_trips_every_asset() {
		let folder = folder_with_stationery("export");
		let assets = BundleAssets {
			logo: Some(("logo.png".into(), b"LOGO".to_vec())),
			attachments: vec![("invoice/1/a.jpg".into(), b"scan".to_vec())],
			stationery: collect_stationery(&folder).unwrap(),
		};
		let data = serde_json::json!({ "company_settings": [{ "id": 1 }] });
		let mut buf = Cursor::new(Vec::new());
		write_plain_bundle(&mut buf, &manifest(), &data, &assets).unwrap();

		let mut archive = zip::ZipArchive::new(Cursor::new(buf.into_inner())).unwrap();
		let names: Vec<String> = archive.file_names().map(|s| s.to_string()).collect();
		assert!(names.contains(&"stationery/background.pdf".to_string()));
		assert!(names.contains(&"stationery/background-original.png".to_string()));
		assert!(names.contains(&"stationery/header.png".to_string()));
		assert!(names.contains(&"stationery/header-original.jpg".to_string()));
		assert!(names.contains(&"stationery/footer.svg".to_string()));

		let (back_data, back) = read_plain_bundle(&mut archive, &manifest()).unwrap();
		assert_eq!(back_data, data);
		assert_eq!(back.logo, assets.logo);
		assert_eq!(back.attachments, assets.attachments);
		assert_eq!(sorted(back.stationery), sorted(assets.stationery));
	}

	#[test]
	fn an_encrypted_bundle_carries_the_stationery_inside_the_sealed_payload() {
		let files = collect_stationery(&folder_with_stationery("enc")).unwrap();
		let payload = serde_json::json!({ "stationery": stationery_to_payload(&files) });
		assert_eq!(sorted(stationery_from_payload(&payload).unwrap()), sorted(files));
		assert!(stationery_from_payload(&serde_json::json!({})).unwrap().is_empty());
	}

	#[test]
	fn importing_stationery_replaces_what_the_folder_had() {
		let target = temp_dir("import");
		std::fs::create_dir_all(target.join("stationery")).unwrap();
		std::fs::write(target.join("stationery").join("background.svg"), b"old").unwrap();
		let files = collect_stationery(&folder_with_stationery("import-src")).unwrap();
		write_stationery(&target, &files).unwrap();
		assert_eq!(sorted(collect_stationery(&target).unwrap()), sorted(files));
	}

	#[test]
	fn a_bundle_without_stationery_clears_the_folders_artwork() {
		let target = folder_with_stationery("import-none");
		write_stationery(&target, &[]).unwrap();
		assert!(collect_stationery(&target).unwrap().is_empty());
	}

	#[test]
	fn stationery_names_from_a_crafted_bundle_cannot_escape_the_folder() {
		let target = temp_dir("import-evil");
		let evil = vec![
			("../escape.svg".to_string(), b"x".to_vec()),
			("sub/dir.svg".to_string(), b"x".to_vec()),
			(r"..\escape.svg".to_string(), b"x".to_vec()),
			("background.svg".to_string(), b"ok".to_vec()),
		];
		write_stationery(&target, &evil).unwrap();
		assert_eq!(collect_stationery(&target).unwrap(), vec![("background.svg".to_string(), b"ok".to_vec())]);
		assert!(!target.parent().unwrap().join("escape.svg").exists());
	}

	#[test]
	fn a_business_without_stationery_exports_none() {
		assert!(collect_stationery(&temp_dir("none")).unwrap().is_empty());
	}
}
