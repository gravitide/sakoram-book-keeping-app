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
	mut data: Value,
	output_path: PathBuf,
	protect_password: Option<String>,
	// Additional files written into the work dir before compiling — e.g. a
	// shared `common.typ` the chosen template imports. Empty for templates
	// that need no companions (voucher / payslip / report / statement).
	extra_files: &[(&str, &str)],
) -> Result<(), PdfError> {
	debug_assert!(template_name.ends_with(".typ"));

	// 1. Working directory under app local data.
	let work_dir = app
		.path()
		.app_local_data_dir()?
		.join("pdf-work");
	std::fs::create_dir_all(&work_dir)?;

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

	// 2b. Full-page background artwork (if the page block asks for one) from
	//     the OPEN business's folder. The DB stores only its format, never a
	//     path, so a moved folder needs no rewrite.
	let business_folder = crate::tenants::active_folder(app).ok().flatten();
	stage_background(&mut data, business_folder.as_deref(), &work_dir)?;

	// 3. Write data.json
	let data_path = work_dir.join("data.json");
	std::fs::write(&data_path, serde_json::to_vec_pretty(&data)?)?;

	// 4. Write any companion files (e.g. common.typ) the template imports,
	//    then the template itself (overwrite each render so edits pick up).
	for (name, src) in extra_files {
		std::fs::write(work_dir.join(name), src)?;
	}
	let template_path = work_dir.join(template_name);
	std::fs::write(&template_path, template_src)?;

	// 5. Resolve the bundled fonts dir. In dev this is src-tauri/fonts; in
	//    production it lands inside the .app/.exe resource dir. Either way
	//    we hand the absolute path to typst via --font-path so it can
	//    discover Miriam Libre regardless of what's on the user's system.
	let fonts_dir = app.path().resource_dir()?.join("fonts");
	let fonts_dir_str = fonts_dir
		.to_str()
		.ok_or_else(|| PdfError::Typst("non-UTF-8 fonts path".into()))?
		.to_string();

	// 6. Invoke the typst sidecar.
	let work_dir_str = work_dir
		.to_str()
		.ok_or_else(|| PdfError::Typst("non-UTF-8 path in app data dir".into()))?
		.to_string();
	let template_str = template_path
		.to_str()
		.ok_or_else(|| PdfError::Typst("non-UTF-8 template path".into()))?
		.to_string();
	let output_str = output_path
		.to_str()
		.ok_or_else(|| PdfError::Typst("non-UTF-8 output path".into()))?
		.to_string();

	let cmd = app.shell().sidecar("typst")?;
	let output = cmd
		.args([
			"compile",
			"--root",
			&work_dir_str,
			"--font-path",
			&fonts_dir_str,
			&template_str,
			&output_str,
		])
		.output()
		.await
		.map_err(|e| PdfError::Typst(format!("spawn failed: {e}")))?;

	if !output.status.success() {
		// Typst writes both warnings and errors to stderr; surface only the
		// real error lines to the user. The full stderr still goes to the
		// dev terminal (println below) for debugging.
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
		return Err(PdfError::Typst(user_message));
	}

	// 7. Optional owner-password encryption. A blank/whitespace password
	//    is treated as "no protection" — the JS side only sends one when
	//    the document type's toggle is on and a password is configured.
	if let Some(pw) = protect_password {
		if !pw.trim().is_empty() {
			encrypt_pdf(&output_path, &pw)?;
		}
	}

	Ok(())
}

