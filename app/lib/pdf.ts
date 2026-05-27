// Shared PDF export plumbing for quotes, invoices, bills, and vouchers.
//
// Two flows:
//
//   1. Direct save (legacy): exportPdfDocument()
//        - opens save dialog → renders straight to chosen path → toast
//
//   2. Preview-first (default for the UI button): renderPdfPreview() then
//      commitPdfPreview() once the user clicks "Save as…" in the modal.
//        - render to a temp file under app_local_data_dir/pdf-previews/
//        - PdfPreviewModal embeds it via convertFileSrc() in an <iframe>
//        - Save copies temp → user destination via the `copy_file` Rust
//          command (one render, no re-compile on save).
//
// We centralise:
//   - error mapping (Windows file-lock 32 → "Close the PDF first")
//   - temp file naming (so the same document overwrites its own preview
//     instead of accumulating one per click)

import type { CompanySettingsRow } from "~/stores/settings";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { mkdir } from "@tauri-apps/plugin-fs";
import { useSettingsStore } from "~/stores/settings";

export type PdfCommand
	= | "export_quote_pdf"
		| "export_invoice_pdf"
		| "export_bill_pdf"
		| "export_voucher_pdf"
		| "export_payslip_pdf"
		| "export_report_pdf"
		| "export_statement_pdf";

export type PdfResult
	= | { ok: true, path: string }
		| { ok: false, kind: "cancelled" }
		| { ok: false, kind: "locked", message: string }
		| { ok: false, kind: "failed", message: string };

export type PreviewResult
	= | { ok: true, tempPath: string, assetUrl: string, suggestedFileName: string }
		| { ok: false, kind: "locked", message: string }
		| { ok: false, kind: "failed", message: string };

const mapInvokeError = (err: unknown): { kind: "locked" | "failed", message: string } => {
	const raw = err instanceof Error ? err.message : String(err);
	const isLocked = raw.includes("os error 32") || raw.toLowerCase().includes("being used by another process");
	return isLocked
		? {
			kind: "locked",
			message: "The PDF you're trying to overwrite is open in another program. Close it (PDF viewer, browser tab) and try again."
		}
		: { kind: "failed", message: raw };
};

// Each PDF command maps to the per-type protection toggle on
// company_settings. When that toggle is on and an owner password is
// configured, we hand the password to the Rust side, which encrypts the
// rendered PDF (AES-256, owner-password only — opens freely, editing
// blocked). See src-tauri/src/pdf.rs.
const PROTECT_FLAG: Record<PdfCommand, keyof CompanySettingsRow | null> = {
	export_quote_pdf: "pdf_protect_quote",
	export_invoice_pdf: "pdf_protect_invoice",
	export_bill_pdf: "pdf_protect_bill",
	export_voucher_pdf: "pdf_protect_voucher",
	export_payslip_pdf: "pdf_protect_payslip",
	// Reports are summary aggregates the user generates ad-hoc — no
	// per-type protection setting (yet). Always renders unencrypted.
	export_report_pdf: null,
	// Customer statements are the same — generated ad-hoc, point-in-time,
	// no immutable archive. No per-type protection toggle.
	export_statement_pdf: null
};

// Resolve the owner password to encrypt this document type with, or null
// when protection is off (no password set, or this type's toggle is off).
// Exported so callers that `invoke` an export command directly (e.g. the
// payslips bulk-PDF loop) can apply the same protection the preview flow
// gets for free.
export const resolveProtectPassword = async (command: PdfCommand): Promise<string | null> => {
	const store = useSettingsStore();
	await store.ensureLoaded();
	const s = store.settings;
	if (!s) return null;
	const password = s.pdf_protect_password?.trim();
	if (!password) return null;
	// Reports skip the per-type toggle entirely — PROTECT_FLAG entry
	// is null, so always renders unencrypted.
	const flagKey = PROTECT_FLAG[command];
	if (flagKey === null) return null;
	return s[flagKey] ? password : null;
};

// Slugify a document number (e.g. "QT-2026-0001") into a filesystem-safe
// stem. We deliberately don't include a timestamp — same doc previewed
// twice should overwrite the same temp file, not pile up.
const slug = (s: string): string => s.replace(/[^\w.-]+/g, "_");

/// Render the PDF to a temp path suitable for preview. Returns the
/// absolute temp path AND a webview-safe asset:// URL ready to drop into
/// an <iframe>. The same document slug is reused, so re-previewing
/// overwrites instead of accumulating.
export const renderPdfPreview = async (args: {
	command: PdfCommand
	data: unknown
	suggestedFileName: string // e.g. "QT-2026-0001.pdf"
}): Promise<PreviewResult> => {
	try {
		const baseDir = await appLocalDataDir();
		const previewDir = await join(baseDir, "pdf-previews");
		await mkdir(previewDir, { recursive: true }).catch(() => { /* exists */ });

		const tempPath = await join(previewDir, slug(args.suggestedFileName));
		const protectPassword = await resolveProtectPassword(args.command);
		await invoke(args.command, { data: args.data, outputPath: tempPath, protectPassword });

		// Cache-bust so the iframe re-fetches when the same doc is re-rendered.
		const assetUrl = `${convertFileSrc(tempPath)}?t=${Date.now()}`;
		return { ok: true, tempPath, assetUrl, suggestedFileName: args.suggestedFileName };
	} catch (err) {
		const mapped = mapInvokeError(err);
		return { ok: false, ...mapped };
	}
};

/// Open the system save dialog and copy the previously-rendered preview
/// file to the chosen destination. No re-render needed.
export const commitPdfPreview = async (args: {
	tempPath: string
	suggestedFileName: string
}): Promise<PdfResult> => {
	let chosen: string | null = null;
	try {
		chosen = await saveDialog({
			defaultPath: args.suggestedFileName,
			filters: [{ name: "PDF", extensions: ["pdf"] }]
		});
	} catch (err) {
		return { ok: false, kind: "failed", message: err instanceof Error ? err.message : String(err) };
	}
	if (!chosen) return { ok: false, kind: "cancelled" };

	try {
		await invoke("copy_file", { src: args.tempPath, dst: chosen });
		return { ok: true, path: chosen };
	} catch (err) {
		const mapped = mapInvokeError(err);
		return { ok: false, ...mapped };
	}
};

/// Direct save (no preview). Kept for backwards compatibility / future
/// "skip preview" toggles.
export const exportPdfDocument = async (args: {
	command: PdfCommand
	data: unknown
	defaultFileName: string
}): Promise<PdfResult> => {
	let chosen: string | null = null;
	try {
		chosen = await saveDialog({
			defaultPath: args.defaultFileName,
			filters: [{ name: "PDF", extensions: ["pdf"] }]
		});
	} catch (err) {
		return { ok: false, kind: "failed", message: err instanceof Error ? err.message : String(err) };
	}
	if (!chosen) return { ok: false, kind: "cancelled" };

	try {
		const protectPassword = await resolveProtectPassword(args.command);
		await invoke(args.command, { data: args.data, outputPath: chosen, protectPassword });
		return { ok: true, path: chosen };
	} catch (err) {
		const mapped = mapInvokeError(err);
		return { ok: false, ...mapped };
	}
};

export const openSavedPdf = async (path: string): Promise<void> => {
	await invoke("open_path", { path });
};
