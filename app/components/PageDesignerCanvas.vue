<template>
	<!-- The page, to scale, with mm rulers. The real Typst render is the page;
		HTML boxes for the items and guides for the safe area sit on top of it,
		so a drag answers instantly while the render catches up. The
		viewport scrolls when zoomed in; the rulers stay pinned. -->
	<div
		ref="viewportEl"
		class="relative flex h-full min-h-0 min-w-0 overflow-auto bg-(--ui-bg-elevated)"
		:class="panning ? (panDrag ? 'cursor-grabbing' : 'cursor-grab') : ''"
		@pointerdown.capture="onPanStart"
		@pointermove="onPanMove"
		@pointerup="onPanEnd"
		@pointercancel="onPanEnd"
		@pointerdown.self="emit('select', null)"
	>
		<!-- While panning, nothing on the page takes the pointer: a drag anywhere moves the view. -->
		<div
			class="grid m-auto shrink-0"
			:class="panning ? 'pointer-events-none' : ''"
			:style="{
				gridTemplateColumns: `${RULER_PX}px ${pagePx.w}px`,
				gridTemplateRows: `${RULER_PX}px ${pagePx.h}px`,
				padding: `${GUTTER_PX}px`
			}"
		>
			<div class="sticky top-0 left-0 z-30 bg-(--ui-bg-elevated)" />
			<div class="sticky top-0 z-20 bg-(--ui-bg-elevated) border-b border-(--ui-border) overflow-hidden relative" aria-hidden="true">
				<template v-for="t in topTicks" :key="t.mm">
					<span class="absolute bottom-0 w-px bg-(--ui-text-dimmed)" :style="{ left: `${t.px}px`, height: t.major ? '9px' : '4px' }" />
					<span v-if="t.label" class="absolute top-0.5 text-[9px] leading-none text-(--ui-text-muted) tabular-nums" :style="{ left: `${t.px + 2}px` }">{{ t.label }}</span>
				</template>
			</div>
			<div class="sticky left-0 z-20 bg-(--ui-bg-elevated) border-r border-(--ui-border) overflow-hidden relative" aria-hidden="true">
				<template v-for="t in leftTicks" :key="t.mm">
					<span class="absolute right-0 h-px bg-(--ui-text-dimmed)" :style="{ top: `${t.px}px`, width: t.major ? '9px' : '4px' }" />
					<span v-if="t.label" class="absolute left-0.5 text-[9px] leading-none text-(--ui-text-muted) tabular-nums" :style="{ top: `${t.px + 2}px` }">{{ t.label }}</span>
				</template>
			</div>

			<!-- The page: white in both themes, it previews the paper. -->
			<div
				class="relative isolate bg-white shadow-lg ring-1 ring-black/10 select-none"
				:class="dropOver ? 'ring-2 ring-(--ui-primary)' : ''"
				:style="{ width: `${pagePx.w}px`, height: `${pagePx.h}px` }"
				@pointerdown.self="emit('select', null)"
				@dragover.prevent="dropOver = true"
				@dragenter.prevent="dropOver = true"
				@dragleave.prevent="dropOver = false"
				@drop.prevent="onDrop"
			>
				<img
					v-if="renderUrl"
					:src="renderUrl"
					alt=""
					class="absolute inset-0 size-full pointer-events-none transition-opacity"
					:class="rendering ? 'opacity-80' : 'opacity-100'"
					draggable="false"
				>
				<!-- A render that fails says so: the page under it is stale or blank,
					and an image that breaks the render breaks every PDF. -->
				<div
					v-if="error"
					role="alert"
					class="absolute inset-x-3 top-3 z-40 rounded-md bg-(--ui-bg) ring-1 ring-(--ui-error)/40 px-3 py-2 text-xs text-(--ui-error) shadow-sm pointer-events-none"
				>
					This page can't be drawn — PDFs would fail too. Undo the last change or remove the image that caused it.
					<span class="block text-(--ui-text-muted) mt-0.5 truncate">{{ error }}</span>
				</div>
				<div v-else-if="rendering || !renderUrl" class="absolute top-2 right-2 pointer-events-none">
					<UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-zinc-400" />
				</div>

				<!-- Where a dragged item was: the render still draws it there until
					the next one lands, so it's papered over (see "ghosts"). -->
				<div
					v-for="c in ghostCovers"
					:key="c.id"
					class="absolute bg-white/90 pointer-events-none"
					:style="c.style"
				/>

				<!-- The printer band: most printers can't print within 5 mm of the
					edge. Information only — nothing snaps to it or is refused for
					crossing it. -->
				<div
					v-for="(band, i) in printerBands"
					:key="i"
					class="absolute designer-printer-band pointer-events-none"
					:style="band"
				/>

				<!-- The safe area: where the document's own content goes. -->
				<div
					class="absolute border border-dashed border-(--ui-primary) pointer-events-none"
					:style="safeAreaStyle"
				/>

				<!-- Items: click to select, drag to move, handles to resize, arrows to nudge.
					The selected one sits above the safe-area guides (z-30), so it can
					always be dragged even where a guide crosses it; the others sit
					below, so a full-page background never blocks the guides (not even selected). -->
				<div
					v-for="box in boxes"
					:key="box.item.id"
					role="group"
					tabindex="0"
					:aria-label="box.label"
					class="group absolute outline-none touch-none cursor-move"
					:class="[
						box.item.id === selectedId ? `${box.coversPage ? 'z-20' : 'z-[35]'} ring-2 ring-(--ui-primary)` : 'z-10 ring-1 ring-transparent hover:ring-(--ui-primary)/60 focus-visible:ring-(--ui-primary)',
						box.guide ? 'bg-(--ui-primary)/5' : ''
					]"
					:style="box.style"
					@pointerdown="onItemPointerDown(box.item.id, 'move', $event)"
					@pointermove="onPointerMove"
					@pointerup="onPointerUp"
					@pointercancel="onPointerUp"
					@keydown="onItemKey(box.item.id, $event)"
					@dblclick="onItemDblClick(box.item)"
				>
					<!-- The item's own pixels, cut from the last render, riding along
						with the box until a render with it in its new place arrives. -->
					<div
						v-if="box.ghost"
						class="absolute inset-0 overflow-hidden pointer-events-none"
						:style="box.ghost"
					/>
					<!-- An empty image slot: prints nothing, invites a file. -->
					<div
						v-if="box.slot"
						class="absolute inset-0 flex flex-col items-center justify-center gap-1 border border-dashed border-zinc-400 bg-zinc-50/60 text-zinc-500 pointer-events-none"
					>
						<UIcon name="i-lucide-image-plus" class="size-5" />
						<span class="text-xs font-medium">{{ box.guide ? "Drop a scan of your paper" : "Drop an image" }}</span>
					</div>
					<span
						v-if="box.guide"
						class="absolute top-1 left-1 rounded bg-(--ui-primary) px-1 text-[9px] font-medium text-white pointer-events-none"
					>Guide · not printed</span>
					<!-- Over the safe area: allowed (watermarks), but said. A press on it
						still reaches the box, so it drags like the rest. -->
					<span
						v-if="box.overlap"
						class="absolute top-1 right-1 flex rounded bg-amber-500 p-0.5 text-white"
						title="Overlaps the safe area: the document prints on top of it"
						aria-label="Overlaps the safe area"
					>
						<UIcon name="i-lucide-triangle-alert" class="size-3" />
					</span>
					<template v-if="box.item.id === selectedId">
						<span
							v-for="h in box.handles"
							:key="h"
							class="absolute size-2.5 rounded-sm bg-white ring-1 ring-(--ui-primary)"
							:class="handleClass(box.item, h)"
							@pointerdown.stop="onItemPointerDown(box.item.id, h, $event)"
						/>
						<span class="absolute top-full mt-1 left-0 whitespace-nowrap rounded bg-(--ui-primary) px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums pointer-events-none">
							{{ box.size }}
						</span>
					</template>
				</div>

				<!-- Safe-area guides: a wide transparent hit strip around a 1px line. -->
				<div
					v-for="g in guides"
					:key="g.side"
					role="slider"
					tabindex="0"
					:aria-label="`${g.label} margin`"
					:aria-valuenow="design.margins[g.side]"
					:aria-valuetext="`${formatMm(design.margins[g.side])} mm`"
					class="group absolute z-30 flex items-center justify-center outline-none touch-none"
					:class="g.axis === 'y' ? 'left-0 right-0 h-3 -translate-y-1/2 cursor-row-resize' : 'top-0 bottom-0 w-3 -translate-x-1/2 cursor-col-resize'"
					:style="g.axis === 'y' ? { top: `${g.px}px` } : { left: `${g.px}px` }"
					@pointerdown="onGuidePointerDown(g.side, $event)"
					@pointermove="onPointerMove"
					@pointerup="onPointerUp"
					@pointercancel="onPointerUp"
					@keydown="onGuideKey(g.side, $event)"
				>
					<!-- The guide runs edge to edge, so the safe area reads across
						the whole page (as rulers would draw it). -->
					<span
						class="bg-(--ui-primary) transition-opacity"
						:class="[g.axis === 'y' ? 'h-px w-full' : 'w-px h-full', draggingGuide(g.side) ? 'opacity-100' : 'opacity-50 group-hover:opacity-100 group-focus-visible:opacity-100']"
					/>
					<span
						class="absolute whitespace-nowrap rounded bg-(--ui-primary) px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums pointer-events-none transition-opacity"
						:class="[GUIDE_LABEL_POSITION[g.side], draggingGuide(g.side) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100']"
					>
						{{ g.label }} {{ formatMm(design.margins[g.side]) }} mm
					</span>
				</div>
			</div>
		</div>

		<!-- Text measured as the page will wrap it (fonts, size, width at 10 px
			per mm), so a text box's outline is as tall as its text. Never seen. -->
		<div class="invisible absolute left-0 top-0 size-0 overflow-hidden pointer-events-none" aria-hidden="true">
			<div
				v-for="m in measureItems"
				:key="m.id"
				:ref="(el) => setMeasureEl(m.id, el as HTMLElement | null)"
				class="absolute left-0 top-0 whitespace-pre-wrap break-words"
				:style="m.style"
			>
				{{ m.content }}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	// The page designer's canvas (app/pages/designer.vue): draws the page and
	// turns pointer and key gestures into new designs. It owns no state of its
	// own beyond the gesture in flight — every change is emitted (`change`,
	// live; `commit`, once the gesture ends, for the undo history). Geometry
	// and snapping: app/lib/designer-geometry.ts.
	import type { Handle, MmRect } from "~/lib/designer-geometry";
	import type { DesignItem, MarginsMm, PageDesign } from "~/lib/page-design";
	import { updateItem } from "~/lib/design-draft";
	import { dragMargin, fitScale, handlesFor, itemBox, mmToPx, moveItem, nudgeItem, overlapWarning, printerBandRects, resizeItem, rulerTicks, slotAt, SNAP_DISTANCE_PX } from "~/lib/designer-geometry";
	import { formatMm, itemOnPage } from "~/lib/page-design";
	import { resolveDesignLines } from "~/lib/page-design-text";
	import { resolvePaperSize } from "~/lib/paper-sizes";

	const props = defineProps<{
		design: PageDesign
		selectedId: string | null
		renderUrl: string | null
		rendering: boolean
		/** The last render's error, if it failed. */
		error?: string | null
		page: 1 | 2
		/** Relative to "fit the page in the window" (designer-geometry ZOOM_LEVELS). */
		zoom: number
		/** The hand tool: a drag pans the view instead of selecting or moving. */
		pan?: boolean
		/** Company field values (tokenValuesFromSettings), for measuring text boxes. */
		fieldValues: Record<string, string>
	}>();
	const emit = defineEmits<{
		select: [id: string | null]
		change: [design: PageDesign]
		/** `now`: a pointer drag ended — render it without the usual pause. */
		commit: [now?: boolean]
		/** A text box or page number was double-clicked: open its editor. */
		edit: [id: string]
		/** A file dropped on the page; `slotId`: the empty image slot it landed on, if any. */
		drop: [file: File, slotId: string | null]
		scale: [scale: number]
	}>();

	const RULER_PX = 22;
	const GUTTER_PX = 24;
	const HANDLE_CLASS: Record<Handle, string> = {
		nw: "-top-1.5 -left-1.5 cursor-nwse-resize",
		ne: "-top-1.5 -right-1.5 cursor-nesw-resize",
		sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
		se: "-bottom-1.5 -right-1.5 cursor-nwse-resize",
		w: "top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize",
		e: "top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize",
		end: "top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize"
	};
	// A vertical line ends at its bottom.
	const END_VERTICAL_CLASS = "left-1/2 -translate-x-1/2 -bottom-1.5 cursor-ns-resize";
	const handleClass = (item: DesignItem, h: Handle) =>
		(h === "end" && item.type === "line" && item.vertical ? END_VERTICAL_CLASS : HANDLE_CLASS[h]);
	const SIDES: { side: keyof MarginsMm, label: string, axis: "x" | "y" }[] = [
		{ side: "top", label: "Top", axis: "y" },
		{ side: "bottom", label: "Bottom", axis: "y" },
		{ side: "left", label: "Left", axis: "x" },
		{ side: "right", label: "Right", axis: "x" }
	];
	// Where each guide's readout sits, so it never covers the edge it measures.
	const GUIDE_LABEL_POSITION: Record<keyof MarginsMm, string> = {
		top: "top-full mt-1 left-1/2 -translate-x-1/2",
		bottom: "bottom-full mb-1 left-1/2 -translate-x-1/2",
		left: "left-full ml-1 top-1/2 -translate-y-1/2",
		right: "right-full mr-1 top-1/2 -translate-y-1/2"
	};
	const KIND_LABEL: Record<DesignItem["type"], string> = { image: "Image", text: "Text", page_number: "Page number", line: "Line" };

	// ---- zoom -------------------------------------------------------------------
	const viewportEl = useTemplateRef<HTMLElement>("viewportEl");
	const viewport = ref({ w: 900, h: 700 });
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

	// ---- panning ------------------------------------------------------------------
	// The hand tool (the toolbar's toggle, H), Space held down, or a middle-button
	// drag: the view follows the pointer, like grabbing the paper.
	const spaceHeld = ref(false);
	const panning = computed(() => props.pan || spaceHeld.value);
	const panDrag = ref<{ x: number, y: number, left: number, top: number } | null>(null);
	const isTyping = (t: EventTarget | null) => {
		const el = t as HTMLElement | null;
		return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || !!el.closest?.("[role=dialog]"));
	};
	const onSpace = (e: KeyboardEvent) => {
		if (e.code !== "Space" || isTyping(e.target)) return;
		e.preventDefault(); // no page scroll / button press while held
		spaceHeld.value = e.type === "keydown";
	};
	const onBlur = () => {
		spaceHeld.value = false;
	};
	onMounted(() => {
		window.addEventListener("keydown", onSpace);
		window.addEventListener("keyup", onSpace);
		window.addEventListener("blur", onBlur);
	});
	onBeforeUnmount(() => {
		window.removeEventListener("keydown", onSpace);
		window.removeEventListener("keyup", onSpace);
		window.removeEventListener("blur", onBlur);
	});

	const onPanStart = (e: PointerEvent) => {
		const el = viewportEl.value;
		if (!el || !(e.button === 1 || (e.button === 0 && panning.value))) return;
		e.preventDefault();
		e.stopPropagation(); // the page's items never see this press
		el.setPointerCapture(e.pointerId);
		panDrag.value = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
	};
	const onPanMove = (e: PointerEvent) => {
		const el = viewportEl.value;
		const d = panDrag.value;
		if (!el || !d) return;
		el.scrollLeft = d.left - (e.clientX - d.x);
		el.scrollTop = d.top - (e.clientY - d.y);
	};
	const onPanEnd = () => {
		panDrag.value = null;
	};

	const paper = computed(() => resolvePaperSize(props.design.paper));
	const scale = computed(() => fitScale(paper.value, viewport.value, GUTTER_PX + RULER_PX) * props.zoom);
	watch(scale, (s) => emit("scale", s), { immediate: true });
	const pagePx = computed(() => ({ w: mmToPx(paper.value.widthMm, scale.value), h: mmToPx(paper.value.heightMm, scale.value) }));
	const topTicks = computed(() => rulerTicks(paper.value.widthMm, scale.value));
	const leftTicks = computed(() => rulerTicks(paper.value.heightMm, scale.value));

	// ---- what's drawn -------------------------------------------------------------
	const safeAreaStyle = computed(() => {
		const m = props.design.margins;
		const s = scale.value;
		return { left: `${m.left * s}px`, top: `${m.top * s}px`, right: `${m.right * s}px`, bottom: `${m.bottom * s}px` };
	});

	const sizeLabel = (item: DesignItem) => {
		if (item.type === "line") return `${formatMm(item.length)} mm`;
		const b = itemBox(item);
		return item.type === "image" ? `${formatMm(b.w)} × ${formatMm(b.h)} mm` : `${formatMm(b.w)} mm wide`;
	};

	// The gesture in flight (see "gestures" below).
	type Drag
		= | { kind: "item", id: string, handle: Handle | "move", x: number, y: number, item: DesignItem, design: PageDesign, moved: boolean }
			| { kind: "guide", side: keyof MarginsMm, x: number, y: number, design: PageDesign, moved: boolean };
	const drag = ref<Drag | null>(null);

	// ---- ghosts ---------------------------------------------------------------------
	// The render only follows the committed design, and takes a moment. So a
	// dragged item carries its pixels from the last render (a background-image
	// crop of it, scaled when an image or line is resized; text is cut, not
	// stretched), and its old spot is papered over, until a fresh render lands.
	// Keyed by item: a second drag can start before the first one's render.
	const ghosts = ref<Record<string, { from: MmRect, url: string }>>({});
	watch(() => props.renderUrl, () => {
		// A new render shows the committed design: every finished drag is in it.
		// The item being dragged right now is still at its drag-start place there.
		const d = drag.value;
		const keep = d?.kind === "item" && d.moved && props.renderUrl ? d : null;
		ghosts.value = keep ? { [keep.id]: { from: itemBox(keep.item), url: props.renderUrl! } } : {};
	});
	const startGhost = (id: string, item: DesignItem) => {
		if (ghosts.value[id] || !props.renderUrl) return;
		ghosts.value = { ...ghosts.value, [id]: { from: itemBox(item), url: props.renderUrl } };
	};
	const pxRect = (r: MmRect) => {
		const s = scale.value;
		return { left: `${r.x * s}px`, top: `${r.y * s}px`, width: `${r.w * s}px`, height: `${r.h * s}px` };
	};
	const ghostCovers = computed(() => Object.entries(ghosts.value).map(([id, g]) => ({ id, style: pxRect(g.from) })));
	const ghostStyle = (item: DesignItem, now: MmRect) => {
		const g = ghosts.value[item.id];
		if (!g) return null;
		const stretch = item.type === "image" || item.type === "line";
		const sx = stretch && g.from.w > 0 ? now.w / g.from.w : 1;
		const sy = stretch && g.from.h > 0 ? now.h / g.from.h : 1;
		const s = scale.value;
		return {
			backgroundImage: `url("${g.url}")`,
			backgroundRepeat: "no-repeat",
			backgroundSize: `${pagePx.value.w * sx}px ${pagePx.value.h * sy}px`,
			backgroundPosition: `${-g.from.x * s * sx}px ${-g.from.y * s * sy}px`
		};
	};

	// ---- measured text --------------------------------------------------------------
	const MEASURE_PX_PER_MM = 10;
	const PAGE_NUMBER_SAMPLE = { page_of_total: "Page 1 of 3", slash: "1 / 3", number: "1" } as const;
	const measureItems = computed(() => props.design.items.flatMap((item) => {
		if (item.type !== "text" && item.type !== "page_number") return [];
		const st = item.style;
		const content = item.type === "text"
			? resolveDesignLines(item.text, props.fieldValues, { keepEmpty: true }).map((l) => l.text).join("\n")
			: PAGE_NUMBER_SAMPLE[item.format];
		return [{
			id: item.id,
			content,
			style: {
				width: `${item.w * MEASURE_PX_PER_MM}px`,
				fontFamily: `"${st.font}", "Inter", sans-serif`,
				fontSize: `${st.size * 0.3528 * MEASURE_PX_PER_MM}px`,
				fontWeight: st.bold ? 700 : 400,
				fontStyle: st.italic ? "italic" : "normal",
				textAlign: st.align,
				lineHeight: 1.25
			}
		}];
	}));
	const measureEls = new Map<string, HTMLElement>();
	const setMeasureEl = (id: string, el: HTMLElement | null) => {
		if (el) measureEls.set(id, el);
		else measureEls.delete(id);
	};
	const measured = ref<Record<string, number>>({});
	const readMeasured = () => {
		const next: Record<string, number> = {};
		for (const [id, el] of measureEls) next[id] = el.offsetHeight / MEASURE_PX_PER_MM;
		measured.value = next;
	};
	// Only re-read when what's measured changes (not on every drag move).
	watch(() => JSON.stringify(measureItems.value), readMeasured, { flush: "post", immediate: true });
	onMounted(() => {
		void document.fonts?.ready.then(readMeasured);
	});

	const boxes = computed(() => props.design.items
		.filter((item) => itemOnPage(item.pages, props.page))
		.map((item) => {
			const b = itemBox(item, measured.value[item.id]);
			const s = scale.value;
			return {
				ghost: ghostStyle(item, b),
				item,
				guide: item.type === "image" && item.guide,
				slot: item.type === "image" && item.src === null,
				overlap: overlapWarning(item, props.design, measured.value[item.id]),
				// A background: raising it over the guides would hide every one of them.
				coversPage: b.w >= paper.value.widthMm - 0.5 && b.h >= paper.value.heightMm - 0.5,
				handles: handlesFor(item),
				size: sizeLabel(item),
				label: `${KIND_LABEL[item.type]}, ${sizeLabel(item)}, ${formatMm(item.x)} mm from the left, ${formatMm(item.y)} mm from the top`,
				style: { left: `${b.x * s}px`, top: `${b.y * s}px`, width: `${b.w * s}px`, height: `${b.h * s}px` }
			};
		}));

	const printerBands = computed(() => printerBandRects(paper.value).map((r) => {
		const s = scale.value;
		return { left: `${r.x * s}px`, top: `${r.y * s}px`, width: `${r.w * s}px`, height: `${r.h * s}px` };
	}));

	const guides = computed(() => SIDES.map((g) => {
		const m = props.design.margins;
		const W = paper.value.widthMm;
		const H = paper.value.heightMm;
		const mm = g.side === "top" ? m.top : g.side === "bottom" ? H - m.bottom : g.side === "left" ? m.left : W - m.right;
		return { ...g, px: mm * scale.value };
	}));

	// ---- gestures -----------------------------------------------------------------
	const draggingGuide = (side: keyof MarginsMm) => drag.value?.kind === "guide" && drag.value.side === side;
	const threshold = (e: PointerEvent) => (e.altKey ? 0 : SNAP_DISTANCE_PX / scale.value);

	const onItemPointerDown = (id: string, handle: Handle | "move", e: PointerEvent) => {
		if (e.button !== 0) return;
		const item = props.design.items.find((i) => i.id === id);
		if (!item) return;
		// Capture on the item box (a handle's parent) so moves keep coming.
		const box = (handle === "move" ? e.currentTarget : (e.currentTarget as HTMLElement).parentElement) as HTMLElement;
		box.setPointerCapture(e.pointerId);
		box.focus();
		emit("select", id);
		drag.value = { kind: "item", id, handle, x: e.clientX, y: e.clientY, item, design: props.design, moved: false };
		e.preventDefault();
	};

	const onGuidePointerDown = (side: keyof MarginsMm, e: PointerEvent) => {
		if (e.button !== 0) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		(e.currentTarget as HTMLElement).focus();
		drag.value = { kind: "guide", side, x: e.clientX, y: e.clientY, design: props.design, moved: false };
		e.preventDefault();
	};

	const onPointerMove = (e: PointerEvent) => {
		const d = drag.value;
		if (!d) return;
		const dx = (e.clientX - d.x) / scale.value;
		const dy = (e.clientY - d.y) / scale.value;
		if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 2) return;
		if (!d.moved && d.kind === "item") startGhost(d.id, d.item);
		d.moved = true;
		if (d.kind === "guide") {
			const axisDelta = d.side === "top" || d.side === "bottom" ? dy : dx;
			emit("change", { ...d.design, margins: dragMargin(d.design.margins, d.side, axisDelta, d.design.paper, threshold(e)) });
			return;
		}
		const next = d.handle === "move"
			? moveItem(d.item, dx, dy, d.design, threshold(e))
			: resizeItem(d.item, d.handle, dx, dy, d.design, threshold(e));
		emit("change", updateItem(d.design, next));
	};

	const onPointerUp = () => {
		if (drag.value?.moved) emit("commit", true);
		drag.value = null;
	};

	const onItemDblClick = (item: DesignItem) => {
		if (item.type === "text" || item.type === "page_number") emit("edit", item.id);
	};

	const ARROWS: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

	const onItemKey = (id: string, e: KeyboardEvent) => {
		const dir = ARROWS[e.key];
		const item = props.design.items.find((i) => i.id === id);
		if (!dir || !item) return;
		e.preventDefault();
		emit("change", updateItem(props.design, nudgeItem(item, dir, e.shiftKey ? 5 : 1, props.design)));
		emit("commit");
	};

	const onGuideKey = (side: keyof MarginsMm, e: KeyboardEvent) => {
		const dir = ARROWS[e.key];
		if (!dir) return;
		const vertical = side === "top" || side === "bottom";
		if (vertical !== (dir === "up" || dir === "down")) return;
		e.preventDefault();
		const step = (e.shiftKey ? 5 : 1) * (dir === "up" || dir === "left" ? -1 : 1);
		emit("change", { ...props.design, margins: dragMargin(props.design.margins, side, step, props.design.paper, 0) });
		emit("commit");
	};

	// ---- dropped files -------------------------------------------------------------
	const dropOver = ref(false);
	const onDrop = (e: DragEvent) => {
		dropOver.value = false;
		const file = e.dataTransfer?.files?.[0];
		if (!file) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = (e.clientX - rect.left) / scale.value;
		const y = (e.clientY - rect.top) / scale.value;
		emit("drop", file, slotAt(props.design, props.page, x, y));
	};
</script>

<style scoped>
	.designer-printer-band {
		background: repeating-linear-gradient(45deg, rgb(239 68 68 / 0.16) 0 3px, transparent 3px 7px);
	}
</style>
