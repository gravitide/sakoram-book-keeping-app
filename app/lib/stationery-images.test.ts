// Header & footer images: placement, snapping, aspect-locked resizing and the
// bands that follow them. The rules live in stationery-geometry.ts.
import { describe, expect, it } from "vitest";
import {
	bandFloors,
	clampImageRect,
	defaultImageRect,
	dragImage,
	dragMargin,
	followImage,
	HEADER_FOOTER_GAP_MM,
	headerFooterMargins,
	marginLimits,
	MIN_IMAGE_MM,
	MIN_SAFE_AREA_MM,
	nudgeImage,
	nudgeMargin,
	resizeImage,
	setMargin
} from "./stationery-geometry";

const A4 = { widthMm: 210, heightMm: 297 };
const A5 = { widthMm: 148, heightMm: 210 };
const margins = { top: 20, right: 18, bottom: 20, left: 18 };
const scale = 2; // px per mm

// A 7:1 header (210 × 30 mm on A4) and a 14:1 footer (210 × 15 mm).
const header = { x: 0, y: 0, w: 210, h: 30 };
const footer = { x: 0, y: 282, w: 210, h: 15 };

describe("defaultImageRect", () => {
	it("a new header starts at full page width, flush to the top edge", () => {
		expect(defaultImageRect(A4, "header", 7, margins)).toEqual({ x: 0, y: 0, w: 210, h: 30 });
	});

	it("a new footer starts at full page width, flush to the bottom edge", () => {
		expect(defaultImageRect(A4, "footer", 14, margins)).toEqual({ x: 0, y: 282, w: 210, h: 15 });
	});

	it("an image too tall to leave room for content is shrunk (proportions kept) and centred", () => {
		// A square on A4 would be 210 mm tall; the deepest a header band can go is 150 mm.
		const rect = defaultImageRect(A4, "header", 1, margins);
		expect(rect.h).toBe(150 - HEADER_FOOTER_GAP_MM);
		expect(rect.w).toBe(rect.h);
		expect(rect.x).toBeCloseTo((210 - rect.w) / 2);
		expect(rect.y).toBe(0);
	});
});

describe("bandFloors", () => {
	it("each band reaches at least 4 mm past its image's inner edge", () => {
		expect(bandFloors(A4, { header, footer })).toEqual({ top: 34, bottom: 19 });
	});

	it("an image dragged away from its edge pushes its band further in", () => {
		expect(bandFloors(A4, { header: { ...header, y: 10 }, footer: null })).toEqual({ top: 44, bottom: 0 });
	});

	it("no images, no floors", () => {
		expect(bandFloors(A4, { header: null, footer: null })).toEqual({ top: 0, bottom: 0 });
	});
});

describe("headerFooterMargins", () => {
	it("pushes a band that sits inside its image out to the floor", () => {
		expect(headerFooterMargins(A4, { header, footer }, margins)).toEqual({ top: 34, right: 18, bottom: 20, left: 18 });
	});

	it("keeps a band that already gives the image more room", () => {
		expect(headerFooterMargins(A4, { header, footer }, { ...margins, top: 50 })).toEqual({ ...margins, top: 50 });
	});
});

describe("margin guides with images", () => {
	const floors = { top: 34, bottom: 19 };
	const m = { top: 34, right: 18, bottom: 25, left: 18 };

	it("a band can't be dragged into its image", () => {
		expect(marginLimits(A4, m, "top", floors).min).toBe(34);
		expect(dragMargin(A4, m, "top", { dx: 0, dy: -200 }, scale, floors).top).toBe(34);
		expect(dragMargin(A4, m, "bottom", { dx: 0, dy: 200 }, scale, floors).bottom).toBe(19);
	});

	it("a band can be dragged further out for more room", () => {
		expect(dragMargin(A4, m, "top", { dx: 0, dy: 20 }, scale, floors).top).toBe(44);
	});

	it("typed values and arrow keys respect the floor too", () => {
		expect(setMargin(A4, m, "top", 10, floors).top).toBe(34);
		expect(nudgeMargin(A4, m, "top", "up", 5, floors).top).toBe(34);
	});

	it("the side margins are unaffected", () => {
		expect(marginLimits(A4, m, "left", floors).min).toBe(0);
	});
});

