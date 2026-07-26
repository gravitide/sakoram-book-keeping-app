import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { buildFooterBlocks, buildHeaderBlocks, FOOTER_MAX_BLOCKS } from "./pdf-chrome";

const doc = (...paras: string[]) => JSON.stringify({
	type: "doc",
	content: paras.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] }))
});

const settings = (over: Partial<CompanySettingsRow>) =>
	({ business_name: "Gravitide", phone: "+94 11", ...over } as CompanySettingsRow);

describe("buildHeaderBlocks", () => {
	it("returns nothing when the custom flag is off", () => {
		expect(buildHeaderBlocks(settings({ pdf_header_custom: 0, pdf_header_text: doc("Hi") }))).toEqual([]);
	});

	it("returns nothing when the flag is on but the text is empty", () => {
		expect(buildHeaderBlocks(settings({ pdf_header_custom: 1, pdf_header_text: null }))).toEqual([]);
	});

	it("resolves tokens when enabled", () => {
		const out = buildHeaderBlocks(settings({ pdf_header_custom: 1, pdf_header_text: doc("{business_name}") }));
		expect(out[0]).toMatchObject({ runs: [{ text: "Gravitide" }] });
	});

	it("returns nothing for a null settings row", () => {
		expect(buildHeaderBlocks(null)).toEqual([]);
	});
});

describe("buildFooterBlocks", () => {
	it("caps at FOOTER_MAX_BLOCKS so the fixed footer region can't overflow", () => {
		const out = buildFooterBlocks(settings({
			pdf_footer_custom: 1,
			pdf_footer_text: doc("a", "b", "c", "d", "e")
		}));
		expect(out).toHaveLength(FOOTER_MAX_BLOCKS);
	});

	it("returns nothing when the custom flag is off", () => {
		expect(buildFooterBlocks(settings({ pdf_footer_custom: 0, pdf_footer_text: doc("a") }))).toEqual([]);
	});
});
