import { describe, expect, it } from "vitest";
import {
	CSS_PX_PER_MM,
	dragMargin,
	fitMargins,
	fitScale,
	layoutMarginsMm,
	marginGuides,
	marginLimits,
	MIN_SAFE_AREA_MM,
	mmToPx,
	nudgeMargin,
	placeholderBars,
	PRINTER_BAND_MM,
	printerBandRects,
	pxToMm,
	rulerTicks,
	safeAreaRect,
	scaleForWidth,
	setMargin,
	snapValue,
	stepZoom
} from "./stationery-geometry";

const A4 = { widthMm: 210, heightMm: 297 };
const A5 = { widthMm: 148, heightMm: 210 };
const margins = { top: 40, right: 18, bottom: 25, left: 18 };

describe("mm ↔ px", () => {
	it("a CSS pixel is 1/96 inch, so 25.4 mm is 96 px at 100 %", () => {
		expect(mmToPx(25.4, CSS_PX_PER_MM)).toBeCloseTo(96);
		expect(pxToMm(96, CSS_PX_PER_MM)).toBeCloseTo(25.4);
	});

	it("follows the zoom: twice the scale, twice the pixels", () => {
		expect(mmToPx(10, 4)).toBe(40);
		expect(pxToMm(40, 2)).toBe(20);
	});
});

describe("fitScale", () => {
	it("fits a portrait page by its height in a wide viewport", () => {
		// 600 px tall less 2 × 20 px gutter = 560 px for 297 mm.
		expect(fitScale(A4, { w: 1200, h: 600 }, 20)).toBeCloseTo(560 / 297);
	});

	it("fits by width in a narrow viewport", () => {
		expect(fitScale(A4, { w: 250, h: 2000 }, 20)).toBeCloseTo(210 / 210);
	});

	it("never collapses to zero or below in a tiny viewport", () => {
		expect(fitScale(A4, { w: 0, h: 0 }, 20)).toBeGreaterThan(0);
	});
});

describe("stepZoom", () => {
	it("steps through the zoom levels and stops at either end", () => {
		expect(stepZoom(1, 1)).toBeGreaterThan(1);
		expect(stepZoom(1, -1)).toBeLessThan(1);
		let z = 1;
		for (let i = 0; i < 20; i++) z = stepZoom(z, 1);
		expect(stepZoom(z, 1)).toBe(z);
		for (let i = 0; i < 40; i++) z = stepZoom(z, -1);
		expect(stepZoom(z, -1)).toBe(z);
	});

	it("from an in-between zoom, goes to the next level in that direction", () => {
		const up = stepZoom(1.1, 1);
		const down = stepZoom(1.1, -1);
		expect(up).toBeGreaterThan(1.1);
		expect(down).toBeLessThan(1.1);
	});
});

describe("snapValue", () => {
	it("rounds to the step when no target is near", () => {
		expect(snapValue(17.4, { step: 1 })).toBe(17);
		expect(snapValue(17.6, { step: 1 })).toBe(18);
		expect(snapValue(17.3, { step: 0.5 })).toBe(17.5);
	});

	it("prefers a target within the threshold over the step", () => {
		expect(snapValue(16.6, { step: 1, targets: [18], threshold: 2 })).toBe(18);
		expect(snapValue(15.4, { step: 1, targets: [18], threshold: 2 })).toBe(15);
	});

	it("picks the nearest of several targets", () => {
		expect(snapValue(50, { step: 1, targets: [47, 52], threshold: 5 })).toBe(52);
	});
});

describe("marginLimits", () => {
	it("a margin runs from the page edge to where the Safe area would get too thin", () => {
		expect(marginLimits(A5, margins, "top")).toEqual({ min: 0, max: 210 - 25 - MIN_SAFE_AREA_MM });
		expect(marginLimits(A5, margins, "left")).toEqual({ min: 0, max: 148 - 18 - MIN_SAFE_AREA_MM });
	});

	it("is also capped at the deepest band the Stationery accepts", () => {
		expect(marginLimits(A4, { ...margins, bottom: 0 }, "top").max).toBe(150);
	});

	it("never offers a range that ends below zero", () => {
		expect(marginLimits(A5, { ...margins, bottom: 200 }, "top")).toEqual({ min: 0, max: 0 });
	});
});

