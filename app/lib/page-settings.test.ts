import type { PageDesign } from "./page-design";
import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { designTemplate } from "./design-templates";
import { scaleDesign } from "./page-design";
import { buildLayoutAndPage, buildPageSettings, effectiveDesign, PAPER_SIZES } from "./page-settings";
import { pdfThemeHex } from "./theme";

const STYLE = { font: "Inter", size: 9, bold: true, italic: false, color: "accent", align: "right" } as const;

const STORED: PageDesign = {
	version: 1,
	paper: "a4",
	margins: { top: 50, right: 18, bottom: 30, left: 18 },
	items: [
		{ type: "image", id: "logo00000001", x: 168, y: 12, w: 24, h: 24, pages: "every", src: { kind: "company_logo" }, guide: false },
		{ type: "image", id: "artwork00001", x: 0, y: 0, w: 210, h: 297, pages: "first", src: { kind: "file", ext: "svg" }, guide: false },
		{ type: "image", id: "emptyslot001", x: 0, y: 0, w: 50, h: 50, pages: "every", src: null, guide: false },
		{ type: "image", id: "guidescan001", x: 0, y: 0, w: 210, h: 297, pages: "every", src: { kind: "file", ext: "png" }, guide: true },
		{ type: "text", id: "name00000001", x: 18, y: 13, w: 140, pages: "every", text: "{business_name}\n{website}", style: STYLE },
		{ type: "text", id: "emptytext001", x: 18, y: 30, w: 140, pages: "every", text: "{phone}", style: STYLE },
		{ type: "page_number", id: "pageno000001", x: 142, y: 289, w: 50, pages: "every", format: "slash", hide_single: false, style: { ...STYLE, color: "#6b7280" } },
		{ type: "line", id: "rule00000001", x: 18, y: 40, length: 174, vertical: false, thickness: 2, color: "accent", pages: "not_first" }
	]
};

const settings = (over: Partial<CompanySettingsRow> = {}) => ({
	business_name: "Gravitide",
	website: "",
	phone: "",
	pdf_paper_size: "a4",
	pdf_theme_color: "blue",
	logo_path: "D:/Biz/logos/logo.png",
	pdf_design: JSON.stringify(STORED),
	...over
}) as Partial<CompanySettingsRow>;

const withoutIds = (d: PageDesign) => ({ ...d, items: d.items.map(({ id: _id, ...rest }) => rest) });

describe("effectiveDesign", () => {
	it("is the Classic template on the business's paper when none was chosen", () => {
		const d = effectiveDesign(settings({ pdf_design: null, pdf_paper_size: "a5" }));
		expect(withoutIds(d)).toEqual(withoutIds(designTemplate("classic", "a5").design));
	});

	it("gives the untouched default the same ids on every render", () => {
		const s = settings({ pdf_design: null });
		expect(effectiveDesign(s)).toEqual(effectiveDesign(s));
	});

	it("is Classic when the stored design can't be read", () => {
		const d = effectiveDesign(settings({ pdf_design: "{broken" }));
		expect(withoutIds(d)).toEqual(withoutIds(designTemplate("classic", "a4").design));
	});

	it("moves a stored design onto the business's current paper", () => {
		expect(effectiveDesign(settings({ pdf_paper_size: "us-letter" }))).toEqual(scaleDesign(STORED, "us-letter"));
	});
});

