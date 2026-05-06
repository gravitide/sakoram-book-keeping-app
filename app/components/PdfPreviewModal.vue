<template>
	<UModal
		:open="open"
		:title="title"
		:ui="{
			content: 'w-[min(96vw,1200px)] h-[96vh] max-w-none',
			body: 'flex-1 min-h-0 overflow-hidden p-3 sm:p-3'
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
					v-if="assetUrl"
					:src="assetUrl"
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

	const close = () => {
		emit("cancel");
		emit("update:open", false);
	};

	const onSave = () => {
		emit("save");
	};

	const onOpenChange = (next: boolean) => {
		// X button or backdrop click → treat as cancel.
		if (!next) emit("cancel");
		emit("update:open", next);
	};

	// Re-trigger iframe load when the URL changes (e.g. preview re-rendered
	// for the same doc) by binding `assetUrl` directly — the cache-bust
	// query string in renderPdfPreview ensures the browser re-fetches.
	const _ = props; // silence unused-prop lint; iframe key not needed.
</script>
