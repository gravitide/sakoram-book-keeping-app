// Renders every PDF template through the REAL bundled Typst sidecar, using
// payloads built by the REAL shipped builders in app/lib, and compares each
// PDF's sha256 with the stored baseline in scripts/pdf-render-baselines.json.
//
// Why: a Typst template change is invisible to vitest (it only sees JSON
// payloads), and a "harmless" refactor of page setup, imports or definition
// order can silently move a margin or break a branch nobody rendered. This is
// the permanent guard: if a template's output changes, the hash changes.
//
// Run:     bun run verify:pdf
// Update:  bun run verify:pdf --update     (re-captures every baseline; only
//          after you have LOOKED at the new output and meant the change)
// Inspect: bun run verify:pdf --keep <dir> (also writes each PDF, and a PNG
//          of every page, to <dir>)
//
// Page numbers: besides the hash, every case is checked for "Page N of M" —
// on every page of a multi-page document, on none of a single-page one. A
// case that runs past one page must say `multipage: true` (checked against
// the real page count), and gets an `~unnumbered` twin rendered with page
// numbers switched off: its baseline is the document as it was before page
// numbers, so the numbered render can only differ by the numbers.
//
// Business identity: every case on Stationery that owns the page edges
// (`page.chrome` false) is read back as text (scripts/pdf-text.ts) and must not
// print the business's address, phone or website.
//
// The Typst binary is the sidecar the app bundles:
// src-tauri/binaries/typst-<target-triple>[.exe] (gitignored — copy it in, see
// .gitignore), or point SAKORAM_TYPST_BIN at one. Hashes are only meaningful
// for the Typst version recorded in the baseline file; a different version is
// refused rather than reported as forty mismatches.
//
// Determinism: --creation-timestamp pins the PDF date, --ignore-system-fonts
// makes glyph fallback use only the bundled + Typst-embedded fonts (so the
// hashes don't depend on what the machine has installed), and every
// date-derived string the builders compute from "today" is pinned below.
//
// Every case that can show a header logo renders with a REAL logo image (the
// Rust side's logo_path → logo_file copy is mirrored here), because the
// wordmark fallback alone once hid a template that failed whenever a logo was
// set (see the "definition order" landmine in CLAUDE.md).
//
// Full-page background cases render with REAL artwork in each format the app
// accepts (SVG, PNG, PDF — scripts/fixtures/stationery/), staged the way the
// Rust renderer stages it (stage_background in pdf.rs).

import type { Buffer } from "node:buffer";
import type { LetterRow } from "../app/stores/letters";
import type { PayslipRow } from "../app/stores/payslips";
import type { QuoteLineRow } from "../app/stores/quotes";
import type { CompanySettingsRow } from "../app/stores/settings";
import type { VoucherRow } from "../app/stores/vouchers";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildBillPdfPayload } from "../app/lib/bill-pdf.ts";
import { DEMO_LETTERHEAD_ACCENT, demoLetterheadSettings } from "../app/lib/demo-letterhead.ts";
import { buildInvoicePdfPayload } from "../app/lib/invoice-pdf.ts";
import { buildLetterPdfPayload } from "../app/lib/letter-pdf.ts";
import { CURRENCIES } from "../app/lib/money.ts";
import { buildPayslipPdfPayload } from "../app/lib/payslip-pdf.ts";
import { buildQuotePdfPayload } from "../app/lib/quote-pdf.ts";
import { buildAgedReceivablesPdfPayload, buildCashFlowPdfPayload, buildPnlPdfPayload } from "../app/lib/report-pdf.ts";
import { sampleInvoicePayload, sampleStationeryPreviewPayload } from "../app/lib/sample-pdf.ts";
import { buildCustomerStatementPdfPayload } from "../app/lib/statement-pdf.ts";
import { buildVoucherPdfPayload } from "../app/lib/voucher-pdf.ts";
import { pdfPageTexts } from "./pdf-text.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(REPO, "src-tauri/templates");
const FONTS = join(REPO, "src-tauri/fonts");
const LOGO = join(REPO, "src-tauri/icons/128x128.png");
// Stands in for the business folder: Full-page background artwork is read from
// <folder>/stationery/background.<ext>, exactly as the app reads it.
const BUSINESS_FOLDER = join(REPO, "scripts/fixtures");
// The demo business's bundled letterhead, staged into a throwaway business
// folder exactly where the demo seed writes it (stationery/background.svg).
const DEMO_FOLDER = mkdtempSync(join(tmpdir(), "sakoram-demo-folder-"));
mkdirSync(join(DEMO_FOLDER, "stationery"));
copyFileSync(join(REPO, "app/assets/stationery/demo-letterhead.svg"), join(DEMO_FOLDER, "stationery/background.svg"));
process.on("exit", () => rmSync(DEMO_FOLDER, { recursive: true, force: true }));
const BASELINES = join(REPO, "scripts/pdf-render-baselines.json");
const CREATION_TIMESTAMP = "1767225600"; // 2026-01-01T00:00:00Z

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const keepIdx = args.indexOf("--keep");
const KEEP_DIR = keepIdx >= 0 ? args[keepIdx + 1] : undefined;
// --only <text>: render just the cases whose name contains <text> (for
// iterating on one template). Never with --update — that would drop every
// other baseline.
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;
if (ONLY !== undefined && UPDATE) {
	console.error("✗ --only can't be combined with --update (it would drop every other baseline)");
	process.exit(1);
}

// --- typst binary ----------------------------------------------------------

const targetTriple = (): string => {
	const { platform, arch } = process;
	if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
	if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
	if (platform === "darwin" && arch === "x64") return "x86_64-apple-darwin";
	if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
	throw new Error(`no known Typst sidecar triple for ${platform}/${arch}; set SAKORAM_TYPST_BIN`);
};

const TYPST = process.env.SAKORAM_TYPST_BIN
	?? join(REPO, "src-tauri/binaries", `typst-${targetTriple()}${process.platform === "win32" ? ".exe" : ""}`);

if (!existsSync(TYPST)) {
	console.error(`✗ Typst sidecar not found at ${TYPST}\n  Copy the bundled binary there, or set SAKORAM_TYPST_BIN.`);
	process.exit(1);
}
const typstVersion = spawnSync(TYPST, ["--version"], { encoding: "utf8" }).stdout.trim().split(/\s+/)[1] ?? "unknown";

// --- fixtures --------------------------------------------------------------

const LKR = CURRENCIES.LKR!;
const currency = { code: LKR.code, symbol: LKR.symbol };

const richText = (...paragraphs: string[]) => JSON.stringify({
	type: "doc",
	content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] }))
});

