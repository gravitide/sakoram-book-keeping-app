// {field} tokens for the customizable PDF header / footer.
//
// Substitution runs over the NORMALISED BLOCK TREE rather than the raw stored
// string, so a token sitting inside a bold run comes out bold — replacing text
// before parsing would lose that. Pure (no Vue/Tauri) so it unit-tests in node.
//
// Why tokens exist at all: without them a user's contact details would live in
// two places, and the PDF would silently go stale the day they update Business
// details. With them, Business details stays the single source of truth.

import type { LetterBlock, LetterInline } from "./letter-body";
import type { CompanySettingsRow } from "~/stores/settings";

export interface PdfToken {
	/** Literal placeholder as typed, braces included. */
	token: string
	/** Human label for the Insert-field menu. */
	label: string
}

export const PDF_TOKENS: PdfToken[] = [
	{ token: "{business_name}", label: "Business name" },
	{ token: "{address}", label: "Address line" },
	{ token: "{city}", label: "City" },
	{ token: "{phone}", label: "Phone" },
	{ token: "{email}", label: "Email" },
	{ token: "{website}", label: "Website" },
	{ token: "{tax_id}", label: "Tax ID" }
];

/** Token key (no braces) → its current value. Missing values become "". */
export function tokenValuesFromSettings(settings: CompanySettingsRow | null): Record<string, string> {
	return {
		business_name: settings?.business_name ?? "",
		address: settings?.address_line1 ?? "",
		city: settings?.city ?? "",
		phone: settings?.phone ?? "",
		email: settings?.email ?? "",
		website: settings?.website ?? "",
		tax_id: settings?.tax_id ?? ""
	};
}

// Only substitutes keys we know about: an unrecognised {token} is left exactly
// as typed, so a typo shows up in the PDF instead of silently eating text.
const substitute = (text: string, values: Record<string, string>): string =>
	text.replace(/\{([a-z_]+)\}/g, (whole, key: string) =>
		(Object.prototype.hasOwnProperty.call(values, key) ? values[key]! : whole));

const resolveRuns = (runs: LetterInline[], values: Record<string, string>): LetterInline[] =>
	runs.map((r) => (r.text ? { ...r, text: substitute(r.text, values) } : { ...r }));

/** Substitute tokens throughout a block tree. Returns a new tree. */
export function resolveTokens(blocks: LetterBlock[], values: Record<string, string>): LetterBlock[] {
	return blocks.map((b) => {
		if (b.kind === "paragraph" || b.kind === "heading") {
			return { ...b, runs: resolveRuns(b.runs, values) };
		}
		if (b.kind === "bullet_list" || b.kind === "ordered_list") {
			return { ...b, items: b.items.map((item) => resolveTokens(item, values)) };
		}
		if (b.kind === "table") {
			return {
				...b,
				rows: b.rows.map((row) => row.map((cell) => ({ ...cell, blocks: resolveTokens(cell.blocks, values) })))
			};
		}
		return b;
	});
}
