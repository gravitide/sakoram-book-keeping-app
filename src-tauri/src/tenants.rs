// Multi-tenancy: each business is a portable, user-chosen FOLDER.
//
// App-level state stays under app_data_dir:
//
//   tenants.json                 ← registry + active_tenant_id (only this)
//   license.json                 ← per-install license/trial (untouched here)
//
// A business folder (chosen by the user, anywhere on disk) contains
// everything for that business:
//
//   business.json                ← marker (self-describing: id, name, schema)
//   business.db                  ← the SQLite file (FIXED name)
//   attachments/<type>/<id>/…    ← document scans / photos
//   logos/logo.<ext>             ← square identity logo
//   pdf-header.<ext>             ← optional wide letterhead image
//   business.db.enc + business.vault.json   ← only when encrypted
//
// `id` is the stable business identity — used by the registry, marker,
// and vault session keys. Filenames inside the folder are fixed (the
// folder is the container), so the id is not encoded in filenames. The
// registry's `path` field records where each business folder lives.
//
// We deliberately do NOT use tauri-plugin-sql's add_migrations() because
// it requires URLs to be registered at app build time. Adding a tenant
// at runtime means a new URL plugin-sql doesn't know about. Instead we
// run migrations ourselves with sqlx the moment a tenant DB is opened
// (idempotent — checks _sqlx_migrations and skips already-applied ones).

use std::path::{Path, PathBuf};
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

use crate::data_io::SCHEMA_VERSION;

// Default bill categories seeded into every freshly-created tenant. Same
// list the demo seed used to inject manually — moved here so brand-new
// businesses also start with a sensible picker instead of an empty one.
// `INSERT OR IGNORE` keeps re-runs safe (the UNIQUE name index on
// bill_categories makes duplicates a no-op).
const DEFAULT_BILL_CATEGORIES: &[(&str, &str, &str)] = &[
	("Utilities", "amber", "i-lucide-zap"),
	("Supplies", "blue", "i-lucide-package"),
	("Fees", "violet", "i-lucide-briefcase"),
	("Rent", "orange", "i-lucide-home"),
	("Salaries", "emerald", "i-lucide-graduation-cap"),
	("Marketing", "red", "i-lucide-shopping-cart"),
	("Software", "sky", "i-lucide-laptop"),
	("Travel", "green", "i-lucide-car"),
	("Insurance", "violet", "i-lucide-shield"),
];

