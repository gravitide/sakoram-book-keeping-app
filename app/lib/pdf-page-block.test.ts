// Every PDF builder carries the same `page` block (see page-settings.ts), so
// no template has to decide paper or Stationery margins for itself.

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
const settings = {
	business_name: "Lanka Design Studio",
	pdf_template: "compact",
	// Not the A4 default, so every builder proves it carries the business's
	// Paper size rather than a hardcoded one.
	pdf_paper_size: "a5",
	letter_preprinted_top_margin_mm: 60,
	letter_preprinted_bottom_margin_mm: 25
} as CompanySettingsRow;

// A5 is 148 mm wide: the Layout's A4 margins scale by 148 / 210.
const A5_LAYOUT_MARGINS = { paper: "a5", margin_scale: 0.704762, margins: null };

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

const letter = (prePrinted: number) => buildLetterPdfPayload({
	row: { number: "LET-0001", letter_date: "2026-06-01", body_json: "", signature_json: "", pre_printed: prePrinted } as never,
	settings
});

// Reports all share one shape; the inputs below are the minimum each builder
// reads without throwing. `zeros` answers every totals field with 0 cents.
const zeros = new Proxy({}, { get: () => 0 });
const reportBase = { settings, currency: LKR, dateFrom: "2026-04-01", dateTo: "2026-06-30" };
const reports = {
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

describe("every PDF builder emits the shared page block", () => {
	it.each([
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
			currency: LKR,
			client: { name: "Acme" } as never,
			openInvoices: [],
			paidCentsFor: () => 0,
			creditedCentsFor: () => 0,
			unappliedCreditCents: 0
		})],
		["sample preview", () => sampleInvoicePayload(settings, currency, "modern")],
		["letter on the business stationery", () => letter(0)],
		...Object.entries(reports).map(([name, build]) => [`${name} report`, build] as const)
	])("%s: the business's paper with the Layout's own (scaled) margins", (_name, build) => {
		const { page } = build() as { page: { paper: string, margin_scale: number, margins: unknown } };
		expect({ ...page, margin_scale: Number(page.margin_scale.toFixed(6)) }).toEqual(A5_LAYOUT_MARGINS);
	});

	it("a letter on pre-printed paper reserves the business's pre-printed bands", () => {
		const { paper, margins } = letter(1).page;
		expect({ paper, margins }).toEqual({ paper: "a5", margins: { top: 60, right: 18, bottom: 25, left: 18 } });
	});
});
