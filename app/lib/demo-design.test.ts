import { describe, expect, it } from "vitest";
import { DEMO_LETTERHEAD_ACCENT, DEMO_LETTERHEAD_MARGINS, demoDesign } from "./demo-design";
import { parsePageDesign } from "./page-design";

describe("demoDesign", () => {
	const { design, artworkId } = demoDesign();

	it("puts the sample letterhead behind every page of an A4 design", () => {
		const artwork = design.items.find((i) => i.id === artworkId);
		expect(artwork).toMatchObject({ type: "image", x: 0, y: 0, w: 210, h: 297, pages: "every", src: { kind: "file", ext: "svg" }, guide: false });
		expect(design.paper).toBe("a4");
	});

	it("keeps the content clear of the letterhead's bands, and numbers the pages", () => {
		expect(design.margins).toEqual(DEMO_LETTERHEAD_MARGINS);
		expect(design.items.some((i) => i.type === "page_number")).toBe(true);
	});

	it("is a valid stored design", () => {
		expect(parsePageDesign(JSON.stringify(design))).toEqual(design);
	});

	it("uses the letterhead's green as the accent", () => {
		expect(DEMO_LETTERHEAD_ACCENT).toBe("#1f5446");
	});
});
