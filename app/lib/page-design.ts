// The business's page design: the paper's safe area (where the app lays out
// the document) and the canvas items drawn behind it — images, text boxes, a
// page number, lines. Stored as JSON in company_settings.pdf_design; NULL means
// "never chosen" (page-settings.ts effectiveDesign renders the Classic template).
//
// Every position and size is millimetres from the page's top-left; font sizes
// and line thickness are points. Item ids name the item's image file
// (stationery/item-<id>.<ext>), so they are checked here AND again in Rust
// before any path is built.
//
// Pure, store-free, relative imports only (vitest).
// Spec: docs/superpowers/specs/2026-11-27-page-designer-design.md

import type { PaperSize } from "./paper-sizes";
import { z } from "zod";
import { resolvePaperSize } from "./paper-sizes";

export type PagesRule = "every" | "first" | "not_first";
export type DesignFont = "Akt" | "Inter" | "Inter Tight" | "Stack Sans Text" | "Miriam Libre" | "Amarna";
export const DESIGN_FONTS: readonly DesignFont[] = ["Akt", "Inter", "Inter Tight", "Stack Sans Text", "Miriam Libre", "Amarna"];
/** A fixed `#rrggbb`, or the business's Accent colour. */
export type DesignColor = "accent" | `#${string}`;
export type TextAlign = "left" | "center" | "right";
export type PageNumberFormat = "page_of_total" | "slash" | "number";

export interface MarginsMm { top: number, right: number, bottom: number, left: number }
export interface TextStyle { font: DesignFont, size: number, bold: boolean, italic: boolean, color: DesignColor, align: TextAlign }
export type ImageExt = "svg" | "pdf" | "png" | "jpg";
/** A copied file, the business's company logo (only in an untouched default), or an empty slot. */
export type ImageSource = { kind: "file", ext: ImageExt } | { kind: "company_logo" } | null;

export type DesignItem
	= | { type: "image", id: string, x: number, y: number, w: number, h: number, pages: PagesRule, src: ImageSource, guide: boolean }
		| { type: "text", id: string, x: number, y: number, w: number, pages: PagesRule, text: string, style: TextStyle }
		| { type: "page_number", id: string, x: number, y: number, w: number, pages: PagesRule, format: PageNumberFormat, hide_single: boolean, style: TextStyle }
		| { type: "line", id: string, x: number, y: number, length: number, vertical: boolean, thickness: number, color: DesignColor, pages: PagesRule };

export interface PageDesign { version: 1, paper: PaperSize, margins: MarginsMm, items: DesignItem[] }

/** Item ids: lowercase letters and digits, 6–32 long. Mirrored in tenants.rs / pdf.rs. */
export const ITEM_ID_PATTERN = /^[a-z0-9]{6,32}$/;

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A fresh 12-character item id. */
export function newItemId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

// --- schema --------------------------------------------------------------

// Zod 4 numbers already reject Infinity / NaN.
const pos = z.number().min(0);
const size = z.number().positive();
const id = z.string().regex(ITEM_ID_PATTERN);
const pages = z.enum(["every", "first", "not_first"]);
const color = z.union([z.literal("accent"), z.string().regex(/^#[0-9a-f]{6}$/i)]) as z.ZodType<DesignColor>;
const style = z.object({
	font: z.enum(DESIGN_FONTS as [DesignFont, ...DesignFont[]]),
	size,
	bold: z.boolean(),
	italic: z.boolean(),
	color,
	align: z.enum(["left", "center", "right"])
});
const imageSrc = z.union([
	z.object({ kind: z.literal("file"), ext: z.enum(["svg", "pdf", "png", "jpg"]) }),
	z.object({ kind: z.literal("company_logo") }),
	z.null()
]);

const itemSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("image"), id, x: pos, y: pos, w: size, h: size, pages, src: imageSrc, guide: z.boolean() }),
	z.object({ type: z.literal("text"), id, x: pos, y: pos, w: size, pages, text: z.string(), style }),
	z.object({ type: z.literal("page_number"), id, x: pos, y: pos, w: size, pages, format: z.enum(["page_of_total", "slash", "number"]), hide_single: z.boolean(), style }),
	z.object({ type: z.literal("line"), id, x: pos, y: pos, length: size, vertical: z.boolean(), thickness: size, color, pages })
]);

const designSchema = z.object({
	version: z.literal(1),
	paper: z.string(),
	margins: z.object({ top: pos, right: pos, bottom: pos, left: pos }),
	items: z.array(z.unknown())
});

/**
 * The stored design, or null when there is none or it can't be read. Items are
 * checked one by one, so a single bad item is dropped rather than the design.
 */
