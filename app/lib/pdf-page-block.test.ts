// Every PDF builder carries the same `page` block (see page-settings.ts), so
// no template has to decide paper, Stationery margins or what to suppress for
// itself.

import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { buildBillPdfPayload } from "./bill-pdf";
import { buildInvoicePdfPayload } from "./invoice-pdf";
import { buildLetterPdfPayload } from "./letter-pdf";
import { CURRENCIES } from "./money";
import { buildPayslipPdfPayload } from "./payslip-pdf";
import { buildQuotePdfPayload } from "./quote-pdf";
import {
	buildAgedPayablesPdfPayload,
	buildAgedReceivablesPdfPayload,
	buildCashFlowPdfPayload,
	buildExpensesByVendorPdfPayload,
	buildPayrollRegisterPdfPayload,
	buildPnlPdfPayload,
	buildSalesByClientPdfPayload,
	buildVatPdfPayload
} from "./report-pdf";
import { sampleInvoicePayload } from "./sample-pdf";
import { buildCustomerStatementPdfPayload } from "./statement-pdf";
import { buildVoucherPdfPayload } from "./voucher-pdf";

const LKR = CURRENCIES.LKR!;
const currency = { code: LKR.code, symbol: LKR.symbol };
const builtin = {
	business_name: "Lanka Design Studio",
	pdf_layout: "compact",
	// Not the A4 default, so every builder proves it carries the business's
	// Paper size rather than a hardcoded one.
	pdf_paper_size: "a5",
	pdf_stationery_mode: "builtin",
	// Stored Pre-printed bands that Built-in must ignore (except for a letter
	// set to pre-printed paper).
	pdf_stationery: JSON.stringify({ preprinted: { top: 48, right: 14, bottom: 22, left: 16 } })
} as CompanySettingsRow;
const preprinted = { ...builtin, pdf_stationery_mode: "preprinted" } as CompanySettingsRow;
const background = {
	...builtin,
	pdf_stationery_mode: "background",
	pdf_stationery: JSON.stringify({
		preprinted: { top: 48, right: 14, bottom: 22, left: 16 },
		background: { ext: "svg", paper: "a5", margins: { top: 36, right: 12, bottom: 20, left: 12 } }
	})
} as CompanySettingsRow;

// A5 is 148 mm wide: the Layout's A4 margins scale by 148 / 210.
const A5_LAYOUT_MARGINS = { paper: "a5", margin_scale: 0.704762, stationery: "builtin", chrome: true, margins: null, page_numbers: true, page_number_position: "footer", allow_landscape: true, background: null };
// The Stationery's own bands, never scaled.
const A5_PREPRINTED = { paper: "a5", margin_scale: 0.704762, stationery: "preprinted", chrome: false, margins: { top: 48, right: 14, bottom: 22, left: 16 }, page_numbers: true, page_number_position: "safe_area", allow_landscape: false, background: null };

const docRow = {
	number: "INV-0001",
	issue_date: "2026-06-01",
	due_date: "2026-07-01",
	valid_until: "2026-07-01",
	pricing_mode: "bundle",
	subtotal_cents: 100000,
	tax_cents: 0,
	total_cents: 100000,
	client_snapshot: null,
	vendor_snapshot: null,
	bank_details_snapshot: null,
	notes: null,
	prepared_by: null,
	title_override: null
} as never;

const letter = (settings: CompanySettingsRow, prePrinted: number) => buildLetterPdfPayload({
	row: { number: "LET-0001", letter_date: "2026-06-01", body_json: "", signature_json: "", pre_printed: prePrinted } as never,
	settings
});