const settingsFor = (overrides: Partial<CompanySettingsRow> = {}): CompanySettingsRow => ({
	id: 1,
	business_name: "Lanka Design Studio (Pvt) Ltd",
	address_line1: "42 Galle Road",
	address_line2: null,
	city: "Colombo 03",
	postal_code: "00300",
	country: "Sri Lanka",
	tax_id: "134567890-7000",
	email: "hello@lankadesign.lk",
	phone: "+94 11 234 5678",
	website: "lankadesign.lk",
	logo_path: null,
	pdf_header_logo_path: LOGO,
	default_vat_rate: 1800,
	default_payment_terms_days: 30,
	default_quote_validity_days: 30,
	invoice_footer_notes: null,
	quote_footer_notes: null,
	default_prepared_by: null,
	fiscal_year_start_month: 4,
	currency_code: "LKR",
	currency_symbol_override: null,
	ui_font: "Akt",
	pdf_font: "Akt",
	pdf_layout: "classic",
	pdf_stationery_mode: "builtin",
	// Not the 55 / 20 defaults, so Pre-printed paper cases (and letters set to
	// pre-printed paper) prove the business's own Stationery bands reach the page.
	pdf_stationery: JSON.stringify({ preprinted: { top: 48, right: 16, bottom: 24, left: 16 } }),
	pdf_paper_size: "a4",
	theme_color: "green",
	pdf_theme_color: "blue",
	payroll_period_start_day: 1,
	payroll_period_end_day: 31,
	payroll_pay_day: 31,
	statutory_auto_compute: 1,
	epf_employee_rate_bp: 800,
	epf_employer_rate_bp: 1200,
	etf_rate_bp: 300,
	paye_auto_compute: 0,
	paye_relief_cents: 15000000,
	paye_deduct_epf: 1,
	paye_brackets: "[]",
	pdf_protect_password: null,
	pdf_protect_quote: 0,
	pdf_protect_invoice: 0,
	pdf_protect_bill: 0,
	pdf_protect_voucher: 0,
	pdf_protect_payslip: 0,
	payslip_show_signatures: 1,
	pdf_logo_scale: 100,
	pdf_logo_crop: null,
	logo_crop: null,
	pdf_header_custom: 0,
	pdf_header_text: null,
	pdf_footer_custom: 0,
	pdf_footer_text: null,
	updated_at: "2026-01-01 00:00:00",
	...overrides
});

const noLogo = { pdf_header_logo_path: null };
// The demo business: its bundled letterhead, Safe area and PDF accent.
const demoSettings = () => settingsFor({ ...demoLetterheadSettings(null), pdf_theme_color: DEMO_LETTERHEAD_ACCENT });
const preprintedPaper = { pdf_stationery_mode: "preprinted" };
// Full-page background with artwork of the given format. Its margins (44 / 22,
// sides 20) differ from both the defaults and the Pre-printed bands above, so
// the cases prove the background's own margins bound the Safe area.
const fullPageBackground = (ext: "svg" | "png" | "jpg" | "pdf" | null = "svg") => ({
	pdf_stationery_mode: "background",
	pdf_stationery: JSON.stringify({
		preprinted: { top: 48, right: 16, bottom: 24, left: 16 },
		background: { ext, paper: "a4", crop: null, live_text: false, margins: { top: 44, right: 20, bottom: 22, left: 20 } }
	})
});
const customChrome = {
	pdf_header_custom: 1,
	pdf_header_text: richText("{business_name}", "{address}, {city}", "Tax ID {tax_id}"),
	pdf_footer_custom: 1,
	pdf_footer_text: richText("{business_name} · {phone} · {website}")
};

const clientSnapshot = JSON.stringify({
	name: "Acme (Pvt) Ltd",
	tax_id: "987654321-7000",
	address_line1: "12 Marine Drive",
	address_line2: null,
	city: "Colombo",
	postal_code: "00300",
	country: "Sri Lanka"
});
const bankSnapshot = JSON.stringify({
	bank_name: "Sampath Bank",
	bank_branch: "Colombo",
	bank_account_number: "0011 2233 4455",
	bank_account_name: "Lanka Design Studio (Pvt) Ltd"
});

const docLines = (count: number): QuoteLineRow[] => Array.from({ length: count }, (_, i) => ({
	id: i + 1,
	quote_id: 1,
	position: i,
	item_label: `Item ${i + 1}`,
	description: i % 3 === 0 ? "Design, build and handover — includes two revision rounds" : "Consulting hours",
	quantity_milli: 2000 + i * 500,
	unit: "hrs",
	unit_price_cents: 1250000,
	tax_rate_basis_points: 1800,
	line_subtotal_cents: 2500000,
	line_tax_cents: 450000,
	line_total_cents: 2950000
}) as unknown as QuoteLineRow);

const docRow = {
	id: 1,
	number: "INV-0042",
	client_id: 1,
	client_snapshot: clientSnapshot,
	client_name: "Acme (Pvt) Ltd",
	issue_date: "2026-06-22",
	due_date: "2026-07-22",
	valid_until: "2026-07-22",
	status: "sent",
	pricing_mode: "itemized",
	project_title: "Website redesign",
	vat_rate_basis_points: 1800,
	subtotal_cents: 7500000,
	tax_cents: 1350000,
	total_cents: 8850000,
	notes: richText("Thank you for your business.", "Payment within 30 days."),
	terms: null,
	prepared_by: richText("Nimal Perera", "Accounts"),
	bank_details_snapshot: bankSnapshot,
	include_bank_details: 1,
	business_bank_id: 1,
	title_override: null,
	vendor_snapshot: JSON.stringify({ name: "Office Supplies Lanka", address_line1: "8 Union Place", city: "Colombo 02" }),
	vendor_invoice_number: "OSL-7781",
	category_snapshot: JSON.stringify({ name: "Office supplies" }),
	created_at: "2026-06-22 00:00:00",
	updated_at: "2026-06-22 00:00:00"
};

const invoice = (settings: CompanySettingsRow, lineCount = 3) => buildInvoicePdfPayload({
	row: docRow as never,
	lines: docLines(lineCount) as never,
	settings,
	currency,
	paidCents: 5000000,
	creditedCents: 1000000
});

const payslipRow = {
	id: 1,
	number: "PSL-0007",
	employee_id: 1,
	employee_snapshot: JSON.stringify({
		full_name: "Kamala Jayasinghe",
		employee_number: "E-014",
		designation: "Senior Designer",
		nic: "199012345678",
		bank_name: "Commercial Bank",
		bank_branch: "Kollupitiya",
		bank_account_number: "8001234567",
		bank_account_name: "K Jayasinghe"
	}),
	period_start: "2026-06-01",
	period_end: "2026-06-30",
	pay_date: "2026-06-30",
	status: "issued",
	notes: "June salary",
	statutory_enabled: 1,
	epf_employee_cents: 1200000,
	epf_employer_cents: 1800000,
	etf_cents: 450000
} as unknown as PayslipRow;

