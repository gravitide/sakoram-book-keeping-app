// The one place a PDF's page geometry is decided.
//
// Every PDF payload builder (quote, invoice, bill, voucher, payslip,
// statement, report, letter, and the Settings sample preview) puts the result
// of `buildPageSettings` on its payload as `page`, and every Typst template
// hands `data.page` to the shared `page-setup` helper in common.typ. No builder
// and no template decides paper or Stationery margins on its own.
//
// Two sources of margins, on purpose (ADR 0001):
//   - `margins: null` — Built-in stationery: the Layout's own margins apply
//     (they are part of how Compact or Minimal look), so the template passes
//     its margins to `page-setup` and the helper uses them.
//   - `margins: {…}` — the Stationery owns the page: these four margins
//     bound the Safe area and the Layout only arranges content inside them.
//     That is every mode other than Built-in: Full-page background (its own
//     margins, artwork behind every page), Header & footer images (its own
//     margins, each band pushed out of its image — stationery-geometry.ts
//     headerFooterMargins) and Pre-printed paper (for the whole business or
//     for one letter — both reserve the same business-wide Pre-printed paper
//     bands).
//
// `chrome` is the matching suppression rule: only Built-in stationery draws
// the business identity (logo / wordmark, custom header text, the business
// block, the built-in or custom footer). Under any other mode the Stationery
// owns the page edges, so Layouts keep only their title, number and accent
// rule. Templates read `data.page.chrome` rather than the mode, so a new mode
// doesn't have to touch every template.
//
// The Layout is decided here too (`buildLayoutAndPage`): a Built-in choice
// only, Classic under every other Stationery (ADR 0001 amendment).
//
// Pure, store-free, relative imports only: vitest and the render-check script
// (scripts/verify-pdf-render.ts) both import it.

import type { PdfLayoutKey } from "./pdf-layouts";
import type { ArtworkExt, HeaderFooterImage, HeaderFooterPair, StationeryMarginsMm, StationeryMode } from "./stationery";
import type { CompanySettingsRow } from "~/stores/settings";
import { resolveLayoutKey } from "./pdf-layouts";
import { parseStationery, resolveStationeryMode } from "./stationery";
import { headerFooterMargins } from "./stationery-geometry";

// The Stationery's four margins are the only margins a page block carries.
export type { StationeryMarginsMm } from "./stationery";

/**
 * The business's Paper size. The stored value (company_settings.pdf_paper_size)
 * IS the Typst paper name, so no template has to map it.
 */
export type PaperSize = "a4" | "a5" | "us-letter" | "us-legal";

export interface PaperSizeOption {
	key: PaperSize
	label: string
	/** Portrait sheet width / height in millimetres. */
	widthMm: number
	heightMm: number
}

/** Every sheet a business can pick, A4 (the default) first. */
export const PAPER_SIZES: readonly PaperSizeOption[] = [
	{ key: "a4", label: "A4", widthMm: 210, heightMm: 297 },
	{ key: "a5", label: "A5", widthMm: 148, heightMm: 210 },
	{ key: "us-letter", label: "US Letter", widthMm: 215.9, heightMm: 279.4 },
	{ key: "us-legal", label: "US Legal", widthMm: 215.9, heightMm: 355.6 }
];

const DEFAULT_PAPER: PaperSizeOption = PAPER_SIZES[0]!;
const A4_WIDTH_MM = DEFAULT_PAPER.widthMm;

/** The stored paper key, or A4 for anything missing or unknown. */
export function resolvePaperSize(stored: string | null | undefined): PaperSizeOption {
	return PAPER_SIZES.find((p) => p.key === stored) ?? DEFAULT_PAPER;
}

export interface PageSettings {
	paper: PaperSize
	/**
	 * Factor applied to the Layout's own (A4-designed) margins: paper width /
	 * A4 width, so 18 mm on A4 is ~12.7 mm on A5. Exactly 1 on A4. Only used
	 * when `margins` is null — Stationery margins are never scaled. Type sizes
	 * are never scaled either; they stay fixed in points.
	 */
	margin_scale: number
	/** The Stationery mode this document renders with. */
	stationery: StationeryMode
	/**
	 * true only for Built-in stationery: the app draws the business identity
	 * (logo / wordmark, header text, business block, footer). See the header
	 * comment.
	 */
	chrome: boolean
	/** null = the Layout's built-in margins apply; see the header comment. */
	margins: StationeryMarginsMm | null
	/**
	 * Print "Page N of M". Every document, every Stationery mode; `page-setup`
	 * only draws it once the document runs past one page, so single-page PDFs
	 * stay clean. A switch rather than a constant so the render check can
	 * prove the number is the only thing it adds.
	 */
	page_numbers: boolean
	/**
	 * Where "Page N of M" sits.
	 *   "footer"    — Built-in: just above the footer, in the top of the bottom
	 *                 band. Takes no flow space, so it changes nothing else.
	 *   "safe_area" — every other mode: INSIDE the Safe area at its bottom edge,
	 *                 with room reserved for it, so it can never print over
	 *                 pre-printed paper or artwork. Content reflows by that strip.
	 */
	page_number_position: PageNumberPosition
	/**
	 * A template that asks for a landscape sheet (the customer statement, for
	 * its wide invoice table) gets one. true only for Built-in: under every
	 * other mode the Stationery is printed or drawn PORTRAIT, and turning the
	 * sheet would print across pre-printed paper or crop the artwork to a
	 * landscape band. `page-setup` applies it, so templates never check the mode.
	 */
	allow_landscape: boolean
	/**
	 * The Full-page background artwork drawn behind every page, or null (any
	 * other mode, or no artwork uploaded yet). Only the format travels: the
	 * file is always `stationery/background.<ext>` in the business folder.
	 * The Rust renderer (pdf.rs `stage_background`) copies it beside the
	 * template and adds `file`, the name Typst reads it by; a missing file
	 * comes back as null, so a moved or emptied folder renders without it.
	 */
	background: PageBackground | null
	/**
	 * Header & footer images drawn on every page at their stored place, or
	 * null (any other mode, or neither image added yet). Like the background,
	 * only the format travels — the files are `stationery/header.<ext>` and
	 * `stationery/footer.<ext>`; pdf.rs `stage_header_footer` copies them
	 * beside the template and adds each `file` (a missing file drops just that
	 * image). Positions are mm from the page's top-left corner.
	 */
	header_footer: PageHeaderFooter | null
}