// Reports all share one shape; the inputs below are the minimum each builder
// reads without throwing. `zeros` answers every totals field with 0 cents.
const zeros = new Proxy({}, { get: () => 0 });
const reports = (settings: CompanySettingsRow) => {
	const reportBase = { settings, currency: LKR, dateFrom: "2026-04-01", dateTo: "2026-06-30" };
	return {
		pnl: () => buildPnlPdfPayload({
			...reportBase,
			totals: { grossIncome: 0, creditNotes: 0, income: 0, bills: 0, payrollGross: 0, employerContrib: 0, payroll: 0, expenses: 0, net: 0, invoiceCount: 0, billCount: 0, payslipCount: 0 },
			filtered: { invoices: [], bills: [], payslips: [], creditNotes: [] }
		}),
		vat: () => buildVatPdfPayload({ ...reportBase, totals: zeros, filtered: { invoices: [], bills: [], creditNotes: [] } } as never),
		agedReceivables: () => buildAgedReceivablesPdfPayload({ settings, currency: LKR, asOfDate: new Date(2026, 5, 30), totals: zeros, buckets: [], clientRows: [], invoices: [] } as never),
		agedPayables: () => buildAgedPayablesPdfPayload({ settings, currency: LKR, asOfDate: new Date(2026, 5, 30), totals: zeros, buckets: [], vendorRows: [], bills: [] } as never),
		cashFlow: () => buildCashFlowPdfPayload({
			...reportBase,
			totals: { receipts: 0, payments: 0, net: 0, receiptCount: 0, paymentCount: 0 },
			monthlyRows: [],
			filtered: { receipts: [], payments: [] }
		}),
		salesByClient: () => buildSalesByClientPdfPayload({ ...reportBase, totals: zeros, clientRows: [], invoices: [] } as never),
		expensesByVendor: () => buildExpensesByVendorPdfPayload({ ...reportBase, totals: zeros, vendorRows: [], bills: [] } as never),
		payrollRegister: () => buildPayrollRegisterPdfPayload({ ...reportBase, totals: zeros, employeeRows: [], payslips: [] } as never)
	};
};

const builders = (settings: CompanySettingsRow): [string, () => unknown][] => [
	["quote", () => buildQuotePdfPayload({ row: docRow, lines: [], settings, currency })],
	["invoice", () => buildInvoicePdfPayload({ row: docRow, lines: [], settings, currency, paidCents: 0 })],
	["bill", () => buildBillPdfPayload({ row: docRow, lines: [], settings, currency, paidCents: 0 })],
	["payslip", () => buildPayslipPdfPayload({
		row: { number: "PSL-0001", employee_snapshot: "{}", epf_employer_cents: 0, etf_cents: 0 } as never,
		lines: [],
		settings,
		currency: LKR,
		paidCents: 0,
		balanceCents: 0
	})],
	["voucher", () => buildVoucherPdfPayload({ row: { voucher_type: "receipt", amount_cents: 1000 } as never, settings, currency, relatedLabel: null })],
	["statement", () => buildCustomerStatementPdfPayload({
		settings,
		currency: { ...LKR, decimals: 2 },
		client: { name: "Acme" } as never,
		openInvoices: [],
		paidCentsFor: () => 0,
		creditedCentsFor: () => 0,
		unappliedCreditCents: 0
	})],
	["sample preview", () => sampleInvoicePayload(settings, currency, "modern")],
	["letter on the business stationery", () => letter(settings, 0)],
	...Object.entries(reports(settings)).map(([name, build]) => [`${name} report`, build] as [string, () => unknown])
];

type Page = { margin_scale: number } & Record<string, unknown>;
const pageOf = (build: () => unknown) => {
	const { page } = build() as { page: Page };
	return { ...page, margin_scale: Number(page.margin_scale.toFixed(6)) };
};

describe("every PDF builder emits the shared page block", () => {
	it.each(builders(builtin))("%s: the business's paper with the Layout's own (scaled) margins", (_name, build) => {
		expect(pageOf(build)).toEqual(A5_LAYOUT_MARGINS);
	});

	it.each(builders(preprinted))("%s on Pre-printed paper: the Stationery's bands, nothing of the built-in identity", (_name, build) => {
		expect(pageOf(build)).toEqual(A5_PREPRINTED);
	});

	it.each(builders(background))("%s on a Full-page background: the artwork behind every page, the background's own margins", (_name, build) => {
		expect(pageOf(build)).toEqual({
			...A5_PREPRINTED,
			stationery: "background",
			margins: { top: 36, right: 12, bottom: 20, left: 12 },
			background: { ext: "svg" }
		});
	});

	it.each([["Built-in", builtin], ["Pre-printed paper", preprinted], ["Full-page background", background]] as const)(
		"a letter on pre-printed paper reserves the business's Pre-printed paper bands (active mode %s)",
		(_mode, settings) => {
			expect(pageOf(() => letter(settings, 1))).toEqual(A5_PREPRINTED);
		}
	);
});
