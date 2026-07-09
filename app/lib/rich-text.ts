// Shared rich-text → block-tree normalizer for document Notes.
//
// Notes on quotes / invoices / bills started life as plain-text columns and
// were upgraded in-place to rich text (the RichTextEditor writes TipTap JSON
// back to the same column). So a given row's `notes` value may be EITHER
// TipTap/ProseMirror JSON (edited under the new editor) OR legacy plain text
// (never touched since the upgrade). This normalizer accepts both and returns
// the same `LetterBlock[]` shape the Typst templates already render via
// `render-blocks` — so the PDF looks right regardless of which form is stored.
//
// The JSON path reuses `letterBodyToBlocks` (identical block shape). The
// plain-text path mirrors the editor's own `parseDoc` fallback: one paragraph
// per line, so nothing is lost and hard line breaks survive.

import type { LetterBlock } from "./letter-body";
import { letterBodyToBlocks } from "./letter-body";

const plainTextToBlocks = (value: string): LetterBlock[] =>
	value.split("\n").map((line) => ({
		kind: "paragraph",
		runs: line.length > 0 ? [{ text: line }] : []
	}));

export const richTextToBlocks = (value: string | null | undefined): LetterBlock[] => {
	if (!value) return [];
	const trimmed = value.trim();
	// A TipTap document always serialises to an object starting with `{`. Try
	// the JSON path first; if it yields nothing usable, fall back to plain text
	// (covers `{`-leading strings that aren't actually a ProseMirror doc).
	if (trimmed.startsWith("{")) {
		const blocks = letterBodyToBlocks(value);
		if (blocks.length > 0) return blocks;
	}
	return plainTextToBlocks(value);
};
