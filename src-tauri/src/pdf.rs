// PDF generation via the embedded `typst` CLI sidecar.
//
// Client-facing documents (quotes / invoices / bills) render through one of
// several selectable layouts (doc-classic / doc-modern / …), each importing the
// shared `common.typ`; the JSON drives labels + which template. Vouchers,
// payslips, reports, and statements have their own single templates.
//
// The frontend hands us:
//   - `data`: a JSON object with everything the template needs
//   - `output_path`: where to write the final PDF
//
// We:
//   1. Stage a per-render working dir under app local data
//   2. Write the chosen template + `data.json` into it
//   3. Copy the logo (if referenced) so Typst can resolve it from --root
//   4. Invoke `typst compile --root <work_dir> ...`
//   5. Return Ok or the typst stderr on failure
//
// Templates are embedded at compile time (`include_str!`) so the binary
// is self-contained.

use std::path::{Path, PathBuf};
use qpdf::{EncryptionParams, EncryptionParamsR6, PrintPermission, QPdf};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

// Client-facing document Layouts. `common.typ` holds the shared rendering
// (items table, party/meta blocks, etc.); each `doc-*.typ` owns its layout and
// `#import "common.typ"`. `render_pdf` writes common.typ as an extra file.
const COMMON_TEMPLATE: &str = include_str!("../templates/common.typ");
const DOC_CLASSIC: &str = include_str!("../templates/doc-classic.typ");
const DOC_MODERN: &str = include_str!("../templates/doc-modern.typ");
const DOC_MINIMAL: &str = include_str!("../templates/doc-minimal.typ");
const DOC_COMPACT: &str = include_str!("../templates/doc-compact.typ");
const VOUCHER_TEMPLATE: &str = include_str!("../templates/voucher.typ");
const PAYSLIP_TEMPLATE: &str = include_str!("../templates/payslip.typ");
const REPORT_TEMPLATE: &str = include_str!("../templates/report.typ");
const STATEMENT_TEMPLATE: &str = include_str!("../templates/statement.typ");
const LETTER_TEMPLATE: &str = include_str!("../templates/letter.typ");

