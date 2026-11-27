<template>
	<UModal
		v-model:open="openModel"
		fullscreen
		:title="editable ? `Edit stationery — ${modeLabel}` : `Preview page — ${modeLabel}`"
		:description="editable
			? `${paperInfo.label} · ${paperInfo.widthMm} × ${paperInfo.heightMm} mm. ${mode === 'header_footer' ? 'Drag an image to move it, a corner to resize it, and the dashed guides to set the Safe area.' : 'Drag the dashed guides to set the Safe area the content stays inside.'}`
			: `${paperInfo.label} · ${paperInfo.widthMm} × ${paperInfo.heightMm} mm. Your Layout's own margins frame the page.`"
		:ui="{ body: 'flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4' }"
	>
		<template #body>
			<!-- The page, to scale, with mm rulers. Scrolls when zoomed in;
				the rulers stay pinned to its top and left edges. -->
			<div
				ref="viewportEl"
				class="relative flex flex-1 min-h-[60vh] lg:min-h-0 min-w-0 overflow-auto rounded-md bg-(--ui-bg-elevated) ring-1 ring-(--ui-border)"
			>
				<div
					class="grid m-auto shrink-0"
					:style="{
						gridTemplateColumns: `${RULER_PX}px ${pagePx.w}px`,
						gridTemplateRows: `${RULER_PX}px ${pagePx.h}px`,
						padding: `${GUTTER_PX}px`
					}"
				>
					<div class="sticky top-0 left-0 z-20 bg-(--ui-bg-elevated)" />
					<!-- Top ruler -->
					<div class="sticky top-0 z-10 bg-(--ui-bg-elevated) border-b border-(--ui-border) overflow-hidden">
						<template v-for="t in topTicks" :key="t.mm">
							<span
								class="absolute bottom-0 w-px bg-(--ui-text-dimmed)"
								:style="{ left: `${t.px}px`, height: t.major ? '9px' : '4px' }"
							/>
							<span
								v-if="t.label"
								class="absolute top-0.5 text-[9px] leading-none text-(--ui-text-muted) tabular-nums"
								:style="{ left: `${t.px + 2}px` }"
							>{{ t.label }}</span>
						</template>
					</div>
					<!-- Left ruler -->
					<div class="sticky left-0 z-10 bg-(--ui-bg-elevated) border-r border-(--ui-border) overflow-hidden">
						<template v-for="t in leftTicks" :key="t.mm">
							<span
								class="absolute right-0 h-px bg-(--ui-text-dimmed)"
								:style="{ top: `${t.px}px`, width: t.major ? '9px' : '4px' }"
							/>
							<span
								v-if="t.label"
								class="absolute left-0.5 text-[9px] leading-none text-(--ui-text-muted) tabular-nums"
								:style="{ top: `${t.px + 2}px` }"
							>{{ t.label }}</span>
						</template>
					</div>

					<StationeryPage
						class="shadow-lg ring-1 ring-black/10"
						:paper="paper"
						:mode="mode"
						:layout="layout"
						:margins="draft"
						:scale="scale"
						:artwork-url="artwork.url.value"
						:artwork-ext="artwork.ext.value"
						:images="pageImages"
						printer-band
					>
						<!-- Header & footer images: drag to move, a corner to resize
							(aspect locked), arrow keys to nudge. -->
						<template v-if="mode === 'header_footer'">
							<div
								v-for="img in imageBoxes"
								:key="img.slot"
								role="group"
								tabindex="0"
								:aria-label="`${SLOT_LABEL[img.slot]}: ${formatMm(img.rect.x)} mm from the left, ${formatMm(img.rect.y)} mm from the top, ${formatMm(img.rect.w)} mm wide`"
								class="group absolute z-20 outline-none touch-none cursor-move ring-1 ring-(--ui-primary)/40 hover:ring-(--ui-primary) focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
								:class="imageDrag?.slot === img.slot ? 'ring-2 ring-(--ui-primary)' : ''"
								:style="img.style"
								@pointerdown="onImagePointerDown(img.slot, 'move', $event)"
								@pointermove="onImagePointerMove"
								@pointerup="onImagePointerUp"
								@pointercancel="onImagePointerUp"
								@keydown="onImageKey(img.slot, $event)"
							>
								<span
									v-for="corner in CORNERS"
									:key="corner"
									class="absolute size-2.5 rounded-sm bg-white ring-1 ring-(--ui-primary) opacity-70 group-hover:opacity-100 group-focus-visible:opacity-100"
									:class="[CORNER_CLASS[corner]]"
									@pointerdown.stop="onImagePointerDown(img.slot, corner, $event)"
								/>
								<span
									class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-(--ui-primary) px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums pointer-events-none transition-opacity"
									:class="[
										img.slot === 'header' ? 'top-full mt-1' : 'bottom-full mb-1',
										imageDrag?.slot === img.slot ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
									]"
								>
									{{ formatMm(img.rect.w) }} × {{ formatMm(img.rect.h) }} mm
								</span>
							</div>
						</template>
						<!-- Margin guides. A wide transparent hit strip around a 1px
							line; focusable, so arrow keys move them too. -->
						<div
							v-for="g in editable ? guides : []"
							:key="g.edge"
							role="slider"
							tabindex="0"
							:aria-label="`${EDGE_LABEL[g.edge]} margin`"
							:aria-valuenow="draft[g.edge]"
							:aria-valuemin="limits[g.edge].min"
							:aria-valuemax="limits[g.edge].max"
							:aria-valuetext="`${draft[g.edge]} mm`"
							class="group absolute z-10 flex items-center justify-center outline-none touch-none"
							:class="g.axis === 'y' ? 'left-0 right-0 h-3 -translate-y-1/2 cursor-row-resize' : 'top-0 bottom-0 w-3 -translate-x-1/2 cursor-col-resize'"
							:style="g.axis === 'y' ? { top: `${g.px}px` } : { left: `${g.px}px` }"
							@pointerdown="onPointerDown(g.edge, $event)"
							@pointermove="onPointerMove"
							@pointerup="onPointerUp"
							@pointercancel="onPointerUp"
							@keydown="onGuideKey(g.edge, $event)"
						>
							<span
								class="bg-(--ui-primary) transition-opacity"
								:class="[
									g.axis === 'y' ? 'h-px w-full' : 'w-px h-full',
									dragging === g.edge ? 'opacity-100' : 'opacity-60 group-hover:opacity-100 group-focus-visible:opacity-100'
								]"
							/>
							<span
								class="absolute whitespace-nowrap rounded bg-(--ui-primary) px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums pointer-events-none transition-opacity"
								:class="[
									dragging === g.edge ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
									LABEL_POSITION[g.edge]
								]"
							>
								{{ EDGE_LABEL[g.edge] }} {{ draft[g.edge] }} mm
							</span>
						</div>
					</StationeryPage>
				</div>
			</div>

			<aside class="lg:w-72 shrink-0 space-y-5 lg:overflow-y-auto">
				<UAlert
					v-if="paperMismatch"
					color="warning"
					variant="subtle"
					icon="i-lucide-triangle-alert"
					title="Check your stationery"
					:description="paperMismatch"
				/>
				<UAlert
					v-if="fitted"
					color="info"
					variant="subtle"
					icon="i-lucide-info"
					:description="`These margins left no room for content on ${paperInfo.label}, so they were reduced to fit. Apply to keep them.`"
				/>

				<div v-if="editable">
					<div class="text-sm font-medium mb-2">
						Safe area margins
					</div>
					<div class="grid grid-cols-2 gap-3">
						<UFormField v-for="edge in EDGES" :key="edge" :label="`${EDGE_LABEL[edge]} (mm)`">
							<UInputNumber
								:model-value="draft[edge]"
								:min="limits[edge].min"
								:max="limits[edge].max"
								:step="1"
								@update:model-value="onTyped(edge, $event)"
							/>
						</UFormField>
					</div>
					<p class="text-xs text-(--ui-text-muted) mt-2">
						Drag a guide, or focus it and use the arrow keys (Shift for 5 mm). Side margins snap to each other.
					</p>
					<p v-if="mode === 'header_footer'" class="text-xs text-(--ui-text-muted) mt-2">
						Each image's band always reaches {{ HEADER_FOOTER_GAP_MM }} mm past it and follows it when it moves; drag the guide further out for more room. Images snap to the page edges and the centre line.
					</p>
				</div>
				<div v-else>
					<div class="text-sm font-medium mb-2">
						Safe area margins
					</div>
					<dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
						<template v-for="edge in EDGES" :key="edge">
							<dt class="text-(--ui-text-muted)">
								{{ EDGE_LABEL[edge] }}
							</dt>
							<dd>{{ formatMm(layoutMargins[edge]) }} mm</dd>
						</template>
					</dl>
					<p class="text-xs text-(--ui-text-muted) mt-2">
						Built-in stationery uses the {{ layoutLabel }} Layout's own margins, scaled for {{ paperInfo.label }}. To set your own, choose another Stationery.
					</p>
				</div>

				<div class="space-y-2 text-xs text-(--ui-text-muted)">
					<div class="flex items-start gap-2">
						<span class="mt-0.5 size-3.5 shrink-0 border border-dashed border-(--ui-primary)" />
						<span>Safe area — where the document's content goes. Grey bars stand in for it.</span>
					</div>
					<div class="flex items-start gap-2">
						<span class="mt-0.5 size-3.5 shrink-0 legend-printer-band ring-1 ring-red-400/40" />
						<span>Most printers can't print within {{ PRINTER_BAND_MM }} mm of the edge. Shown for reference only — artwork may run into it.</span>
					</div>
				</div>

				<div>
					<div class="text-sm font-medium mb-2">
						Zoom
					</div>
					<div class="flex items-center gap-1">
						<UButton icon="i-lucide-zoom-out" size="xs" color="neutral" variant="soft" aria-label="Zoom out" @click="zoomBy(-1)" />
						<UButton size="xs" color="neutral" variant="soft" @click="zoomToFit">
							Fit
						</UButton>
						<UButton icon="i-lucide-zoom-in" size="xs" color="neutral" variant="soft" aria-label="Zoom in" @click="zoomBy(1)" />
						<span class="ml-2 text-xs text-(--ui-text-muted) tabular-nums">{{ actualSizePercent }}% of actual size</span>
					</div>
				</div>

				<div>
					<UButton
						icon="i-lucide-file-search"
						variant="soft"
						block
						:loading="preview.state.rendering"
						@click="preview.open()"
					>
						Preview sample invoice
					</UButton>
					<p class="text-xs text-(--ui-text-muted) mt-2">
						A made-up two-page invoice with these margins, so you can check the second page, the repeated stationery and the page number.
					</p>
				</div>
			</aside>
		</template>
		<template #footer>
			<div class="flex items-center justify-end gap-2 w-full">
				<template v-if="editable">
					<UButton color="neutral" variant="outline" @click="cancel">
						Cancel
					</UButton>
					<UButton icon="i-lucide-check" @click="apply">
						Apply
					</UButton>
				</template>
				<UButton v-else color="neutral" variant="outline" @click="cancel">
					Close
				</UButton>
			</div>
		</template>
	</UModal>

	<PdfPreviewModal
		v-model:open="preview.state.open"
		:asset-url="preview.state.assetUrl"
		:temp-path="preview.state.tempPath"
		:suggested-file-name="preview.state.suggestedFileName"
		:saving="preview.state.saving"
		title="Stationery preview"
		@save="preview.onSave"
		@cancel="preview.onCancel"
	/>
