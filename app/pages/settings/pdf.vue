<template>
	<div class="select-none">
		<!-- select-none on the page root: static labels and copy aren't
			selectable; form fields stay selectable via the input rule
			in main.css. -->
		<header class="mb-6 max-w-5xl mx-auto">
			<h1 class="text-2xl font-semibold">
				PDF
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				The page, its design and the font of every PDF you generate.
			</p>
		</header>

		<UForm
			:state="form"
			class="max-w-5xl mx-auto"
			@submit="onSubmit"
		>
			<!-- One top-down flow: the Page (live preview, paper), the Design
				(starter templates, safe area, Document style, accent), then the
				Font. Each is a sidebar anchor in app/layouts/default.vue (ids:
				app/lib/pdf-settings-sections.ts) — a new card goes inside one of
				them, never between. A page designer window replaces the Design
				section's template picker in stage 2 of the page designer
				(docs/superpowers/specs/2026-11-27-page-designer-design.md). -->
			<div class="space-y-8">
				<section :id="PDF_SECTION_IDS.page" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-file"
						title="Page"
						subtitle="The sheet every PDF is printed on — quotes, invoices, bills, vouchers, payslips, statements, reports and letters."
					>
						<!-- Page 1 of the sample invoice on the left, rendered by Typst from
							the live (unsaved) form ~500 ms after the last change
							(useLivePagePreview). The controls sit on the right — and come
							first below sm, so a narrow window leads with what you act on. -->
						<div class="flex flex-col sm:flex-row items-start gap-6">
							<div class="order-2 sm:order-1 shrink-0 self-center sm:self-start" :style="{ width: `${PREVIEW_W_PX}px` }">
								<div
									class="relative overflow-hidden rounded-sm ring-1 ring-(--ui-border) shadow-sm bg-white"
									:style="{ height: `${previewHeightPx}px` }"
									role="img"
									:aria-label="`Page 1 of a sample invoice on ${paperLabel}`"
									:aria-busy="livePreview.loading.value"
								>
									<img
										v-if="livePreview.url.value"
										:src="livePreview.url.value"
										alt=""
										class="size-full object-contain transition-opacity"
										:class="livePreview.loading.value ? 'opacity-60' : 'opacity-100'"
									>
									<div
										v-if="livePreview.loading.value || !livePreview.url.value"
										class="absolute inset-0 flex items-center justify-center"
									>
										<UIcon
											v-if="!livePreview.error.value"
											name="i-lucide-loader-circle"
											class="size-5 animate-spin text-zinc-400"
										/>
									</div>
								</div>
								<p v-if="livePreview.error.value" class="mt-2 text-xs text-(--ui-warning)">
									Couldn't render the preview: {{ livePreview.error.value }}
								</p>
								<p v-else class="mt-2 flex items-center gap-1.5 text-xs text-(--ui-text-muted)">
									<span class="size-1.5 shrink-0 rounded-full" :class="livePreview.loading.value ? 'bg-(--ui-warning)' : 'bg-(--ui-success)'" aria-hidden="true" />
									{{ paperLabel }}, live preview of page 1
								</p>
								<!-- The full two-page sample, right under the page it extends. -->
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

							<div class="order-1 sm:order-2 @container flex flex-col gap-5 min-w-0 flex-1 w-full">
								<div>
									<div id="pdf-paper-label" class="text-sm font-medium">
										Paper size
									</div>
									<p class="text-xs text-(--ui-text-muted) mt-0.5 mb-2">
										Your design scales to the sheet; text in the document stays the same size.
									</p>
									<div class="grid grid-cols-2 @lg:grid-cols-4 gap-2" role="group" aria-labelledby="pdf-paper-label">
										<button
											v-for="p in PAPER_SIZES"
											:key="p.key"
											type="button"
											class="px-3 py-2 rounded-md border text-left transition cursor-pointer hover:border-(--ui-primary)/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
											:class="form.pdf_paper_size === p.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)'"
											:aria-pressed="form.pdf_paper_size === p.key"
											@click="setPaper(p.key)"
										>
											<div class="text-xs font-medium">
												{{ p.label }}
											</div>
											<div class="text-xs text-(--ui-text-muted) tabular-nums">
												{{ p.widthMm }} × {{ p.heightMm }} mm
											</div>
										</button>
									</div>
								</div>
							</div>
						</div>
					</SectionCard>
				</section>

				<section :id="PDF_SECTION_IDS.design" class="scroll-mt-6 space-y-4">
					<SectionCard
						icon="i-lucide-layout-template"
						title="Design"
						subtitle="What's printed around your documents. Start from a template — a page designer to move things around and add your own images and text is coming."
					>
						<div class="grid grid-cols-1 sm:grid-cols-2 @container gap-2" role="group" aria-label="Starter templates">
							<button
								v-for="t in DESIGN_TEMPLATES"
								:key="t.key"
								type="button"
								class="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-md border border-(--ui-border) text-left transition cursor-pointer hover:border-(--ui-primary)/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary) disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-(--ui-border)"
								:disabled="dirty || applying !== null"
								@click="pickTemplate(t.key)"
							>
								<span class="flex items-center gap-1.5 text-sm font-medium">
									{{ t.label }}
									<UIcon v-if="applying === t.key" name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
								</span>
								<span class="text-xs text-(--ui-text-muted)">{{ t.description }}</span>
							</button>
						</div>
						<p v-if="dirty" class="text-xs text-(--ui-warning) mt-2">
							Save or discard your changes before switching templates.
						</p>
						<p v-else class="text-xs text-(--ui-text-muted) mt-2">
							Picking a template replaces your design. A logo spot takes a copy of your company logo.
						</p>
					</SectionCard>

					<SectionCard
						icon="i-lucide-scan"
						title="Safe area"
						subtitle="The space kept clear between your document and each edge of the page — your design sits around it."
					>
						<div class="flex flex-col sm:flex-row gap-6 items-start">
							<div class="grid grid-cols-2 gap-3 w-full sm:max-w-xs">
								<UFormField v-for="side in SIDES" :key="side.key" :label="`${side.label} (mm)`">
									<UInputNumber v-model="form.margins[side.key]" :min="0" :max="150" :step="0.5" class="w-full" />
								</UFormField>
							</div>
							<StationeryMarginDiagram :margins="form.margins" />
						</div>
					</SectionCard>

					<SectionCard
						icon="i-lucide-heading"
						title="Document style"
						subtitle="How each document sets out its own title and spacing. The accent colour tints it, highlighted totals, and anything in your design set to Accent."
					>
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-3" role="group" aria-label="Document style">
							<button
								v-for="l in PDF_LAYOUTS"
								:key="l.key"
								type="button"
								:title="l.description"
								class="p-2 rounded-md border text-left transition cursor-pointer hover:border-(--ui-primary)/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
								:class="form.pdf_layout === l.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)'"
								:aria-pressed="form.pdf_layout === l.key"
								@click="form.pdf_layout = l.key"
							>
								<div class="rounded-sm overflow-hidden ring-1 ring-(--ui-border) mb-1.5">
									<PdfLayoutThumb :layout-key="l.key" :color="themeColor" />
								</div>
								<div class="text-xs font-medium">
									{{ l.label }}
								</div>
							</button>
						</div>
						<div class="pt-4 mt-4 border-t border-(--ui-border)">
							<PdfColorRow v-model="form.pdf_theme_color" />
						</div>
					</SectionCard>
				</section>

				<section :id="PDF_SECTION_IDS.font" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-type"
						title="Font"
						subtitle="Used for every PDF this app generates. All fonts here are bundled with the app, so your documents look identical on any machine."
					>
						<UFormField label="Font family" name="pdf_font">
							<USelectMenu
								v-model="form.pdf_font"
								:items="fontOptions"
								value-key="value"
								label-key="label"
								icon="i-lucide-type"
								class="w-full"
								:search-input="{ placeholder: 'Search fonts…' }"
							>
								<template #item-label="{ item }">
									<span :style="{ fontFamily: `'${item.value}', ${item.mono ? 'monospace' : 'sans-serif'}` }">
										{{ item.label }}
									</span>
								</template>
							</USelectMenu>
						</UFormField>

						<div class="p-4 border border-(--ui-border) rounded-md bg-(--ui-bg-muted)">
							<div class="text-xs text-(--ui-text-muted) uppercase tracking-wide mb-2">
								Preview
							</div>
							<!-- Heading, body prose, and a figures row — the three things a
								document font has to get right. Figures use tabular-nums
								because money columns have to align in the PDF. -->
							<div :style="{ fontFamily: pdfPreviewFontStack }" class="space-y-1.5">
								<div class="text-2xl font-semibold">
									INVOICE INV-2026-0042
								</div>
								<div class="text-sm">
									Payment is due within 30 days of the invoice date.
								</div>
								<div class="text-sm tabular-nums">
									Subtotal 10,500.00 · VAT 1,845.00 · Total 12,345.00
								</div>
							</div>
						</div>
					</SectionCard>
				</section>

				<!-- Not a SectionCard: this is a signpost to the Security page, not a
					setting you change here. -->
				<div class="flex items-start gap-3 rounded-md border border-(--ui-border) bg-(--ui-bg-muted) px-4 py-3">
					<UIcon name="i-lucide-shield-check" class="size-5 text-(--ui-text-muted) shrink-0 mt-0.5" />
					<div class="text-sm min-w-0">
						<div>
							<span class="font-medium">Document protection</span>
							<span class="text-(--ui-text-muted)"> — password-protect generated PDFs against editing and copying.</span>
						</div>
						<UButton
							to="/settings/security#pdf-protection"
							variant="soft"
							trailing-icon="i-lucide-arrow-right"
							size="xs"
							class="mt-2.5"
						>
							Open
						</UButton>
					</div>
				</div>
			</div>

			<!-- Sticky save bar — same shape as the one on /settings/company. -->
			<div
				class="sticky bottom-0 -mx-2 mt-6 transition-all duration-200"
				:class="dirty
					? 'opacity-100 translate-y-0 pointer-events-auto'
					: 'opacity-0 translate-y-3 pointer-events-none'"
			>
				<div class="rounded-xl backdrop-blur-md bg-(--ui-bg)/90 border border-(--ui-border) shadow-lg px-4 py-3 flex items-center justify-between gap-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="relative flex size-2">
							<span class="absolute inline-flex h-full w-full rounded-full bg-(--ui-warning) opacity-75 animate-ping" />
							<span class="relative inline-flex size-2 rounded-full bg-(--ui-warning)" />
						</span>
						<span class="text-(--ui-text)">Unsaved changes</span>
					</div>
					<div class="flex items-center gap-2">
						<UButton
							variant="ghost"
							color="neutral"
							:disabled="saving || !dirty"
							@click="onDiscard"
						>
							Discard
						</UButton>
						<UButton
							:loading="saving"
							:disabled="!dirty"
							icon="i-lucide-save"
							type="submit"
						>
							Save changes
						</UButton>
					</div>
				</div>
			</div>
		</UForm>

		<UModal v-model:open="confirmOpen" :title="`Use ${pendingTemplate?.label ?? ''}?`">
			<template #body>
				<p class="text-sm">
					This replaces your current design with the {{ pendingTemplate?.label }} template. Images you added to it are removed.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton variant="ghost" color="neutral" @click="confirmOpen = false">
						Cancel
					</UButton>
					<UButton icon="i-lucide-layout-template" @click="confirmTemplate">
						Replace design
					</UButton>
				</div>
			</template>
		</UModal>

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
	// PDF settings, until the page designer window (stage 2) takes the design
	// over: Paper size, a starter-template picker, the design's safe area, the
	// Document style + accent, and the font. Templates apply (and save) at
	// once; everything else goes through the save bar.
	import type { DesignTemplateKey } from "~/lib/design-templates";
	import type { MarginsMm } from "~/lib/page-design";
	import type { PaperSize } from "~/lib/page-settings";
	import type { PdfLayoutKey } from "~/lib/pdf-layouts";
	import type { CompanySettingsRow } from "~/stores/settings";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { useLivePagePreview } from "~/composables/useLivePagePreview";
	import { usePageDesign } from "~/composables/usePageDesign";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { DESIGN_TEMPLATES } from "~/lib/design-templates";
	import { BUNDLED_FONTS, isBundledFont } from "~/lib/fonts";
	import { parsePageDesign, sameMargins, scaleDesign } from "~/lib/page-design";
	import { effectiveDesign, PAPER_SIZES, resolvePaperSize } from "~/lib/page-settings";
	import { PDF_LAYOUTS, resolveLayoutKey } from "~/lib/pdf-layouts";
	import { PDF_SECTION_IDS } from "~/lib/pdf-settings-sections";
	import { sampleStationeryPreviewPayload } from "~/lib/sample-pdf";
	import { themeHex } from "~/lib/theme";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "PDF" });

	const store = useSettingsStore();
	const toast = useToast();
	const pageDesign = usePageDesign();

	const SIDES: { key: keyof MarginsMm, label: string }[] = [
		{ key: "top", label: "Top" },
		{ key: "bottom", label: "Bottom" },
		{ key: "left", label: "Left" },
		{ key: "right", label: "Right" }
	];

	interface PdfForm {
		pdf_font: string
		pdf_theme_color: string
		pdf_layout: PdfLayoutKey
		pdf_paper_size: PaperSize
		/** The design's safe area on `pdf_paper_size`, in mm. */
		margins: MarginsMm
	}

	const form = reactive<PdfForm>({
		pdf_font: "Akt",
		pdf_theme_color: "green",
		pdf_layout: "classic",
		pdf_paper_size: "a4",
		margins: { top: 20, right: 18, bottom: 20, left: 18 }
	});

	const hydrate = () => {
		const s = store.settings;
		if (!s) return;
		form.pdf_font = s.pdf_font || "Akt";
		// Fall back to the UI theme colour for businesses that predate the
		// split (0039 seeds it, but a defensive fallback keeps a null safe).
		form.pdf_theme_color = s.pdf_theme_color ?? s.theme_color ?? "green";
		form.pdf_layout = resolveLayoutKey(s.pdf_layout);
		form.pdf_paper_size = resolvePaperSize(s.pdf_paper_size).key;
		form.margins = { ...effectiveDesign(s).margins };
	};

	await store.ensureLoaded();
	hydrate();

	// Dirty tracking via JSON snapshot. Same shape as company.vue.
	const formSnapshot = computed(() => JSON.stringify(form));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};
	// The saved safe area on the sheet picked now: a paper switch alone scales
	// form.margins, and must not count as editing them (saving them would be a
	// needless write, and float noise would follow).
	const savedMarginsOnPaper = () => {
		const saved = JSON.parse(baseline.value) as PdfForm;
		return scaleDesign({ version: 1, paper: saved.pdf_paper_size, margins: saved.margins, items: [] }, form.pdf_paper_size).margins;
	};

	// Kept-alive page: the design can change elsewhere (onboarding, a demo
	// seed). Re-read on the way back in, unless something here is unsaved.
	onActivated(() => {
		if (dirty.value) return;
		hydrate();
		refreshBaseline();
	});

	// A new sheet carries the safe area with it, scaled like the design is.
	const setPaper = (key: PaperSize) => {
		if (form.pdf_paper_size === key) return;
		form.margins = { ...scaleDesign({ version: 1, paper: form.pdf_paper_size, margins: form.margins, items: [] }, key).margins };
		form.pdf_paper_size = key;
	};

	const currency = useActiveCurrency();
	const themeColor = computed(() => themeHex(form.pdf_theme_color));
	const paperKey = computed(() => resolvePaperSize(form.pdf_paper_size).key);
	const paperLabel = computed(() => resolvePaperSize(paperKey.value).label);

	// The settings the previews render with: the saved row with the live form
	// on top — the saved design on the picked sheet, with the edited safe area.
	const previewSettings = computed<CompanySettingsRow | null>(() => {
		const s = store.settings;
		if (!s) return null;
		const design = effectiveDesign({ ...s, pdf_paper_size: form.pdf_paper_size });
		return {
			...s,
			pdf_font: form.pdf_font,
			pdf_theme_color: form.pdf_theme_color,
			pdf_paper_size: form.pdf_paper_size,
			pdf_layout: form.pdf_layout,
			pdf_design: JSON.stringify({ ...design, margins: { ...form.margins } })
		};
	});

	// The two-page sample invoice (sample-pdf.ts) both previews show.
	const samplePayload = () => (previewSettings.value ? sampleStationeryPreviewPayload(previewSettings.value, currency.value, form.pdf_layout) : null);

	// "Preview as PDF": the whole two-page sample in the PDF preview modal.
	const samplePreview = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => samplePayload() ?? {},
		fileName: () => "sample-invoice.pdf",
		title: "Sample invoice"
	});

	// The live preview: page 1 of the same sample, re-rendered ~500 ms after any
	// change. The company logo can change on disk without changing the payload
	// (same path), so its loaded URL is an extra input.
	const livePreview = useLivePagePreview(samplePayload, {
		deps: () => [store.logoSrc]
	});
	const PREVIEW_W_PX = 220;
	const previewHeightPx = computed(() => {
		const paper = resolvePaperSize(paperKey.value);
		return Math.round(PREVIEW_W_PX * (paper.heightMm / paper.widthMm));
	});

	// ---- starter templates -------------------------------------------------
	const confirmOpen = ref(false);
	const pendingTemplate = ref<(typeof DESIGN_TEMPLATES)[number] | null>(null);
	const applying = ref<DesignTemplateKey | null>(null);

	const applyTemplate = async (key: DesignTemplateKey) => {
		applying.value = key;
		try {
			await pageDesign.applyTemplate(key);
			hydrate();
			refreshBaseline();
			toast.add({ title: `${DESIGN_TEMPLATES.find((t) => t.key === key)?.label} design applied`, color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Couldn't apply the template", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			applying.value = null;
		}
	};

	// A never-chosen design has nothing of the user's to lose; anything else asks.
	const pickTemplate = (key: DesignTemplateKey) => {
		if (!parsePageDesign(store.settings?.pdf_design)) {
			void applyTemplate(key);
			return;
		}
		pendingTemplate.value = DESIGN_TEMPLATES.find((t) => t.key === key) ?? null;
		confirmOpen.value = true;
	};
	const confirmTemplate = () => {
		const key = pendingTemplate.value?.key;
		confirmOpen.value = false;
		if (key) void applyTemplate(key);
	};
	onDeactivated(() => {
		confirmOpen.value = false;
	});

	// ---- font ----------------------------------------------------------------
	// Grouped options for the font dropdown (bundled faces; a stored face that
	// isn't bundled — from back when this was free text — is kept as its own
	// "(custom)" group so opening this page never rewrites it).
	const fontOptions = computed(() => {
		const groups: Array<Array<Record<string, unknown>>> = [
			[
				{ type: "label", label: "Bundled" },
				...BUNDLED_FONTS.filter((f) => !f.mono).map((f) => ({ label: f.name, value: f.name, mono: false }))
			],
			[
				{ type: "label", label: "Monospaced" },
				...BUNDLED_FONTS.filter((f) => f.mono).map((f) => ({ label: f.name, value: f.name, mono: true }))
			]
		];
		const current = form.pdf_font;
		if (current && !isBundledFont(current)) {
			groups.push([
				{ type: "label", label: "Not bundled" },
				{ label: `${current} (custom)`, value: current, mono: false }
			]);
		}
		return groups;
	});
	const pdfPreviewFontStack = computed(() => `'${form.pdf_font || "Akt"}', 'Akt', 'Inter', serif`);

	// ---- save / discard ------------------------------------------------------
	const saving = ref(false);
	const onSubmit = async () => {
		saving.value = true;
		try {
			const marginsChanged = !sameMargins(form.margins, savedMarginsOnPaper());
			await store.save({
				pdf_font: form.pdf_font.trim() || "Akt",
				pdf_theme_color: form.pdf_theme_color,
				pdf_layout: form.pdf_layout,
				pdf_paper_size: form.pdf_paper_size
			});
			// After the paper: the safe area is in the new sheet's coordinates.
			if (marginsChanged) await pageDesign.saveMargins({ ...form.margins });
			hydrate();
			refreshBaseline();
			toast.add({ title: "PDF settings saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Save failed", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			saving.value = false;
		}
	};

	const onDiscard = () => {
		hydrate();
		refreshBaseline();
		toast.add({ title: "Changes discarded", color: "info", icon: "i-lucide-rotate-ccw" });
	};
</script>