#[derive(Debug, thiserror::Error)]
pub enum PdfError {
	#[error("io: {0}")]
	Io(#[from] std::io::Error),
	#[error("json: {0}")]
	Json(#[from] serde_json::Error),
	#[error("tauri: {0}")]
	Tauri(String),
	#[error("typst: {0}")]
	Typst(String),
	#[error("encrypt: {0}")]
	Encrypt(String),
}

impl serde::Serialize for PdfError {
	fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
		s.serialize_str(&self.to_string())
	}
}

impl From<tauri::Error> for PdfError {
	fn from(e: tauri::Error) -> Self { PdfError::Tauri(e.to_string()) }
}

impl From<tauri_plugin_shell::Error> for PdfError {
	fn from(e: tauri_plugin_shell::Error) -> Self { PdfError::Tauri(e.to_string()) }
}

/// Stage the working dir, write template + data + (optional) logo, then run
/// the typst sidecar to produce the PDF at `output_path`.
///
/// `template_name` is the on-disk filename written into the work dir (e.g.
/// "document.typ"). It must end in `.typ` to satisfy the shell capability
/// validator on the sidecar invocation.
/// Encrypt `path` in place with an owner password (AES-256, R6).
///
/// The user password is left empty, so the PDF still opens with no prompt;
/// only the owner-restricted operations are gated. We block editing,
/// content extraction, page assembly, annotation, and form filling — but
/// keep full-resolution printing allowed and accessibility (screen reader)
/// extraction permitted. The intent is tamper-resistance on issued
/// invoices / bills, not secrecy.
///
/// `QPdf::read(path)` keeps the input file handle open for lazy object
/// access, so writing the encrypted result back to the same path fails on
/// Windows with os error 5 (ACCESS_DENIED). We read the rendered PDF fully
/// into memory first — that closes the file handle immediately — then let
/// qpdf write the encrypted copy straight back over `path`.
fn encrypt_pdf(path: &Path, owner_password: &str) -> Result<(), PdfError> {
	let bytes = std::fs::read(path)?;
	let pdf = QPdf::read_from_memory(&bytes).map_err(|e| PdfError::Encrypt(e.to_string()))?;

	let mut writer = pdf.writer();
	writer.encryption_params(EncryptionParams::R6(EncryptionParamsR6 {
		user_password: String::new(),
		owner_password: owner_password.to_string(),
		allow_accessibility: true,
		allow_extract: false,
		allow_assemble: false,
		allow_annotate_and_form: false,
		allow_form_filling: false,
		allow_modify_other: false,
		allow_print: PrintPermission::Full,
		encrypt_metadata: true,
	}));
	writer.write(path).map_err(|e| PdfError::Encrypt(e.to_string()))?;
	Ok(())
}

async fn render_pdf(
	app: &AppHandle,
	template_name: &str,
	template_src: &str,
	data: Value,
	output_path: PathBuf,
	protect_password: Option<String>,
	// Additional files written into the work dir before compiling — e.g. a
	// shared `common.typ` the chosen template imports. Empty for templates
	// that need no companions (voucher / payslip / report / statement).
	extra_files: &[(&str, &str)],
) -> Result<(), PdfError> {
	// 1. Working directory under app local data.
	let work_dir = app
		.path()
		.app_local_data_dir()?
		.join("pdf-work");
	let business_folder = crate::tenants::active_folder(app).ok().flatten();
	let template_path = stage_render(&work_dir, business_folder.as_deref(), template_name, template_src, data, extra_files)?;

	// 5. Invoke the typst sidecar.
	let (work_dir_str, fonts_dir_str) = (path_str(&work_dir)?, fonts_dir(app)?);
	let (template_str, output_str) = (path_str(&template_path)?, path_str(&output_path)?);
	run_typst(app, &[
		"compile",
		"--root",
		&work_dir_str,
		"--font-path",
		&fonts_dir_str,
		&template_str,
		&output_str,
	])
	.await?;

	// 6. Optional owner-password encryption. A blank/whitespace password
	//    is treated as "no protection" — the JS side only sends one when
	//    the document type's toggle is on and a password is configured.
	if let Some(pw) = protect_password {
		if !pw.trim().is_empty() {
			encrypt_pdf(&output_path, &pw)?;
		}
	}

	Ok(())
}

/// A path as the UTF-8 string the Typst CLI is handed.
fn path_str(p: &Path) -> Result<String, PdfError> {
	p.to_str().map(str::to_string).ok_or_else(|| PdfError::Typst("non-UTF-8 path in app data dir".into()))
}

/// The bundled fonts dir. In dev this is src-tauri/fonts; in production it
/// lands inside the .app/.exe resource dir. Either way Typst gets it via
/// --font-path, so the bundled faces render regardless of what's installed.
fn fonts_dir(app: &AppHandle) -> Result<String, PdfError> {
	path_str(&app.path().resource_dir()?.join("fonts"))
}

/// Stage one render in `work_dir`: the logo, the page design's images from
/// `business_folder`, `data.json`, any companion files (common.typ) and the
/// template itself. Returns the template's path. Shared by every PDF render
/// and the Settings page's live page preview, so both see the same inputs.
pub(crate) fn stage_render(
	work_dir: &Path,
	business_folder: Option<&Path>,
	template_name: &str,
	template_src: &str,
	mut data: Value,
	extra_files: &[(&str, &str)],
) -> Result<PathBuf, PdfError> {
	debug_assert!(template_name.ends_with(".typ"));
	std::fs::create_dir_all(work_dir)?;

	// 2. Copy the logo (if any) into the work dir so we can reference it
	//    by a path relative to --root. The frontend sends the absolute
	//    path in `logo_path`; we replace it with `logo.<ext>` in the JSON
	//    handed to the template.
	let logo_in_data = data
		.get("logo_path")
		.and_then(|v| v.as_str())
		.map(|s| s.to_string());
	if let Some(src) = logo_in_data {
		if !src.is_empty() && std::path::Path::new(&src).exists() {
			let ext = std::path::Path::new(&src)
				.extension()
				.and_then(|e| e.to_str())
				.unwrap_or("png")
				.to_string();
			let target_name = format!("logo.{ext}");
			std::fs::copy(&src, work_dir.join(&target_name))?;
			if let Some(obj) = data.as_object_mut() {
				obj.insert("logo_file".into(), Value::String(target_name));
			}
		} else if let Some(obj) = data.as_object_mut() {
			obj.insert("logo_file".into(), Value::Null);
		}
	} else if let Some(obj) = data.as_object_mut() {
		obj.insert("logo_file".into(), Value::Null);
	}

	// 2b. The page design's images, from the OPEN business's folder (after the
	//     logo: the company-logo item reuses logo_file). The DB stores only
	//     each image's format, never a path, so a moved folder needs no rewrite.
	stage_page_items(&mut data, business_folder, work_dir)?;

	// 3. Write data.json
	std::fs::write(work_dir.join("data.json"), serde_json::to_vec_pretty(&data)?)?;

	// 4. Write any companion files (e.g. common.typ) the template imports,
	//    then the template itself (overwrite each render so edits pick up).
	for (name, src) in extra_files {
		std::fs::write(work_dir.join(name), src)?;
	}
	let template_path = work_dir.join(template_name);
	std::fs::write(&template_path, template_src)?;
	Ok(template_path)
}

/// Stage the page design's images for Typst. Each image item in
/// `page.items` (app/lib/page-settings.ts) arrives as
/// `{ type: "image", src: "item", id, ext, … }` — the file is
/// `<business folder>/stationery/item-<id>.<ext>` — or `src: "company_logo"`,
/// which reuses the already-staged `logo_file`. A staged image gains `file`
/// (what common.typ's design-items reads). An image that can't be staged — no
/// business folder, an id or extension that isn't safe in a file name, a
/// missing file, no company logo, an unknown `src` — is REMOVED, so the page
/// renders without it rather than failing. Other items pass through untouched.
/// scripts/verify-pdf-render.ts mirrors this — keep the two in step.
pub(crate) fn stage_page_items(data: &mut Value, business_folder: Option<&Path>, work_dir: &Path) -> std::io::Result<()> {
	let logo_file = data.get("logo_file").and_then(|v| v.as_str()).map(str::to_string);
	let Some(Value::Array(items)) = data.pointer_mut("/page/items") else { return Ok(()) };
	let mut kept = Vec::with_capacity(items.len());
	for mut item in std::mem::take(items) {
		if item.get("type").and_then(|v| v.as_str()) != Some("image") {
			kept.push(item);
			continue;
		}
		let file = match item.get("src").and_then(|v| v.as_str()) {
			Some("company_logo") => logo_file.clone(),
			Some("item") => {
				let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
				let ext = item.get("ext").and_then(|v| v.as_str()).unwrap_or("");
				stage_item_file(id, ext, business_folder, work_dir)?
			}
			_ => None,
		};
		if let (Some(name), Some(obj)) = (file, item.as_object_mut()) {
			obj.insert("file".into(), Value::String(name));
			kept.push(item);
		}
	}
	*items = kept;
	Ok(())
}

/// Copy `<business folder>/stationery/item-<id>.<ext>` into the work dir under
/// the same name and return it — or None when there is no business folder, the
/// id or extension isn't safe in a file name, or the file is missing.
fn stage_item_file(id: &str, ext: &str, business_folder: Option<&Path>, work_dir: &Path) -> std::io::Result<Option<String>> {
	if !crate::tenants::is_item_id(id) || !crate::tenants::is_plain_ext(ext) {
		return Ok(None);
	}
	let name = format!("item-{id}.{ext}");
	let Some(src) = business_folder
		.map(|f| f.join(crate::tenants::STATIONERY_DIR).join(&name))
		.filter(|p| p.is_file())
	else {
		return Ok(None);
	};
	std::fs::copy(&src, work_dir.join(&name))?;
	Ok(Some(name))
}

/// Run the bundled Typst sidecar with `args`. On failure, surface only the
/// real error lines to the user (Typst writes warnings and errors to stderr);
/// the full stderr / stdout still go to the dev terminal for debugging. The
/// one spawn path for every render — PDFs and the PDF-background preview.
async fn run_typst(app: &AppHandle, args: &[&str]) -> Result<(), PdfError> {
	let output = app
		.shell()
		.sidecar("typst")?
		.args(args)
		.output()
		.await
		.map_err(|e| PdfError::Typst(format!("spawn failed: {e}")))?;
	if output.status.success() {
		return Ok(());
	}
	let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
	let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
	eprintln!("typst stderr:\n{stderr}");
	if !stdout.trim().is_empty() {
		eprintln!("typst stdout:\n{stdout}");
	}
	let user_message = extract_typst_errors(&stderr)
		.or_else(|| {
			let trimmed = stderr.trim();
			if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
		})
		.unwrap_or_else(|| stdout.trim().to_string());
	Err(PdfError::Typst(user_message))
}

/// Pull just the `error:` lines (and any wrapped continuation lines) out of
/// typst's stderr. Warnings start with `warning:` and we skip them. If we
/// can't find any explicit error markers we return None so the caller can
/// fall back to the full stderr.
fn extract_typst_errors(stderr: &str) -> Option<String> {
	let mut out = Vec::<String>::new();
	let mut capturing = false;
	for line in stderr.lines() {
		let trimmed = line.trim_start();
		if trimmed.starts_with("error:") {
			capturing = true;
			out.push(trimmed.to_string());
		} else if trimmed.starts_with("warning:") || trimmed.starts_with("note:") {
			capturing = false;
		} else if capturing && !trimmed.is_empty() {
			out.push(trimmed.to_string());
		} else if trimmed.is_empty() {
			capturing = false;
		}
	}
	if out.is_empty() {
		None
	} else {
		Some(out.join("\n"))
	}
}

// All three "transactional document" commands share document.typ — the JSON
// is what tells the template whether it's rendering a quote, invoice, or
// bill (party labels, secondary date label, paid/balance rows, etc.).

// Map the payload's `layout` key to the on-disk filename + embedded source.
// Unknown / missing keys (including the retired `letterhead`, migration 0055)
// fall back to Classic. New Layouts add an arm here AND to PDF_LAYOUTS in
// app/lib/pdf-layouts.ts — pdf-layouts.test.ts fails if the two disagree.
fn layout_template(key: Option<&str>) -> (&'static str, &'static str) {
	match key {
		Some("modern") => ("doc-modern.typ", DOC_MODERN),
		Some("minimal") => ("doc-minimal.typ", DOC_MINIMAL),
		Some("compact") => ("doc-compact.typ", DOC_COMPACT),
		_ => ("doc-classic.typ", DOC_CLASSIC),
	}
}

#[tauri::command]
pub async fn export_quote_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	let (name, src) = layout_template(data.get("layout").and_then(|v| v.as_str()));
	render_pdf(&app, name, src, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
}

#[tauri::command]
pub async fn export_invoice_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	let (name, src) = layout_template(data.get("layout").and_then(|v| v.as_str()));
	render_pdf(&app, name, src, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
}

#[tauri::command]
pub async fn export_bill_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	let (name, src) = layout_template(data.get("layout").and_then(|v| v.as_str()));
	render_pdf(&app, name, src, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
}

#[tauri::command]
pub async fn export_payslip_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	render_pdf(&app, "payslip.typ", PAYSLIP_TEMPLATE, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
}

#[tauri::command]
pub async fn export_voucher_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	render_pdf(&app, "voucher.typ", VOUCHER_TEMPLATE, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
}

// Reports (P&L, VAT, future Tier 1 reports) all render through one
// generic template — the JSON drives title, period, summary tiles,
// breakdown rows, and detail tables. Adding a new report = a new
// JS payload builder; no Rust change needed.
#[tauri::command]
pub async fn export_report_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	render_pdf(&app, "report.typ", REPORT_TEMPLATE, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
}

// Customer statements — per-client snapshot of outstanding invoices.
// Generated ad-hoc; not stored, not numbered. Same render pipeline as
// reports, separate template because the shape (party-block hero +
// aging tiles + 7-column invoice table) doesn't reuse report.typ
// cleanly.
#[tauri::command]
pub async fn export_statement_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	render_pdf(&app, "statement.typ", STATEMENT_TEMPLATE, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
}

// Letters — free-form correspondence on the business letterhead. Standalone
// template; no companion files. Always unencrypted (no per-type protection).
#[tauri::command]
pub async fn export_letter_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	// letter.typ imports common.typ for the shared footer-content, so write it
	// alongside (same as the doc-* templates).
	render_pdf(&app, "letter.typ", LETTER_TEMPLATE, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
}

/// Copy a file from `src` to `dst`. Used by the PDF preview flow: we
/// render to a temp path, the user previews, then on "Save as…" we copy
/// the same bytes to the user-chosen destination instead of re-rendering.
#[tauri::command]
pub fn copy_file(src: String, dst: String) -> Result<(), String> {
	std::fs::copy(&src, &dst).map(|_| ()).map_err(|e| e.to_string())
}

/// Open a path with the OS-default handler (PDF viewer, image viewer, etc.).
///
/// We don't go through `tauri-plugin-shell::open` because its scope validator
/// is hard-wired to URL schemes (https/mailto/tel) and rejects raw file
/// paths even with an allow-list override. Spawning the platform-native
/// "open" command directly is both simpler and robust.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
	#[cfg(target_os = "windows")]
	{
		// `cmd /C start "" <path>` — the empty quoted title is required so
		// `start` doesn't treat a path with spaces as the window title.
		std::process::Command::new("cmd")
			.args(["/C", "start", "", path.as_str()])
			.spawn()
			.map_err(|e| e.to_string())?;
	}
	#[cfg(target_os = "macos")]
	{
		std::process::Command::new("open")
			.arg(&path)
			.spawn()
			.map_err(|e| e.to_string())?;
	}
	#[cfg(all(unix, not(target_os = "macos")))]
	{
		std::process::Command::new("xdg-open")
			.arg(&path)
			.spawn()
			.map_err(|e| e.to_string())?;
	}
	Ok(())
}