describe("followImage", () => {
	it("a newly placed header sets the top band to its bottom edge + 4 mm", () => {
		expect(followImage(A4, "header", null, header, margins).top).toBe(34);
	});

	it("a newly placed footer sets the bottom band to its top edge + 4 mm", () => {
		expect(followImage(A4, "footer", null, footer, margins).bottom).toBe(19);
	});

	it("moving the image carries its band along, keeping any extra room", () => {
		const m = { ...margins, top: 40 }; // 6 mm past the floor of 34
		expect(followImage(A4, "header", header, { ...header, y: 10 }, m).top).toBe(50);
		expect(followImage(A4, "header", { ...header, y: 10 }, header, { ...m, top: 50 }).top).toBe(40);
	});

	it("shrinking the footer lets its band come back down with it", () => {
		const smaller = { x: 0, y: 287, w: 140, h: 10 };
		expect(followImage(A4, "footer", footer, smaller, { ...margins, bottom: 19 }).bottom).toBe(14);
	});

	it("removing an image keeps its band where it was, and never moves the other band", () => {
		expect(followImage(A4, "header", header, null, { ...margins, top: 34 })).toEqual({ ...margins, top: 34 });
		expect(followImage(A4, "footer", null, footer, { ...margins, top: 34 }).top).toBe(34);
	});
});

describe("dragImage", () => {
	const small = { x: 40, y: 0, w: 70, h: 10 };

	it("moves with the pointer", () => {
		expect(dragImage(A4, "header", small, { dx: 20, dy: 10 }, scale, margins)).toEqual({ ...small, x: 50, y: 5 });
	});

	it("is measured from where the drag started", () => {
		const once = dragImage(A4, "header", small, { dx: 33, dy: 7 }, scale, margins);
		expect(dragImage(A4, "header", small, { dx: 33, dy: 7 }, scale, margins)).toEqual(once);
	});

	it("snaps to the left and right page edges", () => {
		// 40 − 37/2 = 21.5 mm … not near. 40 − 78/2 = 1 mm — within 3 mm (6 px at 2 px/mm) of 0.
		expect(dragImage(A4, "header", small, { dx: -78, dy: 0 }, scale, margins).x).toBe(0);
		// Right edge: 140 − 70 = 140; start 40 + 99/2 = 89.5… use a drag landing at 138.
		expect(dragImage(A4, "header", small, { dx: 196, dy: 0 }, scale, margins).x).toBe(140);
	});

	it("snaps its middle to the page's centre line", () => {
		// Centred x = (210 − 70) / 2 = 70; land at 71.5.
		expect(dragImage(A4, "header", small, { dx: 63, dy: 0 }, scale, margins).x).toBe(70);
	});

	it("snaps to the top and bottom page edges", () => {
		expect(dragImage(A4, "header", { ...small, y: 8 }, { dx: 0, dy: -14 }, scale, margins).y).toBe(0);
		expect(dragImage(A4, "footer", { ...small, y: 280 }, { dx: 0, dy: 10 }, scale, margins).y).toBe(287);
	});

	it("stays on the page", () => {
		expect(dragImage(A4, "header", small, { dx: -900, dy: -900 }, scale, margins)).toMatchObject({ x: 0, y: 0 });
		expect(dragImage(A4, "footer", { ...small, y: 287 }, { dx: 900, dy: 900 }, scale, margins)).toMatchObject({ x: 140, y: 287 });
	});

	it("a header can't be dragged so low its band would leave the content too little room", () => {
		const rect = dragImage(A5, "header", small, { dx: 0, dy: 900 }, scale, { ...margins, bottom: 30 });
		// Deepest top band: min(150, 210 − 30 − 40) = 140; the image's bottom stays 4 mm above it.
		expect(rect.y + rect.h).toBe(140 - HEADER_FOOTER_GAP_MM);
	});

	it("a footer can't be dragged so high its band would leave the content too little room", () => {
		const rect = dragImage(A5, "footer", { ...small, y: 200 }, { dx: 0, dy: -900 }, scale, { ...margins, top: 50 });
		// Deepest bottom band: min(150, 210 − 50 − 40) = 120.
		expect(210 - rect.y).toBe(120 - HEADER_FOOTER_GAP_MM);
	});
});

