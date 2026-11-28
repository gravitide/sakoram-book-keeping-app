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
// Page numbers: besides the hash, every case is checked for its page numbers
// — wherever the design's page-number item says (every page of a multi-page
// document; a single page only when it isn't set to hide there). A case that
// runs past one page must say `multipage: true` (checked against the real page
// count), and gets an `~unnumbered` twin rendered without the page-number
// item: its baseline is the document without numbers, so the numbered render
// can only differ by them.
//
// Design items: every item the page design draws carries a metadata marker
// (common.typ design-items); each case is checked to draw each item on exactly
// the pages its pages rule names (every / first / not_first), mirroring
// itemOnPage in app/lib/page-design.ts.
//
// Business identity: the document itself never prints the business's address,
// phone or website — only the design's text items do. A case whose design has
// no text items is read back as text (scripts/pdf-text.ts) and must not show
// them.
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
// Every case renders with a REAL company logo (the Rust side's logo_path →
// logo_file copy is mirrored here), and design images render from REAL
// artwork in each format the app accepts (SVG, PNG, JPEG, PDF —
// scripts/fixtures/stationery/), staged the way pdf.rs stage_page_items does.

import type { Buffer } from "node:buffer";
import type { DesignTemplateKey } from "../app/lib/design-templates";
import type { DesignItem, PageDesign } from "../app/lib/page-design";
import type { PageItemPayload, PaperSize } from "../app/lib/page-settings";
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
import { DEMO_LETTERHEAD_ACCENT, demoDesign } from "../app/lib/demo-design.ts";
import { DESIGN_TEMPLATES, designTemplate } from "../app/lib/design-templates.ts";
import { buildInvoicePdfPayload } from "../app/lib/invoice-pdf.ts";
import { buildLetterPdfPayload } from "../app/lib/letter-pdf.ts";
import { CURRENCIES } from "../app/lib/money.ts";
import { itemOnPage } from "../app/lib/page-design.ts";
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
// Stands in for the business folder: design images are read from
// <folder>/stationery/item-<id>.<ext>, exactly as the app reads them. Filled
// from the fixtures under the ids the cases below use.
const BUSINESS_FOLDER = mkdtempSync(join(tmpdir(), "sakoram-business-folder-"));
mkdirSync(join(BUSINESS_FOLDER, "stationery"));
const FIXTURES = join(REPO, "scripts/fixtures/stationery");
const ARTWORK_ID = "artwork001";
for (const ext of ["svg", "png", "jpg", "pdf"]) copyFileSync(join(FIXTURES, `background.${ext}`), join(BUSINESS_FOLDER, "stationery", `item-${ARTWORK_ID}.${ext}`));
const FIRST_ONLY_ID = "firstonly01";
copyFileSync(join(FIXTURES, "header.svg"), join(BUSINESS_FOLDER, "stationery", `item-${FIRST_ONLY_ID}.svg`));
// The demo business's bundled letterhead, staged where the demo seed writes it.
const DEMO = demoDesign();
const DEMO_FOLDER = mkdtempSync(join(tmpdir(), "sakoram-demo-folder-"));
mkdirSync(join(DEMO_FOLDER, "stationery"));
copyFileSync(join(REPO, "app/assets/stationery/demo-letterhead.svg"), join(DEMO_FOLDER, "stationery", `item-${DEMO.artworkId}.svg`));
process.on("exit", () => {
	rmSync(DEMO_FOLDER, { recursive: true, force: true });
	rmSync(BUSINESS_FOLDER, { recursive: true, force: true });
});
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
	logo_path: LOGO,
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
	// null = never chosen: the Classic template (page-settings.ts effectiveDesign).
	pdf_design: null,
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
	logo_crop: null,
	updated_at: "2026-01-01 00:00:00",
	...overrides
});

const noLogo = { logo_path: null };

/** Item ids for a fixture design: stable across runs, so renders hash alike. */
const fixtureIds = (prefix: string) => {
	let n = 0;
	return () => `${prefix}${String(++n).padStart(4, "0")}`;
};
const templateDesign = (key: DesignTemplateKey, paper: PaperSize = "a4"): PageDesign =>
	designTemplate(key, paper, fixtureIds(key.replace(/[^a-z]/g, "").slice(0, 6))).design;