// Embedded migration SQL — same files plugin-sql used to consume.
const MIGRATIONS: &[(i32, &str, &str)] = &[
	(1, "initial schema", include_str!("../migrations/0001_initial.sql")),
	(2, "documents", include_str!("../migrations/0002_documents.sql")),
	(3, "bills, vouchers", include_str!("../migrations/0003_bills_vouchers.sql")),
	(4, "appearance", include_str!("../migrations/0004_appearance.sql")),
	(5, "default font google sans", include_str!("../migrations/0005_default_font_google_sans.sql")),
	(6, "pdf font", include_str!("../migrations/0006_pdf_font.sql")),
	(7, "vendors", include_str!("../migrations/0007_vendors.sql")),
	(8, "bills use vendors", include_str!("../migrations/0008_bills_use_vendors.sql")),
	(9, "bill categories", include_str!("../migrations/0009_bill_categories.sql")),
	(10, "default font inter", include_str!("../migrations/0010_default_font_inter.sql")),
	(11, "currency", include_str!("../migrations/0011_currency.sql")),
	(12, "pdf header logo", include_str!("../migrations/0012_pdf_header_logo.sql")),
	(13, "bills payments via vouchers", include_str!("../migrations/0013_bills_payments_via_vouchers.sql")),
	(14, "invoices payments via vouchers", include_str!("../migrations/0014_invoices_payments_via_vouchers.sql")),
	(15, "employees", include_str!("../migrations/0015_employees.sql")),
	(16, "payslips", include_str!("../migrations/0016_payslips.sql")),
	(17, "vouchers payslip link", include_str!("../migrations/0017_vouchers_payslip_link.sql")),
	(18, "employee number", include_str!("../migrations/0018_employee_number.sql")),
	(19, "payroll cycle", include_str!("../migrations/0019_payroll_cycle.sql")),
	(20, "pdf protection", include_str!("../migrations/0020_pdf_protection.sql")),
	(21, "invoice attachments", include_str!("../migrations/0021_invoice_attachments.sql")),
	(22, "document attachments", include_str!("../migrations/0022_document_attachments.sql")),
	(23, "business banks", include_str!("../migrations/0023_business_banks.sql")),
	(24, "default font akt", include_str!("../migrations/0024_default_font_akt.sql")),
	(25, "currency symbol override", include_str!("../migrations/0025_currency_symbol_override.sql")),
	(26, "drop attachment_path", include_str!("../migrations/0026_drop_attachment_path.sql")),
	(27, "title override", include_str!("../migrations/0027_title_override.sql")),
	(28, "denormalize list party names", include_str!("../migrations/0028_denormalize_list_party_names.sql")),
	(29, "credit notes", include_str!("../migrations/0029_credit_notes.sql")),
	(30, "recurring invoices", include_str!("../migrations/0030_recurring_invoices.sql")),
	(31, "recurring bundle subtotal", include_str!("../migrations/0031_recurring_bundle_subtotal.sql")),
	(32, "recurring bills", include_str!("../migrations/0032_recurring_bills.sql")),
	(33, "voucher bank id", include_str!("../migrations/0033_voucher_bank_id.sql")),
	(34, "bank reconciliation", include_str!("../migrations/0034_bank_reconciliation.sql")),
	(35, "payslip statutory", include_str!("../migrations/0035_payslip_statutory.sql")),
	(36, "payslip paye", include_str!("../migrations/0036_payslip_paye.sql")),
	(37, "pdf templates", include_str!("../migrations/0037_pdf_templates.sql")),
	(38, "default prepared by", include_str!("../migrations/0038_default_prepared_by.sql")),
	(39, "pdf theme color", include_str!("../migrations/0039_pdf_theme_color.sql")),
	(40, "letters", include_str!("../migrations/0040_letters.sql")),
	(41, "letter settings", include_str!("../migrations/0041_letter_settings.sql")),
	(42, "letter signature", include_str!("../migrations/0042_letter_signature.sql")),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tenant {
	/// Stable business identity. Lives in the marker + registry; no longer
	/// encoded into filenames (the folder is the container).
	pub id: String,
	/// Display name. Mutable; doesn't affect the folder path.
	pub name: String,
	/// Absolute path to this business's folder — the source of truth for all
	/// of its files (business.db, attachments/, logos/, pdf-header.<ext>).
	pub path: String,
	/// Relative logo filename under `<path>/logos/` (e.g. "logo.png"), or None.
	pub logo_file: Option<String>,
	/// True once the user has enabled at-rest encryption for this business.
	/// `#[serde(default)]` so tenants.json written before this field parses
	/// (legacy entries are unencrypted).
	#[serde(default)]
	pub encrypted: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TenantRegistry {
	pub active_tenant_id: Option<String>,
	pub tenants: Vec<Tenant>,
}

// ---------- Path helpers ----------------------------------------------------
//
// Everything for a business lives inside its folder. Given an `id`, we look up
// the folder path in the registry, then join fixed filenames. This is the
// single point where `id` → on-disk location is resolved.

fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
	Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("tenants.json"))
}

/// Absolute path of a business's folder, resolved from the registry.
pub fn folder_for(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
	let t = get_tenant(app, id)?;
	Ok(PathBuf::from(t.path))
}

pub fn tenant_db_path_public(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
	Ok(folder_for(app, id)?.join("business.db"))
}

pub fn tenant_enc_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
	Ok(folder_for(app, id)?.join("business.db.enc"))
}

pub fn tenant_vault_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
	Ok(folder_for(app, id)?.join("business.vault.json"))
}

/// `<folder>/logos/`, created if missing.
pub fn logos_dir_for(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
	let d = folder_for(app, id)?.join("logos");
	std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
	Ok(d)
}

/// `<folder>/attachments/` (not created here — callers append <type>/<id>).
pub fn attachments_dir_for(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
	Ok(folder_for(app, id)?.join("attachments"))
}

// ---------- Marker file (business.json) -------------------------------------
//
// A self-describing marker at the root of a business folder. Lets "Open" (and
// a fresh machine) validate a folder and rebuild a registry entry from it.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Marker {
	pub id: String,
	pub name: String,
	pub schema_version: i32,
	pub created_at: String,
	#[serde(default)]
	pub encrypted: bool,
}

fn marker_path(folder: &Path) -> PathBuf {
	folder.join("business.json")
}

fn write_marker(folder: &Path, m: &Marker) -> Result<(), String> {
	std::fs::write(marker_path(folder), serde_json::to_vec_pretty(m).map_err(|e| e.to_string())?)
		.map_err(|e| e.to_string())
}

fn read_marker(folder: &Path) -> Result<Marker, String> {
	let raw = std::fs::read(marker_path(folder))
		.map_err(|_| "Not a Sakoram business folder (missing business.json).".to_string())?;
	serde_json::from_slice(&raw).map_err(|e| format!("Corrupt business.json: {e}"))
}

