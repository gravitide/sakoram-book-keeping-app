import type { DesignItem, PageDesign } from "./page-design";
import { describe, expect, it } from "vitest";
import {
	clampItem,
	CSS_PX_PER_MM,
	dragMargin,
	fitScale,
	handlesFor,
	itemBox,
	MIN_ITEM_MM,
	mmToPx,
	moveItem,
	nudgeItem,
	PRINTER_BAND_MM,
	printerBandRects,
	pxToMm,
	resizeItem,
	rulerTicks,
	setMarginValue,
	snapTargets,
	snapValue,
	stepZoom
} from "./designer-geometry";

const A4 = { widthMm: 210, heightMm: 297 };
const STYLE = { font: "Akt", size: 10, bold: false, italic: false, color: "#111827", align: "left" } as const;

const image = (over: Partial<Extract<DesignItem, { type: "image" }>> = {}): Extract<DesignItem, { type: "image" }> =>
	({ type: "image", id: "image0000001", x: 100, y: 100, w: 20, h: 20, pages: "every", src: { kind: "file", ext: "png" }, guide: false, ...over });
const text = (over: Partial<Extract<DesignItem, { type: "text" }>> = {}): Extract<DesignItem, { type: "text" }> =>
	({ type: "text", id: "text00000001", x: 18, y: 13, w: 140, pages: "every", text: "{business_name}\n{website}", style: STYLE, ...over });
const line = (over: Partial<Extract<DesignItem, { type: "line" }>> = {}): Extract<DesignItem, { type: "line" }> =>
	({ type: "line", id: "line00000001", x: 18, y: 40, length: 174, vertical: false, thickness: 2, color: "accent", pages: "every", ...over });

const design = (items: DesignItem[] = []): PageDesign => ({ version: 1, paper: "a4", margins: { top: 20, right: 18, bottom: 20, left: 18 }, items });

// ---- ported from the Stationery editor (git 3005ffe) -----------------------

describe("mm ↔ px", () => {
	it("a CSS pixel is 1/96 inch, so 25.4 mm is 96 px at 100 %", () => {
		expect(mmToPx(25.4, CSS_PX_PER_MM)).toBeCloseTo(96);
		expect(pxToMm(96, CSS_PX_PER_MM)).toBeCloseTo(25.4);
	});
});

describe("fitScale", () => {
	it("fits a portrait page by its height in a wide viewport", () => {
		expect(fitScale(A4, { w: 1200, h: 600 }, 20)).toBeCloseTo(560 / 297);
	});

	it("never collapses to zero or below in a tiny viewport", () => {
		expect(fitScale(A4, { w: 0, h: 0 }, 20)).toBeGreaterThan(0);
	});
});

describe("stepZoom", () => {
	it("steps through the zoom levels and stops at either end", () => {
		let z = 1;
		for (let i = 0; i < 20; i++) z = stepZoom(z, 1);
		expect(stepZoom(z, 1)).toBe(z);
		for (let i = 0; i < 40; i++) z = stepZoom(z, -1);
		expect(stepZoom(z, -1)).toBe(z);
	});
});

describe("snapValue", () => {
	it("rounds to the step when no target is near, else takes the nearest target", () => {
		expect(snapValue(17.4, { step: 1 })).toBe(17);
		expect(snapValue(16.6, { step: 1, targets: [18], threshold: 2 })).toBe(18);
		expect(snapValue(50, { step: 1, targets: [47, 52], threshold: 5 })).toBe(52);
	});
});

describe("rulerTicks", () => {
	it("labels every centimetre at a comfortable zoom and thins out when zoomed out", () => {
		expect(rulerTicks(210, 4).filter((t) => t.label !== null).map((t) => t.label).slice(0, 3)).toEqual(["0", "10", "20"]);
		const minor = rulerTicks(297, 0.6).filter((t) => !t.major);
		expect((minor[1]!.mm - minor[0]!.mm) * 0.6).toBeGreaterThanOrEqual(4);
	});
});

// ---- items -------------------------------------------------------------------

describe("itemBox", () => {
	it("gives a text box the height of its lines", () => {
		expect(itemBox(text())).toEqual({ x: 18, y: 13, w: 140, h: 2 * 10 * 0.3528 * 1.25 });
	});

	it("gives a hairline a box at least 2 mm tall, centred on the line", () => {
		expect(itemBox(line())).toEqual({ x: 18, y: 39, w: 174, h: 2 });
		expect(itemBox(line({ vertical: true, x: 100, y: 50, length: 80 }))).toEqual({ x: 99, y: 50, w: 2, h: 80 });
	});
});

describe("handlesFor", () => {
	it("offers corners on an image, sides on a text box, an end on a line", () => {
		expect(handlesFor(image())).toEqual(["nw", "ne", "sw", "se"]);
		expect(handlesFor(text())).toEqual(["w", "e"]);
		expect(handlesFor(line())).toEqual(["end"]);
	});
});