// `extraEarnings` pads the earnings column until the payslip spills onto a
// second page.
const payslip = (settings: CompanySettingsRow, extraEarnings = 0) => buildPayslipPdfPayload({
	row: payslipRow,
	lines: [
		{ kind: "earning", label: "Basic", amount_cents: 15000000 },
		{ kind: "earning", label: "Transport allowance", amount_cents: 1000000 },
		...Array.from({ length: extraEarnings }, (_, i) => ({ kind: "earning" as const, label: `Project allowance ${i + 1}`, amount_cents: 100000 })),
		{ kind: "deduction", label: "EPF (8%)", amount_cents: 1200000 },
		{ kind: "deduction", label: "Salary advance", amount_cents: 500000 }
	],
	settings,
	currency: LKR,
	paidCents: 10000000,
	balanceCents: 4300000
});

const voucherRow = {
	id: 1,
	number: "VCH-0019",
	voucher_type: "receipt",
	voucher_date: "2026-06-25",
	party_name: "Acme (Pvt) Ltd",
	amount_cents: 5000000,
	payment_method: "bank_transfer",
	reference: "TXN-55821",
	description: "Part payment for INV-0042",
	related_invoice_id: 1,
	related_bill_id: null,
	related_payslip_id: null,
	business_bank_id: 1,
	reconciled_at: null,
	created_at: "2026-06-25 00:00:00"
} as unknown as VoucherRow;

const voucher = (settings: CompanySettingsRow, description = voucherRow.description) =>
	buildVoucherPdfPayload({ row: { ...voucherRow, description }, settings, currency, relatedLabel: "Invoice INV-0042" });

// A description long enough to push a voucher onto a second page.
const longDescription = Array.from({ length: 60 }, (_, i) => `Instalment ${i + 1} of the website redesign retainer, received by bank transfer.`).join("\n");

// `extraParagraphs` lengthens the body until the letter runs past one page.
const letterRow = (prePrinted: boolean, extraParagraphs = 0): LetterRow => ({
	id: 1,
	number: "LET-0003",
	letter_date: "2026-06-20",
	category: "Service letter",
	recipient_name: "To whom it may concern",
	recipient_address: "Colombo",
	subject: "Confirmation of employment",
	body_json: richText(
		"This is to confirm that Kamala Jayasinghe has been employed with us since 2021.",
		"She holds the position of Senior Designer.",
		...Array.from({ length: extraParagraphs }, (_, i) => `Paragraph ${i + 1}: during her time with us she has led client projects from brief to handover, mentored junior designers, and represented the studio at industry events with distinction.`)
	),
	signature_json: richText("Nimal Perera", "Director"),
	pre_printed: prePrinted ? 1 : 0,
	created_at: "2026-06-20 00:00:00",
	updated_at: "2026-06-20 00:00:00"
});

// The landscape statement spills its payment-details block onto page 2;
// without a bank it fits on one page.
const statement = (settings: CompanySettingsRow, withBank = true) => ({
	...buildCustomerStatementPdfPayload({
		settings,
		currency: { ...LKR, decimals: 2 },
		client: {
			id: 1,
			name: "Acme (Pvt) Ltd",
			email: "accounts@acme.lk",
			tax_id: "987654321-7000",
			address_line1: "12 Marine Drive",
			city: "Colombo",
			postal_code: "00300",
			country: "Sri Lanka"
		} as never,
		openInvoices: [
			{ id: 1, number: "INV-0040", issue_date: "2026-03-01", due_date: "2026-03-31", total_cents: 4000000 },
			{ id: 2, number: "INV-0041", issue_date: "2026-05-01", due_date: "2026-05-31", total_cents: 2500000 },
			{ id: 3, number: "INV-0042", issue_date: "2026-06-22", due_date: "2026-07-22", total_cents: 8850000 }
		] as never,
		paidCentsFor: (id) => (id === 3 ? 5000000 : 0),
		creditedCentsFor: (id) => (id === 3 ? 1000000 : 0),
		unappliedCreditCents: 200000,
		asOfDate: new Date(2026, 5, 30),
		bank: withBank
			? {
				label: "Main account",
				bank_name: "Sampath Bank",
				bank_branch: "Colombo",
				bank_account_number: "0011 2233 4455",
				bank_account_name: "Lanka Design Studio (Pvt) Ltd"
			} as never
			: null
	}),
	// Locale-formatted in the builder; pinned so the hash doesn't follow the
	// machine's locale.
	as_of_date: "June 30, 2026"
});

// Reports stamp `generated_at` with today's date and format their period with
// the machine's locale — both pinned.
const pinReport = (payload: object): Record<string, unknown> => ({ ...payload, generated_at: "2026-06-30", period_label: "Apr 1, 2026 → Jun 30, 2026" });

const pnl = (settings: CompanySettingsRow) => pinReport(buildPnlPdfPayload({
	settings,
	currency: LKR,
	dateFrom: "2026-04-01",
	dateTo: "2026-06-30",
	totals: {
		grossIncome: 25000000,
		creditNotes: 1000000,
		income: 24000000,
		bills: 6000000,
		payrollGross: 8000000,
		employerContrib: 1200000,
		payroll: 9200000,
		expenses: 15200000,
		net: 8800000,
		invoiceCount: 3,
		billCount: 2,
		payslipCount: 1
	},
	filtered: {
		invoices: [
			{ ...docRow, id: 1, number: "INV-0040", issue_date: "2026-04-10", subtotal_cents: 10000000 },
			{ ...docRow, id: 2, number: "INV-0041", issue_date: "2026-05-10", subtotal_cents: 7500000 },
			{ ...docRow, id: 3, number: "INV-0042", issue_date: "2026-06-22", subtotal_cents: 7500000 }
		] as never,
		bills: [
			{ ...docRow, number: "BIL-0011", vendor_name: "Office Supplies Lanka", subtotal_cents: 4000000 },
			{ ...docRow, number: "BIL-0012", vendor_name: "Dialog Axiata", subtotal_cents: 2000000 }
		] as never,
		payslips: [{ ...payslipRow, employee_name: "Kamala Jayasinghe", earnings_cents: 8000000 }] as never,
		creditNotes: [{ ...docRow, number: "CRN-0001", subtotal_cents: 1000000 }] as never
	}
}));

const agedReceivables = (settings: CompanySettingsRow) => pinReport(buildAgedReceivablesPdfPayload({
	settings,
	currency: LKR,
	asOfDate: new Date(2026, 5, 30),
	totals: {
		totalCurrent: 2850000,
		totalOverdue: 6500000,
		grossOutstanding: 9350000,
		totalUnapplied: 200000,
		totalOutstanding: 9150000,
		invoiceCount: 3,
		overdueCount: 2,
		currentCount: 1,
		clientCount: 2
	},
	buckets: [
		{ key: "current", label: "Current", count: 1, amount: 2850000 },
		{ key: "b1to30", label: "1–30 days", count: 1, amount: 2500000 },
		{ key: "b31to60", label: "31–60 days", count: 0, amount: 0 },
		{ key: "b61to90", label: "61–90 days", count: 1, amount: 4000000 },
		{ key: "b90plus", label: "90+ days", count: 0, amount: 0 }
	],
	clientRows: [
		{ clientId: 1, name: "Acme (Pvt) Ltd", invoiceCount: 2, current: 2850000, b1to30: 0, b31to60: 0, b61to90: 4000000, b90plus: 0, total: 6850000 },
		{ clientId: 2, name: "Ceylon Tea Traders", invoiceCount: 1, current: 0, b1to30: 2500000, b31to60: 0, b61to90: 0, b90plus: 0, total: 2500000 }
	]
}));

