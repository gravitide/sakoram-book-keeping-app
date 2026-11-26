// The business's Stationery: its printed identity on every PDF page, and the
// blank bands the content must stay out of (GLOSSARY.md, ADR 0001).
//
// Two columns on company_settings hold it:
//   pdf_stationery_mode  which mode is active (a StoredStationeryMode)
//   pdf_stationery       JSON with EVERY mode's own settings, so switching modes
//                        never loses what another mode had (only an explicit
//                        Remove would). Parsed here with Zod; anything malformed
//                        degrades to the defaults — field by field, so one bad
//                        band doesn't throw away the good ones.
//
// Pure, store-free, relative imports only (vitest + the render-check script).

import type { PaperSize } from "./page-settings";
import { z } from "zod";

/** Every value the DB column accepts (CHECK in migration 0055). */
export type StoredStationeryMode = "builtin" | "background" | "header_footer" | "preprinted";

/**
 * The modes the app can render today. Header & footer images is
 * stored-but-not-built: resolveStationeryMode reads it as Built-in until its
 * renderer lands.
 */
export type StationeryMode = "builtin" | "background" | "preprinted";

export interface StationeryModeOption {
	key: StationeryMode
	label: string
	description: string
}

/** The Stationery picker, Built-in (the default) first. */
export const STATIONERY_MODES: readonly StationeryModeOption[] = [
	{ key: "builtin", label: "Built-in", description: "The app draws your logo, header text and footer on every page." },
	{ key: "background", label: "Full-page background", description: "Your own page-sized artwork (SVG, PDF, PNG or JPEG) is drawn behind the content on every page." },
	{ key: "preprinted", label: "Pre-printed paper", description: "Nothing is printed around the content — blank bands are left for paper that already carries your letterhead." }
];

const MODE_KEYS = new Set<string>(STATIONERY_MODES.map((m) => m.key));

/** The stored mode, or Built-in for anything missing, unknown or not yet renderable. */
export function resolveStationeryMode(stored: string | null | undefined): StationeryMode {
	return stored && MODE_KEYS.has(stored) ? stored as StationeryMode : "builtin";
}

const STORED_MODE_KEYS = new Set<string>(["builtin", "background", "header_footer", "preprinted"] satisfies StoredStationeryMode[]);

/**
 * What to write back to company_settings.pdf_stationery_mode when the settings
 * page saves. The picker shows the resolved mode, so a stored mode the app
 * can't render yet appears as Built-in; saving without picking another mode
 * must keep the stored one, not overwrite it with that stand-in.
 */
export function stationeryModeToSave(stored: string | null | undefined, picked: StationeryMode): StoredStationeryMode {
	if (stored && STORED_MODE_KEYS.has(stored) && resolveStationeryMode(stored) === picked) {
		return stored as StoredStationeryMode;
	}
	return picked;
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

// A band deeper than this leaves too little page for content on A5 (210 mm tall).
export const MAX_BAND_MM = 150;

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
 * The file formats a Full-page background can be stored as (the extension of
 * `stationery/background.<ext>` in the business folder). Raster uploads are
 * re-encoded on import, so a JPEG always lands as `jpg`.
 */
export const BACKGROUND_EXTS = ["svg", "pdf", "png", "jpg"] as const;
export type BackgroundExt = typeof BACKGROUND_EXTS[number];

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
	ext: z.enum(BACKGROUND_EXTS).nullable().catch(null),
	/** The sheet the artwork was prepared for (a raster is cropped to its proportions). */
	paper: z.enum(PAPER_KEYS).nullable().catch(null),
	/** Raster crop in source pixels of the untouched original, for Re-crop. null = uncropped. */
	crop: cropSchema.nullable().catch(null),
	/** An SVG that still holds live text — the settings page warns to outline it. */
	live_text: z.boolean().catch(false),
	margins: marginsSchema(BACKGROUND_DEFAULT_MARGINS)
}).catch({ ext: null, paper: null, crop: null, live_text: false, margins: { ...BACKGROUND_DEFAULT_MARGINS } });

export const stationerySchema = z.object({
	preprinted: marginsSchema(PREPRINTED_DEFAULT_MARGINS),
	background: backgroundSchema
});

export type BackgroundStationery = z.infer<typeof backgroundSchema>;
export type BackgroundArtwork = Pick<BackgroundStationery, "ext" | "paper" | "crop" | "live_text">;

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
