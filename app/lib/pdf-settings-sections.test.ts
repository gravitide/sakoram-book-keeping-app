import { describe, expect, it } from "vitest";
import { PDF_SECTION_IDS, pdfSettingsSections } from "./pdf-settings-sections";

describe("pdfSettingsSections", () => {
	it("is exactly Page and Design (the font lives in the page designer)", () => {
		expect(pdfSettingsSections().map((s) => [s.hash, s.label])).toEqual([
			["#page", "Page"],
			["#design", "Design"]
		]);
	});

	it("anchors on the page's section ids", () => {
		expect(pdfSettingsSections().map((s) => s.hash)).toEqual(Object.values(PDF_SECTION_IDS).map((id) => `#${id}`));
	});
});
