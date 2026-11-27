// Every geometry rule the Stationery editor follows, in one pure module: the
// mm ↔ px conversion at any zoom, where a margin guide may be dragged to, how
// it snaps, the rulers' ticks and the grey placeholder content. The editor
// (StationeryEditorModal.vue) only calls these and draws what they return —
// it holds no geometry of its own.
//
// Everything is in millimetres on a portrait sheet (x right, y down, origin at
// the page's top-left corner) until it is converted with a `scale`: CSS pixels
// per millimetre at the editor's current zoom.
//
// Header & footer images live here too: where an image starts, how it moves
// and resizes (aspect locked, snapping to the page edges and the centre line)
// and the band each image pushes out ahead of it (its inner edge + 4 mm).
//
// Pure, store-free, relative imports only.

import type { PaperSize } from "./page-settings";
import type { PdfLayoutKey } from "./pdf-layouts";
import type { BackgroundExt, HeaderFooterImage, HeaderFooterSlot, Stationery, StationeryMarginsMm, StationeryMode } from "./stationery";
import { MAX_BAND_MM, parseStationery, serializeStationery } from "./stationery";

/** A CSS pixel is 1/96 inch, so this many px is one millimetre at 100 %. */
export const CSS_PX_PER_MM = 96 / 25.4;

/**
 * The strip along each edge most printers can't print on. Drawn hatched in
 * the editor as INFORMATION only: nothing snaps to it and nothing is refused
 * for crossing it (a Full-page background is meant to bleed into it).
 */
export const PRINTER_BAND_MM = 5;

/** The Safe area can't be squeezed thinner than this, either way. */
export const MIN_SAFE_AREA_MM = 40;

/** Margins move in whole millimetres, the same step as the number inputs. */
export const MARGIN_STEP_MM = 1;

/** How close (on screen) a dragged guide must come to a target to snap to it. */
export const SNAP_DISTANCE_PX = 6;

/** Zoom levels relative to "fit the page in the window". */
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export interface PageDims {
	widthMm: number
	heightMm: number
}

export interface MmRect {
	x: number
	y: number
	w: number
	h: number
}

export type MarginEdge = keyof StationeryMarginsMm;

/**
 * The least each margin may be — the bands Header & footer images push out
 * (bandFloors). An edge that isn't listed may go right to the page edge.
 */
export type BandFloors = Partial<Record<MarginEdge, number>>;

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
	/** Values worth landing on exactly (e.g. the opposite margin). */
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

const OPPOSITE: Record<MarginEdge, MarginEdge> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const extentOf = (page: PageDims, edge: MarginEdge) => (edge === "top" || edge === "bottom" ? page.heightMm : page.widthMm);

/** The deepest a band may go: the Safe area keeps MIN_SAFE_AREA_MM and the band stays within MAX_BAND_MM. */
const deepestBand = (page: PageDims, margins: StationeryMarginsMm, edge: MarginEdge) =>
	Math.max(0, Math.min(MAX_BAND_MM, extentOf(page, edge) - margins[OPPOSITE[edge]] - MIN_SAFE_AREA_MM));

/**
 * Where a margin may go: from the page edge (or its floor — never into a
 * Header & footer image) to the point where the Safe area would be thinner
 * than MIN_SAFE_AREA_MM (so margins can never cross), and no deeper than the
 * Stationery accepts. The printer band plays no part.
 */
export function marginLimits(page: PageDims, margins: StationeryMarginsMm, edge: MarginEdge, floors: BandFloors = {}): { min: number, max: number } {
	const max = deepestBand(page, margins, edge);
	const min = Math.max(0, floors[edge] ?? 0);
	return { min, max: Math.max(min, max) };
}

const clamp = (v: number, { min, max }: { min: number, max: number }) => Math.min(max, Math.max(min, v));

