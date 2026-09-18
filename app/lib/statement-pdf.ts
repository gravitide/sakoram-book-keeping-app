// Customer statement PDF — payload builder for `export_statement_pdf`.
//
// A statement is a point-in-time snapshot of one client's outstanding
// invoices: every sent / partial / overdue invoice with the running
// total, paid, and balance, plus an aging summary (Current / 1-30 /
// 31-60 / 61-90 / 90+). Not a stored document — generated ad-hoc and
// either printed, emailed, or saved as a PDF.
//
// Shape is fixed by `src-tauri/templates/statement.typ`. The template
// reads `data.json` (this payload, JSON-serialised by the Rust render
// pipeline) and `logo.<ext>` if a header logo is configured.
//
// The "outstanding" filter excludes draft, cancelled, and fully-paid
// invoices via `derivedStatus`. Sort order is oldest-first (issue_date
// ascending) so the longest-outstanding rows lead the table — the
// collections-chasing user wants to see those first.

import type { BusinessBankRow } from "~/stores/business_banks";
import type { ClientRow } from "~/stores/clients";
import type { InvoiceRow } from "~/stores/invoices";
import type { CompanySettingsRow } from "~/stores/settings";
import { formatMoney } from "./money";
import { buildFooterBlocks } from "./pdf-chrome";
import { pdfThemeHex } from "./theme";

// One row in the statement's invoice table.
interface StatementRow {
	number: string
	issue_date: string
	due_date: string
	total: string
	paid: string
	balance: string
	status: string
	tone: "neutral" | "warning" | "error"
}

interface StatementBucketTile {
	label: string
	count: number
	amount: string
	tone: "success" | "warning" | "error" | "neutral"
}

interface StatementBankLine {
	label: string
	value: string
}

interface StatementPdfPayload {
	// Identity / branding
	business_name: string | null
	business_address: string | null
	business_tax_id: string | null
	business_phone: string | null
	website: string | null
	phone: string | null
	logo_path: string | null
	theme_color: string
	font_family: string | null
	currency_code: string

	// Document chrome
	title: string
	as_of_date: string

	// Client (statement target)
	client_name: string
	client_address: string | null
	client_tax_id: string | null
	client_email: string | null

	// Headline totals
	invoice_count: number
	/// Closing balance the client owes — invoice balances less any
	/// unapplied credit. This is the figure to pay.
	total_balance: string
	/// Sum of invoice balances BEFORE unapplied credit is deducted, and
	/// the credit itself. Both null when there is no unapplied credit, so
	/// the template renders exactly as it did before this existed.
	gross_balance: string | null
	unapplied_credit: string | null

	// Tiles + table
	aging_buckets: StatementBucketTile[]
	rows: StatementRow[]
	totals_row: { total: string, paid: string, balance: string }

	// Optional bank-details block
	bank_block: StatementBankLine[] | null

	// Footer copy
	notes: string | null
}

export interface CustomerStatementPdfInput {
	settings: CompanySettingsRow | null
	currency: { code: string, symbol: string, locale: string, decimals: number }
	client: ClientRow
	openInvoices: InvoiceRow[]
	paidCentsFor: (invoiceId: number) => number
	/// Issued credit notes settled against a given invoice. Injected the
	/// same way as `paidCentsFor` so this module stays store-free and
	/// unit-testable. Both reduce an invoice's balance identically —
	/// omitting this would print pre-credit balances on the statement.
	creditedCentsFor: (invoiceId: number) => number
	/// Issued credit notes for this client with NO source invoice. These
	/// can't be attributed to a row, so they appear as a single deduction
	/// line above the closing total rather than inside the table.
	unappliedCreditCents: number
	asOfDate?: Date
	bank?: BusinessBankRow | null
}

// Format YYYY-MM-DD → "May 27, 2026". Falls back to the raw ISO string
// when the date is malformed so we never lose info on a bad row.
const formatLong = (iso: string): string => {
	const [y, mo, d] = iso.split("-").map(Number);
	if (!y || !mo || !d) return iso;
	return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric"
	});
};

// Whole-day difference between two ISO dates (b − a), positive when b
// is later. Used to compute days-past-due against the "as of" date.
const daysBetween = (aIso: string, bIso: string): number => {
	const a = new Date(`${aIso}T00:00:00`);
	const b = new Date(`${bIso}T00:00:00`);
	const diff = b.getTime() - a.getTime();
	return Math.round(diff / 86400000);
};

