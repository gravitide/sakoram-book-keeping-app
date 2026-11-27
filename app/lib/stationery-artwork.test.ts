import { describe, expect, it } from "vitest";
import { backgroundFormatOf, backgroundMimeOf, backgroundPixelSize, downscaleSize, isRasterBackground, matchesPaperAspect, svgAspect, svgHasLiveText } from "./stationery-artwork";

describe("backgroundPixelSize", () => {
	// About 300 DPI at the paper size — the spec's 2480 × 3508 for A4.
	it.each([
		["a4", 2480, 3508],
		["a5", 1748, 2480],
		["us-letter", 2550, 3300],
		["us-legal", 2550, 4200]
	] as const)("%s → %d × %d px", (paper, w, h) => {
		expect(backgroundPixelSize(paper)).toEqual({ w, h });
	});
});

describe("matchesPaperAspect", () => {
	it("accepts an image already in the paper's proportions, at any resolution", () => {
		expect(matchesPaperAspect(2480, 3508, "a4")).toBe(true);
		expect(matchesPaperAspect(1240, 1754, "a4")).toBe(true);
		expect(matchesPaperAspect(850, 1100, "us-letter")).toBe(true);
	});

	it("forgives a pixel of rounding", () => {
		expect(matchesPaperAspect(595, 842, "a4")).toBe(true);
	});

	it("sends anything else to the cropper", () => {
		expect(matchesPaperAspect(2480, 3300, "a4")).toBe(false); // Letter-shaped artwork on A4
		expect(matchesPaperAspect(3508, 2480, "a4")).toBe(false); // landscape
		expect(matchesPaperAspect(1000, 1000, "a5")).toBe(false);
	});
});

describe("downscaleSize", () => {
	it("shrinks an oversized image to fit, keeping its proportions", () => {
		expect(downscaleSize(4960, 7016, { w: 2480, h: 3508 })).toEqual({ w: 2480, h: 3508 });
	});

	it("is bound by whichever side overflows most", () => {
		expect(downscaleSize(5000, 3508, { w: 2480, h: 3508 })).toEqual({ w: 2480, h: 1740 });
	});

	it("never enlarges a smaller image", () => {
		expect(downscaleSize(1240, 1754, { w: 2480, h: 3508 })).toEqual({ w: 1240, h: 1754 });
	});
});

describe("svgHasLiveText", () => {
	it("finds text elements", () => {
		expect(svgHasLiveText(`<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Acme</text></svg>`)).toBe(true);
	});

	it("finds tspans and text on a path", () => {
		expect(svgHasLiveText(`<svg><g><tspan>A</tspan></g></svg>`)).toBe(true);
		expect(svgHasLiveText(`<svg><textPath href="#p">A</textPath></svg>`)).toBe(true);
	});

	it("finds namespaced text and text whose tag spans lines", () => {
		expect(svgHasLiveText(`<svg:svg><svg:text>A</svg:text></svg:svg>`)).toBe(true);
		expect(svgHasLiveText(`<svg><text\n  x="1">A</text></svg>`)).toBe(true);
		expect(svgHasLiveText(`<svg><TEXT>A</TEXT></svg>`)).toBe(true);
	});

	it("passes artwork whose lettering is outlined into paths", () => {
		expect(svgHasLiveText(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/><rect width="5" height="5"/></svg>`)).toBe(false);
	});

	it("ignores text that only appears in comments, styles or attribute values", () => {
		expect(svgHasLiveText(`<svg><!-- <text>old</text> --><path d="M0 0"/></svg>`)).toBe(false);
		expect(svgHasLiveText(`<svg><style>text { fill: red }</style><path d="M0 0"/></svg>`)).toBe(false);
		expect(svgHasLiveText(`<svg><g id="text-block" class="textual"><path d="M0 0"/></g></svg>`)).toBe(false);
	});
});

describe("backgroundFormatOf", () => {
	it.each([
		["letterhead.svg", "svg"],
		["Letterhead.PDF", "pdf"],
		["scan.png", "png"],
		["photo.jpg", "jpg"],
		["photo.JPEG", "jpg"]
	] as const)("%s → %s", (name, ext) => {
		expect(backgroundFormatOf(name)).toBe(ext);
	});

	it("refuses anything else", () => {
		expect(backgroundFormatOf("logo.gif")).toBeNull();
		expect(backgroundFormatOf("letterhead")).toBeNull();
		expect(backgroundFormatOf("letterhead.docx")).toBeNull();
	});
});

describe("backgroundMimeOf", () => {
	it.each([
		["svg", "image/svg+xml"],
		["pdf", "application/pdf"],
		["png", "image/png"],
		["jpg", "image/jpeg"],
		["JPEG", "image/jpeg"]
	] as const)("%s → %s", (ext, mime) => {
		expect(backgroundMimeOf(ext)).toBe(mime);
	});

	it("is a generic binary type for anything that isn't a background format", () => {
		expect(backgroundMimeOf("gif")).toBe("application/octet-stream");
		expect(backgroundMimeOf("")).toBe("application/octet-stream");
	});
});

describe("isRasterBackground", () => {
	it("is true for PNG and JPEG, which are cropped and downscaled; false for SVG and PDF, which stay vector", () => {
		expect(["png", "jpg", "svg", "pdf"].map((e) => isRasterBackground(e as never))).toEqual([true, true, false, false]);
	});
});

describe("svgAspect", () => {
	it("reads the proportions from the root element's width and height", () => {
		expect(svgAspect("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"210mm\" height=\"30mm\" viewBox=\"0 0 10 10\"/>")).toBe(7);
		expect(svgAspect("<svg width='400' height='100'></svg>")).toBe(4);
	});

	it("converts mixed units", () => {
		expect(svgAspect("<svg width=\"1in\" height=\"25.4mm\"/>")).toBeCloseTo(1);
		expect(svgAspect("<svg width=\"72pt\" height=\"96px\"/>")).toBeCloseTo(1);
	});

	it("falls back to the viewBox when the size is missing or relative", () => {
		expect(svgAspect("<svg viewBox=\"0 0 210 15\"/>")).toBe(14);
		expect(svgAspect("<svg width=\"100%\" height=\"100%\" viewBox=\"0,0,300,100\"/>")).toBe(3);
	});

	it("skips a leading XML declaration and comments", () => {
		expect(svgAspect("<?xml version=\"1.0\"?><!-- <svg width=\"1\" height=\"9\"/> --><svg viewBox=\"0 0 20 10\"/>")).toBe(2);
	});

	it("gives null when nothing says how big it is", () => {
		expect(svgAspect("<svg/>")).toBeNull();
		expect(svgAspect("<svg viewBox=\"0 0 0 10\"/>")).toBeNull();
		expect(svgAspect("not an svg")).toBeNull();
	});
});