/// Detect the identity-logo filename (relative to `<folder>/logos/`) for a
/// business folder, so `open_tenant` can rebuild the registry's `logo_file`.
fn detect_logo_file(folder: &Path) -> Option<String> {
	let logos = folder.join("logos");
	for ext in &["png", "jpg", "jpeg", "webp", "svg"] {
		let name = format!("logo.{ext}");
		if logos.join(&name).exists() {
			return Some(name);
		}
	}
	None
}

/// Permit the webview's `asset://` protocol to read files from a business
/// folder, so a logo on ANY drive (e.g. D:\) loads in an <img>. The asset
/// scope is otherwise compile-locked to $APPDATA (tauri.conf.json). This is a
/// runtime, process-level allow that survives webview reloads. Best-effort —
/// a failure just means that folder's logo won't render, never a hard error.
fn allow_asset_dir(app: &AppHandle, folder: &str) {
	let _ = app.asset_protocol_scope().allow_directory(folder, true);
}

/// Coarse ISO-8601 UTC timestamp for the marker's `created_at`.
fn now_iso() -> String {
	use std::time::{SystemTime, UNIX_EPOCH};
	let secs = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|d| d.as_secs())
		.unwrap_or(0);
	let days = secs / 86_400;
	let secs_today = secs % 86_400;
	let h = secs_today / 3600;
	let m = (secs_today % 3600) / 60;
	let s = secs_today % 60;
	let z = days as i64 + 719_468;
	let era = z.div_euclid(146_097);
	let doe = (z - era * 146_097) as u64;
	let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
	let y = yoe as i64 + era * 400;
	let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
	let mp = (5 * doy + 2) / 153;
	let d = doy - (153 * mp + 2) / 5 + 1;
	let m_cal = if mp < 10 { mp + 3 } else { mp - 9 };
	let y = if m_cal <= 2 { y + 1 } else { y };
	format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m_cal, d, h, m, s)
}

/// Create a fresh business folder under `parent_dir` named `folder_name`,
/// de-duplicated with " (2)", " (3)"… if that name is already taken. Returns
/// the created folder path. Race-safe within a single process (create then
/// bump on collision).
fn create_business_folder(parent_dir: &str, folder_name: &str) -> Result<PathBuf, String> {
	if parent_dir.trim().is_empty() {
		return Err("A location for the business folder is required.".into());
	}
	let base = {
		let f = folder_name.trim();
		if f.is_empty() { "business".to_string() } else { f.to_string() }
	};
	let parent = PathBuf::from(parent_dir);
	let mut folder = parent.join(&base);
	let mut n = 2;
	while folder.exists() {
		folder = parent.join(format!("{base} ({n})"));
		n += 1;
	}
	std::fs::create_dir_all(&folder).map_err(|e| format!("create business folder: {e}"))?;
	Ok(folder)
}

/// Best-effort teardown of a tenant that was created mid-import but whose import
/// then failed — removes the entire business folder plus its registry entry so a
/// failed import never leaves a broken business in the picker. Safe to call with
/// a tenant id that may or may not be registered.
pub fn discard_tenant(app: &AppHandle, id: &str) {
	// Grab the folder path (if the entry still exists) before we drop it.
	let folder = get_tenant(app, id).ok().map(|t| t.path);
	if let Ok(mut reg) = read_registry(app) {
		let before = reg.tenants.len();
		reg.tenants.retain(|t| t.id != id);
		if reg.active_tenant_id.as_deref() == Some(id) {
			reg.active_tenant_id = None;
		}
		if reg.tenants.len() != before {
			let _ = write_registry(app, &reg);
		}
	}
	if let Some(path) = folder {
		let _ = std::fs::remove_dir_all(&path);
	}
}

// ---------- Registry I/O ----------------------------------------------------

