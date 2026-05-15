// PDF generation via the embedded `typst` CLI sidecar.
//
// We support three templates:
//   - document.typ — quotes, invoices, bills (unified; the JSON drives labels)
//   - voucher.typ  — money-in/out vouchers (simpler one-page layout)
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

const DOCUMENT_TEMPLATE: &str = include_str!("../templates/document.typ");
const VOUCHER_TEMPLATE: &str = include_str!("../templates/voucher.typ");
const PAYSLIP_TEMPLATE: &str = include_str!("../templates/payslip.typ");

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

	// 3. Write data.json
	let data_path = work_dir.join("data.json");
	std::fs::write(&data_path, serde_json::to_vec_pretty(&data)?)?;

	// 4. Write the template (overwrite each render so updates pick up)
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

#[tauri::command]
pub async fn export_quote_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	render_pdf(&app, "document.typ", DOCUMENT_TEMPLATE, data, PathBuf::from(output_path), protect_password).await
}

#[tauri::command]
pub async fn export_invoice_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	render_pdf(&app, "document.typ", DOCUMENT_TEMPLATE, data, PathBuf::from(output_path), protect_password).await
}

#[tauri::command]
pub async fn export_bill_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	render_pdf(&app, "document.typ", DOCUMENT_TEMPLATE, data, PathBuf::from(output_path), protect_password).await
}

#[tauri::command]
pub async fn export_payslip_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	render_pdf(&app, "payslip.typ", PAYSLIP_TEMPLATE, data, PathBuf::from(output_path), protect_password).await
}

#[tauri::command]
pub async fn export_voucher_pdf(
	app: AppHandle,
	data: Value,
	output_path: String,
	protect_password: Option<String>,
) -> Result<(), PdfError> {
	render_pdf(&app, "voucher.typ", VOUCHER_TEMPLATE, data, PathBuf::from(output_path), protect_password).await
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