/** One margin set to a typed value: rounded to the step, then held inside its limits. */
export function setMargin(page: PageDims, margins: StationeryMarginsMm, edge: MarginEdge, valueMm: number, floors: BandFloors = {}): StationeryMarginsMm {
	const value = clamp(snapValue(valueMm, { step: MARGIN_STEP_MM }), marginLimits(page, margins, edge, floors));
	return { ...margins, [edge]: value };
}

/**
 * A margin guide dragged by (dx, dy) screen pixels from where the drag began.
 * Always measured from the margins at the START of the drag, so rounding
 * never accumulates. Only movement across the guide's own axis counts; the
 * value snaps to the opposite margin (symmetry) when close, otherwise to
 * whole millimetres, and stays inside marginLimits.
 */
export function dragMargin(
	page: PageDims,
	start: StationeryMarginsMm,
	edge: MarginEdge,
	delta: { dx: number, dy: number },
	scale: number,
	floors: BandFloors = {}
): StationeryMarginsMm {
	const movedPx = { top: delta.dy, bottom: -delta.dy, left: delta.dx, right: -delta.dx }[edge];
	const raw = start[edge] + pxToMm(movedPx, scale);
	const snapped = snapValue(raw, {
		step: MARGIN_STEP_MM,
		targets: [start[OPPOSITE[edge]]],
		threshold: pxToMm(SNAP_DISTANCE_PX, scale)
	});
	return { ...start, [edge]: clamp(snapped, marginLimits(page, start, edge, floors)) };
}

export interface MarginGuide {
	edge: MarginEdge
	/** "y" = a horizontal line at that height; "x" = a vertical line at that offset. */
	axis: "x" | "y"
	/** Position from the page's top-left corner. */
	mm: number
}

/** Where each of the four margin guides is drawn: on the Safe area's edges. */
export function marginGuides(page: PageDims, margins: StationeryMarginsMm): MarginGuide[] {
	return [
		{ edge: "top", axis: "y", mm: margins.top },
		{ edge: "bottom", axis: "y", mm: page.heightMm - margins.bottom },
		{ edge: "left", axis: "x", mm: margins.left },
		{ edge: "right", axis: "x", mm: page.widthMm - margins.right }
	];
}

export type ArrowDirection = "up" | "down" | "left" | "right";

/**
 * A focused margin guide moved by an arrow key: `stepMm` the way the arrow
 * points (down on the top guide deepens the top band; down on the bottom
 * guide makes it shallower). Arrows across the guide do nothing.
 */
export function nudgeMargin(page: PageDims, margins: StationeryMarginsMm, edge: MarginEdge, arrow: ArrowDirection, stepMm: number, floors: BandFloors = {}): StationeryMarginsMm {
	const along = edge === "top" || edge === "bottom" ? ["up", "down"] : ["left", "right"];
	if (!along.includes(arrow)) return margins;
	// +1 when the arrow points away from the guide's own page edge.
	const inward = { top: "down", bottom: "up", left: "right", right: "left" }[edge] === arrow ? 1 : -1;
	return setMargin(page, margins, edge, margins[edge] + inward * stepMm, floors);
}

/**
 * Margins made to fit a sheet: each pair of opposite margins that leaves less
 * than the minimum Safe area (e.g. bands set for A4, now on A5) shrinks in
 * proportion until it fits. Margins that already fit come back unchanged.
 */
export function fitMargins(page: PageDims, margins: StationeryMarginsMm): StationeryMarginsMm {
	const out = { ...margins };
	for (const [a, b, extent] of [["top", "bottom", page.heightMm], ["left", "right", page.widthMm]] as const) {
		out[a] = Math.min(out[a], MAX_BAND_MM);
		out[b] = Math.min(out[b], MAX_BAND_MM);
		const room = Math.max(0, extent - MIN_SAFE_AREA_MM);
		const sum = out[a] + out[b];
		if (sum > room) {
			const k = room / sum;
			out[a] = Math.floor(out[a] * k);
			out[b] = Math.floor(out[b] * k);
		}
	}
	return out;
}

