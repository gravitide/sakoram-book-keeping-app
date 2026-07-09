import { describe, expect, it } from "vitest";
import { letterBodyToBlocks } from "./letter-body";

const doc = (content: unknown[]) => JSON.stringify({ type: "doc", content });

describe("letterBodyToBlocks", () => {
	it("returns an empty list for empty / malformed input", () => {
		expect(letterBodyToBlocks("")).toEqual([]);
		expect(letterBodyToBlocks("not json")).toEqual([]);
		expect(letterBodyToBlocks(JSON.stringify({ type: "doc" }))).toEqual([]);
	});

	it("maps a paragraph with bold + italic + underline runs", () => {
		const json = doc([
			{
				type: "paragraph",
				content: [
					{ type: "text", text: "Hello " },
					{ type: "text", text: "bold", marks: [{ type: "bold" }] },
					{ type: "text", text: " and ", marks: [] },
					{ type: "text", text: "ui", marks: [{ type: "italic" }, { type: "underline" }] }
				]
			}
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{
				kind: "paragraph",
				runs: [
					{ text: "Hello " },
					{ text: "bold", bold: true },
					{ text: " and " },
					{ text: "ui", italic: true, underline: true }
				]
			}
		]);
	});

	it("maps an empty paragraph to a paragraph with no runs", () => {
		expect(letterBodyToBlocks(doc([{ type: "paragraph" }]))).toEqual([
			{ kind: "paragraph", runs: [] }
		]);
	});

	it("maps a heading with its level", () => {
		const json = doc([
			{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "heading", level: 2, runs: [{ text: "Title" }] }
		]);
	});

	it("maps bullet + ordered lists into item block arrays", () => {
		const listItem = (t: string) => ({
			type: "listItem",
			content: [{ type: "paragraph", content: [{ type: "text", text: t }] }]
		});
		const json = doc([
			{ type: "bulletList", content: [listItem("a"), listItem("b")] },
			{ type: "orderedList", content: [listItem("one")] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{
				kind: "bullet_list",
				items: [
					[{ kind: "paragraph", runs: [{ text: "a" }] }],
					[{ kind: "paragraph", runs: [{ text: "b" }] }]
				]
			},
			{
				kind: "ordered_list",
				items: [[{ kind: "paragraph", runs: [{ text: "one" }] }]]
			}
		]);
	});

	it("carries non-default paragraph + heading alignment, omits left/none", () => {
		const json = doc([
			{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "c" }] },
			{ type: "heading", attrs: { level: 2, textAlign: "right" }, content: [{ type: "text", text: "h" }] },
			{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "l" }] },
			{ type: "paragraph", content: [{ type: "text", text: "n" }] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "paragraph", runs: [{ text: "c" }], align: "center" },
			{ kind: "heading", level: 2, runs: [{ text: "h" }], align: "right" },
			{ kind: "paragraph", runs: [{ text: "l" }] },
			{ kind: "paragraph", runs: [{ text: "n" }] }
		]);
	});

	it("captures colour + converts font size (px → pt) from the textStyle mark", () => {
		const json = doc([
			{
				type: "paragraph",
				content: [
					{ type: "text", text: "big red", marks: [{ type: "textStyle", attrs: { color: "#dc2626", fontSize: "24px" } }] },
					{ type: "text", text: " bold blue", marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "#2563eb" } }] }
				]
			}
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{
				kind: "paragraph",
				runs: [
					{ text: "big red", color: "#dc2626", fontSizePt: 18 },
					{ text: " bold blue", bold: true, color: "#2563eb" }
				]
			}
		]);
	});

	it("drops unknown node types instead of throwing", () => {
		const json = doc([
			{ type: "horizontalRule" },
			{ type: "paragraph", content: [{ type: "text", text: "kept" }] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "paragraph", runs: [{ text: "kept" }] }
		]);
	});

	it("converts an rgb() colour to hex (browsers normalise inline colour to rgb)", () => {
		const json = doc([
			{ type: "paragraph", content: [{ type: "text", text: "grey", marks: [{ type: "textStyle", attrs: { color: "rgb(107, 114, 128)" } }] }] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "paragraph", runs: [{ text: "grey", color: "#6b7280" }] }
		]);
	});

	it("passes hex colour through and drops a named colour", () => {
		const json = doc([
			{ type: "paragraph", content: [
				{ type: "text", text: "hex", marks: [{ type: "textStyle", attrs: { color: "#6b7280" } }] },
				{ type: "text", text: "named", marks: [{ type: "textStyle", attrs: { color: "gray" } }] }
			] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "paragraph", runs: [
				{ text: "hex", color: "#6b7280" },
				{ text: "named" }
			] }
		]);
	});

	it("renders a code block as one paragraph per line instead of dropping it", () => {
		const json = doc([
			{ type: "codeBlock", content: [{ type: "text", text: "line one\nline two" }] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "paragraph", runs: [{ text: "line one" }] },
			{ kind: "paragraph", runs: [{ text: "line two" }] }
		]);
	});

	it("flattens a blockquote's inner blocks instead of dropping them", () => {
		const json = doc([
			{ type: "blockquote", content: [
				{ type: "paragraph", content: [{ type: "text", text: "quoted" }] }
			] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "paragraph", runs: [{ text: "quoted" }] }
		]);
	});

	it("maps a table with a header row + a colspan cell", () => {
		const cell = (t: string, header = false) => ({
			type: header ? "tableHeader" : "tableCell",
			content: [{ type: "paragraph", content: [{ type: "text", text: t }] }]
		});
		const json = doc([
			{ type: "table", content: [
				{ type: "tableRow", content: [cell("Phase", true), cell("Amount", true)] },
				{ type: "tableRow", content: [cell("1"), cell("Rs 100")] },
				{ type: "tableRow", content: [
					{ type: "tableHeader", attrs: { colspan: 2, rowspan: 1 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Total Rs 100" }] }] }
				] }
			] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "table", rows: [
				[
					{ blocks: [{ kind: "paragraph", runs: [{ text: "Phase" }] }], header: true },
					{ blocks: [{ kind: "paragraph", runs: [{ text: "Amount" }] }], header: true }
				],
				[
					{ blocks: [{ kind: "paragraph", runs: [{ text: "1" }] }] },
					{ blocks: [{ kind: "paragraph", runs: [{ text: "Rs 100" }] }] }
				],
				[
					{ blocks: [{ kind: "paragraph", runs: [{ text: "Total Rs 100" }] }], header: true, colspan: 2 }
				]
			] }
		]);
	});

	it("preserves a hard break inside a paragraph as a break run", () => {
		const json = doc([
			{ type: "paragraph", content: [
				{ type: "text", text: "first" },
				{ type: "hardBreak" },
				{ type: "text", text: "second" }
			] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "paragraph", runs: [
				{ text: "first" },
				{ text: "", line_break: true },
				{ text: "second" }
			] }
		]);
	});
});
