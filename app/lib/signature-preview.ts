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