// Each Layout's own page margins (A4, mm) — layout-config in
// src-tauri/templates/common.typ (the doc-*.typ templates use the same
// values). They apply only under Built-in stationery; every other mode uses
// the Stationery's margins (ADR 0001).
const LAYOUT_MARGINS_MM: Record<PdfLayoutKey, StationeryMarginsMm> = {
	classic: { top: 16, right: 18, bottom: 18, left: 18 },
	modern: { top: 16, right: 18, bottom: 18, left: 18 },
	minimal: { top: 22, right: 22, bottom: 22, left: 22 },
	compact: { top: 12, right: 14, bottom: 12, left: 14 }
};
const A4_WIDTH_MM = 210;

/** A Layout's Built-in page margins on this sheet: the A4 values scaled by paper width, as page-geometry does. */
export function layoutMarginsMm(layout: PdfLayoutKey, page: PageDims): StationeryMarginsMm {
	const k = page.widthMm / A4_WIDTH_MM;
	const m = LAYOUT_MARGINS_MM[layout];
	return { top: m.top * k, right: m.right * k, bottom: m.bottom * k, left: m.left * k };
}

/**
 * The margins that bound the Safe area on this sheet. Built-in: the Layout's
 * own (scaled by paper width) — the stored Stationery margins don't apply.
 * Every other mode: the Stationery's own, as stored (never scaled). The same
 * split as buildPageSettings + page-geometry (ADR 0001).
 */
export function safeAreaMargins(mode: StationeryMode, layout: PdfLayoutKey, page: PageDims, stationeryMargins: StationeryMarginsMm): StationeryMarginsMm {
	return mode === "builtin" ? layoutMarginsMm(layout, page) : { ...stationeryMargins };
}

/**
 * Whether the editor can move this mode's margins. Built-in has none of its
 * own (they belong to the Layout), so the editor opens as a preview there.
 */
export function editsMargins(mode: StationeryMode): boolean {
	return mode !== "builtin";
}

/** The printer band as four strips: top, bottom, then the two sides between them. */
export function printerBandRects(page: PageDims): MmRect[] {
	const b = PRINTER_BAND_MM;
	return [
		{ x: 0, y: 0, w: page.widthMm, h: b },
		{ x: 0, y: page.heightMm - b, w: page.widthMm, h: b },
		{ x: 0, y: b, w: b, h: page.heightMm - 2 * b },
		{ x: page.widthMm - b, y: b, w: b, h: page.heightMm - 2 * b }
	];
}

/** The scale (px per mm) that draws the page `widthPx` wide — for fixed-size thumbnails. */
export function scaleForWidth(page: PageDims, widthPx: number): number {
	return widthPx / page.widthMm;
}

/** The Safe area: the page less its four margins. */
export function safeAreaRect(page: PageDims, margins: StationeryMarginsMm): MmRect {
	return {
		x: margins.left,
		y: margins.top,
		w: Math.max(0, page.widthMm - margins.left - margins.right),
		h: Math.max(0, page.heightMm - margins.top - margins.bottom)
	};
}

/** A rect in mm, positioned in px for an absolutely-placed element. */
export function rectToPx(rect: MmRect, scale: number) {
	return { left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale };
}

export interface RulerTick {
	mm: number
	px: number
	/** A longer, labelled tick. */
	major: boolean
	label: string | null
}

// Ticks closer than this on screen would smear into a grey band.
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

// Grey placeholder content, in mm, roughly where an invoice puts things: the
// title, the party and details blocks, line rows, and the totals.
const PAD_MM = 2;
const ROW_PITCH_MM = 7;
const BAR_MM = 2.5;

