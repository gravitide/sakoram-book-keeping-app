import { describe, expect, it } from "vitest";
import { signaturePreview } from "./signature-preview";

const doc = (content: unknown[]) => JSON.stringify({ type: "doc", content });

describe("signaturePreview", () => {
	it("returns the first non-empty line of text", () => {
		const json = doc([
			{ type: "paragraph" },
			{ type: "paragraph", content: [{ type: "text", text: "M Srisaravana" }] },
			{ type: "paragraph", content: [{ type: "text", text: "Director" }] }
		]);
		expect(signaturePreview(json)).toBe("M Srisaravana");
	});

	it("joins runs within the first line", () => {
		const json = doc([{ type: "paragraph", content: [{ type: "text", text: "Yours, " }, { type: "text", text: "Jane", marks: [{ type: "bold" }] }] }]);
		expect(signaturePreview(json)).toBe("Yours, Jane");
	});

	it("digs into list items", () => {
		const json = doc([{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Point" }] }] }] }]);
		expect(signaturePreview(json)).toBe("Point");
	});

	it("returns empty string for empty / malformed input", () => {
		expect(signaturePreview("")).toBe("");
		expect(signaturePreview("not json")).toBe("");
	});
});
