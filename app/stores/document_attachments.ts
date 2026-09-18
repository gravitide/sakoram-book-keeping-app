// Document attachments — scans / photos attached to a document.
//
// One polymorphic table (`document_attachments`) backs all four document
// types — quote, invoice, bill, voucher — keyed by (document_type,
// document_id). The file bytes live on disk under
// app_data_dir/attachments/<tenant>/<type>/<id>/, written either by the
// `import_document_attachment` command (desktop file dialog) or the
// phone-upload server. This store only tracks the metadata rows.
//
// `load(type, id)` is called by the AttachmentsCard component; the store
// holds attachments for one document at a time.

import { invoke } from "@tauri-apps/api/core";
import { defineStore } from "pinia";
import { ref } from "vue";
import { execute, select } from "~/lib/db";

export type DocumentType = "quote" | "invoice" | "bill" | "voucher";
export type AttachmentSource = "local" | "phone";

export interface DocumentAttachmentRow {
	id: number
	document_type: DocumentType
	document_id: number
	file_path: string
	filename: string
	size_bytes: number
	mime: string
	source: AttachmentSource
	created_at: string
}

/// The shape both upload paths produce — the `import_document_attachment`
/// command returns it, and the `phone-upload-received` event payload
/// carries the same fields (with `size` rather than `size_bytes`).
export interface AttachmentFile {
	file_path: string
	filename: string
	size: number
	mime: string
}

/// Delete every attachment of a document — rows *and* files. Called from
/// each document store's delete path: the table is polymorphic so there
/// is no ON DELETE CASCADE to lean on. Standalone (not a store action) so
/// document stores can import it without a store-to-store dependency.
export const purgeDocumentAttachments = async (
	documentType: DocumentType,
	documentId: number
): Promise<void> => {
	await execute(
		"DELETE FROM document_attachments WHERE document_type = ? AND document_id = ?",
		[documentType, documentId]
	);
	// Clears the on-disk directory; a missing directory is a no-op.
	await invoke("clear_document_attachments", {
		documentType,
		documentId: String(documentId)
	}).catch(() => { /* best-effort — rows are already gone */ });
};

export const useDocumentAttachmentsStore = defineStore("document_attachments", () => {
	const attachments = ref<DocumentAttachmentRow[]>([]);
	const loading = ref(false);

	const load = async (documentType: DocumentType, documentId: number): Promise<void> => {
		loading.value = true;
		try {
			attachments.value = await select<DocumentAttachmentRow>(
				`SELECT * FROM document_attachments
				 WHERE document_type = ? AND document_id = ?
				 ORDER BY datetime(created_at) ASC, id ASC`,
				[documentType, documentId]
			);
		} finally {
			loading.value = false;
		}
	};

	/// Record a freshly-saved file as an attachment. The file is already
	/// on disk — this only writes the metadata row.
	const add = async (
		documentType: DocumentType,
		documentId: number,
		file: AttachmentFile,
		source: AttachmentSource
	): Promise<void> => {
		await execute(
			`INSERT INTO document_attachments (
				document_type, document_id, file_path, filename, size_bytes, mime, source
			) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[documentType, documentId, file.file_path, file.filename, file.size, file.mime, source]
		);
		await load(documentType, documentId);
	};

	/// Pick an image from disk via the desktop file dialog and attach it.
	/// Returns false if the user cancelled the dialog.
	const addLocal = async (
		documentType: DocumentType,
		documentId: number
	): Promise<boolean> => {
		const { open } = await import("@tauri-apps/plugin-dialog");
		const picked = await open({
			multiple: false,
			directory: false,
			filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "heic"] }]
		});
		if (!picked || typeof picked !== "string") return false;
		const file = await invoke<AttachmentFile>("import_document_attachment", {
			documentType,
			documentId: String(documentId),
			srcPath: picked
		});
		await add(documentType, documentId, file, "local");
		return true;
	};

	/// Delete an attachment — removes the file from disk, then the row.
	/// A missing file is treated as already-gone (best-effort unlink).
	const remove = async (id: number): Promise<void> => {
		const row = attachments.value.find((a) => a.id === id);
		if (row) {
			// Rust command, not the fs plugin's remove(): business folders live
			// on any drive, but the plugin scope only covers $APPDATA / $HOME —
			// for a business on D: the unlink failed, the error was swallowed,
			// the row went, and the file stayed on disk forever. The command
			// resolves the path itself from (type, id, basename).
			await invoke("remove_document_attachment", {
				documentType: row.document_type,
				documentId: String(row.document_id),
				fileName: row.file_path
			}).catch(() => { /* best-effort — never block removing the row */ });
		}
		await execute("DELETE FROM document_attachments WHERE id = ?", [id]);
		if (row) await load(row.document_type, row.document_id);
	};

	return { attachments, loading, load, add, addLocal, remove };
});