const withDesign = (design: PageDesign): Partial<CompanySettingsRow> => ({ pdf_design: JSON.stringify(design) });
/** A business on a starter template, with the Document style it sets. */
const onTemplate = (key: DesignTemplateKey, overrides: Partial<CompanySettingsRow> = {}) => {
	const { documentStyle } = designTemplate(key, "a4");
	return settingsFor({ pdf_layout: documentStyle ?? "classic", ...withDesign(templateDesign(key)), ...overrides });
};
/** The Full-page background template with fixture artwork of this format in its slot. */
const withArtwork = (ext: "svg" | "png" | "jpg" | "pdf"): Partial<CompanySettingsRow> => {
	const design = templateDesign("background");
	const items = design.items.map((i): DesignItem => (i.type === "image" ? { ...i, id: ARTWORK_ID, src: { kind: "file", ext } } : i));
	return withDesign({ ...design, items });
};
/** The Pre-printed paper template with fixture artwork as its scan: still guide-only (never printed). */
const withGuideScan = (): Partial<CompanySettingsRow> => {
	const design = templateDesign("preprinted");
	const items = design.items.map((i): DesignItem => (i.type === "image" ? { ...i, id: ARTWORK_ID, src: { kind: "file", ext: "png" } } : i));
	return withDesign({ ...design, items });
};
/** Classic plus an image on the first page only and a rule on every page after it. */
const withPagesRules = (): Partial<CompanySettingsRow> => {
	const design = templateDesign("classic");
	const extra: DesignItem[] = [
		{ type: "image", id: FIRST_ONLY_ID, x: 18, y: 250, w: 60, h: 8.6, pages: "first", src: { kind: "file", ext: "svg" }, guide: false },
		{ type: "line", id: "notfirst01", x: 18, y: 44, length: 174, vertical: false, thickness: 1, color: "#9ca3af", pages: "not_first" }
	];
	return withDesign({ ...design, items: [...design.items, ...extra] });
};
/**
 * Classic with every text style the designer offers: a text box per font (one
 * italic, one bold, one centred, one right-aligned, one in Accent), a vertical
 * line, and its page number in `format` (a design holds only one).
 */
const withStyles = (format: "slash" | "number"): Partial<CompanySettingsRow> => {
	const design = templateDesign("classic");
	const look = { size: 9, bold: false, italic: false, color: "#111827", align: "left" } as const;
	const fonts = ["Akt", "Inter", "Inter Tight", "Stack Sans Text", "Miriam Libre", "Amarna"] as const;
	const variants = [{}, { italic: true }, { bold: true }, { align: "center" }, { align: "right" }, { color: "accent" }] as const;
	const texts = fonts.map((font, i): DesignItem => ({
		type: "text",
		id: `styles${String(i + 1).padStart(4, "0")}`,
		x: 18,
		y: 230 + i * 6,
		w: 120,
		pages: "every",
		text: `${font} — {business_name}`,
		style: { ...look, ...variants[i], font }
	}));
	const extra: DesignItem[] = [
		...texts,
		{ type: "line", id: "stylesvline", x: 150, y: 230, length: 40, vertical: true, thickness: 1.5, color: "accent", pages: "every" }
	];
	const items = design.items.map((i): DesignItem => (i.type === "page_number" ? { ...i, format } : i));
	return withDesign({ ...design, items: [...items, ...extra] });
};
// The demo business: its bundled letterhead in the background slot, and its accent.
const demoSettings = () => settingsFor({ ...withDesign(DEMO.design), pdf_theme_color: DEMO_LETTERHEAD_ACCENT });
// A business with no website, phone or email: those lines drop out of the
// letterhead and footer rather than printing half-written.
const sparseDetails = { website: null, phone: null, email: null };

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
	 * a property (the Preview as PDF sample is always two pages) rather
	 * than pixels.
	 */
	checkOnly?: true
	/** Where design images are read from (default: the fixture business folder). */
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
// most of them spill, and US Letter is a little shorter than A4; reports do
// on every sheet).
const MULTIPAGE_ON_OTHER_PAPER = new Set([
	...LAYOUTS.map((key) => `invoice-${key}-a5`),
	"invoice-background-artwork-a5",
	"quote-classic-a5",
	"payslip-classic-a5",
	"payslip-compact-a5",
	"statement-a5",
	...["classic", "modern", "minimal"].map((key) => `invoice-${key}-us-letter`),
	"invoice-background-artwork-us-letter",
	...OTHER_PAPERS.map((paper) => `report-pnl-${paper}`)
]);