describe("buildPageSettings", () => {
	const page = buildPageSettings(settings());

	it("carries exactly the paper, the safe area and the printable items", () => {
		expect(Object.keys(page).sort()).toEqual(["items", "margins", "paper"]);
		expect(page.paper).toBe("a4");
		expect(page.margins).toEqual(STORED.margins);
	});

	it("leaves out empty image slots, guide-only images and text with nothing to print", () => {
		expect(page.items.map((i) => i.id)).toEqual(["logo00000001", "artwork00001", "name00000001", "pageno000001", "rule00000001"]);
	});

	it("names where each image comes from", () => {
		expect(page.items[0]).toEqual({ type: "image", id: "logo00000001", x: 168, y: 12, w: 24, h: 24, pages: "every", src: "company_logo" });
		expect(page.items[1]).toEqual({ type: "image", id: "artwork00001", x: 0, y: 0, w: 210, h: 297, pages: "first", src: "item", ext: "svg" });
	});

	it("fills text fields and resolves Accent to the business's PDF colour", () => {
		const accent = pdfThemeHex(settings());
		expect(page.items[2]).toEqual({
			type: "text",
			id: "name00000001",
			x: 18,
			y: 13,
			w: 140,
			pages: "every",
			lines: [{ text: "Gravitide", faded: false }],
			font: "Inter",
			size: 9,
			bold: true,
			italic: false,
			color: accent,
			align: "right"
		});
		expect(page.items[3]).toMatchObject({ type: "page_number", format: "slash", hide_single: false, color: "#6b7280" });
		expect(page.items[4]).toEqual({ type: "line", id: "rule00000001", x: 18, y: 40, length: 174, vertical: false, thickness: 2, color: accent, pages: "not_first" });
	});

	it("prints no design items on pre-printed paper but keeps the safe area", () => {
		const preprinted = buildPageSettings(settings(), { omitItems: true });
		expect(preprinted).toEqual({ paper: "a4", margins: STORED.margins, items: [] });
	});

	it("works without settings at all", () => {
		const bare = buildPageSettings(null);
		expect(bare.paper).toBe("a4");
		expect(bare.items.some((i) => i.type === "image")).toBe(false);
	});
});

describe("buildLayoutAndPage", () => {
	it("keeps the stored Document style whatever the design", () => {
		for (const pdf_layout of ["classic", "modern", "minimal", "compact"]) {
			expect(buildLayoutAndPage(settings({ pdf_layout })).layout).toBe(pdf_layout);
		}
	});

	it("lets the caller pick the style (the sample preview)", () => {
		expect(buildLayoutAndPage(settings({ pdf_layout: "classic" }), undefined, "minimal").layout).toBe("minimal");
	});

	it("falls back to Classic for an unknown style", () => {
		expect(buildLayoutAndPage(settings({ pdf_layout: "letterhead" })).layout).toBe("classic");
	});
});

describe("paper sizes", () => {
	it("lists the four sheets, A4 first", () => {
		expect(PAPER_SIZES.map((p) => p.key)).toEqual(["a4", "a5", "us-letter", "us-legal"]);
	});
});

describe("buildPageSettings showEmptyFields (the designer)", () => {
	const onlyWebsite: PageDesign = {
		version: 1,
		paper: "a4",
		margins: { top: 50, right: 18, bottom: 30, left: 18 },
		items: [{ type: "text", id: "website00001", x: 18, y: 13, w: 140, pages: "every", text: "{website}", style: STYLE }]
	};
	const s = settings({ pdf_design: JSON.stringify(onlyWebsite) });

	it("leaves a text box whose fields are all empty out of PDFs", () => {
		expect(buildPageSettings(s).items).toEqual([]);
	});

	it("keeps it, faded with the field's label, in the designer", () => {
		const items = buildPageSettings(s, { showEmptyFields: true }).items;
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ type: "text", lines: [{ text: "Website", faded: true }] });
	});
});

describe("buildPageSettings showGuides (the designer)", () => {
	it("never prints a guide image in documents", () => {
		expect(buildPageSettings(settings()).items.some((i) => i.id === "guidescan001")).toBe(false);
	});

	it("draws it in the designer, but still no empty slot", () => {
		const items = buildPageSettings(settings(), { showGuides: true }).items;
		expect(items).toContainEqual(expect.objectContaining({ type: "image", id: "guidescan001", src: "item", ext: "png" }));
		expect(items.some((i) => i.id === "emptyslot001")).toBe(false);
	});
});