/** Placeholder bars standing in for document content, all inside the Safe area. */
export function placeholderBars(safe: MmRect): MmRect[] {
	const bars: MmRect[] = [];
	const left = safe.x + PAD_MM;
	const right = safe.x + safe.w - PAD_MM;
	const bottom = safe.y + safe.h - PAD_MM;
	const width = Math.max(0, right - left);
	let y = safe.y + PAD_MM;
	const add = (x: number, w: number, h: number) => {
		if (y + h <= bottom && w > 0) bars.push({ x, y, w, h });
	};

	// Title, centred.
	add(left + width * 0.35, width * 0.3, 4);
	y += 10;
	// Party block (left) beside the details block (right): two short lines each.
	for (const frac of [0.4, 0.3]) {
		add(left, width * frac, BAR_MM);
		add(right - width * 0.25, width * 0.25, BAR_MM);
		y += 5;
	}
	y += 5;
	// Line rows, as many as fit above room for the totals.
	const totalsMm = 2 * ROW_PITCH_MM;
	while (y + BAR_MM <= bottom - totalsMm) {
		add(left, width, BAR_MM);
		y += ROW_PITCH_MM;
	}
	// Totals, right-aligned.
	for (let i = 0; i < 2; i++) {
		add(right - width * 0.3, width * 0.3, BAR_MM);
		y += ROW_PITCH_MM;
	}
	return bars;
}

// ---- Header & footer images ---------------------------------------------
// Each image is an MmRect on the page. The header's band (the top margin)
// always reaches at least HEADER_FOOTER_GAP_MM past the header's bottom edge,
// the footer's (the bottom margin) past the footer's top edge — so content
// never runs into an image. A band may be dragged further out, never in.

/** The clear gap between an image's inner edge and its band. */
export const HEADER_FOOTER_GAP_MM = 4;

/** The narrowest an image may be resized to. */
export const MIN_IMAGE_MM = 10;

export interface HeaderFooterRects {
	header: MmRect | null
	footer: MmRect | null
}

export type ImageCorner = "nw" | "ne" | "sw" | "se";

/** A placed Header & footer image as a page view draws it: where, what (a blob URL, or null for a placeholder) and its format. */
export interface PageImageView {
	rect: MmRect
	url: string | null
	ext: BackgroundExt
}

/** The band each image pushes out: its inner edge + the gap. 0 where there is no image. */
export function bandFloors(page: PageDims, images: HeaderFooterRects): { top: number, bottom: number } {
	return {
		top: images.header ? images.header.y + images.header.h + HEADER_FOOTER_GAP_MM : 0,
		bottom: images.footer ? page.heightMm - images.footer.y + HEADER_FOOTER_GAP_MM : 0
	};
}

/** The margins with each band pushed out of its image (what the PDF reserves). */
export function headerFooterMargins(page: PageDims, images: HeaderFooterRects, margins: StationeryMarginsMm): StationeryMarginsMm {
	const floors = bandFloors(page, images);
	return { ...margins, top: Math.max(margins.top, floors.top), bottom: Math.max(margins.bottom, floors.bottom) };
}

/**
 * How far from its own page edge an image's inner edge may reach: the deepest
 * its band can go (the Safe area keeps its minimum against the OPPOSITE band,
 * and no band is deeper than MAX_BAND_MM) less the gap.
 */
const deepestImageEdge = (page: PageDims, slot: HeaderFooterSlot, margins: StationeryMarginsMm) =>
	Math.max(0, deepestBand(page, margins, slot === "header" ? "top" : "bottom") - HEADER_FOOTER_GAP_MM);

/**
 * An image rect made to fit: no wider than the page, its inner edge no deeper
 * than its band allows (shrunk with its proportions kept, anchored at its
 * centre), then moved fully onto the page. `margins` supplies the OPPOSITE band.
 */
export function clampImageRect(page: PageDims, slot: HeaderFooterSlot, rect: MmRect, margins: StationeryMarginsMm): MmRect {
	const depth = deepestImageEdge(page, slot, margins);
	const k = Math.min(1, page.widthMm / rect.w, depth / rect.h);
	const w = rect.w * k;
	const h = rect.h * k;
	const cx = rect.x + rect.w / 2;
	const cy = rect.y + rect.h / 2;
	const [yMin, yMax] = slot === "header" ? [0, depth - h] : [page.heightMm - depth, page.heightMm - h];
	return {
		x: clamp(cx - w / 2, { min: 0, max: page.widthMm - w }),
		y: clamp(cy - h / 2, { min: yMin, max: Math.max(yMin, yMax) }),
		w,
		h
	};
}

