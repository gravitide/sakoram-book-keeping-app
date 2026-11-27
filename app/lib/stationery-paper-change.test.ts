// Changing the Paper size under custom Stationery: what happens to the
// artwork, the Header & footer images and every mode's margins. The rules live
// in stationery-geometry.ts (refitPaperGeometry and friends).
import type { PaperGeometry } from "./stationery-geometry";
import { describe, expect, it } from "vitest";
import { resolvePaperSize } from "./page-settings";
import { MAX_BAND_MM, parseStationery } from "./stationery";
import { confirmPaperGeometry, paperGeometryOf, refitPaperGeometry, refitStationery, stationeryReview, withPaperGeometry } from "./stationery-geometry";

const A4 = resolvePaperSize("a4");
const A5 = resolvePaperSize("a5");

// A 7:1 header (210 × 30 mm on A4) and a 14:1 footer (210 × 15 mm), flush to
// their edges, with each band 4 mm past its image.
const a4Geometry = (): PaperGeometry => ({
	preprinted: { top: 55, right: 18, bottom: 20, left: 18 },
	background: { margins: { top: 40, right: 18, bottom: 25, left: 18 }, paper: "a4" },
	header_footer: {
		header: { rect: { x: 0, y: 0, w: 210, h: 30 }, paper: "a4" },
		footer: { rect: { x: 0, y: 282, w: 210, h: 15 }, paper: "a4" },
		margins: { top: 34, right: 20, bottom: 19, left: 20 }
	}
});

describe("refitPaperGeometry — A4 ↔ A5 scales everything proportionally", () => {
	const k = 148 / 210;

	it("scales every mode's margins by the width ratio", () => {
		const g = refitPaperGeometry(A4, A5, a4Geometry());
		expect(g.preprinted.top).toBeCloseTo(55 * k, 9);
		expect(g.preprinted.left).toBeCloseTo(18 * k, 9);
		expect(g.background.margins.bottom).toBeCloseTo(25 * k, 9);
		expect(g.header_footer.margins.top).toBeCloseTo(34 * k, 9);
	});

	it("scales a header from the top edge and a footer from the BOTTOM edge, sizes by the same ratio", () => {
		const { header, footer } = refitPaperGeometry(A4, A5, a4Geometry()).header_footer;
		expect(header!.rect.x).toBeCloseTo(0, 9);
		expect(header!.rect.y).toBeCloseTo(0, 9);
		expect(header!.rect.w).toBeCloseTo(148, 9);
		expect(header!.rect.h).toBeCloseTo(30 * k, 9);
		// Flush to the A4 bottom edge → flush to the A5 bottom edge (210 mm), not 297 × k.
		expect(footer!.rect.y + footer!.rect.h).toBeCloseTo(210, 9);
		expect(footer!.rect.w).toBeCloseTo(148, 9);
	});

	it("an image off its edge keeps its scaled distance from that edge", () => {
		const g = a4Geometry();
		g.header_footer.header = { rect: { x: 52.5, y: 8, w: 105, h: 15 }, paper: "a4" };
		g.header_footer.footer = { rect: { x: 40, y: 270, w: 70, h: 5 }, paper: "a4" };
		const { header, footer } = refitPaperGeometry(A4, A5, g).header_footer;
		expect(header!.rect).toEqual({ x: 52.5 * k, y: 8 * k, w: 105 * k, h: 15 * k });
		// 22 mm above the A4 bottom → 22 × k above the A5 bottom.
		expect(210 - footer!.rect.y - footer!.rect.h).toBeCloseTo(22 * k, 9);
		expect(footer!.rect.x).toBeCloseTo(40 * k, 9);
	});

	it("the images and the background move to the new sheet with the geometry", () => {
		const g = refitPaperGeometry(A4, A5, a4Geometry());
		expect(g.header_footer.header!.paper).toBe("a5");
		expect(g.header_footer.footer!.paper).toBe("a5");
		expect(g.background.paper).toBe("a5");
	});

	it("an image still waiting to be checked on another sheet stays flagged", () => {
		const g = a4Geometry();
		g.header_footer.header!.paper = "us-letter";
		g.background.paper = "us-legal";
		const out = refitPaperGeometry(A4, A5, g);
		expect(out.header_footer.header!.paper).toBe("us-letter");
		expect(out.background.paper).toBe("us-legal");
	});

	it("an A4 → A5 → A4 round trip restores the original geometry", () => {
		const original = a4Geometry();
		original.header_footer.header = { rect: { x: 31, y: 7.5, w: 120, h: 17.142857 }, paper: "a4" };
		const back = refitPaperGeometry(A5, A4, refitPaperGeometry(A4, A5, original));
		expectGeometryClose(back, original);
	});

	it("an A5 → A4 → A5 round trip restores the original geometry", () => {
		const onA5 = refitPaperGeometry(A4, A5, a4Geometry());
		expectGeometryClose(refitPaperGeometry(A4, A5, refitPaperGeometry(A5, A4, onA5)), onA5);
	});

	it("a band is never scaled deeper than the Stationery stores (it would be reset to its default)", () => {
		const g = a4Geometry();
		g.preprinted.top = 120;
		expect(refitPaperGeometry(A5, A4, g).preprinted.top).toBe(MAX_BAND_MM);
	});

	it("never mutates its input", () => {
		const g = a4Geometry();
		refitPaperGeometry(A4, A5, g);
		expect(g).toEqual(a4Geometry());
	});
});

