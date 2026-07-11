import { describe, expect, it } from "vitest";
import { signaturePreview, signaturePreviewLines } from "./signature-preview";

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

describe("signaturePreviewLines", () => {
	it("returns each non-empty line in document order", () => {
		const json = doc([
			{ type: "paragraph", content: [{ type: "text", text: "M Srisaravana" }] },
			{ type: "paragraph" },
			{ type: "paragraph", content: [{ type: "text", text: "Founder & Developer" }] }
		]);
		expect(signaturePreviewLines(json)).toEqual(["M Srisaravana", "Founder & Developer"]);
	});

	it("caps the number of lines at max", () => {
		const json = doc([
			{ type: "paragraph", content: [{ type: "text", text: "One" }] },
			{ type: "paragraph", content: [{ type: "text", text: "Two" }] },
			{ type: "paragraph", content: [{ type: "text", text: "Three" }] },
			{ type: "paragraph", content: [{ type: "text", text: "Four" }] }
		]);
		expect(signaturePreviewLines(json, 2)).toEqual(["One", "Two"]);
	});

	it("digs into list items", () => {
		const json = doc([{ type: "bulletList", content: [
			{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha" }] }] },
			{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Beta" }] }] }
		] }]);
		expect(signaturePreviewLines(json)).toEqual(["Alpha", "Beta"]);
	});

	it("returns an empty array for empty / malformed input", () => {
		expect(signaturePreviewLines("")).toEqual([]);
		expect(signaturePreviewLines("not json")).toEqual([]);
	});
});
