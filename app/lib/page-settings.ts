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

/** Typst paper name. Only A4 until the business can pick a Paper size. */
export type PaperSize = "a4";

/** Page margins in millimetres. */
export interface PageMarginsMm {
	top: number
	right: number
	bottom: number
	left: number
}

export interface PageSettings {
	paper: PaperSize
	/** null = the Layout's built-in margins apply; see the header comment. */
	margins: PageMarginsMm | null
}

/** Per-document override of the business's page settings. */
export interface PageSettingsOverride {
	/** This document prints onto Pre-printed paper (letters only, today). */
	preprinted?: boolean
}

type PageSettingsSource = Pick<CompanySettingsRow, "letter_preprinted_top_margin_mm" | "letter_preprinted_bottom_margin_mm">;

// Pre-printed paper reserves only the top and bottom bands; the sides keep
// the classic 18 mm the letter has always used.
const PREPRINTED_SIDE_MM = 18;
const PREPRINTED_TOP_DEFAULT_MM = 55;
const PREPRINTED_BOTTOM_DEFAULT_MM = 20;

export function buildPageSettings(settings: PageSettingsSource | null, override?: PageSettingsOverride): PageSettings {
	if (!override?.preprinted) return { paper: "a4", margins: null };
	return {
		paper: "a4",
		margins: {
			top: settings?.letter_preprinted_top_margin_mm ?? PREPRINTED_TOP_DEFAULT_MM,
			right: PREPRINTED_SIDE_MM,
			bottom: settings?.letter_preprinted_bottom_margin_mm ?? PREPRINTED_BOTTOM_DEFAULT_MM,
			left: PREPRINTED_SIDE_MM
		}
	};
}
