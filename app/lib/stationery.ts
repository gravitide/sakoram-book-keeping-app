// The business's Stationery: its printed identity on every PDF page, and the
// blank bands the content must stay out of (GLOSSARY.md, ADR 0001).
//
// Two columns on company_settings hold it:
//   pdf_stationery_mode  which mode is active (one of STORED_STATIONERY_MODES)
//   pdf_stationery       JSON with EVERY mode's own settings, so switching modes
//                        never loses what another mode had (only an explicit
//                        Remove would). Parsed here with Zod; anything malformed
//                        degrades to the defaults — field by field, so one bad
//                        band doesn't throw away the good ones.
//
// Pure, store-free, relative imports only (vitest + the render-check script).

import { z } from "zod";

/** Every value the DB column accepts (CHECK in migration 0055). */
export type StoredStationeryMode = "builtin" | "background" | "header_footer" | "preprinted";

/**
 * The modes the app can render today. Full-page background and Header &
 * footer images are stored-but-not-built: resolveStationeryMode reads them as
 * Built-in until their renderers land.
 */
export type StationeryMode = "builtin" | "preprinted";

export interface StationeryModeOption {
	key: StationeryMode
	label: string
	description: string
}

/** The Stationery picker, Built-in (the default) first. */
export const STATIONERY_MODES: readonly StationeryModeOption[] = [
	{ key: "builtin", label: "Built-in", description: "The app draws your logo, header text and footer on every page." },
	{ key: "preprinted", label: "Pre-printed paper", description: "Nothing is printed around the content — blank bands are left for paper that already carries your letterhead." }
];

const MODE_KEYS = new Set<string>(STATIONERY_MODES.map((m) => m.key));

/** The stored mode, or Built-in for anything missing, unknown or not yet renderable. */
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

// A band deeper than this leaves too little page for content on A5 (210 mm tall).
export const MAX_BAND_MM = 150;

const band = (fallback: number) => z.number().finite().min(0).max(MAX_BAND_MM).catch(fallback);

const marginsSchema = (d: Readonly<StationeryMarginsMm>) => z.object({
	top: band(d.top),
	right: band(d.right),
	bottom: band(d.bottom),
	left: band(d.left)
}).catch({ ...d });

export const stationerySchema = z.object({
	preprinted: marginsSchema(PREPRINTED_DEFAULT_MARGINS)
});

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
 * The stored JSON with Pre-printed paper's top and bottom bands replaced —
 * the two the settings page edits. Everything else stored (the side bands,
 * other modes' settings) is kept, and a refused value falls back to its
 * default through the schema rather than being saved.
 */
export function setPreprintedBands(stored: string | null | undefined, bands: { top: number, bottom: number }): string {
	const current = parseStationery(stored);
	return serializeStationery(stationerySchema.parse({
		...current,
		preprinted: { ...current.preprinted, top: bands.top, bottom: bands.bottom }
	}));
}