const cashFlow = (settings: CompanySettingsRow) => pinReport(buildCashFlowPdfPayload({
	settings,
	currency: LKR,
	dateFrom: "2026-04-01",
	dateTo: "2026-06-30",
	totals: { receipts: 12000000, payments: 7000000, net: 5000000, receiptCount: 2, paymentCount: 2 },
	monthlyRows: [
		{ key: "2026-04", label: "Apr 2026", receipts: 7000000, payments: 3000000, net: 4000000 },
		{ key: "2026-05", label: "May 2026", receipts: 0, payments: 4000000, net: -4000000 },
		{ key: "2026-06", label: "Jun 2026", receipts: 5000000, payments: 0, net: 5000000 }
	],
	filtered: {
		receipts: [
			{ number: "VCH-0011", voucher_date: "2026-04-15", party_name: "Acme (Pvt) Ltd", amount_cents: 7000000 },
			{ number: "VCH-0019", voucher_date: "2026-06-25", party_name: "Acme (Pvt) Ltd", amount_cents: 5000000 }
		],
		payments: [
			{ number: "VCH-0012", voucher_date: "2026-04-20", party_name: "Office Supplies Lanka", amount_cents: 3000000 },
			{ number: "VCH-0015", voucher_date: "2026-05-30", party_name: "Kamala Jayasinghe", amount_cents: 4000000 }
		]
	}
}));

// --- cases -----------------------------------------------------------------

interface Case {
	name: string
	template: string
	payload: Record<string, unknown>
	/**
	 * The fixture runs past one page. Checked, not trusted: a multi-page case
	 * that shrinks to one page would stop exercising "Page N of M". Each one
	 * also renders an `~unnumbered` twin with page numbers switched off, whose
	 * baseline is the document as it was before page numbers existed — so a
	 * numbered render can only ever differ from it by the numbers.
	 */
	multipage?: true
	/** Must render to exactly this many pages (on top of `multipage`). */
	pages?: number
	/**
	 * Only the checks run — page count, page numbers, identity, artwork — with
	 * no stored baseline and no `~unnumbered` twin. For wide grids that guard
	 * a property (the Stationery preview sample is always two pages) rather
	 * than pixels.
	 */
	checkOnly?: true
	/** Where Full-page background artwork is read from (default: the fixtures folder). */
	businessFolder?: string
	/** Must render byte-identically to this other case. */
	sameAs?: string
}

// Mirrors layout_template() in src-tauri/src/pdf.rs: unknown keys → classic.
const docTemplate = (payload: { layout?: unknown }): string => {
	const key = String(payload.layout ?? "");
	return ["modern", "minimal", "compact"].includes(key) ? `doc-${key}.typ` : "doc-classic.typ";
};

const docCase = (name: string, payload: Record<string, unknown>): Case => ({ name, template: docTemplate(payload), payload });

const LAYOUTS = ["classic", "modern", "minimal", "compact"] as const;
const OTHER_PAPERS = ["a5", "us-letter", "us-legal"] as const;

// The paper-size cases below that run past one page (A5 is small enough that
// most of them spill; reports and the statement do on every sheet).
const MULTIPAGE_ON_OTHER_PAPER = new Set([
	...LAYOUTS.map((key) => `invoice-${key}-a5`),
	"quote-classic-a5",
	"payslip-classic-a5",
	"payslip-compact-a5",
	...OTHER_PAPERS.flatMap((paper) => [`report-pnl-${paper}`, `statement-${paper}`])
]);

const ALL_PAPERS = ["a4", ...OTHER_PAPERS] as const;
const bands = (preprinted: object) => ({ pdf_stationery_mode: "preprinted", pdf_stationery: JSON.stringify({ preprinted }) });
// The Stationery the preview sample must stay two pages on.
const STATIONERY_PREVIEW_STATIONERY: [string, Partial<CompanySettingsRow>][] = [
	["builtin", {}],
	["background", fullPageBackground()],
	["background-wide-sides", { pdf_stationery_mode: "background", pdf_stationery: JSON.stringify({ background: { ext: "svg", paper: "a4", crop: null, live_text: false, margins: { top: 40, right: 40, bottom: 25, left: 40 } } }) }],
	["preprinted", preprintedPaper],
	["preprinted-shallow", bands({ top: 5, right: 5, bottom: 5, left: 5 })],
	["preprinted-deep", bands({ top: 60, right: 18, bottom: 30, left: 18 })]
];