/// The Typst file that draws a PDF background's first page as an image, on a
/// page exactly its size (written by `stage_artwork_preview`).
const ARTWORK_PREVIEW_TYP: &str = "artwork-preview.typ";
const ARTWORK_PREVIEW_SRC: &str = "#set page(width: auto, height: auto, margin: 0pt)\n#image(\"artwork.pdf\")\n";

/// Stage the OPEN business's PDF artwork (`stationery/<stem>.pdf`) for a PNG
/// preview: copy it into `work_dir` as `artwork.pdf` beside a template that
/// draws its first page at its own size. Returns the template's path, or None
/// when there is no business, no such PDF, or `stem` isn't a design image.
pub(crate) fn stage_artwork_preview(business_folder: Option<&Path>, stem: &str, work_dir: &Path) -> std::io::Result<Option<PathBuf>> {
	// Only a page-design image (`item-<id>`) — the stem names a file.
	if !stem.strip_prefix("item-").is_some_and(crate::tenants::is_item_id) {
		return Ok(None);
	}
	let Some(src) = business_folder
		.map(|f| f.join(crate::tenants::STATIONERY_DIR).join(format!("{stem}.pdf")))
		.filter(|p| p.is_file())
	else {
		return Ok(None);
	};
	std::fs::create_dir_all(work_dir)?;
	std::fs::copy(&src, work_dir.join("artwork.pdf"))?;
	let template = work_dir.join(ARTWORK_PREVIEW_TYP);
	std::fs::write(&template, ARTWORK_PREVIEW_SRC)?;
	Ok(Some(template))
}

