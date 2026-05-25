// PDF payload builders for the Reports module.
//
// Each report page builds a payload via one of the helpers here and
// hands it to the `export_report_pdf` Rust command (via usePdfPreview).
// The Typst template `src-tauri/templates/report.typ` is generic — it
// takes a title, period label, three KPI tiles, breakdown rows, and
// optional detail tables. The shape below mirrors that contract.

import type { CurrencyMeta } from "~/lib/money";
import type { BillRow } from "~/stores/bills";
import type { InvoiceRow } from "~/stores/invoices";
import type { PayslipRow } from "~/stores/payslips";
import type { CompanySettingsRow } from "~/stores/settings";
import { formatMoney } from "~/lib/money";
import { themeHex } from "~/lib/theme";

/// Generic report payload shape consumed by `report.typ`. Optional
/// fields mirror the template's `if "field" in data` checks.
interface ReportPdfPayload {
	business_name: string | null
	address_line1: string | null
	city: string | null
	phone: string | null
	website: string | null
	tax_id: string | null
	logo_path: string | null
	theme_color: string
	font_family: string | null
	currency_code: string

	title: string
	subtitle: string | null
	period_label: string
	generated_at: string

	summary: ReportSummaryTile[]
	breakdown: ReportBreakdown | null
	details: ReportDetailSection[] | null
}

interface ReportSummaryTile {
	label: string
	value: string
	sub: string | null
	tone: "success" | "error" | "neutral"
}

interface ReportBreakdown {
	title: string
	rows: ReportBreakdownRow[]
	total: ReportBreakdownRow
}

interface ReportBreakdownRow {
	label: string
	sublabel: string | null
	amount: string
	percent: string
	tone: "success" | "error" | "neutral"
}

interface ReportDetailSection {
	title: string
	columns: string[]
	rows: string[][]
}

// Shared business-header chunk — pulled from settings the same way
// every other PDF builder does it. Logo path resolution + theme color
// lookup live here so neither caller has to think about them.
const businessHeader = (
	settings: CompanySettingsRow | null
): Pick<ReportPdfPayload,	"business_name" | "address_line1" | "city" | "phone" | "website"
| "tax_id" | "logo_path" | "theme_color" | "font_family"> => ({
	business_name: settings?.business_name ?? null,
	address_line1: settings?.address_line1 ?? null,
	city: settings?.city ?? null,
	phone: settings?.phone ?? null,
	website: settings?.website ?? null,
	tax_id: settings?.tax_id ?? null,
	logo_path: settings?.pdf_header_logo_path ?? null,
	theme_color: themeHex(settings?.theme_color ?? "green") ?? "#16a34a",
	font_family: settings?.pdf_font ?? null
});

const todayISO = (): string => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Format a date-range bound pair into the same readable "Apr 1, 2026 →
// Mar 31, 2027" string the page header uses. Falls back gracefully
// when a bound is blank.
const formatPeriodLabel = (dateFrom: string, dateTo: string): string => {
	const fmt = (iso: string): string => {
		const [y, mo, d] = iso.split("-").map(Number);
		if (!y || !mo || !d) return iso;
		return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric"
		});
	};
	if (!dateFrom && !dateTo) return "All time";
	if (!dateFrom) return `Up to ${fmt(dateTo)}`;
	if (!dateTo) return `From ${fmt(dateFrom)}`;
	return `${fmt(dateFrom)} → ${fmt(dateTo)}`;
};

// ---------- P&L --------------------------------------------------------

export interface PnlPdfInput {
	settings: CompanySettingsRow | null
	currency: CurrencyMeta
	dateFrom: string
	dateTo: string
	totals: {
		income: number
		bills: number
		payroll: number
		expenses: number
		net: number
		invoiceCount: number
		billCount: number
		payslipCount: number
	}
	filtered: {
		invoices: InvoiceRow[]
		bills: BillRow[]
		payslips: PayslipRow[]
	}
}

