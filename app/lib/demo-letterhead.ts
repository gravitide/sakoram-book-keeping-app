// The demo business's Stationery: a sample A4 letterhead bundled with the app,
// in two forms, and the settings that put the demo on it.
//
//   Full-page background (active) — app/assets/stationery/demo-letterhead.svg
//   Header & footer images (stored, not active) — demo-header.svg and
//     demo-footer.svg, the same letterhead's header band and footer cut out
//     as two images, so switching the demo's Stationery to Header & footer
//     images shows a finished setup rather than an empty card.
//
// All three are outlined shapes only, so they raise no live-text warning. The
// demo seed writes them into the business folder via save_business_asset,
// then saves this patch; the render check (scripts/verify-pdf-render.ts)
// renders a demo-like invoice through each.
//
// Pure, store-free, relative imports only (vitest + the render-check script).

import type { HeaderFooterSlot, StationeryMarginsMm } from "./stationery";
import { resolvePaperSize } from "./page-settings";
import { setBackgroundArtwork, setBackgroundMargins, setHeaderFooterImage, setHeaderFooterMargins } from "./stationery";
import { defaultImageRect, headerFooterMargins } from "./stationery-geometry";

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

/** Width / height of the demo header (210 × 27.2 mm) and footer (210 × 13 mm) images. */
export const DEMO_IMAGE_ASPECT: Readonly<Record<HeaderFooterSlot, number>> = { header: 210 / 27.2, footer: 210 / 13 };

/**
 * The demo's Header & footer images placed where a fresh upload lands — full
 * width, flush to its edge (stationery-geometry.ts defaultImageRect) — with
 * the letterhead's Safe area, each band pushed out of its image if it had to be.
 */
function withDemoHeaderFooter(stored: string | null | undefined): string {
	const a4 = resolvePaperSize("a4");
	const margins = { ...DEMO_LETTERHEAD_MARGINS };
	const rects = {
		header: defaultImageRect(a4, "header", DEMO_IMAGE_ASPECT.header, margins),
		footer: defaultImageRect(a4, "footer", DEMO_IMAGE_ASPECT.footer, margins)
	};
	let json = stored;
	for (const slot of ["header", "footer"] as const) {
		json = setHeaderFooterImage(json, slot, { ext: "svg", aspect: DEMO_IMAGE_ASPECT[slot], rect: rects[slot], paper: "a4", crop: null, live_text: false });
	}
	return setHeaderFooterMargins(json, headerFooterMargins(a4, rects, margins));
}

/**
 * The company_settings patch that puts a business on the demo letterhead (as
 * a Full-page background) and stores the same letterhead as Header & footer
 * images, keeping every other mode's settings.
 */
export function demoLetterheadSettings(stored: string | null | undefined): { pdf_stationery_mode: "background", pdf_stationery: string } {
	const withArtwork = setBackgroundArtwork(stored, { ext: "svg", paper: "a4", crop: null, live_text: false });
	return {
		pdf_stationery_mode: "background",
		pdf_stationery: withDemoHeaderFooter(setBackgroundMargins(withArtwork, { ...DEMO_LETTERHEAD_MARGINS }))
	};
}
