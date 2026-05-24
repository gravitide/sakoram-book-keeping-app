// Export / import a tenant's data as a portable .zip bundle.
//
// Bundle layout:
//
//   manifest.json     metadata: schema version, app version, business name
//   data.json         { "<table>": [...rows...], ... }
//   assets/logo.<ext> the tenant's logo file, if any
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

use std::io::{Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager};

use crate::tenants;

const FORMAT_VERSION: i32 = 1;
/// Increment when adding migrations beyond what existing exports can carry.
const SCHEMA_VERSION: i32 = 25;

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
	"bill_categories",
	"bills",
	"bill_lines",
	"payslips",
	"payslip_lines",
	"vouchers",
	"document_attachments",
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

	let manifest = ExportManifest {
		format: "sakoram-export".into(),
		format_version: FORMAT_VERSION,
		schema_version: SCHEMA_VERSION,
		app_version: env!("CARGO_PKG_VERSION").to_string(),
		exported_at: current_iso_utc(),
		business_name: tenant.name.clone(),
		tenant_id: tenant.id.clone(),
		logo_asset: logo_payload.as_ref().map(|(name, _)| name.clone()),
	};

	// Write the zip.
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

	zip.start_file("data.json", opts).map_err(|e| e.to_string())?;
	zip.write_all(&serde_json::to_vec_pretty(&Value::Object(data)).map_err(|e| e.to_string())?)
		.map_err(|e| e.to_string())?;

	if let Some((name, bytes)) = logo_payload {
		zip.start_file(format!("assets/{name}"), opts).map_err(|e| e.to_string())?;
		zip.write_all(&bytes).map_err(|e| e.to_string())?;
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
) -> Result<tenants::Tenant, String> {
	let in_path = PathBuf::from(input_path);
	let manifest = peek_export_manifest(in_path.to_string_lossy().to_string()).await?;

	// Parse the bundle into memory once. (Bundles are typically small —
	// JSON of all rows + a logo file.)
	let file = std::fs::File::open(&in_path).map_err(|e| format!("open zip: {e}"))?;
	let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {e}"))?;
	let data: Value = read_zip_json(&mut archive, "data.json")?;
	let logo_bytes = match &manifest.logo_asset {
		Some(name) => Some(read_zip_bytes(&mut archive, &format!("assets/{name}"))?),
		None => None,
	};
	drop(archive);

	match mode.as_str() {
		"new" => {
			let name = target_name.unwrap_or_else(|| manifest.business_name.clone());
			import_as_new_tenant(&app, &name, &data, &manifest, logo_bytes).await
		}
		"replace" => {
			let id = target_tenant_id
				.ok_or_else(|| "Replace mode requires a target tenant ID.".to_string())?;
			import_replace(&app, &id, &data, &manifest, logo_bytes).await
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
	data: &Value,
	manifest: &ExportManifest,
	logo_bytes: Option<Vec<u8>>,
) -> Result<tenants::Tenant, String> {
	// Use the existing create_tenant path — produces a unique slug, a
	// fresh DB with migrations applied, and a registry entry.
	let tenant = tenants::create_tenant_internal(app, name).await?;

	let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
	let db_path = app_data.join("businesses").join(format!("{}.db", tenant.id));
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
	let updated_logo_file = write_logo(app, &tenant.id, manifest, logo_bytes.as_deref()).await?;
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
	pool.close().await;

	// Sync logo filename + display name into the registry.
	tenants::set_tenant_logo_internal(app, &tenant.id, updated_logo_file)?;
	Ok(tenants::get_tenant(app, &tenant.id)?)
}

async fn import_replace(
	app: &AppHandle,
	target_id: &str,
	data: &Value,
	manifest: &ExportManifest,
	logo_bytes: Option<Vec<u8>>,
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

	let pool = open_pool(&db_path).await?;
	wipe_tenant_data(&pool).await?;

	for table in TABLES {
		if let Some(rows) = data.get(*table) {
			restore_table(&pool, table, rows).await?;
		}
	}

	let updated_logo_file = write_logo(app, target_id, manifest, logo_bytes.as_deref()).await?;
	let new_logo_path = updated_logo_file
		.as_ref()
		.map(|f| logos_path(app, f))
		.transpose()?;
	sqlx::query("UPDATE company_settings SET logo_path = ? WHERE id = 1")
		.bind(new_logo_path.as_ref().map(|p| p.to_string_lossy().to_string()))
		.execute(&pool)
		.await
		.map_err(|e| format!("rewrite logo_path: {e}"))?;
	pool.close().await;

	tenants::set_tenant_logo_internal(app, target_id, updated_logo_file)?;
	Ok(tenants::get_tenant(app, target_id)?)
}

fn logos_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
	let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("logos");
	std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
	Ok(dir.join(name))
}

async fn write_logo(
	app: &AppHandle,
	tenant_id: &str,
	manifest: &ExportManifest,
	bytes: Option<&[u8]>,
) -> Result<Option<String>, String> {
	let (Some(asset_name), Some(bytes)) = (&manifest.logo_asset, bytes) else {
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