export const buildPnlPdfPayload = (input: PnlPdfInput): ReportPdfPayload => {
	const fmt = (cents: number) => formatMoney(cents, input.currency);
	const pct = (part: number, whole: number): string => {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	};
	const margin = input.totals.income === 0
		? "No income in this period"
		: `${input.totals.net >= 0 ? "+" : "−"}${Math.abs((input.totals.net / input.totals.income) * 100).toFixed(1)}% margin`;
	const netTone: "success" | "error" = input.totals.net >= 0 ? "success" : "error";
	const netSign = input.totals.net >= 0 ? "+" : "−";

	return {
		...businessHeader(input.settings),
		currency_code: input.currency.code,
		title: "Profit & Loss",
		subtitle: "Accrual basis — counted on issue / period-end dates. Amounts exclude VAT.",
		period_label: formatPeriodLabel(input.dateFrom, input.dateTo),
		generated_at: todayISO(),
		summary: [
			{
				label: "Income",
				value: fmt(input.totals.income),
				sub: `${input.totals.invoiceCount} invoice${input.totals.invoiceCount === 1 ? "" : "s"} issued`,
				tone: "success"
			},
			{
				label: "Expenses",
				value: fmt(input.totals.expenses),
				sub: `${input.totals.billCount} bill${input.totals.billCount === 1 ? "" : "s"} · ${input.totals.payslipCount} payslip${input.totals.payslipCount === 1 ? "" : "s"}`,
				tone: "error"
			},
			{
				label: input.totals.net >= 0 ? "Net profit" : "Net loss",
				value: `${netSign}${fmt(Math.abs(input.totals.net))}`,
				sub: margin,
				tone: netTone
			}
		],
		breakdown: {
			title: "Breakdown",
			rows: [
				{
					label: "Income",
					sublabel: "Issued invoices, subtotal excluding VAT",
					amount: fmt(input.totals.income),
					percent: "100%",
					tone: "success"
				},
				{
					label: "Bills (purchases)",
					sublabel: "Open bills, subtotal excluding VAT",
					amount: `− ${fmt(input.totals.bills)}`,
					percent: pct(input.totals.bills, input.totals.income),
					tone: "error"
				},
				{
					label: "Payroll",
					sublabel: "Issued payslips, gross earnings (before deductions)",
					amount: `− ${fmt(input.totals.payroll)}`,
					percent: pct(input.totals.payroll, input.totals.income),
					tone: "error"
				}
			],
			total: {
				label: input.totals.net >= 0 ? "Net profit" : "Net loss",
				sublabel: null,
				amount: `${netSign}${fmt(Math.abs(input.totals.net))}`,
				percent: pct(Math.abs(input.totals.net), input.totals.income),
				tone: netTone
			}
		},
		details: [
			{
				title: `Invoices (${input.filtered.invoices.length})`,
				columns: ["Number", "Date", "Client", "Subtotal"],
				rows: input.filtered.invoices.map((r) => [
					r.number,
					r.issue_date,
					r.client_name || "—",
					fmt(r.subtotal_cents)
				])
			},
			{
				title: `Bills (${input.filtered.bills.length})`,
				columns: ["Number", "Date", "Vendor", "Subtotal"],
				rows: input.filtered.bills.map((r) => [
					r.number,
					r.issue_date,
					r.vendor_name || "—",
					fmt(r.subtotal_cents)
				])
			},
			{
				title: `Payslips (${input.filtered.payslips.length})`,
				columns: ["Number", "Period end", "Employee", "Earnings"],
				rows: input.filtered.payslips.map((r) => [
					r.number,
					r.period_end,
					r.employee_name || "—",
					fmt(r.earnings_cents)
				])
			}
		]
	};
};

// ---------- VAT --------------------------------------------------------

