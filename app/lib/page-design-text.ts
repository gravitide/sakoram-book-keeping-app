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
// Pure, store-free, relative imports only (vitest).

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

/** The lines a text box prints, given the business's field values (tokenValuesFromSettings). */
export function resolveDesignText(text: string, values: Record<string, string>): string[] {
	const lines: string[] = [];
	for (const line of text.split("\n")) {
		const resolved = resolveLine(line, values);
		if (resolved !== null) lines.push(resolved);
	}
	return lines;
}
