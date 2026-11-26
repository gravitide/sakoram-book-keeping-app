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
//     Today that is only a letter printed onto Pre-printed paper.
//
// Pure, store-free, relative imports only: vitest and the render-check script
// (scripts/verify-pdf-render.ts) both import it.

import type { CompanySettingsRow } from "~/stores/settings";

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

/** Page margins in millimetres. */
export interface PageMarginsMm {
	top: number
	right: number
	bottom: number
	left: number
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
	/** null = the Layout's built-in margins apply; see the header comment. */
	margins: PageMarginsMm | null
	/**
	 * Print "Page N of M". Every document, every Stationery mode; `page-setup`
	 * only draws it once the document runs past one page, so single-page PDFs
	 * stay clean. A switch rather than a constant so the render check can
	 * prove the number is the only thing it adds.
	 */
	page_numbers: boolean
}

/** Per-document override of the business's page settings. */
export interface PageSettingsOverride {
	/** This document prints onto Pre-printed paper (letters only, today). */
	preprinted?: boolean
}

type PageSettingsSource = Pick<CompanySettingsRow, "pdf_paper_size" | "letter_preprinted_top_margin_mm" | "letter_preprinted_bottom_margin_mm">;

// Pre-printed paper reserves only the top and bottom bands; the sides keep
// the classic 18 mm the letter has always used.
const PREPRINTED_SIDE_MM = 18;
const PREPRINTED_TOP_DEFAULT_MM = 55;
const PREPRINTED_BOTTOM_DEFAULT_MM = 20;

export function buildPageSettings(settings: PageSettingsSource | null, override?: PageSettingsOverride): PageSettings {
	const paper = resolvePaperSize(settings?.pdf_paper_size);
	// Width is the short side for every supported sheet, so this also holds
	// for the landscape statement (decisions: margins scale on the short side).
	const margin_scale = paper.widthMm / A4_WIDTH_MM;
	if (!override?.preprinted) return { paper: paper.key, margin_scale, margins: null, page_numbers: true };
	return {
		paper: paper.key,
		margin_scale,
		margins: {
			top: settings?.letter_preprinted_top_margin_mm ?? PREPRINTED_TOP_DEFAULT_MM,
			right: PREPRINTED_SIDE_MM,
			bottom: settings?.letter_preprinted_bottom_margin_mm ?? PREPRINTED_BOTTOM_DEFAULT_MM,
			left: PREPRINTED_SIDE_MM
		},
		page_numbers: true
	};
}