/// PNG bytes of the open business's PDF artwork (its first page) — the
/// webview can't draw a PDF in an <img>, so the Stationery thumbnail and
/// editor show this instead. `artwork` is the image's file stem,
/// "item-<id>". Rendered by the bundled Typst at `ppi` (clamped to
/// 20–150, plenty for a screen preview).
#[tauri::command]
pub async fn render_stationery_artwork_png(app: AppHandle, ppi: u32, artwork: Option<String>) -> Result<Vec<u8>, PdfError> {
	let stem = artwork.as_deref().unwrap_or("");
	let work_dir = app.path().app_local_data_dir()?.join("pdf-work").join("artwork-preview");
	let folder = crate::tenants::active_folder(&app).ok().flatten();
	let template = stage_artwork_preview(folder.as_deref(), stem, &work_dir)?
		.ok_or_else(|| PdfError::Typst(format!("This business has no PDF image {stem}.")))?;
	let output = work_dir.join("artwork.png");
	let path_str = |p: &Path| p.to_str().map(str::to_string).ok_or_else(|| PdfError::Typst("non-UTF-8 path in app data dir".into()));
	let (root, template, out) = (path_str(&work_dir)?, path_str(&template)?, path_str(&output)?);
	let ppi = ppi.clamp(20, 150).to_string();
	run_typst(&app, &["compile", "--root", &root, "--format", "png", "--ppi", &ppi, &template, &out]).await?;
	Ok(std::fs::read(&output)?)
}

