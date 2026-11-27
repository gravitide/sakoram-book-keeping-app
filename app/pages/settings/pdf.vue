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
				The page, its stationery and the font of every PDF you generate.
			</p>
		</header>

		<UForm
			:state="form"
			class="max-w-5xl mx-auto"
			@submit="onSubmit"
		>
			<!-- One top-down flow: the Page (paper, live preview, Stationery mode),
				then the picked mode's own options, then the Font. Each of the three
				is a sidebar anchor in app/layouts/default.vue (ids and the mode
				headings: app/lib/pdf-settings-sections.ts) — a new card goes inside
				one of them, never between. -->
			<div class="space-y-8">
				<section :id="PDF_SECTION_IDS.page" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-file"
						title="Page"
						subtitle="The sheet every PDF is printed on, and what's printed around its content — quotes, invoices, bills, vouchers, payslips, statements, reports and letters."
					>
						<!-- Page 1 of the sample invoice on the left, rendered by Typst from
							the live (unsaved) form ~500 ms after the last change
							(useLivePagePreview), with the drawn page as the fallback if a
							render fails. The controls sit on the right — and come first
							below sm, so a narrow window leads with what you act on. -->
						<div class="flex flex-col sm:flex-row items-start gap-6">
							<div class="order-2 sm:order-1 shrink-0 self-center sm:self-start" :style="{ width: `${PREVIEW_W_PX}px` }">
								<StationeryPage
									v-if="livePreview.error.value"
									class="rounded-sm ring-1 ring-(--ui-border) shadow-sm"
									:paper="paperKey"
									:mode="form.pdf_stationery_mode"
									:layout="form.pdf_layout"
									:margins="activeStationeryMargins"
									:scale="scaleForWidth(resolvePaperSize(paperKey), PREVIEW_W_PX)"
									:artwork-url="artwork.url.value"
									:artwork-ext="artwork.ext.value"
									:images="thumbnailImages"
									compact
								/>
								<div
									v-else
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
										<UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-zinc-400" />
									</div>
								</div>
								<p v-if="livePreview.error.value" class="mt-2 text-xs text-(--ui-text-muted)">
									{{ paperLabel }}. Couldn't render the preview, so this is a drawing of the page.
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
										Margins follow the paper's width; text stays the same size.
									</p>
									<div class="grid grid-cols-2 @lg:grid-cols-4 gap-2" role="group" aria-labelledby="pdf-paper-label">
										<button
											v-for="p in PAPER_SIZES"
											:key="p.key"
											type="button"
											class="px-3 py-2 rounded-md border text-left transition cursor-pointer hover:border-(--ui-primary)/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
											:class="[
												form.pdf_paper_size === p.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)'
											]"
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

								<div>
									<div id="pdf-stationery-label" class="text-sm font-medium">
										Stationery
									</div>
									<p class="text-xs text-(--ui-text-muted) mt-0.5 mb-2">
										What's printed around the content of every page. Its options follow below.
									</p>
									<div class="flex flex-col gap-1.5" role="group" aria-labelledby="pdf-stationery-label">
										<button
											v-for="m in STATIONERY_MODES"
											:key="m.key"
											type="button"
											class="flex items-start gap-2.5 w-full px-3 py-2.5 rounded-md border text-left transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
											:class="form.pdf_stationery_mode === m.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border) hover:border-(--ui-border-accented)'"
											:aria-pressed="form.pdf_stationery_mode === m.key"
											@click="form.pdf_stationery_mode = m.key"
										>
											<span
												class="mt-0.5 size-3.5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center"
												:class="form.pdf_stationery_mode === m.key ? 'border-(--ui-primary)' : 'border-(--ui-border-accented)'"
												aria-hidden="true"
											>
												<span v-if="form.pdf_stationery_mode === m.key" class="size-1.5 rounded-full bg-(--ui-primary)" />
											</span>
											<span class="min-w-0">
												<span class="block text-sm font-medium">{{ m.label }}</span>
												<span class="block text-xs text-(--ui-text-muted) mt-0.5">{{ m.description }}</span>
											</span>
										</button>
									</div>
								</div>
							</div>
						</div>
					</SectionCard>
				</section>

				<!-- The picked mode's options. Every other mode's settings stay on the
					form (hidden, never cleared), so switching back restores them
					untouched. A mode switch swaps the whole section with a short fade
					(none under prefers-reduced-motion) and never scrolls. -->
				<section :id="PDF_SECTION_IDS.options" class="scroll-mt-6" aria-labelledby="pdf-mode-options-heading">
					<Transition
						mode="out-in"
						enter-active-class="transition-opacity duration-150 ease-out motion-reduce:transition-none"
						enter-from-class="opacity-0"
						leave-active-class="transition-opacity duration-100 ease-in motion-reduce:transition-none"
						leave-to-class="opacity-0"
					>
						<div :key="form.pdf_stationery_mode" class="space-y-4">
							<div class="px-1">
								<h2 id="pdf-mode-options-heading" class="text-base font-semibold text-balance">
									{{ modeOptions.heading }}
								</h2>
								<p class="text-xs text-(--ui-text-muted) mt-0.5">
									{{ modeOptions.blurb }}
								</p>
							</div>

							<template v-if="form.pdf_stationery_mode === 'builtin'">
								<!-- Layout is a Built-in choice only (ADR 0001 amendment): every
									other Stationery renders Classic (page-settings.ts
									buildLayoutAndPage). The stored pick is kept meanwhile. -->
								<SectionCard
									icon="i-lucide-layout-template"
									title="Look"
									subtitle="How your quotes, invoices, bills and payslips arrange their content on the page, and the accent colour they're drawn in."
								>
									<div>
										<div id="pdf-layout-label" class="text-sm font-medium mb-2">
											Layout
										</div>
										<div class="grid grid-cols-2 sm:grid-cols-4 gap-3" role="group" aria-labelledby="pdf-layout-label">
											<button
												v-for="l in PDF_LAYOUTS"
												:key="l.key"
												type="button"
												:title="l.description"
												class="p-2 rounded-md border text-left transition cursor-pointer hover:border-(--ui-primary)/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
												:class="[
													form.pdf_layout === l.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)'
												]"
												:aria-pressed="form.pdf_layout === l.key"
												@click="form.pdf_layout = l.key"
											>
												<div class="rounded-sm overflow-hidden ring-1 ring-(--ui-border) mb-1.5">
													<PdfLayoutThumb :layout-key="l.key" :color="themeColor" />
												</div>
												<div class="text-xs font-medium flex items-center gap-1">
													{{ l.label }}
												</div>
											</button>
										</div>
									</div>
									<div class="pt-4 border-t border-(--ui-border)">
										<PdfColorRow v-model="form.pdf_theme_color" />
									</div>
								</SectionCard>

								<SectionCard
									icon="i-lucide-image"
									title="Header logo"
									subtitle="Letterhead-style PNG, JPG, or SVG. Different from the square Company logo, which is only used in the sidebar."
								>
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
													icon="i-lucide-trash-2"
													size="xs"
													variant="ghost"
													color="neutral"
													@click="removePdfLogo"
												>
													Remove
												</UButton>
											</template>
										</div>

										<div>
											<div class="flex items-baseline justify-between mb-1.5 gap-2 flex-wrap">
												<span class="text-sm font-medium">Logo size</span>
												<span class="text-xs text-(--ui-text-muted) tabular-nums">
													{{ form.pdf_logo_scale }}% — prints ≈ {{ logoPrintMm.h.toFixed(1) }}mm tall
												</span>
											</div>
											<USlider v-model="form.pdf_logo_scale" :min="50" :max="150" :step="5" />
											<p v-if="logoWidthClamped" class="text-xs text-(--ui-text-muted) mt-2 flex items-start gap-1.5">
												<UIcon name="i-lucide-info" class="size-3.5 shrink-0 mt-0.5" />
												<span>Capped at 55mm wide so the logo can't collide with the document title — growing the size won't widen it further.</span>
											</p>
										</div>
									</div>
								</SectionCard>

								<SectionCard
									icon="i-lucide-panel-top"
									title="Header &amp; footer text"
									subtitle="Print your own details instead of the built-in header block and footer line. Use fields like {business_name} so the text follows Business details instead of going stale."
								>
									<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
										<div>
											<div class="flex items-center justify-between gap-2 mb-2">
												<div class="text-sm font-medium">
													Header text
												</div>
												<div class="flex items-center gap-2">
													<UDropdownMenu :items="tokenItems('header')">
														<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-braces" :disabled="!headerCustom">
															Insert field
														</UButton>
													</UDropdownMenu>
													<USwitch v-model="headerCustom" aria-label="Use custom header text" />
												</div>
											</div>
											<div :class="headerCustom ? '' : 'opacity-50 pointer-events-none'">
												<RichTextEditor ref="headerEditor" v-model="headerTextModel" minimal :min-height="120" />
											</div>
											<p class="text-xs text-(--ui-text-muted) mt-2">
												Prints opposite the logo.
											</p>
										</div>

										<div>
											<div class="flex items-center justify-between gap-2 mb-2">
												<div class="text-sm font-medium">
													Footer text
												</div>
												<div class="flex items-center gap-2">
													<UDropdownMenu :items="tokenItems('footer')">
														<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-braces" :disabled="!footerCustom">
															Insert field
														</UButton>
													</UDropdownMenu>
													<USwitch v-model="footerCustom" aria-label="Use custom footer text" />
												</div>
											</div>
											<div :class="footerCustom ? '' : 'opacity-50 pointer-events-none'">
												<RichTextEditor ref="footerEditor" v-model="footerTextModel" minimal :min-height="120" />
											</div>
											<p class="text-xs text-(--ui-text-muted) mt-2">
												Replaces the business name · website · phone line at the bottom of every page. Limited to 3 paragraphs so it can't crowd the page.
											</p>
										</div>
									</div>
								</SectionCard>
							</template>

							<!-- Full-page background: artwork, its Safe area (in the editor) and
								the colour. -->
							<StationeryBackgroundCard
								v-else-if="form.pdf_stationery_mode === 'background'"
								:paper="paperKey"
								:review="stationeryCheck.background"
								:locked="artworkLock"
								@artwork="onBackgroundArtwork"
							>
								<StationeryAdjustRow
									heading="Safe area"
									label="Adjust margins &amp; placement"
									:summary="safeAreaSummary(activeStationeryMargins)"
									summary-title="Top / right / bottom / left"
									:attention="activeModeNeedsCheck"
									@adjust="openEditor"
								/>
								<PdfColorRow v-model="form.pdf_theme_color" :hint="COLOR_HINT" />
							</StationeryBackgroundCard>

							<StationeryHeaderFooterCard
								v-else-if="form.pdf_stationery_mode === 'header_footer'"
								:paper="paperKey"
								:margins="activeStationeryMargins"
								:rects="form.header_footer_images"
								:review="stationeryCheck"
								:locked="artworkLock"
								@placed="onImagePlaced"
							>
								<StationeryAdjustRow
									heading="Safe area"
									label="Adjust margins &amp; placement"
									:summary="safeAreaSummary(activeStationeryMargins)"
									summary-title="Top / right / bottom / left"
									:attention="activeModeNeedsCheck"
									@adjust="openEditor"
								/>
								<PdfColorRow v-model="form.pdf_theme_color" :hint="COLOR_HINT" />
							</StationeryHeaderFooterCard>

							<!-- Pre-printed paper: the business-wide bands (shared with
								pre-printed letters — Settings → Letters edits the same ones). -->
							<SectionCard
								v-else
								icon="i-lucide-printer"
								title="Pre-printed paper"
								subtitle="Your letterhead is already printed on the paper, so nothing prints in its bands and the content keeps clear of them."
							>
								<div class="space-y-2">
									<StationeryAdjustRow
										label="Adjust bands"
										:summary="preprintedBandSummary(form.preprinted_margins)"
										:attention="activeModeNeedsCheck"
										@adjust="openEditor"
									/>
									<p class="text-xs text-(--ui-text-muted)">
										Letters set to pre-printed paper use these bands too.
									</p>
								</div>
								<div class="pt-4 border-t border-(--ui-border)">
									<PdfColorRow v-model="form.pdf_theme_color" :hint="COLOR_HINT" />
								</div>
							</SectionCard>
						</div>
					</Transition>
				</section>

				<StationeryEditorModal
					v-model:open="editorOpen"
					v-model:margins="activeStationeryMargins"
					v-model:images="form.header_footer_images"
					:mode="form.pdf_stationery_mode"
					:paper="paperKey"
					:settings="previewSettings"
					@applied="onStationeryApplied"
				/>

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
			v-model:open="samplePreview.state.open"
			:asset-url="samplePreview.state.assetUrl"
			:temp-path="samplePreview.state.tempPath"
			:suggested-file-name="samplePreview.state.suggestedFileName"
			:saving="samplePreview.state.saving"
			title="Sample invoice"
			@save="samplePreview.onSave"
			@cancel="samplePreview.onCancel"
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
	import type { PaperSize } from "~/lib/page-settings";
	import type { PdfLayoutKey } from "~/lib/pdf-layouts";
	import type { HeaderFooterSlot, StationeryMarginsMm, StationeryMode } from "~/lib/stationery";
	import type { HeaderFooterRects, MmRect, PageImageView, PaperGeometry } from "~/lib/stationery-geometry";
	import type { CompanySettingsRow, SettingsUpdate } from "~/stores/settings";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { useLivePagePreview } from "~/composables/useLivePagePreview";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { usePdfSettingsMode } from "~/composables/usePdfSettingsMode";
	import { useStationeryArtwork } from "~/composables/useStationeryArtwork";
	import { readBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
	import { BUNDLED_FONTS, isBundledFont } from "~/lib/fonts";
	import { PAPER_SIZES, resolvePaperSize } from "~/lib/page-settings";
	import { PDF_LAYOUTS, resolveLayoutKey } from "~/lib/pdf-layouts";
	import { MODE_OPTIONS, PDF_SECTION_IDS, preprintedBandSummary, safeAreaSummary } from "~/lib/pdf-settings-sections";
	import { PDF_TOKENS } from "~/lib/pdf-tokens";
	import { sampleStationeryPreviewPayload } from "~/lib/sample-pdf";
	import { BACKGROUND_DEFAULT_MARGINS, confirmPaperGeometry, HEADER_FOOTER_DEFAULT_MARGINS, modeNeedsReview, paperGeometryOf, parseStationery, PREPRINTED_DEFAULT_MARGINS, resolveStationeryMode, serializeStationery, STATIONERY_MODES, stationeryReview, stationerySchema, withPaperGeometry } from "~/lib/stationery";
	import { artworkPaperLock } from "~/lib/stationery-artwork";
	import { headerFooterMargins, IMAGE_EDGE, refitPaperGeometry, scaleForWidth } from "~/lib/stationery-geometry";
	import { themeHex } from "~/lib/theme";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ title: "PDF" });

	const store = useSettingsStore();
	const tenants = useTenantsStore();
	const toast = useToast();

	// Only the PDF-flavoured fields live on this page. Logo paths are kept on
	// the form so dirty-tracking can spot a removal/upload that would otherwise
	// only mutate the store. (Document protection moved to /settings/security.)
	// The Stationery JSON column is edited as plain numbers here (Pre-printed
	// paper's two bands, the Full-page background's four margins, and Header &
	// footer images' margins and image places) and re-assembled on save on top
	// of whatever else is stored, so another mode's settings — and the
	// artwork, which saves on upload — survive.
	type PdfForm = Pick<SettingsUpdate, "pdf_header_logo_path" | "pdf_font" | "pdf_theme_color" | "pdf_paper_size" | "pdf_logo_scale" | "pdf_header_custom" | "pdf_header_text" | "pdf_footer_custom" | "pdf_footer_text"> & {
		pdf_layout: PdfLayoutKey
		// The mode the picker shows (an unknown stored value reads as Built-in).
		pdf_stationery_mode: StationeryMode
		preprinted_margins: StationeryMarginsMm
		background_margins: StationeryMarginsMm
		/** Header & footer images' own margins, as stored (each band is pushed out of its image on top). */
		header_footer_margins: StationeryMarginsMm
		header_footer_images: HeaderFooterRects
		/**
		 * The sheet each piece of artwork was placed or prepared on (null = no
		 * artwork / unknown). A Paper size change moves a scaled one along with
		 * it; one only clamped onto the new sheet keeps the old one, which is
		 * what flags it for a check in the editor (stationeryReview).
		 */
		background_paper: PaperSize | null
		header_footer_papers: { header: PaperSize | null, footer: PaperSize | null }
	};

	const form = reactive<PdfForm>({
		pdf_header_logo_path: null,
		pdf_font: "Akt",
		pdf_theme_color: "green",
		pdf_layout: "classic",
		pdf_paper_size: "a4",
		pdf_stationery_mode: "builtin",
		preprinted_margins: { ...PREPRINTED_DEFAULT_MARGINS },
		background_margins: { ...BACKGROUND_DEFAULT_MARGINS },
		header_footer_margins: { ...HEADER_FOOTER_DEFAULT_MARGINS },
		header_footer_images: { header: null, footer: null },
		background_paper: null,
		header_footer_papers: { header: null, footer: null },
		pdf_logo_scale: 100,
		pdf_header_custom: 0,
		pdf_header_text: null,
		pdf_footer_custom: 0,
		pdf_footer_text: null
	});

	// Every mode's paper-dependent geometry, as the form holds it.
	const formGeometry = (): PaperGeometry => {
		const placed = (slot: "header" | "footer") => {
			const rect = form.header_footer_images[slot];
			return rect ? { rect: { ...rect }, paper: form.header_footer_papers[slot] } : null;
		};
		return {
			preprinted: { ...form.preprinted_margins },
			background: { margins: { ...form.background_margins }, paper: form.background_paper },
			header_footer: { header: placed("header"), footer: placed("footer"), margins: { ...form.header_footer_margins } }
		};
	};
	const setFormGeometry = (g: PaperGeometry) => {
		form.preprinted_margins = { ...g.preprinted };
		form.background_margins = { ...g.background.margins };
		form.background_paper = g.background.paper;
		form.header_footer_margins = { ...g.header_footer.margins };
		form.header_footer_images = {
			header: g.header_footer.header ? { ...g.header_footer.header.rect } : null,
			footer: g.header_footer.footer ? { ...g.header_footer.footer.rect } : null
		};
		form.header_footer_papers = { header: g.header_footer.header?.paper ?? null, footer: g.header_footer.footer?.paper ?? null };
	};

	// Every mode's stored settings with this page's edits applied; anything
	// this page doesn't edit (the artwork itself, which saves on upload) is
	// kept, and a refused value falls back to its default through the schema.
	const stationeryJson = () => serializeStationery(stationerySchema.parse(
		withPaperGeometry(parseStationery(store.settings?.pdf_stationery), formGeometry())
	));

	const paperKey = computed(() => resolvePaperSize(form.pdf_paper_size).key);

	// What the cards and the editor flag for a check on the picked sheet.
	const stationeryCheck = computed(() =>
		stationeryReview(formGeometry(), parseStationery(store.settings?.pdf_stationery).background.ext, paperKey.value));

	// Artwork saves the moment it changes, for the paper picked now — so not
	// while a Paper size change is unsaved (Discard would leave it on the
	// wrong sheet). The cards disable their actions and show this note.
	const artworkLock = computed(() => artworkPaperLock(paperKey.value, store.settings?.pdf_paper_size));

	// The margins of the mode being edited — what the thumbnail frames and the
	// Stationery editor drags. Each mode keeps its own (Built-in has none of
	// its own; it reads the Pre-printed ones harmlessly and never writes).
	// Header & footer images report their margins with each band already pushed
	// out of its image — what the PDF reserves (page-settings.ts does the same).
	const activeStationeryMargins = computed<StationeryMarginsMm>({
		get: () => {
			if (form.pdf_stationery_mode === "background") return form.background_margins;
			if (form.pdf_stationery_mode === "header_footer") return headerFooterMargins(resolvePaperSize(paperKey.value), form.header_footer_images, form.header_footer_margins);
			return form.preprinted_margins;
		},
		set: (m) => {
			if (form.pdf_stationery_mode === "background") form.background_margins = { ...m };
			else if (form.pdf_stationery_mode === "header_footer") form.header_footer_margins = { ...m };
			else if (form.pdf_stationery_mode === "preprinted") form.preprinted_margins = { ...m };
		}
	});

	// Shared with StationeryBackgroundCard and the editor (one read / render).
	const artwork = useStationeryArtwork();
	// Header & footer images, shared the same way with their card and the editor.
	const headerArt = useStationeryArtwork("header");
	const footerArt = useStationeryArtwork("footer");
	const thumbnailImages = computed(() => {
		if (form.pdf_stationery_mode !== "header_footer") return null;
		const stored = parseStationery(store.settings?.pdf_stationery).header_footer;
		const view = (slot: HeaderFooterSlot, url: string | null): PageImageView | null => {
			const rect = form.header_footer_images[slot];
			const ext = stored[slot]?.ext;
			return rect && ext ? { rect, url, ext } : null;
		};
		return { header: view("header", headerArt.url.value), footer: view("footer", footerArt.url.value) };
	});
	const editorOpen = ref(false);
	const openEditor = () => {
		editorOpen.value = true;
	};
	// Kept-alive page: never come back to a stale open editor.
	onDeactivated(() => {
		editorOpen.value = false;
	});

	// A Paper size change re-fits every mode's geometry ON THE FORM, right
	// when it is picked (stationery-geometry.ts refitPaperGeometry: A4 ↔ A5
	// scales, to or from Letter / Legal keeps mm sizes and clamps). Here, and
	// not when a PDF renders or the editor opens, because:
	//   - the form's geometry is then always in the picked sheet's own
	//     coordinates, so the thumbnail, the editor and the sample preview
	//     show what Save will write, and an edit made after the change is
	//     never re-fitted a second time;
	//   - Save stores geometry that already fits its sheet, so every PDF
	//     (rendered with no editor involved) is right, and nothing has to
	//     remember which sheet stored geometry was meant for;
	//   - each pick re-fits from the sheet before it, so A4 → A5 → A4 (saved
	//     or not) comes back where it started.
	// Hydrate (load / Discard) sets the paper directly: stored geometry is
	// already in the stored sheet's coordinates.
	//
	// When the re-fit leaves the ACTIVE mode's artwork needing a look (images
	// clamped onto a Letter / Legal sheet, a background prepared for another
	// one — stationeryReview), the Stationery editor opens straight away with
	// its "Check your stationery" banner. Another mode's artwork only gets its
	// card's note.
	const setPaper = (key: PaperSize) => {
		const from = resolvePaperSize(form.pdf_paper_size);
		const to = resolvePaperSize(key);
		if (from.key === to.key) return;
		setFormGeometry(refitPaperGeometry(from, to, formGeometry()));
		form.pdf_paper_size = to.key;
		if (modeNeedsReview(stationeryCheck.value, form.pdf_stationery_mode)) editorOpen.value = true;
	};

	const currency = useActiveCurrency();
	// Accent colour for the schematic Layout thumbnails — tracks the live
	// (unsaved) PDF colour so picking a swatch updates them instantly. The
	// picker itself is PdfColorRow, shown in every mode's options.
	const themeColor = computed(() => themeHex(form.pdf_theme_color));
	// Outside Built-in the colour still prints; say where.
	const COLOR_HINT = "Used for the highlighted totals in statements and reports.";

	// ---- header logo print size ---------------------------------------
	// What the Logo size slider reports: the same maths header-logo(data, 12mm)
	// does in common.typ — 12mm baseline height × scale, then a 55mm width clamp
	// that shrinks both axes. Needs the logo's natural aspect, read off-screen
	// from the uploaded file (4:1 placeholder until it loads).
	const logoAspect = ref(4);
	watch(() => store.pdfHeaderLogoSrc, (src) => {
		if (!src) return;
		const img = new Image();
		img.onload = () => {
			if (img.naturalWidth > 0 && img.naturalHeight > 0) logoAspect.value = img.naturalWidth / img.naturalHeight;
		};
		img.src = src;
	}, { immediate: true });

	const logoPrintMm = computed(() => {
		let h = 12 * (form.pdf_logo_scale / 100);
		let w = h * logoAspect.value;
		if (w > 55) {
			h = h * (55 / w);
			w = 55;
		}
		return { w, h };
	});
	const logoWidthClamped = computed(() => 12 * (form.pdf_logo_scale / 100) * logoAspect.value > 55);

	// The settings the previews render with (the live page preview, Preview as
	// PDF and the Stationery editor's sample): the saved row with the live
	// form on top. The whole point of a preview is to see edits BEFORE saving
	// them, and the sample payload builders read font / colour / logo scale /
	// Stationery off the settings row, which only updates on save.
	const previewSettings = computed<CompanySettingsRow | null>(() => (store.settings
		? {
			...store.settings,
			pdf_font: form.pdf_font,
			pdf_theme_color: form.pdf_theme_color,
			pdf_paper_size: form.pdf_paper_size,
			pdf_layout: form.pdf_layout,
			pdf_stationery_mode: form.pdf_stationery_mode,
			pdf_stationery: stationeryJson(),
			pdf_logo_scale: form.pdf_logo_scale,
			pdf_header_custom: form.pdf_header_custom,
			pdf_header_text: form.pdf_header_text,
			pdf_footer_custom: form.pdf_footer_custom,
			pdf_footer_text: form.pdf_footer_text
		}
		: null));

	// USwitch wants booleans; the columns are 0/1 like every other flag here.
	const headerCustom = computed({
		get: () => form.pdf_header_custom === 1,
		set: (v: boolean) => {
			form.pdf_header_custom = v ? 1 : 0;
		}
	});
	const footerCustom = computed({
		get: () => form.pdf_footer_custom === 1,
		set: (v: boolean) => {
			form.pdf_footer_custom = v ? 1 : 0;
		}
	});
	// RichTextEditor's v-model is a plain string; the columns are nullable.
	const headerTextModel = computed({
		get: () => form.pdf_header_text ?? "",
		set: (v: string) => {
			form.pdf_header_text = v || null;
		}
	});
	const footerTextModel = computed({
		get: () => form.pdf_footer_text ?? "",
		set: (v: string) => {
			form.pdf_footer_text = v || null;
		}
	});

	const headerEditor = ref<{ insertText: (t: string) => void } | null>(null);
	const footerEditor = ref<{ insertText: (t: string) => void } | null>(null);
	const tokenItems = (target: "header" | "footer") => [PDF_TOKENS.map((t) => ({
		label: t.label,
		onSelect: () => (target === "header" ? headerEditor : footerEditor).value?.insertText(t.token)
	}))];

	// The sample both previews show: the Stationery editor's two-page invoice
	// (sample-pdf.ts), on the live form's paper, Stationery, Layout (Built-in
	// only — buildLayoutAndPage), font, colour and header / footer text.
	const samplePayload = () => (previewSettings.value ? sampleStationeryPreviewPayload(previewSettings.value, currency.value, form.pdf_layout) : null);

	// "Preview as PDF": the whole two-page sample in the PDF preview modal.
	const samplePreview = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => samplePayload() ?? {},
		fileName: () => "sample-invoice.pdf",
		title: "Sample invoice"
	});

	// The live preview beside it: page 1 of the same sample, re-rendered ~500 ms
	// after any change. Artwork and the header logo can change on disk without
	// changing the payload (same path / format), so their loaded URLs and the
	// logo crop are extra inputs.
	const livePreview = useLivePagePreview(samplePayload, {
		deps: () => [artwork.url.value, headerArt.url.value, footerArt.url.value, store.pdfHeaderLogoSrc, store.settings?.pdf_logo_crop]
	});
	const PREVIEW_W_PX = 220;
	const previewHeightPx = computed(() => {
		const paper = resolvePaperSize(paperKey.value);
		return Math.round(PREVIEW_W_PX * (paper.heightMm / paper.widthMm));
	});
	const paperLabel = computed(() => resolvePaperSize(paperKey.value).label);
	// The heading and line over the picked mode's options.
	const modeOptions = computed(() => MODE_OPTIONS[form.pdf_stationery_mode]);
	// The picked mode's artwork needs a look in the editor on this sheet.
	const activeModeNeedsCheck = computed(() => modeNeedsReview(stationeryCheck.value, form.pdf_stationery_mode));

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
		form.pdf_layout = resolveLayoutKey(s.pdf_layout);
		form.pdf_paper_size = resolvePaperSize(s.pdf_paper_size).key;
		form.pdf_stationery_mode = resolveStationeryMode(s.pdf_stationery_mode);
		// Stored geometry is already in the stored sheet's coordinates: no re-fit.
		setFormGeometry(paperGeometryOf(parseStationery(s.pdf_stationery)));
		form.pdf_logo_scale = s.pdf_logo_scale ?? 100;
		form.pdf_header_custom = s.pdf_header_custom ?? 0;
		form.pdf_header_text = s.pdf_header_text ?? null;
		form.pdf_footer_custom = s.pdf_footer_custom ?? 0;
		form.pdf_footer_text = s.pdf_footer_text ?? null;
	};

	await store.ensureLoaded();
	hydrate();

	// The sidebar names the middle anchor after the picked (maybe unsaved)
	// mode — app/layouts/default.vue reads this.
	const sidebarMode = usePdfSettingsMode();
	watch(() => form.pdf_stationery_mode, (m) => {
		sidebarMode.value = m;
	}, { immediate: true });

	// Dirty tracking via JSON snapshot. Same shape as company.vue.
	const formSnapshot = computed(() => JSON.stringify(form));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

	// Kept-alive page: another page can save these settings while this one is
	// cached (Settings → Letters saves the Pre-printed paper bands). Re-read
	// them on the way back in — unless something here is unsaved, which is
	// left alone — so a stale form can't save the old values over them.
	onActivated(() => {
		if (dirty.value) return;
		hydrate();
		refreshBaseline();
	});

	const onSubmit = async () => {
		try {
			await store.save({
				pdf_font: form.pdf_font.trim() || "Akt",
				pdf_theme_color: form.pdf_theme_color,
				pdf_layout: form.pdf_layout,
				pdf_paper_size: form.pdf_paper_size,
				pdf_stationery_mode: form.pdf_stationery_mode,
				pdf_stationery: stationeryJson(),
				pdf_logo_scale: form.pdf_logo_scale,
				pdf_header_custom: form.pdf_header_custom,
				pdf_header_text: form.pdf_header_text,
				pdf_footer_custom: form.pdf_footer_custom,
				pdf_footer_text: form.pdf_footer_text
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

	// A Header & footer image was added, cropped or removed — already saved by
	// its card, together with its band. Put the same on the form AND on the
	// baseline, so it doesn't read as an unsaved change while any other
	// unsaved edit on the page stays exactly as it was.
	const onImagePlaced = (slot: HeaderFooterSlot, rect: MmRect | null, margins: StationeryMarginsMm) => {
		const edge = IMAGE_EDGE[slot];
		const apply = (f: PdfForm) => {
			f.header_footer_images[slot] = rect ? { ...rect } : null;
			// Placed (or re-cropped) on the sheet picked now — the card saved that.
			f.header_footer_papers[slot] = rect ? paperKey.value : null;
			if (rect) f.header_footer_margins[edge] = margins[edge];
		};
		const saved = JSON.parse(baseline.value) as PdfForm;
		apply(saved);
		apply(form);
		baseline.value = JSON.stringify(saved);
	};

	// The Full-page background was uploaded, re-cropped or removed — saved by
	// its card for the sheet picked now (or cleared). Same form + baseline
	// treatment as onImagePlaced, so Save never writes back a stale sheet.
	const onBackgroundArtwork = (paper: PaperSize | null) => {
		const saved = JSON.parse(baseline.value) as PdfForm;
		saved.background_paper = paper;
		form.background_paper = paper;
		baseline.value = JSON.stringify(saved);
	};

	// Apply in the Stationery editor: the user has seen this mode on this
	// sheet, so whatever it flagged counts as checked (a raster background
	// still needs its re-crop). Saved with Save changes, like the margins.
	const onStationeryApplied = () => {
		const ext = parseStationery(store.settings?.pdf_stationery).background.ext;
		setFormGeometry(confirmPaperGeometry(formGeometry(), form.pdf_stationery_mode, paperKey.value, ext));
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
		const target = await saveBusinessAsset(tenantId, "pdf-header", ext, bytes);
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
			await saveBusinessAsset(tenantId, "pdf-header-original", ext, bytes);
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
				[ext, bytes] = await readBusinessAsset(tenantId, "pdf-header-original");
				cropSourceNote.value = undefined;
			} catch {
				// Original missing (pre-feature upload): crop the derivative itself.
				[ext, bytes] = await readBusinessAsset(tenantId, "pdf-header");
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
