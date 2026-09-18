// Shared invoice-PDF payload builder.
//
// Lifted out of `app/pages/invoices/[id].vue` so the list page can
// offer a "Generate PDF" row action without duplicating the field-
// mapping logic. Mirrors quote-pdf.ts in shape — only the title /
// label values and the paid/balance fields differ.

import type { InvoiceLineRow, InvoiceRow } from "~/stores/invoices";
import type { BankSnapshot, ClientSnapshot } from "~/stores/quotes";
import type { CompanySettingsRow } from "~/stores/settings";
import { formatLKR, formatQty, formatRate } from "./money";
import { buildFooterBlocks, buildHeaderBlocks } from "./pdf-chrome";
import { resolveTemplateKey } from "./pdf-templates";
import { richTextToBlocks } from "./rich-text";
import { pdfThemeHex } from "./theme";

export interface InvoicePdfArgs {
	row: InvoiceRow
	lines: InvoiceLineRow[]
	settings: CompanySettingsRow | null
	currency: { code: string, symbol: string }
	paidCents: number
	/**
	 * Issued credit notes settled against this invoice (creditedCentsFor /
	 *  the row's `_credited`). Optional so older call sites keep compiling,
	 *  but every caller should pass it — the balance is wrong without it.
	 */
	creditedCents?: number
	/**
	 * Whether the business may use non-Classic templates (Plus feature). When
	 *  false, the payload's `template` is forced to "classic".
	 */
	entitledToTemplates?: boolean
}

export const buildInvoicePdfPayload = ({ row: inv, lines, settings, currency, paidCents, creditedCents = 0, entitledToTemplates = false }: InvoicePdfArgs) => {
	let client: ClientSnapshot | null = null;
	try {
		if (inv.client_snapshot) client = JSON.parse(inv.client_snapshot) as ClientSnapshot;
	} catch { /* ignore */ }

	const cityLine = [client?.city, client?.postal_code].filter(Boolean).join(" ").trim();
	const addressLines = [client?.address_line1, client?.address_line2, cityLine || null, client?.country]
		.filter((s): s is string => Boolean(s && s.trim()));

	const hasVat = (inv.tax_cents ?? 0) !== 0;

	let bank: BankSnapshot | null = null;
	try {
		if (inv.bank_details_snapshot) bank = JSON.parse(inv.bank_details_snapshot) as BankSnapshot;
	} catch { /* ignore */ }

	const fmt = (cents: number) => formatLKR(cents);
	const fmtNoSym = (cents: number) => formatLKR(cents, { withSymbol: false });

	// total − receipts − issued credit notes, floored at zero. This is one of
	// the mirrored balance sites (see "Invoice balance is computed in…" in
	// CLAUDE.md) — it used to subtract receipts only, so a credited invoice
	// went out to the client showing its full total as still due.
	const balanceCents = Math.max(0, inv.total_cents - paidCents - creditedCents);
	const settled = paidCents > 0 || creditedCents > 0;

	// Allow per-document override of the big PDF header. Empty / null
	// falls back to the hardcoded type label; otherwise we upper-case
	// the user string. See migration 0027 + `title_override` column.
	const title = inv.title_override?.trim()
		? inv.title_override.trim().toUpperCase()
		: "INVOICE";

	return {
		kind: "invoice",
		number: inv.number,
		title,
		template: resolveTemplateKey(settings?.pdf_template, entitledToTemplates),
		theme_color: pdfThemeHex(settings),
		font_family: settings?.pdf_font ?? "Akt",
		currency_code: currency.code,
		currency_symbol: currency.symbol,
		primary_label: "Invoice",
		date_label: "Date",
		date_value: inv.issue_date,
		secondary_label: "Due date",
		secondary_value: inv.due_date,
		vendor_invoice_label: null,
		vendor_invoice_value: null,
		party_label: "Bill to",
		party: client
			? {
				name: client.name,
				tax_id: client.tax_id ?? null,
				address_lines: addressLines
			}
			: { name: "(no client)", tax_id: null, address_lines: [] },
		project_title: inv.project_title || "",
		pricing_mode: inv.pricing_mode,
		has_vat: hasVat,
		notes: inv.notes ?? "",
		notes_blocks: richTextToBlocks(inv.notes),
		prepared_by: inv.prepared_by ?? "",
		prepared_by_blocks: richTextToBlocks(inv.prepared_by),
		// Show the settlement block only once something has been paid OR
		// credited; nulls suppress it entirely on a freshly-issued invoice.
		// Paid / Credited rows are each independent; Balance shows with either.
		paid_cents: paidCents > 0 ? paidCents : null,
		paid_display: paidCents > 0 ? fmtNoSym(paidCents) : null,
		credited_cents: creditedCents > 0 ? creditedCents : null,
		credited_display: creditedCents > 0 ? fmtNoSym(creditedCents) : null,
		balance_display: settled ? fmtNoSym(balanceCents) : null,
		business_name: settings?.business_name ?? null,
		website: settings?.website ?? null,
		phone: settings?.phone ?? null,
		address_line1: settings?.address_line1 ?? null,
		city: settings?.city ?? null,
		logo_scale: settings?.pdf_logo_scale ?? 100,
		header_blocks: buildHeaderBlocks(settings),
		footer_blocks: buildFooterBlocks(settings),
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
			subtotal: fmt(inv.subtotal_cents),
			subtotal_no_symbol: fmtNoSym(inv.subtotal_cents),
			tax: fmt(inv.tax_cents),
			tax_no_symbol: fmtNoSym(inv.tax_cents),
			total: fmt(inv.total_cents),
			total_no_symbol: fmtNoSym(inv.total_cents)
		}
	};
};
