import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { buildPageSettings, PAPER_SIZES } from "./page-settings";

// A Built-in business whose stored Stationery holds Pre-printed paper bands
// (top / bottom as given; sides 14 / 16) that only a pre-printed letter uses.
const settings = (top: number, bottom: number, paper?: string) => ({
	pdf_stationery_mode: "builtin",
	pdf_stationery: JSON.stringify({ preprinted: { top, right: 14, bottom, left: 16 } }),
	pdf_paper_size: paper
}) as CompanySettingsRow;

const BUILTIN_A4 = {
	paper: "a4",
	margin_scale: 1,
	stationery: "builtin",
	chrome: true,
	margins: null,
	page_numbers: true,
	page_number_position: "footer",
	background: null
};

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

	it("a letter on pre-printed paper reserves the business's Pre-printed paper bands even when the active mode is Built-in", () => {
		expect(buildPageSettings(settings(60, 25), { preprinted: true })).toEqual({
			paper: "a4",
			margin_scale: 1,
			stationery: "preprinted",
			chrome: false,
			margins: { top: 60, right: 14, bottom: 25, left: 16 },
			page_numbers: true,
			page_number_position: "safe_area",
			background: null
		});
	});

	it("a letter on pre-printed paper uses the same bands as the business's Pre-printed paper mode", () => {
		const business = { ...settings(40, 30), pdf_stationery_mode: "preprinted" } as CompanySettingsRow;
		expect(buildPageSettings(business, { preprinted: true })).toEqual(buildPageSettings(business));
	});

	it("a letter that uses the stationery renders like every other document, whatever the mode", () => {
		const business = { ...settings(40, 30), pdf_stationery_mode: "preprinted" } as CompanySettingsRow;
		expect(buildPageSettings(business, { preprinted: false })).toEqual(buildPageSettings(business));
		expect(buildPageSettings(settings(40, 30), { preprinted: false })).toEqual(buildPageSettings(settings(40, 30)));
	});

	it("falls back to 55 mm / 20 mm bands when settings are missing", () => {
		expect(buildPageSettings(null, { preprinted: true }).margins).toEqual({ top: 55, right: 18, bottom: 20, left: 18 });
	});

	it("ignores the business's pre-printed bands when the document is not on pre-printed paper", () => {
		expect(buildPageSettings(settings(60, 25), { preprinted: false })).toEqual(BUILTIN_A4);
	});

	it("numbers the pages of every document, pre-printed paper included (templates print them only past one page)", () => {
		expect(buildPageSettings(null).page_numbers).toBe(true);
		expect(buildPageSettings(settings(60, 25), { preprinted: true }).page_numbers).toBe(true);
		expect(buildPageSettings(onStationery("preprinted")).page_numbers).toBe(true);
	});
});

describe("stationery mode", () => {
	it("built-in: the Layout's margins apply and the app draws its own identity", () => {
		const page = buildPageSettings(onStationery("builtin", { preprinted: { top: 40, right: 10, bottom: 30, left: 10 } }));
		expect(page).toMatchObject({ stationery: "builtin", chrome: true, margins: null });
	});

	it("pre-printed paper: the Stationery's four margins bound the Safe area", () => {
		const page = buildPageSettings(onStationery("preprinted", { preprinted: { top: 40, right: 10, bottom: 30, left: 12 } }));
		expect(page.margins).toEqual({ top: 40, right: 10, bottom: 30, left: 12 });
	});

	it("pre-printed paper: nothing of the built-in identity is drawn (no logo, header text, business block or footer)", () => {
		const page = buildPageSettings(onStationery("preprinted"));
		expect({ stationery: page.stationery, chrome: page.chrome }).toEqual({ stationery: "preprinted", chrome: false });
	});

	it("pre-printed paper with nothing stored reserves today's 55 mm / 20 mm letter bands", () => {
		expect(buildPageSettings(onStationery("preprinted", null)).margins).toEqual({ top: 55, right: 18, bottom: 20, left: 18 });
	});

	it("pre-printed paper with malformed stored JSON still reserves the default bands", () => {
		expect(buildPageSettings(onStationery("preprinted", "{oops")).margins).toEqual({ top: 55, right: 18, bottom: 20, left: 18 });
	});

	it("a mode the app can't render yet falls back to Built-in", () => {
		expect(buildPageSettings(onStationery("header_footer"))).toMatchObject({ stationery: "builtin", chrome: true, margins: null, background: null });
	});
});

describe("full-page background", () => {
	const withArtwork = { background: { ext: "pdf", paper: "a4", margins: { top: 50, right: 15, bottom: 30, left: 17 } } };

	it("draws the artwork behind every page and bounds the Safe area with the background's own margins", () => {
		expect(buildPageSettings(onStationery("background", withArtwork))).toEqual({
			paper: "a4",
			margin_scale: 1,
			stationery: "background",
			chrome: false,
			margins: { top: 50, right: 15, bottom: 30, left: 17 },
			page_numbers: true,
			page_number_position: "safe_area",
			background: { ext: "pdf" }
		});
	});

	it("still owns the page when no artwork is uploaded yet: its margins apply, nothing is drawn behind", () => {
		expect(buildPageSettings(onStationery("background", null))).toMatchObject({
			stationery: "background",
			chrome: false,
			margins: { top: 40, right: 18, bottom: 25, left: 18 },
			background: null
		});
	});

	it("never scales its margins with the paper", () => {
		expect(buildPageSettings({ ...onStationery("background", withArtwork), pdf_paper_size: "a5" } as CompanySettingsRow).margins).toEqual({ top: 50, right: 15, bottom: 30, left: 17 });
	});

	it("a letter set to pre-printed paper reserves the Pre-printed bands and draws no background", () => {
		const both = onStationery("background", { ...withArtwork, preprinted: { top: 60, right: 14, bottom: 25, left: 16 } });
		expect(buildPageSettings(both, { preprinted: true })).toMatchObject({
			stationery: "preprinted",
			margins: { top: 60, right: 14, bottom: 25, left: 16 },
			background: null
		});
	});

	it("pre-printed paper ignores a stored background", () => {
		expect(buildPageSettings(onStationery("preprinted", withArtwork)).background).toBeNull();
	});
});

describe("page number position", () => {
	it("built-in keeps the number just above the footer, in the bottom band", () => {
		expect(buildPageSettings(onStationery("builtin")).page_number_position).toBe("footer");
	});

	it("pre-printed paper puts the number inside the Safe area, so it never prints over the paper's own footer", () => {
		expect(buildPageSettings(onStationery("preprinted")).page_number_position).toBe("safe_area");
	});

	it("a letter on pre-printed paper also keeps its number inside the Safe area", () => {
		expect(buildPageSettings(settings(60, 25), { preprinted: true }).page_number_position).toBe("safe_area");
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
		expect(buildPageSettings(settings(60, 25, "a5"), { preprinted: true }).margins).toEqual({ top: 60, right: 14, bottom: 25, left: 16 });
	});

	it("offers exactly the four supported sheets, A4 first", () => {
		expect(PAPER_SIZES.map((p) => p.key)).toEqual(["a4", "a5", "us-letter", "us-legal"]);
	});
});
