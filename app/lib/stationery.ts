// The business's Stationery: its printed identity on every PDF page, and the
// blank bands the content must stay out of (GLOSSARY.md, ADR 0001).
//
// Two columns on company_settings hold it:
//   pdf_stationery_mode  which mode is active (a StationeryMode)
//   pdf_stationery       JSON with EVERY mode's own settings, so switching modes
//                        never loses what another mode had (only an explicit
//                        Remove would). Parsed here with Zod; anything malformed
//                        degrades to the defaults — field by field, so one bad
//                        band doesn't throw away the good ones.
//
// It also turns the stored Stationery into its paper-dependent geometry and
// back (paperGeometryOf / withPaperGeometry / refitStationery), and says what
// a Paper size change leaves for the user to check (stationeryReview). The
// geometry itself — every rule in millimetres — is in stationery-geometry.ts.
//
// Pure, store-free, relative imports only (vitest + the render-check script).

import type { PaperSize } from "./page-settings";
import type { MmRect, PaperGeometry, PlacedImage, Sheet } from "./stationery-geometry";
import { z } from "zod";
import { MAX_BAND_MM, paperChangeKind, refitPaperGeometry } from "./stationery-geometry";

/** Every mode the app renders, and every value the DB column accepts (CHECK in migration 0055). */
export type StationeryMode = "builtin" | "background" | "header_footer" | "preprinted";

export interface StationeryModeOption {
	key: StationeryMode
	label: string
	/** One line, shown under the label in the picker. */
	description: string
}

/** The Stationery picker, Built-in (the default) first. */
export const STATIONERY_MODES: readonly StationeryModeOption[] = [
	{ key: "builtin", label: "Built-in", description: "The app draws your logo, header text and footer." },
	{ key: "background", label: "Full-page background", description: "One page-sized artwork (SVG, PDF, PNG or JPEG) behind every page." },
	{ key: "header_footer", label: "Header & footer images", description: "Separate top and bottom images you place yourself." },
	{ key: "preprinted", label: "Pre-printed paper", description: "Prints nothing in the bands your letterhead already fills." }
];

const MODE_KEYS = new Set<string>(STATIONERY_MODES.map((m) => m.key));

/** The stored mode, or Built-in for anything missing or unknown. */
export function resolveStationeryMode(stored: string | null | undefined): StationeryMode {
	return stored && MODE_KEYS.has(stored) ? stored as StationeryMode : "builtin";
}

/** Four page margins in millimetres — the edges of the Safe area. */
export interface StationeryMarginsMm {
	top: number
	right: number
	bottom: number
	left: number
}

// The retired letter-only defaults (letter_preprinted_{top,bottom}_margin_mm,
// 55 / 20, sides 18 — dropped in 0056), so pre-printed letters kept their page
// when they moved onto these bands.
export const PREPRINTED_DEFAULT_MARGINS: Readonly<StationeryMarginsMm> = { top: 55, right: 18, bottom: 20, left: 18 };

const band = (fallback: number) => z.number().finite().min(0).max(MAX_BAND_MM).catch(fallback);

const marginsSchema = (d: Readonly<StationeryMarginsMm>) => z.object({
	top: band(d.top),
	right: band(d.right),
	bottom: band(d.bottom),
	left: band(d.left)
}).catch({ ...d });

// A Full-page background's Safe area until the business sets its own: a
// letterhead's header usually needs more room than its footer.
export const BACKGROUND_DEFAULT_MARGINS: Readonly<StationeryMarginsMm> = { top: 40, right: 18, bottom: 25, left: 18 };

/**
 * The file formats Stationery artwork can be stored as — the extension of
 * `stationery/background.<ext>`, `header.<ext>` or `footer.<ext>` in the
 * business folder. Raster uploads are re-encoded on import, so a JPEG always
 * lands as `jpg`.
 */
export const ARTWORK_EXTS = ["svg", "pdf", "png", "jpg"] as const;
export type ArtworkExt = typeof ARTWORK_EXTS[number];

/** The raster formats: cropped and downscaled on import, and fixed to the proportions they were cropped to. SVG and PDF are stored as they are. */
export const RASTER_EXTS: readonly ArtworkExt[] = ["png", "jpg"];

