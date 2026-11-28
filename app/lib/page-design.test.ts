import type { DesignItem, PageDesign } from "./page-design";
import { describe, expect, it } from "vitest";
import { formatMm, imageFileIds, ITEM_ID_PATTERN, itemOnPage, newItemId, parsePageDesign, sameMargins, scaleDesign, withLogoSlots, withMargins } from "./page-design";
import { PAPER_SIZES, resolvePaperSize } from "./paper-sizes";

const STYLE = { font: "Akt", size: 10, bold: false, italic: false, color: "#111827", align: "left" } as const;

const A4_DESIGN: PageDesign = {
	version: 1,
	paper: "a4",
	margins: { top: 48, right: 18, bottom: 26, left: 18 },
	items: [
		{ type: "image", id: "logo00000001", x: 168, y: 12, w: 24, h: 24, pages: "every", src: { kind: "company_logo" }, guide: false },
		{ type: "image", id: "bgimage00001", x: 0, y: 0, w: 210, h: 297, pages: "first", src: { kind: "file", ext: "png" }, guide: false },
		{ type: "text", id: "name00000001", x: 18, y: 13, w: 140, pages: "every", text: "{business_name}", style: STYLE },
		{ type: "page_number", id: "pageno000001", x: 142, y: 289, w: 50, pages: "every", format: "page_of_total", hide_single: true, style: STYLE },
		{ type: "line", id: "rule00000001", x: 18, y: 40, length: 174, vertical: false, thickness: 2, color: "accent", pages: "not_first" },
		{ type: "line", id: "vrule0000001", x: 200, y: 50, length: 100, vertical: true, thickness: 1, color: "#e5e7eb", pages: "every" }
	]
};

describe("parsePageDesign", () => {
	it.each([null, undefined, "", "not json", "{}", JSON.stringify({ ...A4_DESIGN, version: 2 })])("is null for %j", (stored) => {
		expect(parsePageDesign(stored)).toBeNull();
	});

	it("round-trips a valid design", () => {
		expect(parsePageDesign(JSON.stringify(A4_DESIGN))).toEqual(A4_DESIGN);
	});

	it("drops only the invalid items", () => {
		const bad = { ...A4_DESIGN.items[2]!, id: "badwidth0001", w: -5 };
		const stored = JSON.stringify({ ...A4_DESIGN, items: [A4_DESIGN.items[0], bad] });
		expect(parsePageDesign(stored)!.items).toEqual([A4_DESIGN.items[0]]);
	});

	it("rejects an item id that could reach outside the stationery folder", () => {
		const evil = { ...A4_DESIGN.items[1]!, id: "../../x" };
		const stored = JSON.stringify({ ...A4_DESIGN, items: [evil] });
		expect(parsePageDesign(stored)!.items).toEqual([]);
	});

	it("reads an unknown paper as A4", () => {
		expect(parsePageDesign(JSON.stringify({ ...A4_DESIGN, paper: "b5" }))!.paper).toBe("a4");
	});
});

describe("newItemId", () => {
	it("makes distinct ids that pass the id check", () => {
		const ids = Array.from({ length: 1000 }, () => newItemId());
		for (const id of ids) expect(id).toMatch(ITEM_ID_PATTERN);
		expect(new Set(ids).size).toBe(1000);
	});
});

describe("scaleDesign", () => {
	it("scales positions by each axis and sizes by the smaller ratio", () => {
		const a5 = scaleDesign(A4_DESIGN, "a5");
		const sx = 148 / 210;
		const sy = 210 / 297;
		const s = Math.min(sx, sy);
		expect(a5.paper).toBe("a5");
		expect(a5.margins.top).toBeCloseTo(48 * sy);
		expect(a5.margins.bottom).toBeCloseTo(26 * sy);
		expect(a5.margins.left).toBeCloseTo(18 * sx);
		expect(a5.margins.right).toBeCloseTo(18 * sx);
		const logo = a5.items[0] as Extract<DesignItem, { type: "image" }>;
		expect(logo.x).toBeCloseTo(168 * sx);
		expect(logo.y).toBeCloseTo(12 * sy);
		expect(logo.w).toBeCloseTo(24 * s);
		expect(logo.h).toBeCloseTo(24 * s);
		const text = a5.items[2] as Extract<DesignItem, { type: "text" }>;
		expect(text.w).toBeCloseTo(140 * s);
		expect(text.style.size).toBeCloseTo(10 * s);
		const rule = a5.items[4] as Extract<DesignItem, { type: "line" }>;
		expect(rule.length).toBeCloseTo(174 * sx);
		const vrule = a5.items[5] as Extract<DesignItem, { type: "line" }>;
		expect(vrule.length).toBeCloseTo(100 * sy);
	});

	it("leaves a design on its own paper unchanged", () => {
		expect(scaleDesign(A4_DESIGN, "a4")).toEqual(A4_DESIGN);
	});

	it.each(PAPER_SIZES.map((p) => p.key))("keeps every image on the %s page", (paper) => {
		const { widthMm, heightMm } = resolvePaperSize(paper);
		for (const item of scaleDesign(A4_DESIGN, paper).items) {
			if (item.type !== "image") continue;
			expect(item.x + item.w).toBeLessThanOrEqual(widthMm + 0.01);
			expect(item.y + item.h).toBeLessThanOrEqual(heightMm + 0.01);
		}
	});
});

