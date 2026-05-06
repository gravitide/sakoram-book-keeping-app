// Multi-tenancy: each business has its own SQLite file.
//
// Layout under app_data_dir:
//
//   tenants.json                 ← registry + active_tenant_id
//   businesses/{id}.db           ← per-tenant SQLite database
//   logos/{id}.{ext}             ← per-tenant logo file
//
// `id` is a slug ("acme", "acme-co"). It's stable: renaming a tenant
// changes display name only — the slug, DB filename, and logo filename
// stay put so we don't have to move files around.
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

// Embedded migration SQL — same files plugin-sql used to consume.
const MIGRATIONS: &[(i32, &str, &str)] = &[
	(1, "initial schema", include_str!("../migrations/0001_initial.sql")),
	(2, "documents", include_str!("../migrations/0002_documents.sql")),
	(3, "bills, vouchers", include_str!("../migrations/0003_bills_vouchers.sql")),
	(4, "appearance", include_str!("../migrations/0004_appearance.sql")),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tenant {
	/// Stable slug — also the DB filename stem and the logo filename stem.
	pub id: String,
	/// Display name. Mutable; doesn't affect file paths.
	pub name: String,
	/// `{id}.{ext}` if the user has uploaded a logo; None otherwise.
	pub logo_file: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TenantRegistry {
	pub active_tenant_id: Option<String>,
	pub tenants: Vec<Tenant>,
}

// ---------- Path helpers ----------------------------------------------------

fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
	Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("tenants.json"))
}

fn businesses_dir(app: &AppHandle) -> Result<PathBuf, String> {
	let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("businesses");
	std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
	Ok(dir)
}

fn logos_dir(app: &AppHandle) -> Result<PathBuf, String> {
	let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("logos");
	std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
	Ok(dir)
}

fn tenant_db_path(app: &AppHandle, tenant_id: &str) -> Result<PathBuf, String> {
	Ok(businesses_dir(app)?.join(format!("{tenant_id}.db")))
}

// ---------- Registry I/O ----------------------------------------------------