describe("snapTargets", () => {
	it("is the page edges and centre, the safe area, and the other items' edges and centres", () => {
		const other = image({ id: "other0000001", x: 50, y: 60, w: 10, h: 10 });
		const { xs, ys } = snapTargets(design([image(), other]), "image0000001");
		expect(xs).toEqual(expect.arrayContaining([0, 105, 210, 18, 192, 50, 55, 60]));
		expect(ys).toEqual(expect.arrayContaining([0, 148.5, 297, 20, 277, 60, 65, 70]));
		expect(xs).not.toContain(110); // the moving image's own centre
	});
});

describe("moveItem", () => {
	const d = design([image()]);

	it("moves in whole millimetres when nothing is near", () => {
		expect(moveItem(image(), 3.2, 0, d, 1)).toMatchObject({ x: 103, y: 100 });
	});

	it("snaps an edge onto the safe area", () => {
		expect(moveItem(image(), -82.4, 0, d, 1)).toMatchObject({ x: 18 });
	});

	it("snaps its centre onto the page centre", () => {
		expect(moveItem(image(), -4.7, 0, d, 1)).toMatchObject({ x: 95 });
	});

	it("never leaves the page", () => {
		expect(moveItem(image(), -500, -500, d, 1)).toMatchObject({ x: 0, y: 0 });
		expect(moveItem(image(), 500, 500, d, 1)).toMatchObject({ x: 190, y: 277 });
	});
});

describe("resizeItem", () => {
	const d = design([image()]);
	const wide = image({ w: 40, h: 20 });

	it("keeps an image's proportions from a corner and stops at the page edge", () => {
		const r = resizeItem(wide, "se", 1000, 0, d, 1) as typeof wide;
		expect(r.w / r.h).toBeCloseTo(2);
		expect(r.x).toBe(100);
		expect(r.x + r.w).toBeLessThanOrEqual(210 + 1e-9);
	});

	it("stops shrinking at the minimum size, its far corner anchored", () => {
		const r = resizeItem(wide, "nw", 1000, 1000, d, 1) as typeof wide;
		expect(r.h).toBeCloseTo(MIN_ITEM_MM);
		expect(r.w).toBeCloseTo(2 * MIN_ITEM_MM);
		expect(r.x + r.w).toBeCloseTo(140);
		expect(r.y + r.h).toBeCloseTo(120);
	});

	it("widens a text box from its right side, keeping its left edge", () => {
		expect(resizeItem(text(), "e", 10.2, 0, design([text()]), 0.1)).toMatchObject({ x: 18, w: 150 });
	});

	it("lengthens a line from its end", () => {
		expect(resizeItem(line(), "end", -10, 0, design([line()]), 0.1)).toMatchObject({ x: 18, length: 164 });
	});
});

describe("nudgeItem", () => {
	it("moves by the step, without snapping, and stays on the page", () => {
		expect(nudgeItem(image(), "left", 5, design())).toMatchObject({ x: 95 });
		expect(nudgeItem(image({ y: 2 }), "up", 5, design())).toMatchObject({ y: 0 });
	});
});

describe("dragMargin", () => {
	const m = { top: 20, right: 18, bottom: 20, left: 18 };

	it("moves a guide inward or outward in whole millimetres", () => {
		expect(dragMargin(m, "top", 5.3, "a4", 0.5).top).toBe(25);
		expect(dragMargin(m, "bottom", -5, "a4", 0.5).bottom).toBe(25); // the bottom guide dragged up
		expect(dragMargin(m, "right", -2, "a4", 0.5).right).toBe(20);
	});

	it("keeps at least 40 mm of safe area and never goes past the page edge", () => {
		expect(dragMargin(m, "top", 500, "a4", 1).top).toBe(297 - 20 - 40);
		expect(dragMargin(m, "left", -500, "a4", 1).left).toBe(0);
	});

	it("snaps a side margin onto the opposite one", () => {
		expect(dragMargin(m, "left", 0.6, "a4", 1).left).toBe(18);
	});
});

describe("typed values (review fixes)", () => {
	it("clampItem keeps a typed position or width on the page", () => {
		expect(clampItem(image({ x: 500, y: 500 }), design())).toMatchObject({ x: 190, y: 277 });
		expect(clampItem(text({ w: 500 }), design())).toMatchObject({ x: 18, w: 192 });
		expect(clampItem(image({ w: 300, h: 150 }), design())).toMatchObject({ x: 0, w: 210 });
	});

	it("setMarginValue keeps 40 mm of safe area and never goes negative", () => {
		const m = { top: 20, right: 18, bottom: 20, left: 18 };
		expect(setMarginValue(m, "top", 500, "a4").top).toBe(297 - 20 - 40);
		expect(setMarginValue(m, "left", -3, "a4").left).toBe(0);
		expect(setMarginValue(m, "right", 25.5, "a4").right).toBe(25.5);
	});
});

describe("printerBandRects", () => {
	it("is a 5 mm strip along each edge, the corners counted once", () => {
		expect(PRINTER_BAND_MM).toBe(5);
		expect(printerBandRects(A4)).toEqual([
			{ x: 0, y: 0, w: 210, h: 5 },
			{ x: 0, y: 292, w: 210, h: 5 },
			{ x: 0, y: 5, w: 5, h: 287 },
			{ x: 205, y: 5, w: 5, h: 287 }
		]);
	});
});
