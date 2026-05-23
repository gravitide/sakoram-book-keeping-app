<template>
	<UModal
		:open="open"
		:title="title"
		:ui="{
			content: 'w-[min(96vw,1200px)] h-[96vh] max-w-none',
			body: 'flex-1 min-h-0 overflow-hidden p-3 sm:p-3',
			header: 'sr-only'
		}"
		:close="false"
		@update:open="onOpenChange"
	>
		<template #body>
			<!-- The webview's built-in PDF viewer renders the iframe src
			directly and brings its own scrollbar / zoom controls. We make
			the outer modal body overflow-hidden so we don't end up with
			two scrollbars stacked on top of each other. -->
			<div class="h-full w-full bg-(--ui-bg-muted) rounded overflow-hidden">
				<iframe
					v-if="iframeSrc"
					ref="iframeRef"
					:src="iframeSrc"
					class="w-full h-full block border-0 rounded"
					title="PDF preview"
				/>
				<div v-else class="h-full w-full flex items-center justify-center text-sm text-(--ui-text-muted)">
					Loading preview…
				</div>
			</div>
		</template>

		<template #footer>
			<div class="flex justify-between items-center gap-2 w-full">
				<div class="text-xs text-(--ui-text-muted) truncate">
					{{ suggestedFileName }}
				</div>
				<div class="flex gap-2">
					<UButton color="neutral" variant="outline" @click="close">
						Cancel
					</UButton>
					<UButton color="neutral" variant="outline" icon="i-lucide-printer" @click="onPrint">
						Print
					</UButton>
					<UButton :loading="saving" icon="i-lucide-save" @click="onSave">
						Save as…
					</UButton>
				</div>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
// Modal that embeds a rendered PDF via the webview's built-in viewer
// (Webview2 on Windows / WKWebView on macOS — both render PDFs natively
// when pointed at a file URL).
//
// We don't bind the iframe directly to the asset:// URL Tauri returns
// from convertFileSrc() because the asset protocol is cross-origin to
// the app's origin — `iframe.contentWindow.print()` is then blocked by
// same-origin policy. Instead we read the temp file bytes via the fs
// plugin, wrap them in a Blob, and feed the iframe a blob: URL — which
// is same-origin to the renderer, so print works.
//
// The parent owns the temp file lifecycle: it kicks off the render via
// renderPdfPreview() and passes us `tempPath` (we read this) and
// `assetUrl` (kept for back-compat / debugging). We emit `save` when
// the user clicks "Save as…"; the parent calls commitPdfPreview() to
// copy the temp to the chosen destination.
//
// Chrome dialled down to maximise the PDF preview surface:
//   - The modal title is `sr-only` — kept for screen-reader a11y, hidden
//     visually. Users close via Escape or the Cancel button.
//   - The PDF viewer's own toolbar is suppressed by appending
//     #toolbar=0&navpanes=0 to the blob URL. PDFium honours these PDF
//     Open Parameters so the inner zoom / page strip disappears and
//     the page sits flush against the modal body.

	import { readFile } from "@tauri-apps/plugin-fs";

	interface Props {
		open: boolean
		/**
		 * Local filesystem path of the rendered PDF. We read this to
		 * build a same-origin blob URL for the iframe.
		 */
		tempPath: string
		/**
		 * Tauri asset:// URL; kept for back-compat with existing callers
		 * but no longer used by the iframe.
		 */
		assetUrl?: string | null
		suggestedFileName: string
		title?: string
		saving?: boolean
	}

	const props = withDefaults(defineProps<Props>(), {
		assetUrl: null,
		title: "PDF preview",
		saving: false
	});

	const emit = defineEmits<{
		"update:open": [value: boolean]
		save: []
		cancel: []
	}>();

	const toast = useToast();
	const iframeRef = ref<HTMLIFrameElement | null>(null);

	// Blob URL backing the iframe. Created on open from the temp file
	// bytes (same-origin to the renderer); revoked on close / unmount
	// to release the underlying memory.
	const blobUrl = ref<string | null>(null);
	const loadError = ref<string | null>(null);

	const revokeBlob = () => {
		if (blobUrl.value) {
			URL.revokeObjectURL(blobUrl.value);
			blobUrl.value = null;
		}
	};

	const loadBlob = async () => {
		if (!props.open || !props.tempPath) {
			revokeBlob();
			return;
		}
		try {
			loadError.value = null;
			const bytes = await readFile(props.tempPath);
			const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
			revokeBlob();
			blobUrl.value = URL.createObjectURL(blob);
		} catch (err) {
			loadError.value = err instanceof Error ? err.message : String(err);
			toast.add({
				title: "PDF preview failed to load",
				description: loadError.value,
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Re-load when the modal opens, or when the underlying temp path
	// changes (e.g. user re-rendered after edits). Closing tears the
	// blob down so reopening is fresh.
	watch(
		() => [props.open, props.tempPath] as const,
		() => {
			void loadBlob();
		},
		{ immediate: true }
	);

	onBeforeUnmount(revokeBlob);

	const close = () => {
		emit("cancel");
		emit("update:open", false);
	};

	const onSave = () => {
		emit("save");
	};

	// Trigger the browser's print dialog on the iframe's PDF content.
	// Works because the iframe is loaded from a same-origin blob URL
	// (see top-of-file note) — contentWindow.print() pops the OS print
	// dialog scoped to the document.
	const onPrint = () => {
		const win = iframeRef.value?.contentWindow;
		if (!win) {
			toast.add({
				title: "Couldn't reach the PDF viewer to print",
				description: "Try saving the file and printing it directly.",
				color: "warning",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		try {
			win.focus();
			win.print();
		} catch (err) {
			toast.add({
				title: "Print failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onOpenChange = (next: boolean) => {
		// X button or backdrop click → treat as cancel.
		if (!next) emit("cancel");
		emit("update:open", next);
	};

	// Append PDF Open Parameters to suppress the built-in viewer's
	// toolbar / nav panes.
	const iframeSrc = computed<string | null>(() => {
		if (!blobUrl.value) return null;
		return `${blobUrl.value}#toolbar=0&navpanes=0`;
	});
</script>
