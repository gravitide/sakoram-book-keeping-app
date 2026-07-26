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
				Font, colour, header logo, and templates for your generated PDFs.
			</p>
		</header>

		<UForm
			:state="form"
			class="max-w-5xl mx-auto"
			@submit="onSubmit"
		>
			<!-- Layout: Font + Colour sit side by side on top — both are compact
				and both are "how the type and accent look". Header logo then runs
				full width below, because it needs the room for cropping and sizing
				controls. Templates and Document protection follow, also full width.
				items-start keeps the top row from stretching to equal height. -->
			<div class="space-y-6">
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
					<div id="font" class="scroll-mt-6">
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
					</div>

					<div id="color" class="scroll-mt-6">
						<SectionCard
							icon="i-lucide-palette"
							title="Colour"
							subtitle="The accent used for the header rule and highlights on your generated PDFs. Independent of the app's theme colour."
						>
							<!-- One row of eight, matching the Theme colour picker on
								/settings/appearance. This column is half-width, so the
								swatch is a notch smaller and the label truncates: at the
								narrow end of `lg` the cells drop to ~40px, and "Emerald"
								at text-xs would otherwise spill into its neighbour. The
								full name stays available via the button's title tooltip. -->
							<div class="grid grid-cols-8 gap-1.5">
								<button
									v-for="c in colors"
									:key="c.value"
									type="button"
									class="group flex flex-col items-center gap-1.5 min-w-0"
									:title="c.label"
									@click="form.pdf_theme_color = c.value"
								>
									<span
										class="size-9 rounded-full border-2 transition shrink-0"
										:class="form.pdf_theme_color === c.value ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) group-hover:border-(--ui-text-muted)'"
										:style="{ backgroundColor: c.hex }"
									/>
									<span
										class="text-[10px] w-full text-center truncate"
										:class="form.pdf_theme_color === c.value ? 'text-(--ui-text) font-medium' : 'text-(--ui-text-muted)'"
									>
										{{ c.label }}
									</span>
								</button>
							</div>
						</SectionCard>
					</div>
				</div>

				<div id="header-logo" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-image"
						title="Header logo"
						subtitle="Letterhead-style PNG, JPG, or SVG. Different from the square Company logo, which is only used in the sidebar."
					>
						<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-6 items-start">
							<div class="flex flex-col gap-3">
								<div
									class="group relative h-28 w-full rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition cursor-pointer"
									:class="[
										pdfLogoDragOver
											? 'border-(--ui-primary) bg-white scale-[1.01]'
											: 'border-(--ui-border-accented) bg-white hover:border-(--ui-primary)/60'
									]"
									role="button"
									tabindex="0"
									aria-label="Upload PDF header logo"
									@click="pickPdfLogo"
									@keydown.enter.prevent="pickPdfLogo"
									@keydown.space.prevent="pickPdfLogo"
									@dragover.prevent="pdfLogoDragOver = true"
									@dragenter.prevent="pdfLogoDragOver = true"
									@dragleave.prevent="pdfLogoDragOver = false"
									@drop.prevent="onPdfLogoDrop"
								>
									<input
										ref="pdfLogoInput"
										type="file"
										accept="image/png,image/jpeg,image/webp,image/svg+xml"
										class="hidden"
										@change="onPdfLogoFileChange"
									>
									<img
										v-if="store.pdfHeaderLogoSrc"
										:src="store.pdfHeaderLogoSrc"
										alt="PDF header logo"
										class="max-w-full max-h-full object-contain p-3"
									>
									<!-- Fixed zinc hint: the tile is white in both themes (it
									previews against the PDF's actual background), so the
									theme-reactive muted token would vanish in dark mode. -->
									<div v-else class="flex flex-col items-center gap-1 text-zinc-400">
										<UIcon name="i-lucide-image-up" class="size-7" />
										<div class="text-[10px] uppercase tracking-wider">
											Drop wide logo
										</div>
									</div>
									<div
										v-if="store.pdfHeaderLogoSrc"
										class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100"
									>
										<UIcon name="i-lucide-upload" class="size-5 text-white" />
										<span class="text-[10px] uppercase tracking-wider text-white">
											Replace
										</span>
									</div>
								</div>
								<div class="flex flex-wrap items-center gap-2">
									<UButton
										v-if="!store.settings?.pdf_header_logo_path"
										icon="i-lucide-upload"
										size="xs"
										variant="soft"
										@click="pickPdfLogo"
									>
										Upload header
									</UButton>
									<template v-else>
										<UButton icon="i-lucide-upload" size="xs" variant="soft" @click="pickPdfLogo">
											Replace
										</UButton>
										<UButton
											v-if="!isSvgLogo"
											icon="i-lucide-crop"
											size="xs"
											variant="soft"
											color="neutral"
											@click="openRecrop"
										>
											Re-crop
										</UButton>
										<UButton
											icon="i-lucide-eye"
											size="xs"
											variant="soft"
											color="neutral"
											:loading="invoicePreview.state.rendering"
											@click="invoicePreview.open()"
										>
											Preview on PDF
										</UButton>
										<UButton
											icon="i-lucide-trash-2"
											size="xs"
											variant="ghost"
											color="neutral"
											@click="removePdfLogo"
										>
											Remove
										</UButton>
									</template>
									<span v-if="pdfLogoFileName" class="text-xs text-(--ui-text-muted) truncate">
										{{ pdfLogoFileName }}
									</span>
								</div>

								<div>
									<div class="flex items-baseline justify-between mb-1.5 gap-2 flex-wrap">
										<span class="text-sm font-medium">Logo size</span>
										<span class="text-xs text-(--ui-text-muted) tabular-nums">
											{{ form.pdf_logo_scale }}% — prints ≈ {{ previewLogoMm.h.toFixed(1) }}mm tall
										</span>
									</div>
									<USlider v-model="form.pdf_logo_scale" :min="50" :max="150" :step="5" />
									<p v-if="previewClamped" class="text-xs text-(--ui-text-muted) mt-2 flex items-start gap-1.5">
										<UIcon name="i-lucide-info" class="size-3.5 shrink-0 mt-0.5" />
										<span>Capped at 55mm wide so the logo can't collide with the document title — growing the size won't widen it further.</span>
									</p>
								</div>
							</div>

							<!-- Live A4 preview. Reads the form, not the saved settings, so
							the slider and colour take effect immediately. Only the top
							band is shown — the header is what's being tuned here. -->
							<div class="justify-self-center lg:justify-self-end">
								<div
									class="relative rounded-md ring-1 ring-(--ui-border) bg-white overflow-hidden shadow-sm"
									:style="{ width: `${PAPER_W_PX}px`, height: `${mmPx(105)}px` }"
								>
									<div :style="{ padding: `${mmPx(16)}px ${mmPx(18)}px 0` }">
										<div class="flex justify-end items-end" :style="{ height: `${mmPx(18)}px` }">
											<img
												v-if="store.pdfHeaderLogoSrc"
												:src="store.pdfHeaderLogoSrc"
												alt=""
												:style="previewLogoStyle"
												class="object-contain"
												@load="onPreviewLogoLoad"
											>
											<span
												v-else
												class="font-bold text-zinc-800 leading-none"
												:style="{ fontSize: `${mmPx(5)}px` }"
											>
												{{ store.settings?.business_name || "Your business" }}
											</span>
										</div>
										<div :style="{ height: `${mmPx(2)}px` }" />
										<div :style="{ height: '2px', backgroundColor: themeColor }" />
										<!-- Skeleton body: conveys where the header sits relative
										to the rest of the page without pretending to be real. -->
										<div :style="{ marginTop: `${mmPx(6)}px` }" class="flex justify-center">
											<div class="rounded-sm bg-zinc-300" :style="{ width: `${mmPx(30)}px`, height: `${mmPx(3.5)}px` }" />
										</div>
										<div :style="{ marginTop: `${mmPx(7)}px` }" class="flex justify-between">
											<div class="space-y-1">
												<div class="rounded-sm bg-zinc-200" :style="{ width: `${mmPx(28)}px`, height: `${mmPx(1.8)}px` }" />
												<div class="rounded-sm bg-zinc-200" :style="{ width: `${mmPx(22)}px`, height: `${mmPx(1.8)}px` }" />
											</div>
											<div class="space-y-1 flex flex-col items-end">
												<div class="rounded-sm bg-zinc-200" :style="{ width: `${mmPx(20)}px`, height: `${mmPx(1.8)}px` }" />
												<div class="rounded-sm bg-zinc-200" :style="{ width: `${mmPx(16)}px`, height: `${mmPx(1.8)}px` }" />
											</div>
										</div>
										<div :style="{ marginTop: `${mmPx(7)}px` }" class="space-y-1">
											<div class="rounded-sm bg-zinc-100" :style="{ height: `${mmPx(4)}px` }" />
											<div class="rounded-sm bg-zinc-200" :style="{ height: `${mmPx(2.6)}px` }" />
											<div class="rounded-sm bg-zinc-200" :style="{ height: `${mmPx(2.6)}px` }" />
										</div>
									</div>
									<!-- Fade to signal the page continues below the crop. -->
									<div class="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white" />
								</div>
								<div class="mt-1.5 text-[10px] uppercase tracking-wider text-(--ui-text-muted) text-center">
									A4 preview · classic
								</div>
							</div>
						</div>
					</SectionCard>
				</div>

				<div id="templates" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-layout-template"
						title="Templates"
						subtitle="Pick one layout for your quote, invoice, bill, and payslip PDFs. Your theme colour, font, and header logo apply to every template — only the layout changes."
					>
						<FeatureLock
							v-if="!entitledToTemplates"
							title="PDF templates"
							tier-label="Plus"
							feature="pdf_templates"
						/>

						<div>
							<div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
								<div class="text-sm font-medium">
									PDF template
								</div>
								<div class="flex items-center gap-2">
									<UButton
										size="xs"
										variant="soft"
										icon="i-lucide-eye"
										:loading="invoicePreview.state.rendering"
										@click="invoicePreview.open()"
									>
										Invoice
									</UButton>
									<UButton
										size="xs"
										variant="soft"
										icon="i-lucide-eye"
										:loading="quotePreview.state.rendering"
										@click="quotePreview.open()"
									>
										Quote
									</UButton>
									<UButton
										size="xs"
										variant="soft"
										icon="i-lucide-eye"
										:loading="payslipPreview.state.rendering"
										@click="payslipPreview.open()"
									>
										Payslip
									</UButton>
								</div>
							</div>
							<div class="grid grid-cols-5 gap-3">
								<button
									v-for="t in TEMPLATES"
									:key="t.key"
									type="button"
									:disabled="!canPick(t.key)"
									:title="t.description"
									class="p-2 rounded-md border text-left transition"
									:class="[
										form.pdf_template === t.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)',
										canPick(t.key) ? 'cursor-pointer hover:border-(--ui-primary)/50' : 'opacity-50 cursor-not-allowed'
									]"
									@click="form.pdf_template = t.key"
								>
									<div class="rounded-sm overflow-hidden ring-1 ring-(--ui-border) mb-1.5">
										<PdfTemplateThumb :template-key="t.key" :color="themeColor" />
									</div>
									<div class="text-xs font-medium flex items-center gap-1">
										{{ t.label }}
										<UIcon v-if="!canPick(t.key)" name="i-lucide-lock" class="size-3 text-(--ui-text-muted)" />
									</div>
								</button>
							</div>
						</div>
					</SectionCard>
				</div>

				<!-- Not a SectionCard: this is a signpost to the Security page, not a
					setting you change here. A compact row keeps it from reading as
					another block of PDF configuration. -->
				<div class="flex items-start gap-3 rounded-md border border-(--ui-border) bg-(--ui-bg-muted) px-4 py-3">
					<UIcon name="i-lucide-shield-check" class="size-5 text-(--ui-text-muted) shrink-0 mt-0.5" />
					<!-- Button sits inside the text column, below the copy, so it stays
						next to what it refers to. On a full-width row a right-floated
						button ends up marooned an inch away from its own label. -->
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

			<!-- Sticky save bar — same shape as the one on /settings/company.
				Only appears when textarea contents differ from the loaded
				settings; logo upload/remove writes immediately so the user
				doesn't have to chase a save button afterwards. -->
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
							:disabled="store.saving || !dirty"
							@click="onDiscard"
						>
							Discard
						</UButton>
						<UButton
							:loading="store.saving"
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

		<PdfPreviewModal
			v-model:open="invoicePreview.state.open"
			:asset-url="invoicePreview.state.assetUrl"
			:temp-path="invoicePreview.state.tempPath"
			:suggested-file-name="invoicePreview.state.suggestedFileName"
			:saving="invoicePreview.state.saving"
			title="Invoice template preview"
			@save="invoicePreview.onSave"
			@cancel="invoicePreview.onCancel"
		/>
		<PdfPreviewModal
			v-model:open="quotePreview.state.open"
			:asset-url="quotePreview.state.assetUrl"
			:temp-path="quotePreview.state.tempPath"
			:suggested-file-name="quotePreview.state.suggestedFileName"
			:saving="quotePreview.state.saving"
			title="Quote template preview"
			@save="quotePreview.onSave"
			@cancel="quotePreview.onCancel"
		/>
		<PdfPreviewModal
			v-model:open="payslipPreview.state.open"
			:asset-url="payslipPreview.state.assetUrl"
			:temp-path="payslipPreview.state.tempPath"
			:suggested-file-name="payslipPreview.state.suggestedFileName"
			:saving="payslipPreview.state.saving"
			title="Payslip template preview"
			@save="payslipPreview.onSave"
			@cancel="payslipPreview.onCancel"
		/>
		<ImageCropModal
			v-model:open="cropOpen"
			:image-blob="cropBlob"
			:initial-rect="cropInitial"
			:source-note="cropSourceNote"
			@cropped="onCropped"
			@cancel="onCropCancel"
		/>
	</div>