fn read_registry(app: &AppHandle) -> Result<TenantRegistry, String> {
	let path = registry_path(app)?;
	if !path.exists() {
		return Ok(TenantRegistry::default());
	}
	let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
	// Fall back to an empty registry if the file can't be parsed — e.g. a
	// pre-portable-folders tenants.json whose entries lack the now-required
	// `path` field. Clean cutover (pre-1.0, disposable): the user starts fresh
	// and re-Opens their business folders, which still hold all their data.
	// Avoids bricking the welcome screen on an incompatible old registry.
	Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

fn write_registry(app: &AppHandle, reg: &TenantRegistry) -> Result<(), String> {
	let path = registry_path(app)?;
	if let Some(parent) = path.parent() {
		std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
	}
	let bytes = serde_json::to_vec_pretty(reg).map_err(|e| e.to_string())?;
	std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

// ---------- Slug generation -------------------------------------------------

fn slugify(name: &str) -> String {
	let lowered: String = name
		.chars()
		.map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
		.collect();
	let parts: Vec<&str> = lowered.split('-').filter(|s| !s.is_empty()).collect();
	let joined = parts.join("-");
	if joined.is_empty() { "business".to_string() } else { joined }
}

fn unique_slug(base: &str, existing: &[Tenant]) -> String {
	let used: std::collections::HashSet<&str> = existing.iter().map(|t| t.id.as_str()).collect();
	if !used.contains(base) {
		return base.to_string();
	}
	for i in 2..1000 {
		let candidate = format!("{base}-{i}");
		if !used.contains(candidate.as_str()) {
			return candidate;
		}
	}
	// Fall back to a timestamp suffix; collision-resistant enough.
	let ts = std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|d| d.as_millis())
		.unwrap_or(0);
	format!("{base}-{ts}")
}

// ---------- Migration runner ------------------------------------------------

/// Open the DB at `path` (creating the file if missing) and run any
/// migrations that haven't been applied yet. Idempotent: callers can
/// invoke this every time they're about to use a tenant DB.
async fn run_migrations(path: &Path) -> Result<(), String> {
	let url = format!("sqlite:{}", path.to_string_lossy());
	let opts = SqliteConnectOptions::from_str(&url)
		.map_err(|e| format!("bad sqlite url: {e}"))?
		.create_if_missing(true);
	let pool = SqlitePool::connect_with(opts)
		.await
		.map_err(|e| format!("connect failed: {e}"))?;

	// We use the same table name plugin-sql/sqlx uses, so legacy DBs
	// migrated by plugin-sql's runner are recognised and we don't re-run
	// already-applied migrations on them.
	sqlx::query(
		"CREATE TABLE IF NOT EXISTS _sqlx_migrations (
			version INTEGER PRIMARY KEY,
			description TEXT NOT NULL,
			installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			success BOOLEAN NOT NULL DEFAULT 1,
			checksum BLOB NOT NULL DEFAULT (x''),
			execution_time BIGINT NOT NULL DEFAULT 0
		)",
	)
	.execute(&pool)
	.await
	.map_err(|e| format!("create _sqlx_migrations: {e}"))?;

	for (version, desc, sql) in MIGRATIONS {
		let already: Option<(i64,)> =
			sqlx::query_as("SELECT version FROM _sqlx_migrations WHERE version = ?")
				.bind(*version as i64)
				.fetch_optional(&pool)
				.await
				.map_err(|e| format!("check migration {version}: {e}"))?;
		if already.is_some() {
			continue;
		}

		// Our migration files are vanilla DDL with no triggers and no
		// quoted semicolons, so a naive split is safe.
		for stmt in split_sql_statements(sql) {
			sqlx::query(&stmt).execute(&pool).await.map_err(|e| {
				format!("migration {version} '{desc}' failed on stmt:\n{stmt}\n→ {e}")
			})?;
		}

		sqlx::query("INSERT INTO _sqlx_migrations (version, description, success) VALUES (?, ?, 1)")
			.bind(*version as i64)
			.bind(*desc)
			.execute(&pool)
			.await
			.map_err(|e| format!("record migration {version}: {e}"))?;
	}

	pool.close().await;
	Ok(())
}

fn split_sql_statements(sql: &str) -> Vec<String> {
	let mut out = Vec::new();
	let mut buf = String::new();
	for line in sql.lines() {
		let trimmed = line.trim_start();
		if trimmed.starts_with("--") || trimmed.is_empty() {
			continue;
		}
		buf.push_str(line);
		buf.push('\n');
	}
	for stmt in buf.split(';') {
		let s = stmt.trim();
		if !s.is_empty() {
			out.push(s.to_string());
		}
	}
	out
}

// ---------- Fresh-tenant seed -----------------------------------------------

