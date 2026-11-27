// Edits the page designer makes to its draft design, and which image files a
// Save or a Discard has to delete. Every function returns a new design and
// leaves its input alone (the undo history keeps the old ones).
//
// A file under a saved design is never overwritten before Save: replacing or
// cropping an image gives it a NEW id (and file), so Discard can always go
// back to exactly what was saved.
//
// Pure, store-free, relative imports only (vitest).

import type { DesignItem, ImageExt, MarginsMm, PageDesign } from "./page-design";
import { clampItem } from "./designer-geometry";
import { imageFileIds } from "./page-design";
import { resolvePaperSize } from "./paper-sizes";

/** A newly added image's width, unless the safe area is narrower. */
const NEW_IMAGE_MM = 60;
/** How far a duplicate is offset from its original. */
const DUPLICATE_OFFSET_MM = 5;

/** A new image (file `item-<id>.<ext>`, proportions `aspect` = w / h), centred across the safe area at its top, drawn on top. */
export function addImage(design: PageDesign, id: string, ext: ImageExt, aspect: number): PageDesign {
	const { widthMm } = resolvePaperSize(design.paper);
	const { left, right, top } = design.margins;
	const safeW = widthMm - left - right;
	const w = Math.min(NEW_IMAGE_MM, safeW);
	const item: DesignItem = { type: "image", id, x: left + (safeW - w) / 2, y: top, w, h: w / aspect, pages: "every", src: { kind: "file", ext }, guide: false };
	return { ...design, items: [...design.items, item] };
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