const ALL_PAPERS = ["a4", ...OTHER_PAPERS] as const;
const TEMPLATE_KEYS = DESIGN_TEMPLATES.map((t) => t.key);

const cases: Case[] = [
	// Every starter template on every document type, with the Document style
	// it sets. The Full-page background / Pre-printed paper slots are empty
	// here (nothing printed); the artwork cases below fill them.
	...TEMPLATE_KEYS.flatMap((key): Case[] => {
		const on = () => onTemplate(key);
		return [
			docCase(`invoice-${key}`, invoice(on())),
			{ ...docCase(`invoice-${key}-multipage`, invoice(on(), 45)), multipage: true },
			docCase(`quote-${key}`, buildQuotePdfPayload({ row: docRow as never, lines: docLines(3), settings: on(), currency })),
			docCase(`bill-${key}`, buildBillPdfPayload({ row: docRow as never, lines: docLines(2) as never, settings: on(), currency, paidCents: 2000000 })),
			{ name: `payslip-${key}`, template: "payslip.typ", payload: payslip(on()) },
			{ name: `voucher-${key}`, template: "voucher.typ", payload: voucher(on()) },
			// Reports put each drill-down section on its own page.
			{ name: `report-pnl-${key}`, template: "report.typ", payload: pnl(on()), multipage: true },
			{ name: `statement-${key}`, template: "statement.typ", payload: statement(on()) },
			{ name: `letter-${key}`, template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false), settings: on() }) },
			{ name: `letter-preprinted-${key}`, template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(true), settings: on() }) }
		];
	}),

	// The never-chosen default (Classic) under each Document style: the
	// four title blocks (Minimal's is taller, so the invoice runs on), and
	// payslip's layout-config.
	...LAYOUTS.map((key): Case => ({
		...docCase(`invoice-default-design-${key}`, invoice(settingsFor({ pdf_layout: key }))),
		...(key === "minimal" ? { multipage: true as const } : {})
	})),
	...LAYOUTS.map((key): Case => ({ name: `payslip-default-design-${key}`, template: "payslip.typ", payload: payslip(settingsFor({ pdf_layout: key })) })),
	// No company logo: the logo spot drops out rather than leaving a hole.
	docCase("invoice-classic-nologo", invoice(settingsFor({ ...noLogo }))),
	// No website / phone / email: those lines drop out of the letterhead.
	docCase("invoice-classic-sparse-details", invoice(settingsFor({ ...sparseDetails }))),

	// Design images, in every format the app accepts.
	...(["svg", "png", "jpg", "pdf"] as const).map((ext) => docCase(`invoice-background-artwork-${ext}`, invoice(settingsFor(withArtwork(ext))))),
	{ ...docCase("invoice-background-artwork-multipage", invoice(settingsFor(withArtwork("svg")), 45)), multipage: true },
	{ name: "statement-background-artwork", template: "statement.typ", payload: statement(settingsFor(withArtwork("pdf"))) },
	// Pages rules: an image on the first page only, a rule on every page after it.
	{ ...docCase("invoice-pages-rules", invoice(settingsFor(withPagesRules()), 45)), multipage: true },

	// The rest of each document's shapes, on the default design.
	{ ...docCase("quote-classic-multipage", buildQuotePdfPayload({ row: docRow as never, lines: docLines(20), settings: settingsFor(), currency })), multipage: true },
	{ ...docCase("bill-classic-multipage", buildBillPdfPayload({ row: docRow as never, lines: docLines(20) as never, settings: settingsFor(), currency, paidCents: 0 })), multipage: true },
	{ name: "payslip-classic-multipage", template: "payslip.typ", payload: payslip(settingsFor(), 40), multipage: true },
	{ name: "payslip-compact-multipage", template: "payslip.typ", payload: payslip(settingsFor({ pdf_layout: "compact" }), 50), multipage: true },
	{ name: "voucher-multipage", template: "voucher.typ", payload: voucher(settingsFor(), longDescription), multipage: true },
	{ name: "report-aged-receivables", template: "report.typ", payload: agedReceivables(settingsFor()), multipage: true },
	{ name: "report-cash-flow", template: "report.typ", payload: cashFlow(settingsFor()), multipage: true },
	// Statements used to print "Page 1 of 1"; a single page now carries none.
	{ name: "statement-single-page", template: "statement.typ", payload: statement(settingsFor(), false) },
	{ name: "letter-multipage", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false, 20), settings: settingsFor() }), multipage: true },
	{ name: "letter-preprinted-multipage", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(true, 20), settings: settingsFor() }), multipage: true },
	{ name: "letter-no-settings", template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(false), settings: null }) },
	// Settings → PDF sample preview.
	docCase("sample-classic", sampleInvoicePayload(settingsFor(), currency, "classic")),
	docCase("sample-modern-nologo", sampleInvoicePayload(settingsFor({ ...noLogo }), currency, "modern")),

	// The demo business's PDFs: an invoice on the bundled sample letterhead
	// with the demo's own safe area (one page, and one that runs on).
	{ ...docCase("invoice-demo-letterhead", invoice(demoSettings())), businessFolder: DEMO_FOLDER },
	{ ...docCase("invoice-demo-letterhead-multipage", invoice(demoSettings(), 30)), businessFolder: DEMO_FOLDER, multipage: true },

	// Every template on the three non-A4 sheets: the default design scales
	// to the sheet (page-design.ts scaleDesign).
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
			{ name: `letter-preprinted-${paper}`, template: "letter.typ", payload: buildLetterPdfPayload({ row: letterRow(true), settings: on() }) },
			docCase(`invoice-background-artwork-${paper}`, invoice(on(withArtwork("png"))))
		].map((c): Case => (MULTIPAGE_ON_OTHER_PAPER.has(c.name) ? { ...c, multipage: true } : c));
	}),

	// The "Preview as PDF" sample: always exactly two pages, whatever the
	// design, Document style and sheet (its line count follows the safe area).
	{ ...docCase("stationery-preview-classic", sampleStationeryPreviewPayload(settingsFor(), currency, "classic")), multipage: true, pages: 2 },
	{ ...docCase("stationery-preview-background-artwork", sampleStationeryPreviewPayload(settingsFor(withArtwork("pdf")), currency, "classic")), multipage: true, pages: 2 },
	{ ...docCase("stationery-preview-compact-a5", sampleStationeryPreviewPayload(onTemplate("compact", { pdf_paper_size: "a5" }), currency, "compact")), multipage: true, pages: 2 },
	// The designer's page view: a business with no website, phone or email
	// keeps those letterhead lines, faded and labelled (showEmptyFields).
	{ ...docCase("designer-faded-fields", sampleStationeryPreviewPayload(settingsFor(sparseDetails), currency, "classic", { showEmptyFields: true })), multipage: true, pages: 2 },
	// The designer draws a guide scan (pre-printed paper) to line things up against.
	{ ...docCase("designer-guide-scan", sampleStationeryPreviewPayload(settingsFor(withGuideScan()), currency, "classic", { showGuides: true })), multipage: true, pages: 2 },
	// Every text style, a vertical line, and the other page-number formats.
	{ ...docCase("design-styles-slash", invoice(settingsFor(withStyles("slash")), 45)), multipage: true },
	{ ...docCase("design-styles-number", invoice(settingsFor(withStyles("number")), 45)), multipage: true },
	...TEMPLATE_KEYS.flatMap((tpl) => ALL_PAPERS.flatMap((paper) => LAYOUTS.map((key): Case => ({
		...docCase(`stationery-preview-grid-${tpl}-${key}-${paper}`, sampleStationeryPreviewPayload(onTemplate(tpl, { pdf_layout: key, pdf_paper_size: paper }), currency, key)),
		multipage: true,
		pages: 2,
		checkOnly: true
	}))))
];