const toIso = (d: Date): string =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const buildCustomerStatementPdfPayload = (
	input: CustomerStatementPdfInput
): StatementPdfPayload => {
	const asOf = input.asOfDate ?? new Date();
	const asOfIso = toIso(asOf);

	const fmt = (cents: number) => formatMoney(cents, input.currency);
	const fmtBare = (cents: number) =>
		formatMoney(cents, input.currency).replace(/^[^\d\-−]+/, "").trim();

	// Sort oldest issue date first — collections-chasing user wants the
	// most overdue rows at the top of the table.
	const ordered = [...input.openInvoices].sort((a, b) =>
		a.issue_date.localeCompare(b.issue_date)
	);

	// Bucket each open invoice by days past due, accumulating both count
	// and amount per bucket. Bucket-by-due-date is the standard aging
	// convention (not issue date).
	const buckets = {
		current: { count: 0, amount: 0 },
		b1to30: { count: 0, amount: 0 },
		b31to60: { count: 0, amount: 0 },
		b61to90: { count: 0, amount: 0 },
		b90plus: { count: 0, amount: 0 }
	};

	let totalBalance = 0;
	let totalGross = 0;
	let totalPaid = 0;

	const rows: StatementRow[] = ordered.map((inv) => {
		const paid = input.paidCentsFor(inv.id);
		// Credit notes reduce the balance exactly as receipts do. Rolled
		// into `paid` for the row's Paid column: from the client's point of
		// view the invoice has been settled to that extent, and splitting
		// it into a fourth column would crowd an already 7-column table.
		const credited = input.creditedCentsFor(inv.id);
		const settled = paid + credited;
		const balance = Math.max(0, inv.total_cents - settled);
		const daysPast = daysBetween(inv.due_date, asOfIso);

		totalBalance += balance;
		totalGross += inv.total_cents;
		totalPaid += settled;

		let bucketKey: keyof typeof buckets;
		if (daysPast <= 0) bucketKey = "current";
		else if (daysPast <= 30) bucketKey = "b1to30";
		else if (daysPast <= 60) bucketKey = "b31to60";
		else if (daysPast <= 90) bucketKey = "b61to90";
		else bucketKey = "b90plus";

		buckets[bucketKey].count += 1;
		buckets[bucketKey].amount += balance;

		// Status cell: "Current" / "Due today" / "X days overdue". The
		// PDF eye doesn't need the full "partial vs overdue" distinction
		// — the Paid column already shows whether anything was paid;
		// what matters is "how late?".
		let status: string;
		let tone: StatementRow["tone"];
		if (daysPast < 0) {
			status = `Due in ${Math.abs(daysPast)} day${Math.abs(daysPast) === 1 ? "" : "s"}`;
			tone = "neutral";
		} else if (daysPast === 0) {
			status = "Due today";
			tone = "warning";
		} else if (daysPast <= 30) {
			status = `${daysPast} day${daysPast === 1 ? "" : "s"} overdue`;
			tone = "warning";
		} else {
			status = `${daysPast} days overdue`;
			tone = "error";
		}

		return {
			number: inv.number,
			issue_date: inv.issue_date,
			due_date: inv.due_date,
			total: fmtBare(inv.total_cents),
			// `settled`, not `paid` — the row must satisfy
			// total − paid = balance or the client reads it as an error.
			// Credits are a settlement from their point of view.
			paid: settled > 0 ? fmtBare(settled) : "—",
			balance: fmtBare(balance),
			status,
			tone
		};
	});

	// Compose the aging summary tiles in the same left-to-right order
	// the aged-receivables page uses. Tone matches the on-screen badge:
	// Current → success, 1-60 → warning creep, 61+ → error.
	// Unapplied credit is capped at the invoice-balance total so a statement
	// can never show a negative amount due — "we owe you" is not something
	// this document is designed to express, and a negative closing figure
	// would read as an error to the client.
	const unapplied = Math.min(Math.max(0, input.unappliedCreditCents), totalBalance);
	const closingBalance = totalBalance - unapplied;

	const aging_buckets: StatementBucketTile[] = [
		{ label: "Current", count: buckets.current.count, amount: fmtBare(buckets.current.amount), tone: "success" },
		{ label: "1–30", count: buckets.b1to30.count, amount: fmtBare(buckets.b1to30.amount), tone: "warning" },
		{ label: "31–60", count: buckets.b31to60.count, amount: fmtBare(buckets.b31to60.amount), tone: "warning" },
		{ label: "61–90", count: buckets.b61to90.count, amount: fmtBare(buckets.b61to90.amount), tone: "error" },
		{ label: "90+", count: buckets.b90plus.count, amount: fmtBare(buckets.b90plus.amount), tone: "error" }
	];

	// Client address — same composition as the invoice / quote builders:
	// flatten the address lines + a "city postal_code" combo + country,
	// dropping blanks, joining with a comma so the block reads as prose.
	const cityLine = [input.client.city, input.client.postal_code]
		.filter(Boolean)
		.join(" ")
		.trim();
	const client_address = [
		input.client.address_line1,
		input.client.address_line2,
		cityLine || null,
		input.client.country
	].filter((s): s is string => Boolean(s && s.trim())).join(", ") || null;

	// Business address — same rules against settings.
	const bizCityLine = [input.settings?.city, input.settings?.postal_code]
		.filter(Boolean)
		.join(" ")
		.trim();
	const business_address = [
		input.settings?.address_line1,
		input.settings?.address_line2,
		bizCityLine || null,
		input.settings?.country
	].filter((s): s is string => Boolean(s && s.trim())).join(", ") || null;

	// Bank-details block — optional. Only emitted when at least one
	// field is filled so we don't print an empty card.
	let bank_block: StatementBankLine[] | null = null;
	const b = input.bank ?? null;
	if (b) {
		const lines: StatementBankLine[] = [];
		if (b.bank_name) lines.push({ label: "Bank", value: b.bank_name });
		if (b.bank_branch) lines.push({ label: "Branch", value: b.bank_branch });
		if (b.bank_account_name) lines.push({ label: "Account name", value: b.bank_account_name });
		if (b.bank_account_number) lines.push({ label: "Account number", value: b.bank_account_number });
		if (lines.length > 0) bank_block = lines;
	}

	return {
		business_name: input.settings?.business_name ?? null,
		business_address,
		business_tax_id: input.settings?.tax_id ?? null,
		business_phone: input.settings?.phone ?? null,
		website: input.settings?.website ?? null,
		phone: input.settings?.phone ?? null,
		logo_scale: input.settings?.pdf_logo_scale ?? 100,
		footer_blocks: buildFooterBlocks(input.settings),
		logo_path: input.settings?.pdf_header_logo_path ?? null,
		theme_color: pdfThemeHex(input.settings),
		font_family: input.settings?.pdf_font ?? null,
		currency_code: input.currency.code,

		title: `Statement of account — ${input.client.name}`,
		as_of_date: formatLong(asOfIso),

		client_name: input.client.name,
		client_address,
		client_tax_id: input.client.tax_id ?? null,
		client_email: input.client.email ?? null,

		invoice_count: rows.length,
		total_balance: fmt(closingBalance),
		gross_balance: unapplied === 0 ? null : fmt(totalBalance),
		unapplied_credit: unapplied === 0 ? null : fmt(unapplied),

		aging_buckets,
		rows,
		totals_row: {
			total: fmtBare(totalGross),
			paid: fmtBare(totalPaid),
			// The table's own Balance column stays the sum of its rows —
			// unapplied credit is deducted below it, not inside it, because
			// it belongs to no invoice row.
			balance: fmt(totalBalance)
		},

		bank_block,
		notes: rows.length === 0
			? "No outstanding invoices for this client. All settled — thank you!"
			: "Please remit the outstanding balance at your earliest convenience. Reference the invoice numbers above on your payment."
	};
};

// Filesystem-safe filename stem. Used by usePdfPreview so two
// statements for the same client overwrite the same temp file rather
// than piling up. The "_statement" suffix disambiguates from the
// invoice list filter on the same client.
export const customerStatementFileName = (clientName: string): string => {
	const slug = clientName
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, "")
		.trim()
		.replace(/\s+/g, "_")
		.slice(0, 60) || "client";
	return `${slug}_statement.pdf`;
};