export function isRasterArtwork(ext: ArtworkExt): boolean {
	return RASTER_EXTS.includes(ext);
}

// The four Paper sizes (page-settings.ts PAPER_SIZES), repeated as a literal so
// this module doesn't import page-settings at runtime (it imports us).
const PAPER_KEYS = ["a4", "a5", "us-letter", "us-legal"] as const satisfies readonly PaperSize[];

const cropSchema = z.object({
	x: z.number().finite().min(0),
	y: z.number().finite().min(0),
	w: z.number().finite().positive(),
	h: z.number().finite().positive()
});

const backgroundSchema = z.object({
	/** null = no artwork uploaded (or it was removed). */
	ext: z.enum(ARTWORK_EXTS).nullable().catch(null),
	/** The sheet the artwork was prepared for (a raster is cropped to its proportions). */
	paper: z.enum(PAPER_KEYS).nullable().catch(null),
	/** Raster crop in source pixels of the untouched original, for Re-crop. null = uncropped. */
	crop: cropSchema.nullable().catch(null),
	/** An SVG that still holds live text — the settings page warns to outline it. */
	live_text: z.boolean().catch(false),
	margins: marginsSchema(BACKGROUND_DEFAULT_MARGINS)
}).catch({ ext: null, paper: null, crop: null, live_text: false, margins: { ...BACKGROUND_DEFAULT_MARGINS } });

// Header & footer images' Safe area before either image is placed. Placing an
// image pushes its band out to the image's inner edge + 4 mm
// (stationery-geometry.ts headerFooterMargins).
export const HEADER_FOOTER_DEFAULT_MARGINS: Readonly<StationeryMarginsMm> = { top: 20, right: 18, bottom: 20, left: 18 };

/** Which of the two Header & footer images. */
export type HeaderFooterSlot = "header" | "footer";
export const HEADER_FOOTER_SLOTS: readonly HeaderFooterSlot[] = ["header", "footer"];

/** What the settings page and the editor call each image. */
export const HEADER_FOOTER_LABEL: Readonly<Record<HeaderFooterSlot, string>> = { header: "Header image", footer: "Footer image" };

/** Something per Header & footer image — a place, a page-block entry — null where there is no image. */
export type HeaderFooterPair<T> = Record<HeaderFooterSlot, T | null>;

const mmRectSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
	w: z.number().finite().positive(),
	h: z.number().finite().positive()
});

// One Header & footer image. The file is always stationery/<slot>.<ext>; this
// records its format and where it sits on the page — never a path. Anything
// that can't be placed (unknown format, no size) reads as no image at all.
const headerFooterImageSchema = z.object({
	ext: z.enum(ARTWORK_EXTS),
	/** The artwork's width / height, so a resize keeps its proportions. */
	aspect: z.number().finite().positive(),
	/** Where it is drawn, in mm from the page's top-left corner. */
	rect: mmRectSchema,
	/** The sheet `rect` was placed on (a later Paper size change re-fits it). */
	paper: z.enum(PAPER_KEYS).nullable().catch(null),
	/** Raster crop in source pixels of the untouched original, for Re-crop. null = uncropped. */
	crop: cropSchema.nullable().catch(null),
	/** An SVG that still holds live text — the settings page warns to outline it. */
	live_text: z.boolean().catch(false)
}).nullable().catch(null);

const headerFooterSchema = z.object({
	header: headerFooterImageSchema.default(null),
	footer: headerFooterImageSchema.default(null),
	margins: marginsSchema(HEADER_FOOTER_DEFAULT_MARGINS)
}).catch({ header: null, footer: null, margins: { ...HEADER_FOOTER_DEFAULT_MARGINS } });

export const stationerySchema = z.object({
	preprinted: marginsSchema(PREPRINTED_DEFAULT_MARGINS),
	background: backgroundSchema,
	header_footer: headerFooterSchema
});

export type BackgroundStationery = z.infer<typeof backgroundSchema>;
export type BackgroundArtwork = Pick<BackgroundStationery, "ext" | "paper" | "crop" | "live_text">;

export type HeaderFooterImage = NonNullable<z.infer<typeof headerFooterImageSchema>>;
export type HeaderFooterStationery = z.infer<typeof headerFooterSchema>;

