// Edits the page designer makes to its draft design, and which image files a
// Save or a Discard has to delete. Every function returns a new design and
// leaves its input alone (the undo history keeps the old ones).
//
// A file under a saved design is never overwritten before Save: replacing or
// cropping an image gives it a NEW id (and file), so Discard can always go
// back to exactly what was saved.
//
// Pure, store-free, relative imports only (vitest).

import type { DesignFont, DesignItem, ImageExt, MarginsMm, PageDesign, PagesRule } from "./page-design";
import { INK, MUTED, textStyle } from "./design-templates";
import { clampItem } from "./designer-geometry";
import { imageFileIds } from "./page-design";
import { resolvePaperSize } from "./paper-sizes";

/** A newly added image's width, unless the safe area is narrower. */
const NEW_IMAGE_MM = 60;
/**
 * How far inside the safe area a new item lands: never on a margin guide,
 * whose grab strip would take the drag instead of the item.
 */
const NEW_ITEM_INSET_MM = 10;
/** How far a duplicate is offset from its original. */
const DUPLICATE_OFFSET_MM = 5;
/** A new text box's width, unless the safe area is narrower. */
const NEW_TEXT_MM = 80;
/** A new page number's width; it sits this far above the paper's bottom edge. */
const PAGE_NUMBER_W_MM = 40;
const PAGE_NUMBER_FROM_BOTTOM_MM = 9;
/** What a new text box says, selected in its editor so typing replaces it. */
export const NEW_TEXT = "New text";

/** The safe area's top-left and width, on the design's own paper. */
function safeArea(design: PageDesign) {
	const { widthMm } = resolvePaperSize(design.paper);
	const { left, right, top } = design.margins;
	return { x: left, y: top, w: widthMm - left - right };
}

/** A new item's spot: (x, y), moved 5 mm down and right while another item already starts exactly there. */
function freeSpot(design: PageDesign, x: number, y: number): { x: number, y: number } {
	let at = { x, y };
	while (design.items.some((i) => i.x === at.x && i.y === at.y)) at = { x: at.x + DUPLICATE_OFFSET_MM, y: at.y + DUPLICATE_OFFSET_MM };
	return at;
}

const append = (design: PageDesign, item: DesignItem): PageDesign => ({ ...design, items: [...design.items, clampItem(item, design)] });

/** A new text box just inside the safe area's top-left, on top, saying NEW_TEXT in `font`. */
export function addText(design: PageDesign, id: string, font: DesignFont): PageDesign {
	const safe = safeArea(design);
	const at = freeSpot(design, safe.x + NEW_ITEM_INSET_MM, safe.y + NEW_ITEM_INSET_MM);
	return append(design, { type: "text", id, ...at, w: Math.min(NEW_TEXT_MM, safe.w), pages: "every", text: NEW_TEXT, style: textStyle(10, INK, "left", false, font) });
}

/** Whether the design already has its (one) page number. */
export function hasPageNumber(design: PageDesign): boolean {
	return design.items.some((i) => i.type === "page_number");
}

/** A page number at the bottom right, below the safe area — or the design unchanged when it already has one. */
export function addPageNumber(design: PageDesign, id: string, font: DesignFont): PageDesign {
	if (hasPageNumber(design)) return design;
	const { widthMm, heightMm } = resolvePaperSize(design.paper);
	const at = freeSpot(design, widthMm - design.margins.right - PAGE_NUMBER_W_MM, heightMm - PAGE_NUMBER_FROM_BOTTOM_MM);
	return append(design, { type: "page_number", id, ...at, w: PAGE_NUMBER_W_MM, pages: "every", format: "page_of_total", hide_single: true, style: textStyle(7, MUTED, "right", false, font) });
}

/** A thin Accent line across the safe area, just inside its top. */
export function addLine(design: PageDesign, id: string): PageDesign {
	const safe = safeArea(design);
	const at = freeSpot(design, safe.x, safe.y + NEW_ITEM_INSET_MM);
	return append(design, { type: "line", id, ...at, length: safe.w, vertical: false, thickness: 0.75, color: "accent", pages: "every" });
}

/** An item locked (the designer won't select, move or edit it on the page) or unlocked. */
export function setItemLocked(design: PageDesign, id: string, locked: boolean): PageDesign {
	return { ...design, items: design.items.map((i) => (i.id === id ? { ...i, locked } : i)) };
}

/** An item drawn on `pages`: every page, the first only, or every page after the first. */
export function setItemPages(design: PageDesign, id: string, pages: PagesRule): PageDesign {
	return { ...design, items: design.items.map((i) => (i.id === id ? { ...i, pages } : i)) };
}

/** An image marked guide-only (shown in the designer, never printed) or back to printed; anything else is left alone. */
export function setImageGuide(design: PageDesign, id: string, guide: boolean): PageDesign {
	const item = design.items.find((i) => i.id === id);
	if (item?.type !== "image") return design;
	return { ...design, items: design.items.map((i) => (i.id === id ? { ...item, guide } : i)) };
}

/**
 * An empty image slot filled with an uploaded file (`item-<newId>.<ext>`): it keeps
 * its box, pages rule, guide flag and stacking (Typst fits the image inside the
 * box). Anything but an empty slot is left alone.
 */
export function fillSlot(design: PageDesign, slotId: string, newId: string, ext: ImageExt): PageDesign {
	const slot = design.items.find((i) => i.id === slotId);
	if (slot?.type !== "image" || slot.src !== null) return design;
	return { ...design, items: design.items.map((i) => (i.id === slotId ? { ...slot, id: newId, src: { kind: "file", ext } } : i)) };
}