/// Stamps the new tenant DB with the user's chosen business name and the
/// default bill categories. Called right after `run_migrations` from both
/// the public `create_tenant` command and `create_tenant_internal` (which
/// data_io uses during import). Safe to re-run: business_name UPDATE is
/// idempotent and category INSERTs use OR IGNORE against the UNIQUE name
/// index so existing categories aren't disturbed.
async fn seed_fresh_tenant(db_path: &Path, business_name: &str) -> Result<(), String> {
	let url = format!("sqlite:{}", db_path.to_string_lossy());
	let opts = SqliteConnectOptions::from_str(&url).map_err(|e| e.to_string())?;
	let pool = SqlitePool::connect_with(opts).await.map_err(|e| e.to_string())?;

	sqlx::query("UPDATE company_settings SET business_name = ? WHERE id = 1")
		.bind(business_name)
		.execute(&pool)
		.await
		.map_err(|e| format!("seed business_name: {e}"))?;

	for (name, color, icon) in DEFAULT_BILL_CATEGORIES {
		sqlx::query(
			"INSERT OR IGNORE INTO bill_categories (name, color, icon) VALUES (?, ?, ?)",
		)
		.bind(*name)
		.bind(*color)
		.bind(*icon)
		.execute(&pool)
		.await
		.map_err(|e| format!("seed bill_category {name}: {e}"))?;
	}

	pool.close().await;
	Ok(())
}

// ---------- Tauri commands --------------------------------------------------

#[tauri::command]
pub async fn list_tenants(app: AppHandle) -> Result<TenantRegistry, String> {
	let mut reg = read_registry(&app)?;
	// Self-heal a stale active_tenant_id (e.g. registry hand-edited).
	if let Some(active) = reg.active_tenant_id.clone() {
		if !reg.tenants.iter().any(|t| t.id == active) {
			reg.active_tenant_id = None;
			write_registry(&app, &reg)?;
		}
	}
	// Allow every known business folder for asset:// reads so their logos
	// render on the welcome screen + sidebar regardless of drive.
	for t in &reg.tenants {
		allow_asset_dir(&app, &t.path);
	}
	Ok(reg)
}

/// Create a brand-new business in `<parent_dir>/<folder_name>` (de-duped with
/// " (2)"…). `name` fills the registry entry, marker, and DB `business_name`;
/// `folder_name` (already sanitized by the JS `safeFolderName` util) only names
/// the folder. A fresh `business.db` is migrated + seeded, and a `business.json`
/// marker is written so the folder is self-describing.
#[tauri::command]
pub async fn create_tenant(
	app: AppHandle,
	name: String,
	parent_dir: String,
	folder_name: String,
) -> Result<Tenant, String> {
	let trimmed = name.trim();
	if trimmed.is_empty() {
		return Err("Business name is required".into());
	}

	let mut reg = read_registry(&app)?;
	let id = unique_slug(&slugify(trimmed), &reg.tenants);

	let folder = create_business_folder(&parent_dir, &folder_name)?;
	let db_path = folder.join("business.db");
	run_migrations(&db_path).await?;
	seed_fresh_tenant(&db_path, trimmed).await?;

	write_marker(
		&folder,
		&Marker {
			id: id.clone(),
			name: trimmed.to_string(),
			schema_version: SCHEMA_VERSION,
			created_at: now_iso(),
			encrypted: false,
		},
	)?;

	let tenant = Tenant {
		id: id.clone(),
		name: trimmed.to_string(),
		path: folder.to_string_lossy().to_string(),
		logo_file: None,
		encrypted: false,
	};
	reg.tenants.push(tenant.clone());
	if reg.active_tenant_id.is_none() {
		reg.active_tenant_id = Some(id);
	}
	write_registry(&app, &reg)?;
	allow_asset_dir(&app, &tenant.path);
	Ok(tenant)
}

/// Open an existing business from its folder. Validates the marker + business.db,
/// runs any pending migrations (schema catch-up), then upserts the registry entry
/// keyed on the marker's `id`.
#[tauri::command]
pub async fn open_tenant(app: AppHandle, path: String) -> Result<Tenant, String> {
	let folder = PathBuf::from(&path);
	let marker = read_marker(&folder)?;
	let db = folder.join("business.db");
	// An encrypted-but-locked business ships only business.db.enc; we must not
	// migrate a missing db (the empty-DB hazard). Accept either a plaintext db
	// or the encrypted blob as proof this is a real business folder.
	let enc = folder.join("business.db.enc");
	if !db.exists() && !enc.exists() {
		return Err("Folder has no business.db.".into());
	}
	if db.exists() {
		run_migrations(&db).await?;
	}

	let tenant = Tenant {
		id: marker.id.clone(),
		name: marker.name.clone(),
		path: folder.to_string_lossy().to_string(),
		logo_file: detect_logo_file(&folder),
		encrypted: marker.encrypted,
	};

	let mut reg = read_registry(&app)?;
	match reg.tenants.iter_mut().find(|t| t.id == tenant.id) {
		Some(existing) => {
			existing.path = tenant.path.clone();
			existing.name = tenant.name.clone();
			existing.logo_file = tenant.logo_file.clone();
			existing.encrypted = tenant.encrypted;
		}
		None => reg.tenants.push(tenant.clone()),
	}
	write_registry(&app, &reg)?;
	allow_asset_dir(&app, &tenant.path);
	Ok(tenant)
}

