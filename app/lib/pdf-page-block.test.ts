// Every PDF builder carries the same `page` block (see page-settings.ts) — the
// paper, the design's safe area and its printable items — and the company
// logo as `logo_path`, so no template decides any of it for itself.

import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { buildBillPdfPayload } from "./bill-pdf";
import { buildInvoicePdfPayload } from "./invoice-pdf";
import { buildLetterPdfPayload } from "./letter-pdf";
import { CURRENCIES } from "./money";
import { buildPageSettings } from "./page-settings";
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
const DESIGN = {
	version: 1,
	paper: "a4",
	margins: { top: 40, right: 18, bottom: 25, left: 18 },
	items: [
		{ type: "image", id: "artwork00001", x: 0, y: 0, w: 210, h: 297, pages: "every", src: { kind: "file", ext: "svg" }, guide: false },
		{ type: "text", id: "name00000001", x: 18, y: 12, w: 120, pages: "first", text: "{business_name}", style: { font: "Akt", size: 12, bold: true, italic: false, color: "accent", align: "left" } },
		{ type: "page_number", id: "pageno000001", x: 142, y: 289, w: 50, pages: "every", format: "page_of_total", hide_single: true, style: { font: "Akt", size: 7, bold: false, italic: false, color: "#6b7280", align: "right" } }
	]
};
const business = {
	business_name: "Lanka Design Studio",
	pdf_layout: "compact",
	// Not the A4 the design was made on, so every builder proves it carries
	// the business's Paper size (and the design scaled to it).
	pdf_paper_size: "a5",
	pdf_theme_color: "blue",
	logo_path: "D:/Biz/logos/logo.png",
	pdf_design: JSON.stringify(DESIGN)
} as CompanySettingsRow;

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

describe("every PDF builder emits the shared page block", () => {
	it.each(builders(business))("%s: the paper, the design's safe area and items, the company logo", (_name, build) => {
		const payload = build() as { page: unknown, logo_path: unknown };
		expect(payload.page).toEqual(buildPageSettings(business));
		expect((payload.page as { paper: string }).paper).toBe("a5");
		expect((payload.page as { items: unknown[] }).items).toHaveLength(3);
		expect(payload.logo_path).toBe("D:/Biz/logos/logo.png");
	});

	it("a letter on pre-printed paper prints none of the design but keeps its safe area", () => {
		const { page } = letter(business, 1) as { page: { items: unknown[], margins: unknown } };
		expect(page.items).toEqual([]);
		expect(page.margins).toEqual(buildPageSettings(business).margins);
	});
});