/**
 * Where a newly added image starts: full page width, flush to its own edge
 * (the top for the header, the bottom for the footer). An image too tall for
 * that is shrunk to fit and centred.
 */
export function defaultImageRect(page: PageDims, slot: HeaderFooterSlot, aspect: number, margins: StationeryMarginsMm): MmRect {
	const w = page.widthMm;
	const h = w / aspect;
	return clampImageRect(page, slot, { x: 0, y: slot === "header" ? 0 : page.heightMm - h, w, h }, margins);
}

/** How deep an image's inner edge sits from its own page edge. */
const innerEdge = (page: PageDims, slot: HeaderFooterSlot, rect: MmRect) =>
	slot === "header" ? rect.y + rect.h : page.heightMm - rect.y;

/**
 * The margins after an image was added, moved, resized or removed. Its band
 * follows it: a new image's band sits exactly at its inner edge + the gap; a
 * moved or resized one carries its band along by the same distance (so extra
 * room the user gave it is kept), never closer than the gap. Removing an
 * image leaves its band where it was. The other band is never touched.
 */
export function followImage(
	page: PageDims,
	slot: HeaderFooterSlot,
	before: MmRect | null,
	after: MmRect | null,
	margins: StationeryMarginsMm
): StationeryMarginsMm {
	if (!after) return { ...margins };
	const edge: MarginEdge = slot === "header" ? "top" : "bottom";
	const floor = innerEdge(page, slot, after) + HEADER_FOOTER_GAP_MM;
	const followed = before ? margins[edge] + innerEdge(page, slot, after) - innerEdge(page, slot, before) : floor;
	return { ...margins, [edge]: clamp(Math.max(followed, floor), marginLimits(page, margins, edge, { [edge]: floor })) };
}

/** The snap distance in mm at this zoom. */
const snapMm = (scale: number) => pxToMm(SNAP_DISTANCE_PX, scale);

/**
 * An image dragged by (dx, dy) screen pixels from where the drag began. Its
 * left edge, right edge or middle snaps to the page's left edge, right edge
 * or centre line; its top or bottom to the page's top or bottom edge;
 * otherwise it moves in whole millimetres. It stays on the page, and never so
 * deep that its band would leave the content too little room.
 */
export function dragImage(
	page: PageDims,
	slot: HeaderFooterSlot,
	start: MmRect,
	delta: { dx: number, dy: number },
	scale: number,
	margins: StationeryMarginsMm
): MmRect {
	const threshold = snapMm(scale);
	const x = snapValue(start.x + pxToMm(delta.dx, scale), {
		step: MARGIN_STEP_MM,
		targets: [0, page.widthMm - start.w, (page.widthMm - start.w) / 2],
		threshold
	});
	const y = snapValue(start.y + pxToMm(delta.dy, scale), {
		step: MARGIN_STEP_MM,
		targets: [0, page.heightMm - start.h],
		threshold
	});
	return clampImageRect(page, slot, { ...start, x, y }, margins);
}

/** An image moved by an arrow key, `stepMm` the way it points, staying on the page. */
export function nudgeImage(page: PageDims, slot: HeaderFooterSlot, rect: MmRect, arrow: ArrowDirection, stepMm: number, margins: StationeryMarginsMm): MmRect {
	const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[arrow];
	return clampImageRect(page, slot, { ...rect, x: rect.x + d[0]! * stepMm, y: rect.y + d[1]! * stepMm }, margins);
}

