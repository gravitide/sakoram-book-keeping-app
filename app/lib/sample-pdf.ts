// Sample-document payload builders for the Settings → PDF Layout preview.
// They mirror the shape produced by `buildInvoicePdfPayload` /
// `buildQuotePdfPayload` (every field the Typst templates reference) but with
// hardcoded, realistic fake data — so the preview renders the chosen Layout
// without touching the database. Theme colour / font / logo / business contact
// come from the live settings so the preview reflects the user's branding.

import type { PageSettings, PageSettingsOverride } from "./page-settings";
import type { PdfLayoutKey } from "./pdf-layouts";
import type { CompanySettingsRow } from "~/stores/settings";
import { computeLineTotals, formatMoney, formatQty } from "./money";
import { buildLayoutAndPage, resolvePaperSize } from "./page-settings";
import { pdfThemeHex } from "./theme";

interface SampleCurrency {
	code: string
	symbol: string
}

const SAMPLE_LINES = [
	{ item_label: "Website design", description: "Homepage + 3 inner pages", qty_display: "1.000", unit_price_display: "60,000.00", vat_display: "18%", total_display: "70,800.00" },
	{ item_label: "Development", description: "Frontend build + CMS", qty_display: "1.000", unit_price_display: "150,000.00", vat_display: "18%", total_display: "177,000.00" },
	{ item_label: "Hosting (1 year)", description: "Managed hosting & SSL", qty_display: "1.000", unit_price_display: "24,000.00", vat_display: "18%", total_display: "28,320.00" }
];

const SAMPLE_FORMATTED = {
	subtotal: "Rs 234,000.00",
	subtotal_no_symbol: "234,000.00",
	tax: "Rs 42,120.00",
	tax_no_symbol: "42,120.00",
	total: "Rs 276,120.00",
	total_no_symbol: "276,120.00"
};

function base(settings: CompanySettingsRow | null, currency: SampleCurrency, layoutKey: PdfLayoutKey, override?: PageSettingsOverride) {
	return {
		// The picked Document style, on the business's page design.
		...buildLayoutAndPage(settings, override, layoutKey),
		theme_color: pdfThemeHex(settings),
		font_family: settings?.pdf_font ?? "Akt",
		currency_code: currency.code,
		currency_symbol: currency.symbol,
		vendor_invoice_label: null,
		vendor_invoice_value: null,
		party_label: "Bill to",
		party: {
			name: "Acme (Pvt) Ltd",
			tax_id: "134567890-7000",
			address_lines: ["12 Marine Drive", "Colombo 03", "Sri Lanka"]
		},
		pricing_mode: "itemized",
		has_vat: true,
		notes: "Thank you for your business.",
		notes_blocks: [{ kind: "paragraph", runs: [{ text: "Thank you for your business." }] }],
		prepared_by: settings?.business_name ?? "Your Business",
		prepared_by_blocks: [{ kind: "paragraph", runs: [{ text: settings?.business_name ?? "Your Business" }] }],
		business_name: settings?.business_name ?? "Your Business",
		website: settings?.website ?? "yourbusiness.lk",
		phone: settings?.phone ?? "+94 11 234 5678",
		address_line1: settings?.address_line1 ?? "42 Galle Road",
		city: settings?.city ?? "Colombo",
		logo_path: settings?.logo_path ?? null,
		bank: {
			bank_account_number: "0011 2233 4455",
			bank_account_name: settings?.business_name ?? "Your Business",
			bank_name: "Sampath Bank",
			bank_branch: "Colombo"
		},
		lines: SAMPLE_LINES.map((l) => ({ ...l })),
		formatted: { ...SAMPLE_FORMATTED }
	};
}

export function sampleInvoicePayload(settings: CompanySettingsRow | null, currency: SampleCurrency, layoutKey: PdfLayoutKey) {
	return {
		...base(settings, currency, layoutKey),
		kind: "invoice",
		number: "INV-2026-0042",
		title: "INVOICE",
		primary_label: "Invoice",
		date_label: "Date",
		date_value: "2026-06-22",
		secondary_label: "Due date",
		secondary_value: "2026-07-22",
		project_title: "Website redesign",
		paid_cents: 5000000,
		paid_display: "50,000.00",
		balance_display: "226,120.00"
	};
}