export interface VatPdfInput {
	settings: CompanySettingsRow | null
	currency: CurrencyMeta
	dateFrom: string
	dateTo: string
	totals: {
		outputVat: number
		inputVat: number
		netVat: number
		invoiceCount: number
		billCount: number
	}
	filtered: {
		invoices: InvoiceRow[]
		bills: BillRow[]
	}
}

export const buildVatPdfPayload = (input: VatPdfInput): ReportPdfPayload => {
	const fmt = (cents: number) => formatMoney(cents, input.currency);
	const pct = (part: number, whole: number): string => {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	};
	const netSign = input.totals.netVat >= 0 ? "" : "−";
	const netAbsStr = `${netSign}${fmt(Math.abs(input.totals.netVat))}`;
	const netTone: "success" | "error" = input.totals.netVat >= 0 ? "error" : "success";
	const netLabel = input.totals.netVat >= 0 ? "Net VAT payable" : "Net VAT credit";

	// Sub-label mirrors the page's logic.
	let netSub = "";
	if (input.totals.outputVat === 0 && input.totals.inputVat === 0) {
		netSub = "No VAT activity in this period";
	} else if (input.totals.netVat === 0) {
		netSub = "Output VAT exactly offset by Input VAT";
	} else if (input.totals.netVat < 0) {
		netSub = "Carries forward as Input-VAT credit";
	} else if (input.totals.outputVat === 0) {
		netSub = "All credit, no output to offset";
	} else {
		const share = (input.totals.netVat / input.totals.outputVat) * 100;
		netSub = `${share.toFixed(1)}% of output VAT`;
	}

	return {
		...businessHeader(input.settings),
		currency_code: input.currency.code,
		title: "VAT Report",
		subtitle: "Output VAT collected vs Input VAT paid. Net = what to remit to IRD.",
		period_label: formatPeriodLabel(input.dateFrom, input.dateTo),
		generated_at: todayISO(),
		summary: [
			{
				label: "Output VAT",
				value: fmt(input.totals.outputVat),
				sub: `${input.totals.invoiceCount} invoice${input.totals.invoiceCount === 1 ? "" : "s"} issued`,
				tone: "success"
			},
			{
				label: "Input VAT",
				value: fmt(input.totals.inputVat),
				sub: `${input.totals.billCount} bill${input.totals.billCount === 1 ? "" : "s"} received`,
				tone: "error"
			},
			{
				label: netLabel,
				value: netAbsStr,
				sub: netSub,
				tone: netTone
			}
		],
		breakdown: {
			title: "Breakdown",
			rows: [
				{
					label: "Output VAT",
					sublabel: "Collected from clients on issued invoices",
					amount: fmt(input.totals.outputVat),
					percent: "100%",
					tone: "success"
				},
				{
					label: "Input VAT",
					sublabel: "Paid to vendors on open bills — recoverable",
					amount: `− ${fmt(input.totals.inputVat)}`,
					percent: pct(input.totals.inputVat, input.totals.outputVat),
					tone: "error"
				}
			],
			total: {
				label: netLabel,
				sublabel: null,
				amount: netAbsStr,
				percent: pct(Math.abs(input.totals.netVat), input.totals.outputVat),
				tone: netTone
			}
		},
		details: [
			{
				title: `Invoices (${input.filtered.invoices.length})`,
				columns: ["Number", "Date", "Client", "Subtotal", "VAT"],
				rows: input.filtered.invoices.map((r) => [
					r.number,
					r.issue_date,
					r.client_name || "—",
					fmt(r.subtotal_cents),
					fmt(r.tax_cents)
				])
			},
			{
				title: `Bills (${input.filtered.bills.length})`,
				columns: ["Number", "Date", "Vendor", "Subtotal", "VAT"],
				rows: input.filtered.bills.map((r) => [
					r.number,
					r.issue_date,
					r.vendor_name || "—",
					fmt(r.subtotal_cents),
					fmt(r.tax_cents)
				])
			}
		]
	};
};

// ---------- Aged receivables ------------------------------------------

