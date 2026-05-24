// Shared quote-PDF payload builder.
//
// Lifted out of `app/pages/quotes/[id].vue` so the list page can offer
// a "Generate PDF" row action without duplicating the field-mapping
// logic. The unified document.typ Typst template consumes the shape
// returned here — every field the template references is built here.

import type { BankSnapshot, ClientSnapshot, QuoteLineRow, QuoteRow } from "~/stores/quotes";
import type { CompanySettingsRow } from "~/stores/settings";
import { formatLKR, formatQty, formatRate } from "~/lib/money";
import { themeHex } from "~/lib/theme";

export interface QuotePdfArgs {
	row: QuoteRow
	lines: QuoteLineRow[]
	settings: CompanySettingsRow | null
	currency: { code: string, symbol: string }
}

export const buildQuotePdfPayload = ({ row: q, lines, settings, currency }: QuotePdfArgs) => {
	let client: ClientSnapshot | null = null;
	try {
		if (q.client_snapshot) client = JSON.parse(q.client_snapshot) as ClientSnapshot;
	} catch { /* ignore */ }

	const cityLine = [client?.city, client?.postal_code].filter(Boolean).join(" ").trim();
	const addressLines = [client?.address_line1, client?.address_line2, cityLine || null, client?.country]
		.filter((s): s is string => Boolean(s && s.trim()));

	const hasVat = (q.tax_cents ?? 0) !== 0;

	let bank: BankSnapshot | null = null;
	try {
		if (q.bank_details_snapshot) bank = JSON.parse(q.bank_details_snapshot) as BankSnapshot;
	} catch { /* ignore */ }

	const fmt = (cents: number) => formatLKR(cents);
	const fmtNoSym = (cents: number) => formatLKR(cents, { withSymbol: false });

	return {
		kind: "quote",
		number: q.number,
		title: "QUOTATION",
		theme_color: themeHex(settings?.theme_color),
		font_family: settings?.pdf_font ?? "Akt",
		currency_code: currency.code,
		currency_symbol: currency.symbol,
		primary_label: "Quote",
		date_label: "Date",
		date_value: q.issue_date,
		secondary_label: "Valid till",
		secondary_value: q.valid_until,
		vendor_invoice_label: null,
		vendor_invoice_value: null,
		party_label: "Quote to",
		party: client
			? {
				name: client.name,
				tax_id: client.tax_id ?? null,
				address_lines: addressLines
			}
			: { name: "(no client)", tax_id: null, address_lines: [] },
		project_title: q.project_title || "",
		pricing_mode: q.pricing_mode,
		has_vat: hasVat,
		notes: q.notes ?? "",
		notes_paragraphs: (q.notes ?? "").split(/\n\s*\n/).filter((p) => p.trim().length > 0),
		prepared_by: q.prepared_by ?? "",
		// Quotes don't have payments — null suppresses the paid/balance row.
		paid_cents: null,
		paid_display: null,
		balance_display: null,
		business_name: settings?.business_name ?? null,
		website: settings?.website ?? null,
		phone: settings?.phone ?? null,
		address_line1: settings?.address_line1 ?? null,
		city: settings?.city ?? null,
		logo_path: settings?.pdf_header_logo_path ?? null,
		bank,
		lines: lines.map((l) => ({
			item_label: l.item_label,
			description: l.description,
			qty_display: formatQty(l.quantity_milli) + (l.unit ? ` ${l.unit}` : ""),
			unit_price_display: fmtNoSym(l.unit_price_cents),
			vat_display: formatRate(l.tax_rate_basis_points),
			total_display: fmtNoSym(l.line_total_cents)
		})),
		formatted: {
			subtotal: fmt(q.subtotal_cents),
			subtotal_no_symbol: fmtNoSym(q.subtotal_cents),
			tax: fmt(q.tax_cents),
			tax_no_symbol: fmtNoSym(q.tax_cents),
			total: fmt(q.total_cents),
			total_no_symbol: fmtNoSym(q.total_cents)
		}
	};
};
