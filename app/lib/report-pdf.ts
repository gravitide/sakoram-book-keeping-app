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
import { pdfThemeHex } from "~/lib/theme";

/// Generic report payload shape consumed by `report.typ`. Optional
/// fields mirror the template's `if "field" in data` checks.
interface ReportPdfPayload {
	business_name: string | null
	address_line1: string | null
	city: string | null
	phone: string | null
	website: string | null
	tax_id: string | null
	logo_scale: number
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
| "tax_id" | "logo_scale" | "logo_path" | "theme_color" | "font_family"> => ({
	business_name: settings?.business_name ?? null,
	address_line1: settings?.address_line1 ?? null,
	city: settings?.city ?? null,
	phone: settings?.phone ?? null,
	website: settings?.website ?? null,
	tax_id: settings?.tax_id ?? null,
	logo_scale: settings?.pdf_logo_scale ?? 100,
	logo_path: settings?.pdf_header_logo_path ?? null,
	theme_color: pdfThemeHex(settings),
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
	// Per-cell amount for the 7-column client table. Currency prefix
	// stripped — the report-level currency code is already implicit and
	// every column is the same currency. Saves ~5mm per cell × 6
	// columns and lets the Client column actually breathe.
	const fmtBare = (cents: number) => formatMoney(cents, input.currency).replace(/^[^\d\-−]+/, "").trim();
	const dashBare = (cents: number) => (cents === 0 ? "—" : fmtBare(cents));
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
					title: `By client (${input.clientRows.length}) — amounts in ${input.currency.code}`,
					columns: ["Client", "Current", "1-30", "31-60", "61-90", "90+", "Total"],
					rows: input.clientRows.map((r) => [
						`${r.name} (${r.invoiceCount} open)`,
						dashBare(r.current),
						dashBare(r.b1to30),
						dashBare(r.b31to60),
						dashBare(r.b61to90),
						dashBare(r.b90plus),
						fmtBare(r.total)
					])
				}
			]
	};
};

// ---------- Aged payables ---------------------------------------------
//
// Mirror of aged receivables but for bills + vendors. Same payload
// shape, same Typst template path — only the labels and party axis
// flip.

export interface AgedPayablesPdfInput {
	settings: CompanySettingsRow | null
	currency: CurrencyMeta
	asOfDate: Date
	totals: {
		totalCurrent: number
		totalOverdue: number
		totalOutstanding: number
		billCount: number
		overdueCount: number
		currentCount: number
		vendorCount: number
	}
	buckets: {
		key: "current" | "b1to30" | "b31to60" | "b61to90" | "b90plus"
		label: string
		count: number
		amount: number
	}[]
	vendorRows: {
		vendorId: number | null
		name: string
		billCount: number
		current: number
		b1to30: number
		b31to60: number
		b61to90: number
		b90plus: number
		total: number
	}[]
}

