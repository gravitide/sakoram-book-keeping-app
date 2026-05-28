// Minimal CSV parser. Handles quoted fields (with embedded commas
// and escaped quotes ""), CR/LF/CRLF line endings, empty fields,
// and a UTF-8 BOM. Returns { headers, rows } with rows as string
// arrays — type coercion is the caller's job.
//
// Deliberately no new dependency — this is ~50 lines and covers
// every shape SL bank CSVs throw at it.

export interface ParsedCsv {
	headers: string[]
	rows: string[][]
}

export const parseCsv = (input: string): ParsedCsv => {
	// Strip UTF-8 BOM if present.
	let src = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
	// Normalise line endings.
	src = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

	const tokens: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	let i = 0;

	while (i < src.length) {
		const ch = src[i];

		if (inQuotes) {
			if (ch === "\"") {
				// Escaped quote ("") inside a quoted field
				if (src[i + 1] === "\"") {
					field += "\"";
					i += 2;
					continue;
				}
				// End of quoted field
				inQuotes = false;
				i += 1;
				continue;
			}
			field += ch;
			i += 1;
			continue;
		}

		if (ch === "\"") {
			inQuotes = true;
			i += 1;
			continue;
		}
		if (ch === ",") {
			row.push(field);
			field = "";
			i += 1;
			continue;
		}
		if (ch === "\n") {
			row.push(field);
			tokens.push(row);
			row = [];
			field = "";
			i += 1;
			continue;
		}
		field += ch;
		i += 1;
	}

	// Flush any trailing field/row (no final newline).
	if (field !== "" || row.length > 0) {
		row.push(field);
		tokens.push(row);
	}

	if (tokens.length === 0) return { headers: [], rows: [] };
	const [headers, ...rows] = tokens;
	// Drop fully-empty trailing rows (a trailing newline produces a [""] row).
	const cleaned = rows.filter((r) => !(r.length === 1 && r[0] === ""));
	return { headers: headers ?? [], rows: cleaned };
};