// ---- Stationery preview sample ----------------------------------------
// The Stationery editor's "Preview sample invoice": a made-up invoice long
// enough to run onto a SECOND page — and no further — so the user sees the
// continuation page, the artwork / bands repeated on it and "Page 2 of 2".
//
// A fixed line count can't do that: the same 25 lines are one page on US
// Legal with shallow bands and three on A5 with a deep letterhead band. So the
// count follows the Safe area's height, aiming the document at about one and
// a half pages — half a page of slack either way before it would drop to one
// page or spill onto a third. scripts/verify-pdf-render.ts renders it on every
// Layout × Paper size × Stationery mode and fails unless it is exactly two
// pages; recalibrate the constants below if that check fails.

// Height (mm) the invoice takes besides its lines — title, party and details
// block, totals, bank details, notes, sign-off — and the height of one line
// (an average: every third line carries a description under its label).
// Measured from real renders, not derived.
const SAMPLE_FIXED_MM = 175;
const SAMPLE_LINE_MM = 9;
const SAMPLE_MAX_LINES = 80;

/** How tall the design's safe area is on one page of the business's paper (mm). */
function safeAreaHeightMm(page: PageSettings): number {
	return resolvePaperSize(page.paper).heightMm - page.margins.top - page.margins.bottom;
}

/** Lines that put the sample at about one and a half pages. */
function previewLineCount(page: PageSettings): number {
	const n = Math.round((1.5 * safeAreaHeightMm(page) - SAMPLE_FIXED_MM) / SAMPLE_LINE_MM);
	return Math.min(SAMPLE_MAX_LINES, Math.max(1, n));
}

const PREVIEW_ITEMS = ["Brand workshop", "Logo refinement", "Website design", "Frontend build", "CMS setup", "Copywriting", "Product photography", "Hosting (1 month)", "SEO audit", "Support retainer"];

const previewLines = (count: number) => Array.from({ length: count }, (_, i) => {
	const qtyMilli = 1000 + (i % 4) * 500;
	const unitCents = 750000 + (i % 5) * 250000;
	const t = computeLineTotals(qtyMilli, unitCents, 1800);
	return {
		label: `${PREVIEW_ITEMS[i % PREVIEW_ITEMS.length]} ${Math.floor(i / PREVIEW_ITEMS.length) + 1}`,
		description: i % 3 === 0 ? "Includes one round of revisions" : "",
		qtyMilli,
		unitCents,
		subtotal: t.line_subtotal_cents,
		tax: t.line_tax_cents,
		total: t.line_total_cents
	};
});

/**
 * The Stationery editor's sample: an itemised invoice on the business's own
 * paper, Stationery and branding, always exactly two pages long (see above).
 */
/** `opts.showEmptyFields` / `opts.showGuides`: the page designer's view (page-settings.ts PageSettingsOverride). */
export function sampleStationeryPreviewPayload(settings: CompanySettingsRow | null, currency: SampleCurrency, layoutKey: PdfLayoutKey, opts: { showEmptyFields?: boolean, showGuides?: boolean } = {}) {
	const common = base(settings, currency, layoutKey, opts);
	const lines = previewLines(previewLineCount(common.page));
	const noSym = (c: number) => formatMoney(c, { code: currency.code, withSymbol: false });
	const sym = (c: number) => `${currency.symbol} ${noSym(c)}`;
	const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
	const tax = lines.reduce((s, l) => s + l.tax, 0);
	const total = subtotal + tax;
	const paid = Math.min(5000000, total);
	return {
		...common,
		kind: "invoice",
		number: "INV-0042",
		title: "INVOICE",
		primary_label: "Invoice",
		date_label: "Date",
		date_value: "2026-06-22",
		secondary_label: "Due date",
		secondary_value: "2026-07-22",
		project_title: "Website redesign",
		lines: lines.map((l) => ({
			item_label: l.label,
			description: l.description,
			qty_display: formatQty(l.qtyMilli),
			unit_price_display: noSym(l.unitCents),
			vat_display: "18%",
			total_display: noSym(l.total)
		})),
		formatted: {
			subtotal: sym(subtotal),
			subtotal_no_symbol: noSym(subtotal),
			tax: sym(tax),
			tax_no_symbol: noSym(tax),
			total: sym(total),
			total_no_symbol: noSym(total)
		},
		paid_cents: paid,
		paid_display: noSym(paid),
		balance_display: noSym(total - paid)
	};
}
