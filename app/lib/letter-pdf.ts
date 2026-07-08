// Letter-PDF payload builder. Mirrors the shape of the other *-pdf.ts builders
// (voucher-pdf, statement-pdf): pure mapping from a LetterRow + settings to the
// JSON handed to `export_letter_pdf`. The rich-text body is normalised to the
// block tree letter.typ renders recursively.

import type { LetterRow } from "~/stores/letters";
import type { CompanySettingsRow } from "~/stores/settings";
import { letterBodyToBlocks } from "~/lib/letter-body";
import { pdfThemeHex } from "~/lib/theme";

export interface LetterPdfArgs {
	row: LetterRow
	settings: CompanySettingsRow | null
}

export const buildLetterPdfPayload = ({ row, settings }: LetterPdfArgs) => ({
	number: row.number || null,
	letter_date: row.letter_date,
	recipient_name: row.recipient_name || null,
	recipient_address: row.recipient_address || null,
	subject: row.subject || null,
	blocks: letterBodyToBlocks(row.body_json),
	signature_blocks: letterBodyToBlocks(row.signature_json),
	pre_printed: row.pre_printed === 1,
	preprinted_top_margin_mm: settings?.letter_preprinted_top_margin_mm ?? 55,
	theme_color: pdfThemeHex(settings),
	font_family: settings?.pdf_font ?? "Akt",
	business_name: settings?.business_name ?? null,
	website: settings?.website ?? null,
	phone: settings?.phone ?? null,
	// Address fields feed the shared footer-content (business · website · phone
	// · address) so the letter footer matches the invoice/quote footer.
	address_line1: settings?.address_line1 ?? null,
	city: settings?.city ?? null,
	logo_path: settings?.pdf_header_logo_path ?? null
});