export const buildAgedPayablesPdfPayload = (
	input: AgedPayablesPdfInput
): ReportPdfPayload => {
	const fmt = (cents: number) => formatMoney(cents, input.currency);
	// Currency-prefix-stripped formatter for the 7-col per-vendor
	// table — same trick as the receivables builder so the Vendor
	// column gets room to breathe on portrait A4.
	const fmtBare = (cents: number) => formatMoney(cents, input.currency).replace(/^[^\d\-−]+/, "").trim();
	const dashBare = (cents: number) => (cents === 0 ? "—" : fmtBare(cents));
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

	const toneFor = (key: AgedPayablesPdfInput["buckets"][number]["key"]): "success" | "error" | "neutral" => {
		if (key === "current") return "success";
		if (key === "b61to90" || key === "b90plus") return "error";
		return "neutral";
	};

	return {
		...businessHeader(input.settings),
		currency_code: input.currency.code,
		title: "Aged payables",
		subtitle: `Snapshot as of ${asOfReadable}. Outstanding bill balances bucketed by days past due.`,
		period_label: `As of ${asOfISO}`,
		generated_at: asOfISO,
		summary: [
			{
				label: "Total outstanding",
				value: fmt(input.totals.totalOutstanding),
				sub: `${input.totals.billCount} open bill${input.totals.billCount === 1 ? "" : "s"} · ${input.totals.vendorCount} vendor${input.totals.vendorCount === 1 ? "" : "s"}`,
				tone: "neutral"
			},
			{
				label: "Overdue",
				value: fmt(input.totals.totalOverdue),
				sub: `${input.totals.overdueCount} bill${input.totals.overdueCount === 1 ? "" : "s"} past due`,
				tone: "error"
			},
			{
				label: "Current (not yet due)",
				value: fmt(input.totals.totalCurrent),
				sub: `${input.totals.currentCount} bill${input.totals.currentCount === 1 ? "" : "s"} still in-window`,
				tone: "success"
			}
		],
		breakdown: {
			title: "Bucket distribution",
			rows: input.buckets.map((b) => ({
				label: b.label,
				sublabel: `${b.count} bill${b.count === 1 ? "" : "s"}`,
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
		details: input.vendorRows.length === 0
			? null
			: [
				{
					title: `By vendor (${input.vendorRows.length}) — amounts in ${input.currency.code}`,
					columns: ["Vendor", "Current", "1-30", "31-60", "61-90", "90+", "Total"],
					rows: input.vendorRows.map((r) => [
						`${r.name} (${r.billCount} open)`,
						dashBare(r.current),
						dashBare(r.b1to30),
						dashBare(r.b31to60),
						dashBare(r.b61to90),
						dashBare(r.b90plus),
						fmtBare(r.total)
					])
				}
			]
	};
};

// ---------- Cash flow --------------------------------------------------
//
// Cash-basis report: receipts minus payments by month over a date
// range. The voucher ledger is the source of truth, so this report
// can never disagree with the actual money-in / money-out activity.

export interface CashFlowPdfInput {
	settings: CompanySettingsRow | null
	currency: CurrencyMeta
	dateFrom: string
	dateTo: string
	totals: {
		receipts: number
		payments: number
		net: number
		receiptCount: number
		paymentCount: number
	}
	monthlyRows: {
		key: string
		label: string
		receipts: number
		payments: number
		net: number
	}[]
	filtered: {
		receipts: { number: string, voucher_date: string, party_name: string, amount_cents: number }[]
		payments: { number: string, voucher_date: string, party_name: string, amount_cents: number }[]
	}
}

export const buildCashFlowPdfPayload = (input: CashFlowPdfInput): ReportPdfPayload => {
	const fmt = (cents: number) => formatMoney(cents, input.currency);
	const pct = (part: number, whole: number): string => {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	};
	const netSign = input.totals.net >= 0 ? "+" : "−";
	const netAbsStr = `${netSign}${fmt(Math.abs(input.totals.net))}`;
	const netTone: "success" | "error" = input.totals.net >= 0 ? "success" : "error";
	const netLabel = input.totals.net >= 0 ? "Net positive" : "Net negative";

	// Sub-label on the net tile mirrors the on-screen reasoning.
	let netSub = "";
	if (input.totals.receipts === 0 && input.totals.payments === 0) {
		netSub = "No voucher activity in this period";
	} else if (input.totals.net === 0) {
		netSub = "Receipts exactly matched payments";
	} else if (input.totals.receipts === 0) {
		netSub = "All outflow, no receipts";
	} else {
		const share = (input.totals.net / input.totals.receipts) * 100;
		netSub = `${share >= 0 ? "+" : "−"}${Math.abs(share).toFixed(1)}% of receipts`;
	}

	return {
		...businessHeader(input.settings),
		currency_code: input.currency.code,
		title: "Cash flow",
		subtitle: "Cash basis — receipts in vs payments out, counted on voucher dates (when the money actually moved).",
		period_label: formatPeriodLabel(input.dateFrom, input.dateTo),
		generated_at: todayISO(),
		summary: [
			{
				label: "Receipts (in)",
				value: fmt(input.totals.receipts),
				sub: `${input.totals.receiptCount} receipt${input.totals.receiptCount === 1 ? "" : "s"}`,
				tone: "success"
			},
			{
				label: "Payments (out)",
				value: fmt(input.totals.payments),
				sub: `${input.totals.paymentCount} payment${input.totals.paymentCount === 1 ? "" : "s"}`,
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
			title: "Monthly breakdown",
			// One row per month spanned by the range, even months with
			// no activity — the user gets the full extent of the
			// period and can spot dry months at a glance.
			rows: input.monthlyRows.map((m) => {
				const monthNet = m.net;
				const sign = monthNet >= 0 ? "+" : "−";
				const tone: "success" | "error" | "neutral"
					= monthNet === 0 ? "neutral" : monthNet > 0 ? "success" : "error";
				return {
					label: m.label,
					sublabel: m.receipts === 0 && m.payments === 0
						? "No activity"
						: `In ${fmt(m.receipts)} · Out ${fmt(m.payments)}`,
					amount: monthNet === 0 ? fmt(0) : `${sign}${fmt(Math.abs(monthNet))}`,
					percent: pct(Math.abs(monthNet), input.totals.receipts),
					tone
				};
			}),
			total: {
				label: netLabel,
				sublabel: null,
				amount: netAbsStr,
				percent: pct(Math.abs(input.totals.net), input.totals.receipts),
				tone: netTone
			}
		},
		details: [
			{
				title: `Receipts (${input.filtered.receipts.length})`,
				columns: ["Number", "Date", "Party", "Amount"],
				rows: input.filtered.receipts.map((r) => [
					r.number,
					r.voucher_date,
					r.party_name || "—",
					fmt(r.amount_cents)
				])
			},
			{
				title: `Payments (${input.filtered.payments.length})`,
				columns: ["Number", "Date", "Party", "Amount"],
				rows: input.filtered.payments.map((r) => [
					r.number,
					r.voucher_date,
					r.party_name || "—",
					fmt(r.amount_cents)
				])
			}
		]
	};
};

// ---------- Sales by client -------------------------------------------
//
// Per-client revenue breakdown for a date range. Pulls from issued
// invoices (drafts + cancelled excluded) and uses subtotal_cents
// (VAT is a pass-through, not revenue). Builder shape mirrors P&L:
// three KPI tiles + breakdown table (one row per client, sorted by
// total descending) + a single drill-down detail table listing every
// underlying invoice chronologically.

export interface SalesByClientPdfInput {
	settings: CompanySettingsRow | null
	currency: CurrencyMeta
	dateFrom: string
	dateTo: string
	totals: {
		revenue: number
		invoiceCount: number
		clientCount: number
	}
	clientRows: {
		clientId: number | null
		name: string
		invoiceCount: number
		total: number
	}[]
	invoices: InvoiceRow[]
}

export const buildSalesByClientPdfPayload = (
	input: SalesByClientPdfInput
): ReportPdfPayload => {
	const fmt = (cents: number) => formatMoney(cents, input.currency);
	const pct = (part: number, whole: number): string => {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	};

	// Average per client / per invoice for the sub-labels. Same gut-check
	// numbers the on-screen tiles surface so the PDF doesn't feel
	// thinner than the live page.
	const avgPerClient = input.totals.clientCount === 0
		? 0
		: Math.round(input.totals.revenue / input.totals.clientCount);
	const avgPerInvoice = input.totals.invoiceCount === 0
		? 0
		: Math.round(input.totals.revenue / input.totals.invoiceCount);

	return {
		...businessHeader(input.settings),
		currency_code: input.currency.code,
		title: "Sales by client",
		subtitle: "Revenue per client over the period. Subtotals exclude VAT — issued invoices only.",
		period_label: formatPeriodLabel(input.dateFrom, input.dateTo),
		generated_at: todayISO(),
		summary: [
			{
				label: "Total revenue",
				value: fmt(input.totals.revenue),
				sub: `${input.totals.invoiceCount} invoice${input.totals.invoiceCount === 1 ? "" : "s"} issued`,
				tone: "success"
			},
			{
				label: "Clients",
				value: String(input.totals.clientCount),
				sub: input.totals.clientCount === 0
					? "No clients in this period"
					: `Avg ${fmt(avgPerClient)} per client`,
				tone: "neutral"
			},
			{
				label: "Invoices",
				value: String(input.totals.invoiceCount),
				sub: input.totals.invoiceCount === 0
					? "No invoices issued"
					: `Avg ${fmt(avgPerInvoice)} per invoice`,
				tone: "neutral"
			}
		],
		breakdown: input.clientRows.length === 0
			? null
			: {
				title: "By client",
				rows: input.clientRows.map((r) => ({
					label: r.name,
					sublabel: `${r.invoiceCount} invoice${r.invoiceCount === 1 ? "" : "s"}`,
					amount: fmt(r.total),
					percent: pct(r.total, input.totals.revenue),
					tone: "success"
				})),
				total: {
					label: "Total revenue",
					sublabel: null,
					amount: fmt(input.totals.revenue),
					percent: "100%",
					tone: "success"
				}
			},
		details: input.invoices.length === 0
			? null
			: [
				{
					title: `Invoices (${input.invoices.length})`,
					columns: ["Number", "Date", "Client", "Subtotal"],
					rows: input.invoices.map((r) => [
						r.number,
						r.issue_date,
						r.client_name || "—",
						fmt(r.subtotal_cents)
					])
				}
			]
	};
};

// ---------- Expenses by vendor ----------------------------------------
//
// Mirror of sales-by-client, but for bills + vendors. Same shape,
// labels and party axis swapped. Excludes cancelled bills; uses
// subtotal_cents (VAT is recoverable via the VAT report, not an
// expense here).

export interface ExpensesByVendorPdfInput {
	settings: CompanySettingsRow | null
	currency: CurrencyMeta
	dateFrom: string
	dateTo: string
	totals: {
		spend: number
		billCount: number
		vendorCount: number
	}
	vendorRows: {
		vendorId: number | null
		name: string
		billCount: number
		total: number
	}[]
	bills: BillRow[]
}

export const buildExpensesByVendorPdfPayload = (
	input: ExpensesByVendorPdfInput
): ReportPdfPayload => {
	const fmt = (cents: number) => formatMoney(cents, input.currency);
	const pct = (part: number, whole: number): string => {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	};

	const avgPerVendor = input.totals.vendorCount === 0
		? 0
		: Math.round(input.totals.spend / input.totals.vendorCount);
	const avgPerBill = input.totals.billCount === 0
		? 0
		: Math.round(input.totals.spend / input.totals.billCount);

	return {
		...businessHeader(input.settings),
		currency_code: input.currency.code,
		title: "Expenses by vendor",
		subtitle: "Spend per vendor over the period. Subtotals exclude VAT — non-cancelled bills only.",
		period_label: formatPeriodLabel(input.dateFrom, input.dateTo),
		generated_at: todayISO(),
		summary: [
			{
				label: "Total spend",
				value: fmt(input.totals.spend),
				sub: `${input.totals.billCount} bill${input.totals.billCount === 1 ? "" : "s"} received`,
				tone: "error"
			},
			{
				label: "Vendors",
				value: String(input.totals.vendorCount),
				sub: input.totals.vendorCount === 0
					? "No vendors in this period"
					: `Avg ${fmt(avgPerVendor)} per vendor`,
				tone: "neutral"
			},
			{
				label: "Bills",
				value: String(input.totals.billCount),
				sub: input.totals.billCount === 0
					? "No bills received"
					: `Avg ${fmt(avgPerBill)} per bill`,
				tone: "neutral"
			}
		],
		breakdown: input.vendorRows.length === 0
			? null
			: {
				title: "By vendor",
				rows: input.vendorRows.map((r) => ({
					label: r.name,
					sublabel: `${r.billCount} bill${r.billCount === 1 ? "" : "s"}`,
					amount: fmt(r.total),
					percent: pct(r.total, input.totals.spend),
					tone: "error"
				})),
				total: {
					label: "Total spend",
					sublabel: null,
					amount: fmt(input.totals.spend),
					percent: "100%",
					tone: "error"
				}
			},
		details: input.bills.length === 0
			? null
			: [
				{
					title: `Bills (${input.bills.length})`,
					columns: ["Number", "Date", "Vendor", "Subtotal"],
					rows: input.bills.map((r) => [
						r.number,
						r.issue_date,
						r.vendor_name || "—",
						fmt(r.subtotal_cents)
					])
				}
			]
	};
};

// ---------- Payroll register -------------------------------------------
//
// Every payslip in a date range (period_start in [from, to], cancelled
// excluded), with a per-employee breakdown + a flat per-payslip detail
// table. KPI tiles: total gross earnings, total net pay, payslip count.
// Breakdown rows are per-employee subtotals; percent column is share
// of gross earnings (matches how the dashboard payroll tile reads).
//
// PDF detail uses the 5-col table case the template already supports:
// Number / Period end / Employee / Earnings / Net. Deductions are
// implicit (Earnings - Net) and shown on the on-screen table; dropping
// them from the PDF lets the existing 5-col layout do the work without
// adding a 6-col branch to report.typ.

export interface PayrollRegisterPdfInput {
	settings: CompanySettingsRow | null
	currency: CurrencyMeta
	dateFrom: string
	dateTo: string
	totals: {
		earnings: number
		deductions: number
		net: number
		paid: number
		payslipCount: number
		employeeCount: number
	}
	employeeRows: {
		employeeId: number | null
		name: string
		payslipCount: number
		earnings: number
		deductions: number
		net: number
		paid: number
	}[]
	payslips: PayslipRow[]
}

export const buildPayrollRegisterPdfPayload = (
	input: PayrollRegisterPdfInput
): ReportPdfPayload => {
	const fmt = (cents: number) => formatMoney(cents, input.currency);
	const pct = (part: number, whole: number): string => {
		if (whole === 0) return "—";
		const v = (part / whole) * 100;
		return `${v.toFixed(v < 10 ? 1 : 0)}%`;
	};

	const outstanding = Math.max(0, input.totals.net - input.totals.paid);

	return {
		...businessHeader(input.settings),
		currency_code: input.currency.code,
		title: "Payroll register",
		subtitle: "Issued payslips whose period falls in this range. Gross earnings, deductions and net pay per employee.",
		period_label: formatPeriodLabel(input.dateFrom, input.dateTo),
		generated_at: todayISO(),
		summary: [
			{
				label: "Gross earnings",
				value: fmt(input.totals.earnings),
				sub: `${input.totals.payslipCount} payslip${input.totals.payslipCount === 1 ? "" : "s"} · ${input.totals.employeeCount} employee${input.totals.employeeCount === 1 ? "" : "s"}`,
				tone: "neutral"
			},
			{
				label: "Net pay",
				value: fmt(input.totals.net),
				sub: input.totals.earnings === 0
					? "No payroll in this period"
					: `After ${fmt(input.totals.deductions)} deductions`,
				tone: "success"
			},
			{
				label: outstanding === 0 ? "Paid out" : "Outstanding",
				value: outstanding === 0
					? fmt(input.totals.paid)
					: fmt(outstanding),
				sub: outstanding === 0
					? "All payslips fully paid"
					: `${fmt(input.totals.paid)} paid so far`,
				tone: outstanding === 0 ? "success" : "error"
			}
		],
		breakdown: input.employeeRows.length === 0
			? null
			: {
				title: "By employee",
				rows: input.employeeRows.map((r) => ({
					label: r.name,
					sublabel: `${r.payslipCount} payslip${r.payslipCount === 1 ? "" : "s"} · net ${fmt(r.net)}`,
					amount: fmt(r.earnings),
					percent: pct(r.earnings, input.totals.earnings),
					tone: "neutral"
				})),
				total: {
					label: "Total gross",
					sublabel: null,
					amount: fmt(input.totals.earnings),
					percent: "100%",
					tone: "neutral"
				}
			},
		details: input.payslips.length === 0
			? null
			: [
				{
					title: `Payslips (${input.payslips.length})`,
					// 5 columns — matches the existing 5-col template case
					// (Number / Date / Party / Subtotal / Tax shape). The
					// Deductions column lives on-screen only; deductions
					// = earnings − net and the PDF reader can do the
					// arithmetic if they need it.
					columns: ["Number", "Period end", "Employee", "Earnings", "Net"],
					rows: input.payslips.map((r) => [
						r.number,
						r.period_end,
						r.employee_name || "—",
						fmt(r.earnings_cents),
						fmt(r.net_cents)
					])
				}
			]
	};
};
