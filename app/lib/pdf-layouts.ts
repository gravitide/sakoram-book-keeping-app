// Registry of the client-facing PDF Layouts + the stored-key resolver.
//
// A Layout is how a document's own content (title, details block, line
// table, totals) is arranged inside the Safe area — independent of the
// Stationery drawn around it (GLOSSARY.md, ADR 0001). It replaced the old
// "template" key in migration 0055; the retired `letterhead` template became
// Classic + Pre-printed paper Stationery.
//
// Pure (no Vue/Tauri) so it's unit-testable in node. The Rust registry
// (`layout_template` in src-tauri/src/pdf.rs) is the actual render-time
// validator (unknown key → classic); pdf-layouts.test.ts keeps the two in step.

export type PdfLayoutKey = "classic" | "modern" | "minimal" | "compact";

export interface PdfLayoutMeta {
	key: PdfLayoutKey
	label: string
	description: string
}

export const PDF_LAYOUTS: readonly PdfLayoutMeta[] = [
	{ key: "classic", label: "Classic", description: "Logo top-right, accent rule, centred title. The default." },
	{ key: "modern", label: "Modern", description: "Left-aligned header: logo beside your header text, over a tapered accent rule." },
	{ key: "minimal", label: "Minimal", description: "No rules or fills, generous whitespace, light type. Clean in black & white." },
	{ key: "compact", label: "Compact", description: "Tighter margins and smaller type so long itemised documents fit on fewer pages." }
];

const KEYS = new Set<string>(PDF_LAYOUTS.map((l) => l.key));

/**
 * The Layout to render with: the stored key when it is a known Layout,
 * otherwise `classic` (covers null / unknown / the retired `letterhead`).
 */
export function resolveLayoutKey(stored: string | null | undefined): PdfLayoutKey {
	if (stored && KEYS.has(stored)) return stored as PdfLayoutKey;
	return "classic";
}
