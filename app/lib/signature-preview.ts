// First non-empty line of text from a signature's rich-text JSON — used as the
// preview in the signatures manager. Reuses the shared block normalizer so the
// same bold/list handling applies.
import type { LetterBlock } from "./letter-body";
import { letterBodyToBlocks } from "./letter-body";

const firstText = (blocks: LetterBlock[]): string => {
	for (const b of blocks) {
		if (b.kind === "paragraph" || b.kind === "heading") {
			const t = b.runs.map((r) => r.text).join("").trim();
			if (t) return t;
		} else {
			for (const item of b.items) {
				const t = firstText(item);
				if (t) return t;
			}
		}
	}
	return "";
};

export const signaturePreview = (bodyJson: string): string => firstText(letterBodyToBlocks(bodyJson));

// Up to `max` non-empty text lines from a signature's rich text — used for the
// multi-line preview in the signature picker so the user can see the sign-off
// (e.g. name + title) before inserting it. Walks paragraphs / headings / list
// items in document order and stops once `max` lines are collected.
const collectLines = (blocks: LetterBlock[], out: string[], max: number): void => {
	for (const b of blocks) {
		if (out.length >= max) return;
		if (b.kind === "paragraph" || b.kind === "heading") {
			const t = b.runs.map((r) => r.text).join("").trim();
			if (t) out.push(t);
		} else {
			for (const item of b.items) {
				collectLines(item, out, max);
				if (out.length >= max) return;
			}
		}
	}
};

export const signaturePreviewLines = (bodyJson: string, max = 3): string[] => {
	const out: string[] = [];
	collectLines(letterBodyToBlocks(bodyJson), out, max);
	return out;
};
