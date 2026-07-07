// Pure normalizer: TipTap/ProseMirror document JSON → a small, stable block
// tree that letter.typ renders recursively.
//
// Why a normalizer (not "hand the raw TipTap JSON to Typst"): the raw
// ProseMirror shape is broad and mark objects are verbose. We collapse it to
// exactly what the letter template needs — paragraphs, headings, and lists of
// inline runs with bold/italic/underline flags. Text stays as plain string
// values throughout, so the template never builds Typst source from user
// input (no markup-injection risk). Anything unrecognised is dropped.

export interface LetterInline {
	text: string
	bold?: boolean
	italic?: boolean
	underline?: boolean
}

export type LetterBlock
	= | { kind: "paragraph", runs: LetterInline[] }
		| { kind: "heading", level: number, runs: LetterInline[] }
		| { kind: "bullet_list" | "ordered_list", items: LetterBlock[][] };

interface PmMark { type?: string }
interface PmNode {
	type?: string
	text?: string
	attrs?: { level?: number }
	marks?: PmMark[]
	content?: PmNode[]
}

const runFromText = (node: PmNode): LetterInline => {
	const run: LetterInline = { text: node.text ?? "" };
	for (const m of node.marks ?? []) {
		if (m.type === "bold") run.bold = true;
		else if (m.type === "italic") run.italic = true;
		else if (m.type === "underline") run.underline = true;
	}
	return run;
};

const runsFrom = (content: PmNode[] | undefined): LetterInline[] =>
	(content ?? []).filter((n) => n.type === "text").map(runFromText);

// A list item's children are themselves block nodes (usually one paragraph).
const blocksFrom = (nodes: PmNode[] | undefined): LetterBlock[] => {
	const out: LetterBlock[] = [];
	for (const node of nodes ?? []) {
		switch (node.type) {
			case "paragraph":
				out.push({ kind: "paragraph", runs: runsFrom(node.content) });
				break;
			case "heading":
				out.push({ kind: "heading", level: node.attrs?.level ?? 2, runs: runsFrom(node.content) });
				break;
			case "bulletList":
				out.push({ kind: "bullet_list", items: (node.content ?? []).map((li) => blocksFrom(li.content)) });
				break;
			case "orderedList":
				out.push({ kind: "ordered_list", items: (node.content ?? []).map((li) => blocksFrom(li.content)) });
				break;
			default:
				// Unknown node (horizontalRule, image, codeBlock, …) — drop it.
				break;
		}
	}
	return out;
};

export const letterBodyToBlocks = (docJson: string): LetterBlock[] => {
	if (!docJson) return [];
	let parsed: PmNode;
	try {
		parsed = JSON.parse(docJson) as PmNode;
	} catch {
		return [];
	}
	return blocksFrom(parsed.content);
};