const cases: Case[] = [
	// The four Layouts, each with a real logo.
	...LAYOUTS.map((key) => docCase(`invoice-${key}-logo`, invoice(settingsFor({ pdf_layout: key })))),
	docCase("invoice-classic-wordmark", invoice(settingsFor({ ...noLogo }))),
	docCase("invoice-modern-wordmark", invoice(settingsFor({ ...noLogo, pdf_layout: "modern" }))),
	docCase("invoice-classic-custom-chrome", invoice(settingsFor({ ...customChrome }))),
	docCase("invoice-compact-custom-chrome", invoice(settingsFor({ ...customChrome, pdf_layout: "compact" }))),
	// Long enough to spill onto a second page (footer on every page).
	{ ...docCase("invoice-classic-multipage", invoice(settingsFor(), 45)), multipage: true },
	// "Page N of M" on every Layout, every document type. Compact has the
	// shallowest gap above its footer and carries a custom footer, so it is
	// the case that would show a collision first.
	{ ...docCase("invoice-modern-multipage", invoice(settingsFor({ pdf_layout: "modern" }), 20)), multipage: true },
	{ ...docCase("invoice-minimal-multipage", invoice(settingsFor({ pdf_layout: "minimal" }), 20)), multipage: true },
	{ ...docCase("invoice-compact-custom-chrome-multipage", invoice(settingsFor({ ...customChrome, pdf_layout: "compact" }), 30)), multipage: true },
	{ ...docCase("quote-classic-multipage", buildQuotePdfPayload({ row: docRow as never, lines: docLines(20), settings: settingsFor(), currency })), multipage: true },
	{ ...docCase("bill-classic-multipage", buildBillPdfPayload({ row: docRow as never, lines: docLines(20) as never, settings: settingsFor(), currency, paidCents: 0 })), multipage: true },
	docCase("quote-classic-logo", buildQuotePdfPayload({ row: docRow as never, lines: docLines(3), settings: settingsFor(), currency })),
	docCase("quote-minimal-logo", buildQuotePdfPayload({ row: docRow as never, lines: docLines(3), settings: settingsFor({ pdf_layout: "minimal" }), currency })),
	docCase("bill-classic-logo", buildBillPdfPayload({ row: docRow as never, lines: docLines(2) as never, settings: settingsFor(), currency, paidCents: 2000000 })),
	docCase("bill-modern-logo", buildBillPdfPayload({ row: docRow as never, lines: docLines(2) as never, settings: settingsFor({ pdf_layout: "modern" }), currency, paidCents: 0 })),
	// Settings → PDF sample preview.
	docCase("sample-classic-logo", sampleInvoicePayload(settingsFor(), currency, "classic")),
	docCase("sample-modern-wordmark", sampleInvoicePayload(settingsFor({ ...noLogo }), currency, "modern")),

	// Payslip follows the selected layout through layout-config.
	...LAYOUTS.map((key): Case => ({ name: `payslip-${key}-logo`, template: "payslip.typ", payload: payslip(settingsFor({ pdf_layout: key })) })),
	{ name: "payslip-classic-wordmark", template: "payslip.typ", payload: payslip(settingsFor({ ...noLogo })) },
	{ name: "payslip-classic-custom-chrome", template: "payslip.typ", payload: payslip(settingsFor({ ...customChrome })) },
	{ name: "payslip-classic-multipage", template: "payslip.typ", payload: payslip(settingsFor(), 40), multipage: true },
	{ name: "payslip-compact-multipage", template: "payslip.typ", payload: payslip(settingsFor({ pdf_layout: "compact" }), 50), multipage: true },

	{ name: "voucher-logo", template: "voucher.typ", payload: voucher(settingsFor()) },
	{ name: "voucher-wordmark", template: "voucher.typ", payload: voucher(settingsFor({ ...noLogo })) },
	{ name: "voucher-custom-footer", template: "voucher.typ", payload: voucher(settingsFor({ ...customChrome })) },
	{ name: "voucher-multipage", template: "voucher.typ", payload: voucher(settingsFor(), longDescription), multipage: true },

	// Reports put each drill-down section on its own page, so every fixture
	// here runs past one page.
	{ name: "report-pnl-logo", template: "report.typ", payload: pnl(settingsFor()), multipage: true },
	{ name: "report-pnl-wordmark", template: "report.typ", payload: pnl(settingsFor({ ...noLogo })), multipage: true },
	{ name: "report-aged-receivables-logo", template: "report.typ", payload: agedReceivables(settingsFor()), multipage: true },
	{ name: "report-cash-flow-custom-footer", template: "report.typ", payload: cashFlow(settingsFor({ ...customChrome })), multipage: true },

	{ name: "statement-logo", template: "statement.typ", payload: statement(settingsFor()), multipage: true },
	{ name: "statement-wordmark", template: "statement.typ", payload: statement(settingsFor({ ...noLogo })), multipage: true },
	{ name: "statement-custom-footer", template: "statement.typ", payload: statement(settingsFor({ ...customChrome })), multipage: true },
	// Statements used to print "Page 1 of 1"; a single page now carries none.
	{ name: "statement-single-page", template: "statement.typ", payload: statement(settingsFor(), false) },

	{ name: "letter-logo", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false), settings: settingsFor() }) },
	{ name: "letter-wordmark", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false), settings: settingsFor({ ...noLogo }) }) },
	{ name: "letter-preprinted", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(true), settings: settingsFor() }) },
	{ name: "letter-preprinted-default-margins", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(true), settings: null }) },
	{ name: "letter-multipage", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false, 20), settings: settingsFor() }), multipage: true },
	{ name: "letter-preprinted-multipage", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(true, 20), settings: settingsFor() }), multipage: true },

	// Pre-printed paper Stationery, every template. The business HAS a logo and
	// (in the custom-chrome cases) header + footer text, so these prove all of
	// it is dropped: Layouts keep only title, number and accent rule; the
	// bespoke templates keep their own content. The Stationery's bands
	// (48 / 24 mm, sides 16) bound the Safe area, and "Page N of M" sits inside
	// it, at its bottom edge.
	// The bands take 77 mm of A4, so Classic and Minimal spill onto page 2.
	...LAYOUTS.map((key): Case => {
		const c = docCase(`invoice-${key}-preprinted`, invoice(settingsFor({ ...preprintedPaper, pdf_layout: key })));
		return key === "classic" || key === "minimal" ? { ...c, multipage: true } : c;
	}),
	{ ...docCase("invoice-classic-preprinted-custom-chrome", invoice(settingsFor({ ...preprintedPaper, ...customChrome }))), multipage: true },
	{ ...docCase("invoice-classic-preprinted-multipage", invoice(settingsFor({ ...preprintedPaper }), 30)), multipage: true },
	{ ...docCase("invoice-compact-preprinted-multipage", invoice(settingsFor({ ...preprintedPaper, ...customChrome, pdf_layout: "compact" }), 40)), multipage: true },
	docCase("quote-classic-preprinted", buildQuotePdfPayload({ row: docRow as never, lines: docLines(3), settings: settingsFor({ ...preprintedPaper }), currency })),
	docCase("bill-classic-preprinted", buildBillPdfPayload({ row: docRow as never, lines: docLines(2) as never, settings: settingsFor({ ...preprintedPaper }), currency, paidCents: 2000000 })),
	docCase("sample-classic-preprinted", sampleInvoicePayload(settingsFor({ ...preprintedPaper }), currency, "classic")),
	{ name: "payslip-classic-preprinted", template: "payslip.typ", payload: payslip(settingsFor({ ...preprintedPaper, ...customChrome })) },
	{ name: "payslip-minimal-preprinted", template: "payslip.typ", payload: payslip(settingsFor({ ...preprintedPaper, pdf_layout: "minimal" })) },
	{ name: "voucher-preprinted", template: "voucher.typ", payload: voucher(settingsFor({ ...preprintedPaper, ...customChrome })) },
	{ name: "report-pnl-preprinted", template: "report.typ", payload: pnl(settingsFor({ ...preprintedPaper, ...customChrome })), multipage: true },
	// Statements turn landscape on Built-in only; on pre-printed paper (and a
	// full-page background, below) the sheet stays portrait — and the taller
	// sheet fits on one page what landscape A4 spills onto two.
	{ name: "statement-preprinted", template: "statement.typ", payload: statement(settingsFor({ ...preprintedPaper, ...customChrome })) },
	// The narrowest portrait Safe area a statement meets: the 7-column table must still fit.
	{ name: "statement-preprinted-a5", template: "statement.typ", payload: statement(settingsFor({ ...preprintedPaper, pdf_paper_size: "a5" })), multipage: true },
	// A letter NOT individually set to pre-printed still follows the business.
	{ name: "letter-business-preprinted", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false), settings: settingsFor({ ...preprintedPaper }) }) },
	// …and one set to pre-printed reserves those same bands (same hash as the
	// case above; "letter-preprinted" proves it under Built-in too).
	{ name: "letter-preprinted-on-business-preprinted", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(true), settings: settingsFor({ ...preprintedPaper }) }) },
	{ name: "letter-business-preprinted-multipage", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false, 20), settings: settingsFor({ ...preprintedPaper }) }), multipage: true },
	// Stationery bands are never scaled with the paper.
	{ ...docCase("invoice-classic-preprinted-a5", invoice(settingsFor({ ...preprintedPaper, pdf_paper_size: "a5" }))), multipage: true },

	// Full-page background Stationery, every template, with real artwork
	// behind every page. As on Pre-printed paper the business's logo, header
	// text and footer are set (customChrome) and must all be dropped: the
	// artwork IS the identity. Margins 44 / 22, sides 20.
	// Minimal is the airiest Layout and spills onto page 2.
	...LAYOUTS.map((key): Case => {
		const c = docCase(`invoice-${key}-background`, invoice(settingsFor({ ...fullPageBackground(), ...customChrome, pdf_layout: key })));
		return key === "minimal" ? { ...c, multipage: true } : c;
	}),
	// Each upload format. The PDF fixture's second page is solid red: a
	// background is the first page only, so red must never appear.
	docCase("invoice-classic-background-png", invoice(settingsFor({ ...fullPageBackground("png") }))),
	docCase("invoice-classic-background-jpg", invoice(settingsFor({ ...fullPageBackground("jpg") }))),
	docCase("invoice-classic-background-pdf", invoice(settingsFor({ ...fullPageBackground("pdf") }))),
	// Repeats on every page.
	{ ...docCase("invoice-classic-background-multipage", invoice(settingsFor({ ...fullPageBackground("pdf") }), 30)), multipage: true },
	// Mode chosen, nothing uploaded yet: the margins still apply, no artwork.
	docCase("invoice-classic-background-no-artwork", invoice(settingsFor({ ...fullPageBackground(null) }))),
	// Artwork recorded but its file is gone (folder emptied by hand): renders
	// without it rather than failing. Same output as the case above.
	{ ...docCase("invoice-classic-background-file-missing", invoice(settingsFor({ ...fullPageBackground("svg") }))), businessFolder: join(REPO, "scripts/fixtures/no-such-folder"), sameAs: "invoice-classic-background-no-artwork" },
	// Artwork prepared for A4 on A5 covers the smaller sheet; margins unscaled.
	{ ...docCase("invoice-classic-background-a5", invoice(settingsFor({ ...fullPageBackground(), pdf_paper_size: "a5" }))), multipage: true },
	docCase("quote-classic-background", buildQuotePdfPayload({ row: docRow as never, lines: docLines(3), settings: settingsFor({ ...fullPageBackground() }), currency })),
	docCase("bill-classic-background", buildBillPdfPayload({ row: docRow as never, lines: docLines(2) as never, settings: settingsFor({ ...fullPageBackground("png") }), currency, paidCents: 2000000 })),
	docCase("sample-classic-background", sampleInvoicePayload(settingsFor({ ...fullPageBackground() }), currency, "classic")),
	...LAYOUTS.map((key): Case => ({ name: `payslip-${key}-background`, template: "payslip.typ", payload: payslip(settingsFor({ ...fullPageBackground(), ...customChrome, pdf_layout: key })) })),
	// The bespoke templates (their own page-setup call, not doc-header) with
	// raster and PDF artwork too, not only SVG.
	{ name: "payslip-classic-background-png", template: "payslip.typ", payload: payslip(settingsFor({ ...fullPageBackground("png") })) },
	{ name: "payslip-classic-background-pdf", template: "payslip.typ", payload: payslip(settingsFor({ ...fullPageBackground("pdf") })) },
	{ name: "voucher-background", template: "voucher.typ", payload: voucher(settingsFor({ ...fullPageBackground(), ...customChrome })) },
	{ name: "voucher-background-png", template: "voucher.typ", payload: voucher(settingsFor({ ...fullPageBackground("png") })) },
	{ name: "voucher-background-jpg", template: "voucher.typ", payload: voucher(settingsFor({ ...fullPageBackground("jpg") })) },
	{ name: "voucher-background-pdf", template: "voucher.typ", payload: voucher(settingsFor({ ...fullPageBackground("pdf") })) },
	{ name: "statement-background-pdf", template: "statement.typ", payload: statement(settingsFor({ ...fullPageBackground("pdf") })) },
	{ name: "report-pnl-background", template: "report.typ", payload: pnl(settingsFor({ ...fullPageBackground("pdf"), ...customChrome })), multipage: true },
	{ name: "statement-background", template: "statement.typ", payload: statement(settingsFor({ ...fullPageBackground(), ...customChrome })) },
	{ name: "statement-background-a5", template: "statement.typ", payload: statement(settingsFor({ ...fullPageBackground("png"), pdf_paper_size: "a5" })), multipage: true },
	{ name: "letter-background", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false), settings: settingsFor({ ...fullPageBackground() }) }) },
	{ name: "letter-background-pdf", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false), settings: settingsFor({ ...fullPageBackground("pdf") }) }) },
	{ name: "letter-background-multipage", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false, 20), settings: settingsFor({ ...fullPageBackground("png") }) }), multipage: true },
	// A letter set to pre-printed paper keeps its blank bands and draws no
	// artwork, even while the business uses a Full-page background.
	{ name: "letter-preprinted-on-business-background", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(true), settings: settingsFor({ ...fullPageBackground() }) }), sameAs: "letter-preprinted-on-business-preprinted" },

	// The Stationery editor's "Preview sample invoice" is exactly two pages —
	// the continuation page, repeated Stationery and "Page 2 of 2" are what it
	// exists to show. Three with stored baselines…
	{ ...docCase("stationery-preview-classic", sampleStationeryPreviewPayload(settingsFor(), currency, "classic")), multipage: true, pages: 2 },
	{ ...docCase("stationery-preview-modern-background", sampleStationeryPreviewPayload(settingsFor({ ...fullPageBackground("pdf"), pdf_layout: "modern" }), currency, "modern")), multipage: true, pages: 2 },
	{ ...docCase("stationery-preview-compact-preprinted-a5", sampleStationeryPreviewPayload(settingsFor({ ...preprintedPaper, pdf_layout: "compact", pdf_paper_size: "a5" }), currency, "compact")), multipage: true, pages: 2 },
	// …and the property on every Layout × Paper size × Stationery, including
	// shallow, deep and wide Safe areas (checkOnly: page count, no hash).
	...STATIONERY_PREVIEW_STATIONERY.flatMap(([label, overrides]) => ALL_PAPERS.flatMap((paper) => LAYOUTS.map((key): Case => ({
		...docCase(`stationery-preview-grid-${key}-${label}-${paper}`, sampleStationeryPreviewPayload(settingsFor({ ...overrides, pdf_layout: key, pdf_paper_size: paper }), currency, key)),
		multipage: true,
		pages: 2,
		checkOnly: true
	})))),

	// The demo business's PDFs: an invoice on the bundled sample letterhead
	// with the demo's own Safe area (one page, and one that runs on).
	{ ...docCase("invoice-classic-demo-letterhead", invoice(demoSettings())), businessFolder: DEMO_FOLDER },
	{ ...docCase("invoice-classic-demo-letterhead-multipage", invoice(demoSettings(), 30)), businessFolder: DEMO_FOLDER, multipage: true },

	// Every template on the three non-A4 sheets. Built-in Layout margins scale
	// with paper width; Pre-printed paper bands (letters included) do not.
	...OTHER_PAPERS.flatMap((paper): Case[] => {
		const on = (overrides: Partial<CompanySettingsRow> = {}) => settingsFor({ pdf_paper_size: paper, ...overrides });
		return [
			...LAYOUTS.map((key) => docCase(`invoice-${key}-${paper}`, invoice(on({ pdf_layout: key })))),
			docCase(`quote-classic-${paper}`, buildQuotePdfPayload({ row: docRow as never, lines: docLines(3), settings: on(), currency })),
			docCase(`bill-classic-${paper}`, buildBillPdfPayload({ row: docRow as never, lines: docLines(2) as never, settings: on(), currency, paidCents: 2000000 })),
			{ name: `payslip-classic-${paper}`, template: "payslip.typ", payload: payslip(on()) },
			{ name: `payslip-compact-${paper}`, template: "payslip.typ", payload: payslip(on({ pdf_layout: "compact" })) },
			{ name: `voucher-${paper}`, template: "voucher.typ", payload: voucher(on()) },
			{ name: `report-pnl-${paper}`, template: "report.typ", payload: pnl(on()) },
			{ name: `statement-${paper}`, template: "statement.typ", payload: statement(on()) },
			{ name: `letter-${paper}`, template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false), settings: on() }) },
			{ name: `letter-preprinted-${paper}`, template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(true), settings: on() }) }
		].map((c): Case => (MULTIPAGE_ON_OTHER_PAPER.has(c.name) ? { ...c, multipage: true } : c));
	})
];

