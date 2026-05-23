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
			<!-- The webview's built-in PDF viewer renders the asset:// URL
			directly and brings its own scrollbar / zoom controls. We make the
			outer modal body overflow-hidden so we don't end up with two
			scrollbars stacked on top of each other. -->
			<div class="h-full w-full bg-(--ui-bg-muted) rounded overflow-hidden">
				<iframe
					v-if="iframeSrc"
					ref="iframeRef"
					:src="iframeSrc"
					class="w-full h-full block border-0 rounded"
					title="PDF preview"
				/>
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
// The parent owns the temp file lifecycle: it kicks off the render via
// renderPdfPreview() and passes us the asset URL + temp path. We just
// emit `save` (with the temp path) when the user clicks "Save as…", and
// the parent calls commitPdfPreview() to copy the temp to the chosen
// destination.
//
// Chrome dialled down to maximise the PDF preview surface:
//   - The modal title is `sr-only` — kept for screen-reader a11y, hidden
//     visually. Users close via Escape or the Cancel button.
//   - The PDF viewer's own toolbar is suppressed by appending
//     #toolbar=0&navpanes=0 to the asset URL. PDFium (Webview2 / WKWebView)
//     honours these PDF Open Parameters, so the inner zoom / page / save
//     strip disappears and the page sits flush against the modal body.

	interface Props {
		open: boolean
		assetUrl: string | null
		suggestedFileName: string
		title?: string
		saving?: boolean
	}

	const props = withDefaults(defineProps<Props>(), {
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

	const close = () => {
		emit("cancel");
		emit("update:open", false);
	};

	const onSave = () => {
		emit("save");
	};

	// Trigger the browser's print dialog on the iframe's PDF content
	// (the modal-level print would print the modal chrome too). PDFium
	// in Webview2 / WKWebView serves the rendered PDF same-origin under
	// the asset:// scheme, so contentWindow.print() reaches into it and
	// pops the OS print dialog scoped to the document.
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
	// toolbar / nav panes. Preserves any existing hash (the
	// cache-busting query lives in the search string, not the hash, so
	// this stays clean) and merges if one's already present.
	const iframeSrc = computed<string | null>(() => {
		if (!props.assetUrl) return null;
		const hashIndex = props.assetUrl.indexOf("#");
		const base = hashIndex >= 0 ? props.assetUrl.slice(0, hashIndex) : props.assetUrl;
		const existing = hashIndex >= 0 ? props.assetUrl.slice(hashIndex + 1) : "";
		const ours = "toolbar=0&navpanes=0";
		return `${base}#${existing ? `${ours}&${existing}` : ours}`;
	});
</script>
