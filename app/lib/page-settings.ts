// The one place a PDF's page is decided.
//
// Every PDF payload builder (quote, invoice, bill, voucher, payslip,
// statement, report, letter, and the Settings sample preview) puts the result
// of `buildPageSettings` on its payload as `page`, and every Typst template
// hands `data.page` to the shared `page-setup` helper in common.typ. No builder
// and no template decides paper, margins or letterhead on its own.
//
// The page comes from the business's page design (company_settings.pdf_design,
// app/lib/page-design.ts): its safe area becomes the page margins, and its
// canvas items become `items`, drawn behind the content by common.typ's
// design-items. Here they are flattened for Typst: text fields filled,
// Accent turned into the business's PDF colour, and anything that prints
// nothing (empty image slots, guide-only images, the company-logo spot of a
// business with no logo, text whose fields are all empty) left out. Image files are staged by Rust (pdf.rs stage_page_items).
//
// The Layout (`buildLayoutAndPage`) is now only the Document style — the
// generated title block — and no longer depends on the design.
//
// Pure, store-free, relative imports only: vitest and the render-check script
// (scripts/verify-pdf-render.ts) both import it.

import type { DesignItem, ImageExt, MarginsMm, PageDesign, PageNumberFormat, PagesRule, TextAlign } from "./page-design";
import type { DesignLine } from "./page-design-text";
import type { PaperSize } from "./paper-sizes";
import type { PdfLayoutKey } from "./pdf-layouts";
import type { CompanySettingsRow } from "~/stores/settings";
import { DEFAULT_DESIGN_TEMPLATE, designTemplate } from "./design-templates";
import { parsePageDesign, scaleDesign } from "./page-design";
import { resolveDesignLines } from "./page-design-text";
import { resolvePaperSize } from "./paper-sizes";
import { resolveLayoutKey } from "./pdf-layouts";
import { tokenValuesFromSettings } from "./pdf-tokens";
import { pdfThemeHex } from "./theme";

export type { PaperSize, PaperSizeOption } from "./paper-sizes";
export { PAPER_SIZES, resolvePaperSize } from "./paper-sizes";

interface ItemBase { id: string, x: number, y: number, pages: PagesRule }
interface TextLook { font: string, size: number, bold: boolean, italic: boolean, color: string, align: TextAlign }

/** One design item as Typst reads it (common.typ design-items). */
export type PageItemPayload
	= | (ItemBase & { type: "image", w: number, h: number, src: "item", ext: ImageExt })
		| (ItemBase & { type: "image", w: number, h: number, src: "company_logo" })
		| (ItemBase & TextLook & { type: "text", w: number, lines: DesignLine[] })
		| (ItemBase & TextLook & { type: "page_number", w: number, format: PageNumberFormat, hide_single: boolean })
		| (ItemBase & { type: "line", length: number, vertical: boolean, thickness: number, color: string });

export interface PageSettings {
	paper: PaperSize
	/** The design's safe area: the page margins, in mm. */
	margins: MarginsMm
	/** What the design prints, behind the content. */
	items: PageItemPayload[]
}

/** Per-document override of the business's page design. */
export interface PageSettingsOverride {
	/** A letter on pre-printed paper: print none of the design, keep its safe area. */
	omitItems?: boolean
	/** The page designer: keep the text lines whose fields are all empty, faded, instead of leaving them out. */
	showEmptyFields?: boolean
}

type Settings = Partial<CompanySettingsRow> | null;

/** Deterministic ids for the never-chosen default, so its renders hash alike. */
function defaultIds(): () => string {
	let n = 0;
	return () => `default${String(++n).padStart(3, "0")}`;
}

/**
 * The business's design on its current paper: the stored one (scaled when the
 * paper changed since), or the Classic template when there is none or it
 * can't be read.
 */
export function effectiveDesign(settings: Settings): PageDesign {
	const paper = resolvePaperSize(settings?.pdf_paper_size).key;
	const stored = parsePageDesign(settings?.pdf_design);
	return stored ? scaleDesign(stored, paper) : designTemplate(DEFAULT_DESIGN_TEMPLATE, paper, defaultIds()).design;
}

function payloadFor(item: DesignItem, values: Record<string, string>, accent: string, hasLogo: boolean, keepEmpty: boolean): PageItemPayload | null {
	const colour = (c: string) => (c === "accent" ? accent : c);
	const { id, x, y, pages } = item;
	switch (item.type) {
		case "image":
			if (item.guide || !item.src) return null;
			if (item.src.kind === "company_logo" && !hasLogo) return null;
			return item.src.kind === "company_logo"
				? { type: "image", id, x, y, w: item.w, h: item.h, pages, src: "company_logo" }
				: { type: "image", id, x, y, w: item.w, h: item.h, pages, src: "item", ext: item.src.ext };
		case "text": {
			const lines = resolveDesignLines(item.text, values, { keepEmpty });
			if (lines.length === 0) return null;
			return { type: "text", id, x, y, w: item.w, pages, lines, ...item.style, color: colour(item.style.color) };
		}
		case "page_number":
			return { type: "page_number", id, x, y, w: item.w, pages, format: item.format, hide_single: item.hide_single, ...item.style, color: colour(item.style.color) };
		default:
			return { type: "line", id, x, y, length: item.length, vertical: item.vertical, thickness: item.thickness, color: colour(item.color), pages };
	}
}

export function buildPageSettings(settings: Settings, override?: PageSettingsOverride): PageSettings {
	const design = effectiveDesign(settings);
	const values = tokenValuesFromSettings(settings as CompanySettingsRow | null);
	const accent = pdfThemeHex(settings);
	const hasLogo = Boolean(settings?.logo_path);
	const items = override?.omitItems
		? []
		: design.items.map((item) => payloadFor(item, values, accent, hasLogo, Boolean(override?.showEmptyFields))).filter((i): i is PageItemPayload => i !== null);
	return { paper: design.paper, margins: { ...design.margins }, items };
}

/** The Document style (title block) and the page. `layout` lets the sample preview try a style before it's saved. */
export function buildLayoutAndPage(
	settings: Settings,
	override?: PageSettingsOverride,
	layout: string | null | undefined = settings?.pdf_layout
): { layout: PdfLayoutKey, page: PageSettings } {
	return { layout: resolveLayoutKey(layout), page: buildPageSettings(settings, override) };
}
