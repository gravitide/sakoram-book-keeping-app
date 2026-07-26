// The faces bundled with the app, in two places: app/assets/fonts (UI, via
// @font-face in main.css) and src-tauri/fonts (PDF, via Typst --font-path).
//
// Single source of truth. This list used to be duplicated in
// settings/pdf.vue and settings/appearance.vue, which meant adding a font
// was a two-file edit that could silently drift.
//
// Adding a font: drop the static TTFs into BOTH directories (see the "Why
// bundle fonts" section in CLAUDE.md — Typst needs per-weight statics, not a
// variable file), then append one row here.
//
// NOTE: the system-font list on the Appearance page is deliberately NOT here.
// Those are UI-only suggestions that may or may not exist on the machine;
// everything in this file is guaranteed present.

export interface BundledFont {
	/** Family name exactly as Typst and CSS resolve it. Case-sensitive. */
	name: string
	/** Monospaced faces are grouped separately in the pickers. */
	mono: boolean
}

export const BUNDLED_FONTS: BundledFont[] = [
	{ name: "Akt", mono: false },
	{ name: "Inter", mono: false },
	{ name: "Inter Tight", mono: false },
	{ name: "Stack Sans Text", mono: false },
	{ name: "Miriam Libre", mono: false },
	{ name: "Amarna", mono: false },
	{ name: "Iosevka Charon Mono", mono: true },
	{ name: "Martian Mono", mono: true },
	{ name: "Google Sans Code", mono: true }
];

export const BUNDLED_SANS_NAMES: string[] = BUNDLED_FONTS.filter((f) => !f.mono).map((f) => f.name);
export const BUNDLED_MONO_NAMES: string[] = BUNDLED_FONTS.filter((f) => f.mono).map((f) => f.name);

const NAMES = new Set(BUNDLED_FONTS.map((f) => f.name));

/** True when `name` is an exact bundled family name. */
export function isBundledFont(name: string | null | undefined): boolean {
	return !!name && NAMES.has(name);
}
