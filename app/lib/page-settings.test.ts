import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { buildPageSettings, PAPER_SIZES } from "./page-settings";

const settings = (top: number, bottom: number, paper?: string) => ({
	letter_preprinted_top_margin_mm: top,
	letter_preprinted_bottom_margin_mm: bottom,
	pdf_paper_size: paper
}) as CompanySettingsRow;

const BUILTIN_A4 = { paper: "a4", margin_scale: 1, stationery: "builtin", chrome: true, margins: null };

const onStationery = (mode: string, stationery: object | string | null = null) => ({
	pdf_stationery_mode: mode,
	pdf_stationery: typeof stationery === "string" || stationery === null ? stationery : JSON.stringify(stationery)
}) as CompanySettingsRow;

describe("buildPageSettings", () => {
	it("lays every document out on A4 with the Layout's own margins by default", () => {
		expect(buildPageSettings(settings(55, 20, "a4"))).toEqual(BUILTIN_A4);
	});

	it("works before settings have loaded", () => {
		expect(buildPageSettings(null)).toEqual(BUILTIN_A4);
	});

	it("reserves the business's pre-printed bands when a document is printed onto pre-printed paper", () => {
		expect(buildPageSettings(settings(60, 25), { preprinted: true })).toEqual({
			paper: "a4",
			margin_scale: 1,
			stationery: "preprinted",
			chrome: false,
			margins: { top: 60, right: 18, bottom: 25, left: 18 }
		});
	});

	it("falls back to 55 mm / 20 mm bands when settings are missing", () => {
		expect(buildPageSettings(null, { preprinted: true }).margins).toEqual({ top: 55, right: 18, bottom: 20, left: 18 });
	});

	it("ignores the business's pre-printed bands when the document is not on pre-printed paper", () => {
		expect(buildPageSettings(settings(60, 25), { preprinted: false })).toEqual(BUILTIN_A4);
	});
});

describe("Stationery mode", () => {
	it("Built-in: the Layout's margins apply and the app draws its own identity", () => {
		const page = buildPageSettings(onStationery("builtin", { preprinted: { top: 40, right: 10, bottom: 30, left: 10 } }));
		expect(page).toMatchObject({ stationery: "builtin", chrome: true, margins: null });
	});

	it("Pre-printed paper: the Stationery's four margins bound the Safe area", () => {
		const page = buildPageSettings(onStationery("preprinted", { preprinted: { top: 40, right: 10, bottom: 30, left: 12 } }));
		expect(page.margins).toEqual({ top: 40, right: 10, bottom: 30, left: 12 });
	});

	it("Pre-printed paper: nothing of the built-in identity is drawn (no logo, header text, business block or footer)", () => {
		const page = buildPageSettings(onStationery("preprinted"));
		expect({ stationery: page.stationery, chrome: page.chrome }).toEqual({ stationery: "preprinted", chrome: false });
	});

	it("Pre-printed paper with nothing stored reserves today's 55 mm / 20 mm letter bands", () => {
		expect(buildPageSettings(onStationery("preprinted", null)).margins).toEqual({ top: 55, right: 18, bottom: 20, left: 18 });
	});

	it("Pre-printed paper with malformed stored JSON still reserves the default bands", () => {
		expect(buildPageSettings(onStationery("preprinted", "{oops")).margins).toEqual({ top: 55, right: 18, bottom: 20, left: 18 });
	});

	it("a mode the app can't render yet falls back to Built-in", () => {
		expect(buildPageSettings(onStationery("background"))).toMatchObject({ stationery: "builtin", chrome: true, margins: null });
	});
});

describe("paper size", () => {
	it.each(["a5", "us-letter", "us-legal"])("lays the page out on the business's paper (%s)", (paper) => {
		expect(buildPageSettings(settings(55, 20, paper)).paper).toBe(paper);
	});

	it("falls back to A4 for a value it doesn't know", () => {
		expect(buildPageSettings(settings(55, 20, "tabloid")).paper).toBe("a4");
	});

	// Built-in Layout margins scale with paper width relative to A4's 210 mm;
	// type sizes are not scaled at all (they live in the templates, in points).
	it.each([
		["a4", 18, 18],
		["a5", 18, 12.69], // 148 mm wide: the spec's "18 mm on A4 ≈ 12.7 mm on A5"
		["us-letter", 18, 18.51], // 8.5 in = 215.9 mm
		["us-legal", 18, 18.51] // same width as Letter
	])("scales a %s Layout margin of %d mm to about %d mm", (paper, a4Mm, expectedMm) => {
		const { margin_scale } = buildPageSettings(settings(55, 20, paper as string));
		expect((a4Mm as number) * margin_scale).toBeCloseTo(expectedMm as number, 2);
	});

	it("never scales the Stationery's own margins — pre-printed bands stay as the business set them on A5", () => {
		expect(buildPageSettings(settings(60, 25, "a5"), { preprinted: true }).margins).toEqual({ top: 60, right: 18, bottom: 25, left: 18 });
	});

	it("offers exactly the four supported sheets, A4 first", () => {
		expect(PAPER_SIZES.map((p) => p.key)).toEqual(["a4", "a5", "us-letter", "us-legal"]);
	});
});