/** A line turned horizontal or vertical from the same start, shortened to fit the page that way. */
export function setLineVertical(design: PageDesign, id: string, vertical: boolean): PageDesign {
	const { widthMm, heightMm } = resolvePaperSize(design.paper);
	return {
		...design,
		items: design.items.map((i) => {
			if (i.id !== id || i.type !== "line" || i.vertical === vertical) return i;
			const room = vertical ? heightMm - i.y : widthMm - i.x;
			return clampItem({ ...i, vertical, length: Math.min(i.length, room) }, design);
		})
	};
}

/** A new image (file `item-<id>.<ext>`, proportions `aspect` = w / h), centred across the safe area just inside its top, drawn on top. */
export function addImage(design: PageDesign, id: string, ext: ImageExt, aspect: number): PageDesign {
	const { widthMm } = resolvePaperSize(design.paper);
	const { left, right, top } = design.margins;
	const safeW = widthMm - left - right;
	const w = Math.min(NEW_IMAGE_MM, safeW);
	const item: DesignItem = { type: "image", id, x: left + (safeW - w) / 2, y: top + NEW_ITEM_INSET_MM, w, h: w / aspect, pages: "every", src: { kind: "file", ext }, guide: false };
	return { ...design, items: [...design.items, item] };
}

/**
 * Whether an item is the design's background: a printed (not guide) image
 * covering the whole page, with a file or an empty template spot for one.
 */
export function isBackground(item: DesignItem, design: PageDesign): boolean {
	const { widthMm, heightMm } = resolvePaperSize(design.paper);
	return item.type === "image" && !item.guide && item.w >= widthMm - 0.5 && item.h >= heightMm - 0.5;
}

/**
 * The design's one background, set to a new file (`item-<id>.<ext>`): it covers
 * the whole sheet, locked, so clicks on the page reach what's in front. It
 * replaces any background already there (or a template's empty spot for one),
 * in its place in the stack; with none, it goes behind everything. A
 * pre-printed scan (a guide) isn't a background and stays.
 */
export function setBackground(design: PageDesign, id: string, ext: ImageExt): PageDesign {
	const { widthMm, heightMm } = resolvePaperSize(design.paper);
	const item: DesignItem = { type: "image", id, x: 0, y: 0, w: widthMm, h: heightMm, pages: "every", src: { kind: "file", ext }, guide: false, locked: true };
	const at = Math.max(0, design.items.findIndex((i) => isBackground(i, design)));
	const rest = design.items.filter((i) => !isBackground(i, design));
	return { ...design, items: [...rest.slice(0, at), item, ...rest.slice(at)] };
}

/** An image swapped for a new file: same place, width, pages rule and stacking; the new file's proportions and id. */
export function replaceImage(design: PageDesign, oldId: string, newId: string, ext: ImageExt, aspect: number): PageDesign {
	return {
		...design,
		items: design.items.map((i): DesignItem => (i.id === oldId && i.type === "image"
			? { ...i, id: newId, h: i.w / aspect, src: { kind: "file", ext } }
			: i))
	};
}

/**
 * The image file a duplicate needs: item ids name the files, so a copied
 * image item must get its own copy of the original's file. Null for anything
 * that isn't a file-backed image.
 */
export function fileCopyForDuplicate(item: DesignItem, newId: string): { fromId: string, toId: string, ext: ImageExt } | null {
	return item.type === "image" && item.src?.kind === "file" ? { fromId: item.id, toId: newId, ext: item.src.ext } : null;
}

/** A copy of an item, offset down and right (kept on the page), just above the original. Its image file: fileCopyForDuplicate. */
export function duplicateItem(design: PageDesign, id: string, newId: string): PageDesign {
	const at = design.items.findIndex((i) => i.id === id);
	if (at < 0) return design;
	const original = design.items[at]!;
	// A design has one page number (it shows on every page).
	if (original.type === "page_number") return design;
	const copy = clampItem({ ...original, id: newId, x: original.x + DUPLICATE_OFFSET_MM, y: original.y + DUPLICATE_OFFSET_MM } as DesignItem, design);
	return { ...design, items: [...design.items.slice(0, at + 1), copy, ...design.items.slice(at + 1)] };
}

export function deleteItem(design: PageDesign, id: string): PageDesign {
	return { ...design, items: design.items.filter((i) => i.id !== id) };
}

/** One step later in the list (drawn on top of the next item) or earlier. */
export function reorderItem(design: PageDesign, id: string, dir: "forward" | "backward"): PageDesign {
	const at = design.items.findIndex((i) => i.id === id);
	const to = dir === "forward" ? at + 1 : at - 1;
	if (at < 0 || to < 0 || to >= design.items.length) return design;
	const items = [...design.items];
	[items[at], items[to]] = [items[to]!, items[at]!];
	return { ...design, items };
}

export function updateItem(design: PageDesign, item: DesignItem): PageDesign {
	return { ...design, items: design.items.map((i) => (i.id === item.id ? item : i)) };
}

export function setMargins(design: PageDesign, margins: MarginsMm): PageDesign {
	return { ...design, margins: { ...margins } };
}

/**
 * The image files (item ids) to delete when the designer closes a session:
 *   save    — files the saved design or this session's uploads have that the draft doesn't use;
 *   discard — this session's uploads the saved design doesn't use.
 */
export function filesToRemove(input: { saved: PageDesign | null, draft: PageDesign, uploaded: readonly string[], outcome: "save" | "discard" }): string[] {
	const saved = new Set(imageFileIds(input.saved));
	const draft = new Set(imageFileIds(input.draft));
	const gone = input.outcome === "save"
		? [...saved, ...input.uploaded].filter((id) => !draft.has(id))
		: input.uploaded.filter((id) => !saved.has(id));
	return [...new Set(gone)].sort();
}
