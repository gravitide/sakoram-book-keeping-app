// A design text box's printed lines: its {field} tokens (app/lib/pdf-tokens.ts)
// filled from Company settings, with the lines an empty field would leave
// half-written taken out.
//
// - A line with at least one known field, all of them empty, is dropped —
//   label and all ("Web: {website}" for a business with no website).
// - Otherwise the fields are filled and the separators (· | ,) an empty field
//   leaves behind are collapsed and trimmed: "{address}, {city}" with no
//   address prints "Colombo", not ", Colombo".
// - Lines without fields are printed exactly as typed, blank ones included.
// - An unknown {token} is left as typed, like pdf-tokens.ts does.
//
// The designer asks to keep the lines a PDF would drop (`keepEmpty`): they come
// back faded, each empty field shown as its label ("Website"), so the text box
// can still be seen and selected.
//
// Pure, store-free, relative imports only (vitest).

import { PDF_TOKENS } from "./pdf-tokens";

/** One printed line of a text box; `faded` only in the designer, for a line PDFs leave out. */
export interface DesignLine { text: string, faded: boolean }

/** Field key → its label ("website" → "Website"). */
const LABELS: Record<string, string> = Object.fromEntries(PDF_TOKENS.map((t) => [t.token.slice(1, -1), t.label]));

const TOKEN = /\{([a-z_]+)\}/g;
const SEPARATOR_RUN = /([·|,])(?:\s*[·|,])+/g;
const EDGE_SEPARATORS = /^[\s·|,]+|[\s·|,]+$/g;

const isKnown = (values: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(values, key);

function resolveLine(line: string, values: Record<string, string>): string | null {
	const keys = [...line.matchAll(TOKEN)].map((m) => m[1]!).filter((k) => isKnown(values, k));
	if (keys.length === 0) return line;
	if (keys.every((k) => values[k]!.trim() === "")) return null;
	const filled = line.replace(TOKEN, (whole, key: string) => (isKnown(values, key) ? values[key]!.trim() : whole));
	return filled.replace(SEPARATOR_RUN, "$1").replace(EDGE_SEPARATORS, "");
}

/**
 * A text box's lines, given the business's field values
 * (tokenValuesFromSettings). With `keepEmpty`, a line a PDF would drop is kept,
 * faded, its fields shown as their labels.
 */
export function resolveDesignLines(text: string, values: Record<string, string>, opts: { keepEmpty?: boolean } = {}): DesignLine[] {
	const lines: DesignLine[] = [];
	for (const line of text.split("\n")) {
		const resolved = resolveLine(line, values);
		if (resolved !== null) lines.push({ text: resolved, faded: false });
		else if (opts.keepEmpty) lines.push({ text: line.replace(TOKEN, (whole, key: string) => LABELS[key] ?? whole), faded: true });
	}
	return lines;
}

/** `token` typed into `text` over the selection [start, end); the caret goes right after it. */
export function insertToken(text: string, start: number, end: number, token: string): { text: string, caret: number } {
	return { text: text.slice(0, start) + token + text.slice(end), caret: start + token.length };
}

/** The lines a text box prints, given the business's field values (tokenValuesFromSettings). */
export function resolveDesignText(text: string, values: Record<string, string>): string[] {
	return resolveDesignLines(text, values).map((l) => l.text);
}
