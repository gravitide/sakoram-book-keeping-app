// What happens to a file the user adds to the page designer, before it
// becomes a design image (stationery/item-<id>.<ext>):
//   PNG / JPEG — raster: cropped (free aspect) and downscaled to ~300 DPI at
//                the page size, so a phone photo doesn't bloat every PDF;
//   SVG / PDF  — stored as-is and stay vector.
// Anything else is refused with what does work.
//
// Pure, store-free, relative imports only (vitest). The canvas / file work is
// in app/composables/useDesignImageUpload.ts.

import type { ImageExt } from "./page-design";
import type { PaperSize } from "./paper-sizes";
import { artworkFormatOf, artworkPixelSize, downscaleSize, isRasterArtwork } from "./stationery-artwork";

const BY_MIME: Record<string, ImageExt> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "application/pdf": "pdf" };

/** The image format a dropped / picked file becomes, or why it can't be used. */
export function uploadPlan(fileName: string, mime: string): { ext: ImageExt, raster: boolean } | { error: string } {
	const ext = artworkFormatOf(fileName) ?? BY_MIME[mime.toLowerCase()] ?? null;
	if (!ext) return { error: "Use a PNG, JPEG, SVG or PDF image." };
	return { ext, raster: isRasterArtwork(ext) };
}

/** The pixel size a raster upload is stored at: within 300 DPI of the page size, proportions kept, never enlarged. */
export function rasterTarget(natural: { w: number, h: number }, paper: PaperSize): { w: number, h: number } {
	return downscaleSize(natural.w, natural.h, artworkPixelSize(paper));
}