const LETTER = resolvePaperSize("us-letter");
const LEGAL = resolvePaperSize("us-legal");

describe("refitPaperGeometry — to or from US Letter / Legal keeps mm sizes", () => {
	it("leaves every margin in mm", () => {
		const g = refitPaperGeometry(A4, LETTER, a4Geometry());
		expect(g.preprinted).toEqual(a4Geometry().preprinted);
		expect(g.background.margins).toEqual(a4Geometry().background.margins);
		expect(g.header_footer.margins).toEqual(a4Geometry().header_footer.margins);
	});

	it("images keep their mm size, their distance from their own edge and from the centre line", () => {
		const { header, footer } = refitPaperGeometry(A4, LETTER, a4Geometry()).header_footer;
		// Letter is 215.9 mm wide: a centred 210 mm header stays centred.
		expect(header!.rect.x).toBeCloseTo((215.9 - 210) / 2, 9);
		expect(header!.rect).toMatchObject({ y: 0, w: 210, h: 30 });
		// Letter is 279.4 mm tall: the footer stays flush to the bottom edge.
		expect(footer!.rect.y).toBeCloseTo(279.4 - 15, 9);
		expect(footer!.rect).toMatchObject({ w: 210, h: 15 });
	});

	it("an image wider than the new page is shrunk onto it, proportions kept, still pinned to its edge", () => {
		const letter: PaperGeometry = {
			...a4Geometry(),
			header_footer: {
				header: { rect: { x: 0, y: 0, w: 215.9, h: 30.842857 }, paper: "us-letter" },
				footer: { rect: { x: 0, y: 279.4 - 15.421429, w: 215.9, h: 15.421429 }, paper: "us-letter" },
				margins: { top: 34.842857, right: 20, bottom: 19.421429, left: 20 }
			}
		};
		const { header, footer, margins } = refitPaperGeometry(LETTER, A4, letter).header_footer;
		expect(header!.rect.x).toBeCloseTo(0, 9);
		expect(header!.rect.y).toBe(0);
		expect(header!.rect.w).toBeCloseTo(210, 9);
		expect(header!.rect.w / header!.rect.h).toBeCloseTo(215.9 / 30.842857, 9);
		expect(footer!.rect.y + footer!.rect.h).toBeCloseTo(297, 9);
		expect(footer!.rect.w).toBeCloseTo(210, 9);
		// Each band follows its image's inner edge.
		expect(margins.top).toBeCloseTo(34.842857 - (30.842857 - header!.rect.h), 6);
		expect(margins.bottom).toBeCloseTo(19.421429 - (15.421429 - footer!.rect.h), 6);
	});

	it("an image deeper than the shorter page allows is shrunk until its band leaves room for content", () => {
		const legal: PaperGeometry = {
			...a4Geometry(),
			header_footer: {
				header: { rect: { x: 0, y: 0, w: 140, h: 140 }, paper: "us-legal" },
				footer: null,
				margins: { top: 144, right: 20, bottom: 100, left: 20 }
			}
		};
		const { header, margins } = refitPaperGeometry(LEGAL, LETTER, legal).header_footer;
		// Letter: 279.4 − 100 (bottom band) − 40 (least Safe area) = 139.4 for the band, less the 4 mm gap.
		expect(header!.rect.h).toBeCloseTo(135.4, 9);
		expect(header!.rect.w).toBeCloseTo(135.4, 9);
		expect(header!.rect.y).toBe(0);
		expect(margins.top).toBeCloseTo(139.4, 9);
	});

	it("the images and the background keep the sheet they were placed on — the editor asks for a check", () => {
		const g = refitPaperGeometry(A4, LETTER, a4Geometry());
		expect(g.header_footer.header!.paper).toBe("a4");
		expect(g.header_footer.footer!.paper).toBe("a4");
		expect(g.background.paper).toBe("a4");
	});

	it("a4 → Letter → A4 restores images that needed no clamping", () => {
		const g = a4Geometry();
		g.header_footer.header = { rect: { x: 40, y: 6, w: 130, h: 18.571429 }, paper: "a4" };
		expectGeometryClose(refitPaperGeometry(LETTER, A4, refitPaperGeometry(A4, LETTER, g)), g);
	});

	it("letter ↔ Legal keeps sizes too (only the height differs)", () => {
		const onLetter = refitPaperGeometry(A4, LETTER, a4Geometry());
		const { header, footer } = refitPaperGeometry(LETTER, LEGAL, onLetter).header_footer;
		expect(header!.rect).toEqual(onLetter.header_footer.header!.rect);
		expect(footer!.rect.y).toBeCloseTo(355.6 - 15, 9);
	});

	it("the same sheet changes nothing", () => {
		expect(refitPaperGeometry(LETTER, LETTER, a4Geometry())).toEqual(a4Geometry());
		expect(refitPaperGeometry(A4, A4, a4Geometry())).toEqual(a4Geometry());
	});
});

