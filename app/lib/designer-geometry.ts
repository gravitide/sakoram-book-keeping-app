// Geometry for the page designer's canvas (app/components/PageDesignerCanvas.vue):
// zoom, rulers, where each item's box is, and how a drag or a resize moves an
// item — snapping to the page, the safe area and the other items, and never
// leaving the page. All in millimetres from the page's top-left; the canvas
// converts pointer pixels with the zoom's scale (px per mm).
//
// The zoom / ruler / snapValue helpers are ported from the old Stationery
// editor (git 3005ffe app/lib/stationery-geometry.ts).
//
// Pure, store-free, relative imports only (vitest).

import type { DesignItem, MarginsMm, PageDesign } from "./page-design";
import type { PaperSize } from "./paper-sizes";
import { resolvePaperSize } from "./paper-sizes";

/** A CSS pixel is 1/96 inch, so this many px is one millimetre at 100 %. */
export const CSS_PX_PER_MM = 96 / 25.4;
/** How close (on screen) a dragged edge must come to a target to snap to it. */
export const SNAP_DISTANCE_PX = 6;
/** Zoom levels relative to "fit the page in the window". */
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
/** The smallest an item's width, height or length may be. */
export const MIN_ITEM_MM = 5;
/** The safe area can't be squeezed thinner than this, either way. */
export const MIN_SAFE_AREA_MM = 40;
/** A point is this many millimetres. */
const PT_MM = 0.3528;
/** Text line height, as a multiple of the font size (a box estimate; Typst lays the text out). */
const LINE_HEIGHT = 1.25;
/** The thinnest a line's box gets, so a hairline can still be grabbed. */
const MIN_LINE_BOX_MM = 2;

export interface PageDims { widthMm: number, heightMm: number }
export interface MmRect { x: number, y: number, w: number, h: number }
export type Handle = "nw" | "ne" | "sw" | "se" | "w" | "e" | "end";

export const mmToPx = (mm: number, scale: number): number => mm * scale;
export const pxToMm = (px: number, scale: number): number => px / scale;

/** The scale (px per mm) at which the whole page fits the viewport, less a gutter on every side. */
export function fitScale(page: PageDims, viewport: { w: number, h: number }, gutterPx: number): number {
	const w = Math.max(1, viewport.w - 2 * gutterPx);
	const h = Math.max(1, viewport.h - 2 * gutterPx);
	return Math.min(w / page.widthMm, h / page.heightMm);
}

/** The next zoom level up (+1) or down (−1) from `zoom`; stays put at either end. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
	const levels = direction > 0 ? ZOOM_LEVELS : [...ZOOM_LEVELS].reverse();
	return levels.find((z) => (direction > 0 ? z > zoom + 1e-9 : z < zoom - 1e-9)) ?? zoom;
}

export interface SnapOptions {
	/** Grid step; the value is rounded to it when no target is near. */
	step: number
	/** Values worth landing on exactly. */
	targets?: readonly number[]
	/** How close a target must be to win, in the value's own unit. */
	threshold?: number
}

/** The nearest target within the threshold, otherwise the value rounded to the step. */
export function snapValue(value: number, { step, targets = [], threshold = 0 }: SnapOptions): number {
	let best: number | null = null;
	for (const t of targets) {
		if (Math.abs(t - value) <= threshold && (best === null || Math.abs(t - value) < Math.abs(best - value))) best = t;
	}
	return best ?? Math.round(value / step) * step;
}

export interface RulerTick { mm: number, px: number, major: boolean, label: string | null }

const MIN_TICK_PX = 4;
const MIN_LABEL_PX = 24;
const TICK_STEPS = [1, 2, 5, 10, 20, 50] as const;
const LABEL_STEPS = [10, 20, 50, 100] as const;

/** Ruler ticks along a page edge `lengthMm` long, thinned to suit the zoom. */
export function rulerTicks(lengthMm: number, scale: number): RulerTick[] {
	const step = TICK_STEPS.find((s) => s * scale >= MIN_TICK_PX) ?? 50;
	const labelEvery = Math.max(step, LABEL_STEPS.find((s) => s * scale >= MIN_LABEL_PX) ?? 100);
	const ticks: RulerTick[] = [];
	for (let mm = 0; mm <= lengthMm + 1e-9; mm += step) {
		const major = mm % labelEvery === 0;
		ticks.push({ mm, px: mm * scale, major, label: major ? String(mm) : null });
	}
	return ticks;
}

// ---- item boxes ----------------------------------------------------------------

const textHeight = (lines: number, sizePt: number) => Math.max(1, lines) * sizePt * PT_MM * LINE_HEIGHT;

/** Where an item sits on the page (its grab box). Text height is an estimate from its line count. */
export function itemBox(item: DesignItem): MmRect {
	switch (item.type) {
		case "image":
			return { x: item.x, y: item.y, w: item.w, h: item.h };
		case "text":
			return { x: item.x, y: item.y, w: item.w, h: textHeight(item.text.split("\n").length, item.style.size) };
		case "page_number":
			return { x: item.x, y: item.y, w: item.w, h: textHeight(1, item.style.size) };
		default: {
			const t = Math.max(item.thickness * PT_MM, MIN_LINE_BOX_MM);
			return item.vertical
				? { x: item.x - t / 2, y: item.y, w: t, h: item.length }
				: { x: item.x, y: item.y - t / 2, w: item.length, h: t };
		}
	}
}