export type Stationery = z.infer<typeof stationerySchema>;

/** company_settings.pdf_stationery → every mode's settings, defaults for anything malformed. */
export function parseStationery(stored: string | null | undefined): Stationery {
	let raw: unknown = {};
	if (stored) {
		try {
			raw = JSON.parse(stored);
		} catch {
			raw = {};
		}
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) raw = {};
	return stationerySchema.parse(raw);
}

export function serializeStationery(stationery: Stationery): string {
	return JSON.stringify(stationery);
}

/**
 * The stored JSON with Pre-printed paper's four margins replaced. Every other
 * mode's settings are kept, and a refused value falls back to its default
 * through the schema rather than being saved.
 */
export function setPreprintedMargins(stored: string | null | undefined, margins: StationeryMarginsMm): string {
	const current = parseStationery(stored);
	return serializeStationery(stationerySchema.parse({ ...current, preprinted: margins }));
}

/**
 * The stored JSON after a Full-page background upload: the new artwork's
 * format, the sheet it was prepared for, its crop and live-text flag. The
 * background's margins and every other mode's settings are kept.
 */
export function setBackgroundArtwork(stored: string | null | undefined, artwork: BackgroundArtwork): string {
	const current = parseStationery(stored);
	return serializeStationery(stationerySchema.parse({ ...current, background: { ...current.background, ...artwork } }));
}

/** The stored JSON after Remove: no artwork, the background's margins kept. */
export function clearBackgroundArtwork(stored: string | null | undefined): string {
	return setBackgroundArtwork(stored, { ext: null, paper: null, crop: null, live_text: false });
}

/** The stored JSON with the Full-page background's four margins replaced (refused values fall back to defaults). */
export function setBackgroundMargins(stored: string | null | undefined, margins: StationeryMarginsMm): string {
	const current = parseStationery(stored);
	return serializeStationery(stationerySchema.parse({ ...current, background: { ...current.background, margins } }));
}

/**
 * The stored JSON with one Header & footer image replaced — or removed, with
 * null. The other image, the margins and every other mode are kept.
 */
export function setHeaderFooterImage(stored: string | null | undefined, slot: HeaderFooterSlot, image: HeaderFooterImage | null): string {
	const current = parseStationery(stored);
	return serializeStationery(stationerySchema.parse({ ...current, header_footer: { ...current.header_footer, [slot]: image } }));
}

/** The stored JSON with Header & footer images' four margins replaced (refused values fall back to defaults). */
export function setHeaderFooterMargins(stored: string | null | undefined, margins: StationeryMarginsMm): string {
	const current = parseStationery(stored);
	return serializeStationery(stationerySchema.parse({ ...current, header_footer: { ...current.header_footer, margins } }));
}

/** Where the two images sit and the margins around them — what the Stationery editor edits. */
export type HeaderFooterGeometry = HeaderFooterPair<MmRect> & { margins: StationeryMarginsMm };

/**
 * The stored JSON with the images moved / resized and the margins replaced.
 * Only images that are still stored are moved — a rect for an image removed
 * since the editor opened is ignored — and each keeps its format, proportions
 * and crop. Every other mode's settings are kept.
 */
export function setHeaderFooterGeometry(stored: string | null | undefined, geometry: HeaderFooterGeometry): string {
	const current = parseStationery(stored);
	const hf = current.header_footer;
	const moved = (image: HeaderFooterImage | null, rect: MmRect | null) => (image && rect ? { ...image, rect: { ...rect } } : image);
	return serializeStationery(stationerySchema.parse({
		...current,
		header_footer: { header: moved(hf.header, geometry.header), footer: moved(hf.footer, geometry.footer), margins: geometry.margins }
	}));
}

// ---- Paper size changes -------------------------------------------------
// The geometry is re-fitted in stationery-geometry.ts (refitPaperGeometry);
// these read it out of the stored Stationery, put it back, and say what the
// user should check afterwards.

/** What the Stationery editor asks the user to check on this sheet (null = nothing). */
export interface StationeryReview {
	/** Header & footer images placed on another sheet: that sheet. */
	header: PaperSize | null
	footer: PaperSize | null
	/** A Full-page background prepared for another sheet; a raster one needs a re-crop. */
	background: { preparedFor: PaperSize, recrop: boolean } | null
}