/// Stage a Full-page background for Typst. The payload's `page.background` is
/// `{ ext }` (app/lib/page-settings.ts) — the artwork always lives at
/// `<business folder>/stationery/background.<ext>`. Copy it into the work dir
/// as `stationery-background.<ext>` and add `file` (what common.typ's
/// page-background reads). No business folder, an extension that isn't a
/// plain word, or a missing file all turn `background` into null: the page
/// renders without artwork rather than failing. Pages without a background
/// (every other Stationery mode) are left untouched.
/// scripts/verify-pdf-render.ts mirrors this — keep the two in step.
pub(crate) fn stage_background(data: &mut Value, business_folder: Option<&Path>, work_dir: &Path) -> std::io::Result<()> {
	let Some(bg) = data.pointer_mut("/page/background") else { return Ok(()) };
	if bg.is_null() {
		return Ok(());
	}
	let ext = bg.get("ext").and_then(|v| v.as_str()).unwrap_or("").to_string();
	let plain = !ext.is_empty() && ext.len() <= 5 && ext.chars().all(|c| c.is_ascii_alphanumeric());
	let src = business_folder
		.filter(|_| plain)
		.map(|f| f.join(crate::tenants::STATIONERY_DIR).join(format!("background.{ext}")))
		.filter(|p| p.is_file());
	match src {
		Some(src) => {
			let name = format!("stationery-background.{ext}");
			std::fs::copy(&src, work_dir.join(&name))?;
			if let Some(obj) = bg.as_object_mut() {
				obj.insert("file".into(), Value::String(name));
			}
		}
		None => *bg = Value::Null,
	}
	Ok(())
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

/// Stage the OPEN business's PDF background (`stationery/background.pdf`) for
/// a PNG preview: copy it into `work_dir` as `artwork.pdf` beside a template
/// that draws its first page at its own size. Returns the template's path, or
/// None when there is no business or no PDF background.
pub(crate) fn stage_artwork_preview(business_folder: Option<&Path>, work_dir: &Path) -> std::io::Result<Option<PathBuf>> {
	let Some(src) = business_folder
		.map(|f| f.join(crate::tenants::STATIONERY_DIR).join("background.pdf"))
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

/// PNG bytes of the open business's PDF background (its first page) — the
/// webview can't draw a PDF in an <img>, so the Stationery thumbnail and
/// editor show this instead. Rendered by the bundled Typst at `ppi`
/// (clamped to 20–150, plenty for a screen preview).
#[tauri::command]
pub async fn render_stationery_artwork_png(app: AppHandle, ppi: u32) -> Result<Vec<u8>, PdfError> {
	let work_dir = app.path().app_local_data_dir()?.join("pdf-work").join("artwork-preview");
	let folder = crate::tenants::active_folder(&app).ok().flatten();
	let template = stage_artwork_preview(folder.as_deref(), &work_dir)?
		.ok_or_else(|| PdfError::Typst("This business has no PDF background.".into()))?;
	let output = work_dir.join("artwork.png");
	let path_str = |p: &Path| p.to_str().map(str::to_string).ok_or_else(|| PdfError::Typst("non-UTF-8 path in app data dir".into()));
	let out = app
		.shell()
		.sidecar("typst")?
		.args([
			"compile".to_string(),
			"--root".to_string(),
			path_str(&work_dir)?,
			"--format".to_string(),
			"png".to_string(),
			"--ppi".to_string(),
			ppi.clamp(20, 150).to_string(),
			path_str(&template)?,
			path_str(&output)?,
		])
		.output()
		.await
		.map_err(|e| PdfError::Typst(format!("spawn failed: {e}")))?;
	if !out.status.success() {
		let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
		return Err(PdfError::Typst(extract_typst_errors(&stderr).unwrap_or(stderr)));
	}
	Ok(std::fs::read(&output)?)
}

#[cfg(test)]
mod tests {
	use super::{layout_template, stage_artwork_preview, stage_background};
	use serde_json::json;
	use std::path::PathBuf;

	fn temp_dir(tag: &str) -> PathBuf {
		let d = std::env::temp_dir().join(format!("sakoram-pdf-{tag}-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&d).unwrap();
		d
	}

	/// A business folder holding `stationery/background.<ext>`.
	fn folder_with_background(tag: &str, ext: &str, bytes: &[u8]) -> PathBuf {
		let folder = temp_dir(tag);
		std::fs::create_dir_all(folder.join("stationery")).unwrap();
		std::fs::write(folder.join("stationery").join(format!("background.{ext}")), bytes).unwrap();
		folder
	}

	#[test]
	fn background_artwork_is_copied_beside_the_template_and_named_for_typst() {
		let folder = folder_with_background("stage", "svg", b"<svg/>");
		let work = temp_dir("stage-work");
		let mut data = json!({ "page": { "stationery": "background", "background": { "ext": "svg" } } });
		stage_background(&mut data, Some(&folder), &work).unwrap();
		assert_eq!(data["page"]["background"], json!({ "ext": "svg", "file": "stationery-background.svg" }));
		assert_eq!(std::fs::read(work.join("stationery-background.svg")).unwrap(), b"<svg/>");
	}

	#[test]
	fn a_missing_artwork_file_renders_without_a_background() {
		let folder = temp_dir("stage-missing");
		let work = temp_dir("stage-missing-work");
		let mut data = json!({ "page": { "background": { "ext": "pdf" } } });
		stage_background(&mut data, Some(&folder), &work).unwrap();
		assert!(data["page"]["background"].is_null());
	}

	#[test]
	fn no_open_business_renders_without_a_background() {
		let work = temp_dir("stage-nofolder-work");
		let mut data = json!({ "page": { "background": { "ext": "png" } } });
		stage_background(&mut data, None, &work).unwrap();
		assert!(data["page"]["background"].is_null());
	}

	#[test]
	fn pages_without_a_background_are_left_alone() {
		let folder = folder_with_background("stage-none", "svg", b"<svg/>");
		let work = temp_dir("stage-none-work");
		for page in [json!({ "stationery": "builtin", "background": null }), json!({ "stationery": "builtin" })] {
			let mut data = json!({ "page": page.clone() });
			stage_background(&mut data, Some(&folder), &work).unwrap();
			assert_eq!(data["page"], page);
		}
		let mut no_page = json!({ "title": "x" });
		stage_background(&mut no_page, Some(&folder), &work).unwrap();
		assert_eq!(no_page, json!({ "title": "x" }));
	}

	#[test]
	fn an_extension_that_is_not_a_plain_word_is_refused() {
		let folder = folder_with_background("stage-ext", "svg", b"<svg/>");
		let work = temp_dir("stage-ext-work");
		let mut data = json!({ "page": { "background": { "ext": "svg/../../business.db" } } });
		stage_background(&mut data, Some(&folder), &work).unwrap();
		assert!(data["page"]["background"].is_null());
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
	fn a_pdf_background_is_staged_beside_a_template_that_draws_it() {
		let folder = folder_with_background("artwork-preview", "pdf", b"%PDF-1.7 fake");
		let work = temp_dir("artwork-preview-work").join("nested");
		let template = stage_artwork_preview(Some(&folder), &work).unwrap().expect("staged");
		assert_eq!(std::fs::read(work.join("artwork.pdf")).unwrap(), b"%PDF-1.7 fake");
		let src = std::fs::read_to_string(&template).unwrap();
		assert!(template.starts_with(&work));
		assert!(src.contains("image(\"artwork.pdf\")"));
	}

	#[test]
	fn no_pdf_background_means_nothing_to_preview() {
		let svg = folder_with_background("artwork-preview-svg", "svg", b"<svg/>");
		let work = temp_dir("artwork-preview-none");
		assert!(stage_artwork_preview(Some(&svg), &work).unwrap().is_none());
		assert!(stage_artwork_preview(None, &work).unwrap().is_none());
		assert!(!work.join("artwork.pdf").exists());
	}
}