/**
 * An image resized from one corner by (dx, dy) screen pixels from where the
 * drag began. The opposite corner stays put and the proportions are locked:
 * the size follows whichever way the pointer moved further. The moving
 * vertical edge snaps to the page's left / right edge or centre line (or the
 * moving horizontal edge to the top / bottom edge); the width otherwise moves
 * in whole millimetres. Never narrower than MIN_IMAGE_MM, never off the page,
 * never so tall that its band would leave the content too little room.
 */
export function resizeImage(
	page: PageDims,
	slot: HeaderFooterSlot,
	start: MmRect,
	corner: ImageCorner,
	delta: { dx: number, dy: number },
	scale: number,
	margins: StationeryMarginsMm
): MmRect {
	const aspect = start.w / start.h;
	const east = corner === "ne" || corner === "se";
	const south = corner === "sw" || corner === "se";
	// The fixed corner.
	const ax = east ? start.x : start.x + start.w;
	const ay = south ? start.y : start.y + start.h;
	const dxMm = pxToMm(delta.dx, scale) * (east ? 1 : -1);
	const dyMm = pxToMm(delta.dy, scale) * (south ? 1 : -1);
	const byX = start.w + dxMm;
	const byY = (start.h + dyMm) * aspect;
	let w = Math.abs(byX - start.w) >= Math.abs(byY - start.w) ? byX : byY;

	// Snap the moving edge, else whole millimetres of width.
	const threshold = snapMm(scale);
	const movingX = east ? ax + w : ax - w;
	const xTarget = [0, page.widthMm / 2, page.widthMm].find((t) => Math.abs(t - movingX) <= threshold);
	const movingY = south ? ay + w / aspect : ay - w / aspect;
	const yTarget = [0, page.heightMm].find((t) => Math.abs(t - movingY) <= threshold);
	if (xTarget !== undefined) w = Math.abs(xTarget - ax);
	else if (yTarget !== undefined) w = Math.abs(yTarget - ay) * aspect;
	else w = Math.round(w / MARGIN_STEP_MM) * MARGIN_STEP_MM;

	// Room from the fixed corner towards the moving one.
	const depth = deepestImageEdge(page, slot, margins);
	const roomW = east ? page.widthMm - ax : ax;
	const roomH = slot === "header"
		? (south ? depth - ay : ay)
		: (south ? page.heightMm - ay : ay - (page.heightMm - depth));
	w = Math.max(MIN_IMAGE_MM, Math.min(w, roomW, Math.max(0, roomH) * aspect));
	const h = w / aspect;
	return { x: east ? ax : ax - w, y: south ? ay : ay - h, w, h };
}

// ---- Paper size changes -------------------------------------------------
// What a Paper size change does to custom Stationery. The geometry here is
// always in the coordinates of ONE sheet; changing the sheet re-fits it:
//
//   A4 ↔ A5 (the same proportions, near enough): everything scales by the
//     width ratio — margins, image positions and sizes — so an A4 → A5 → A4
//     round trip comes back where it started. A footer keeps its distance
//     from the BOTTOM edge (scaled), so it stays pinned there.
//   To or from US Letter / Legal: nothing is scaled. Margins keep their mm;
//     each image keeps its mm size and its distance from its own edge (and
//     from the page's centre line), then is clamped onto the new page; its
//     band follows it. That needs a look, so the images keep the sheet they
//     were PLACED on and the editor flags them (stationeryReview).
//
// Every image and the Full-page background carry the sheet they were placed
// or prepared on (`paper`). A scaled one moves to the new sheet with it; a
// clamped one keeps the old sheet until the user confirms it in the editor
// (confirmPaperGeometry) — or, for a raster background, re-crops it.

/** A sheet: its size and which Paper size it is. */
export interface Sheet extends PageDims {
	key: PaperSize
}

/** A Header & footer image's place and the sheet it was placed on. */
export interface PlacedImage {
	rect: MmRect
	paper: PaperSize | null
}

