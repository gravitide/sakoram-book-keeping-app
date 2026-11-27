// The seven starter designs. Picking one replaces the business's design;
// from there it is the user's to move, add to and delete from.
//
// - Classic / Modern / Minimal / Compact rebuild today's four letterheads from
//   canvas items and set the matching Document style (pdf_layout).
// - Full-page background / Pre-printed paper leave an empty image slot (the
//   second one guide-only, never printed) for the user's artwork.
// - Blank is the safe area alone.
//
// Authored at A4 and scaled to the business's paper (scaleDesign). The logo
// spot is `src: { kind: "company_logo" }`; applying a template
// (usePageDesign.applyTemplate) swaps it for a copy of the company logo, or
// an empty slot when there isn't one.
//
// Pure, store-free, relative imports only (vitest).

import type { DesignColor, DesignItem, MarginsMm, PageDesign, TextStyle } from "./page-design";
import type { PaperSize } from "./paper-sizes";
import type { PdfLayoutKey } from "./pdf-layouts";
import { newItemId, scaleDesign } from "./page-design";

export type DesignTemplateKey = "classic" | "modern" | "minimal" | "compact" | "background" | "preprinted" | "blank";

export const DESIGN_TEMPLATES: readonly { key: DesignTemplateKey, label: string, description: string }[] = [
	{ key: "classic", label: "Classic", description: "Logo top-right, your details top-left, an accent rule." },
	{ key: "modern", label: "Modern", description: "Logo and details side by side over a bold accent bar." },
	{ key: "minimal", label: "Minimal", description: "Quiet type, no rules." },
	{ key: "compact", label: "Compact", description: "A slim header that leaves the most room for the document." },
	{ key: "background", label: "Full-page background", description: "An empty page-sized slot for your own letterhead artwork." },
	{ key: "preprinted", label: "Pre-printed paper", description: "A guide slot for a scan of your printed sheet. Nothing is printed." },
	{ key: "blank", label: "Blank", description: "Just the safe area, for building your own." }
];

export const DEFAULT_DESIGN_TEMPLATE: DesignTemplateKey = "classic";

// --- building blocks (A4 millimetres) --------------------------------------

const INK = "#111827";
const BODY = "#4b5563";
const MUTED = "#6b7280";
const HAIRLINE = "#e5e7eb";

const style = (size: number, color: TextStyle["color"], align: TextStyle["align"] = "left", bold = false): TextStyle =>
	({ font: "Akt", size, bold, italic: false, color, align });

const logo = (x: number, y: number, side: number): DesignItem =>
	({ type: "image", id: newItemId(), x, y, w: side, h: side, pages: "every", src: { kind: "company_logo" }, guide: false });

const text = (x: number, y: number, w: number, content: string, st: TextStyle): DesignItem =>
	({ type: "text", id: newItemId(), x, y, w, pages: "every", text: content, style: st });

const rule = (x: number, y: number, length: number, thickness: number, color: DesignColor): DesignItem =>
	({ type: "line", id: newItemId(), x, y, length, vertical: false, thickness, color, pages: "every" });

const pageNumber = (x: number, y: number, w: number, align: TextStyle["align"]): DesignItem =>
	({ type: "page_number", id: newItemId(), x, y, w, pages: "every", format: "page_of_total", hide_single: true, style: style(7, MUTED, align) });

const pageSlot = (guide: boolean): DesignItem =>
	({ type: "image", id: newItemId(), x: 0, y: 0, w: 210, h: 297, pages: "every", src: null, guide });

/** The Classic / Modern footer: hairline, contact line, page number. */
const footer = (): DesignItem[] => [
	rule(18, 281, 174, 0.5, HAIRLINE),
	text(18, 284, 174, "{business_name} · {website} · {phone}", style(7.5, MUTED, "center")),
	pageNumber(142, 289, 50, "right")
];

const margins = (top: number, bottom: number, sides = 18): MarginsMm => ({ top, right: sides, bottom, left: sides });

function build(key: DesignTemplateKey): { margins: MarginsMm, items: DesignItem[], documentStyle: PdfLayoutKey | null } {
	switch (key) {
		case "classic":
			return {
				documentStyle: "classic",
				margins: margins(48, 26),
				items: [
					logo(168, 12, 24),
					text(18, 13, 140, "{business_name}", style(14, INK, "left", true)),
					text(18, 20, 140, "{address}, {city}\n{phone} · {email}\n{website}", style(8.5, BODY)),
					rule(18, 40, 174, 2, "accent"),
					...footer()
				]
			};
		case "modern":
			return {
				documentStyle: "modern",
				margins: margins(44, 26),
				items: [
					logo(18, 14, 14),
					text(36, 14, 156, "{business_name}", style(14, INK, "left", true)),
					text(36, 20.5, 156, "{address}, {city} · {phone}\n{email} · {website}", style(8.5, BODY)),
					rule(18, 34, 174, 3, "accent"),
					...footer()
				]
			};
		case "minimal":
			return {
				documentStyle: "minimal",
				margins: margins(38, 22),
				items: [
					logo(18, 14, 12),
					text(34, 16, 90, "{business_name}", style(14, INK)),
					text(112, 14, 80, "{address}, {city}\n{phone}\n{email}\n{website}", style(8, MUTED, "right")),
					pageNumber(18, 286, 174, "center")
				]
			};
		case "compact":
			return {
				documentStyle: "compact",
				margins: margins(30, 20),
				items: [
					logo(183, 10, 9),
					text(18, 10, 160, "{business_name}", style(11, INK, "left", true)),
					text(18, 15.5, 160, "{address}, {city} · {phone} · {email} · {website}", style(7.5, BODY)),
					rule(18, 22, 174, 1.5, "accent"),
					text(18, 286, 124, "{business_name} · {website} · {phone}", style(7, MUTED)),
					pageNumber(142, 286, 50, "right")
				]
			};
		case "background":
			return { documentStyle: null, margins: margins(40, 25), items: [pageSlot(false), pageNumber(142, 289, 50, "right")] };
		case "preprinted":
			return { documentStyle: null, margins: margins(55, 20), items: [pageSlot(true)] };
		case "blank":
			return { documentStyle: null, margins: margins(20, 20), items: [] };
	}
}

/**
 * A fresh copy of a starter design for `paper`, and the Document style it sets
 * (null = keep the current one). `ids` makes the item ids — fresh random ones
 * by default; page-settings.ts passes a fixed sequence for the never-chosen
 * default so every render of it is identical.
 */
export function designTemplate(key: DesignTemplateKey, paper: PaperSize, ids: () => string = newItemId): { design: PageDesign, documentStyle: PdfLayoutKey | null } {
	const { margins: m, items: built, documentStyle } = build(key);
	const items = built.map((item) => ({ ...item, id: ids() }));
	const a4: PageDesign = { version: 1, paper: "a4", margins: m, items };
	return { design: scaleDesign(a4, paper), documentStyle };
}
