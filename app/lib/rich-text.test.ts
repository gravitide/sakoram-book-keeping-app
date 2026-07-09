import { describe, expect, it } from "vitest";
import { richTextToBlocks } from "./rich-text";

const doc = (content: unknown[]) => JSON.stringify({ type: "doc", content });

describe("richTextToBlocks", () => {
	it("returns an empty list for empty / nullish input", () => {
		expect(richTextToBlocks("")).toEqual([]);
		expect(richTextToBlocks(null)).toEqual([]);
		expect(richTextToBlocks(undefined)).toEqual([]);
	});

	it("normalises TipTap JSON via the letter-body block shape", () => {
		const json = doc([
			{ type: "paragraph", content: [{ type: "text", text: "Hello", marks: [{ type: "bold" }] }] }
		]);
		expect(richTextToBlocks(json)).toEqual([
			{ kind: "paragraph", runs: [{ text: "Hello", bold: true }] }
		]);
	});

	it("falls back to one paragraph per line for legacy plain text", () => {
		expect(richTextToBlocks("Line one\nLine two")).toEqual([
			{ kind: "paragraph", runs: [{ text: "Line one" }] },
			{ kind: "paragraph", runs: [{ text: "Line two" }] }
		]);
	});

	it("keeps blank lines as empty paragraphs", () => {
		expect(richTextToBlocks("A\n\nB")).toEqual([
			{ kind: "paragraph", runs: [{ text: "A" }] },
			{ kind: "paragraph", runs: [] },
			{ kind: "paragraph", runs: [{ text: "B" }] }
		]);
	});

	it("treats a `{`-leading non-ProseMirror string as plain text", () => {
		expect(richTextToBlocks("{not really json")).toEqual([
			{ kind: "paragraph", runs: [{ text: "{not really json" }] }
		]);
	});
});
