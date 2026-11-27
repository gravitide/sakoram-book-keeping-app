// What a Full-page background upload has to go through before it reaches the
// business folder (GLOSSARY.md "Full-page background"):
//
//   SVG / PDF — stored as uploaded; they cover the page uncropped and stay
//               vector. An SVG with live text gets a "convert text to
//               outlines" warning (Typst falls back to other fonts for text it
//               can't find, so the letterhead's lettering would change).
//   PNG / JPEG — cropped to the paper's proportions when they don't match
//               (ImageCropModal, aspect-locked), then downscaled to about
//               300 DPI at the paper size.
//
// Pure, store-free, relative imports only; the canvas work lives in the page.

import type { PaperSize } from "./page-settings";
import type { BackgroundExt } from "./stationery";
import { resolvePaperSize } from "./page-settings";

const DPI = 300;
const MM_PER_INCH = 25.4;

export interface PixelSize {
	w: number
	h: number
}

/** The pixel size of a portrait sheet at ~300 DPI (A4: 2480 × 3508). */
export function backgroundPixelSize(paper: PaperSize): PixelSize {
	const { widthMm, heightMm } = resolvePaperSize(paper);
	return { w: Math.round(widthMm / MM_PER_INCH * DPI), h: Math.round(heightMm / MM_PER_INCH * DPI) };
}

// Width/height may differ from the sheet's by this much (relative) and still
// count as "in proportion" — enough to forgive a rounded pixel at any size.
const ASPECT_TOLERANCE = 0.005;

/** Whether an image already has the (portrait) paper's proportions, so it needs no crop. */
export function matchesPaperAspect(w: number, h: number, paper: PaperSize): boolean {
	const { widthMm, heightMm } = resolvePaperSize(paper);
	const want = widthMm / heightMm;
	return Math.abs(w / h - want) / want <= ASPECT_TOLERANCE;
}

/** The size that fits within `max`, keeping proportions. Never enlarges. */
export function downscaleSize(w: number, h: number, max: PixelSize): PixelSize {
	const scale = Math.min(1, max.w / w, max.h / h);
	return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/**
 * Whether an SVG still holds live text — `<text>`, `<tspan>` or `<textPath>`
 * elements, namespaced or not. Comments are skipped, and so are style rules
 * and attribute values (only an element tag counts).
 */
export function svgHasLiveText(svg: string): boolean {
	const withoutComments = svg.replace(/<!--[\s\S]*?-->/g, "");
	return /<(?:[\w.-]+:)?(?:text|tspan|textpath)(?=[\s/>])/i.test(withoutComments);
}

// The one table of background formats: each one's MIME type. Every other
// spelling of an extension a user's file may carry is an alias of one of them.
const MIME: Record<BackgroundExt, string> = { svg: "image/svg+xml", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };
const ALIASES: Record<string, BackgroundExt> = { jpeg: "jpg" };

const formatOfExt = (ext: string): BackgroundExt | null => {
	const e = ext.toLowerCase();
	return ALIASES[e] ?? (Object.hasOwn(MIME, e) ? e as BackgroundExt : null);
};

/** The background format a file name's extension maps to, or null if it isn't one. */
export function backgroundFormatOf(fileName: string): BackgroundExt | null {
	const dot = fileName.lastIndexOf(".");
	if (dot < 0) return null;
	return formatOfExt(fileName.slice(dot + 1));
}

/** The MIME type for a background extension (any spelling), or a generic binary type. */
export function backgroundMimeOf(ext: string): string {
	const format = formatOfExt(ext);
	return format ? MIME[format] : "application/octet-stream";
}

/** PNG and JPEG are cropped and downscaled on import; SVG and PDF are stored as they are. */
export function isRasterBackground(ext: BackgroundExt): boolean {
	return ext === "png" || ext === "jpg";
}