</template>

<script setup lang="ts">
	import type { CropRect } from "~/lib/crop-rect";
	import type { CompanySettingsRow, SettingsUpdate } from "~/stores/settings";
	import { invoke } from "@tauri-apps/api/core";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { BUNDLED_FONTS, isBundledFont } from "~/lib/fonts";
	import { PDF_TEMPLATES } from "~/lib/pdf-templates";
	import { sampleInvoicePayload, samplePayslipPayload, sampleQuotePayload } from "~/lib/sample-pdf";
	import { THEME_COLORS, themeHex } from "~/lib/theme";
	import { useLicenseStore } from "~/stores/license";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ title: "PDF" });

	const store = useSettingsStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	// Only the PDF-flavoured fields live on this page. Logo paths are kept on
	// the form so dirty-tracking can spot a removal/upload that would otherwise
	// only mutate the store. (Document protection moved to /settings/security.)
	type PdfForm = Pick<SettingsUpdate, "pdf_header_logo_path" | "pdf_font" | "pdf_theme_color" | "pdf_template" | "pdf_logo_scale">;

	const form = reactive<PdfForm>({
		pdf_header_logo_path: null,
		pdf_font: "Akt",
		pdf_theme_color: "green",
		pdf_template: "classic",
		pdf_logo_scale: 100
	});

	// PDF templates are a Plus feature. Basic users see the pickers but can
	// only select Classic; rendering also forces Classic when not entitled.
	const license = useLicenseStore();
	const entitledToTemplates = computed(() => license.hasFeature("pdf_templates"));
	const currency = useActiveCurrency();
	const TEMPLATES = PDF_TEMPLATES;
	const canPick = (key: string) => entitledToTemplates.value || key === "classic";
	const colors = THEME_COLORS;
	// Accent colour for the schematic thumbnails — tracks the live (unsaved)
	// PDF colour selection so picking a swatch updates the previews instantly.
	const themeColor = computed(() => themeHex(form.pdf_theme_color));

	// ---- live paper preview --------------------------------------------
	// A scaled A4 sheet rendered from the LIVE form values, so the logo size
	// slider shows its effect without saving. Geometry mirrors doc-classic:
	// 210mm wide, 18mm side margins, 16mm top, 12mm baseline logo height,
	// and the same 55mm width clamp header-logo() applies in common.typ.
	// Only the top band is shown — the header is what's being tuned.
	const PAPER_W_PX = 300;
	const PAPER_MM = 210;
	const mmPx = (mm: number) => (mm * PAPER_W_PX) / PAPER_MM;

	// Natural aspect of the uploaded logo, needed to derive width from height
	// exactly as measure() does in Typst. 4:1 is a placeholder until it loads.
	const logoAspect = ref(4);
	const onPreviewLogoLoad = (e: Event) => {
		const el = e.target as HTMLImageElement;
		if (el.naturalWidth > 0 && el.naturalHeight > 0) {
			logoAspect.value = el.naturalWidth / el.naturalHeight;
		}
	};

	// Same clamp as header-logo(data, 12mm): scale the baseline, then if the
	// derived width exceeds 55mm, shrink both axes to fit.
	const previewLogoMm = computed(() => {
		let h = 12 * (form.pdf_logo_scale / 100);
		let w = h * logoAspect.value;
		if (w > 55) {
			h = h * (55 / w);
			w = 55;
		}
		return { w, h };
	});
	const previewLogoStyle = computed(() => ({
		width: `${mmPx(previewLogoMm.value.w)}px`,
		height: `${mmPx(previewLogoMm.value.h)}px`
	}));
	const previewClamped = computed(() => 12 * (form.pdf_logo_scale / 100) * logoAspect.value > 55);

	// Live preview: render a sample invoice / quote with the currently-selected
	// template through the real Typst pipeline (PdfPreviewModal).
	// The whole point of a preview is to see edits BEFORE saving them. The
	// sample*Payload builders read font / colour / logo scale off the settings
	// row, which only updates on save — so overlay the live form values on top.
	// (The template key is already passed separately, which is why it was the
	// one control that appeared to work.)
	const previewSettings = computed<CompanySettingsRow | null>(() => (store.settings
		? {
			...store.settings,
			pdf_font: form.pdf_font,
			pdf_theme_color: form.pdf_theme_color,
			pdf_logo_scale: form.pdf_logo_scale
		}
		: null));

	const invoicePreview = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => sampleInvoicePayload(previewSettings.value, currency.value, form.pdf_template),
		fileName: () => "sample-invoice.pdf",
		title: "Invoice template preview"
	});
	const quotePreview = usePdfPreview({
		command: "export_quote_pdf",
		buildPayload: () => sampleQuotePayload(previewSettings.value, currency.value, form.pdf_template),
		fileName: () => "sample-quote.pdf",
		title: "Quote template preview"
	});
	const payslipPreview = usePdfPreview({
		command: "export_payslip_pdf",
		buildPayload: () => samplePayslipPayload(previewSettings.value, currency.value, form.pdf_template),
		fileName: () => "sample-payslip.pdf",
		title: "Payslip template preview"
	});

	// Same curated list the Appearance page used. The Typst template falls
	// through these for any missing glyph; free-text input lets the user pick
	// any face installed on their machine, but only the bundled faces are
	// guaranteed to render identically across machines. Iosevka Charon Mono
	// is the bundled monospace (good for figure-aligned numbers).
	// Grouped options for the font dropdown. NuxtUI 4 renders an array of
	// arrays as separate ComboboxGroups, and `type: "label"` rows as inert
	// group headings (they're excluded from filtering and selection).
	//
	// A stored pdf_font that isn't bundled — from back when this was a
	// free-text field — is preserved as its own "(custom)" group so that
	// opening this page never silently rewrites someone's PDF typeface.
	// Once they pick a bundled face, the custom row disappears.
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

	const pdfPreviewFontStack = computed(() =>
		`'${form.pdf_font || "Akt"}', 'Akt', 'Inter', serif`
	);

	const hydrate = () => {
		const s = store.settings;
		if (!s) return;
		form.pdf_header_logo_path = s.pdf_header_logo_path;
		form.pdf_font = s.pdf_font || "Akt";
		// Fall back to the UI theme colour for businesses that predate the
		// split (0039 seeds it, but a defensive fallback keeps a null safe).
		form.pdf_theme_color = s.pdf_theme_color ?? s.theme_color ?? "green";
		form.pdf_template = s.pdf_template || "classic";
		form.pdf_logo_scale = s.pdf_logo_scale ?? 100;
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

	const onSubmit = async () => {
		try {
			await store.save({
				pdf_font: form.pdf_font.trim() || "Akt",
				pdf_theme_color: form.pdf_theme_color,
				pdf_template: form.pdf_template,
				pdf_logo_scale: form.pdf_logo_scale
			});
			refreshBaseline();
			toast.add({ title: "PDF settings saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Save failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onDiscard = () => {
		hydrate();
		refreshBaseline();
		toast.add({
			title: "Changes discarded",
			color: "info",
			icon: "i-lucide-rotate-ccw"
		});
	};

	// ----- PDF header logo handling --------------------------------------------
	// Writes into pdf-headers/ under app data so the wide image doesn't stomp
	// the square identity logo in logos/. Crucially we do NOT touch
	// tenants.json — that registry is only for the sidebar / tenant switcher,
	// which uses the identity logo.

	const pdfLogoInput = useTemplateRef<HTMLInputElement>("pdfLogoInput");
	const pdfLogoDragOver = ref(false);
	const pickPdfLogo = () => pdfLogoInput.value?.click();

	const pdfLogoFileName = computed(() => {
		const p = store.settings?.pdf_header_logo_path;
		if (!p) return null;
		return p.split(/[\\/]/).pop() ?? p;
	});

	// ---- crop flow (migration 0051) ------------------------------------
	// Raster uploads keep the untouched original (pdf-header-original.<ext>)
	// and open the crop modal; the crop writes the pdf-header.<ext>
	// derivative the PDFs render. SVG bypasses cropping entirely — it would
	// rasterise a vector exactly where sharpness matters most (print).
	const cropOpen = ref(false);
	const cropBlob = ref<Blob | null>(null);
	const cropInitial = ref<CropRect | null>(null);
	const cropSourceNote = ref<string | undefined>(undefined);
	// Extension of the source being cropped; the derivative is always PNG.
	const cropExt = ref("png");
	// True while the open crop modal belongs to a just-uploaded file (as
	// opposed to a Re-crop of an existing logo).
	const freshUpload = ref(false);

	const isSvgLogo = computed(() =>
		(store.settings?.pdf_header_logo_path ?? "").toLowerCase().endsWith(".svg"));

	const parseCropRect = (json: string | null): CropRect | null => {
		if (!json) return null;
		try {
			const r = JSON.parse(json) as CropRect;
			return Number.isFinite(r.x) && Number.isFinite(r.y) && r.w > 0 && r.h > 0 ? r : null;
		} catch {
			return null;
		}
	};

	// Save the derivative the PDFs render. The wide letterhead lives at the
	// business-folder root as pdf-header.<ext>, written by the Rust
	// `save_business_asset` command (std::fs, unscoped) so it works on any
	// drive the folder lives on.
	const saveDerivative = async (bytes: number[], ext: string, cropJson: string | null) => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) return;
		const target = await invoke<string>("save_business_asset", {
			id: tenantId,
			kind: "pdf-header",
			ext,
			bytes
		});
		await store.save({ pdf_header_logo_path: target, pdf_logo_crop: cropJson });
		form.pdf_header_logo_path = target;
		refreshBaseline();
	};

	const uploadPdfLogo = async (file: File) => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) {
			toast.add({ title: "No active business", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}

		try {
			const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
			const ext = (file.name.split(".").pop() ?? "png").toLowerCase();

			if (ext === "svg") {
				// Vector: save straight through — cropping would rasterise it.
				await saveDerivative(bytes, ext, null);
				toast.add({ title: "PDF header updated", color: "success", icon: "i-lucide-check" });
				return;
			}

			// Raster: keep the untouched original, then offer the crop.
			await invoke<string>("save_business_asset", {
				id: tenantId,
				kind: "pdf-header-original",
				ext,
				bytes
			});
			cropExt.value = ext;
			cropBlob.value = new Blob([new Uint8Array(bytes)], { type: file.type || "image/png" });
			cropInitial.value = null;
			cropSourceNote.value = undefined;
			freshUpload.value = true;
			cropOpen.value = true;
		} catch (err) {
			toast.add({
				title: "PDF header upload failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onCropped = async (rect: CropRect, blob: Blob) => {
		try {
			const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
			await saveDerivative(bytes, "png", JSON.stringify(rect));
			toast.add({ title: "PDF header updated", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Crop failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onCropCancel = async () => {
		// Only a FRESH upload needs the fallback save — the file must not be
		// lost just because the user skipped cropping. Cancelling a re-crop
		// leaves the existing derivative alone.
		if (!cropBlob.value || !freshUpload.value) return;
		try {
			const bytes = Array.from(new Uint8Array(await cropBlob.value.arrayBuffer()));
			await saveDerivative(bytes, cropExt.value, null);
			toast.add({ title: "PDF header saved (uncropped)", color: "info", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "PDF header upload failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const openRecrop = async () => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) return;
		freshUpload.value = false;
		try {
			let ext = "png";
			let bytes: number[] = [];
			try {
				[ext, bytes] = await invoke<[string, number[]]>("read_business_asset", { id: tenantId, kind: "pdf-header-original" });
				cropSourceNote.value = undefined;
			} catch {
				// Original missing (pre-feature upload): crop the derivative itself.
				[ext, bytes] = await invoke<[string, number[]]>("read_business_asset", { id: tenantId, kind: "pdf-header" });
				cropSourceNote.value = "Original file not found — cropping the current header image instead.";
			}
			cropExt.value = ext;
			cropBlob.value = new Blob([new Uint8Array(bytes)], { type: `image/${ext === "jpg" ? "jpeg" : ext}` });
			cropInitial.value = cropSourceNote.value ? null : parseCropRect(store.settings?.pdf_logo_crop ?? null);
			cropOpen.value = true;
		} catch (err) {
			toast.add({
				title: "Couldn't open crop",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onPdfLogoFileChange = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) await uploadPdfLogo(file);
	};

	const onPdfLogoDrop = async (event: DragEvent) => {
		pdfLogoDragOver.value = false;
		const file = event.dataTransfer?.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.add({
				title: "Only image files are accepted",
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		await uploadPdfLogo(file);
	};

	const removePdfLogo = async () => {
		await store.save({ pdf_header_logo_path: null, pdf_logo_crop: null });
		form.pdf_header_logo_path = null;
		refreshBaseline();
		toast.add({ title: "PDF header removed", color: "info", icon: "i-lucide-image-off" });
	};
</script>
