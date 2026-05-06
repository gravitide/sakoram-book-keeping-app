// Drives the preview-then-save flow used by every detail page (quotes,
// invoices, bills, vouchers). Each page provides a `command`, a
// `buildPayload()` callback, and a `fileName` callback; this composable
// owns the modal state, temp path, and the save/cancel handlers.
//
// Usage:
//   const pdf = usePdfPreview({
//     command: "export_invoice_pdf",
//     buildPayload: () => ({ ... }),
//     fileName: () => `${invoice.value!.number}.pdf`
//   });
//
//   <UButton @click="pdf.open">PDF</UButton>
//   <PdfPreviewModal v-model:open="pdf.state.open" ... />

import type { PdfCommand } from "~/lib/pdf";
import { commitPdfPreview, openSavedPdf, renderPdfPreview } from "~/lib/pdf";

export interface PdfPreviewState {
	open: boolean
	assetUrl: string | null
	tempPath: string
	suggestedFileName: string
	saving: boolean
	rendering: boolean
}

export const usePdfPreview = (opts: {
	command: PdfCommand
	buildPayload: () => unknown
	fileName: () => string
	title?: string
}) => {
	const toast = useToast();

	const state = reactive<PdfPreviewState>({
		open: false,
		assetUrl: null,
		tempPath: "",
		suggestedFileName: "",
		saving: false,
		rendering: false
	});

	// Click handler for the PDF button on each detail page.
	const open = async (): Promise<void> => {
		if (state.rendering) return;
		state.rendering = true;
		try {
			const result = await renderPdfPreview({
				command: opts.command,
				data: opts.buildPayload(),
				suggestedFileName: opts.fileName()
			});
			if (!result.ok) {
				toast.add({
					title: result.kind === "locked" ? "Close the PDF first" : "PDF preview failed",
					description: result.message,
					color: "error",
					icon: "i-lucide-circle-alert"
				});
				return;
			}
			state.tempPath = result.tempPath;
			state.assetUrl = result.assetUrl;
			state.suggestedFileName = result.suggestedFileName;
			state.open = true;
		} finally {
			state.rendering = false;
		}
	};

	// Triggered by the modal's "Save as…" button.
	const onSave = async (): Promise<void> => {
		if (state.saving || !state.tempPath) return;
		state.saving = true;
		try {
			const result = await commitPdfPreview({
				tempPath: state.tempPath,
				suggestedFileName: state.suggestedFileName
			});
			if (!result.ok) {
				if (result.kind === "cancelled") return;
				toast.add({
					title: result.kind === "locked" ? "Close the PDF first" : "Save failed",
					description: result.message,
					color: "error",
					icon: "i-lucide-circle-alert"
				});
				return;
			}
			const savedPath = result.path;
			state.open = false;
			toast.add({
				title: "PDF saved",
				description: savedPath,
				color: "success",
				icon: "i-lucide-file-down",
				actions: [
					{
						label: "Open",
						icon: "i-lucide-external-link",
						color: "neutral",
						variant: "outline",
						onClick: async () => {
							try {
								await openSavedPdf(savedPath);
							} catch (e) {
								toast.add({
									title: "Could not open file",
									description: e instanceof Error ? e.message : String(e),
									color: "error",
									icon: "i-lucide-circle-alert"
								});
							}
						}
					}
				]
			});
		} finally {
			state.saving = false;
		}
	};

	const onCancel = (): void => {
		// Modal already closes itself; we just clear the cached state so
		// next open triggers a fresh render.
		state.assetUrl = null;
		state.tempPath = "";
	};

	return { state, open, onSave, onCancel, title: opts.title ?? "PDF preview" };
};