/** Every mode's paper-dependent geometry — what a Paper size change re-fits. */
export interface PaperGeometry {
	preprinted: StationeryMarginsMm
	background: { margins: StationeryMarginsMm, paper: PaperSize | null }
	header_footer: { header: PlacedImage | null, footer: PlacedImage | null, margins: StationeryMarginsMm }
}

const scaleMargins = (m: StationeryMarginsMm, k: number): StationeryMarginsMm =>
	({ top: m.top * k, right: m.right * k, bottom: m.bottom * k, left: m.left * k });

/** The sheet an image or artwork moves to when its geometry was scaled along with the paper. */
const followPaper = (paper: PaperSize | null, from: Sheet, to: Sheet): PaperSize | null => (paper === from.key ? to.key : paper);

/** An image scaled with the sheet: from its own edge (the footer from the bottom), sizes by the same ratio. */
function scaleImage(from: Sheet, to: Sheet, slot: HeaderFooterSlot, image: PlacedImage, k: number): PlacedImage {
	const { x, y, w, h } = image.rect;
	const top = slot === "header" ? y * k : to.heightMm - (from.heightMm - y) * k;
	return { rect: { x: x * k, y: top, w: w * k, h: h * k }, paper: followPaper(image.paper, from, to) };
}

/**
 * An image moved to a sheet of another shape at its own size: the same
 * distance from its own edge (the footer from the bottom) and from the
 * centre line, then made to fit (clampImageRect) — shrunk, proportions kept,
 * still pinned to its edge — with its band following it.
 */
function keepImage(from: Sheet, to: Sheet, slot: HeaderFooterSlot, image: PlacedImage, margins: StationeryMarginsMm) {
	const { x, y, w, h } = image.rect;
	const moved = { x: x + (to.widthMm - from.widthMm) / 2, y: slot === "header" ? y : to.heightMm - (from.heightMm - y), w, h };
	const fitted = clampImageRect(to, slot, moved, margins);
	const pinned = clampImageRect(to, slot, { ...fitted, y: slot === "header" ? moved.y : moved.y + moved.h - fitted.h }, margins);
	return { image: { rect: pinned, paper: image.paper }, margins: followImage(to, slot, moved, pinned, margins) };
}

/** A4 and A5 share their proportions (near enough), so geometry scales between them. */
const A_SERIES = new Set<PaperSize>(["a4", "a5"]);

/** How a change from one Paper size to another re-fits the Stationery. */
export function paperChangeKind(from: PaperSize, to: PaperSize): "none" | "scale" | "keep-size" {
	if (from === to) return "none";
	return A_SERIES.has(from) && A_SERIES.has(to) ? "scale" : "keep-size";
}

const copyGeometry = (g: PaperGeometry): PaperGeometry => structuredClone(g);

/** The geometry re-fitted from one sheet to another (see above). */
export function refitPaperGeometry(from: Sheet, to: Sheet, g: PaperGeometry): PaperGeometry {
	const kind = paperChangeKind(from.key, to.key);
	if (kind === "none") return copyGeometry(g);
	const hf = g.header_footer;
	if (kind === "keep-size") {
		let margins = { ...hf.margins };
		const place = (slot: HeaderFooterSlot) => {
			const image = hf[slot];
			if (!image) return null;
			const out = keepImage(from, to, slot, image, margins);
			margins = out.margins;
			return out.image;
		};
		const header = place("header");
		const footer = place("footer");
		return { ...copyGeometry(g), header_footer: { header, footer, margins } };
	}
	const k = to.widthMm / from.widthMm;
	return {
		preprinted: scaleMargins(g.preprinted, k),
		background: { margins: scaleMargins(g.background.margins, k), paper: followPaper(g.background.paper, from, to) },
		header_footer: {
			header: hf.header && scaleImage(from, to, "header", hf.header, k),
			footer: hf.footer && scaleImage(from, to, "footer", hf.footer, k),
			margins: scaleMargins(hf.margins, k)
		}
	};
}