/// A fresh work dir for one page-preview render, so overlapping renders (the
/// Settings page re-renders as the user edits) never share files.
fn page_preview_dir(base: &Path) -> PathBuf {
	base.join("pdf-work").join("page-preview").join(uuid::Uuid::new_v4().to_string())
}

/// PNG bytes of page 1 of a quote / invoice / bill payload, rendered exactly
/// as its PDF would be (same Layout template, staging and Stationery artwork
/// from the open business's folder) — the live preview on /settings/pdf,
/// built from the unsaved form. `ppi` is clamped to 20–150.
#[tauri::command]
pub async fn render_document_page_png(app: AppHandle, data: Value, ppi: u32) -> Result<Vec<u8>, PdfError> {
	let (name, src) = layout_template(data.get("layout").and_then(|v| v.as_str()));
	let work_dir = page_preview_dir(&app.path().app_local_data_dir()?);
	let folder = crate::tenants::active_folder(&app).ok().flatten();
	let result = async {
		let template = stage_render(&work_dir, folder.as_deref(), name, src, data, &[("common.typ", COMMON_TEMPLATE)])?;
		let output = work_dir.join("page.png");
		let (root, fonts, template, out) = (path_str(&work_dir)?, fonts_dir(&app)?, path_str(&template)?, path_str(&output)?);
		let ppi = ppi.clamp(20, 150).to_string();
		run_typst(&app, &["compile", "--root", &root, "--font-path", &fonts, "--format", "png", "--pages", "1", "--ppi", &ppi, &template, &out]).await?;
		Ok(std::fs::read(&output)?)
	}
	.await;
	let _ = std::fs::remove_dir_all(&work_dir);
	result
}

