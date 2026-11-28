<template>
	<div class="h-full flex flex-col select-none">
		<!-- Toolbar: history, zoom, which page, preview — then Discard / Save. -->
		<div class="flex items-center gap-2 px-3 h-12 shrink-0 border-b border-(--ui-border) bg-(--ui-bg)">
			<UButton icon="i-lucide-undo-2" variant="ghost" color="neutral" size="sm" :disabled="!canUndo(history)" aria-label="Undo" title="Undo (Ctrl+Z)" @click="doUndo" />
			<UButton icon="i-lucide-redo-2" variant="ghost" color="neutral" size="sm" :disabled="!canRedo(history)" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" @click="doRedo" />
			<USeparator orientation="vertical" class="h-6 mx-1" />
			<UButton icon="i-lucide-zoom-out" variant="ghost" color="neutral" size="sm" aria-label="Zoom out" @click="zoomTo(stepActualZoom(actualSize, -1))" />
			<UDropdownMenu :items="zoomItems" :content="{ align: 'start' }">
				<UButton variant="ghost" color="neutral" size="sm" trailing-icon="i-lucide-chevron-down" class="tabular-nums w-24 justify-between" aria-label="Zoom level">
					{{ actualSizePercent }}%
				</UButton>
			</UDropdownMenu>
			<UButton icon="i-lucide-zoom-in" variant="ghost" color="neutral" size="sm" aria-label="Zoom in" @click="zoomTo(stepActualZoom(actualSize, 1))" />
			<UButton
				icon="i-lucide-hand"
				size="sm"
				:variant="handTool ? 'soft' : 'ghost'"
				:color="handTool ? 'primary' : 'neutral'"
				:aria-pressed="handTool"
				aria-label="Hand tool"
				title="Hand tool (H) — drag to move around the page. Or hold Space."
				@click="handTool = !handTool"
			/>
			<USeparator orientation="vertical" class="h-6 mx-1" />
			<div class="flex rounded-md ring-1 ring-(--ui-border) overflow-hidden" role="group" aria-label="Page shown">
				<button
					v-for="p in [1, 2] as const"
					:key="p"
					type="button"
					class="px-3 h-7 text-xs font-medium transition"
					:class="page === p ? 'bg-(--ui-primary) text-white' : 'hover:bg-(--ui-bg-elevated)'"
					:aria-pressed="page === p"
					@click="page = p"
				>
					Page {{ p }}
				</button>
			</div>
			<UButton icon="i-lucide-file-search" variant="soft" size="sm" :loading="samplePreview.state.rendering" @click="samplePreview.open()">
				Preview as PDF
			</UButton>
			<div class="flex-1" />
			<span v-if="dirty" class="flex items-center gap-1.5 text-xs text-(--ui-text-muted)">
				<span class="size-1.5 rounded-full bg-(--ui-warning)" aria-hidden="true" /> Unsaved changes
			</span>
			<UButton variant="ghost" color="neutral" size="sm" :disabled="!dirty || saving" @click="discard()">
				Discard
			</UButton>
			<UButton icon="i-lucide-save" size="sm" :disabled="!dirty" :loading="saving" @click="save()">
				Save
			</UButton>
		</div>

		<div class="flex-1 min-h-0 flex">
			<div class="flex-1 min-w-0 relative">
				<!-- After a paper change: everything was scaled, so look it over. -->
				<UAlert
					v-if="paperNoteLabel"
					class="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-max max-w-[90%] shadow-md"
					color="warning"
					variant="subtle"
					icon="i-lucide-scaling"
					:title="`Check your design for ${paperNoteLabel}`"
					description="Everything was scaled to fit the new paper."
					close
					@update:open="(o) => { if (!o) paperNote = null }"
				/>
				<PageDesignerCanvas
					:design="shownDesign"
					:selected-id="selectedId"
					:render-url="preview.url.value"
					:rendering="preview.loading.value"
					:error="preview.error.value"
					:page="page"
					:zoom="zoom"
					:pan="handTool"
					:field-values="fieldValues"
					@select="selectedId = $event"
					@edit="editItem"
					@change="live = $event"
					@commit="commitLive"
					@drop="onCanvasDrop"
					@scale="scale = $event"
				/>
			</div>

			<aside class="w-80 shrink-0 flex flex-col min-h-0 border-l border-(--ui-border) bg-(--ui-bg)">
				<!-- 1. Start: a template, then add images / a background. -->
				<section class="shrink-0 p-4 space-y-3 border-b border-(--ui-border)" aria-label="Start">
					<UPopover v-model:open="templatesOpen" :content="{ side: 'left', align: 'start', sideOffset: 8 }">
						<UButton
							block
							color="neutral"
							variant="outline"
							icon="i-lucide-layout-template"
							trailing-icon="i-lucide-chevron-down"
							:loading="applying !== null"
							class="justify-between"
						>
							Start from a template
						</UButton>
						<template #content>
							<div class="w-[26rem] max-h-[75vh] overflow-y-auto p-3">
								<div class="text-xs text-(--ui-text-muted) mb-2 px-1">
									Replaces your design (you can undo it). Shown with your logo, colour and paper.
								</div>
								<div class="grid grid-cols-2 gap-2">
									<button
										v-for="t in DESIGN_TEMPLATES"
										:key="t.key"
										type="button"
										class="group flex flex-col gap-1.5 rounded-md border border-(--ui-border) p-2 text-left transition hover:border-(--ui-primary) focus-visible:outline-2 focus-visible:outline-(--ui-primary)"
										@click="pickTemplate(t)"
									>
										<div
											class="relative w-full overflow-hidden rounded-sm bg-white ring-1 ring-black/10"
											:style="{ aspectRatio: `${paperDims.widthMm} / ${paperDims.heightMm}` }"
										>
											<img v-if="templatePreviews.urls[t.key]" :src="templatePreviews.urls[t.key]" alt="" class="absolute inset-0 size-full object-contain">
											<div v-else class="absolute inset-0 flex items-center justify-center">
												<UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-zinc-400" />
											</div>
										</div>
										<span class="text-xs font-medium">{{ t.label }}</span>
										<span class="text-[11px] leading-snug text-(--ui-text-muted)">{{ t.description }}</span>
									</button>
								</div>
							</div>
						</template>
					</UPopover>
					<div>
						<div id="designer-add" class="text-[11px] font-medium text-(--ui-text-muted) mb-1.5">
							Add to the page
						</div>
						<div class="grid grid-cols-3 gap-1.5" role="group" aria-labelledby="designer-add">
							<!-- The title sits on a wrapper: a disabled button shows no tooltip. -->
							<span v-for="t in ADD_TILES" :key="t.kind" :title="tileTitle(t.kind)" class="flex">
								<button
									type="button"
									class="flex-1 flex flex-col items-center justify-center gap-1 rounded-md border border-(--ui-border) bg-(--ui-bg) px-1 py-2 text-[11px] font-medium transition enabled:hover:border-(--ui-primary) enabled:hover:text-(--ui-primary) disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-(--ui-primary)"
									:disabled="t.kind === 'page_number' && hasPageNumber(draft.design)"
									@click="onAddTile(t.kind)"
								>
									<UIcon :name="t.icon" class="size-4" />
									{{ t.label }}
								</button>
							</span>
						</div>
					</div>
					<p class="text-xs text-(--ui-text-muted)">
						Or drop a PNG, JPEG, SVG or PDF on the page. A background covers the whole page, behind everything.
					</p>
				</section>

				<div class="flex-1 min-h-0 overflow-y-auto">
					<!-- 2. The selected item: its own tinted panel, so its controls never
						read as page settings. -->
					<section
						v-if="selected"
						class="m-3 rounded-lg ring-1 ring-(--ui-primary)/40 bg-(--ui-primary)/5 p-3"
						aria-labelledby="designer-selected"
					>
						<div class="flex items-center gap-2 mb-3">
							<UIcon :name="KIND_ICON[selected.type]" class="size-4 text-(--ui-primary)" />
							<h2 id="designer-selected" class="text-sm font-semibold flex-1">
								Selected {{ KIND_LABEL[selected.type].toLowerCase() }}
							</h2>
							<UButton icon="i-lucide-x" size="xs" variant="ghost" color="neutral" aria-label="Deselect" @click="selectedId = null" />
						</div>
						<div class="grid grid-cols-2 gap-2">
							<UFormField label="X (mm)">
								<UInputNumber :model-value="round1(selected.x)" :min="0" :step="0.5" @update:model-value="setField('x', $event)" />
							</UFormField>
							<UFormField label="Y (mm)">
								<UInputNumber :model-value="round1(selected.y)" :min="0" :step="0.5" @update:model-value="setField('y', $event)" />
							</UFormField>
							<UFormField v-if="selected.type !== 'line'" label="Width (mm)">
								<UInputNumber :model-value="round1(selected.w)" :min="5" :step="0.5" @update:model-value="setField('w', $event)" />
							</UFormField>
							<UFormField v-if="selected.type === 'line'" label="Length (mm)">
								<UInputNumber :model-value="round1(selected.length)" :min="5" :step="0.5" @update:model-value="setField('length', $event)" />
							</UFormField>
						</div>

						<!-- What the item says and how it looks. -->
						<div v-if="selected.type === 'text'" class="mt-4 space-y-3">
							<div>
								<div class="flex items-center justify-between mb-1">
									<span id="designer-text-label" class="text-[11px] font-medium text-(--ui-text-muted)">Text</span>
									<UDropdownMenu :items="fieldItems" :content="{ align: 'end', onCloseAutoFocus: onFieldMenuClosed }">
										<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-braces" trailing-icon="i-lucide-chevron-down">
											Insert field
										</UButton>
									</UDropdownMenu>
								</div>
								<div ref="textEditorWrap">
									<UTextarea
										:model-value="selected.text"
										autoresize
										:rows="3"
										:maxrows="10"
										class="w-full"
										aria-labelledby="designer-text-label"
										@update:model-value="setText(String($event))"
									/>
								</div>
								<p class="text-[11px] text-(--ui-text-muted) mt-1">
									Fields fill in from Company settings. A line whose fields are all empty is left out of PDFs.
								</p>
							</div>
							<DesignTextStyleFields :model-value="selected.style" :accent-hex="accentHex" @update:model-value="setStyle" />
						</div>
						<div v-else-if="selected.type === 'page_number'" class="mt-4 space-y-3">
							<div>
								<div id="designer-pn-format" class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
									Format
								</div>
								<div class="segmented" role="group" aria-labelledby="designer-pn-format">
									<button
										v-for="pf in PAGE_NUMBER_FORMATS"
										:key="pf.value"
										type="button"
										class="tabular-nums"
										:aria-pressed="selected.format === pf.value"
										@click="setPageNumber({ format: pf.value })"
									>
										{{ pf.label }}
									</button>
								</div>
							</div>
							<USwitch
								:model-value="selected.hide_single"
								size="sm"
								label="Hide on one-page documents"
								@update:model-value="setPageNumber({ hide_single: $event })"
							/>
							<DesignTextStyleFields :model-value="selected.style" :accent-hex="accentHex" @update:model-value="setStyle" />
						</div>
						<div v-else-if="selected.type === 'line'" class="mt-4 space-y-3">
							<div>
								<div id="designer-line-direction" class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
									Direction
								</div>
								<div class="segmented" role="group" aria-labelledby="designer-line-direction">
									<button type="button" :aria-pressed="!selected.vertical" @click="setVertical(false)">
										<UIcon name="i-lucide-move-horizontal" class="size-3.5" />
										Horizontal
									</button>
									<button type="button" :aria-pressed="selected.vertical" @click="setVertical(true)">
										<UIcon name="i-lucide-move-vertical" class="size-3.5" />
										Vertical
									</button>
								</div>
							</div>
							<div class="w-28">
								<div class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
									Thickness (pt)
								</div>
								<UInputNumber :model-value="selected.thickness" :min="0.25" :max="12" :step="0.25" size="sm" @update:model-value="setThickness" />
							</div>
							<div>
								<div class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
									Colour
								</div>
								<DesignColorField :model-value="selected.color" :accent-hex="accentHex" label="Line colour" @update:model-value="setLineColor" />
							</div>
						</div>
						<!-- Actions, grouped by what they act on: the stacking order, the
							image's file, then the item itself (copy / remove) as a quiet footer. -->
						<div class="mt-4 space-y-3">
							<UAlert
								v-if="selectedOverlaps"
								color="warning"
								variant="subtle"
								icon="i-lucide-triangle-alert"
								:ui="{ title: 'text-xs font-normal' }"
								title="Overlaps the safe area. The document prints on top of it, which is fine for a watermark."
							/>
							<div>
								<div id="designer-pages" class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
									Pages
								</div>
								<div class="segmented" role="group" aria-labelledby="designer-pages">
									<button
										v-for="r in PAGES_OPTIONS"
										:key="r.value"
										type="button"
										:aria-pressed="selected.pages === r.value"
										@click="apply((d) => setItemPages(d, selected!.id, r.value))"
									>
										{{ r.label }}
									</button>
								</div>
								<p v-if="!itemOnPage(selected.pages, page)" class="text-[11px] text-(--ui-text-muted) mt-1">
									Not on page {{ page }}. Switch to Page {{ page === 1 ? 2 : 1 }} to see it on the page.
								</p>
							</div>
							<div>
								<div id="designer-layer" class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
									Layer
								</div>
								<div class="segmented" role="group" aria-labelledby="designer-layer">
									<button type="button" title="Bring forward — in front of the item above it" @click="apply((d) => reorderItem(d, selected!.id, 'forward'))">
										<UIcon name="i-lucide-bring-to-front" class="size-3.5" />
										Forward
									</button>
									<button type="button" title="Send back — behind the item below it" @click="apply((d) => reorderItem(d, selected!.id, 'backward'))">
										<UIcon name="i-lucide-send-to-back" class="size-3.5" />
										Back
									</button>
								</div>
							</div>
							<div v-if="selected.type === 'image'">
								<div id="designer-image-file" class="text-[11px] font-medium text-(--ui-text-muted) mb-1">
									Image file
								</div>
								<div class="segmented" role="group" aria-labelledby="designer-image-file">
									<button
										type="button"
										:title="selected.src ? 'Swap in a different file, keeping the position and size' : 'Fill this empty slot; it keeps its place and size'"
										@click="replaceInput?.click()"
									>
										<UIcon :name="selected.src ? 'i-lucide-replace' : 'i-lucide-image-plus'" class="size-3.5" />
										{{ selected.src ? "Replace…" : "Choose image…" }}
									</button>
									<button v-if="selectedFileExt && isRasterArtwork(selectedFileExt)" type="button" title="Keep only part of the image" @click="cropSelected">
										<UIcon name="i-lucide-crop" class="size-3.5" />
										Crop…
									</button>
								</div>
								<USwitch
									class="mt-3"
									size="sm"
									:model-value="selected.guide"
									label="Guide only — not printed"
									description="For lining things up with pre-printed paper: shown here, never printed."
									@update:model-value="apply((d) => setImageGuide(d, selected!.id, $event))"
								/>
							</div>
							<div class="flex items-center justify-between pt-2 border-t border-(--ui-primary)/15">
								<UButton
									size="xs"
									variant="ghost"
									color="neutral"
									icon="i-lucide-copy"
									:disabled="selected.type === 'page_number'"
									:title="selected.type === 'page_number' ? 'A design has one page number. It shows on every page.' : undefined"
									@click="duplicateSelected()"
								>
									Duplicate
								</UButton>
								<UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteSelected">
									Delete
								</UButton>
							</div>
						</div>
					</section>
					<p v-else class="m-3 rounded-lg border border-dashed border-(--ui-border) p-3 text-xs text-(--ui-text-muted)">
						Click something on the page to select it. Drag to move it; drag a handle to resize it.
					</p>

					<!-- 3. Page settings: apply to the whole page and every document. -->
					<div class="px-4 pt-3 pb-1 flex items-center gap-2">
						<span class="text-[11px] font-semibold uppercase tracking-wider text-(--ui-text-muted)">Page settings</span>
						<span class="flex-1 h-px bg-(--ui-border)" aria-hidden="true" />
					</div>

					<section class="px-4 py-3" aria-labelledby="designer-page">
						<h2 id="designer-page" class="text-sm font-semibold mb-2">
							Paper
						</h2>
						<div class="grid grid-cols-2 gap-1.5" role="group" aria-label="Paper size">
							<button
								v-for="p in PAPER_SIZES"
								:key="p.key"
								type="button"
								class="px-2 py-1.5 rounded-md border text-left text-xs transition"
								:class="draft.design.paper === p.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border) hover:border-(--ui-primary)/50'"
								:aria-pressed="draft.design.paper === p.key"
								@click="setPaper(p.key)"
							>
								<span class="font-medium">{{ p.label }}</span>
								<span class="block text-(--ui-text-muted) tabular-nums">{{ p.widthMm }} × {{ p.heightMm }} mm</span>
							</button>
						</div>
					</section>

					<section class="px-4 py-3 border-t border-(--ui-border)" aria-labelledby="designer-safe-area">
						<h2 id="designer-safe-area" class="text-sm font-semibold mb-2">
							Safe area <span class="font-normal text-(--ui-text-muted)">(mm)</span>
						</h2>
						<div class="grid grid-cols-2 gap-2">
							<UFormField v-for="side in SIDES" :key="side.key" :label="side.label">
								<UInputNumber :model-value="round1(draft.design.margins[side.key])" :min="0" :step="0.5" @update:model-value="setMargin(side.key, $event)" />
							</UFormField>
						</div>
						<div class="space-y-2 text-xs text-(--ui-text-muted) mt-3">
							<div class="flex items-start gap-2">
								<span class="mt-0.5 size-3.5 shrink-0 border border-dashed border-(--ui-primary)" aria-hidden="true" />
								<span>Safe area — where the document itself goes. Drag its guides on the page, or type the margins.</span>
							</div>
							<div class="flex items-start gap-2">
								<span class="mt-0.5 size-3.5 shrink-0 legend-printer-band ring-1 ring-red-400/40" aria-hidden="true" />
								<span>Most printers can't print within 5 mm of the edge. Shown for reference only — artwork may run into it.</span>
							</div>
						</div>
					</section>

					<section class="px-4 py-3 border-t border-(--ui-border)" aria-labelledby="designer-document">
						<h2 id="designer-document" class="text-sm font-semibold mb-2">
							Document
						</h2>
						<div class="text-xs font-medium mb-1.5">
							Document style
						</div>
						<div class="grid grid-cols-2 gap-1.5" role="group" aria-label="Document style">
							<button
								v-for="l in PDF_LAYOUTS"
								:key="l.key"
								type="button"
								:title="l.description"
								class="px-2 py-1.5 rounded-md border text-left text-xs font-medium transition"
								:class="draft.layout === l.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border) hover:border-(--ui-primary)/50'"
								:aria-pressed="draft.layout === l.key"
								@click="apply((d) => d, { layout: l.key })"
							>
								{{ l.label }}
							</button>
						</div>
						<div class="mt-4">
							<PdfColorRow :model-value="draft.accent" @update:model-value="apply((d) => d, { accent: $event })" />
						</div>
						<UFormField label="Font" class="mt-4 pb-2">
							<USelectMenu
								:model-value="draft.font"
								:items="fontOptions"
								value-key="value"
								label-key="label"
								class="w-full"
								@update:model-value="apply((d) => d, { font: $event as string })"
							/>
						</UFormField>
					</section>
				</div>
			</aside>
		</div>

		<input ref="addInput" type="file" accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf" class="hidden" @change="onAddInput">
		<input ref="replaceInput" type="file" accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf" class="hidden" @change="onReplaceInput">

		<ImageCropModal
			v-model:open="uploader.crop.open"
			:image-blob="uploader.crop.blob"
			:max-output="uploader.crop.maxOutput"
			:output-type="uploader.crop.outputType"
			:aspect="uploader.crop.aspect"
			:title="uploader.crop.title"
			:hint="uploader.crop.hint"
			@cropped="uploader.onCropped"
			@cancel="uploader.onCropCancel"
		/>

		<UModal :open="pendingTemplate !== null" :title="`Use ${pendingTemplate?.label ?? ''}?`" @update:open="(o) => { if (!o) pendingTemplate = null }">
			<template #body>
				<p class="text-sm">
					This replaces your design with the {{ pendingTemplate?.label }} template. You can undo it.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton variant="ghost" color="neutral" @click="pendingTemplate = null">
						Cancel
					</UButton>
					<UButton icon="i-lucide-layout-template" @click="useTemplate">
						Replace design
					</UButton>
				</div>
			</template>
		</UModal>

		<UModal :open="pendingDrop !== null" title="Add this file as…" @update:open="(o) => { if (!o) pendingDrop = null }">
			<template #body>
				<div class="grid grid-cols-2 gap-3">
					<button type="button" class="flex flex-col items-start gap-1 rounded-md border border-(--ui-border) p-3 text-left transition hover:border-(--ui-primary)" @click="addDropped('image')">
						<UIcon name="i-lucide-image-plus" class="size-5 text-(--ui-primary)" />
						<span class="text-sm font-medium">An image</span>
						<span class="text-xs text-(--ui-text-muted)">A logo, seal or signature you place anywhere and size.</span>
					</button>
					<button type="button" class="flex flex-col items-start gap-1 rounded-md border border-(--ui-border) p-3 text-left transition hover:border-(--ui-primary)" @click="addDropped('background')">
						<UIcon name="i-lucide-wallpaper" class="size-5 text-(--ui-primary)" />
						<span class="text-sm font-medium">A background</span>
						<span class="text-xs text-(--ui-text-muted)">Letterhead artwork that covers the whole page, behind everything.</span>
					</button>
				</div>
			</template>
		</UModal>

		<UModal v-model:open="closeAsk" title="Save changes before closing?">
			<template #body>
				<p class="text-sm">
					Your changes to the page design haven't been saved.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton variant="ghost" color="neutral" @click="closeAsk = false">
						Cancel
					</UButton>
					<UButton variant="soft" color="error" @click="closeAfter(false)">
						Discard
					</UButton>
					<UButton icon="i-lucide-save" :loading="saving" @click="closeAfter(true)">
						Save
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
	import type { History } from "~/lib/design-history";
	// The page designer (its own window — usePageDesignerWindow). It edits a
	// DRAFT of the business's page design plus its paper, Document style,
	// accent and font, entirely in memory with undo / redo, and writes the
	// database only on Save. Images go into the business folder as they are
	// added (fresh ids, never over a saved file); Save and Discard delete the
	// ones nothing uses (design-draft filesToRemove). On Save the main window
	// is told to reload its settings (page-design-sync.client.ts).
	//
	// Spec: docs/superpowers/specs/2026-11-27-page-designer-design.md.
	import type { DesignTemplateKey } from "~/lib/design-templates";
	import type { DesignColor, DesignFont, DesignItem, ImageExt, MarginsMm, PageDesign, PageNumberFormat, PagesRule, TextStyle } from "~/lib/page-design";
	import type { PaperSize } from "~/lib/paper-sizes";
	import type { PdfLayoutKey } from "~/lib/pdf-layouts";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { useDesignImageUpload } from "~/composables/useDesignImageUpload";
	import { useLivePagePreview } from "~/composables/useLivePagePreview";
	import { usePageDesign } from "~/composables/usePageDesign";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { useTemplatePreviews } from "~/composables/useTemplatePreviews";
	import { itemAssetKind, readBusinessAsset, removeBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
	import { addBackground, addImage, addLine, addPageNumber, addText, deleteItem, duplicateItem, fileCopyForDuplicate, filesToRemove, fillSlot, hasPageNumber, reorderItem, replaceImage, setImageGuide, setItemPages, setLineVertical, setMargins, updateItem } from "~/lib/design-draft";
	import { canRedo, canUndo, historyAfterSave, record, redo, startHistory, undo } from "~/lib/design-history";
	import { DESIGN_TEMPLATES } from "~/lib/design-templates";
	import { ACTUAL_ZOOM_LEVELS, clampItem, CSS_PX_PER_MM, overlapWarning, setMarginValue, stepActualZoom, zoomForActual } from "~/lib/designer-geometry";
	import { designerShortcutsAllowed } from "~/lib/designer-keys";
	import { BUNDLED_FONTS, isBundledFont } from "~/lib/fonts";
	import { DESIGN_FONTS, itemOnPage, newItemId, parsePageDesign, scaleDesign } from "~/lib/page-design";
	import { insertToken } from "~/lib/page-design-text";
	import { effectiveDesign, PAPER_SIZES, resolvePaperSize } from "~/lib/page-settings";
	import { PDF_LAYOUTS, resolveLayoutKey } from "~/lib/pdf-layouts";
	import { PDF_TOKENS, tokenValuesFromSettings } from "~/lib/pdf-tokens";
	import { sampleStationeryPreviewPayload } from "~/lib/sample-pdf";
	import { isRasterArtwork } from "~/lib/stationery-artwork";
	import { pdfThemeHex } from "~/lib/theme";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	definePageMeta({ layout: "designer-window", title: "Page designer" });

	interface Draft { design: PageDesign, layout: PdfLayoutKey, accent: string, font: string }

	const KIND_LABEL: Record<DesignItem["type"], string> = { image: "Image", text: "Text", page_number: "Page number", line: "Line" };
	const KIND_ICON: Record<DesignItem["type"], string> = { image: "i-lucide-image", text: "i-lucide-type", page_number: "i-lucide-hash", line: "i-lucide-minus" };
	const SIDES: { key: keyof MarginsMm, label: string }[] = [
		{ key: "top", label: "Top" },
		{ key: "bottom", label: "Bottom" },
		{ key: "left", label: "Left" },
		{ key: "right", label: "Right" }
	];

	const settings = useSettingsStore();
	const tenants = useTenantsStore();
	const toast = useToast();
	const pageDesign = usePageDesign();
	const uploader = useDesignImageUpload();
	const currency = useActiveCurrency();

	await settings.ensureLoaded();

	// ---- draft, history, what's saved -------------------------------------------
	const draftFromSettings = (): Draft => {
		const s = settings.settings;
		return {
			design: effectiveDesign(s),
			layout: resolveLayoutKey(s?.pdf_layout),
			accent: s?.pdf_theme_color ?? s?.theme_color ?? "green",
			font: s?.pdf_font || "Akt"
		};
	};

	// The stored design (null = never chosen): which files a Save / Discard may delete.
	const savedDesign = shallowRef<PageDesign | null>(parsePageDesign(settings.settings?.pdf_design));
	const baseline = shallowRef<Draft>(draftFromSettings());
	const history = shallowRef<History<Draft>>(startHistory(baseline.value));
	const uploaded = ref<string[]>([]);
	const draft = computed(() => history.value.present);
	const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(baseline.value));

	// A drag in progress shows live but only enters the history when it ends.
	const live = shallowRef<PageDesign | null>(null);
	const shownDesign = computed(() => live.value ?? draft.value.design);

	/** Record one change: a new design (from the current one) and/or other draft fields. */
	// `opts.merge`: consecutive changes with the same key are one undo step
	// (typing in a text box, stepping a size).
	const apply = (fn: (d: PageDesign) => PageDesign, rest: Partial<Omit<Draft, "design">> = {}, opts?: { merge?: string }) => {
		const now = history.value.present;
		history.value = record(history.value, { ...now, ...rest, design: fn(now.design) }, opts);
	};
	// `now`: a finished pointer drag — render it straight away rather than after
	// the usual pause (arrow-key nudges keep the pause, or holding a key would
	// start a render per repeat).
	const commitLive = (now?: boolean) => {
		const next = live.value;
		live.value = null;
		if (!next) return;
		if (now) renderLanded();
		apply(() => next);
	};
	const doUndo = () => {
		live.value = null;
		history.value = undo(history.value);
	};
	const doRedo = () => {
		live.value = null;
		history.value = redo(history.value);
	};

	// ---- selection ------------------------------------------------------------------
	const selectedId = ref<string | null>(null);
	/** Company field values, for the canvas to measure text boxes the way they print. */
	const fieldValues = computed(() => tokenValuesFromSettings(settings.settings));
	const selected = computed(() => shownDesign.value.items.find((i) => i.id === selectedId.value) ?? null);
	const selectedFileExt = computed<ImageExt | null>(() =>
		(selected.value?.type === "image" && selected.value.src?.kind === "file" ? selected.value.src.ext : null));
	const round1 = (n: number) => Math.round(n * 10) / 10;

	const setField = (field: "x" | "y" | "w" | "length", value: number | null | undefined) => {
		const item = selected.value;
		if (!item || typeof value !== "number" || !Number.isFinite(value)) return;
		const next = { ...item, [field]: Math.max(0, value) } as DesignItem;
		// Images keep their proportions when the width is typed.
		if (field === "w" && item.type === "image") (next as typeof item).h = value * (item.h / item.w);
		// A typed value obeys the same page limits as a drag.
		apply((d) => updateItem(d, clampItem(next, d)));
	};
	const duplicateSelected = async () => {
		const original = selected.value;
		if (!original || original.type === "page_number") return;
		const id = newItemId();
		// Item ids name the image files: a copied image needs its own file.
		const copy = fileCopyForDuplicate(original, id);
		if (copy) {
			const tenantId = tenants.activeTenantId;
			if (!tenantId) return;
			try {
				const [, bytes] = await readBusinessAsset(tenantId, itemAssetKind(copy.fromId));
				await saveBusinessAsset(tenantId, itemAssetKind(copy.toId), copy.ext, bytes);
			} catch (e) {
				toast.add({ title: "Couldn't duplicate the image", description: e instanceof Error ? e.message : String(e), color: "error", icon: "i-lucide-circle-alert" });
				return;
			}
			uploaded.value = [...uploaded.value, id];
		}
		apply((d) => duplicateItem(d, original.id, id));
		selectedId.value = id;
	};
	const deleteSelected = () => {
		if (!selected.value) return;
		const id = selected.value.id;
		apply((d) => deleteItem(d, id));
		selectedId.value = null;
	};

	// ---- page & document ------------------------------------------------------------
	// "Check your design for <paper>": shown after a paper change until it's
	// dismissed, saved, or undone back to another paper.
	const paperNote = ref<PaperSize | null>(null);
	const paperNoteLabel = computed(() =>
		(paperNote.value && paperNote.value === draft.value.design.paper ? PAPER_SIZES.find((p) => p.key === paperNote.value)?.label ?? null : null));
	const setPaper = (paper: PaperSize) => {
		if (draft.value.design.paper === paper) return;
		apply((d) => scaleDesign(d, paper));
		paperNote.value = paper;
	};

	// Which pages an item is drawn on.
	const PAGES_OPTIONS: { value: PagesRule, label: string }[] = [
		{ value: "every", label: "Every page" },
		{ value: "first", label: "First page" },
		{ value: "not_first", label: "After the first" }
	];
	/** The selected item overlaps the safe area (the canvas badge's rule, on the estimated text height). */
	const selectedOverlaps = computed(() => (selected.value ? overlapWarning(selected.value, shownDesign.value) : false));
	const setMargin = (side: keyof MarginsMm, value: number | null | undefined) => {
		if (typeof value !== "number" || !Number.isFinite(value)) return;
		apply((d) => setMargins(d, setMarginValue(d.margins, side, value, d.paper)));
	};
	const fontOptions = computed(() => {
		const groups: Array<Array<Record<string, unknown>>> = [
			[{ type: "label", label: "Bundled" }, ...BUNDLED_FONTS.filter((f) => !f.mono).map((f) => ({ label: f.name, value: f.name }))],
			[{ type: "label", label: "Monospaced" }, ...BUNDLED_FONTS.filter((f) => f.mono).map((f) => ({ label: f.name, value: f.name }))]
		];
		if (draft.value.font && !isBundledFont(draft.value.font)) {
			groups.push([{ type: "label", label: "Not bundled" }, { label: `${draft.value.font} (custom)`, value: draft.value.font }]);
		}
		return groups;
	});

	// ---- images ----------------------------------------------------------------------
	const addInput = useTemplateRef<HTMLInputElement>("addInput");
	const replaceInput = useTemplateRef<HTMLInputElement>("replaceInput");

	type AddAs = "image" | "background";
	// A background covers the whole page (behind everything); an image is placed
	// at the top of the safe area for the user to move and size.
	const addFile = async (file: File, as: AddAs) => {
		const added = await uploader.upload(file, draft.value.design.paper, { background: as === "background" });
		if (!added) return;
		uploaded.value = [...uploaded.value, added.id];
		apply((d) => (as === "background" ? addBackground(d, added.id, added.ext) : addImage(d, added.id, added.ext, added.aspect)));
		selectedId.value = added.id;
	};
	const addAs = ref<AddAs>("image");
	const pickFile = (as: AddAs) => {
		addAs.value = as;
		addInput.value?.click();
	};
	const onAddInput = async (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) await addFile(file, addAs.value);
	};
	// A file dropped on the page: ask whether it's an image or a background.
	const pendingDrop = shallowRef<File | null>(null);
	const addDropped = async (as: AddAs) => {
		const file = pendingDrop.value;
		pendingDrop.value = null;
		if (file) await addFile(file, as);
	};
	const swapSelected = (added: { id: string, ext: ImageExt, aspect: number } | null) => {
		if (!added) return;
		// Tracked first, so a file whose item is gone still gets cleaned up.
		uploaded.value = [...uploaded.value, added.id];
		const old = selected.value;
		if (!old) return;
		apply((d) => replaceImage(d, old.id, added.id, added.ext, added.aspect));
		selectedId.value = added.id;
	};
	/** An empty slot filled with `file`: it keeps its box, pages rule and guide flag (design-draft fillSlot). */
	const fillSlotWith = async (file: File, slotId: string) => {
		const slot = draft.value.design.items.find((i) => i.id === slotId);
		if (slot?.type !== "image") return;
		const page = resolvePaperSize(draft.value.design.paper);
		const coversPage = slot.w >= page.widthMm - 0.5 && slot.h >= page.heightMm - 0.5;
		const added = await uploader.upload(file, draft.value.design.paper, { background: coversPage });
		if (!added) return;
		uploaded.value = [...uploaded.value, added.id];
		apply((d) => fillSlot(d, slotId, added.id, added.ext));
		selectedId.value = added.id;
	};
	// Dropped on an empty slot: fill it. Anywhere else: ask image or background.
	const onCanvasDrop = (file: File, slotId: string | null) => {
		if (slotId) void fillSlotWith(file, slotId);
		else pendingDrop.value = file;
	};
	const onReplaceInput = async (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		const item = selected.value;
		if (item?.type === "image" && item.src === null) await fillSlotWith(file, item.id);
		else swapSelected(await uploader.upload(file, draft.value.design.paper));
	};
	const cropSelected = async () => {
		if (!selected.value || !selectedFileExt.value) return;
		swapSelected(await uploader.cropExisting(selected.value.id, selectedFileExt.value, draft.value.design.paper));
	};

	// ---- templates -------------------------------------------------------------------
	const pendingTemplate = ref<(typeof DESIGN_TEMPLATES)[number] | null>(null);
	const applying = ref<DesignTemplateKey | null>(null);
	const useTemplate = async () => {
		const t = pendingTemplate.value;
		pendingTemplate.value = null;
		if (!t) return;
		applying.value = t.key;
		try {
			const prepared = await pageDesign.prepareTemplate(t.key, draft.value.design.paper);
			uploaded.value = [...uploaded.value, ...prepared.uploaded];
			apply(() => prepared.design, prepared.documentStyle ? { layout: prepared.documentStyle } : {});
			selectedId.value = null;
		} catch (e) {
			toast.add({ title: "Couldn't use the template", description: e instanceof Error ? e.message : String(e), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			applying.value = null;
		}
	};

	// ---- preview ----------------------------------------------------------------------
	const page = ref<1 | 2>(1);
	const zoom = ref(1);
	/** The hand tool: dragging pans the view (PageDesignerCanvas). */
	const handTool = ref(false);
	const scale = ref(CSS_PX_PER_MM);
	/** The page shown as a fraction of actual size (1 = 100 %). */
	const actualSize = computed(() => scale.value / CSS_PX_PER_MM);
	const actualSizePercent = computed(() => Math.round(actualSize.value * 100));
	// The canvas zooms relative to "fit"; its px-per-mm at fit is scale / zoom.
	const zoomTo = (actual: number) => {
		zoom.value = zoomForActual(actual, scale.value / zoom.value);
	};
	const zoomItems = computed(() => [
		[{ label: "Fit page", icon: "i-lucide-maximize", onSelect: () => {
			zoom.value = 1;
		} }],
		ACTUAL_ZOOM_LEVELS.map((level) => ({
			label: `${Math.round(level * 100)}%${level === 1 ? " (actual size)" : ""}`,
			onSelect: () => zoomTo(level)
		}))
	]);

	const draftSettings = computed(() => (settings.settings
		? {
			...settings.settings,
			// The committed design, not a drag in progress: the canvas moves the
			// dragged item's pixels itself, and the render follows on release.
			pdf_design: JSON.stringify(draft.value.design),
			pdf_paper_size: draft.value.design.paper,
			pdf_layout: draft.value.layout,
			pdf_theme_color: draft.value.accent,
			pdf_font: draft.value.font
		}
		: null));
	const samplePayload = () => (draftSettings.value ? sampleStationeryPreviewPayload(draftSettings.value, currency.value, draft.value.layout) : null);
	// The page view keeps a text line whose fields are all empty, faded, so it
	// can still be seen and selected, and draws guide-only images (never printed); Preview as PDF (samplePayload) prints
	// exactly what documents will.
	const designerPayload = () => (draftSettings.value ? sampleStationeryPreviewPayload(draftSettings.value, currency.value, draft.value.layout, { showEmptyFields: true, showGuides: true }) : null);
	const preview = useLivePagePreview(designerPayload, {
		page: () => page.value,
		ppiFn: () => Math.min(150, Math.max(20, Math.round(scale.value * 25.4 * (window.devicePixelRatio || 1)))),
		deps: () => uploaded.value.length
	});
	function renderLanded() {
		preview.renderNextNow();
	}
	const samplePreview = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => samplePayload() ?? {},
		fileName: () => "sample-invoice.pdf",
		title: "Sample invoice"
	});

	// ---- text, page numbers and lines ------------------------------------------------
	const accentHex = computed(() => pdfThemeHex(draftSettings.value));
	/** New text takes the document font when it's one the canvas items can use. */
	const designFont = computed<DesignFont>(() =>
		((DESIGN_FONTS as readonly string[]).includes(draft.value.font) ? draft.value.font as DesignFont : "Akt"));

	const textEditorWrap = useTemplateRef<HTMLElement>("textEditorWrap");
	const textArea = () => textEditorWrap.value?.querySelector("textarea") ?? null;
	const focusTextEditor = (selectAll: boolean) => nextTick(() => {
		const ta = textArea();
		if (!ta) return;
		ta.focus();
		if (selectAll) ta.select();
	});
	/** Double-clicked on the page: select it and, for text, put the caret in its editor. */
	const editItem = (id: string) => {
		selectedId.value = id;
		if (shownDesign.value.items.find((i) => i.id === id)?.type === "text") void focusTextEditor(false);
	};

	type AddKind = "image" | "background" | "text" | "page_number" | "line";
	const ADD_TILES: { kind: AddKind, label: string, icon: string }[] = [
		{ kind: "image", label: "Image", icon: "i-lucide-image-plus" },
		{ kind: "background", label: "Background", icon: "i-lucide-wallpaper" },
		{ kind: "text", label: "Text", icon: "i-lucide-type" },
		{ kind: "page_number", label: "Page number", icon: "i-lucide-hash" },
		{ kind: "line", label: "Line", icon: "i-lucide-minus" }
	];
	const tileTitle = (kind: AddKind) => {
		if (kind === "page_number" && hasPageNumber(draft.value.design)) return "There's already a page number. It shows on every page.";
		return { image: "A logo, seal or signature", background: "Artwork that covers the whole page", text: "Text, with company fields", page_number: "\"Page 1 of 3\" on every page", line: "A rule across or down the page" }[kind];
	};
	const onAddTile = (kind: AddKind) => {
		if (kind === "image" || kind === "background") return pickFile(kind);
		const id = newItemId();
		const font = designFont.value;
		apply((d) => (kind === "text" ? addText(d, id, font) : kind === "page_number" ? addPageNumber(d, id, font) : addLine(d, id)));
		selectedId.value = id;
		// Typing replaces "New text".
		if (kind === "text") void focusTextEditor(true);
	};

	/** Change the selected item (kept on the page). `merge`: one undo step per burst, per item. */
	const changeSelected = (fn: (item: DesignItem) => DesignItem, merge?: string) => {
		const id = selected.value?.id;
		if (!id) return;
		apply((d) => {
			const item = d.items.find((i) => i.id === id);
			return item ? updateItem(d, clampItem(fn(item), d)) : d;
		}, {}, merge ? { merge: `${merge}:${id}` } : undefined);
	};
	const setText = (text: string) => changeSelected((i) => (i.type === "text" ? { ...i, text } : i), "text");
	const setStyle = (style: TextStyle, merge?: string) =>
		changeSelected((i) => (i.type === "text" || i.type === "page_number" ? { ...i, style } : i), merge);
	const setPageNumber = (patch: { format?: PageNumberFormat, hide_single?: boolean }) =>
		changeSelected((i) => (i.type === "page_number" ? { ...i, ...patch } : i));
	const setVertical = (vertical: boolean) => {
		const id = selected.value?.id;
		if (id) apply((d) => setLineVertical(d, id, vertical));
	};
	const setThickness = (value: number | null | undefined) => {
		if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
		changeSelected((i) => (i.type === "line" ? { ...i, thickness: value } : i), "thickness");
	};
	const setLineColor = (color: DesignColor) => changeSelected((i) => (i.type === "line" ? { ...i, color } : i));

	const PAGE_NUMBER_FORMATS: { value: PageNumberFormat, label: string }[] = [
		{ value: "page_of_total", label: "Page 1 of 3" },
		{ value: "slash", label: "1 / 3" },
		{ value: "number", label: "1" }
	];

	// The menu hands focus back to its button after it closes (a moment after
	// the item's onSelect), where Backspace would delete the whole text box:
	// after an insert, put the caret back in the text, after the field.
	let fieldCaret: number | null = null;
	// Insert field: the token goes in at the caret (or over the selection).
	const insertField = (token: string) => {
		const item = selected.value;
		if (!item || item.type !== "text") return;
		const ta = textArea();
		const start = ta?.selectionStart ?? item.text.length;
		const { text, caret } = insertToken(item.text, start, ta?.selectionEnd ?? start, token);
		changeSelected((i) => (i.type === "text" ? { ...i, text } : i));
		fieldCaret = caret;
	};
	const onFieldMenuClosed = (e: Event) => {
		if (fieldCaret === null) return;
		e.preventDefault();
		const caret = fieldCaret;
		fieldCaret = null;
		const el = textArea();
		el?.focus();
		el?.setSelectionRange(caret, caret);
	};
	const fieldItems = PDF_TOKENS.map((t) => ({ label: t.label, onSelect: () => insertField(t.token) }));

	// The template picker: a thumbnail per template, rendered when it opens.
	const templatesOpen = ref(false);
	const templatePreviews = useTemplatePreviews(() => draftSettings.value, () => currency.value);
	watch(templatesOpen, (open) => {
		if (open) void templatePreviews.load();
	});
	const pickTemplate = (t: (typeof DESIGN_TEMPLATES)[number]) => {
		templatesOpen.value = false;
		pendingTemplate.value = t;
	};
	const paperDims = computed(() => resolvePaperSize(draft.value.design.paper));

	// ---- save / discard / close ---------------------------------------------------------
	const saving = ref(false);
	const removeFiles = async (ids: string[]) => {
		const tenantId = tenants.activeTenantId;
		if (!tenantId) return;
		for (const id of ids) {
			// Best effort: an orphaned file is harmless, a failed save isn't.
			await removeBusinessAsset(tenantId, itemAssetKind(id)).catch((e) => console.warn("[designer] couldn't remove", id, e));
		}
	};

	const save = async (): Promise<boolean> => {
		saving.value = true;
		const started = draft.value;
		try {
			// A never-chosen design still points at the company logo: copy it in
			// now, as a template would (spec: a copy, not a link).
			const filled = await pageDesign.fillLogoSpots(started.design);
			const final: Draft = { ...started, design: filled.design };
			await settings.save({
				pdf_design: JSON.stringify(final.design),
				pdf_paper_size: final.design.paper,
				pdf_layout: final.layout,
				pdf_theme_color: final.accent,
				pdf_font: final.font
			});
			await removeFiles(filesToRemove({ saved: savedDesign.value, draft: final.design, uploaded: uploaded.value, outcome: "save" }));
			savedDesign.value = final.design;
			uploaded.value = [];
			baseline.value = final;
			// A fresh history: the files this save deleted can't be undone back.
			// Anything typed while the save ran is kept (it shows as unsaved).
			history.value = historyAfterSave(history.value, started, final);
			paperNote.value = null;
			if ("__TAURI_INTERNALS__" in window) {
				const { emitTo } = await import("@tauri-apps/api/event");
				await emitTo("main", "page-design:saved").catch(() => { /* main may be closing */ });
			}
			toast.add({ title: "Page design saved", color: "success", icon: "i-lucide-check" });
			return true;
		} catch (e) {
			toast.add({ title: "Save failed", description: e instanceof Error ? e.message : String(e), color: "error", icon: "i-lucide-circle-alert" });
			return false;
		} finally {
			saving.value = false;
		}
	};

	const discard = async () => {
		await removeFiles(filesToRemove({ saved: savedDesign.value, draft: draft.value.design, uploaded: uploaded.value, outcome: "discard" }));
		uploaded.value = [];
		live.value = null;
		history.value = startHistory(baseline.value);
		selectedId.value = null;
	};

	const closeAsk = ref(false);
	const destroyWindow = async () => {
		if (!("__TAURI_INTERNALS__" in window)) return;
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().destroy();
	};
	const closeAfter = async (doSave: boolean) => {
		if (doSave && !(await save())) return;
		if (!doSave) await discard();
		closeAsk.value = false;
		await destroyWindow();
	};

	// Closing: from this window's own close button, or when the main window is
	// asked to close while the designer is open (lock-on-close.client.ts sends
	// `page-designer:close-request` instead of closing over unsaved work).
	const requestClose = async () => {
		if (dirty.value) {
			closeAsk.value = true;
			return;
		}
		// Nothing to keep: drop anything uploaded and then undone.
		await discard();
		await destroyWindow();
	};

	const unlisten: Array<() => void> = [];
	onMounted(async () => {
		if (!("__TAURI_INTERNALS__" in window)) return;
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		const win = getCurrentWindow();
		// Main closes over an open designer only after asking it (lock-on-close.client.ts).
		const { emitTo } = await import("@tauri-apps/api/event");
		await emitTo("main", "page-designer:open", true).catch(() => {});
		unlisten.push(await win.onCloseRequested((event) => {
			event.preventDefault();
			void requestClose();
		}));
		unlisten.push(await win.listen("page-designer:close-request", async () => {
			await win.setFocus().catch(() => {});
			await requestClose();
		}));
	});

	// ---- keys ---------------------------------------------------------------------------
	const typing = (e: KeyboardEvent) => !designerShortcutsAllowed(e.target as HTMLElement | null);
	const onKey = (e: KeyboardEvent) => {
		const mod = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();
		// Nothing here acts while a dialog (crop, confirm) is open or a field has focus,
		// except Save.
		if (mod && key === "s") {
			e.preventDefault();
			if (dirty.value) void save();
			return;
		}
		if (typing(e)) return;
		if (mod && key === "z") {
			e.preventDefault();
			if (e.shiftKey) doRedo();
			else doUndo();
		} else if (mod && key === "y") {
			e.preventDefault();
			doRedo();
		} else if (mod && key === "d") {
			e.preventDefault();
			void duplicateSelected();
		} else if (e.key === "Delete" || e.key === "Backspace") {
			if (selected.value) {
				e.preventDefault();
				deleteSelected();
			}
		} else if (!mod && key === "h") {
			handTool.value = !handTool.value;
		} else if (!mod && key === "v") {
			handTool.value = false;
		} else if (e.key === "Escape") {
			selectedId.value = null;
		}
	};
	onMounted(() => window.addEventListener("keydown", onKey));
	onBeforeUnmount(() => {
		window.removeEventListener("keydown", onKey);
		for (const off of unlisten) off();
	});
</script>

<style scoped>
	.legend-printer-band {
		background: repeating-linear-gradient(45deg, rgb(239 68 68 / 0.3) 0 2px, transparent 2px 4px);
	}
</style>
