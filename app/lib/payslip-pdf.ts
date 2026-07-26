// Shared payload builder for the payslip Typst template.
//
// Both the detail page (where the user clicks the PDF button) and
// the list page (right-click → Generate PDF) need to build the same
// JSON shape. Pulling this into one place keeps the two callers
// honest — change the template and you only update one builder.
//
// The function is purely transformational: input is a payslip row +
// its lines + the relevant settings + the active currency; output is
// the JSON object the Rust side hands to Typst as data.json.

import type { CurrencyMeta } from "~/lib/money";
import type { EmployeeSnapshot, PayslipLineRow, PayslipRow } from "~/stores/payslips";
import type { CompanySettingsRow } from "~/stores/settings";
import { formatLKR } from "~/lib/money";
import { pdfThemeHex } from "~/lib/theme";

export interface PayslipPdfPayloadArgs {
	row: PayslipRow
	lines: Pick<PayslipLineRow, "kind" | "label" | "amount_cents">[]
	settings: CompanySettingsRow | null
	currency: CurrencyMeta
	paidCents: number
	balanceCents: number
}

export function buildPayslipPdfPayload(args: PayslipPdfPayloadArgs): Record<string, unknown> {
	const { row, lines, settings, currency, paidCents, balanceCents } = args;

	let employee: EmployeeSnapshot | null = null;
	try {
		employee = JSON.parse(row.employee_snapshot) as EmployeeSnapshot;
	} catch {
		employee = null;
	}

	const earnings = lines
		.filter((l) => l.kind === "earning")
		.map((l) => ({
			label: l.label || "(unnamed)",
			amount_display: formatLKR(l.amount_cents, { withSymbol: false })
		}));
	const deductions = lines
		.filter((l) => l.kind === "deduction")
		.map((l) => ({
			label: l.label || "(unnamed)",
			amount_display: formatLKR(l.amount_cents, { withSymbol: false })
		}));

	const earningsTotal = lines
		.filter((l) => l.kind === "earning")
		.reduce((s, l) => s + l.amount_cents, 0);
	const deductionsTotal = lines
		.filter((l) => l.kind === "deduction")
		.reduce((s, l) => s + l.amount_cents, 0);
	const net = Math.max(0, earningsTotal - deductionsTotal);

	return {
		number: row.number,
		theme_color: pdfThemeHex(settings),
		font_family: settings?.pdf_font ?? "Akt",
		currency_code: currency.code,
		currency_symbol: currency.symbol,
		period_start: row.period_start,
		period_end: row.period_end,
		period_display: `${row.period_start} → ${row.period_end}`,
		pay_date: row.pay_date,
		employee: {
			full_name: employee?.full_name ?? "(unknown)",
			employee_number: employee?.employee_number ?? null,
			designation: employee?.designation ?? null,
			nic: employee?.nic ?? null,
			bank_name: employee?.bank_name ?? null,
			bank_branch: employee?.bank_branch ?? null,
			bank_account_number: employee?.bank_account_number ?? null,
			bank_account_name: employee?.bank_account_name ?? null
		},
		earnings,
		deductions,
		formatted: {
			earnings: formatLKR(earningsTotal, { withSymbol: false }),
			deductions: formatLKR(deductionsTotal, { withSymbol: false }),
			net: formatLKR(net, { withSymbol: false })
		},
		paid_cents: paidCents > 0 ? paidCents : null,
		paid_display: paidCents > 0 ? formatLKR(paidCents, { withSymbol: false }) : null,
		balance_display: paidCents > 0 ? formatLKR(balanceCents, { withSymbol: false }) : null,
		statutory_enabled: (row.statutory_enabled ?? 0) === 1,
		epf_employer_display: row.epf_employer_cents > 0 ? formatLKR(row.epf_employer_cents, { withSymbol: false }) : null,
		etf_display: row.etf_cents > 0 ? formatLKR(row.etf_cents, { withSymbol: false }) : null,
		total_cost_display: formatLKR(earningsTotal + row.epf_employer_cents + row.etf_cents, { withSymbol: false }),
		show_signatures: (settings?.payslip_show_signatures ?? 0) === 1,
		notes: row.notes,
		business_name: settings?.business_name ?? null,
		website: settings?.website ?? null,
		phone: settings?.phone ?? null,
		address_line1: settings?.address_line1 ?? null,
		city: settings?.city ?? null,
		logo_path: settings?.pdf_header_logo_path ?? null
	};
}
