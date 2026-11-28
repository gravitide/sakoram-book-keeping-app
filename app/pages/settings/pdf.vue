<template>
	<div class="select-none">
		<header class="mb-6 max-w-5xl mx-auto">
			<h1 class="text-2xl font-semibold">
				PDF
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				The page every PDF you generate is printed on.
			</p>
		</header>

		<!-- The page design itself is edited in the page designer window
			(app/pages/designer.vue): paper, templates, images, safe area,
			Document style, accent and font. This page shows the SAVED design
			and opens it. Sidebar anchors: app/lib/pdf-settings-sections.ts. -->
		<div class="max-w-5xl mx-auto space-y-8">
			<section :id="PDF_SECTION_IDS.page" class="scroll-mt-6">
				<SectionCard
					icon="i-lucide-file"
					title="Page"
					subtitle="Quotes, invoices, bills, vouchers, payslips, statements, reports and letters all print on this page."
				>
					<div class="flex flex-col sm:flex-row items-start gap-6">
						<div class="shrink-0 self-center sm:self-start" :style="{ width: `${PREVIEW_W_PX}px` }">
							<div
								class="relative overflow-hidden rounded-sm ring-1 ring-(--ui-border) shadow-sm bg-white"
								:style="{ height: `${previewHeightPx}px` }"
								role="img"
								:aria-label="`Page 1 of a sample invoice on ${paper.label}`"
								:aria-busy="livePreview.loading.value"
							>
								<img
									v-if="livePreview.url.value"
									:src="livePreview.url.value"
									alt=""
									class="size-full object-contain transition-opacity"
									:class="livePreview.loading.value ? 'opacity-60' : 'opacity-100'"
								>
								<div v-if="livePreview.loading.value || !livePreview.url.value" class="absolute inset-0 flex items-center justify-center">
									<UIcon v-if="!livePreview.error.value" name="i-lucide-loader-circle" class="size-5 animate-spin text-zinc-400" />
								</div>
							</div>
							<p v-if="livePreview.error.value" class="mt-2 text-xs text-(--ui-warning)">
								Couldn't render the preview: {{ livePreview.error.value }}
							</p>
							<UButton
								class="mt-3 w-full justify-center"
								icon="i-lucide-file-search"
								variant="soft"
								size="sm"
								:loading="samplePreview.state.rendering"
								title="Opens a two-page sample, so you can check the second page too"
								@click="samplePreview.open()"
							>
								Preview as PDF
							</UButton>
						</div>

						<div :id="PDF_SECTION_IDS.design" class="min-w-0 flex-1 scroll-mt-6">
							<div class="text-sm font-medium">
								Design
							</div>
							<p class="text-xs text-(--ui-text-muted) mt-0.5">
								{{ summary }}
							</p>
							<p class="text-sm text-(--ui-text-muted) mt-3 max-w-prose">
								Start from a template, then move things around, add your own images and set the safe area your documents stay inside — in the page designer, which opens in its own window.
							</p>
							<div class="mt-4 flex items-center gap-1">
								<UButton icon="i-lucide-pencil-ruler" @click="designer.open()">
									Open page designer
								</UButton>
								<HelpButton slug="page-designer" size="sm" />
							</div>
						</div>
					</div>
				</SectionCard>
			</section>

			<!-- Not a SectionCard: a signpost to the Security page. -->
			<div class="flex items-start gap-3 rounded-md border border-(--ui-border) bg-(--ui-bg-muted) px-4 py-3">
				<UIcon name="i-lucide-shield-check" class="size-5 text-(--ui-text-muted) shrink-0 mt-0.5" />
				<div class="text-sm min-w-0">
					<div>
						<span class="font-medium">Document protection</span>
						<span class="text-(--ui-text-muted)"> — password-protect generated PDFs against editing and copying.</span>
					</div>
					<UButton to="/settings/security#pdf-protection" variant="soft" trailing-icon="i-lucide-arrow-right" size="xs" class="mt-2.5">
						Open
					</UButton>
				</div>
			</div>
		</div>

		<PdfPreviewModal
			v-model:open="samplePreview.state.open"
			:asset-url="samplePreview.state.assetUrl"
			:temp-path="samplePreview.state.tempPath"
			:suggested-file-name="samplePreview.state.suggestedFileName"
			:saving="samplePreview.state.saving"
			title="Sample invoice"
			@save="samplePreview.onSave"
			@cancel="samplePreview.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
	// PDF settings: a live preview of the SAVED page design and the way into
	// the page designer window. When the designer saves, the main window's
	// settings reload (page-design-sync.client.ts), so this preview follows.
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { useLivePagePreview } from "~/composables/useLivePagePreview";
	import { usePageDesignerWindow } from "~/composables/usePageDesignerWindow";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { resolvePaperSize } from "~/lib/page-settings";
	import { PDF_LAYOUTS, resolveLayoutKey } from "~/lib/pdf-layouts";
	import { PDF_SECTION_IDS } from "~/lib/pdf-settings-sections";
	import { sampleStationeryPreviewPayload } from "~/lib/sample-pdf";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "PDF" });

	const store = useSettingsStore();
	const designer = usePageDesignerWindow();
	const currency = useActiveCurrency();

	await store.ensureLoaded();

	const paper = computed(() => resolvePaperSize(store.settings?.pdf_paper_size));
	const layoutKey = computed(() => resolveLayoutKey(store.settings?.pdf_layout));
	const summary = computed(() => {
		const style = PDF_LAYOUTS.find((l) => l.key === layoutKey.value)?.label ?? "Classic";
		return `${paper.value.label} · ${style} document style · ${store.settings?.pdf_font || "Akt"}`;
	});

	const samplePayload = () => (store.settings ? sampleStationeryPreviewPayload(store.settings, currency.value, layoutKey.value) : null);
	const samplePreview = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => samplePayload() ?? {},
		fileName: () => "sample-invoice.pdf",
		title: "Sample invoice"
	});
	// The company logo can change on disk without changing the payload (same
	// path), so its loaded URL is an extra input.
	const livePreview = useLivePagePreview(samplePayload, { deps: () => [store.logoSrc] });
	const PREVIEW_W_PX = 220;
	const previewHeightPx = computed(() => Math.round(PREVIEW_W_PX * (paper.value.heightMm / paper.value.widthMm)));
</script>