describe("setMargin", () => {
	it("sets one margin, snapped to whole millimetres, leaving the others", () => {
		expect(setMargin(A4, margins, "top", 52.4)).toEqual({ ...margins, top: 52 });
	});

	it("can't go past the page edge", () => {
		expect(setMargin(A4, margins, "left", -12).left).toBe(0);
	});

	it("can't cross the opposite margin or squeeze the Safe area below its minimum", () => {
		const next = setMargin(A5, margins, "top", 290);
		expect(next.top).toBe(210 - 25 - MIN_SAFE_AREA_MM);
		expect(safeAreaRect(A5, next).h).toBe(MIN_SAFE_AREA_MM);
	});

	it("does not snap to the printer band — it is information only", () => {
		expect(setMargin(A4, margins, "left", PRINTER_BAND_MM + 0.6).left).toBe(6);
		expect(setMargin(A4, margins, "left", 3).left).toBe(3);
	});
});

describe("dragMargin", () => {
	const scale = 2; // px per mm

	it("dragging the top guide down deepens the top band", () => {
		expect(dragMargin(A4, margins, "top", { dx: 0, dy: 20 }, scale).top).toBe(50);
	});

	it("dragging the bottom guide down makes the bottom band shallower", () => {
		expect(dragMargin(A4, margins, "bottom", { dx: 0, dy: 20 }, scale).bottom).toBe(15);
	});

	it("left follows the pointer rightwards, right follows it leftwards", () => {
		expect(dragMargin(A4, margins, "left", { dx: 10, dy: 0 }, scale).left).toBe(23);
		expect(dragMargin(A4, { ...margins, left: 30 }, "right", { dx: -10, dy: 0 }, scale).right).toBe(23);
	});

	it("ignores movement across the guide", () => {
		expect(dragMargin(A4, margins, "top", { dx: 300, dy: 0 }, scale)).toEqual(margins);
	});

	it("is measured from where the drag started, so it doesn't drift", () => {
		const once = dragMargin(A4, margins, "top", { dx: 0, dy: 30 }, scale);
		expect(dragMargin(A4, margins, "top", { dx: 0, dy: 30 }, scale)).toEqual(once);
	});

	it("snaps a side margin to the opposite one, so the page stays symmetric", () => {
		const start = { ...margins, left: 10, right: 20 };
		// 10 + 8.8 = 18.8 mm — close enough to the right margin's 20.
		expect(dragMargin(A4, start, "left", { dx: 17.6, dy: 0 }, scale).left).toBe(20);
	});

	it("stops at the limits however far the pointer goes", () => {
		expect(dragMargin(A4, margins, "top", { dx: 0, dy: -500 }, scale).top).toBe(0);
		expect(dragMargin(A5, margins, "top", { dx: 0, dy: 5000 }, scale).top).toBe(210 - 25 - MIN_SAFE_AREA_MM);
	});
});

describe("marginGuides", () => {
	it("puts each guide on the Safe area's edge, measured from the page's top-left", () => {
		expect(marginGuides(A4, margins)).toEqual([
			{ edge: "top", axis: "y", mm: 40 },
			{ edge: "bottom", axis: "y", mm: 272 },
			{ edge: "left", axis: "x", mm: 18 },
			{ edge: "right", axis: "x", mm: 192 }
		]);
	});
});

describe("nudgeMargin", () => {
	it("moves a guide the way the arrow points, by the step", () => {
		expect(nudgeMargin(A4, margins, "top", "down", 1).top).toBe(41);
		expect(nudgeMargin(A4, margins, "bottom", "down", 1).bottom).toBe(24);
		expect(nudgeMargin(A4, margins, "left", "right", 5).left).toBe(23);
		expect(nudgeMargin(A4, margins, "right", "right", 5).right).toBe(13);
	});

	it("ignores arrows across the guide", () => {
		expect(nudgeMargin(A4, margins, "top", "left", 1)).toEqual(margins);
	});

	it("stays inside the limits", () => {
		expect(nudgeMargin(A4, { ...margins, left: 0 }, "left", "left", 5).left).toBe(0);
	});
});