// Each multi-page case also renders without its page-number item.
const unnumbered = (c: Case): Case => {
	const page = c.payload.page as { items: PageItemPayload[] };
	return {
		...c,
		name: `${c.name}~unnumbered`,
		payload: { ...c.payload, page: { ...page, items: page.items.filter((i) => i.type !== "page_number") } },
		// A twin matches its counterpart's twin, not the numbered render.
		...(c.sameAs ? { sameAs: `${c.sameAs}~unnumbered` } : {})
	};
};

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
	/** Every design item drawn, in order (the <sakoram-design-item> markers). */
	designItems: DrawnItem[]
	/** The page's design items as staged (images that couldn't be staged removed). */
	items: StagedItem[]
}

// Must match the label design-items in common.typ puts on each item it draws.
const DESIGN_ITEM_LABEL = "<sakoram-design-item>";

/** One item design-items drew: its id and the page it was drawn on. */
interface DrawnItem {
	id: string
	page: number
}

/** A design item once staged: the payload's own entry, plus the file name Typst reads for an image. */
type StagedItem = PageItemPayload & { file?: string };

interface PageBlock {
	items: StagedItem[]
	[key: string]: unknown
}

// Mirror stage_page_items() in src-tauri/src/pdf.rs: an image item names only
// its id and format; the file is <business folder>/stationery/item-<id>.<ext>,
// copied beside the template under that name with `file` added. The company
// logo item reuses the staged logo_file. An image that can't be staged — an
// unsafe id or extension, a missing file, no logo — is removed.
const stagePageItems = (page: PageBlock | undefined, logoFile: string | null, folder: string, work: string): PageBlock | undefined => {
	if (!page?.items) return page;
	const items: StagedItem[] = [];
	for (const item of page.items) {
		if (item.type !== "image") {
			items.push(item);
			continue;
		}
		if (item.src === "company_logo") {
			if (logoFile) items.push({ ...item, file: logoFile });
			continue;
		}
		if (!/^[a-z0-9]{6,32}$/.test(item.id) || !/^[a-z0-9]{1,5}$/i.test(item.ext)) continue;
		const file = `item-${item.id}.${item.ext}`;
		const src = join(folder, "stationery", file);
		if (!existsSync(src)) continue;
		copyFileSync(src, join(work, file));
		items.push({ ...item, file });
	}
	return { ...page, items };
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
		const page = stagePageItems(data.page as PageBlock | undefined, data.logo_file as string | null, c.businessFolder ?? BUSINESS_FOLDER, work);
		data.page = page;
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
		const d = spawnSync(TYPST, ["query", "--root", work, "--font-path", FONTS, "--ignore-system-fonts", join(work, c.template), DESIGN_ITEM_LABEL, "--field", "value"], { encoding: "utf8" });
		if (d.status !== 0) throw new Error(`typst query failed for ${c.name} (${c.template}):\n${d.stderr}`);
		return { pdf: readFileSync(out), pageNumbers: JSON.parse(q.stdout) as PageNumber[], designItems: JSON.parse(d.stdout) as DrawnItem[], items: page?.items ?? [] };
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
};

