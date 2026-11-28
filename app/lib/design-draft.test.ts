import type { DesignItem, PageDesign } from "./page-design";
import { describe, expect, it } from "vitest";
import { addBackground, addImage, addLine, addPageNumber, addText, deleteItem, duplicateItem, fileCopyForDuplicate, filesToRemove, fillSlot, hasPageNumber, NEW_TEXT, reorderItem, replaceImage, setImageGuide, setItemPages, setLineVertical, setMargins, updateItem } from "./design-draft";

const blank: PageDesign = { version: 1, paper: "a4", margins: { top: 20, right: 18, bottom: 20, left: 18 }, items: [] };

const img = (id: string, ext: "png" | "svg" = "png"): DesignItem =>
	({ type: "image", id, x: 10, y: 10, w: 40, h: 20, pages: "first", src: { kind: "file", ext }, guide: false });
const rule: DesignItem = { type: "line", id: "rule00000001", x: 18, y: 40, length: 174, vertical: false, thickness: 2, color: "accent", pages: "every" };
const withItems = (...items: DesignItem[]): PageDesign => ({ ...blank, items });

describe("addImage", () => {
	it("places a new image 60 mm wide, centred across the safe area 10 mm below its top (off the guide), on top of everything", () => {
		const d = addImage(withItems(rule), "newimage0001", "svg", 2);
		expect(d.items).toHaveLength(2);
		expect(d.items[1]).toEqual({ type: "image", id: "newimage0001", x: 75, y: 30, w: 60, h: 30, pages: "every", src: { kind: "file", ext: "svg" }, guide: false });
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

describe("review fixes", () => {
	it("a duplicated image needs its own copy of the file", () => {
		expect(fileCopyForDuplicate(img("aaaaaa000001", "svg"), "cccccc000001")).toEqual({ fromId: "aaaaaa000001", toId: "cccccc000001", ext: "svg" });
		expect(fileCopyForDuplicate(rule, "cccccc000001")).toBeNull();
	});

	it("a duplicate near the page edge stays on the page", () => {
		const edge = { ...img("aaaaaa000001"), x: 170, y: 277 } as DesignItem;
		const d = duplicateItem(withItems(edge), "aaaaaa000001", "cccccc000001");
		expect(d.items[1]).toMatchObject({ x: 170, y: 277 });
	});
});

describe("addBackground", () => {
	it("covers the whole page, behind everything else", () => {
		const d = addBackground(withItems(rule), "bgimage00001", "png");
		expect(d.items[0]).toEqual({ type: "image", id: "bgimage00001", x: 0, y: 0, w: 210, h: 297, pages: "every", src: { kind: "file", ext: "png" }, guide: false });
		expect(d.items[1]).toEqual(rule);
	});

	it("follows the design's paper", () => {
		expect(addBackground({ ...blank, paper: "a5" }, "bgimage00001", "svg").items[0]).toMatchObject({ w: 148, h: 210 });
	});
});

describe("adding text, a page number and lines", () => {
	const page: PageDesign = { ...blank, margins: { top: 40, right: 18, bottom: 25, left: 18 } };

	it("adds a text box 10 mm inside the safe area's top-left (off the guides), 80 mm wide, in the given font", () => {
		const d = addText(page, "newtext00001", "Inter");
		expect(d.items).toHaveLength(1);
		expect(d.items[0]).toMatchObject({ type: "text", id: "newtext00001", x: 28, y: 50, w: 80, pages: "every", text: NEW_TEXT, style: { font: "Inter", size: 10, bold: false, italic: false, align: "left" } });
		expect(NEW_TEXT).toBe("New text");
	});

	it("cascades a second new item 5 mm down and right instead of stacking it", () => {
		const d = addText(addText(page, "newtext00001", "Akt"), "newtext00002", "Akt");
		expect(d.items[1]).toMatchObject({ x: 33, y: 55 });
	});

	it("adds a page number at the bottom right, below the safe area", () => {
		const d = addPageNumber(page, "pagenum00001", "Akt");
		expect(d.items[0]).toMatchObject({ type: "page_number", x: 152, y: 288, w: 40, format: "page_of_total", hide_single: true });
	});

	it("never adds a second page number", () => {
		const once = addPageNumber(page, "pagenum00001", "Akt");
		expect(hasPageNumber(page)).toBe(false);
		expect(hasPageNumber(once)).toBe(true);
		expect(addPageNumber(once, "pagenum00002", "Akt")).toBe(once);
	});

	it("adds an accent line across the safe area, 10 mm below its top (off the guide)", () => {
		const d = addLine(page, "newline00001");
		expect(d.items[0]).toEqual({ type: "line", id: "newline00001", x: 18, y: 50, length: 174, vertical: false, thickness: 0.75, color: "accent", pages: "every" });
	});
});

describe("setLineVertical", () => {
	const low: DesignItem = { type: "line", id: "lowline00001", x: 18, y: 280, length: 174, vertical: false, thickness: 1, color: "accent", pages: "every" };

	it("keeps a line turned vertical near the bottom on the page, from the same start", () => {
		const d = setLineVertical(withItems(low), "lowline00001", true);
		const line = d.items[0]!;
		expect(line).toMatchObject({ vertical: true, x: 18, y: 280 });
		expect(line.type === "line" && line.length <= 297 - 280).toBe(true);
	});

	it("keeps x and y when turned back", () => {
		const d = setLineVertical(setLineVertical(withItems(rule), "rule00000001", true), "rule00000001", false);
		expect(d.items[0]).toMatchObject({ vertical: false, x: 18, y: 40 });
	});
});

describe("duplicateItem on a page number", () => {
	it("refuses: a design has one page number (Ctrl+D included)", () => {
		const pn: DesignItem = { type: "page_number", id: "pagenum00001", x: 152, y: 288, w: 40, pages: "every", format: "page_of_total", hide_single: true, style: { font: "Akt", size: 7, bold: false, italic: false, color: "#6b7280", align: "right" } };
		const d = withItems(pn);
		expect(duplicateItem(d, "pagenum00001", "pagenum00002")).toBe(d);
	});
});

describe("setItemPages / setImageGuide", () => {
	it("sets an item's pages rule", () => {
		expect(setItemPages(withItems(rule), "rule00000001", "first").items[0]!.pages).toBe("first");
	});

	it("marks an image guide-only, and leaves anything else alone", () => {
		expect(setImageGuide(withItems(img("aaaaaa000001")), "aaaaaa000001", true).items[0]).toMatchObject({ guide: true });
		const d = withItems(rule);
		expect(setImageGuide(d, "rule00000001", true)).toBe(d);
	});
});

describe("fillSlot", () => {
	const slot: DesignItem = { type: "image", id: "slot00000001", x: 0, y: 0, w: 210, h: 297, pages: "every", src: null, guide: true };

	it("fills an empty slot in place, keeping its box, pages rule and guide flag", () => {
		const d = fillSlot(withItems(rule, slot), "slot00000001", "scan00000001", "png");
		expect(d.items[1]).toEqual({ type: "image", id: "scan00000001", x: 0, y: 0, w: 210, h: 297, pages: "every", src: { kind: "file", ext: "png" }, guide: true });
		expect(d.items[0]).toEqual(rule);
	});

	it("leaves an image that already has a file alone", () => {
		const d = withItems(img("aaaaaa000001"));
		expect(fillSlot(d, "aaaaaa000001", "bbbbbb000001", "png")).toBe(d);
	});
});
