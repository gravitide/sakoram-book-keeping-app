// Invoice attachments — scans / photos attached to an invoice.
//
// The file bytes live on disk (under app_data_dir/invoice_attachments/),
// written either by the desktop file-import command or the phone-upload
// server. This store only tracks the metadata rows in the
// `invoice_attachments` table. `load(invoiceId)` is called by the invoice
// detail page; the store holds attachments for one invoice at a time.

import { invoke } from "@tauri-apps/api/core";
import { remove as removeFile } from "@tauri-apps/plugin-fs";
import { defineStore } from "pinia";
import { ref } from "vue";
import { execute, select } from "~/lib/db";

export type AttachmentSource = "local" | "phone";

export interface InvoiceAttachmentRow {
	id: number
	invoice_id: number
	file_path: string
	filename: string
	size_bytes: number
	mime: string
	source: AttachmentSource
	created_at: string
}

/// The shape both upload paths produce — the `import_invoice_attachment`
/// command returns it, and the `phone-upload-received` event payload
/// carries the same fields (with `size` rather than `size_bytes`).
export interface AttachmentFile {
	file_path: string
	filename: string
	size: number
	mime: string
}

export const useInvoiceAttachmentsStore = defineStore("invoice_attachments", () => {
	const attachments = ref<InvoiceAttachmentRow[]>([]);
	const loading = ref(false);

	const load = async (invoiceId: number): Promise<void> => {
		loading.value = true;
		try {
			attachments.value = await select<InvoiceAttachmentRow>(
				"SELECT * FROM invoice_attachments WHERE invoice_id = ? ORDER BY datetime(created_at) ASC, id ASC",
				[invoiceId]
			);
		} finally {
			loading.value = false;
		}
	};

	/// Record a freshly-saved file as an attachment. The file is already
	/// on disk — this only writes the metadata row.
	const add = async (
		invoiceId: number,
		file: AttachmentFile,
		source: AttachmentSource
	): Promise<void> => {
		await execute(
			`INSERT INTO invoice_attachments (
				invoice_id, file_path, filename, size_bytes, mime, source
			) VALUES (?, ?, ?, ?, ?, ?)`,
			[invoiceId, file.file_path, file.filename, file.size, file.mime, source]
		);
		await load(invoiceId);
	};

	/// Pick an image from disk via the desktop file dialog and attach it.
	/// Returns false if the user cancelled the dialog.
	const addLocal = async (invoiceId: number): Promise<boolean> => {
		const { open } = await import("@tauri-apps/plugin-dialog");
		const picked = await open({
			multiple: false,
			directory: false,
			filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "heic"] }]
		});
		if (!picked || typeof picked !== "string") return false;
		const file = await invoke<AttachmentFile>("import_invoice_attachment", {
			invoiceId: String(invoiceId),
			srcPath: picked
		});
		await add(invoiceId, file, "local");
		return true;
	};

	/// Delete an attachment — removes the file from disk, then the row.
	/// A missing file is treated as already-gone (best-effort unlink).
	const remove = async (id: number): Promise<void> => {
		const row = attachments.value.find((a) => a.id === id);
		if (row) {
			await removeFile(row.file_path).catch(() => { /* already gone */ });
		}
		await execute("DELETE FROM invoice_attachments WHERE id = ?", [id]);
		if (row) await load(row.invoice_id);
	};

	return { attachments, loading, load, add, addLocal, remove };
});
