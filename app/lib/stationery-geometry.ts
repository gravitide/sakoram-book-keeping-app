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
// Header & footer images (#361) land here too: `snapValue` already takes a
// list of targets (page edges, centre) and `MmRect` is the shape an image's
// placement will use.
//
// Pure, store-free, relative imports only.

import type { PdfLayoutKey } from "./pdf-layouts";
import type { StationeryMarginsMm } from "./stationery";
import { MAX_BAND_MM } from "./stationery";

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

/**
 * Where a margin may go: from the page edge to the point where the Safe area
 * would be thinner than MIN_SAFE_AREA_MM (so margins can never cross), and no
 * deeper than the Stationery accepts. The printer band plays no part.
 */
export function marginLimits(page: PageDims, margins: StationeryMarginsMm, edge: MarginEdge): { min: number, max: number } {
	const room = extentOf(page, edge) - margins[OPPOSITE[edge]] - MIN_SAFE_AREA_MM;
	return { min: 0, max: Math.max(0, Math.min(MAX_BAND_MM, room)) };
}

const clamp = (v: number, { min, max }: { min: number, max: number }) => Math.min(max, Math.max(min, v));

/** One margin set to a typed value: rounded to the step, then held inside its limits. */
export function setMargin(page: PageDims, margins: StationeryMarginsMm, edge: MarginEdge, valueMm: number): StationeryMarginsMm {
	const value = clamp(snapValue(valueMm, { step: MARGIN_STEP_MM }), marginLimits(page, margins, edge));
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
	scale: number
): StationeryMarginsMm {
	const movedPx = { top: delta.dy, bottom: -delta.dy, left: delta.dx, right: -delta.dx }[edge];
	const raw = start[edge] + pxToMm(movedPx, scale);
	const snapped = snapValue(raw, {
		step: MARGIN_STEP_MM,
		targets: [start[OPPOSITE[edge]]],
		threshold: pxToMm(SNAP_DISTANCE_PX, scale)
	});
	return { ...start, [edge]: clamp(snapped, marginLimits(page, start, edge)) };
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
export function nudgeMargin(page: PageDims, margins: StationeryMarginsMm, edge: MarginEdge, arrow: ArrowDirection, stepMm: number): StationeryMarginsMm {
	const along = edge === "top" || edge === "bottom" ? ["up", "down"] : ["left", "right"];
	if (!along.includes(arrow)) return margins;
	// +1 when the arrow points away from the guide's own page edge.
	const inward = { top: "down", bottom: "up", left: "right", right: "left" }[edge] === arrow ? 1 : -1;
	return setMargin(page, margins, edge, margins[edge] + inward * stepMm);
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
