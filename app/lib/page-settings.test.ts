import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { buildPageSettings } from "./page-settings";

const settings = (top: number, bottom: number) => ({
	letter_preprinted_top_margin_mm: top,
	letter_preprinted_bottom_margin_mm: bottom
}) as CompanySettingsRow;

describe("buildPageSettings", () => {
	it("lays every document out on A4 with the Layout's own margins by default", () => {
		expect(buildPageSettings(settings(55, 20))).toEqual({ paper: "a4", margins: null, page_numbers: true });
	});

	it("works before settings have loaded", () => {
		expect(buildPageSettings(null)).toEqual({ paper: "a4", margins: null, page_numbers: true });
	});

	it("reserves the business's pre-printed bands when a document is printed onto pre-printed paper", () => {
		expect(buildPageSettings(settings(60, 25), { preprinted: true })).toEqual({
			paper: "a4",
			margins: { top: 60, right: 18, bottom: 25, left: 18 },
			page_numbers: true
		});
	});

	it("falls back to 55 mm / 20 mm bands when settings are missing", () => {
		expect(buildPageSettings(null, { preprinted: true }).margins).toEqual({ top: 55, right: 18, bottom: 20, left: 18 });
	});

	it("ignores the business's pre-printed bands when the document is not on pre-printed paper", () => {
		expect(buildPageSettings(settings(60, 25), { preprinted: false })).toEqual({ paper: "a4", margins: null, page_numbers: true });
	});

	it("numbers the pages of every document, pre-printed paper included (templates print them only past one page)", () => {
		expect(buildPageSettings(null).page_numbers).toBe(true);
		expect(buildPageSettings(settings(60, 25), { preprinted: true }).page_numbers).toBe(true);
	});
});
