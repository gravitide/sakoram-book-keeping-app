// /settings/pdf reads top-down in three sections: the Page (paper, live
// preview, Stationery mode), the active mode's own options, then the Font.
// This module holds what those sections are called and the one-line
// summaries the mode cards print — shared by the page and the sidebar's
// in-page anchors (app/layouts/default.vue), so the two never disagree.
//
// Pure, store-free, relative imports only (vitest).

import type { StationeryMarginsMm, StationeryMode } from "./stationery";
import { formatMm } from "./stationery-geometry";

/** The element ids of the page's three sections (anchor targets, `#id`). */
export const PDF_SECTION_IDS = { page: "page", options: "mode-options", font: "font" } as const;

interface ModeOptions {
	/** The heading over the mode's cards, and the sidebar anchor's label. */
	heading: string
	/** One line under the heading. */
	blurb: string
	icon: string
}

export const MODE_OPTIONS: Readonly<Record<StationeryMode, ModeOptions>> = {
	builtin: {
		heading: "Built-in options",
		blurb: "The app draws your letterhead from the logo and text below, in the Layout you pick.",
		icon: "i-lucide-layout-template"
	},
	background: {
		heading: "Full-page background options",
		blurb: "Your background artwork is the design, so documents use the Classic layout. Your Built-in Layout is kept for when you switch back.",
		icon: "i-lucide-file-image"
	},
	header_footer: {
		heading: "Header & footer images options",
		blurb: "Your header and footer images are the design, so documents use the Classic layout. Your Built-in Layout is kept for when you switch back.",
		icon: "i-lucide-panels-top-bottom"
	},
	preprinted: {
		heading: "Pre-printed paper options",
		blurb: "Your pre-printed paper is the design, so documents use the Classic layout. Your Built-in Layout is kept for when you switch back.",
		icon: "i-lucide-printer"
	}
};

export interface PdfSettingsSection { hash: string, label: string, icon: string }

/** The sidebar's in-page anchors for /settings/pdf: Page, the mode's options, Font. */
export function pdfSettingsSections(mode: StationeryMode): PdfSettingsSection[] {
	const options = MODE_OPTIONS[mode] ?? MODE_OPTIONS.builtin;
	return [
		{ hash: `#${PDF_SECTION_IDS.page}`, label: "Page", icon: "i-lucide-file" },
		{ hash: `#${PDF_SECTION_IDS.options}`, label: options.heading, icon: options.icon },
		{ hash: `#${PDF_SECTION_IDS.font}`, label: "Font", icon: "i-lucide-type" }
	];
}

/**
 * Pre-printed paper's bands in one line: "Top 55 mm · Bottom 20 mm · Sides 18 mm",
 * or the two sides separately when they differ.
 */
export function preprintedBandSummary(m: StationeryMarginsMm): string {
	const parts = [`Top ${formatMm(m.top)} mm`, `Bottom ${formatMm(m.bottom)} mm`];
	if (formatMm(m.left) === formatMm(m.right)) parts.push(`Sides ${formatMm(m.left)} mm`);
	else parts.push(`Left ${formatMm(m.left)} mm`, `Right ${formatMm(m.right)} mm`);
	return parts.join(" · ");
}

/** A Safe area's four margins, CSS order: "Safe area 40 / 18 / 25 / 18 mm". */
export function safeAreaSummary(m: StationeryMarginsMm): string {
	return `Safe area ${[m.top, m.right, m.bottom, m.left].map(formatMm).join(" / ")} mm`;
}