#[tauri::command]
pub async fn rename_tenant(app: AppHandle, id: String, name: String) -> Result<(), String> {
	let trimmed = name.trim();
	if trimmed.is_empty() {
		return Err("Name is required".into());
	}
	let mut reg = read_registry(&app)?;
	let tenant = reg.tenants.iter_mut().find(|t| t.id == id).ok_or("Tenant not found")?;
	tenant.name = trimmed.to_string();
	let folder = PathBuf::from(&tenant.path);
	write_registry(&app, &reg)?;

	// Keep the marker's name in sync so a re-open rebuilds the right label.
	if let Ok(mut m) = read_marker(&folder) {
		m.name = trimmed.to_string();
		let _ = write_marker(&folder, &m);
	}

	// Keep the DB's business_name in sync so PDFs/header reflect the rename.
	let path = folder.join("business.db");
	if path.exists() {
		let url = format!("sqlite:{}", path.to_string_lossy());
		let opts = SqliteConnectOptions::from_str(&url).map_err(|e| e.to_string())?;
		let pool = SqlitePool::connect_with(opts).await.map_err(|e| e.to_string())?;
		sqlx::query("UPDATE company_settings SET business_name = ? WHERE id = 1")
			.bind(trimmed)
			.execute(&pool)
			.await
			.map_err(|e| format!("update business_name: {e}"))?;
		pool.close().await;
	}
	Ok(())
}

/// Delete a business entirely: remove its whole folder from disk AND drop the
/// registry entry. Caller must close the open DB connection first (Windows
/// locks open files). See `forget_tenant` to drop only the registry entry.
#[tauri::command]
pub async fn delete_tenant(app: AppHandle, id: String) -> Result<(), String> {
	let mut reg = read_registry(&app)?;
	let pos = reg.tenants.iter().position(|t| t.id == id).ok_or("Tenant not found")?;
	let tenant = reg.tenants.remove(pos);
	// If the deleted tenant was active, clear the active pointer so the
	// next launch (or middleware redirect) sends the user to /welcome.
	if reg.active_tenant_id.as_deref() == Some(&tenant.id) {
		reg.active_tenant_id = None;
	}
	write_registry(&app, &reg)?;

	// Remove the entire business folder (db, attachments, logos, pdf header,
	// vault blob + metadata all live inside it). Best-effort.
	let _ = std::fs::remove_dir_all(&tenant.path);
	Ok(())
}

/// Remove a business from the registry WITHOUT touching its folder on disk —
/// the user can re-open it later via Open. Clears the active pointer if it
/// matched.
#[tauri::command]
pub async fn forget_tenant(app: AppHandle, id: String) -> Result<(), String> {
	let mut reg = read_registry(&app)?;
	let pos = reg.tenants.iter().position(|t| t.id == id).ok_or("Tenant not found")?;
	let tenant = reg.tenants.remove(pos);
	if reg.active_tenant_id.as_deref() == Some(&tenant.id) {
		reg.active_tenant_id = None;
	}
	write_registry(&app, &reg)?;
	Ok(())
}

#[tauri::command]
pub async fn set_active_tenant(app: AppHandle, id: String) -> Result<(), String> {
	let mut reg = read_registry(&app)?;
	if !reg.tenants.iter().any(|t| t.id == id) {
		return Err("Tenant not found".into());
	}
	reg.active_tenant_id = Some(id);
	write_registry(&app, &reg)?;
	Ok(())
}

/// Clear the active-business pointer (used by "Close business" → welcome).
/// The registry entry stays; only `active_tenant_id` is nulled.
#[tauri::command]
pub async fn clear_active_tenant(app: AppHandle) -> Result<(), String> {
	let mut reg = read_registry(&app)?;
	reg.active_tenant_id = None;
	write_registry(&app, &reg)?;
	Ok(())
}

/// Idempotently ensures the tenant's DB exists and is migrated, then
/// returns the absolute sqlite URL JS should pass to `Database.load()`.
#[tauri::command]
pub async fn ensure_tenant_db(app: AppHandle, id: String) -> Result<String, String> {
	let path = tenant_db_path_public(&app, &id)?;
	run_migrations(&path).await?;
	// Business DBs live at arbitrary user-chosen paths, so we hand plugin-sql
	// an absolute sqlite URL rather than an app-data-relative one.
	Ok(format!("sqlite:{}", path.to_string_lossy()))
}