/** What the Stationery editor asks the user to check on this sheet (null = nothing). */
export interface StationeryReview {
	/** Header & footer images placed on another sheet: that sheet. */
	header: PaperSize | null
	footer: PaperSize | null
	/** A Full-page background prepared for another sheet; a raster one needs a re-crop. */
	background: { preparedFor: PaperSize, recrop: boolean } | null
}

const RASTER_EXTS = new Set<BackgroundExt>(["png", "jpg"]);

/**
 * What needs a look after the Paper size changed: anything placed or
 * prepared on a different sheet. A raster background prepared for a sheet of
 * another shape needs a re-crop (it would be cut off by "cover"); an SVG or
 * PDF re-covers the page and only needs a check. An unknown sheet is never
 * flagged.
 */
export function stationeryReview(g: PaperGeometry, backgroundExt: BackgroundExt | null, paper: PaperSize): StationeryReview {
	const placedOn = (image: PlacedImage | null) => (image?.paper && image.paper !== paper ? image.paper : null);
	const prepared = g.background.paper;
	return {
		header: placedOn(g.header_footer.header),
		footer: placedOn(g.header_footer.footer),
		background: backgroundExt && prepared && prepared !== paper
			? { preparedFor: prepared, recrop: RASTER_EXTS.has(backgroundExt) && paperChangeKind(prepared, paper) === "keep-size" }
			: null
	};
}

/**
 * The geometry after Apply in the Stationery editor, which showed the user
 * this mode on this sheet: Header & footer images now count as placed on it,
 * an SVG / PDF background as prepared for it. A raster background still needs
 * its re-crop, so Apply leaves it flagged.
 */
export function confirmPaperGeometry(g: PaperGeometry, mode: StationeryMode, paper: PaperSize, backgroundExt: BackgroundExt | null): PaperGeometry {
	const out = copyGeometry(g);
	if (mode === "header_footer") {
		for (const image of [out.header_footer.header, out.header_footer.footer]) {
			if (image) image.paper = paper;
		}
	}
	if (mode === "background" && backgroundExt && !RASTER_EXTS.has(backgroundExt)) out.background.paper = paper;
	return out;
}

/** The paper-dependent geometry out of the stored Stationery. */
export function paperGeometryOf(s: Stationery): PaperGeometry {
	const placed = (image: HeaderFooterImage | null): PlacedImage | null => (image ? { rect: { ...image.rect }, paper: image.paper } : null);
	return {
		preprinted: { ...s.preprinted },
		background: { margins: { ...s.background.margins }, paper: s.background.paper },
		header_footer: { header: placed(s.header_footer.header), footer: placed(s.header_footer.footer), margins: { ...s.header_footer.margins } }
	};
}

/**
 * The stored Stationery with this geometry put in. Only artwork that is still
 * stored takes a place or a sheet — an image removed (or a background
 * cleared) since the geometry was read stays gone — and every image keeps its
 * format, proportions, crop and live-text flag.
 */
export function withPaperGeometry(s: Stationery, g: PaperGeometry): Stationery {
	const put = (image: HeaderFooterImage | null, placed: PlacedImage | null) =>
		(image && placed ? { ...image, rect: { ...placed.rect }, paper: placed.paper } : image);
	return {
		preprinted: { ...g.preprinted },
		background: { ...s.background, margins: { ...g.background.margins }, paper: s.background.ext ? g.background.paper : s.background.paper },
		header_footer: {
			header: put(s.header_footer.header, g.header_footer.header),
			footer: put(s.header_footer.footer, g.header_footer.footer),
			margins: { ...g.header_footer.margins }
		}
	};
}

/** company_settings.pdf_stationery re-fitted from one sheet to another. */
export function refitStationery(stored: string | null | undefined, from: Sheet, to: Sheet): string {
	const s = parseStationery(stored);
	return serializeStationery(withPaperGeometry(s, refitPaperGeometry(from, to, paperGeometryOf(s))));
}
