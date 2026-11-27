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
				Paper, layout, stationery, font and colour for your generated PDFs.
			</p>
		</header>

		<UForm
			:state="form"
			class="max-w-5xl mx-auto"
			@submit="onSubmit"
		>
			<!-- Order follows the PDF itself: the sheet, the Layout and its accent
				colour first, then the Stationery around it (Built-in's logo and
				header/footer text cards sit inside its section), then the type. Every
				section has a sidebar anchor in app/layouts/default.vue — a new card
				goes inside one of them, never between. -->
			<div class="space-y-6">
				<div id="paper-layout" class="scroll-mt-6 space-y-6">
					<SectionCard
						icon="i-lucide-layout-template"
						title="Paper &amp; layout"
						subtitle="The sheet every PDF is printed on, and — with Built-in stationery — how your quotes, invoices, bills and payslips arrange their content on it."
					>
						<div class="mb-5">
							<div class="text-sm font-medium mb-1">
								Paper size
							</div>
							<p class="text-xs text-(--ui-text-muted) mb-2">
								The sheet every PDF is laid out on. Margins follow the paper's width; text stays the same size.
							</p>
							<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
								<button
									v-for="p in PAPER_SIZES"
									:key="p.key"
									type="button"
									class="px-3 py-2 rounded-md border text-left transition cursor-pointer hover:border-(--ui-primary)/50"
									:class="[
										form.pdf_paper_size === p.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)'
									]"
									:aria-pressed="form.pdf_paper_size === p.key"
									@click="setPaper(p.key)"
								>
									<div class="text-xs font-medium">
										{{ p.label }}
									</div>
									<div class="text-xs text-(--ui-text-muted)">
										{{ p.widthMm }} × {{ p.heightMm }} mm
									</div>
								</button>
							</div>
						</div>
						<!-- Layout is a Built-in choice only (ADR 0001 amendment): every
							other Stationery renders Classic (page-settings.ts
							buildLayoutAndPage). Hidden, not cleared, so switching back to
							Built-in restores the stored pick. -->
						<div v-if="form.pdf_stationery_mode !== 'builtin'">
							<div class="text-sm font-medium mb-1">
								Layout
							</div>
							<p class="text-xs text-(--ui-text-muted)">
								{{ stationeryDesign }} the design, so documents use the Classic layout. The other layouts are available with Built-in stationery — your choice is kept for when you switch back.
							</p>
						</div>
						<div v-else>
							<div class="text-sm font-medium mb-2">
								Layout
							</div>
							<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
								<button
									v-for="l in PDF_LAYOUTS"
									:key="l.key"
									type="button"
									:title="l.description"
									class="p-2 rounded-md border text-left transition cursor-pointer hover:border-(--ui-primary)/50"
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
					</SectionCard>

					<div id="color" class="scroll-mt-6">
						<SectionCard
							icon="i-lucide-palette"
							title="Colour"
							subtitle="The accent used for the header rule and highlights on your generated PDFs. Independent of the app's theme colour."
						>
							<!-- One row of eight, matching the Theme colour picker on
								/settings/appearance. Capped at max-w-xl so the swatches stay a
								compact row on a full-width card; labels truncate at the narrow
								end ("Emerald" at text-[10px]), the full name stays in the title
								tooltip. -->
							<div class="grid grid-cols-8 gap-1.5 max-w-xl">
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

							<!-- Custom accent. Writes the same form field as the presets,
								just as a literal hex — so dirty tracking, save and the
								live preview all work unchanged. The native colour input
								opens the OS picker (no dependency, works offline); the
								hex field is for pasting an exact brand colour, which is
								the more common case for an invoice accent. The input is
								hidden inside the swatch label so the click target matches
								the eight circles above — a bare colour input renders as an
								OS-styled control that would look nothing like them. -->
							<div class="mt-4 pt-4 border-t border-(--ui-border) flex items-center gap-3 max-w-xl">
								<label
									class="size-9 rounded-full border-2 shrink-0 cursor-pointer transition relative overflow-hidden"
									:class="isCustomColor ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) hover:border-(--ui-text-muted)'"
									:style="{ backgroundColor: themeColor }"
									title="Pick a custom colour"
								>
									<input
										v-model="customColorWell"
										type="color"
										class="absolute inset-0 opacity-0 cursor-pointer"
									>
								</label>
								<div class="min-w-0">
									<div class="text-sm font-medium" :class="isCustomColor ? 'text-(--ui-text)' : 'text-(--ui-text-muted)'">
										Custom
									</div>
									<div class="text-xs text-(--ui-text-muted)">
										Your exact brand colour
									</div>
								</div>
								<UInput
									:model-value="customHexDraft"
									placeholder="#1d4ed8"
									class="w-32 ml-auto"
									@update:model-value="onHexInput(String($event))"
								/>
							</div>
						</SectionCard>
					</div>
				</div>

				<div id="stationery" class="scroll-mt-6 space-y-6">
					<SectionCard
						icon="i-lucide-stamp"
						title="Stationery"
						subtitle="What is printed around the content of every PDF — quotes, invoices, bills, vouchers, payslips, statements, reports and letters."
					>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<button
								v-for="m in STATIONERY_MODES"
								:key="m.key"
								type="button"
								class="p-3 rounded-md border text-left transition cursor-pointer hover:border-(--ui-primary)/50"
								:class="[
									form.pdf_stationery_mode === m.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)'
								]"
								:aria-pressed="form.pdf_stationery_mode === m.key"
								@click="form.pdf_stationery_mode = m.key"
							>
								<div class="text-sm font-medium">
									{{ m.label }}
								</div>
								<div class="text-xs text-(--ui-text-muted) mt-0.5">
									{{ m.description }}
								</div>
							</button>
						</div>

						<!-- Page 1 of the sample invoice, rendered by Typst from the live
							(unsaved) form ~500 ms after the last change (useLivePagePreview), with
							the drawn page as the fallback if a render fails. -->
						<div class="mt-5 flex flex-col sm:flex-row items-start gap-5">
							<div class="shrink-0" :style="{ width: `${PREVIEW_W_PX}px` }">
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
									:aria-label="`Page 1 of a sample invoice on ${resolvePaperSize(paperKey).label}`"
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
								<p v-if="livePreview.error.value" class="mt-1.5 text-xs text-(--ui-text-muted)">
									Couldn't render the preview, so this is a drawing of the page.
								</p>
							</div>
							<div class="space-y-3 min-w-0">
								<p v-if="form.pdf_stationery_mode === 'builtin'" class="text-xs text-(--ui-text-muted)">
									Your Layout's own margins frame the page. Set the header logo and the header &amp; footer text below.
								</p>
								<p v-else-if="form.pdf_stationery_mode === 'background'" class="text-xs text-(--ui-text-muted)">
									Upload your artwork below, then set the Safe area. Your logo, header text and footer aren't printed — the artwork is your letterhead.
								</p>
								<p v-else-if="form.pdf_stationery_mode === 'header_footer'" class="text-xs text-(--ui-text-muted)">
									Upload your header and footer images below, then place them and set the Safe area. Your logo, header text and footer aren't printed — the images are your letterhead.
								</p>
								<p v-else class="text-xs text-(--ui-text-muted)">
									Your paper already carries your letterhead, so nothing is printed in its blank bands — no logo, header text or footer. Set how deep the top and bottom bands are; page numbers sit just above the bottom one.
								</p>
								<div class="flex flex-wrap gap-2">
									<UButton
										icon="i-lucide-file-search"
										variant="soft"
										size="sm"
										:loading="samplePreview.state.rendering"
										@click="samplePreview.open()"
									>
										Preview as PDF
									</UButton>
									<UButton
										v-if="form.pdf_stationery_mode !== 'builtin'"
										icon="i-lucide-pencil-ruler"
										variant="soft"
										color="neutral"
										size="sm"
										@click="openEditor"
									>
										Adjust margins &amp; placement
									</UButton>
								</div>
								<p class="text-xs text-(--ui-text-muted)">
									The preview shows your changes before you save. Preview as PDF opens a two-page sample, so you can check the second page too.
								</p>
								<div class="text-xs text-(--ui-text-muted) tabular-nums">
									{{ resolvePaperSize(paperKey).label }}
									<template v-if="form.pdf_stationery_mode !== 'builtin'">
										· margins {{ formatMm(activeStationeryMargins.top) }} / {{ formatMm(activeStationeryMargins.right) }} / {{ formatMm(activeStationeryMargins.bottom) }} / {{ formatMm(activeStationeryMargins.left) }} mm (top / right / bottom / left)
									</template>
								</div>
							</div>
						</div>
					</SectionCard>

					<!-- Full-page background: artwork + its own Safe-area margins. Hidden
						(not cleared) under other modes, like Built-in's controls below. -->
					<StationeryBackgroundCard
						v-if="form.pdf_stationery_mode === 'background'"
						:paper="paperKey"
						:review="stationeryCheck.background"
						:locked="artworkLock"
						@artwork="onBackgroundArtwork"
					/>
					<StationeryHeaderFooterCard
						v-if="form.pdf_stationery_mode === 'header_footer'"
						:paper="paperKey"
						:margins="activeStationeryMargins"
						:rects="form.header_footer_images"
						:review="stationeryCheck"
						:locked="artworkLock"
						@placed="onImagePlaced"
					/>
					<StationeryEditorModal
						v-model:open="editorOpen"
						v-model:margins="activeStationeryMargins"
						v-model:images="form.header_footer_images"
						:mode="form.pdf_stationery_mode"
						:paper="paperKey"
						:settings="previewSettings"
						@applied="onStationeryApplied"
					/>

					<!-- Built-in stationery's own controls. Hidden (not cleared) under any
						other mode, so switching back restores them untouched. The anchor
						wrappers always render, so the sidebar's Header logo / Header &
						footer links land here (on the note) whatever the mode. -->
					<div id="header-logo" class="scroll-mt-6">
						<p v-if="form.pdf_stationery_mode !== 'builtin'" class="text-xs text-(--ui-text-muted) px-1">
							The header logo and header &amp; footer text belong to Built-in stationery. They're kept while another Stationery is selected — choose Built-in above to edit them.
						</p>
						<SectionCard
							v-else
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
											<div class="flex justify-between items-end gap-2" :style="{ minHeight: `${mmPx(18)}px` }">
												<!-- 3.35mm ≈ 9.5pt, the Classic Layout's base text size, so
													the block occupies true-to-scale space on the sheet.
													The previous 2.6mm rendered SMALLER than the real PDF. -->
												<div v-if="previewHeaderLines.length" class="text-left leading-tight min-w-0" :style="{ fontSize: `${mmPx(3.35)}px` }">
													<div v-for="(l, i) in previewHeaderLines" :key="i" class="text-zinc-700 truncate">
														{{ l }}
													</div>
												</div>
												<div v-else />
												<img
													v-if="store.pdfHeaderLogoSrc"
													:src="store.pdfHeaderLogoSrc"
													alt=""
													:style="previewLogoStyle"
													class="object-contain shrink-0"
													@load="onPreviewLogoLoad"
												>
												<span
													v-else
													class="font-bold text-zinc-800 leading-none shrink-0"
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

					<div id="header-footer" class="scroll-mt-6">
						<SectionCard
							v-if="form.pdf_stationery_mode === 'builtin'"
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
											<USwitch v-model="headerCustom" />
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
											<USwitch v-model="footerCustom" />
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
					</div>
				</div>

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
	import { useStationeryArtwork } from "~/composables/useStationeryArtwork";
	import { readBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
	import { BUNDLED_FONTS, isBundledFont } from "~/lib/fonts";
	import { PAPER_SIZES, resolvePaperSize } from "~/lib/page-settings";
	import { blocksToPlainLines, buildHeaderBlocks } from "~/lib/pdf-chrome";
	import { PDF_LAYOUTS, resolveLayoutKey } from "~/lib/pdf-layouts";
	import { PDF_TOKENS } from "~/lib/pdf-tokens";
	import { sampleStationeryPreviewPayload } from "~/lib/sample-pdf";
	import { BACKGROUND_DEFAULT_MARGINS, confirmPaperGeometry, HEADER_FOOTER_DEFAULT_MARGINS, modeNeedsReview, paperGeometryOf, parseStationery, PREPRINTED_DEFAULT_MARGINS, resolveStationeryMode, serializeStationery, STATIONERY_MODES, stationeryReview, stationerySchema, withPaperGeometry } from "~/lib/stationery";
	import { artworkPaperLock } from "~/lib/stationery-artwork";
	import { formatMm, headerFooterMargins, IMAGE_EDGE, refitPaperGeometry, scaleForWidth } from "~/lib/stationery-geometry";
	import { isHexColor, THEME_COLORS, themeHex } from "~/lib/theme";
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
	const colors = THEME_COLORS;
	// Accent colour for the schematic thumbnails — tracks the live (unsaved)
	// PDF colour selection so picking a swatch updates the previews instantly.
	const themeColor = computed(() => themeHex(form.pdf_theme_color));

	// A custom accent is stored as a literal hex in pdf_theme_color, the same
	// column the preset names use — so the preset buttons' `=== c.value`
	// comparison deselects on its own and nothing else needs to know.
	const isCustomColor = computed(() => isHexColor(form.pdf_theme_color));

	// The colour well always needs a concrete #rrggbb, even while a preset is
	// selected, so it opens the OS picker on the current colour rather than black.
	const customColorWell = computed({
		get: () => themeColor.value,
		set: (v: string) => {
			form.pdf_theme_color = v.toLowerCase();
		}
	});

	// Free text while typing; only committed once it's a valid hex, so a
	// half-typed "#1d" never becomes the stored value.
	const customHexDraft = ref("");
	watch(() => form.pdf_theme_color, (v) => {
		if (isHexColor(v)) customHexDraft.value = String(v).toLowerCase();
	}, { immediate: true });
	const onHexInput = (v: string) => {
		customHexDraft.value = v;
		if (isHexColor(v)) form.pdf_theme_color = v.trim().toLowerCase();
	};

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

	// Plain-text projection of the custom header for the paper mock. Marks are
	// ignored — a faithful rich-text mock isn't worth the complexity when
	// the Stationery section's live preview renders the real thing.
	const previewHeaderLines = computed(() =>
		blocksToPlainLines(buildHeaderBlocks(previewSettings.value)));

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
	// What the Layout note names as "the design" under each non-Built-in mode.
	const DESIGN_SOURCE: Record<StationeryMode, string> = {
		builtin: "",
		background: "Your background artwork is",
		header_footer: "Your header and footer images are",
		preprinted: "Your pre-printed paper is"
	};
	const stationeryDesign = computed(() => DESIGN_SOURCE[form.pdf_stationery_mode]);

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