#[cfg(test)]
mod tests {
	use super::{layout_template, page_preview_dir, stage_artwork_preview, stage_page_items, stage_render};
	use serde_json::json;
	use std::path::PathBuf;

	fn temp_dir(tag: &str) -> PathBuf {
		let d = std::env::temp_dir().join(format!("sakoram-pdf-{tag}-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&d).unwrap();
		d
	}

	/// A business folder holding `stationery/<name>` for each (name, bytes).
	fn folder_with_files(tag: &str, files: &[(&str, &[u8])]) -> PathBuf {
		let folder = temp_dir(tag);
		std::fs::create_dir_all(folder.join("stationery")).unwrap();
		for (name, bytes) in files {
			std::fs::write(folder.join("stationery").join(name), bytes).unwrap();
		}
		folder
	}

	fn image(id: &str, src: &str, ext: Option<&str>) -> serde_json::Value {
		json!({ "type": "image", "id": id, "src": src, "ext": ext, "x": 0, "y": 0, "w": 10, "h": 10, "pages": "every" })
	}

	#[test]
	fn design_images_are_copied_beside_the_template_and_missing_or_unsafe_ones_dropped() {
		let folder = folder_with_files("items", &[("item-abc123def456.png", b"PNG")]);
		let work = temp_dir("items-work");
		let text = json!({ "type": "text", "id": "text00000001", "lines": ["Hi"] });
		let line = json!({ "type": "line", "id": "line00000001", "length": 10 });
		let mut data = json!({
			"logo_file": "logo.png",
			"page": { "items": [
				image("abc123def456", "item", Some("png")),
				image("missing00001", "item", Some("png")),
				image("../x", "item", Some("png")),
				image("abc123def456", "item", Some("p/ng")),
				image("logo00000001", "company_logo", None),
				image("weird0000001", "elsewhere", Some("png")),
				text.clone(),
				line.clone()
			] }
		});
		stage_page_items(&mut data, Some(&folder), &work).unwrap();
		let items = data["page"]["items"].as_array().unwrap();
		assert_eq!(items.len(), 4);
		assert_eq!(items[0]["file"], "item-abc123def456.png");
		assert_eq!(std::fs::read(work.join("item-abc123def456.png")).unwrap(), b"PNG");
		assert_eq!(items[1]["id"], "logo00000001");
		assert_eq!(items[1]["file"], "logo.png");
		assert_eq!(items[2], text);
		assert_eq!(items[3], line);
	}

	#[test]
	fn the_company_logo_item_is_dropped_when_there_is_no_logo() {
		let mut data = json!({ "logo_file": null, "page": { "items": [image("logo00000001", "company_logo", None)] } });
		stage_page_items(&mut data, None, &temp_dir("items-nologo")).unwrap();
		assert_eq!(data["page"]["items"], json!([]));
	}

	#[test]
	fn no_open_business_drops_file_images_only() {
		let line = json!({ "type": "line", "id": "line00000001" });
		let mut data = json!({ "page": { "items": [image("abc123def456", "item", Some("png")), line.clone()] } });
		stage_page_items(&mut data, None, &temp_dir("items-nofolder")).unwrap();
		assert_eq!(data["page"]["items"], json!([line]));
	}

	#[test]
	fn pages_without_items_are_left_alone() {
		let mut data = json!({ "page": { "paper": "a4" } });
		stage_page_items(&mut data, None, &temp_dir("items-none")).unwrap();
		assert_eq!(data, json!({ "page": { "paper": "a4" } }));
	}

	#[test]
	fn each_layout_renders_its_own_template() {
		for key in ["modern", "minimal", "compact"] {
			assert_eq!(layout_template(Some(key)).0, format!("doc-{key}.typ"));
		}
		assert_eq!(layout_template(Some("classic")).0, "doc-classic.typ");
	}

	#[test]
	fn retired_letterhead_and_unknown_keys_render_classic() {
		for key in [Some("letterhead"), Some("bogus"), None] {
			assert_eq!(layout_template(key).0, "doc-classic.typ");
		}
	}

	#[test]
	fn a_pdf_design_image_is_staged_beside_a_template_that_draws_it() {
		let folder = folder_with_files("artwork-preview", &[("item-abc123def456.pdf", b"%PDF-1.7 fake")]);
		let work = temp_dir("artwork-preview-work").join("nested");
		let template = stage_artwork_preview(Some(&folder), "item-abc123def456", &work).unwrap().expect("staged");
		assert_eq!(std::fs::read(work.join("artwork.pdf")).unwrap(), b"%PDF-1.7 fake");
		assert!(template.starts_with(&work));
		assert!(std::fs::read_to_string(&template).unwrap().contains("image(\"artwork.pdf\")"));
	}

	#[test]
	fn only_design_image_stems_can_be_previewed() {
		let folder = folder_with_files("artwork-preview-bad", &[("item-abc123def456.svg", b"<svg/>"), ("background.pdf", b"%PDF")]);
		let work = temp_dir("artwork-preview-none");
		assert!(stage_artwork_preview(Some(&folder), "item-abc123def456", &work).unwrap().is_none());
		assert!(stage_artwork_preview(Some(&folder), "background", &work).unwrap().is_none());
		assert!(stage_artwork_preview(Some(&folder), "item-../business", &work).unwrap().is_none());
		assert!(stage_artwork_preview(None, "item-abc123def456", &work).unwrap().is_none());
		assert!(!work.join("artwork.pdf").exists());
	}

	#[test]
	fn a_render_is_staged_with_its_logo_design_images_data_and_companions() {
		let folder = folder_with_files("render", &[("item-abc123def456.svg", b"<svg/>")]);
		let logo = folder.join("logo.png");
		std::fs::write(&logo, b"PNG").unwrap();
		let work = temp_dir("render-work").join("nested");
		let data = json!({
			"layout": "classic",
			"logo_path": logo.to_str().unwrap(),
			"page": { "items": [image("abc123def456", "item", Some("svg")), image("logo00000001", "company_logo", None)] }
		});
		let template = stage_render(&work, Some(&folder), "doc-classic.typ", "// doc", data, &[("common.typ", "// common")]).unwrap();
		assert_eq!(template, work.join("doc-classic.typ"));
		assert_eq!(std::fs::read_to_string(&template).unwrap(), "// doc");
		assert_eq!(std::fs::read_to_string(work.join("common.typ")).unwrap(), "// common");
		assert_eq!(std::fs::read(work.join("logo.png")).unwrap(), b"PNG");
		assert_eq!(std::fs::read(work.join("item-abc123def456.svg")).unwrap(), b"<svg/>");
		let staged: serde_json::Value = serde_json::from_slice(&std::fs::read(work.join("data.json")).unwrap()).unwrap();
		assert_eq!(staged["logo_file"], "logo.png");
		assert_eq!(staged["page"]["items"][0]["file"], "item-abc123def456.svg");
		assert_eq!(staged["page"]["items"][1]["file"], "logo.png");
	}

	#[test]
	fn a_render_without_a_logo_tells_typst_so() {
		let work = temp_dir("render-nologo");
		stage_render(&work, None, "doc-classic.typ", "", json!({ "logo_path": "Z:/no/such/logo.png" }), &[]).unwrap();
		let staged: serde_json::Value = serde_json::from_slice(&std::fs::read(work.join("data.json")).unwrap()).unwrap();
		assert!(staged["logo_file"].is_null());
	}

	#[test]
	fn every_page_preview_gets_its_own_work_dir() {
		let base = temp_dir("page-preview");
		let (a, b) = (page_preview_dir(&base), page_preview_dir(&base));
		assert_ne!(a, b);
		assert!(a.starts_with(base.join("pdf-work").join("page-preview")));
	}
}