/// Update the cached logo filename in tenants.json (called from the
/// settings page after the user uploads/removes a logo).
#[tauri::command]
pub async fn set_tenant_logo(
	app: AppHandle,
	id: String,
	logo_file: Option<String>,
) -> Result<(), String> {
	let mut reg = read_registry(&app)?;
	let tenant = reg.tenants.iter_mut().find(|t| t.id == id).ok_or("Tenant not found")?;
	tenant.logo_file = logo_file;
	write_registry(&app, &reg)?;
	Ok(())
}

/// Returns the absolute path to a tenant's logo (or null if none set),
/// so the welcome screen can render it via convertFileSrc.
#[tauri::command]
pub async fn tenant_logo_path(
	app: AppHandle,
	id: String,
) -> Result<Option<String>, String> {
	let reg = read_registry(&app)?;
	let tenant = reg.tenants.iter().find(|t| t.id == id).ok_or("Tenant not found")?;
	Ok(match &tenant.logo_file {
		Some(f) => Some(
			PathBuf::from(&tenant.path)
				.join("logos")
				.join(f)
				.to_string_lossy()
				.to_string(),
		),
		None => None,
	})
}

/// Write a logo / PDF-header image into the business folder from the frontend.
///
/// Done in Rust (std::fs, which is NOT gated by Tauri's capability scope)
/// rather than the JS fs plugin, because a business folder can live on ANY
/// drive (e.g. D:\Sakoram\…) — outside the fs plugin's allow-list, which can't
/// cleanly glob arbitrary drive roots. The path is derived from the registry
/// (never caller-controlled), so this stays safe. Returns the absolute path of
/// the written file (stored on company_settings.{logo_path,pdf_header_logo_path}).
///
/// `kind` is "logo" (→ <folder>/logos/logo.<ext>) or "pdf-header"
/// (→ <folder>/pdf-header.<ext>). Any stale same-stem file of a different
/// extension is removed so there's never two.
#[tauri::command]
pub fn save_business_asset(
	app: AppHandle,
	id: String,
	kind: String,
	ext: String,
	bytes: Vec<u8>,
) -> Result<String, String> {
	let ext = {
		let e = ext.trim().trim_start_matches('.').to_lowercase();
		if e.is_empty() { "png".to_string() } else { e }
	};
	let (dir, stem) = match kind.as_str() {
		"logo" => (logos_dir_for(&app, &id)?, "logo"),
		"pdf-header" => (folder_for(&app, &id)?, "pdf-header"),
		_ => return Err(format!("unknown asset kind: {kind}")),
	};
	std::fs::create_dir_all(&dir).map_err(|e| format!("create asset dir: {e}"))?;
	// Drop any stale <stem>.<other-ext> so a format change doesn't orphan a file.
	if let Ok(entries) = std::fs::read_dir(&dir) {
		for entry in entries.flatten() {
			let p = entry.path();
			let same_stem = p.file_stem().and_then(|s| s.to_str()) == Some(stem);
			let same_ext = p
				.extension()
				.and_then(|s| s.to_str())
				.map(|e| e.to_lowercase())
				== Some(ext.clone());
			if same_stem && !same_ext {
				let _ = std::fs::remove_file(&p);
			}
		}
	}
	let dest = dir.join(format!("{stem}.{ext}"));
	std::fs::write(&dest, &bytes).map_err(|e| format!("write asset: {e}"))?;
	Ok(dest.to_string_lossy().to_string())
}

/// Whether a path exists on disk. Used by the welcome / Businesses pages to
/// flag registry entries whose folder was moved/deleted ("Not found" badge) —
/// done in Rust (std::fs, unscoped) so it works for business folders on ANY
/// drive, which the fs plugin's capability scope can't reach.
#[tauri::command]
pub fn path_exists(path: String) -> bool {
	std::path::Path::new(&path).exists()
}

// ---------- Cross-module helpers (consumed by data_io) ----------------------
//
// data_io needs to create tenants and update logos as part of the import
// flow without going through tauri::command (which would require an
// AppHandle round-trip from JS). These mirror the command bodies but
// take &AppHandle directly.

pub fn read_registry_public(app: &AppHandle) -> Result<TenantRegistry, String> {
	read_registry(app)
}

pub fn get_tenant(app: &AppHandle, id: &str) -> Result<Tenant, String> {
	let reg = read_registry(app)?;
	reg.tenants.iter().find(|t| t.id == id).cloned().ok_or_else(|| "Tenant not found".into())
}