fn read_registry(app: &AppHandle) -> Result<TenantRegistry, String> {
	let path = registry_path(app)?;
	if !path.exists() {
		return Ok(TenantRegistry::default());
	}
	let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
	serde_json::from_slice(&bytes).map_err(|e| e.to_string())
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

// ---------- Legacy single-DB migration --------------------------------------

/// On first launch after the multi-tenancy upgrade, look for the old
/// single `sakoram.db` and absorb it as the first tenant. Idempotent: if
/// `tenants.json` already has tenants, this no-ops.
async fn migrate_legacy_db(app: &AppHandle) -> Result<(), String> {
	let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
	let legacy = app_data.join("sakoram.db");
	if !legacy.exists() {
		return Ok(());
	}
	let existing = read_registry(app)?;
	if !existing.tenants.is_empty() {
		return Ok(());
	}

	// Pull the business name out of the legacy DB so we can derive a slug.
	let business_name = {
		let url = format!("sqlite:{}", legacy.to_string_lossy());
		let opts = SqliteConnectOptions::from_str(&url).map_err(|e| e.to_string())?;
		let pool = SqlitePool::connect_with(opts).await.map_err(|e| e.to_string())?;
		let row: Result<(String,), _> =
			sqlx::query_as("SELECT business_name FROM company_settings WHERE id = 1")
				.fetch_one(&pool)
				.await;
		pool.close().await;
		row.map(|r| r.0).unwrap_or_else(|_| "My Business".to_string())
	};

	let slug = slugify(&business_name);
	let new_db_path = businesses_dir(app)?.join(format!("{slug}.db"));
	std::fs::rename(&legacy, &new_db_path).map_err(|e| format!("move legacy db: {e}"))?;

	// Walk the obvious image extensions for the legacy `app_data/logo.*`.
	let mut logo_file: Option<String> = None;
	for ext in &["png", "jpg", "jpeg", "webp", "svg"] {
		let src = app_data.join(format!("logo.{ext}"));
		if !src.exists() {
			continue;
		}
		let dst_name = format!("{slug}.{ext}");
		let dst = logos_dir(app)?.join(&dst_name);
		std::fs::rename(&src, &dst).map_err(|e| format!("move logo: {e}"))?;

		// company_settings.logo_path stores an absolute path — update it.
		let url = format!("sqlite:{}", new_db_path.to_string_lossy());
		let opts = SqliteConnectOptions::from_str(&url).map_err(|e| e.to_string())?;
		let pool = SqlitePool::connect_with(opts).await.map_err(|e| e.to_string())?;
		sqlx::query("UPDATE company_settings SET logo_path = ? WHERE id = 1")
			.bind(dst.to_string_lossy().to_string())
			.execute(&pool)
			.await
			.map_err(|e| format!("update logo_path: {e}"))?;
		pool.close().await;
		logo_file = Some(dst_name);
		break;
	}

	let tenant = Tenant { id: slug.clone(), name: business_name, logo_file };
	let reg = TenantRegistry { active_tenant_id: Some(slug), tenants: vec![tenant] };
	write_registry(app, &reg)?;
	Ok(())
}

// ---------- Tauri commands --------------------------------------------------

#[tauri::command]
pub async fn list_tenants(app: AppHandle) -> Result<TenantRegistry, String> {
	migrate_legacy_db(&app).await?;
	let mut reg = read_registry(&app)?;
	// Self-heal a stale active_tenant_id (e.g. registry hand-edited).
	if let Some(active) = reg.active_tenant_id.clone() {
		if !reg.tenants.iter().any(|t| t.id == active) {
			reg.active_tenant_id = None;
			write_registry(&app, &reg)?;
		}
	}
	Ok(reg)
}

#[tauri::command]
pub async fn create_tenant(app: AppHandle, name: String) -> Result<Tenant, String> {
	let trimmed = name.trim();
	if trimmed.is_empty() {
		return Err("Business name is required".into());
	}
	let mut reg = read_registry(&app)?;
	let id = unique_slug(&slugify(trimmed), &reg.tenants);
	let db_path = tenant_db_path(&app, &id)?;

	run_migrations(&db_path).await?;

	// Seed the new DB with the business name (replaces the default "Sakoram").
	{
		let url = format!("sqlite:{}", db_path.to_string_lossy());
		let opts = SqliteConnectOptions::from_str(&url).map_err(|e| e.to_string())?;
		let pool = SqlitePool::connect_with(opts).await.map_err(|e| e.to_string())?;
		sqlx::query("UPDATE company_settings SET business_name = ? WHERE id = 1")
			.bind(trimmed)
			.execute(&pool)
			.await
			.map_err(|e| format!("seed business_name: {e}"))?;
		pool.close().await;
	}

	let tenant = Tenant { id: id.clone(), name: trimmed.to_string(), logo_file: None };
	reg.tenants.push(tenant.clone());
	if reg.active_tenant_id.is_none() {
		reg.active_tenant_id = Some(id);
	}
	write_registry(&app, &reg)?;
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
	write_registry(&app, &reg)?;

	// Keep the DB's business_name in sync so PDFs/header reflect the rename.
	let path = tenant_db_path(&app, &id)?;
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

#[tauri::command]
pub async fn delete_tenant(app: AppHandle, id: String) -> Result<(), String> {
	let mut reg = read_registry(&app)?;
	if reg.active_tenant_id.as_deref() == Some(&id) {
		return Err("Cannot delete the active business — switch to another first.".into());
	}
	let pos = reg.tenants.iter().position(|t| t.id == id).ok_or("Tenant not found")?;
	let tenant = reg.tenants.remove(pos);
	write_registry(&app, &reg)?;

	let _ = std::fs::remove_file(tenant_db_path(&app, &tenant.id)?);
	if let Some(logo) = &tenant.logo_file {
		let _ = std::fs::remove_file(logos_dir(&app)?.join(logo));
	}
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

/// Idempotently ensures the tenant's DB exists and is migrated, then
/// returns the sqlite URL JS should pass to `Database.load()`.
#[tauri::command]
pub async fn ensure_tenant_db(app: AppHandle, id: String) -> Result<String, String> {
	let reg = read_registry(&app)?;
	if !reg.tenants.iter().any(|t| t.id == id) {
		return Err("Tenant not found".into());
	}
	let path = tenant_db_path(&app, &id)?;
	run_migrations(&path).await?;
	// Plugin-sql resolves `sqlite:foo.db` relative to app_data_dir, so a
	// relative path is what we want.
	Ok(format!("sqlite:businesses/{id}.db"))
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
	Ok(tenant.logo_file.as_ref().map(|f| {
		logos_dir(&app)
			.map(|d| d.join(f).to_string_lossy().to_string())
			.unwrap_or_default()
	}))
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

pub async fn create_tenant_internal(app: &AppHandle, name: &str) -> Result<Tenant, String> {
	let trimmed = name.trim();
	if trimmed.is_empty() {
		return Err("Business name is required".into());
	}
	let mut reg = read_registry(app)?;
	let id = unique_slug(&slugify(trimmed), &reg.tenants);
	let db_path = tenant_db_path(app, &id)?;
	run_migrations(&db_path).await?;

	{
		let url = format!("sqlite:{}", db_path.to_string_lossy());
		let opts = SqliteConnectOptions::from_str(&url).map_err(|e| e.to_string())?;
		let pool = SqlitePool::connect_with(opts).await.map_err(|e| e.to_string())?;
		sqlx::query("UPDATE company_settings SET business_name = ? WHERE id = 1")
			.bind(trimmed)
			.execute(&pool)
			.await
			.map_err(|e| format!("seed business_name: {e}"))?;
		pool.close().await;
	}

	let tenant = Tenant { id: id.clone(), name: trimmed.to_string(), logo_file: None };
	reg.tenants.push(tenant.clone());
	if reg.active_tenant_id.is_none() {
		reg.active_tenant_id = Some(id);
	}
	write_registry(app, &reg)?;
	Ok(tenant)
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