describe("fitMargins", () => {
	it("keeps margins that already fit", () => {
		expect(fitMargins(A4, margins)).toEqual(margins);
	});

	it("shrinks bands that leave no Safe area on a smaller sheet, keeping their proportions", () => {
		const fitted = fitMargins(A5, { top: 120, right: 18, bottom: 60, left: 18 });
		expect(safeAreaRect(A5, fitted).h).toBeGreaterThanOrEqual(MIN_SAFE_AREA_MM);
		expect(fitted.top).toBeGreaterThan(fitted.bottom);
		expect(fitted.left).toBe(18);
	});
});

describe("layoutMarginsMm", () => {
	it("is each Layout's own A4 page margins under Built-in stationery", () => {
		expect(layoutMarginsMm("classic", A4)).toEqual({ top: 16, right: 18, bottom: 18, left: 18 });
		expect(layoutMarginsMm("minimal", A4)).toEqual({ top: 22, right: 22, bottom: 22, left: 22 });
		expect(layoutMarginsMm("compact", A4)).toEqual({ top: 12, right: 14, bottom: 12, left: 14 });
	});

	it("scales with the paper's width, as the PDF does", () => {
		const a5 = layoutMarginsMm("classic", A5);
		expect(a5.left).toBeCloseTo(18 * 148 / 210);
		expect(a5.top).toBeCloseTo(16 * 148 / 210);
	});
});

describe("printerBandRects", () => {
	it("is a 5 mm strip along each of the four edges", () => {
		expect(printerBandRects(A4)).toEqual([
			{ x: 0, y: 0, w: 210, h: 5 },
			{ x: 0, y: 292, w: 210, h: 5 },
			{ x: 0, y: 5, w: 5, h: 287 },
			{ x: 205, y: 5, w: 5, h: 287 }
		]);
	});
});

describe("scaleForWidth", () => {
	it("is the scale that draws the page at the given width", () => {
		expect(scaleForWidth(A5, 296)).toBe(2);
	});
});

describe("safeAreaRect", () => {
	it("is the page less its four margins", () => {
		expect(safeAreaRect(A4, margins)).toEqual({ x: 18, y: 40, w: 174, h: 232 });
	});
});

describe("rulerTicks", () => {
	it("labels every centimetre at a comfortable zoom", () => {
		const ticks = rulerTicks(210, 4);
		const labels = ticks.filter((t) => t.label !== null).map((t) => t.label);
		expect(labels.slice(0, 3)).toEqual(["0", "10", "20"]);
		expect(ticks.some((t) => t.mm === 1)).toBe(true);
	});

	it("thins out when zoomed far out, so ticks never crowd", () => {
		const ticks = rulerTicks(297, 0.6);
		const minor = ticks.filter((t) => !t.major);
		const gap = (minor[1]!.mm - minor[0]!.mm) * 0.6;
		expect(gap).toBeGreaterThanOrEqual(4);
	});

	it("puts each tick at its millimetre × scale and stays on the page", () => {
		const ticks = rulerTicks(148, 2);
		expect(ticks.every((t) => t.px === t.mm * 2)).toBe(true);
		expect(Math.max(...ticks.map((t) => t.mm))).toBeLessThanOrEqual(148);
	});
});

describe("placeholderBars", () => {
	it("every bar sits inside the Safe area", () => {
		const safe = safeAreaRect(A4, margins);
		for (const bar of placeholderBars(safe)) {
			expect(bar.x).toBeGreaterThanOrEqual(safe.x);
			expect(bar.y).toBeGreaterThanOrEqual(safe.y);
			expect(bar.x + bar.w).toBeLessThanOrEqual(safe.x + safe.w + 1e-9);
			expect(bar.y + bar.h).toBeLessThanOrEqual(safe.y + safe.h + 1e-9);
		}
	});

	it("a taller Safe area holds more line rows", () => {
		expect(placeholderBars(safeAreaRect(A4, { top: 10, right: 18, bottom: 10, left: 18 })).length)
			.toBeGreaterThan(placeholderBars(safeAreaRect(A4, { top: 120, right: 18, bottom: 60, left: 18 })).length);
	});

	it("still draws something in the thinnest Safe area allowed", () => {
		expect(placeholderBars({ x: 0, y: 0, w: MIN_SAFE_AREA_MM, h: MIN_SAFE_AREA_MM }).length).toBeGreaterThan(0);
	});
});