// Each multi-page case also renders with page numbers switched off.
const unnumbered = (c: Case): Case => ({
	...c,
	name: `${c.name}~unnumbered`,
	payload: { ...c.payload, page: { ...(c.payload.page as object), page_numbers: false } }
});

const allCases = cases.flatMap((c) => (c.multipage && !c.checkOnly ? [c, unnumbered(c)] : [c]))
	.filter((c) => ONLY === undefined || c.name.includes(ONLY));

// Two cases with one name would share (and fight over) one baseline.
const duplicateNames = allCases.map((c) => c.name).filter((name, i, all) => all.indexOf(name) !== i);
if (duplicateNames.length) {
	console.error(`✗ duplicate case names: ${[...new Set(duplicateNames)].join(", ")}`);
	process.exit(1);
}

// --- render ----------------------------------------------------------------

// Must match the label page-setup in common.typ puts on its page numbers.
const PAGE_NUMBER_LABEL = "<sakoram-page-number>";

interface PageNumber {
	page: number
	total: number
}

interface Rendered {
	pdf: Buffer
	pageNumbers: PageNumber[]
}

interface PageBlock {
	background?: { ext: string, file?: string } | null
	[key: string]: unknown
}

// Mirror stage_background() in src-tauri/src/pdf.rs: the page block names only
// the artwork format; the file is <business folder>/stationery/background.<ext>.
// Copy it beside the template as stationery-background.<ext> and add `file`;
// a missing file renders without artwork (background null).
const stageBackground = (page: PageBlock | undefined, folder: string, work: string): PageBlock | undefined => {
	if (!page?.background) return page;
	const { ext } = page.background;
	const src = join(folder, "stationery", `background.${ext}`);
	if (!/^[a-z0-9]{1,5}$/i.test(ext) || !existsSync(src)) return { ...page, background: null };
	const file = `stationery-background.${ext}`;
	copyFileSync(src, join(work, file));
	return { ...page, background: { ...page.background, file } };
};