describe("resizeImage", () => {
	const small = { x: 40, y: 0, w: 70, h: 10 }; // 7:1

	it("keeps the proportions locked from any corner", () => {
		const r = resizeImage(A4, "header", small, "se", { dx: 40, dy: 0 }, scale, margins);
		expect(r).toEqual({ x: 40, y: 0, w: 90, h: 90 / 7 });
	});

	it("the opposite corner stays put", () => {
		const r = resizeImage(A4, "footer", { x: 40, y: 280, w: 70, h: 10 }, "nw", { dx: -40, dy: 0 }, scale, margins);
		expect(r.x + r.w).toBe(110);
		expect(r.y + r.h).toBe(290);
		expect(r.w / r.h).toBeCloseTo(7);
	});

	it("follows whichever way the pointer moved further", () => {
		// 14 px down = 7 mm taller → 49 mm wider, beating the 10 mm the x drag asks for.
		const r = resizeImage(A4, "header", small, "se", { dx: 20, dy: 14 }, scale, margins);
		expect(r.h).toBeCloseTo(17);
		expect(r.w).toBeCloseTo(119);
	});

	it("snaps the moving edge to the page edge and the centre line", () => {
		// Right edge would land at 208.5 → the page edge (210).
		expect(resizeImage(A4, "header", small, "se", { dx: 197, dy: 0 }, scale, margins).w).toBe(170);
		// Right edge would land at 106 → the centre line (105).
		expect(resizeImage(A4, "header", small, "se", { dx: -8, dy: 0 }, scale, margins).w).toBe(65);
	});

	it("can't be shrunk below the minimum size or grown off the page", () => {
		expect(resizeImage(A4, "header", small, "se", { dx: -900, dy: 0 }, scale, margins).w).toBe(MIN_IMAGE_MM);
		expect(resizeImage(A4, "header", small, "se", { dx: 900, dy: 0 }, scale, margins).w).toBe(170);
	});

	it("can't grow so tall its band would leave the content too little room", () => {
		const r = resizeImage(A5, "header", { x: 0, y: 0, w: 20, h: 20 }, "se", { dx: 0, dy: 900 }, scale, { ...margins, bottom: 30 });
		expect(r.y + r.h).toBeLessThanOrEqual(140 - HEADER_FOOTER_GAP_MM + 1e-9);
		expect(r.w).toBeCloseTo(r.h);
	});
});

describe("nudgeImage", () => {
	it("arrow keys move the image a step, staying on the page", () => {
		const small = { x: 40, y: 0, w: 70, h: 10 };
		expect(nudgeImage(A4, "header", small, "right", 5, margins)).toEqual({ ...small, x: 45 });
		expect(nudgeImage(A4, "header", small, "up", 1, margins)).toEqual(small);
	});
});

describe("clampImageRect", () => {
	it("shrinks an image placed on a bigger sheet so it fits this one, keeping proportions", () => {
		const r = clampImageRect(A5, "header", header, margins);
		expect(r.w).toBe(148);
		expect(r.w / r.h).toBeCloseTo(7);
		expect(r.x).toBe(0);
	});

	it("the safe area keeps its minimum height", () => {
		const r = clampImageRect(A5, "footer", { x: 0, y: 60, w: 148, h: 150 }, { ...margins, top: 30 });
		expect(210 - r.y + HEADER_FOOTER_GAP_MM + 30 + MIN_SAFE_AREA_MM).toBeLessThanOrEqual(210 + 1e-9);
	});
});