/** The resize handles an item offers. */
export function handlesFor(item: DesignItem): Handle[] {
	if (item.type === "image") return ["nw", "ne", "sw", "se"];
	if (item.type === "line") return ["end"];
	return ["w", "e"];
}

/** Lines worth snapping to: the page's edges and centre, the safe area, and every other item's edges and centre. */
export function snapTargets(design: PageDesign, excludeId: string | null): { xs: number[], ys: number[] } {
	const { widthMm: W, heightMm: H } = resolvePaperSize(design.paper);
	const m = design.margins;
	const xs = [0, W / 2, W, m.left, W - m.right];
	const ys = [0, H / 2, H, m.top, H - m.bottom];
	for (const item of design.items) {
		if (item.id === excludeId) continue;
		const b = itemBox(item);
		xs.push(b.x, b.x + b.w / 2, b.x + b.w);
		ys.push(b.y, b.y + b.h / 2, b.y + b.h);
	}
	return { xs, ys };
}

// How far an item reaches from its own x / y, along each axis (what must stay on the page).
function reach(item: DesignItem): { w: number, h: number } {
	if (item.type === "line") return item.vertical ? { w: 0, h: item.length } : { w: item.length, h: 0 };
	const b = itemBox(item);
	return { w: b.w, h: b.h };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The shift that lands the nearest of `features` on a target within `threshold`, or null. */
function snapShift(features: number[], targets: number[], threshold: number): number | null {
	let best: number | null = null;
	for (const f of features) {
		for (const t of targets) {
			const d = t - f;
			if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
		}
	}
	return best;
}

/**
 * An item with a typed position or size put back on the page: an image or text
 * box no larger than the page (images keep their proportions), then moved so
 * all of it is on the page.
 */
export function clampItem<T extends DesignItem>(item: T, design: PageDesign): T {
	const page = resolvePaperSize(design.paper);
	let next: DesignItem = item;
	if (next.type === "image") {
		const s = Math.min(1, page.widthMm / next.w, page.heightMm / next.h);
		next = { ...next, w: Math.max(MIN_ITEM_MM, next.w * s), h: Math.max(MIN_ITEM_MM, next.h * s) };
	} else if (next.type === "text" || next.type === "page_number") {
		next = { ...next, w: clamp(next.w, MIN_ITEM_MM, page.widthMm - Math.min(next.x, page.widthMm - MIN_ITEM_MM)) };
	} else {
		next = { ...next, length: clamp(next.length, MIN_ITEM_MM, next.vertical ? page.heightMm : page.widthMm) };
	}
	return keepOnPage(next as T, page);
}

function keepOnPage<T extends DesignItem>(item: T, page: PageDims): T {
	const r = reach(item);
	return { ...item, x: clamp(item.x, 0, page.widthMm - r.w), y: clamp(item.y, 0, page.heightMm - r.h) };
}

/** An item dragged by (dx, dy) mm: an edge or its centre snaps to a target, else whole millimetres; always on the page. */
export function moveItem<T extends DesignItem>(item: T, dx: number, dy: number, design: PageDesign, thresholdMm: number): T {
	const page = resolvePaperSize(design.paper);
	const { xs, ys } = snapTargets(design, item.id);
	const b = itemBox(item);
	const bx = b.x + dx;
	const by = b.y + dy;
	const sx = snapShift([bx, bx + b.w / 2, bx + b.w], xs, thresholdMm);
	const sy = snapShift([by, by + b.h / 2, by + b.h], ys, thresholdMm);
	const x = sx !== null ? item.x + dx + sx : Math.round(item.x + dx);
	const y = sy !== null ? item.y + dy + sy : Math.round(item.y + dy);
	return keepOnPage({ ...item, x, y }, page);
}

/** An item moved by the arrow keys: exactly `stepMm`, no snapping, kept on the page. */
export function nudgeItem<T extends DesignItem>(item: T, dir: "up" | "down" | "left" | "right", stepMm: number, design: PageDesign): T {
	const page = resolvePaperSize(design.paper);
	const dx = dir === "left" ? -stepMm : dir === "right" ? stepMm : 0;
	const dy = dir === "up" ? -stepMm : dir === "down" ? stepMm : 0;
	return keepOnPage({ ...item, x: item.x + dx, y: item.y + dy }, page);
}

/** A moving edge at `value`: snapped to a target within the threshold, else to whole millimetres. */
const snapEdge = (value: number, targets: number[], threshold: number) => snapValue(value, { step: 1, targets, threshold });

/** An item resized from one of its handles by (dx, dy) mm. Images keep their proportions; nothing leaves the page or shrinks below MIN_ITEM_MM. */
export function resizeItem<T extends DesignItem>(item: T, handle: Handle, dx: number, dy: number, design: PageDesign, thresholdMm: number): T {
	const page = resolvePaperSize(design.paper);
	const { xs, ys } = snapTargets(design, item.id);
	const W = page.widthMm;
	const H = page.heightMm;

	if (item.type === "image") {
		const east = handle === "ne" || handle === "se";
		const south = handle === "sw" || handle === "se";
		const aspect = item.w / item.h;
		const right = item.x + item.w;
		const bottom = item.y + item.h;
		const edge = east ? right + dx : item.x + dx;
		const snapped = snapEdge(edge, xs, thresholdMm);
		let w = east ? snapped - item.x : right - snapped;
		const maxW = Math.min(east ? W - item.x : right, (south ? H - item.y : bottom) * aspect);
		w = clamp(w, MIN_ITEM_MM * Math.max(1, aspect), maxW);
		const h = w / aspect;
		return { ...item, w, h, x: east ? item.x : right - w, y: south ? item.y : bottom - h };
	}

	if (item.type === "line") {
		const start = item.vertical ? item.y : item.x;
		const end = snapEdge(start + item.length + (item.vertical ? dy : dx), item.vertical ? ys : xs, thresholdMm);
		const length = clamp(end - start, MIN_ITEM_MM, (item.vertical ? H : W) - start);
		return { ...item, length };
	}

	if (item.type === "text" || item.type === "page_number") {
		const right = item.x + item.w;
		if (handle === "w") {
			const x = clamp(snapEdge(item.x + dx, xs, thresholdMm), 0, right - MIN_ITEM_MM);
			return { ...item, x, w: right - x };
		}
		const edge = clamp(snapEdge(right + dx, xs, thresholdMm), item.x + MIN_ITEM_MM, W);
		return { ...item, w: edge - item.x };
	}
	return item;
}

// ---- the safe area ----------------------------------------------------------------

const OPPOSITE: Record<keyof MarginsMm, keyof MarginsMm> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/**
 * A safe-area guide dragged by `deltaMm` along its axis (page coordinates:
 * +down / +right). Whole millimetres, snapping onto the opposite margin;
 * never past the page edge, and the safe area keeps MIN_SAFE_AREA_MM.
 */
export function dragMargin(margins: MarginsMm, side: keyof MarginsMm, deltaMm: number, paper: PaperSize, thresholdMm: number): MarginsMm {
	const page = resolvePaperSize(paper);
	const extent = side === "top" || side === "bottom" ? page.heightMm : page.widthMm;
	const inward = side === "top" || side === "left" ? deltaMm : -deltaMm;
	const opposite = margins[OPPOSITE[side]];
	const raw = margins[side] + inward;
	const snapped = snapValue(raw, { step: 1, targets: [opposite], threshold: thresholdMm });
	return { ...margins, [side]: clamp(snapped, 0, extent - opposite - MIN_SAFE_AREA_MM) };
}

/** A margin typed into its box: never negative, and the safe area keeps MIN_SAFE_AREA_MM. */
export function setMarginValue(margins: MarginsMm, side: keyof MarginsMm, value: number, paper: PaperSize): MarginsMm {
	const page = resolvePaperSize(paper);
	const extent = side === "top" || side === "bottom" ? page.heightMm : page.widthMm;
	return { ...margins, [side]: clamp(value, 0, extent - margins[OPPOSITE[side]] - MIN_SAFE_AREA_MM) };
}

/**
 * The strip along each edge most printers can't print on. Drawn hatched on the
 * designer's page as INFORMATION only: nothing snaps to it and nothing is
 * refused for crossing it (a full-page background is meant to bleed into it).
 */
export const PRINTER_BAND_MM = 5;

/** The four printer-band strips (top, bottom, left, right; corners counted once). */
export function printerBandRects(page: PageDims): MmRect[] {
	const b = PRINTER_BAND_MM;
	return [
		{ x: 0, y: 0, w: page.widthMm, h: b },
		{ x: 0, y: page.heightMm - b, w: page.widthMm, h: b },
		{ x: 0, y: b, w: b, h: page.heightMm - 2 * b },
		{ x: page.widthMm - b, y: b, w: b, h: page.heightMm - 2 * b }
	];
}

// ---- zoom as a percentage of actual size ----------------------------------------

/** The zoom dropdown's levels, as a fraction of actual size (1 = 100 %: a CSS millimetre per mm). */
export const ACTUAL_ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

/** The canvas zoom (relative to fit) that shows the page at `actual` × actual size, given fit's px per mm. */
export function zoomForActual(actual: number, fitPxPerMm: number): number {
	return (actual * CSS_PX_PER_MM) / fitPxPerMm;
}

/** The next actual-size level up (+1) or down (−1) from `actual`; stays put at either end. */
export function stepActualZoom(actual: number, direction: 1 | -1): number {
	const levels = direction > 0 ? ACTUAL_ZOOM_LEVELS : [...ACTUAL_ZOOM_LEVELS].reverse();
	return levels.find((z) => (direction > 0 ? z > actual + 1e-6 : z < actual - 1e-6)) ?? actual;
}