const render = (c: Case): Rendered => {
	const work = mkdtempSync(join(tmpdir(), "sakoram-pdf-"));
	try {
		// Mirror render_pdf() in src-tauri/src/pdf.rs: logo_path (absolute) →
		// a copy beside the template + logo_file (relative), else null.
		const data: Record<string, unknown> = { ...c.payload };
		const logoPath = typeof data.logo_path === "string" ? data.logo_path : "";
		if (logoPath && existsSync(logoPath)) {
			const ext = logoPath.split(".").pop() || "png";
			copyFileSync(logoPath, join(work, `logo.${ext}`));
			data.logo_file = `logo.${ext}`;
		} else {
			data.logo_file = null;
		}
		data.page = stageBackground(data.page as PageBlock | undefined, c.businessFolder ?? BUSINESS_FOLDER, work);
		writeFileSync(join(work, "data.json"), JSON.stringify(data, null, 2));
		copyFileSync(join(TEMPLATES, "common.typ"), join(work, "common.typ"));
		copyFileSync(join(TEMPLATES, c.template), join(work, c.template));

		const out = join(work, "out.pdf");
		const res = spawnSync(TYPST, [
			"compile",
			"--root",
			work,
			"--font-path",
			FONTS,
			"--ignore-system-fonts",
			"--creation-timestamp",
			CREATION_TIMESTAMP,
			join(work, c.template),
			out
		], { encoding: "utf8" });
		if (res.status !== 0) throw new Error(`typst failed for ${c.name} (${c.template}):\n${res.stderr}`);

		// --keep also writes one PNG per page: an image is what you can
		// actually look at without a PDF renderer.
		if (KEEP_DIR) {
			spawnSync(TYPST, ["compile", "--root", work, "--font-path", FONTS, "--ignore-system-fonts", "--format", "png", "--ppi", "110", join(work, c.template), join(KEEP_DIR, `${c.name}-{p}.png`)]);
		}

		// Every "Page N of M" page-setup draws carries a metadata marker; ask
		// Typst for them rather than parsing glyphs out of the PDF.
		const q = spawnSync(TYPST, [
			"query",
			"--root",
			work,
			"--font-path",
			FONTS,
			"--ignore-system-fonts",
			join(work, c.template),
			PAGE_NUMBER_LABEL,
			"--field",
			"value"
		], { encoding: "utf8" });
		if (q.status !== 0) throw new Error(`typst query failed for ${c.name} (${c.template}):\n${q.stderr}`);
		return { pdf: readFileSync(out), pageNumbers: JSON.parse(q.stdout) as PageNumber[] };
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
};

// Page objects in the PDF itself — an independent count, not Typst's opinion.
const pageCount = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/gi)?.length ?? 0;

// What a reader must see: "Page N of M" on every page of a document that runs
// past one page (when the page settings ask for numbers), and nothing at all
// on a single page.
const pageNumberProblem = (c: Case, r: Rendered): string | null => {
	const pages = pageCount(r.pdf);
	if ((pages > 1) !== Boolean(c.multipage)) {
		return c.multipage
			? `declared multipage but rendered ${pages} page — lengthen the fixture`
			: `rendered ${pages} pages — mark the case \`multipage: true\``;
	}
	if (c.pages !== undefined && pages !== c.pages) return `rendered ${pages} pages, must be exactly ${c.pages}`;
	const numbered = (c.payload.page as { page_numbers?: boolean } | undefined)?.page_numbers === true;
	const expected = numbered && pages > 1
		? Array.from({ length: pages }, (_, i) => ({ page: i + 1, total: pages }))
		: [];
	const actual = JSON.stringify(r.pageNumbers);
	return actual === JSON.stringify(expected) ? null : `page numbers ${actual}, expected ${JSON.stringify(expected)}`;
};