/// Create a fresh business folder + registry entry for an IMPORT "new" flow.
/// Mirrors `create_tenant` but takes `&AppHandle` directly (data_io calls it
/// without a command round-trip). The folder name is derived from `name` via
/// `slugify` (import has no separate JS-sanitized folder name), then de-duped.
pub async fn create_tenant_internal(
	app: &AppHandle,
	name: &str,
	parent_dir: &str,
) -> Result<Tenant, String> {
	let trimmed = name.trim();
	if trimmed.is_empty() {
		return Err("Business name is required".into());
	}
	let mut reg = read_registry(app)?;
	let id = unique_slug(&slugify(trimmed), &reg.tenants);

	let folder = create_business_folder(parent_dir, trimmed)?;
	let db_path = folder.join("business.db");
	run_migrations(&db_path).await?;
	seed_fresh_tenant(&db_path, trimmed).await?;

	write_marker(
		&folder,
		&Marker {
			id: id.clone(),
			name: trimmed.to_string(),
			schema_version: SCHEMA_VERSION,
			created_at: now_iso(),
			encrypted: false,
		},
	)?;

	let tenant = Tenant {
		id: id.clone(),
		name: trimmed.to_string(),
		path: folder.to_string_lossy().to_string(),
		logo_file: None,
		encrypted: false,
	};
	reg.tenants.push(tenant.clone());
	if reg.active_tenant_id.is_none() {
		reg.active_tenant_id = Some(id);
	}
	write_registry(app, &reg)?;
	Ok(tenant)
}

/// The active tenant's slug, or an error if no business is selected.
/// Consumed by the phone-upload module to scope attachment files per
/// business (invoice IDs are only unique within a single tenant DB).
pub fn active_tenant_id(app: &AppHandle) -> Result<String, String> {
	read_registry(app)?
		.active_tenant_id
		.ok_or_else(|| "No active business selected".into())
}

pub fn set_tenant_logo_internal(
	app: &AppHandle,
	id: &str,
	logo_file: Option<String>,
) -> Result<(), String> {
	let mut reg = read_registry(app)?;
	let tenant = reg.tenants.iter_mut().find(|t| t.id == id).ok_or("Tenant not found")?;
	tenant.logo_file = logo_file;
	write_registry(app, &reg)
}

/// Flip a tenant's `encrypted` flag in the registry.
pub fn set_tenant_encrypted(app: &AppHandle, id: &str, encrypted: bool) -> Result<(), String> {
	let mut reg = read_registry(app)?;
	let tenant = reg.tenants.iter_mut().find(|t| t.id == id).ok_or("Tenant not found")?;
	tenant.encrypted = encrypted;
	write_registry(app, &reg)
}

/// Whether a tenant is marked encrypted.
pub fn is_tenant_encrypted(app: &AppHandle, id: &str) -> Result<bool, String> {
	let reg = read_registry(app)?;
	Ok(reg.tenants.iter().find(|t| t.id == id).map(|t| t.encrypted).unwrap_or(false))
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn tenant_encrypted_defaults_false_when_field_absent() {
		// A tenants.json entry without the `encrypted` field must still parse,
		// with encrypted defaulting to false.
		let json = r#"{"active_tenant_id":"acme","tenants":[{"id":"acme","name":"Acme","path":"C:/biz/Acme","logo_file":null}]}"#;
		let reg: TenantRegistry = serde_json::from_str(json).unwrap();
		assert_eq!(reg.tenants[0].encrypted, false);
		assert_eq!(reg.tenants[0].path, "C:/biz/Acme");
	}

	#[test]
	fn tenant_round_trips() {
		let t = Tenant {
			id: "acme".into(),
			name: "Acme".into(),
			path: "/tmp/Acme".into(),
			logo_file: Some("logo.png".into()),
			encrypted: true,
		};
		let json = serde_json::to_string(&t).unwrap();
		let back: Tenant = serde_json::from_str(&json).unwrap();
		assert!(back.encrypted);
		assert_eq!(back.path, "/tmp/Acme");
		assert_eq!(back.logo_file.as_deref(), Some("logo.png"));
	}

	#[test]
	fn marker_round_trips() {
		let m = Marker {
			id: "acme".into(),
			name: "Acme".into(),
			schema_version: SCHEMA_VERSION,
			created_at: now_iso(),
			encrypted: false,
		};
		let json = serde_json::to_string(&m).unwrap();
		let back: Marker = serde_json::from_str(&json).unwrap();
		assert_eq!(back.id, "acme");
		assert_eq!(back.schema_version, SCHEMA_VERSION);
	}
}
