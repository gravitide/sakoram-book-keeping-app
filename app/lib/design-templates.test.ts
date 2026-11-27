import type { DesignItem } from "./page-design";
import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN_TEMPLATE, DESIGN_TEMPLATES, designTemplate } from "./design-templates";
import { parsePageDesign } from "./page-design";
import { PAPER_SIZES, resolvePaperSize } from "./paper-sizes";

const KEYS = ["classic", "modern", "minimal", "compact", "background", "preprinted", "blank"] as const;
const LETTERHEADS = ["classic", "modern", "minimal", "compact"] as const;

/** The item's right / bottom edge, in mm. */
function extent(item: DesignItem): { right: number, bottom: number } {
	switch (item.type) {
		case "image":
			return { right: item.x + item.w, bottom: item.y + item.h };
		case "line":
			return item.vertical ? { right: item.x, bottom: item.y + item.length } : { right: item.x + item.length, bottom: item.y };
		default:
			return { right: item.x + item.w, bottom: item.y };
	}
}

describe("the template list", () => {
	it("lists the seven templates in picker order", () => {
		expect(DESIGN_TEMPLATES.map((t) => t.key)).toEqual([...KEYS]);
		expect(DEFAULT_DESIGN_TEMPLATE).toBe("classic");
	});
});

describe.each(KEYS)("designTemplate(%s)", (key) => {
	it.each(PAPER_SIZES.map((p) => p.key))("is a valid design that stays on the %s page", (paper) => {
		const { design } = designTemplate(key, paper);
		expect(parsePageDesign(JSON.stringify(design))).toEqual(design);
		expect(design.paper).toBe(paper);
		const ids = design.items.map((i) => i.id);
		expect(new Set(ids).size).toBe(ids.length);
		const { widthMm, heightMm } = resolvePaperSize(paper);
		for (const item of design.items) {
			const { right, bottom } = extent(item);
			expect(right).toBeLessThanOrEqual(widthMm + 0.01);
			expect(bottom).toBeLessThanOrEqual(heightMm + 0.01);
		}
	});
});

describe.each(LETTERHEADS)("the %s letterhead", (key) => {
	const { design, documentStyle } = designTemplate(key, "a4");

	it("has one company logo, the business name and a page number", () => {
		expect(design.items.filter((i) => i.type === "image" && i.src?.kind === "company_logo")).toHaveLength(1);
		expect(design.items.some((i) => i.type === "text" && i.text.includes("{business_name}"))).toBe(true);
		const numbers = design.items.filter((i) => i.type === "page_number");
		expect(numbers).toHaveLength(1);
		expect(numbers[0]).toMatchObject({ hide_single: true, pages: "every" });
	});

	it("sets its own Document style", () => {
		expect(documentStyle).toBe(key);
	});
});

describe("the non-letterhead templates", () => {
	it("background: one empty page-sized image slot and a page number", () => {
		const { design, documentStyle } = designTemplate("background", "a4");
		const images = design.items.filter((i) => i.type === "image");
		expect(images).toEqual([expect.objectContaining({ x: 0, y: 0, w: 210, h: 297, src: null, guide: false })]);
		expect(design.items.filter((i) => i.type === "page_number")).toHaveLength(1);
		expect(design.margins).toEqual({ top: 40, right: 18, bottom: 25, left: 18 });
		expect(documentStyle).toBeNull();
	});

	it("preprinted: one guide-only image slot, no page number", () => {
		const { design, documentStyle } = designTemplate("preprinted", "a4");
		expect(design.items).toEqual([expect.objectContaining({ type: "image", x: 0, y: 0, w: 210, h: 297, src: null, guide: true })]);
		expect(design.margins).toEqual({ top: 55, right: 18, bottom: 20, left: 18 });
		expect(documentStyle).toBeNull();
	});

	it("blank: no items", () => {
		const { design, documentStyle } = designTemplate("blank", "a4");
		expect(design.items).toEqual([]);
		expect(design.margins).toEqual({ top: 20, right: 18, bottom: 20, left: 18 });
		expect(documentStyle).toBeNull();
	});
});

it("makes fresh item ids every time", () => {
	const a = designTemplate("classic", "a4").design.items.map((i) => i.id);
	const b = designTemplate("classic", "a4").design.items.map((i) => i.id);
	expect(a.some((id, n) => id === b[n])).toBe(false);
});