</template>

<script setup lang="ts">
	// The Stationery editor: a full-window, to-scale view of one page with mm
	// rulers, the active mode's artwork, four draggable margin guides, grey
	// placeholder content and the informational printer band — plus "Preview
	// sample invoice", which renders a two-page sample through Typst.
	//
	// Every geometry rule (mm ↔ px at the current zoom, drag limits, snapping,
	// ruler ticks, placeholder layout) is in app/lib/stationery-geometry.ts;
	// this component only wires pointer / key events to it and draws the
	// result. It edits a DRAFT: Apply hands the margins back to the settings
	// page's form (saved with its Save changes), Cancel drops them.
	//
	// Under Built-in the editor is a PREVIEW (editsMargins): the page, rulers,
	// the Layout's own margins as the Safe area, placeholders, printer band and
	// the sample invoice — no guides, no Apply, nothing written back.
	//
	// Header & footer images add a draggable box per image to the same page
	// (StationeryPage's slot, the guides' px space): move, corner-resize with
	// the aspect locked, arrow-key nudge. Each image's band follows it, and
	// its guide can't be dragged into it (stationery-geometry.ts: dragImage,
	// resizeImage, nudgeImage, followImage, bandFloors). Apply hands back the
	// images' rects with the margins.
	import type { PaperSize } from "~/lib/page-settings";
	import type { PdfLayoutKey } from "~/lib/pdf-layouts";
	import type { HeaderFooterSlot, StationeryMarginsMm, StationeryMode } from "~/lib/stationery";
	import type { ArrowDirection, HeaderFooterRects, ImageCorner, MarginEdge, MmRect, PageImageView } from "~/lib/stationery-geometry";
	import type { CompanySettingsRow } from "~/stores/settings";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { useStationeryArtwork } from "~/composables/useStationeryArtwork";
	import { resolvePaperSize } from "~/lib/page-settings";
	import { PDF_LAYOUTS } from "~/lib/pdf-layouts";
	import { sampleStationeryPreviewPayload } from "~/lib/sample-pdf";
	import { HEADER_FOOTER_SLOTS, parseStationery, setBackgroundMargins, setHeaderFooterGeometry, setPreprintedMargins, STATIONERY_MODES } from "~/lib/stationery";
	import {
		bandFloors,
		CSS_PX_PER_MM,
		dragImage,
		dragMargin,
		editsMargins,
		fitMargins,
		fitScale,
		followImage,
		HEADER_FOOTER_GAP_MM,
		headerFooterMargins,
		marginGuides,
		marginLimits,
		mmToPx,
		nudgeImage,
		nudgeMargin,
		PRINTER_BAND_MM,
		rectToPx,
		resizeImage,
		rulerTicks,
		safeAreaMargins,
		setMargin,
		stepZoom
	} from "~/lib/stationery-geometry";

	const props = defineProps<{
		/** Built-in opens as a preview; the other modes edit their own margins. */
		mode: StationeryMode
		paper: PaperSize
		layout: PdfLayoutKey
		/** The settings page's live (maybe unsaved) values, for the sample preview. */
		settings: CompanySettingsRow | null
	}>();
	const openModel = defineModel<boolean>("open", { required: true });
	const margins = defineModel<StationeryMarginsMm>("margins", { required: true });
	/** Header & footer images only: where each image sits (null = none). */
	const images = defineModel<HeaderFooterRects>("images", { default: () => ({ header: null, footer: null }) });

	const RULER_PX = 22;
	const GUTTER_PX = 24;
	const EDGES: MarginEdge[] = ["top", "bottom", "left", "right"];
	const EDGE_LABEL: Record<MarginEdge, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };
	const SLOT_LABEL: Record<HeaderFooterSlot, string> = { header: "Header image", footer: "Footer image" };
	const CORNERS: ImageCorner[] = ["nw", "ne", "sw", "se"];
	const CORNER_CLASS: Record<ImageCorner, string> = {
		nw: "-left-1.5 -top-1.5 cursor-nwse-resize",
		ne: "-right-1.5 -top-1.5 cursor-nesw-resize",
		sw: "-left-1.5 -bottom-1.5 cursor-nesw-resize",
		se: "-right-1.5 -bottom-1.5 cursor-nwse-resize"
	};
	// Where each guide's readout sits so it never covers the page edge it measures.
	const LABEL_POSITION: Record<MarginEdge, string> = {
		top: "top-full mt-1 left-1/2 -translate-x-1/2",
		bottom: "bottom-full mb-1 left-1/2 -translate-x-1/2",
		left: "left-full ml-1 top-1/2 -translate-y-1/2",
		right: "right-full mr-1 top-1/2 -translate-y-1/2"
	};

	const paperInfo = computed(() => resolvePaperSize(props.paper));
	const modeLabel = computed(() => STATIONERY_MODES.find((m) => m.key === props.mode)?.label ?? "");
	const editable = computed(() => editsMargins(props.mode));
	// Built-in's read-only Safe area: the Layout's margins on this sheet.
	const layoutMargins = computed(() => safeAreaMargins(props.mode, props.layout, paperInfo.value, margins.value));
	const layoutLabel = computed(() => PDF_LAYOUTS.find((l) => l.key === props.layout)?.label ?? "");
	const formatMm = (mm: number) => String(Math.round(mm * 10) / 10);
	const artwork = useStationeryArtwork();
	const currency = useActiveCurrency();

	// ---- draft ----------------------------------------------------------
	// Re-seeded on every open: this modal lives on a kept-alive page, so a
	// cancelled edit must not survive to the next open.
	const draft = ref<StationeryMarginsMm>({ ...margins.value });
	const draftImages = ref<HeaderFooterRects>({ header: null, footer: null });
	const isHeaderFooter = computed(() => props.mode === "header_footer");
	/** The least each band may be: never into its image (Header & footer images only). */
	const floors = computed(() => (isHeaderFooter.value ? bandFloors(paperInfo.value, draftImages.value) : {}));
	const fitted = ref(false);
	/** Relative to "fit the page in the window". */
	const zoom = ref(1);
	/** The guide being dragged, if any. */
	const dragging = ref<MarginEdge | null>(null);
	watch(openModel, (open) => {
		if (!open) return;
		zoom.value = 1;
		dragging.value = null;
		if (!editable.value) {
			fitted.value = false;
			return;
		}
		const copy = (r: MmRect | null) => (r ? { ...r } : null);
		draftImages.value = isHeaderFooter.value ? { header: copy(images.value.header), footer: copy(images.value.footer) } : { header: null, footer: null };
		let next = fitMargins(paperInfo.value, margins.value);
		if (isHeaderFooter.value) next = headerFooterMargins(paperInfo.value, draftImages.value, next);
		fitted.value = EDGES.some((e) => next[e] !== margins.value[e]);
		draft.value = next;
	});

	const apply = () => {
		if (!editable.value) return;
		margins.value = { ...draft.value };
		if (isHeaderFooter.value) images.value = { header: draftImages.value.header, footer: draftImages.value.footer };
		openModel.value = false;
	};
	const cancel = () => {
		openModel.value = false;
	};

	const zoomBy = (direction: 1 | -1) => {
		zoom.value = stepZoom(zoom.value, direction);
	};
	const zoomToFit = () => {
		zoom.value = 1;
	};

	const limits = computed(() => Object.fromEntries(EDGES.map((e) => [e, marginLimits(paperInfo.value, draft.value, e, floors.value)])) as Record<MarginEdge, { min: number, max: number }>);

	const onTyped = (edge: MarginEdge, value: number | null | undefined) => {
		if (typeof value !== "number" || !Number.isFinite(value)) return;
		draft.value = setMargin(paperInfo.value, draft.value, edge, value, floors.value);
	};

	// ---- zoom -----------------------------------------------------------
	const viewportEl = useTemplateRef<HTMLElement>("viewportEl");
	const viewport = ref({ w: 800, h: 600 });
	let observer: ResizeObserver | null = null;
	watch(viewportEl, (el) => {
		observer?.disconnect();
		if (!el) return;
		observer = new ResizeObserver(([entry]) => {
			if (entry) viewport.value = { w: entry.contentRect.width, h: entry.contentRect.height };
		});
		observer.observe(el);
	});
	onBeforeUnmount(() => observer?.disconnect());

	const scale = computed(() => fitScale(paperInfo.value, viewport.value, GUTTER_PX + RULER_PX) * zoom.value);
	const pagePx = computed(() => ({ w: mmToPx(paperInfo.value.widthMm, scale.value), h: mmToPx(paperInfo.value.heightMm, scale.value) }));
	const actualSizePercent = computed(() => Math.round((scale.value / CSS_PX_PER_MM) * 100));
	const topTicks = computed(() => rulerTicks(paperInfo.value.widthMm, scale.value));
	const leftTicks = computed(() => rulerTicks(paperInfo.value.heightMm, scale.value));

	// ---- guides ---------------------------------------------------------
	const guides = computed(() => marginGuides(paperInfo.value, draft.value).map((g) => ({ ...g, px: mmToPx(g.mm, scale.value) })));

	let dragStart: { x: number, y: number, margins: StationeryMarginsMm } | null = null;

	const onPointerDown = (edge: MarginEdge, e: PointerEvent) => {
		if (e.button !== 0) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		(e.currentTarget as HTMLElement).focus();
		dragging.value = edge;
		dragStart = { x: e.clientX, y: e.clientY, margins: { ...draft.value } };
		e.preventDefault();
	};
	const onPointerMove = (e: PointerEvent) => {
		if (!dragging.value || !dragStart) return;
		draft.value = dragMargin(paperInfo.value, dragStart.margins, dragging.value, { dx: e.clientX - dragStart.x, dy: e.clientY - dragStart.y }, scale.value, floors.value);
	};
	const onPointerUp = () => {
		dragging.value = null;
		dragStart = null;
	};

	const ARROWS: Record<string, ArrowDirection> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
	const onGuideKey = (edge: MarginEdge, e: KeyboardEvent) => {
		const arrow = ARROWS[e.key];
		if (!arrow) return;
		e.preventDefault();
		draft.value = nudgeMargin(paperInfo.value, draft.value, edge, arrow, e.shiftKey ? 5 : 1, floors.value);
	};

	// ---- header & footer images ----------------------------------------
	const headerFooterStored = computed(() => parseStationery(props.settings?.pdf_stationery).header_footer);
	const imageArt = { header: useStationeryArtwork("header"), footer: useStationeryArtwork("footer") };
	const pageImages = computed(() => {
		if (!isHeaderFooter.value) return null;
		const view = (slot: HeaderFooterSlot): PageImageView | null => {
			const rect = draftImages.value[slot];
			const ext = headerFooterStored.value[slot]?.ext;
			return rect && ext ? { rect, url: imageArt[slot].url.value, ext } : null;
		};
		return { header: view("header"), footer: view("footer") };
	});
	const imageBoxes = computed(() => HEADER_FOOTER_SLOTS.flatMap((slot) => {
		const rect = pageImages.value?.[slot]?.rect;
		if (!rect) return [];
		const r = rectToPx(rect, scale.value);
		return [{ slot, rect, style: { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` } }];
	}));

	/** One image moved or resized: it takes `rect`, and its band follows it from where the gesture began. */
	const placeImage = (slot: HeaderFooterSlot, before: MmRect, rect: MmRect, startMargins: StationeryMarginsMm) => {
		draftImages.value = { ...draftImages.value, [slot]: rect };
		draft.value = followImage(paperInfo.value, slot, before, rect, startMargins);
	};

	const imageDrag = ref<{ slot: HeaderFooterSlot, handle: "move" | ImageCorner, x: number, y: number, rect: MmRect, margins: StationeryMarginsMm } | null>(null);

	const onImagePointerDown = (slot: HeaderFooterSlot, handle: "move" | ImageCorner, e: PointerEvent) => {
		const rect = draftImages.value[slot];
		if (e.button !== 0 || !rect) return;
		// Capture on the image box (a corner handle's parent) so moves keep coming.
		const box = (handle === "move" ? e.currentTarget : (e.currentTarget as HTMLElement).parentElement) as HTMLElement;
		box.setPointerCapture(e.pointerId);
		box.focus();
		imageDrag.value = { slot, handle, x: e.clientX, y: e.clientY, rect: { ...rect }, margins: { ...draft.value } };
		e.preventDefault();
	};
	const onImagePointerMove = (e: PointerEvent) => {
		const d = imageDrag.value;
		if (!d) return;
		const delta = { dx: e.clientX - d.x, dy: e.clientY - d.y };
		const rect = d.handle === "move"
			? dragImage(paperInfo.value, d.slot, d.rect, delta, scale.value, d.margins)
			: resizeImage(paperInfo.value, d.slot, d.rect, d.handle, delta, scale.value, d.margins);
		placeImage(d.slot, d.rect, rect, d.margins);
	};
	const onImagePointerUp = () => {
		imageDrag.value = null;
	};
	const onImageKey = (slot: HeaderFooterSlot, e: KeyboardEvent) => {
		const arrow = ARROWS[e.key];
		const rect = draftImages.value[slot];
		if (!arrow || !rect) return;
		e.preventDefault();
		placeImage(slot, rect, nudgeImage(paperInfo.value, slot, rect, arrow, e.shiftKey ? 5 : 1, draft.value), draft.value);
	};

	// ---- artwork / paper ------------------------------------------------
	const paperMismatch = computed(() => {
		if (isHeaderFooter.value) {
			const placedOn = HEADER_FOOTER_SLOTS.map((s) => headerFooterStored.value[s]?.paper).find((p) => p && p !== props.paper);
			return placedOn
				? `These images were placed on ${resolvePaperSize(placedOn).label}. Check that they still sit where you want them on ${paperInfo.value.label}.`
				: null;
		}
		if (props.mode !== "background") return null;
		const prepared = parseStationery(props.settings?.pdf_stationery).background.paper;
		if (!prepared || prepared === props.paper) return null;
		const was = resolvePaperSize(prepared).label;
		return `This artwork was prepared for ${was}. It is scaled to cover ${paperInfo.value.label}, so its edges may be cut off — check the preview, or upload (or re-crop) artwork made for ${paperInfo.value.label}.`;
	});

	// ---- sample preview -------------------------------------------------
	// The page's live settings with this draft's margins in place, so the
	// preview shows what Apply + Save would print.
	const previewSettings = (): CompanySettingsRow | null => {
		if (!props.settings) return null;
		// Built-in: the Layout's margins, exactly as the settings stand.
		if (!editable.value) return props.settings;
		if (isHeaderFooter.value) {
			return { ...props.settings, pdf_stationery: setHeaderFooterGeometry(props.settings.pdf_stationery, { ...draftImages.value, margins: { ...draft.value } }) };
		}
		const setMargins = props.mode === "background" ? setBackgroundMargins : setPreprintedMargins;
		return { ...props.settings, pdf_stationery: setMargins(props.settings.pdf_stationery, { ...draft.value }) };
	};
	const preview = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => sampleStationeryPreviewPayload(previewSettings(), currency.value, props.layout),
		fileName: () => "sample-invoice.pdf",
		title: "Stationery preview"
	});
</script>

<style scoped>
	.legend-printer-band {
		background: repeating-linear-gradient(45deg, rgb(239 68 68 / 0.3) 0 2px, transparent 2px 4px);
	}
</style>
