import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { buildPageSettings, PAPER_SIZES } from "./page-settings";

const settings = (top: number, bottom: number, paper?: string) => ({
	letter_preprinted_top_margin_mm: top,
	letter_preprinted_bottom_margin_mm: bottom,
	pdf_paper_size: paper
}) as CompanySettingsRow;

describe("buildPageSettings", () => {
	it("lays every document out on A4 with the Layout's own margins by default", () => {
		expect(buildPageSettings(settings(55, 20, "a4"))).toEqual({ paper: "a4", margin_scale: 1, margins: null, page_numbers: true });
	});

	it("works before settings have loaded", () => {
		expect(buildPageSettings(null)).toEqual({ paper: "a4", margin_scale: 1, margins: null, page_numbers: true });
	});

	it("reserves the business's pre-printed bands when a document is printed onto pre-printed paper", () => {
		expect(buildPageSettings(settings(60, 25), { preprinted: true })).toEqual({
			paper: "a4",
			margin_scale: 1,
			margins: { top: 60, right: 18, bottom: 25, left: 18 },
			page_numbers: true
		});
	});

	it("falls back to 55 mm / 20 mm bands when settings are missing", () => {
		expect(buildPageSettings(null, { preprinted: true }).margins).toEqual({ top: 55, right: 18, bottom: 20, left: 18 });
	});

	it("ignores the business's pre-printed bands when the document is not on pre-printed paper", () => {
		expect(buildPageSettings(settings(60, 25), { preprinted: false })).toEqual({ paper: "a4", margin_scale: 1, margins: null, page_numbers: true });
	});

	it("numbers the pages of every document, pre-printed paper included (templates print them only past one page)", () => {
		expect(buildPageSettings(null).page_numbers).toBe(true);
		expect(buildPageSettings(settings(60, 25), { preprinted: true }).page_numbers).toBe(true);
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