describe("itemOnPage", () => {
	it("follows the pages rule", () => {
		expect([itemOnPage("every", 1), itemOnPage("every", 2)]).toEqual([true, true]);
		expect([itemOnPage("first", 1), itemOnPage("first", 2)]).toEqual([true, false]);
		expect([itemOnPage("not_first", 1), itemOnPage("not_first", 2)]).toEqual([false, true]);
	});
});

describe("formatMm", () => {
	it("rounds to a tenth and drops a trailing .0", () => {
		expect(formatMm(18)).toBe("18");
		expect(formatMm(20.26)).toBe("20.3");
		expect(formatMm(60.452)).toBe("60.5");
	});
});

describe("withLogoSlots", () => {
	it("turns the company-logo spot into a copied file of that format", () => {
		const d = withLogoSlots(A4_DESIGN, "png");
		expect(d.items[0]).toMatchObject({ id: "logo00000001", src: { kind: "file", ext: "png" } });
		expect(d.items.slice(1)).toEqual(A4_DESIGN.items.slice(1));
	});

	it("leaves an empty slot when the business has no logo", () => {
		expect(withLogoSlots(A4_DESIGN, null).items[0]).toMatchObject({ id: "logo00000001", src: null });
	});
});

describe("imageFileIds", () => {
	it("lists the items whose image is a file in the business folder", () => {
		expect(imageFileIds(A4_DESIGN)).toEqual(["bgimage00001"]);
		expect(imageFileIds(withLogoSlots(A4_DESIGN, "svg"))).toEqual(["logo00000001", "bgimage00001"]);
	});

	it("is empty without a design", () => {
		expect(imageFileIds(null)).toEqual([]);
	});
});

describe("withMargins", () => {
	it("stores a safe area edited on another sheet back in the design's own coordinates, items untouched", () => {
		const onA5 = scaleDesign(A4_DESIGN, "a5").margins;
		const saved = withMargins(A4_DESIGN, { ...onA5, top: onA5.top + 10 }, "a5");
		expect(saved.paper).toBe("a4");
		expect(saved.items).toEqual(A4_DESIGN.items);
		expect(saved.margins.top).toBeCloseTo(48 + 10 * (297 / 210));
		expect(saved.margins.left).toBeCloseTo(18);
		expect(saved.margins.bottom).toBeCloseTo(26);
	});

	it("survives any number of paper switches without the design drifting", () => {
		let design = A4_DESIGN;
		for (const paper of ["us-letter", "a4", "a5", "us-legal", "a4"] as const) {
			design = withMargins(design, scaleDesign(design, paper).margins, paper);
		}
		expect(design.items).toEqual(A4_DESIGN.items);
		expect(sameMargins(design.margins, A4_DESIGN.margins)).toBe(true);
	});
});

describe("sameMargins", () => {
	it("ignores float noise below a hundredth of a millimetre", () => {
		expect(sameMargins({ top: 48, right: 18, bottom: 26, left: 18 }, { top: 48.000000001, right: 18, bottom: 26, left: 17.9999999 })).toBe(true);
		expect(sameMargins({ top: 48, right: 18, bottom: 26, left: 18 }, { top: 48.5, right: 18, bottom: 26, left: 18 })).toBe(false);
	});
});

describe("scaleDesign keeps page-covering images covering the page", () => {
	it("stretches a full-page background or slot to the new sheet", () => {
		const a4: PageDesign = {
			version: 1,
			paper: "a4",
			margins: { top: 20, right: 18, bottom: 20, left: 18 },
			items: [{ type: "image", id: "slot00000001", x: 0, y: 0, w: 210, h: 297, pages: "every", src: null, guide: true }]
		};
		for (const to of ["us-letter", "a5", "us-legal"] as const) {
			const page = resolvePaperSize(to);
			expect(scaleDesign(a4, to).items[0]).toMatchObject({ x: 0, y: 0, w: page.widthMm, h: page.heightMm });
		}
	});
});

describe("parsePageDesign keeps the lock", () => {
	it("reads an item's locked flag, and an item without one", () => {
		const stored = JSON.stringify({
			version: 1,
			paper: "a4",
			margins: { top: 20, right: 18, bottom: 20, left: 18 },
			items: [
				{ type: "image", id: "bg0000000001", x: 0, y: 0, w: 210, h: 297, pages: "every", src: { kind: "file", ext: "png" }, guide: false, locked: true },
				{ type: "line", id: "rule00000001", x: 18, y: 40, length: 174, vertical: false, thickness: 1, color: "accent", pages: "every" }
			]
		});
		const d = parsePageDesign(stored)!;
		expect(d.items[0]).toMatchObject({ locked: true });
		expect(d.items[1]!.locked).toBeUndefined();
	});
});
