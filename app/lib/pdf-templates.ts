// Registry of client-facing PDF templates + the entitlement-aware key resolver.
// Pure (no Vue/Tauri) so it's unit-testable in node. The Rust registry in
// `src-tauri/src/pdf.rs` is the actual render-time validator (unknown key →
// classic); this list drives the Settings picker and the `resolveTemplateKey`
// allow-list.

export interface PdfTemplateMeta {
	key: string
	label: string
	description: string
}

export const PDF_TEMPLATES: PdfTemplateMeta[] = [
	{ key: "classic", label: "Classic", description: "Logo top-right, accent rule, centred title. The default." },
	{ key: "modern", label: "Modern", description: "Full-width header band in your theme colour, logo + title reversed in white." },
	{ key: "minimal", label: "Minimal", description: "No rules or fills, generous whitespace, light type. Clean in black & white." },
	{ key: "compact", label: "Compact", description: "Tighter margins and smaller type so long itemised documents fit on fewer pages." },
	{ key: "letterhead", label: "Letterhead", description: "Leaves the top blank for pre-printed stationery; no logo block." }
];

const KEYS = new Set(PDF_TEMPLATES.map((t) => t.key));

/**
 * The template key to render with. A Plus feature: when the user isn't
 * entitled, always render `classic` (so a downgrade keeps their stored choice
 * but reverts the output). Unknown / null stored keys also fall back.
 */
export function resolveTemplateKey(stored: string | null | undefined, entitled: boolean): string {
	if (!entitled) return "classic";
	if (stored && KEYS.has(stored)) return stored;
	return "classic";
}
