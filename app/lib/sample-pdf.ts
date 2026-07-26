// Sample-document payload builders for the Settings → PDF template preview.
// They mirror the shape produced by `buildInvoicePdfPayload` /
// `buildQuotePdfPayload` (every field the Typst templates reference) but with
// hardcoded, realistic fake data — so the preview renders the chosen template
// without touching the database. Theme colour / font / logo / business contact
// come from the live settings so the preview reflects the user's branding.

import type { CompanySettingsRow } from "~/stores/settings";
import { buildFooterBlocks, buildHeaderBlocks } from "./pdf-chrome";
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

function base(settings: CompanySettingsRow | null, currency: SampleCurrency, templateKey: string) {
	return {
		template: templateKey,
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
		logo_scale: settings?.pdf_logo_scale ?? 100,
		header_blocks: buildHeaderBlocks(settings),
		footer_blocks: buildFooterBlocks(settings),
		logo_path: settings?.pdf_header_logo_path ?? null,
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

export function sampleInvoicePayload(settings: CompanySettingsRow | null, currency: SampleCurrency, templateKey: string) {
	return {
		...base(settings, currency, templateKey),
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

export function sampleQuotePayload(settings: CompanySettingsRow | null, currency: SampleCurrency, templateKey: string) {
	return {
		...base(settings, currency, templateKey),
		kind: "quote",
		number: "QUO-2026-0042",
		title: "QUOTATION",
		primary_label: "Quote",
		date_label: "Date",
		date_value: "2026-06-22",
		secondary_label: "Valid till",
		secondary_value: "2026-07-22",
		project_title: "Website redesign",
		paid_cents: null,
		paid_display: null,
		balance_display: null,
		party_label: "Quote to"
	};
}

// Payslip sample. Deliberately does NOT spread `base()` — payslip.typ reads a
// different shape (employee / earnings / deductions / net) than the doc family.
export function samplePayslipPayload(settings: CompanySettingsRow | null, currency: SampleCurrency, templateKey: string) {
	return {
		template: templateKey,
		title: "PAY SLIP",
		number: "PSL-0042",
		theme_color: pdfThemeHex(settings),
		font_family: settings?.pdf_font ?? "Akt",
		currency_code: currency.code,
		currency_symbol: currency.symbol,
		period_start: "2026-06-01",
		period_end: "2026-06-30",
		period_display: "2026-06-01 → 2026-06-30",
		pay_date: "2026-06-30",
		employee: {
			full_name: "Nimal Perera",
			employee_number: "EMP-004",
			designation: "Senior Engineer",
			nic: "199012345678",
			bank_name: "Commercial Bank",
			bank_branch: "Colombo 03",
			bank_account_number: "1234567890",
			bank_account_name: "N Perera"
		},
		earnings: [
			{ label: "Basic", amount_display: "150,000.00" },
			{ label: "Transport allowance", amount_display: "15,000.00" }
		],
		deductions: [
			{ label: "EPF (employee 8%)", amount_display: "12,000.00" }
		],
		formatted: { earnings: "165,000.00", deductions: "12,000.00", net: "153,000.00" },
		paid_cents: null,
		paid_display: null,
		balance_display: null,
		statutory_enabled: true,
		epf_employer_display: "18,000.00",
		etf_display: "4,500.00",
		total_cost_display: "187,500.00",
		show_signatures: settings?.payslip_show_signatures === 1,
		notes: "Paid by bank transfer.",
		business_name: settings?.business_name ?? "Your Business",
		website: settings?.website ?? "yourbusiness.lk",
		phone: settings?.phone ?? "+94 11 234 5678",
		address_line1: settings?.address_line1 ?? "42 Galle Road",
		city: settings?.city ?? "Colombo",
		logo_scale: settings?.pdf_logo_scale ?? 100,
		header_blocks: buildHeaderBlocks(settings),
		footer_blocks: buildFooterBlocks(settings),
		logo_path: settings?.pdf_header_logo_path ?? null
	};
}
