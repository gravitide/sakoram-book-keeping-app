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

	it("drops unknown node types instead of throwing", () => {
		const json = doc([
			{ type: "horizontalRule" },
			{ type: "paragraph", content: [{ type: "text", text: "kept" }] }
		]);
		expect(letterBodyToBlocks(json)).toEqual([
			{ kind: "paragraph", runs: [{ text: "kept" }] }
		]);
	});
});
