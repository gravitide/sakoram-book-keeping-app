import type { LetterBlock, LetterInline } from "./letter-body";
import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { blocksToPlainLines, buildFooterBlocks, buildHeaderBlocks, FOOTER_MAX_BLOCKS } from "./pdf-chrome";

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

describe("blocksToPlainLines", () => {
	const para = (...runs: LetterInline[]): LetterBlock => ({ kind: "paragraph", runs });

	it("gives each paragraph its own line", () => {
		expect(blocksToPlainLines([para({ text: "TRIVYOL" }), para({ text: "812 Sandy Dr NW" })]))
			.toEqual(["TRIVYOL", "812 Sandy Dr NW"]);
	});

	// The bug this exists to prevent: a four-line address typed with
	// Shift+Enter collapsed into a single line in the A4 mock.
	it("splits a paragraph on hard breaks", () => {
		const block = para(
			{ text: "TRIVYOL" },
			{ text: "", line_break: true },
			{ text: "812 Sandy Dr NW" },
			{ text: "", line_break: true },
			{ text: "Albuquerque" }
		);
		expect(blocksToPlainLines([block])).toEqual(["TRIVYOL", "812 Sandy Dr NW", "Albuquerque"]);
	});

	it("joins adjacent runs within one line, preserving marks' text", () => {
		expect(blocksToPlainLines([para({ text: "+1 918 730 3633" }, { text: " | " }, { text: "hi@x.com" })]))
			.toEqual(["+1 918 730 3633 | hi@x.com"]);
	});

	it("drops blank lines", () => {
		expect(blocksToPlainLines([para({ text: "  " }), para({ text: "kept" })])).toEqual(["kept"]);
	});

	it("skips blocks with no runs", () => {
		const list: LetterBlock = { kind: "bullet_list", items: [[para({ text: "x" })]] };
		expect(blocksToPlainLines([list, para({ text: "kept" })])).toEqual(["kept"]);
	});

	it("returns nothing for an empty tree", () => {
		expect(blocksToPlainLines([])).toEqual([]);
	});
});