// What only the business's own identity prints: its address, phone and
// website (the header text, footer line and business blocks). Its NAME is not
// here on purpose — it is legitimately the account name in a payment-details
// block — and nor is its tax ID, which the sample payload reuses for its client.
const fixture = settingsFor();
const BUSINESS_IDENTITY = [fixture.address_line1!, fixture.phone!, fixture.website!];

// Under any Stationery other than Built-in (`page.chrome` false — Pre-printed
// paper, or a letter printed onto it) the paper already carries the business
// identity, so the PDF must not print any of it. Built-in renders of the cases
// in IDENTITY_SHOWN must print all of it: that proves the text extraction
// itself still works, so a silent "found nothing" can't pass the rule above.
const IDENTITY_SHOWN = new Set(["statement-logo", "letter-logo"]);
const identityProblem = (c: Case, r: Rendered): string | null => {
	const text = pdfPageTexts(r.pdf).join("\n");
	const chrome = (c.payload.page as { chrome?: boolean } | undefined)?.chrome !== false;
	if (!chrome) {
		const printed = BUSINESS_IDENTITY.filter((s) => text.includes(s));
		return printed.length ? `prints the business identity on Stationery that owns it: ${printed.join(", ")}` : null;
	}
	if (IDENTITY_SHOWN.has(c.name)) {
		const missing = BUSINESS_IDENTITY.filter((s) => !text.includes(s));
		return missing.length ? `text extraction found no ${missing.join(", ")} on a Built-in render — is scripts/pdf-text.ts still reading this Typst's output?` : null;
	}
	return null;
};

// The statement asks for a landscape sheet; page-setup grants it on Built-in
// only (page.allow_landscape). Under any other Stationery the paper or artwork
// is portrait, so every page must be too. Read from the PDF's own MediaBoxes.
const orientationProblem = (c: Case, r: Rendered): string | null => {
	if (c.template !== "statement.typ") return null;
	const landscape = (c.payload.page as { allow_landscape?: boolean } | undefined)?.allow_landscape === true;
	const boxes = [...r.pdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
	if (!boxes.length) return "no /MediaBox found — can't check the orientation";
	const wrong = boxes.filter(([, w, h]) => (Number(w) > Number(h)) !== landscape);
	return wrong.length ? `${wrong.length} page(s) are ${landscape ? "portrait" : "landscape"}; this Stationery wants ${landscape ? "landscape" : "portrait"}` : null;
};

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

// A case with Full-page background artwork on disk must actually show it: the
// same document with the artwork taken out has to render differently. (A hash
// alone would happily bless a render where the artwork silently went missing.)
const hasArtwork = (c: Case) => {
	const bg = (c.payload.page as PageBlock | undefined)?.background;
	return Boolean(bg && existsSync(join(c.businessFolder ?? BUSINESS_FOLDER, "stationery", `background.${bg.ext}`)));
};
const artworkProblem = (c: Case, hash: string): string | null => {
	if (!hasArtwork(c)) return null;
	const without = { ...c, name: `${c.name}~no-artwork`, payload: { ...c.payload, page: { ...(c.payload.page as object), background: null } } };
	return sha256(render(without).pdf) === hash ? "the background artwork did not change the page — is page-setup drawing it?" : null;
};

interface Baselines {
	typst: string
	hashes: Record<string, string>
}

const stored: Baselines | null = existsSync(BASELINES) ? JSON.parse(readFileSync(BASELINES, "utf8")) as Baselines : null;

if (!UPDATE) {
	if (!stored) {
		console.error(`✗ no baselines at ${BASELINES} — run with --update to capture them`);
		process.exit(1);
	}
	if (stored.typst !== typstVersion) {
		console.error(`✗ baselines were captured with Typst ${stored.typst}, this sidecar is ${typstVersion}`);
		process.exit(1);
	}
}

if (KEEP_DIR) mkdirSync(KEEP_DIR, { recursive: true });

let failures = 0;
const hashes: Record<string, string> = {};
for (const c of allCases) {
	let rendered: Rendered;
	try {
		rendered = render(c);
	} catch (e) {
		console.error(`✗ ${c.name}: ${(e as Error).message}`);
		failures++;
		continue;
	}
	const { pdf } = rendered;
	const hash = sha256(pdf);
	hashes[c.name] = hash;
	if (KEEP_DIR) writeFileSync(join(KEEP_DIR, `${c.name}.pdf`), pdf);

	// Checked in both modes: --update must not bless a wrong page count.
	const problem = pageNumberProblem(c, rendered) ?? identityProblem(c, rendered) ?? orientationProblem(c, rendered) ?? artworkProblem(c, hash)
		// (Under --only the other case may simply not have rendered.)
		?? (c.sameAs && (ONLY === undefined || c.sameAs in hashes) && hashes[c.sameAs] !== hash ? `should render exactly like ${c.sameAs}` : null);
	if (problem) {
		console.error(`✗ ${c.name} (${c.template}): ${problem}`);
		failures++;
		continue;
	}

	if (c.checkOnly) {
		delete hashes[c.name];
		console.log(`✓ ${c.name}  (checks only)`);
		continue;
	}

	if (UPDATE) {
		// A baseline is only worth storing if the render is reproducible.
		const again = sha256(render(c).pdf);
		if (again !== hash) {
			console.error(`✗ ${c.name}: two renders differ — output is not deterministic`);
			failures++;
		} else {
			console.log(`✓ ${c.name}  ${hash.slice(0, 12)}`);
		}
		continue;
	}

	const expected = stored!.hashes[c.name];
	if (expected === undefined) {
		console.error(`✗ ${c.name}: no stored baseline (run with --update once the output is right)`);
		failures++;
	} else if (expected !== hash) {
		console.error(`✗ ${c.name} (${c.template}): output changed\n    expected ${expected}\n    actual   ${hash}`);
		failures++;
	} else {
		console.log(`✓ ${c.name}`);
	}
}

if (!UPDATE && ONLY === undefined) {
	for (const name of Object.keys(stored!.hashes)) {
		if (!(name in hashes) && !allCases.some((c) => c.name === name)) {
			console.error(`✗ stale baseline with no matching case: ${name}`);
			failures++;
		}
	}
}

if (UPDATE && failures === 0) {
	writeFileSync(BASELINES, `${JSON.stringify({ typst: typstVersion, hashes }, null, "\t")}\n`);
	console.log(`\nwrote ${Object.keys(hashes).length} baselines → ${BASELINES}`);
}

console.log(`\n${failures === 0 ? `ALL ${allCases.length} RENDERS MATCH` : `${failures} RENDER CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
