// Pure normalizer: TipTap/ProseMirror document JSON → a small, stable block
// tree that letter.typ renders recursively.
//
// Why a normalizer (not "hand the raw TipTap JSON to Typst"): the raw
// ProseMirror shape is broad and mark objects are verbose. We collapse it to
// exactly what the letter template needs — paragraphs, headings, lists, code
// blocks, and blockquotes, as inline runs with bold/italic/underline flags.
// Text stays as plain string values throughout, so the template never builds
// Typst source from user input (no markup-injection risk). Only nodes with no
// printable text (horizontalRule, image, …) are dropped.

export interface LetterInline {
	text: string
	bold?: boolean
	italic?: boolean
	underline?: boolean
	/** Hex colour (e.g. "#dc2626") from the TextStyle mark. */
	color?: string
	/** Font size in POINTS, converted from the editor's CSS px. */
	fontSizePt?: number
	/** A hard line break (Shift+Enter) — rendered as a linebreak, not text. */
	line_break?: boolean
}

export type LetterAlign = "left" | "center" | "right" | "justify";

// One table cell: its own block tree, whether it's a header cell, and any
// merge spans (only present when > 1). Cells arrive in row-major order and
// merged regions store their span on the anchor cell only (covered slots are
// omitted) — which is exactly what Typst's `table.cell(colspan/rowspan)` wants.
export interface LetterTableCell {
	blocks: LetterBlock[]
	header?: boolean
	colspan?: number
	rowspan?: number
}

export type LetterBlock
	= | { kind: "paragraph", runs: LetterInline[], align?: LetterAlign }
		| { kind: "heading", level: number, runs: LetterInline[], align?: LetterAlign }
		| { kind: "bullet_list" | "ordered_list", items: LetterBlock[][] }
		| { kind: "table", rows: LetterTableCell[][] };

interface PmMark { type?: string, attrs?: { color?: string, fontSize?: string } }
interface PmNode {
	type?: string
	text?: string
	attrs?: { level?: number, textAlign?: string, colspan?: number, rowspan?: number }
	marks?: PmMark[]
	content?: PmNode[]
}

// Convert the editor's CSS font size ("18px") to Typst points. Browsers render
// at 96dpi where 1pt = 1.333px, so pt = px * 0.75. Returns undefined for
// anything we can't parse (leaves the block at the default body size).
const cssPxToPt = (css: string | undefined): number | undefined => {
	if (!css) return undefined;
	const m = /^(\d+(?:\.\d+)?)px$/.exec(css.trim());
	if (!m) return undefined;
	return Math.round(Number(m[1]) * 0.75 * 100) / 100;
};

// Normalise a CSS colour to a hex string Typst's `rgb()` accepts. The editor's
// palette writes hex, but a colour can also arrive as `rgb(r, g, b)` — browsers
// normalise an inline `style="color:…"` to that form, so pasted or DOM
// round-tripped runs carry `rgb(107, 114, 128)` rather than `#6b7280`. Typst's
// `rgb("rgb(…)")` throws "color string contains non-hexadecimal letters", which
// fails the whole PDF. So: pass hex through, convert rgb()/rgba() to hex, and
// drop anything else (named colours etc.) so the run just renders default.
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const toHex2 = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const normalizeColor = (raw: string | undefined): string | undefined => {
	if (!raw) return undefined;
	const s = raw.trim();
	if (HEX_RE.test(s)) return s;
	const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(s);
	if (m) return `#${toHex2(Number(m[1]))}${toHex2(Number(m[2]))}${toHex2(Number(m[3]))}`;
	return undefined;
};

// TipTap's TextAlign stores the alignment on the block node's attrs. We only
// carry a non-default alignment through (left is the default — omitting it
// keeps the block tree + PDF clean).
const alignFrom = (node: PmNode): LetterAlign | undefined => {
	const a = node.attrs?.textAlign;
	return a === "center" || a === "right" || a === "justify" ? a : undefined;
};

const runFromText = (node: PmNode): LetterInline => {
	const run: LetterInline = { text: node.text ?? "" };
	for (const m of node.marks ?? []) {
		if (m.type === "bold") {
			run.bold = true;
		} else if (m.type === "italic") {
			run.italic = true;
		} else if (m.type === "underline") {
			run.underline = true;
		} else if (m.type === "textStyle") {
			const col = normalizeColor(m.attrs?.color);
			if (col) run.color = col;
			const pt = cssPxToPt(m.attrs?.fontSize);
			if (pt !== undefined) run.fontSizePt = pt;
		}
	}
	return run;
};

// Keep text runs; turn inline hard breaks (Shift+Enter) into an explicit break
// run so multi-line paragraphs survive. Anything else inline is dropped.
const runsFrom = (content: PmNode[] | undefined): LetterInline[] =>
	(content ?? []).flatMap((n) => {
		if (n.type === "text") return [runFromText(n)];
		if (n.type === "hardBreak") return [{ text: "", line_break: true }];
		return [];
	});

// A list item's children are themselves block nodes (usually one paragraph).
const blocksFrom = (nodes: PmNode[] | undefined): LetterBlock[] => {
	const out: LetterBlock[] = [];
	for (const node of nodes ?? []) {
		switch (node.type) {
			case "paragraph": {
				const align = alignFrom(node);
				out.push(align ? { kind: "paragraph", runs: runsFrom(node.content), align } : { kind: "paragraph", runs: runsFrom(node.content) });
				break;
			}
			case "heading": {
				const align = alignFrom(node);
				const level = node.attrs?.level ?? 2;
				out.push(align ? { kind: "heading", level, runs: runsFrom(node.content), align } : { kind: "heading", level, runs: runsFrom(node.content) });
				break;
			}
			case "bulletList":
				out.push({ kind: "bullet_list", items: (node.content ?? []).map((li) => blocksFrom(li.content)) });
				break;
			case "orderedList":
				out.push({ kind: "ordered_list", items: (node.content ?? []).map((li) => blocksFrom(li.content)) });
				break;
			case "codeBlock": {
				// A fenced / ``` code block. Its text lives in text nodes with
				// newlines (and/or hardBreaks) between lines. Emit one paragraph
				// per line so the content renders instead of being dropped — the
				// single biggest silent-drop hazard for pasted technical text.
				const raw = (node.content ?? [])
					.map((n) => (n.type === "hardBreak" ? "\n" : (n.text ?? "")))
					.join("");
				for (const line of raw.split("\n")) {
					out.push({ kind: "paragraph", runs: line.length > 0 ? [{ text: line }] : [] });
				}
				break;
			}
			case "blockquote":
				// Flatten the quote's inner blocks in place (we don't render a
				// quote bar, but the text must survive).
				out.push(...blocksFrom(node.content));
				break;
			case "table": {
				const rows = (node.content ?? []).map((row) =>
					(row.content ?? []).map((cell): LetterTableCell => {
						const c: LetterTableCell = { blocks: blocksFrom(cell.content) };
						if (cell.type === "tableHeader") c.header = true;
						const cs = cell.attrs?.colspan;
						const rs = cell.attrs?.rowspan;
						if (typeof cs === "number" && cs > 1) c.colspan = cs;
						if (typeof rs === "number" && rs > 1) c.rowspan = rs;
						return c;
					}));
				out.push({ kind: "table", rows });
				break;
			}
			default:
				// Unknown node (horizontalRule, image, …) — nothing to render.
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
