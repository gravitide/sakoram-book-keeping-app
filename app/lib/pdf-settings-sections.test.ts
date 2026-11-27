import { describe, expect, it } from "vitest";
import { MODE_OPTIONS, PDF_SECTION_IDS, pdfSettingsSections, preprintedBandSummary } from "./pdf-settings-sections";
import { STATIONERY_MODES } from "./stationery";

describe("pdfSettingsSections", () => {
	it("is exactly Page, the mode's options, Font", () => {
		expect(pdfSettingsSections("builtin").map((s) => [s.hash, s.label])).toEqual([
			["#page", "Page"],
			["#mode-options", "Built-in options"],
			["#font", "Font"]
		]);
	});

	it("names each mode's options after its heading, on one stable anchor", () => {
		for (const m of STATIONERY_MODES) {
			const [, options] = pdfSettingsSections(m.key);
			expect(options!.hash).toBe(`#${PDF_SECTION_IDS.options}`);
			expect(options!.label).toBe(MODE_OPTIONS[m.key].heading);
			expect(options!.label).toBe(`${m.label} options`);
		}
	});
});

describe("preprintedBandSummary", () => {
	it("folds equal sides into one", () => {
		expect(preprintedBandSummary({ top: 55, right: 18, bottom: 20, left: 18 })).toBe("Top 55 mm · Bottom 20 mm · Sides 18 mm");
	});

	it("lists the sides separately when they differ", () => {
		expect(preprintedBandSummary({ top: 55, right: 14, bottom: 20, left: 16 })).toBe("Top 55 mm · Bottom 20 mm · Left 16 mm · Right 14 mm");
	});

	it("rounds to a tenth of a millimetre", () => {
		expect(preprintedBandSummary({ top: 55.04, right: 18.01, bottom: 20.26, left: 17.99 })).toBe("Top 55 mm · Bottom 20.3 mm · Sides 18 mm");
	});
});