export interface AgedReceivablesPdfInput {
	settings: CompanySettingsRow | null
	currency: CurrencyMeta
	asOfDate: Date
	totals: {
		totalCurrent: number
		totalOverdue: number
		totalOutstanding: number
		invoiceCount: number
		overdueCount: number
		currentCount: number
		clientCount: number
	}
	buckets: {
		key: "current" | "b1to30" | "b31to60" | "b61to90" | "b90plus"
		label: string
		count: number
		amount: number
	}[]
	clientRows: {
		clientId: number | null
		name: string
		invoiceCount: number
		current: number
		b1to30: number
		b31to60: number
		b61to90: number
		b90plus: number
		total: number
	}[]
}

export const buildAgedReceivablesPdfPayload = (
	input: AgedReceivablesPdfInput
): ReportPdfPayload => {
	const fmt = (cents: number) => formatMoney(cents, input.currency);
	const dash = (cents: number) => (cents === 0 ? "—" : fmt(cents));
	const pct = (part: number, whole: number): string => {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	};

	const asOfISO = `${input.asOfDate.getFullYear()}-${String(input.asOfDate.getMonth() + 1).padStart(2, "0")}-${String(input.asOfDate.getDate()).padStart(2, "0")}`;
	const asOfReadable = input.asOfDate.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric"
	});

	// Tone the bucket rows the same way the on-screen table does — warning
	// for 1–60-day creep, error past 60.
	const toneFor = (key: AgedReceivablesPdfInput["buckets"][number]["key"]): "success" | "error" | "neutral" => {
		if (key === "current") return "success";
		if (key === "b61to90" || key === "b90plus") return "error";
		return "neutral";
	};

	return {
		...businessHeader(input.settings),
		currency_code: input.currency.code,
		title: "Aged receivables",
		subtitle: `Snapshot as of ${asOfReadable}. Outstanding invoice balances bucketed by days past due.`,
		period_label: `As of ${asOfISO}`,
		generated_at: asOfISO,
		summary: [
			{
				label: "Total outstanding",
				value: fmt(input.totals.totalOutstanding),
				sub: `${input.totals.invoiceCount} open invoice${input.totals.invoiceCount === 1 ? "" : "s"} · ${input.totals.clientCount} client${input.totals.clientCount === 1 ? "" : "s"}`,
				tone: "neutral"
			},
			{
				label: "Overdue",
				value: fmt(input.totals.totalOverdue),
				sub: `${input.totals.overdueCount} invoice${input.totals.overdueCount === 1 ? "" : "s"} past due`,
				tone: "error"
			},
			{
				label: "Current (not yet due)",
				value: fmt(input.totals.totalCurrent),
				sub: `${input.totals.currentCount} invoice${input.totals.currentCount === 1 ? "" : "s"} still in-window`,
				tone: "success"
			}
		],
		breakdown: {
			title: "Bucket distribution",
			rows: input.buckets.map((b) => ({
				label: b.label,
				sublabel: `${b.count} invoice${b.count === 1 ? "" : "s"}`,
				amount: fmt(b.amount),
				percent: pct(b.amount, input.totals.totalOutstanding),
				tone: toneFor(b.key)
			})),
			total: {
				label: "Total outstanding",
				sublabel: null,
				amount: fmt(input.totals.totalOutstanding),
				percent: "100%",
				tone: "neutral"
			}
		},
		details: input.clientRows.length === 0
			? null
			: [
				{
					title: `By client (${input.clientRows.length})`,
					columns: ["Client", "Current", "1-30", "31-60", "61-90", "90+", "Total"],
					rows: input.clientRows.map((r) => [
						`${r.name} (${r.invoiceCount} open)`,
						dash(r.current),
						dash(r.b1to30),
						dash(r.b31to60),
						dash(r.b61to90),
						dash(r.b90plus),
						fmt(r.total)
					])
				}
			]
	};
};