// Page objects in the PDF itself — an independent count, not Typst's opinion.
const pageCount = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/gi)?.length ?? 0;

/** The pages (1-based) of a `total`-page document an item is drawn on. */
const drawnOn = (item: StagedItem, total: number): number[] => {
	if (item.type === "page_number" && item.hide_single && total === 1) return [];
	return Array.from({ length: total }, (_, i) => i + 1).filter((p) => itemOnPage(item.pages, p));
};

// What a reader must see: the page number on every page its item names —
// nothing at all when the design has no page-number item, or hides it on a
// single page.
const pageNumberProblem = (c: Case, r: Rendered): string | null => {
	const pages = pageCount(r.pdf);
	if ((pages > 1) !== Boolean(c.multipage)) {
		return c.multipage
			? `declared multipage but rendered ${pages} page — lengthen the fixture`
			: `rendered ${pages} pages — mark the case \`multipage: true\``;
	}
	if (c.pages !== undefined && pages !== c.pages) return `rendered ${pages} pages, must be exactly ${c.pages}`;
	const expected = r.items
		.filter((i) => i.type === "page_number")
		.flatMap((i) => drawnOn(i, pages))
		.sort((a, b) => a - b)
		.map((page) => ({ page, total: pages }));
	const actual = JSON.stringify(r.pageNumbers);
	return actual === JSON.stringify(expected) ? null : `page numbers ${actual}, expected ${JSON.stringify(expected)}`;
};

