// The demo business's Full-page background: a sample A4 letterhead bundled
// with the app (app/assets/stationery/demo-letterhead.svg — outlined shapes
// only, so it raises no live-text warning) and the settings that switch the
// demo onto it. The demo seed writes the SVG into the business folder via
// save_business_asset, then saves this patch; the render check
// (scripts/verify-pdf-render.ts) renders a demo-like invoice through it.
//
// Pure, store-free, relative imports only (vitest + the render-check script).

import type { StationeryMarginsMm } from "./stationery";
import { setBackgroundArtwork, setBackgroundMargins } from "./stationery";

/**
 * The Safe area for the demo letterhead. Its header band + gold stripe end at
 * 27.2 mm and the footer's gold rule starts at 284 mm, so these leave ~10 mm
 * of air between the artwork and the content (and the page number).
 */
export const DEMO_LETTERHEAD_MARGINS: Readonly<StationeryMarginsMm> = { top: 38, right: 18, bottom: 22, left: 18 };

/**
 * The letterhead's green, used as the demo's PDF accent (pdf_theme_color) so
 * the Layout's rules match the artwork. The accent is a Layout setting, not
 * part of the Stationery (ADR 0001), so the seed sets it separately.
 */
export const DEMO_LETTERHEAD_ACCENT = "#1f5446";

/** The company_settings patch that puts a business on the demo letterhead, keeping every other mode's settings. */
export function demoLetterheadSettings(stored: string | null | undefined): { pdf_stationery_mode: "background", pdf_stationery: string } {
	const withArtwork = setBackgroundArtwork(stored, { ext: "svg", paper: "a4", crop: null, live_text: false });
	return {
		pdf_stationery_mode: "background",
		pdf_stationery: setBackgroundMargins(withArtwork, { ...DEMO_LETTERHEAD_MARGINS })
	};
}