export type PageNumberPosition = "footer" | "safe_area";

/** One Header & footer image as the page block carries it. */
export interface PageImage {
	ext: ArtworkExt
	x: number
	y: number
	w: number
	h: number
}

export type PageHeaderFooter = HeaderFooterPair<PageImage>;

export interface PageBackground {
	ext: ArtworkExt
}

/** Per-document override of the business's page settings. */
export interface PageSettingsOverride {
	/**
	 * This document prints onto Pre-printed paper, whatever the business's
	 * active Stationery mode (letters only, today). It reserves the business's
	 * own Pre-printed paper bands — there are no per-letter margins. false /
	 * absent = use the business's Stationery like every other document.
	 */
	preprinted?: boolean
}

type PageSettingsKey = "pdf_paper_size" | "pdf_stationery_mode" | "pdf_stationery";
type PageSettingsSource = Partial<Pick<CompanySettingsRow, PageSettingsKey>>;

const marginsFor = (mode: StationeryMode, settings: PageSettingsSource | null, paper: PaperSizeOption): StationeryMarginsMm | null => {
	if (mode === "builtin") return null;
	const stored = parseStationery(settings?.pdf_stationery);
	if (mode === "header_footer") {
		const { header, footer, margins } = stored.header_footer;
		return headerFooterMargins(paper, { header: header?.rect ?? null, footer: footer?.rect ?? null }, margins);
	}
	return { ...(mode === "background" ? stored.background.margins : stored.preprinted) };
};

const pageImage = (image: HeaderFooterImage | null): PageImage | null => (image ? { ext: image.ext, ...image.rect } : null);

const headerFooterFor = (mode: StationeryMode, settings: PageSettingsSource | null): PageHeaderFooter | null => {
	if (mode !== "header_footer") return null;
	const { header, footer } = parseStationery(settings?.pdf_stationery).header_footer;
	return header || footer ? { header: pageImage(header), footer: pageImage(footer) } : null;
};

const backgroundFor = (mode: StationeryMode, settings: PageSettingsSource | null): PageBackground | null => {
	if (mode !== "background") return null;
	const { ext } = parseStationery(settings?.pdf_stationery).background;
	return ext ? { ext } : null;
};

/**
 * `layout` + `page` for a document payload, decided together — the ONE place
 * the Layout rule lives (ADR 0001 amendment): the business's own Layout under
 * Built-in stationery, Classic under every other mode (and for a letter on
 * pre-printed paper), because the artwork or the printed paper is the design.
 * The stored Layout is never touched, so switching back to Built-in restores
 * it. `layout` defaults to the stored one; the settings page passes its
 * unsaved pick. Every builder whose template reads `data.layout` uses this.
 */
export function buildLayoutAndPage(
	settings: (PageSettingsSource & Partial<Pick<CompanySettingsRow, "pdf_layout">>) | null,
	override?: PageSettingsOverride,
	layout: string | null | undefined = settings?.pdf_layout
): { layout: PdfLayoutKey, page: PageSettings } {
	const page = buildPageSettings(settings, override);
	return { layout: page.stationery === "builtin" ? resolveLayoutKey(layout) : "classic", page };
}

export function buildPageSettings(settings: PageSettingsSource | null, override?: PageSettingsOverride): PageSettings {
	const paper = resolvePaperSize(settings?.pdf_paper_size);
	// Width is the short side for every supported sheet, so this also holds
	// for the landscape statement (decisions: margins scale on the short side).
	const margin_scale = paper.widthMm / A4_WIDTH_MM;
	const stationery = override?.preprinted ? "preprinted" : resolveStationeryMode(settings?.pdf_stationery_mode);
	const builtin = stationery === "builtin";
	return {
		paper: paper.key,
		margin_scale,
		stationery,
		chrome: builtin,
		margins: marginsFor(stationery, settings, paper),
		page_numbers: true,
		page_number_position: builtin ? "footer" : "safe_area",
		allow_landscape: builtin,
		background: backgroundFor(stationery, settings),
		header_footer: headerFooterFor(stationery, settings)
	};
}