// Every staged design item is drawn on exactly the pages its rule names, in
// the design's order on each page.
const designItemProblem = (r: Rendered): string | null => {
	const pages = pageCount(r.pdf);
	const expected = Array.from({ length: pages }, (_, i) => i + 1)
		.flatMap((page) => r.items.filter((item) => drawnOn(item, pages).includes(page)).map((item) => ({ id: item.id, page })));
	const actual = JSON.stringify(r.designItems);
	return actual === JSON.stringify(expected) ? null : `design items drawn ${actual}, expected ${JSON.stringify(expected)}`;
};

// What only the business's own identity prints: its address, phone and
// website. Its NAME is not here on purpose — it is legitimately the account
// name in a payment-details block — and nor is its tax ID, which the sample
// payload reuses for its client.
const fixture = settingsFor();
const BUSINESS_IDENTITY = [fixture.address_line1!, fixture.phone!, fixture.website!];

// The document itself never prints the business identity — the design's text
// items do. So a case whose design draws no text must not show any of it.
// The cases in IDENTITY_SHOWN (Classic: details in the letterhead, website and
// phone in the footer) must show all of it: that proves the text extraction
// still works, so a silent "found nothing" can't pass the rule above.
const IDENTITY_SHOWN = new Set(["invoice-classic", "statement-classic", "letter-classic"]);
const identityProblem = (c: Case, r: Rendered): string | null => {
	const text = pdfPageTexts(r.pdf).join("\n");
	if (!r.items.some((i) => i.type === "text")) {
		const printed = BUSINESS_IDENTITY.filter((s) => text.includes(s));
		return printed.length ? `the document prints the business identity itself: ${printed.join(", ")}` : null;
	}
	if (IDENTITY_SHOWN.has(c.name)) {
		const missing = BUSINESS_IDENTITY.filter((s) => !text.includes(s));
		return missing.length ? `text extraction found no ${missing.join(", ")} on a Classic render — is scripts/pdf-text.ts still reading this Typst's output?` : null;
	}
	return null;
};

// A design is laid out on a portrait sheet, so every page is portrait — the
// statement included (it used to turn landscape under Built-in stationery).
// Read from the PDF's own MediaBoxes.
const orientationProblem = (c: Case, r: Rendered): string | null => {
	if (c.template !== "statement.typ") return null;
	const boxes = [...r.pdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
	if (!boxes.length) return "no /MediaBox found — can't check the orientation";
	const wide = boxes.filter(([, w, h]) => Number(w) > Number(h));
	return wide.length ? `${wide.length} page(s) are landscape; a design is portrait` : null;
};

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

// A design image staged from a file must actually show: the same document
// with that item taken out has to render differently. (A hash alone would
// happily bless a render where the image silently went missing.)
const withoutItem = (c: Case, id: string): Case => {
	const page = c.payload.page as { items: PageItemPayload[] };
	return { ...c, name: `${c.name}~without-${id}`, payload: { ...c.payload, page: { ...page, items: page.items.filter((i) => i.id !== id) } } };
};
const artworkProblem = (c: Case, r: Rendered, hash: string): string | null => {
	for (const item of r.items) {
		if (item.type !== "image" || item.src !== "item") continue;
		if (sha256(render(withoutItem(c, item.id)).pdf) === hash) {
			return `the image ${item.id} did not change the page — is design-items drawing it?`;
		}
	}
	return null;
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
	const problem = pageNumberProblem(c, rendered) ?? designItemProblem(rendered) ?? identityProblem(c, rendered) ?? orientationProblem(c, rendered) ?? artworkProblem(c, rendered, hash)
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
