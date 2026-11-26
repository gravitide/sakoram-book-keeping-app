<template>
	<UModal
		v-model:open="openModel"
		fullscreen
		:title="`Edit stationery — ${modeLabel}`"
		:description="`${paperInfo.label} · ${paperInfo.widthMm} × ${paperInfo.heightMm} mm. Drag the dashed guides to set the Safe area the content stays inside.`"
		:ui="{ body: 'flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row gap-4' }"
	>
		<template #body>
			<!-- The page, to scale, with mm rulers. Scrolls when zoomed in;
				the rulers stay pinned to its top and left edges. -->
			<div
				ref="viewportEl"
				class="relative flex-1 min-h-0 min-w-0 overflow-auto rounded-md bg-(--ui-bg-elevated) ring-1 ring-(--ui-border)"
			>
				<div
					class="inline-grid"
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
						printer-band
					>
						<!-- Margin guides. A wide transparent hit strip around a 1px
							line; focusable, so arrow keys move them too. -->
						<div
							v-for="g in guides"
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

			<aside class="lg:w-72 shrink-0 space-y-5 overflow-y-auto">
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

				<div>
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
				<UButton color="neutral" variant="outline" @click="cancel">
					Cancel
				</UButton>
				<UButton icon="i-lucide-check" @click="apply">
					Apply
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
	// Header & footer images (#361) will add draggable image boxes to the same
	// page; the guides already live in StationeryPage's slot for that reason.
	import type { PaperSize } from "~/lib/page-settings";
	import type { PdfLayoutKey } from "~/lib/pdf-layouts";
	import type { StationeryMarginsMm } from "~/lib/stationery";
	import type { ArrowDirection, MarginEdge } from "~/lib/stationery-geometry";
	import type { CompanySettingsRow } from "~/stores/settings";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { useStationeryArtwork } from "~/composables/useStationeryArtwork";
	import { resolvePaperSize } from "~/lib/page-settings";
	import { sampleStationeryPreviewPayload } from "~/lib/sample-pdf";
	import { parseStationery, setBackgroundMargins, setPreprintedMargins, STATIONERY_MODES } from "~/lib/stationery";
	import {
		CSS_PX_PER_MM,
		dragMargin,
		fitMargins,
		fitScale,
		marginGuides,
		marginLimits,
		mmToPx,
		nudgeMargin,
		PRINTER_BAND_MM,
		rulerTicks,
		setMargin,
		stepZoom
	} from "~/lib/stationery-geometry";

	const props = defineProps<{
		/** The modes with their own margins. */
		mode: "background" | "preprinted"
		paper: PaperSize
		layout: PdfLayoutKey
		/** The settings page's live (maybe unsaved) values, for the sample preview. */
		settings: CompanySettingsRow | null
	}>();
	const openModel = defineModel<boolean>("open", { required: true });
	const margins = defineModel<StationeryMarginsMm>("margins", { required: true });

	const RULER_PX = 22;
	const GUTTER_PX = 24;
	const EDGES: MarginEdge[] = ["top", "bottom", "left", "right"];
	const EDGE_LABEL: Record<MarginEdge, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };
	// Where each guide's readout sits so it never covers the page edge it measures.
	const LABEL_POSITION: Record<MarginEdge, string> = {
		top: "top-full mt-1 left-1/2 -translate-x-1/2",
		bottom: "bottom-full mb-1 left-1/2 -translate-x-1/2",
		left: "left-full ml-1 top-1/2 -translate-y-1/2",
		right: "right-full mr-1 top-1/2 -translate-y-1/2"
	};

	const paperInfo = computed(() => resolvePaperSize(props.paper));
	const modeLabel = computed(() => STATIONERY_MODES.find((m) => m.key === props.mode)?.label ?? "");
	const artwork = useStationeryArtwork();
	const currency = useActiveCurrency();

	// ---- draft ----------------------------------------------------------
	// Re-seeded on every open: this modal lives on a kept-alive page, so a
	// cancelled edit must not survive to the next open.
	const draft = ref<StationeryMarginsMm>({ ...margins.value });
	const fitted = ref(false);
	/** Relative to "fit the page in the window". */
	const zoom = ref(1);
	/** The guide being dragged, if any. */
	const dragging = ref<MarginEdge | null>(null);
	watch(openModel, (open) => {
		if (!open) return;
		const next = fitMargins(paperInfo.value, margins.value);
		fitted.value = EDGES.some((e) => next[e] !== margins.value[e]);
		draft.value = next;
		zoom.value = 1;
		dragging.value = null;
	});

	const apply = () => {
		margins.value = { ...draft.value };
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

	const limits = computed(() => Object.fromEntries(EDGES.map((e) => [e, marginLimits(paperInfo.value, draft.value, e)])) as Record<MarginEdge, { min: number, max: number }>);

	const onTyped = (edge: MarginEdge, value: number | null | undefined) => {
		if (typeof value !== "number" || !Number.isFinite(value)) return;
		draft.value = setMargin(paperInfo.value, draft.value, edge, value);
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
		draft.value = dragMargin(paperInfo.value, dragStart.margins, dragging.value, { dx: e.clientX - dragStart.x, dy: e.clientY - dragStart.y }, scale.value);
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
		draft.value = nudgeMargin(paperInfo.value, draft.value, edge, arrow, e.shiftKey ? 5 : 1);
	};

	// ---- artwork / paper ------------------------------------------------
	const paperMismatch = computed(() => {
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