describe("stationeryReview — what the editor asks the user to check", () => {
	it("nothing, when everything was placed on this sheet", () => {
		expect(stationeryReview(a4Geometry(), "svg", "a4")).toEqual({ header: null, footer: null, background: null });
	});

	it("each image placed on another sheet, by the sheet it was placed on", () => {
		const g = refitPaperGeometry(A4, LETTER, a4Geometry());
		expect(stationeryReview(g, null, "us-letter")).toMatchObject({ header: "a4", footer: "a4" });
	});

	it("a raster background prepared for a sheet of another shape needs a re-crop", () => {
		expect(stationeryReview(a4Geometry(), "png", "us-legal").background).toEqual({ preparedFor: "a4", recrop: true });
		expect(stationeryReview(a4Geometry(), "jpg", "us-letter").background).toEqual({ preparedFor: "a4", recrop: true });
	});

	it("an SVG or PDF background just re-covers the page — a check, no re-crop", () => {
		expect(stationeryReview(a4Geometry(), "svg", "us-letter").background).toEqual({ preparedFor: "a4", recrop: false });
		expect(stationeryReview(a4Geometry(), "pdf", "us-legal").background).toEqual({ preparedFor: "a4", recrop: false });
	});

	it("no background artwork, nothing to check", () => {
		expect(stationeryReview(a4Geometry(), null, "us-letter").background).toBeNull();
	});

	it("after A4 → A5 nothing needs a check: it was all scaled", () => {
		expect(stationeryReview(refitPaperGeometry(A4, A5, a4Geometry()), "png", "a5")).toEqual({ header: null, footer: null, background: null });
	});

	it("going back to the sheet it was placed on clears the check", () => {
		const back = refitPaperGeometry(LETTER, A4, refitPaperGeometry(A4, LETTER, a4Geometry()));
		expect(stationeryReview(back, "png", "a4")).toEqual({ header: null, footer: null, background: null });
	});

	it("an unknown sheet (stored before images recorded one) is never flagged", () => {
		const g = a4Geometry();
		g.header_footer.header!.paper = null;
		g.background.paper = null;
		expect(stationeryReview(g, "png", "us-letter")).toMatchObject({ header: null, background: null });
	});
});

