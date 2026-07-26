// Shared bill-PDF payload builder.
//
// Lifted out of `app/pages/bills/[id].vue` so the bills list page can
// offer "Generate PDF" as a row action and a bulk export, without
// duplicating the field-mapping logic. Mirrors quote-pdf.ts /
// invoice-pdf.ts in shape — only the title / labels and the bills-
// specific bits (vendor invoice #, category as project_title,
// "no bank" / no prepared_by) differ.

import type { BillLineRow, BillRow, VendorSnapshot } from "~/stores/bills";
import type { CompanySettingsRow } from "~/stores/settings";
import { formatLKR, formatQty, formatRate } from "~/lib/money";
import { resolveTemplateKey } from "~/lib/pdf-templates";
import { richTextToBlocks } from "~/lib/rich-text";
import { pdfThemeHex } from "~/lib/theme";

export interface BillPdfArgs {
	row: BillRow
	lines: BillLineRow[]
	settings: CompanySettingsRow | null
	currency: { code: string, symbol: string }
	paidCents: number
	entitledToTemplates?: boolean
}

// Extract the category name from `category_snapshot` JSON; empty
// string when no category was selected at creation time. Mirrors the
// detail page's local helper so the lib stays self-contained.
const categoryNameFromSnapshot = (json: string | null): string => {
	if (!json) return "";
	try {
		return (JSON.parse(json) as { name?: string }).name ?? "";
	} catch {
		return "";
	}
};

export const buildBillPdfPayload = ({ row: b, lines, settings, currency, paidCents, entitledToTemplates = false }: BillPdfArgs) => {
	let vendor: VendorSnapshot | null = null;
	try {
		if (b.vendor_snapshot) vendor = JSON.parse(b.vendor_snapshot) as VendorSnapshot;
	} catch { /* ignore */ }

	const cityLine = [vendor?.city, vendor?.postal_code].filter(Boolean).join(" ").trim();
	const addressLines = [vendor?.address_line1, vendor?.address_line2, cityLine || null, vendor?.country]
		.filter((s): s is string => Boolean(s && s.trim()));

	const hasVat = (b.tax_cents ?? 0) !== 0;

	const fmt = (cents: number) => formatLKR(cents);
	const fmtNoSym = (cents: number) => formatLKR(cents, { withSymbol: false });

	const balanceCents = Math.max(0, b.total_cents - paidCents);
	const categoryName = categoryNameFromSnapshot(b.category_snapshot);

	// Allow per-document override of the big PDF header. Empty / null
	// falls back to the hardcoded type label; otherwise we upper-case
	// the user string. See migration 0027 + `title_override` column.
	const title = b.title_override?.trim()
		? b.title_override.trim().toUpperCase()
		: "BILL";

	return {
		kind: "bill",
		number: b.number,
		title,
		template: resolveTemplateKey(settings?.pdf_template, entitledToTemplates),
		theme_color: pdfThemeHex(settings),
		font_family: settings?.pdf_font ?? "Akt",
		currency_code: currency.code,
		currency_symbol: currency.symbol,
		primary_label: "Bill",
		date_label: "Date",
		date_value: b.issue_date,
		secondary_label: "Due date",
		secondary_value: b.due_date,
		vendor_invoice_label: b.vendor_invoice_number ? "Vendor inv #" : null,
		vendor_invoice_value: b.vendor_invoice_number ?? null,
		party_label: "Bill from",
		party: vendor
			? {
				name: vendor.name,
				tax_id: vendor.tax_id ?? null,
				address_lines: addressLines
			}
			: { name: "(no vendor)", tax_id: null, address_lines: [] },
		// Bills repurpose `project_title` to surface the category — bills
		// don't have a free-text project line, but the category is the
		// most useful thing to print directly under the number.
		project_title: categoryName ? `Category: ${categoryName}` : "",
		pricing_mode: b.pricing_mode,
		has_vat: hasVat,
		notes: b.notes ?? "",
		notes_blocks: richTextToBlocks(b.notes),
		prepared_by: "",
		prepared_by_blocks: [],
		paid_cents: paidCents > 0 ? paidCents : null,
		paid_display: paidCents > 0 ? fmtNoSym(paidCents) : null,
		balance_display: paidCents > 0 ? fmtNoSym(balanceCents) : null,
		business_name: settings?.business_name ?? null,
		website: settings?.website ?? null,
		phone: settings?.phone ?? null,
		address_line1: settings?.address_line1 ?? null,
		city: settings?.city ?? null,
		logo_scale: settings?.pdf_logo_scale ?? 100,
		logo_path: settings?.pdf_header_logo_path ?? null,
		// Bills are inbound — we don't print bank details (those belong
		// on outbound documents where the recipient needs to know where
		// to send money).
		bank: null,
		lines: lines.map((l) => ({
			item_label: l.item_label,
			description: l.description,
			qty_display: formatQty(l.quantity_milli) + (l.unit ? ` ${l.unit}` : ""),
			unit_price_display: fmtNoSym(l.unit_price_cents),
			vat_display: formatRate(l.tax_rate_basis_points),
			total_display: fmtNoSym(l.line_total_cents)
		})),
		formatted: {
			subtotal: fmt(b.subtotal_cents),
			subtotal_no_symbol: fmtNoSym(b.subtotal_cents),
			tax: fmt(b.tax_cents),
			tax_no_symbol: fmtNoSym(b.tax_cents),
			total: fmt(b.total_cents),
			total_no_symbol: fmtNoSym(b.total_cents)
		}
	};
};