export function parsePageDesign(stored: string | null | undefined): PageDesign | null {
	if (!stored) return null;
	let raw: unknown;
	try {
		raw = JSON.parse(stored);
	} catch {
		return null;
	}
	const top = designSchema.safeParse(raw);
	if (!top.success) return null;
	const items: DesignItem[] = [];
	for (const candidate of top.data.items) {
		const item = itemSchema.safeParse(candidate);
		if (item.success) items.push(item.data as DesignItem);
	}
	return { version: 1, paper: resolvePaperSize(top.data.paper).key, margins: top.data.margins, items };
}

// --- paper changes ----------------------------------------------------------

/**
 * The design moved onto another sheet: positions scale with each axis, sizes
 * by the smaller ratio so nothing stretches. The stored design is untouched.
 */
export function scaleDesign(design: PageDesign, to: PaperSize): PageDesign {
	if (design.paper === to) return design;
	const from = resolvePaperSize(design.paper);
	const target = resolvePaperSize(to);
	const sx = target.widthMm / from.widthMm;
	const sy = target.heightMm / from.heightMm;
	const s = Math.min(sx, sy);
	const scaledStyle = (st: TextStyle): TextStyle => ({ ...st, size: st.size * s });
	const items = design.items.map((item): DesignItem => {
		switch (item.type) {
			case "image":
				// A background or full-page slot covers the new sheet too (its image
				// is fitted inside, never stretched); anything else keeps its shape.
				if (item.x <= 0.5 && item.y <= 0.5 && item.w >= from.widthMm - 0.5 && item.h >= from.heightMm - 0.5) {
					return { ...item, x: 0, y: 0, w: target.widthMm, h: target.heightMm };
				}
				return { ...item, x: item.x * sx, y: item.y * sy, w: item.w * s, h: item.h * s };
			case "text":
				return { ...item, x: item.x * sx, y: item.y * sy, w: item.w * s, style: scaledStyle(item.style) };
			case "page_number":
				return { ...item, x: item.x * sx, y: item.y * sy, w: item.w * s, style: scaledStyle(item.style) };
			default:
				return { ...item, x: item.x * sx, y: item.y * sy, length: item.length * (item.vertical ? sy : sx) };
		}
	});
	const { top, right, bottom, left } = design.margins;
	return {
		version: 1,
		paper: target.key,
		margins: { top: top * sy, right: right * sx, bottom: bottom * sy, left: left * sx },
		items
	};
}

/**
 * The stored design with a new safe area that was edited on `onPaper` (the
 * business's current sheet). The margins are scaled back to the design's own
 * sheet — per axis, so exactly — and the items and `paper` are left alone:
 * saving on another sheet never rescales (and so never shrinks) the design.
 */
export function withMargins(design: PageDesign, margins: MarginsMm, onPaper: PaperSize): PageDesign {
	const back = scaleDesign({ version: 1, paper: onPaper, margins, items: [] }, design.paper).margins;
	return { ...design, margins: back };
}

/** Two safe areas match to a hundredth of a millimetre (paper switches leave float noise). */
export function sameMargins(a: MarginsMm, b: MarginsMm): boolean {
	const r = (n: number) => Math.round(n * 100);
	return r(a.top) === r(b.top) && r(a.right) === r(b.right) && r(a.bottom) === r(b.bottom) && r(a.left) === r(b.left);
}

/** Whether an item with this pages rule is drawn on `page` (1-based). Mirrored in common.typ design-items. */
export function itemOnPage(rule: PagesRule, page: number): boolean {
	if (rule === "first") return page === 1;
	if (rule === "not_first") return page > 1;
	return true;
}

/** Millimetres for display: a tenth at most, no trailing ".0". */
export const formatMm = (mm: number): string => String(Math.round(mm * 10) / 10);

/**
 * A template's company-logo spots, once the logo has been copied in as a file
 * of format `logoExt` (under each spot's own item id) — or emptied when the
 * business has no logo.
 */
export function withLogoSlots(design: PageDesign, logoExt: ImageExt | null): PageDesign {
	const items = design.items.map((item): DesignItem => {
		if (item.type !== "image" || item.src?.kind !== "company_logo") return item;
		return { ...item, src: logoExt ? { kind: "file", ext: logoExt } : null };
	});
	return { ...design, items };
}

/** The ids of the items whose image is a file in the business folder (stationery/item-<id>.<ext>). */
export function imageFileIds(design: PageDesign | null): string[] {
	return (design?.items ?? []).filter((i) => i.type === "image" && i.src?.kind === "file").map((i) => i.id);
}