describe("confirmPaperGeometry — Apply in the editor confirms what it showed", () => {
	const onLetter = () => refitPaperGeometry(A4, LETTER, a4Geometry());

	it("header & footer images: both images now count as placed on this sheet", () => {
		const g = confirmPaperGeometry(onLetter(), "header_footer", "us-letter", "png");
		expect(g.header_footer.header!.paper).toBe("us-letter");
		expect(g.header_footer.footer!.paper).toBe("us-letter");
		expect(g.background.paper).toBe("a4");
		expect(g.header_footer.header!.rect).toEqual(onLetter().header_footer.header!.rect);
	});

	it("an SVG or PDF background counts as prepared for this sheet", () => {
		expect(confirmPaperGeometry(onLetter(), "background", "us-letter", "svg").background.paper).toBe("us-letter");
		expect(confirmPaperGeometry(onLetter(), "background", "us-letter", "pdf").background.paper).toBe("us-letter");
	});

	it("a raster background still needs its re-crop — Apply doesn't clear it", () => {
		expect(confirmPaperGeometry(onLetter(), "background", "us-letter", "png").background.paper).toBe("a4");
	});

	it("touches nothing of a mode it wasn't editing", () => {
		expect(confirmPaperGeometry(onLetter(), "preprinted", "us-letter", "svg")).toEqual(onLetter());
	});
});

describe("the stored Stationery JSON", () => {
	const stored = () => JSON.stringify({
		preprinted: { top: 55, right: 18, bottom: 20, left: 18 },
		background: { ext: "png", paper: "a4", crop: { x: 10, y: 0, w: 2480, h: 3508 }, live_text: false, margins: { top: 40, right: 18, bottom: 25, left: 18 } },
		header_footer: {
			header: { ext: "svg", aspect: 7, rect: { x: 0, y: 0, w: 210, h: 30 }, paper: "a4", crop: null, live_text: true },
			footer: { ext: "png", aspect: 14, rect: { x: 0, y: 282, w: 210, h: 15 }, paper: "a4", crop: { x: 0, y: 0, w: 1400, h: 100 }, live_text: false },
			margins: { top: 34, right: 20, bottom: 19, left: 20 }
		}
	});

	it("round-trips through PaperGeometry unchanged", () => {
		const s = parseStationery(stored());
		expect(withPaperGeometry(s, paperGeometryOf(s))).toEqual(s);
	});

	it("refitStationery re-fits the geometry and keeps every image's format, proportions, crop and live-text flag", () => {
		const out = parseStationery(refitStationery(stored(), A4, A5));
		const before = parseStationery(stored());
		expect(out.header_footer.header).toMatchObject({ ext: "svg", aspect: 7, crop: null, live_text: true, paper: "a5" });
		expect(out.header_footer.footer).toMatchObject({ ext: "png", aspect: 14, crop: before.header_footer.footer!.crop });
		expect(out.header_footer.header!.rect.w).toBeCloseTo(148, 9);
		expect(out.background).toMatchObject({ ext: "png", crop: before.background.crop, paper: "a5" });
		expect(out.background.margins.top).toBeCloseTo(40 * 148 / 210, 9);
	});

	it("an A4 → A5 → A4 round trip restores the stored Stationery", () => {
		expectGeometryClose(parseStationery(refitStationery(refitStationery(stored(), A4, A5), A5, A4)), parseStationery(stored()));
	});

	it("no background artwork: its sheet stays unset", () => {
		const s = parseStationery(stored());
		s.background = { ...s.background, ext: null, paper: null };
		const g = paperGeometryOf(s);
		g.background.paper = "a5";
		expect(withPaperGeometry(s, g).background.paper).toBeNull();
	});

	it("an image removed since the geometry was read is not brought back", () => {
		const s = parseStationery(stored());
		const g = paperGeometryOf(s);
		s.header_footer.footer = null;
		expect(withPaperGeometry(s, g).header_footer.footer).toBeNull();
	});
});

// Equal to 1e-9 mm everywhere (scaling there and back is float arithmetic).
function expectGeometryClose(actual: unknown, expected: unknown, path = "geometry"): void {
	if (typeof expected === "number") {
		expect(actual, path).toBeCloseTo(expected, 9);
	} else if (expected && typeof expected === "object") {
		expect(actual, path).toBeTypeOf("object");
		expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
		for (const [key, value] of Object.entries(expected)) expectGeometryClose((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
	} else {
		expect(actual, path).toBe(expected);
	}
}
