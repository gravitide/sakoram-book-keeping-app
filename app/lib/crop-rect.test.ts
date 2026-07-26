import { describe, expect, it } from "vitest";
import { fullRect, moveRect, resizeRect } from "./crop-rect";

describe("fullRect", () => {
	it("covers the whole image", () => {
		expect(fullRect(800, 600)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
	});
});

describe("moveRect", () => {
	it("moves freely inside bounds", () => {
		expect(moveRect({ x: 10, y: 10, w: 100, h: 50 }, 20, 5, 800, 600))
			.toEqual({ x: 30, y: 15, w: 100, h: 50 });
	});

	it("clamps at the edges without shrinking", () => {
		expect(moveRect({ x: 10, y: 10, w: 100, h: 50 }, -999, -999, 800, 600))
			.toEqual({ x: 0, y: 0, w: 100, h: 50 });
		expect(moveRect({ x: 10, y: 10, w: 100, h: 50 }, 9999, 9999, 800, 600))
			.toEqual({ x: 700, y: 550, w: 100, h: 50 });
	});
});

describe("resizeRect", () => {
	it("se drag grows width and height", () => {
		expect(resizeRect({ x: 10, y: 10, w: 100, h: 50 }, "se", 40, 30, 800, 600))
			.toEqual({ x: 10, y: 10, w: 140, h: 80 });
	});

	it("nw drag moves the origin and shrinks", () => {
		expect(resizeRect({ x: 10, y: 10, w: 100, h: 50 }, "nw", 5, 5, 800, 600))
			.toEqual({ x: 15, y: 15, w: 95, h: 45 });
	});

	it("never collapses below minSize", () => {
		const r = resizeRect({ x: 10, y: 10, w: 100, h: 50 }, "se", -999, -999, 800, 600, 16);
		expect(r.w).toBe(16);
		expect(r.h).toBe(16);
	});

	it("never escapes the image bounds", () => {
		const r = resizeRect({ x: 700, y: 550, w: 100, h: 50 }, "se", 999, 999, 800, 600);
		expect(r.x + r.w).toBeLessThanOrEqual(800);
		expect(r.y + r.h).toBeLessThanOrEqual(600);
	});

	it("rounds to whole pixels", () => {
		const r = resizeRect({ x: 0, y: 0, w: 100, h: 50 }, "se", 0.4, 0.6, 800, 600);
		expect([r.x, r.y, r.w, r.h].every(Number.isInteger)).toBe(true);
	});
});

describe("fullRect with an aspect lock", () => {
	it("centres the largest square on a landscape source", () => {
		expect(fullRect(800, 600, 1)).toEqual({ x: 100, y: 0, w: 600, h: 600 });
	});

	it("centres the largest square on a portrait source", () => {
		expect(fullRect(600, 800, 1)).toEqual({ x: 0, y: 100, w: 600, h: 600 });
	});

	it("uses the whole image when it already matches the ratio", () => {
		expect(fullRect(500, 500, 1)).toEqual({ x: 0, y: 0, w: 500, h: 500 });
	});

	it("is unchanged when no aspect is given", () => {
		expect(fullRect(800, 600)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
	});
});

describe("resizeRect with an aspect lock", () => {
	const square = { x: 100, y: 100, w: 200, h: 200 };

	it("holds the ratio from every corner", () => {
		for (const corner of ["nw", "ne", "sw", "se"] as const) {
			const r = resizeRect(square, corner, 40, 10, 800, 600, 16, 1);
			expect(r.w).toBe(r.h);
		}
	});

	it("keeps the anchored corner pinned", () => {
		// Dragging NW must leave the SE corner where it was.
		const r = resizeRect(square, "nw", 30, 30, 800, 600, 16, 1);
		expect(r.x + r.w).toBe(square.x + square.w);
		expect(r.y + r.h).toBe(square.y + square.h);
	});

	it("is driven by whichever axis moved further", () => {
		// dy dominates, so the square follows the vertical drag, not dx.
		const r = resizeRect(square, "se", 5, 80, 800, 600, 16, 1);
		expect(r.w).toBe(280);
		expect(r.h).toBe(280);
	});

	it("shrinks BOTH axes when clamping at the image edge", () => {
		// Only 100px of headroom to the right; the square must stop at 100,
		// not stretch to 300x100.
		const r = resizeRect({ x: 700, y: 100, w: 50, h: 50 }, "se", 999, 999, 800, 600, 16, 1);
		expect(r.w).toBe(r.h);
		expect(r.x + r.w).toBeLessThanOrEqual(800);
		expect(r.y + r.h).toBeLessThanOrEqual(600);
	});

	it("never collapses below minSize", () => {
		const r = resizeRect(square, "se", -999, -999, 800, 600, 16, 1);
		expect(r.w).toBe(16);
		expect(r.h).toBe(16);
	});

	it("supports a non-square ratio", () => {
		const r = resizeRect({ x: 0, y: 0, w: 100, h: 50 }, "se", 100, 0, 800, 600, 16, 2);
		expect(r.w / r.h).toBeCloseTo(2, 5);
	});
});
