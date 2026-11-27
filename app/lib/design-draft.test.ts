import type { DesignItem, PageDesign } from "./page-design";
import { describe, expect, it } from "vitest";
import { addImage, deleteItem, duplicateItem, filesToRemove, reorderItem, replaceImage, setMargins, updateItem } from "./design-draft";

const blank: PageDesign = { version: 1, paper: "a4", margins: { top: 20, right: 18, bottom: 20, left: 18 }, items: [] };

const img = (id: string, ext: "png" | "svg" = "png"): DesignItem =>
	({ type: "image", id, x: 10, y: 10, w: 40, h: 20, pages: "first", src: { kind: "file", ext }, guide: false });
const rule: DesignItem = { type: "line", id: "rule00000001", x: 18, y: 40, length: 174, vertical: false, thickness: 2, color: "accent", pages: "every" };
const withItems = (...items: DesignItem[]): PageDesign => ({ ...blank, items });

describe("addImage", () => {
	it("places a new image 60 mm wide, centred across the safe area at its top, on top of everything", () => {
		const d = addImage(withItems(rule), "newimage0001", "svg", 2);
		expect(d.items).toHaveLength(2);
		expect(d.items[1]).toEqual({ type: "image", id: "newimage0001", x: 75, y: 20, w: 60, h: 30, pages: "every", src: { kind: "file", ext: "svg" }, guide: false });
	});

	it("never makes it wider than the safe area", () => {
		const narrow = { ...blank, margins: { top: 20, right: 80, bottom: 20, left: 80 } };
		expect(addImage(narrow, "newimage0001", "png", 1).items[0]).toMatchObject({ x: 80, w: 50, h: 50 });
	});
});

describe("replaceImage", () => {
	it("keeps the place, width, pages rule and stacking, with the new file's proportions and id", () => {
		const d = replaceImage(withItems(img("aaaaaa000001"), rule), "aaaaaa000001", "bbbbbb000001", "svg", 4);
		expect(d.items[0]).toEqual({ type: "image", id: "bbbbbb000001", x: 10, y: 10, w: 40, h: 10, pages: "first", src: { kind: "file", ext: "svg" }, guide: false });
		expect(d.items[1]).toEqual(rule);
	});
});

describe("duplicateItem", () => {
	it("puts the copy 5 mm right and down, just above the original", () => {
		const d = duplicateItem(withItems(img("aaaaaa000001"), rule), "aaaaaa000001", "cccccc000001");
		expect(d.items.map((i) => i.id)).toEqual(["aaaaaa000001", "cccccc000001", "rule00000001"]);
		expect(d.items[1]).toMatchObject({ x: 15, y: 15, w: 40 });
	});
});

describe("deleteItem / updateItem / setMargins", () => {
	it("edits without touching the original design", () => {
		const before = withItems(img("aaaaaa000001"), rule);
		const frozen = JSON.stringify(before);
		expect(deleteItem(before, "aaaaaa000001").items).toEqual([rule]);
		expect(updateItem(before, { ...rule, length: 100 }).items[1]).toMatchObject({ length: 100 });
		expect(setMargins(before, { top: 1, right: 2, bottom: 3, left: 4 }).margins).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
		expect(JSON.stringify(before)).toBe(frozen);
	});
});

describe("reorderItem", () => {
	const three = withItems(img("aaaaaa000001"), img("bbbbbb000001"), img("cccccc000001"));
	const order = (d: PageDesign) => d.items.map((i) => i.id[0]).join("");

	it("moves one step forward (drawn later) or backward", () => {
		expect(order(reorderItem(three, "aaaaaa000001", "forward"))).toBe("bac");
		expect(order(reorderItem(three, "cccccc000001", "backward"))).toBe("acb");
	});

	it("does nothing at either end", () => {
		expect(order(reorderItem(three, "cccccc000001", "forward"))).toBe("abc");
		expect(order(reorderItem(three, "aaaaaa000001", "backward"))).toBe("abc");
	});
});

describe("filesToRemove", () => {
	const saved = withItems(img("aaaaaa000001"));
	const draft = withItems(img("bbbbbb000001"));

	it("on Save: the files the draft no longer uses, and uploads that were undone", () => {
		expect(filesToRemove({ saved, draft, uploaded: ["bbbbbb000001", "cccccc000001"], outcome: "save" })).toEqual(["aaaaaa000001", "cccccc000001"]);
	});

	it("on Discard: every upload the saved design doesn't use", () => {
		expect(filesToRemove({ saved, draft, uploaded: ["bbbbbb000001", "cccccc000001"], outcome: "discard" })).toEqual(["bbbbbb000001", "cccccc000001"]);
		expect(filesToRemove({ saved, draft, uploaded: [], outcome: "discard" })).toEqual([]);
	});

	it("on the first Save of a never-chosen design: nothing the draft uses", () => {
		expect(filesToRemove({ saved: null, draft, uploaded: ["bbbbbb000001"], outcome: "save" })).toEqual([]);
	});
});
