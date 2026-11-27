// The demo business's page design: the Full-page background template with a
// sample A4 letterhead bundled with the app (app/assets/stationery/
// demo-letterhead.svg — outlined shapes only, so no live-text warning) in its
// slot. The demo seed writes the SVG as the slot's image file
// (stationery/item-<artworkId>.svg) and then saves the design; the render
// check (scripts/verify-pdf-render.ts) renders a demo-like invoice on it.
//
// Pure, store-free, relative imports only (vitest + the render-check script).

import type { MarginsMm, PageDesign } from "./page-design";
import { designTemplate } from "./design-templates";

/**
 * The safe area for the demo letterhead. Its header band + gold stripe end at
 * 27.2 mm and the footer's gold rule starts at 284 mm, so these leave ~10 mm
 * of air between the artwork and the content.
 */
export const DEMO_LETTERHEAD_MARGINS: Readonly<MarginsMm> = { top: 38, right: 18, bottom: 22, left: 18 };

/** The letterhead's green, used as the demo's PDF accent (pdf_theme_color). */
export const DEMO_LETTERHEAD_ACCENT = "#1f5446";

/** The demo design (A4), and the id whose image file is the sample letterhead. */
export function demoDesign(): { design: PageDesign, artworkId: string } {
	const { design } = designTemplate("background", "a4");
	const slot = design.items.find((i) => i.type === "image")!;
	const items = design.items.map((i) => (i === slot ? { ...slot, src: { kind: "file" as const, ext: "svg" as const } } : i));
	return { design: { ...design, margins: { ...DEMO_LETTERHEAD_MARGINS }, items }, artworkId: slot.id };
}
