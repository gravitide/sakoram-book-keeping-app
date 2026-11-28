<template>
	<!-- The page, to scale, with mm rulers. The real Typst render is the page;
		HTML boxes for the items and guides for the safe area sit on top of it,
		so a drag answers instantly while the render catches up (~0.5 s). The
		viewport scrolls when zoomed in; the rulers stay pinned. -->
	<div
		ref="viewportEl"
		class="relative flex h-full min-h-0 min-w-0 overflow-auto bg-(--ui-bg-elevated)"
		@pointerdown.self="emit('select', null)"
	>
		<div
			class="grid m-auto shrink-0"
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
				class="relative bg-white shadow-lg ring-1 ring-black/10 select-none"
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

				<!-- Items: click to select, drag to move, handles to resize, arrows to nudge. -->
				<div
					v-for="box in boxes"
					:key="box.item.id"
					role="group"
					tabindex="0"
					:aria-label="box.label"
					class="group absolute outline-none touch-none cursor-move"
					:class="[
						box.item.id === selectedId ? 'z-20 ring-2 ring-(--ui-primary)' : 'z-10 ring-1 ring-transparent hover:ring-(--ui-primary)/60 focus-visible:ring-(--ui-primary)',
						box.guide ? 'bg-(--ui-primary)/5' : ''
					]"
					:style="box.style"
					@pointerdown="onItemPointerDown(box.item.id, 'move', $event)"
					@pointermove="onPointerMove"
					@pointerup="onPointerUp"
					@pointercancel="onPointerUp"
					@keydown="onItemKey(box.item.id, $event)"
				>
					<span
						v-if="box.guide"
						class="absolute top-1 left-1 rounded bg-(--ui-primary) px-1 text-[9px] font-medium text-white pointer-events-none"
					>Guide</span>
					<template v-if="box.item.id === selectedId">
						<span
							v-for="h in box.handles"
							:key="h"
							class="absolute size-2.5 rounded-sm bg-white ring-1 ring-(--ui-primary)"
							:class="HANDLE_CLASS[h]"
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
	</div>
</template>

<script setup lang="ts">
	// The page designer's canvas (app/pages/designer.vue): draws the page and
	// turns pointer and key gestures into new designs. It owns no state of its
	// own beyond the gesture in flight — every change is emitted (`change`,
	// live; `commit`, once the gesture ends, for the undo history). Geometry
	// and snapping: app/lib/designer-geometry.ts.
	import type { Handle } from "~/lib/designer-geometry";
	import type { DesignItem, MarginsMm, PageDesign } from "~/lib/page-design";
	import { updateItem } from "~/lib/design-draft";
	import { dragMargin, fitScale, handlesFor, itemBox, mmToPx, moveItem, nudgeItem, printerBandRects, resizeItem, rulerTicks, SNAP_DISTANCE_PX } from "~/lib/designer-geometry";
	import { formatMm, itemOnPage } from "~/lib/page-design";
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
	}>();
	const emit = defineEmits<{
		select: [id: string | null]
		change: [design: PageDesign]
		commit: []
		drop: [file: File]
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

	const boxes = computed(() => props.design.items
		.filter((item) => itemOnPage(item.pages, props.page))
		.map((item) => {
			const b = itemBox(item);
			const s = scale.value;
			return {
				item,
				guide: item.type === "image" && item.guide,
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
	type Drag
		= | { kind: "item", id: string, handle: Handle | "move", x: number, y: number, item: DesignItem, design: PageDesign, moved: boolean }
			| { kind: "guide", side: keyof MarginsMm, x: number, y: number, design: PageDesign, moved: boolean };
	const drag = ref<Drag | null>(null);
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
		if (drag.value?.moved) emit("commit");
		drag.value = null;
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
		if (file) emit("drop", file);
	};
</script>

<style scoped>
	.designer-printer-band {
		background: repeating-linear-gradient(45deg, rgb(239 68 68 / 0.16) 0 3px, transparent 3px 7px);
	}
</style>