/**
 * What needs a look after the Paper size changed: anything placed or
 * prepared on a different sheet. A raster background prepared for a sheet of
 * another shape needs a re-crop (it would be cut off by "cover"); an SVG or
 * PDF re-covers the page and only needs a check. An unknown sheet is never
 * flagged.
 */
export function stationeryReview(g: PaperGeometry, backgroundExt: ArtworkExt | null, paper: PaperSize): StationeryReview {
	const placedOn = (image: PlacedImage | null) => (image?.paper && image.paper !== paper ? image.paper : null);
	const prepared = g.background.paper;
	return {
		header: placedOn(g.header_footer.header),
		footer: placedOn(g.header_footer.footer),
		background: backgroundExt && prepared && prepared !== paper
			? { preparedFor: prepared, recrop: isRasterArtwork(backgroundExt) && paperChangeKind(prepared, paper) === "keep-size" }
			: null
	};
}

/**
 * Whether the ACTIVE mode has something to check — what makes the settings
 * page open the Stationery editor, banner showing, right after a Paper size
 * pick. Only that mode's own artwork counts: another mode's flags wait on its
 * card until the user switches to it.
 */
export function modeNeedsReview(review: StationeryReview, mode: StationeryMode): boolean {
	if (mode === "header_footer") return review.header !== null || review.footer !== null;
	if (mode === "background") return review.background !== null;
	return false;
}

/**
 * The geometry after Apply in the Stationery editor, which showed the user
 * this mode on this sheet: Header & footer images now count as placed on it,
 * the background as prepared for it — except a raster one that needs a
 * re-crop (stationeryReview), which Apply leaves flagged.
 */
export function confirmPaperGeometry(g: PaperGeometry, mode: StationeryMode, paper: PaperSize, backgroundExt: ArtworkExt | null): PaperGeometry {
	const out = structuredClone(g);
	if (mode === "header_footer") {
		for (const image of [out.header_footer.header, out.header_footer.footer]) {
			if (image) image.paper = paper;
		}
	}
	if (mode === "background" && backgroundExt && !stationeryReview(g, backgroundExt, paper).background?.recrop) out.background.paper = paper;
	return out;
}

/** The paper-dependent geometry out of the stored Stationery. */
export function paperGeometryOf(s: Stationery): PaperGeometry {
	const placed = (image: HeaderFooterImage | null): PlacedImage | null => (image ? { rect: { ...image.rect }, paper: image.paper } : null);
	return {
		preprinted: { ...s.preprinted },
		background: { margins: { ...s.background.margins }, paper: s.background.paper },
		header_footer: { header: placed(s.header_footer.header), footer: placed(s.header_footer.footer), margins: { ...s.header_footer.margins } }
	};
}

/**
 * The stored Stationery with this geometry put in. Only artwork that is still
 * stored takes a place or a sheet — an image removed (or a background
 * cleared) since the geometry was read stays gone — and every image keeps its
 * format, proportions, crop and live-text flag.
 */
export function withPaperGeometry(s: Stationery, g: PaperGeometry): Stationery {
	const put = (image: HeaderFooterImage | null, placed: PlacedImage | null) =>
		(image && placed ? { ...image, rect: { ...placed.rect }, paper: placed.paper } : image);
	return {
		preprinted: { ...g.preprinted },
		background: { ...s.background, margins: { ...g.background.margins }, paper: s.background.ext ? g.background.paper : s.background.paper },
		header_footer: {
			header: put(s.header_footer.header, g.header_footer.header),
			footer: put(s.header_footer.footer, g.header_footer.footer),
			margins: { ...g.header_footer.margins }
		}
	};
}

/** company_settings.pdf_stationery re-fitted from one sheet to another (stationery-geometry.ts refitPaperGeometry). */
export function refitStationery(stored: string | null | undefined, from: Sheet, to: Sheet): string {
	const s = parseStationery(stored);
	return serializeStationery(withPaperGeometry(s, refitPaperGeometry(from, to, paperGeometryOf(s))));
}
