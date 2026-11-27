// The sheets a business can print on. Its own module so the page design
// (page-design.ts) and the payload builder (page-settings.ts, which re-exports
// these) can both use it without importing each other.
//
// Pure, store-free, relative imports only (vitest).

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

/** The stored paper key, or A4 for anything missing or unknown. */
export function resolvePaperSize(stored: string | null | undefined): PaperSizeOption {
	return PAPER_SIZES.find((p) => p.key === stored) ?? DEFAULT_PAPER;
}
