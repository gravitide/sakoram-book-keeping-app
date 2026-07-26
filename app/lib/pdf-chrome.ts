// settings → the header_blocks / footer_blocks arrays every PDF payload carries.
//
// One implementation for nine call sites, so "is custom chrome enabled, and what
// does it resolve to" is answered in exactly one place. Pure (no Vue/Tauri).

import type { LetterBlock } from "./letter-body";
import type { CompanySettingsRow } from "~/stores/settings";
import { resolveTokens, tokenValuesFromSettings } from "./pdf-tokens";
import { richTextToBlocks } from "./rich-text";

/**
 * The page footer is a FIXED region that repeats on every page — unbounded
 * content fights the layout of the whole document, so the payload truncates
 * rather than trusting the editor to behave.
 */
export const FOOTER_MAX_BLOCKS = 3;

const build = (
	settings: CompanySettingsRow | null,
	enabled: boolean,
	text: string | null | undefined
): LetterBlock[] => {
	if (!settings || !enabled || !text) return [];
	const blocks = richTextToBlocks(text);
	if (blocks.length === 0) return [];
	return resolveTokens(blocks, tokenValuesFromSettings(settings));
};

/** Custom header block, or [] when not opted in. */
export function buildHeaderBlocks(settings: CompanySettingsRow | null): LetterBlock[] {
	return build(settings, settings?.pdf_header_custom === 1, settings?.pdf_header_text);
}

/** Custom footer strip, or [] when not opted in. Capped at FOOTER_MAX_BLOCKS. */
export function buildFooterBlocks(settings: CompanySettingsRow | null): LetterBlock[] {
	return build(settings, settings?.pdf_footer_custom === 1, settings?.pdf_footer_text).slice(0, FOOTER_MAX_BLOCKS);
}

/**
 * Flatten a block tree to plain-text lines for the settings page's A4 mock.
 *
 * A block is one line UNLESS it contains hard breaks (Shift+Enter), which
 * arrive as runs of `{ text: "", line_break: true }` — joining run text alone
 * silently collapses a four-line address into one. Marks are dropped: the mock
 * conveys arrangement, and "Preview on PDF" renders the real thing.
 */
export function blocksToPlainLines(blocks: LetterBlock[]): string[] {
	const lines: string[] = [];
	for (const b of blocks) {
		// Lists and tables carry no `runs`, and the minimal editor used for
		// header/footer text can't produce them anyway.
		if (!("runs" in b)) continue;
		let line = "";
		for (const r of b.runs) {
			if (r.line_break) {
				lines.push(line);
				line = "";
			} else {
				line += r.text;
			}
		}
		lines.push(line);
	}
	return lines.filter((s) => s.trim().length > 0);
}
