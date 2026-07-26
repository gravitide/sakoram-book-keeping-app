import type { LetterBlock } from "./letter-body";
import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { PDF_TOKENS, resolveTokens, tokenValuesFromSettings } from "./pdf-tokens";

const para = (text: string, bold = false): LetterBlock =>
	({ kind: "paragraph", runs: [{ text, ...(bold ? { bold: true } : {}) }] });

const VALUES = { business_name: "Gravitide", phone: "+94 11 234 5678", email: "" };

describe("pdf token registry", () => {
	it("exposes business_name and phone with human labels", () => {
		const tokens = PDF_TOKENS.map((t) => t.token);
		expect(tokens).toContain("{business_name}");
		expect(tokens).toContain("{phone}");
		expect(PDF_TOKENS.every((t) => t.label.length > 0)).toBe(true);
	});
});

describe("tokenValuesFromSettings", () => {
	it("yields empty strings, never the literal 'null', for a null row", () => {
		const v = tokenValuesFromSettings(null);
		expect(Object.values(v).every((x) => x === "")).toBe(true);
	});

	it("reads the business fields off the settings row", () => {
		const v = tokenValuesFromSettings({ business_name: "Gravitide", phone: "+94 11" } as CompanySettingsRow);
		expect(v.business_name).toBe("Gravitide");
		expect(v.phone).toBe("+94 11");
	});
});

describe("resolveTokens", () => {
	it("substitutes a token in a paragraph", () => {
		const out = resolveTokens([para("Call {phone} today")], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "Call +94 11 234 5678 today" }] });
	});

	it("keeps marks — a token inside a bold run stays bold", () => {
		const out = resolveTokens([para("{business_name}", true)], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "Gravitide", bold: true }] });
	});

	it("resolves several tokens in one run", () => {
		const out = resolveTokens([para("{business_name} · {phone}")], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "Gravitide · +94 11 234 5678" }] });
	});

	it("leaves an unknown token literal so typos are visible", () => {
		const out = resolveTokens([para("ring {phne}")], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "ring {phne}" }] });
	});

	it("substitutes an empty value to an empty string", () => {
		const out = resolveTokens([para("[{email}]")], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "[]" }] });
	});

	it("recurses into headings, list items and table cells", () => {
		const blocks: LetterBlock[] = [
			{ kind: "heading", level: 2, runs: [{ text: "{business_name}" }] },
			{ kind: "bullet_list", items: [[para("{phone}")]] },
			{ kind: "table", rows: [[{ blocks: [para("{business_name}")] }]] }
		];
		const out = resolveTokens(blocks, VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "Gravitide" }] });
		expect((out[1] as { items: LetterBlock[][] }).items[0]?.[0])
			.toMatchObject({ runs: [{ text: "+94 11 234 5678" }] });
		expect((out[2] as { rows: { blocks: LetterBlock[] }[][] }).rows[0]?.[0]?.blocks[0])
			.toMatchObject({ runs: [{ text: "Gravitide" }] });
	});

	it("does not mutate the input", () => {
		const input = [para("{phone}")];
		resolveTokens(input, VALUES);
		expect(input[0]).toMatchObject({ runs: [{ text: "{phone}" }] });
	});
});
