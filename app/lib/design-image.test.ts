import { describe, expect, it } from "vitest";
import { rasterTarget, uploadPlan } from "./design-image";

describe("uploadPlan", () => {
	it("accepts PNG, JPEG, SVG and PDF, marking the rasters", () => {
		expect(uploadPlan("a.JPG", "image/jpeg")).toEqual({ ext: "jpg", raster: true });
		expect(uploadPlan("b.png", "image/png")).toEqual({ ext: "png", raster: true });
		expect(uploadPlan("c.svg", "image/svg+xml")).toEqual({ ext: "svg", raster: false });
		expect(uploadPlan("d.pdf", "application/pdf")).toEqual({ ext: "pdf", raster: false });
	});

	it("goes by the type when the name has no extension", () => {
		expect(uploadPlan("logo", "image/png")).toEqual({ ext: "png", raster: true });
	});

	it("refuses anything else, saying what works", () => {
		expect(uploadPlan("e.webp", "image/webp")).toEqual({ error: "Use a PNG, JPEG, SVG or PDF image." });
	});
});

describe("rasterTarget", () => {
	it("shrinks a huge photo to 300 DPI at the page size, keeping its shape", () => {
		// 3:4 is wider than A4's 1:1.414, so the 2480 px width is the limit.
		const t = rasterTarget({ w: 6000, h: 8000 }, "a4");
		expect(t.w).toBe(2480);
		expect(t.h).toBe(Math.round(8000 * 2480 / 6000));
		expect(t.h).toBeLessThanOrEqual(3508);
	});

	it("never enlarges a small image", () => {
		expect(rasterTarget({ w: 400, h: 200 }, "a4")).toEqual({ w: 400, h: 200 });
	});
});
