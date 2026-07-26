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
