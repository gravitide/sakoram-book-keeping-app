// One-click "create a demo business" — used from the welcome screen and
// from Settings → Businesses to give new users something interesting to
// click around in immediately.
//
// What this does, in order:
//  1. Asks the tenant store to create a fresh tenant (DB file + entry in
//     tenants.json + migrations).
//  2. Activates it so every subsequent store call lands in the new DB.
//  3. Seeds it through the regular Pinia stores (no direct SQL) — keeps
//     the demo data shape consistent with anything a user could enter
//     by hand. If the schema changes, the seed naturally tracks it.
//  4. Returns the new tenant. Caller is responsible for the hard reload
//     (window.location.assign) — same pattern the welcome page already
//     uses for switching.
//
// The seed is intentionally modest: 4 clients, 3 vendors, 3 quotes,
// 4 invoices, 3 bills, 4 vouchers. Enough to demo dashboard tiles,
// status filters, list views, and PDF rendering — not so much that
// scrolling the lists becomes a chore.

import type { Tenant } from "~/stores/tenants";
import type { VendorRow } from "~/stores/vendors";
import { buildCategorySnapshot, useBillCategoriesStore } from "~/stores/bill_categories";
import { useBillsStore } from "~/stores/bills";
import { useBusinessBanksStore } from "~/stores/business_banks";
import { useClientsStore } from "~/stores/clients";
import { useEmployeesStore } from "~/stores/employees";
import { useInvoicesStore } from "~/stores/invoices";
import { usePayslipsStore } from "~/stores/payslips";
import { useQuotesStore } from "~/stores/quotes";
import { useSettingsStore } from "~/stores/settings";
import { useTenantsStore } from "~/stores/tenants";
import { useVendorsStore } from "~/stores/vendors";
import { useVouchersStore } from "~/stores/vouchers";

// Past/future date offsets used throughout the seed. Keeping these as
// helpers (rather than scattering Date math around) makes the timeline
// easier to read and reason about — every demo invoice/quote/bill is
// some `daysAgo(N)` so the lists land sorted naturally.
function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysFromNow(n: number): string {
	return daysAgo(-n);
}

// ---------- Settings -------------------------------------------------------

const seedSettings = async () => {
	const store = useSettingsStore();
	await store.ensureLoaded();
	await store.save({
		business_name: "Acme Trading Co",
		address_line1: "12 Galle Road",
		address_line2: "Colombo 03",
		city: "Colombo",
		postal_code: "00300",
		country: "Sri Lanka",
		tax_id: "VAT-123456789",
		email: "hello@acme.example",
		phone: "+94 11 234 5678",
		website: "https://acme.example",
		default_vat_rate: 1800,
		default_payment_terms_days: 30,
		default_quote_validity_days: 30,
		fiscal_year_start_month: 4
	});
};

// ---------- Bank accounts --------------------------------------------------

// Plant a default bank account so quotes / invoices created next have
// something to snapshot. Caller can add more from Settings → Business
// details later.
const seedBanks = async () => {
	const store = useBusinessBanksStore();
	const id = await store.create({
		label: "HNB Colombo Main",
		bank_name: "Hatton National Bank",
		bank_account_name: "Acme Trading Co",
		bank_account_number: "0049-1234-5678",
		bank_branch: "Colombo Main"
	});
	await store.setDefault(id);
};

// ---------- Clients --------------------------------------------------------

const seedClients = async () => {
	const store = useClientsStore();
	const ids = {
		kandyTea: 0,
		galleHotels: 0,
		lankaSoftware: 0,
		premier: 0
	};
	ids.kandyTea = await store.create({
		name: "Kandy Tea Exports",
		contact_person: "Nimal Perera",
		email: "nimal@kandytea.example",
		phone: "+94 81 222 3344",
		address_line1: "45 Peradeniya Road",
		address_line2: null,
		city: "Kandy",
		postal_code: "20000",
		country: "Sri Lanka",
		tax_id: "VAT-998877665",
		notes: "Quarterly tea-export campaigns; pays on time."
	});
	ids.galleHotels = await store.create({
		name: "Galle Hotels Ltd",
		contact_person: "Ruwani Jayasuriya",
		email: "accounts@gallehotels.example",
		phone: "+94 91 555 1212",
		address_line1: "Lighthouse Street",
		address_line2: "Galle Fort",
		city: "Galle",
		postal_code: "80000",
		country: "Sri Lanka",
		tax_id: "VAT-554433221",
		notes: "Hospitality group — books photo + branding work seasonally."
	});
	ids.lankaSoftware = await store.create({
		name: "Lanka Software Solutions",
		contact_person: "Dinesh Fernando",
		email: "dinesh@lankasw.example",
		phone: "+94 11 778 9090",
		address_line1: "Tower B, Floor 7",
		address_line2: "Trace City",
		city: "Colombo",
		postal_code: "01000",
		country: "Sri Lanka",
		tax_id: "VAT-112233445",
		notes: null
	});
	ids.premier = await store.create({
		name: "Premier Construction",
		contact_person: "Asela Bandara",
		email: "asela@premier.example",
		phone: "+94 11 234 9090",
		address_line1: "88 Duplication Road",
		address_line2: null,
		city: "Colombo",
		postal_code: "00400",
		country: "Sri Lanka",
		tax_id: null,
		notes: "Long-running site project — invoiced monthly."
	});
	return ids;
};

// ---------- Vendors --------------------------------------------------------

const seedVendors = async () => {
	const store = useVendorsStore();
	const ids = {
		hnbBank: 0,
		officeSupplies: 0,
		ceb: 0
	};
	ids.hnbBank = await store.create({
		name: "Hatton National Bank",
		contact_person: null,
		email: "support@hnb.example",
		phone: "+94 11 246 4646",
		address_line1: "479 T.B. Jayah Mawatha",
		address_line2: null,
		city: "Colombo",
		postal_code: "01000",
		country: "Sri Lanka",
		tax_id: null,
		notes: "Bank charges and FX fees."
	});
	ids.officeSupplies = await store.create({
		name: "Lanka Office Supplies",
		contact_person: "Saman Silva",
		email: "orders@lankaoffice.example",
		phone: "+94 11 555 0011",
		address_line1: "201 Negombo Road",
		address_line2: null,
		city: "Colombo",
		postal_code: "01400",
		country: "Sri Lanka",
		tax_id: "VAT-223344556",
		notes: null
	});
	ids.ceb = await store.create({
		name: "Ceylon Electricity Board",
		contact_person: null,
		email: null,
		phone: "+94 11 232 4471",
		address_line1: "50 Sir Chittampalam A. Gardiner Mawatha",
		address_line2: null,
		city: "Colombo",
		postal_code: "00200",
		country: "Sri Lanka",
		tax_id: null,
		notes: "Electricity utility."
	});
	return ids;
};

// ---------- Quotes ---------------------------------------------------------

interface ClientIds {
	kandyTea: number
	galleHotels: number
	lankaSoftware: number
	premier: number
}

interface VendorIds {
	hnbBank: number
	officeSupplies: number
	ceb: number
}

interface QuoteIds {
	tea: number
	galle: number
	lanka: number
}

const seedQuotes = async (cs: ClientIds): Promise<QuoteIds> => {
	const quotes = useQuotesStore();
	const clients = useClientsStore();

	const ids = { tea: 0, galle: 0, lanka: 0 };

	const kandy = clients.clients.find((c) => c.id === cs.kandyTea)!;
	const galle = clients.clients.find((c) => c.id === cs.galleHotels)!;
	const lanka = clients.clients.find((c) => c.id === cs.lankaSoftware)!;

	// 1. Sent — Kandy Tea Exports — bundle pricing, LKR 250,000 + 18% VAT.
	ids.tea = await quotes.createDraft({
		client: { ...kandy, id: kandy.id },
		project_title: "Tea-export packaging design"
	});
	await quotes.update(ids.tea, {
		pricing_mode: "bundle",
		issue_date: daysAgo(20),
		valid_until: daysFromNow(10),
		vat_rate_basis_points: 1800,
		subtotal_cents: 25_000_000,
		tax_cents: 4_500_000,
		total_cents: 29_500_000,
		notes: "Includes 3 design rounds and final print-ready artwork.",
		prepared_by: "Acme Design Team"
	});
	await quotes.replaceLines(ids.tea, [
		{
			item_label: "Packaging design",
			description: "Logo refresh, label artwork, and tin-can illustrations",
			quantity_milli: 1000,
			unit: null,
			unit_price_cents: 0,
			tax_rate_basis_points: 0
		}
	]);
	await quotes.setStatus(ids.tea, "sent");

	// 2. Accepted — Galle Hotels — itemized, will get converted to invoice.
	ids.galle = await quotes.createDraft({
		client: { ...galle, id: galle.id },
		project_title: "Hotel branding refresh"
	});
	await quotes.update(ids.galle, {
		pricing_mode: "itemized",
		issue_date: daysAgo(45),
		valid_until: daysFromNow(15),
		vat_rate_basis_points: 1800,
		notes: "Final visuals delivered as production-ready PDFs.",
		prepared_by: "Acme Design Team"
	});
	await quotes.replaceLines(ids.galle, [
		{
			item_label: "Brand identity",
			description: "Logo, colour palette, type system",
			quantity_milli: 1000,
			unit: null,
			unit_price_cents: 18_000_000,
			tax_rate_basis_points: 1800
		},
		{
			item_label: "Stationery design",
			description: "Letterheads, business cards, room cards",
			quantity_milli: 1000,
			unit: null,
			unit_price_cents: 12_000_000,
			tax_rate_basis_points: 1800
		},
		{
			item_label: "Photography",
			description: "Two-day on-site shoot, edited deliverables",
			quantity_milli: 1000,
			unit: null,
			unit_price_cents: 18_000_000,
			tax_rate_basis_points: 1800
		}
	]);
	// Itemized totals: 48,000,000 subtotal + 18% VAT = 56,640,000 total.
	await quotes.update(ids.galle, {
		subtotal_cents: 48_000_000,
		tax_cents: 8_640_000,
		total_cents: 56_640_000
	});
	await quotes.setStatus(ids.galle, "sent");
	await quotes.setStatus(ids.galle, "accepted");

	// 3. Draft — Lanka Software — kept editable so the user can poke at it.
	ids.lanka = await quotes.createDraft({
		client: { ...lanka, id: lanka.id },
		project_title: "Internal dashboard prototype"
	});
	await quotes.update(ids.lanka, {
		pricing_mode: "bundle",
		subtotal_cents: 35_000_000,
		tax_cents: 6_300_000,
		total_cents: 41_300_000,
		vat_rate_basis_points: 1800,
		notes: "Two-week sprint; results delivered as a clickable Figma file."
	});

	return ids;
};

// ---------- Invoices ------------------------------------------------------

interface InvoiceIds {
	galle: number
	premier: number
	tea: number
	draft: number
}

const seedInvoices = async (cs: ClientIds, qs: QuoteIds): Promise<InvoiceIds> => {
	const invoices = useInvoicesStore();
	const quotes = useQuotesStore();
	const clients = useClientsStore();

	// 1. Convert the accepted Galle Hotels quote → mark paid in full.
	const acceptedQuote = await quotes.get(qs.galle);
	const acceptedLines = await quotes.getLines(qs.galle);
	if (!acceptedQuote) throw new Error("seedInvoices: missing accepted quote");
	const galleInvoiceId = await invoices.createFromQuote(acceptedQuote, acceptedLines);
	await quotes.markConverted(qs.galle, galleInvoiceId);
	await invoices.update(galleInvoiceId, {
		issue_date: daysAgo(40),
		due_date: daysAgo(10)
	});
	await invoices.setStatus(galleInvoiceId, "sent");
	// Galle's full payment is recorded via a receipt voucher in
	// seedVouchers below — invoices no longer carry their own
	// payment ledger (migration 0014).

	// 2. Premier Construction — partial. Big project, half paid so far.
	const premier = clients.clients.find((c) => c.id === cs.premier)!;
	const premierId = await invoices.createDraft({
		client: { ...premier, id: premier.id },
		project_title: "Office tower — Stage 2 invoicing"
	});
	await invoices.update(premierId, {
		pricing_mode: "bundle",
		issue_date: daysAgo(15),
		due_date: daysFromNow(15),
		vat_rate_basis_points: 1800,
		subtotal_cents: 120_000_000,
		tax_cents: 21_600_000,
		total_cents: 141_600_000,
		notes: "Stage-2 site work as per the agreed schedule."
	});
	await invoices.replaceLines(premierId, [
		{
			item_label: "Site work — Stage 2",
			description: "Foundations and ground-floor frame",
			quantity_milli: 1000,
			unit: null,
			unit_price_cents: 0,
			tax_rate_basis_points: 0
		}
	]);
	await invoices.setStatus(premierId, "sent");
	// Premier's first-milestone payment is recorded via a receipt
	// voucher in seedVouchers below.

	// 3. Kandy Tea — overdue. Issued a while back; due date is in the past.
	const kandy = clients.clients.find((c) => c.id === cs.kandyTea)!;
	const teaId = await invoices.createDraft({
		client: { ...kandy, id: kandy.id },
		project_title: "Q1 packaging — production"
	});
	await invoices.update(teaId, {
		pricing_mode: "bundle",
		issue_date: daysAgo(60),
		due_date: daysAgo(20),
		vat_rate_basis_points: 1800,
		subtotal_cents: 18_000_000,
		tax_cents: 3_240_000,
		total_cents: 21_240_000,
		notes: "Print run for the Q1 export shipment."
	});
	await invoices.replaceLines(teaId, [
		{
			item_label: "Print production",
			description: "5,000 units, full-colour, single-side",
			quantity_milli: 5000_000,
			unit: "units",
			unit_price_cents: 360,
			tax_rate_basis_points: 1800
		}
	]);
	await invoices.setStatus(teaId, "sent");

	// 4. Lanka Software — draft. Lets the user practice the editor.
	const lanka = clients.clients.find((c) => c.id === cs.lankaSoftware)!;
	const draftId = await invoices.createDraft({
		client: { ...lanka, id: lanka.id },
		project_title: "Discovery sprint — placeholder"
	});
	await invoices.update(draftId, {
		pricing_mode: "bundle",
		subtotal_cents: 9_000_000,
		tax_cents: 1_620_000,
		total_cents: 10_620_000,
		vat_rate_basis_points: 1800
	});

	return { galle: galleInvoiceId, premier: premierId, tea: teaId, draft: draftId };
};

// ---------- Bills ---------------------------------------------------------

// ---------- Bill categories -----------------------------------------------

interface CategoryIds {
	utilities: number
	supplies: number
	fees: number
}

const seedCategories = async (): Promise<CategoryIds> => {
	// Default bill categories are now stamped into the DB by the Rust
	// `create_tenant` flow (see src-tauri/src/tenants.rs). We just need to
	// load them and pick out the IDs the rest of the demo seed references
	// when attaching categories to the curated bills.
	const store = useBillCategoriesStore();
	await store.load();
	const findId = (name: string): number => {
		const row = store.categories.find((c) => c.name === name);
		if (!row) throw new Error(`seedCategories: expected default category "${name}" missing`);
		return row.id;
	};
	return {
		utilities: findId("Utilities"),
		supplies: findId("Supplies"),
		fees: findId("Fees")
	};
};

interface BillIds {
	ceb: number
	office: number
	bank: number
}

const vendorRow = (v: VendorRow) => ({
	id: v.id,
	name: v.name,
	contact_person: v.contact_person,
	email: v.email,
	phone: v.phone,
	address_line1: v.address_line1,
	address_line2: v.address_line2,
	city: v.city,
	postal_code: v.postal_code,
	country: v.country,
	tax_id: v.tax_id
});

const seedBills = async (vs: VendorIds, cats: CategoryIds): Promise<BillIds> => {
	const categoriesStore = useBillCategoriesStore();
	const snapshotFor = (id: number): string => {
		const row = categoriesStore.categories.find((c) => c.id === id);
		if (!row) throw new Error(`seedBills: category ${id} not found`);
		return buildCategorySnapshot(row);
	};
	const bills = useBillsStore();
	const vendors = useVendorsStore();
	const ids = { ceb: 0, office: 0, bank: 0 };

	const ceb = vendors.vendors.find((v) => v.id === vs.ceb)!;
	const office = vendors.vendors.find((v) => v.id === vs.officeSupplies)!;
	const hnb = vendors.vendors.find((v) => v.id === vs.hnbBank)!;

	// 1. CEB — paid in full.
	ids.ceb = await bills.createBill({ vendor: vendorRow(ceb) });
	await bills.update(ids.ceb, {
		issue_date: daysAgo(35),
		due_date: daysAgo(20),
		vendor_invoice_number: "CEB-2026-04-7782",
		category_id: cats.utilities,
		category_snapshot: snapshotFor(cats.utilities),
		pricing_mode: "bundle",
		vat_rate_basis_points: 1800,
		subtotal_cents: 3_000_000,
		tax_cents: 540_000,
		total_cents: 3_540_000,
		notes: "April commercial-rate consumption."
	});
	// CEB bill is fully paid via the linked payment voucher created
	// below in seedVouchers — no separate recordPayment call needed.
	// (Bills no longer have a paid_cents column; status is derived
	// from the sum of linked payment vouchers.)

	// 2. Lanka Office Supplies — unpaid, due soon.
	ids.office = await bills.createBill({ vendor: vendorRow(office) });
	await bills.update(ids.office, {
		issue_date: daysAgo(5),
		due_date: daysFromNow(25),
		vendor_invoice_number: "LOS-90213",
		category_id: cats.supplies,
		category_snapshot: snapshotFor(cats.supplies),
		pricing_mode: "bundle",
		vat_rate_basis_points: 1800,
		subtotal_cents: 4_500_000,
		tax_cents: 810_000,
		total_cents: 5_310_000,
		notes: "Stationery + printer toner restock."
	});

	// 3. HNB — partially paid.
	ids.bank = await bills.createBill({ vendor: vendorRow(hnb) });
	await bills.update(ids.bank, {
		issue_date: daysAgo(12),
		due_date: daysFromNow(3),
		vendor_invoice_number: "HNB-FX-2026-0048",
		category_id: cats.fees,
		category_snapshot: snapshotFor(cats.fees),
		pricing_mode: "bundle",
		vat_rate_basis_points: 0,
		subtotal_cents: 1_500_000,
		tax_cents: 0,
		total_cents: 1_500_000,
		notes: "Wire transfer + FX fees, March activity."
	});
	// HNB bill is partially paid — record the LKR 800k towards it as
	// a payment voucher linked back to this bill. The bill's derived
	// status will read 'partial' off the voucher ledger.
	await useVouchersStore().create({
		voucher_type: "payment",
		voucher_date: daysAgo(8),
		party_name: hnb.name,
		amount_cents: 800_000,
		payment_method: "bank_transfer",
		reference: "OUT-HNB-FX-1",
		description: `Partial payment for ${(await bills.get(ids.bank))?.number}`,
		related_invoice_id: null,
		related_bill_id: ids.bank,
		related_payslip_id: null,
		attachment_path: null
	});

	return ids;
};

// ---------- Vouchers ------------------------------------------------------

const seedVouchers = async (cs: ClientIds, vs: VendorIds, bs: BillIds, is: InvoiceIds) => {
	const vouchers = useVouchersStore();
	const clients = useClientsStore();
	const vendors = useVendorsStore();

	const galle = clients.clients.find((c) => c.id === cs.galleHotels)!;
	const premier = clients.clients.find((c) => c.id === cs.premier)!;
	const ceb = vendors.vendors.find((v) => v.id === vs.ceb)!;
	const office = vendors.vendors.find((v) => v.id === vs.officeSupplies)!;

	// 1. Receipt: Galle Hotels paid the converted invoice in full.
	// Linked to the invoice — that link is what flips the invoice's
	// derived status to 'paid' (no recordPayment call any more).
	await vouchers.create({
		voucher_type: "receipt",
		voucher_date: daysAgo(8),
		party_name: galle.name,
		amount_cents: 56_640_000,
		payment_method: "bank_transfer",
		reference: "TXN-883421",
		description: "Full payment for hotel branding refresh.",
		related_invoice_id: is.galle,
		related_bill_id: null,
		related_payslip_id: null,
		attachment_path: null
	});

	// 2. Receipt: Premier first-milestone payment (50%).
	await vouchers.create({
		voucher_type: "receipt",
		voucher_date: daysAgo(5),
		party_name: premier.name,
		amount_cents: 60_000_000,
		payment_method: "cheque",
		reference: "CHQ-001245",
		description: "Stage-2 milestone (50%).",
		related_invoice_id: is.premier,
		related_bill_id: null,
		related_payslip_id: null,
		attachment_path: null
	});

	// 3. Payment: CEB bill cleared.
	await vouchers.create({
		voucher_type: "payment",
		voucher_date: daysAgo(20),
		party_name: ceb.name,
		amount_cents: 3_540_000,
		payment_method: "bank_transfer",
		reference: "OUT-CEB-04",
		description: "April electricity bill.",
		related_invoice_id: null,
		related_bill_id: bs.ceb,
		related_payslip_id: null,
		attachment_path: null
	});

	// 4. Payment: cash advance to Office Supplies (unrelated to bill #2 —
	//    a standalone voucher to show the "no link" path).
	await vouchers.create({
		voucher_type: "payment",
		voucher_date: daysAgo(2),
		party_name: office.name,
		amount_cents: 250_000,
		payment_method: "cash",
		reference: null,
		description: "Petty-cash advance for delivery handler.",
		related_invoice_id: null,
		related_bill_id: null,
		related_payslip_id: null,
		attachment_path: null
	});
};

// ---------- Payroll: employees + payslips --------------------------------

// 10 staff covering a plausible range of roles, salaries, and bank
// details so the payroll dashboard, employees list, and payslip flows
// all have realistic content to render. Joining dates are spread across
// the last 5 years so "joining_date" filtering / sorting looks lived-in.
interface DemoEmployee {
	full_name: string
	employee_number: string
	nic: string
	designation: string
	email: string
	phone: string
	address_line1: string
	city: string
	joining_date: string // ISO
	basic_salary_cents: number
	bank_branch: string
	bank_account_number: string
}

const DEMO_EMPLOYEES: DemoEmployee[] = [
	{
		full_name: "Nimal Perera",
		employee_number: "E001",
		nic: "198512345678",
		designation: "Managing Director",
		email: "nimal@acme.example",
		phone: "+94 77 111 2233",
		address_line1: "42 Bauddhaloka Mawatha",
		city: "Colombo",
		joining_date: daysAgo(1825), // 5y
		basic_salary_cents: 50000000, // LKR 500,000
		bank_branch: "Colombo Main",
		bank_account_number: "0049-1000-0001"
	},
	{
		full_name: "Saman Fernando",
		employee_number: "E002",
		nic: "199023456789",
		designation: "Operations Manager",
		email: "saman@acme.example",
		phone: "+94 77 222 3344",
		address_line1: "18 Lake Drive",
		city: "Kandy",
		joining_date: daysAgo(1460), // 4y
		basic_salary_cents: 27500000, // 275,000
		bank_branch: "Kandy",
		bank_account_number: "0049-1000-0002"
	},
	{
		full_name: "Kumari Wijesinghe",
		employee_number: "E003",
		nic: "198734567890",
		designation: "Senior Accountant",
		email: "kumari@acme.example",
		phone: "+94 77 333 4455",
		address_line1: "7 Marine Avenue",
		city: "Colombo",
		joining_date: daysAgo(1280),
		basic_salary_cents: 22500000, // 225,000
		bank_branch: "Colombo Main",
		bank_account_number: "0049-1000-0003"
	},
	{
		full_name: "Ravindra De Silva",
		employee_number: "E004",
		nic: "199145678901",
		designation: "Software Engineer",
		email: "ravi@acme.example",
		phone: "+94 77 444 5566",
		address_line1: "55 Galle Road",
		city: "Colombo",
		joining_date: daysAgo(910),
		basic_salary_cents: 18500000, // 185,000
		bank_branch: "Colombo Main",
		bank_account_number: "0049-1000-0004"
	},
	{
		full_name: "Anushka Bandara",
		employee_number: "E005",
		nic: "199256789012",
		designation: "Sales Executive",
		email: "anushka@acme.example",
		phone: "+94 77 555 6677",
		address_line1: "12 Hill Street",
		city: "Negombo",
		joining_date: daysAgo(730),
		basic_salary_cents: 12500000, // 125,000
		bank_branch: "Negombo",
		bank_account_number: "0049-1000-0005"
	},
	{
		full_name: "Tharindu Jayasooriya",
		employee_number: "E006",
		nic: "199367890123",
		designation: "Marketing Coordinator",
		email: "tharindu@acme.example",
		phone: "+94 77 666 7788",
		address_line1: "88 Temple Road",
		city: "Galle",
		joining_date: daysAgo(640),
		basic_salary_cents: 11000000, // 110,000
		bank_branch: "Galle",
		bank_account_number: "0049-1000-0006"
	},
	{
		full_name: "Dilani Senanayake",
		employee_number: "E007",
		nic: "199478901234",
		designation: "HR & Admin Officer",
		email: "dilani@acme.example",
		phone: "+94 77 777 8899",
		address_line1: "3 Park Lane",
		city: "Colombo",
		joining_date: daysAgo(540),
		basic_salary_cents: 9500000, // 95,000
		bank_branch: "Colombo Main",
		bank_account_number: "0049-1000-0007"
	},
	{
		full_name: "Pradeep Kumar",
		employee_number: "E008",
		nic: "199589012345",
		designation: "Logistics Coordinator",
		email: "pradeep@acme.example",
		phone: "+94 77 888 9900",
		address_line1: "21 Station Road",
		city: "Kurunegala",
		joining_date: daysAgo(420),
		basic_salary_cents: 8500000, // 85,000
		bank_branch: "Kurunegala",
		bank_account_number: "0049-1000-0008"
	},
	{
		full_name: "Chathura Hettiarachchi",
		employee_number: "E009",
		nic: "199690123456",
		designation: "Office Assistant",
		email: "chathura@acme.example",
		phone: "+94 77 999 0011",
		address_line1: "9 Beach Road",
		city: "Matara",
		joining_date: daysAgo(310),
		basic_salary_cents: 7000000, // 70,000
		bank_branch: "Matara",
		bank_account_number: "0049-1000-0009"
	},
	{
		full_name: "Sandun Rathnayake",
		employee_number: "E010",
		nic: "199801234567",
		designation: "Driver",
		email: "sandun@acme.example",
		phone: "+94 77 121 3344",
		address_line1: "44 Old Road",
		city: "Anuradhapura",
		joining_date: daysAgo(180),
		basic_salary_cents: 6000000, // 60,000
		bank_branch: "Anuradhapura",
		bank_account_number: "0049-1000-0010"
	}
];

const seedEmployees = async (): Promise<number[]> => {
	const store = useEmployeesStore();
	const ids: number[] = [];
	for (const e of DEMO_EMPLOYEES) {
		const id = await store.create({
			full_name: e.full_name,
			employee_number: e.employee_number,
			nic: e.nic,
			designation: e.designation,
			email: e.email,
			phone: e.phone,
			address_line1: e.address_line1,
			address_line2: null,
			city: e.city,
			postal_code: null,
			country: "Sri Lanka",
			joining_date: e.joining_date,
			basic_salary_cents: e.basic_salary_cents,
			bank_name: "Hatton National Bank",
			bank_branch: e.bank_branch,
			bank_account_number: e.bank_account_number,
			bank_account_name: e.full_name,
			notes: null
		});
		ids.push(id);
	}
	return ids;
};

// First-and-last-day-of-month helpers tuned for "the month N months back
// from today". monthOffset = 0 → current month, -1 → previous, etc.
function monthBoundsFromOffset(offset: number): { start: string, end: string } {
	const today = new Date();
	const ref = new Date(today.getFullYear(), today.getMonth() + offset, 1);
	const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
	const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
	const iso = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	return { start: iso(start), end: iso(end) };
}

// Seed three months of payslips for every employee so the dashboard /
// recent-runs / chart have something to plot.
//
// Timeline (offset = months from current):
//   -2: every employee, issued + fully paid     ← "Complete" run
//   -1: every employee, issued; one partial,
//                       one unpaid; rest paid    ← "Pending" run
//    0: half draft, half issued (some paid)     ← current cycle in progress
const seedPayslips = async (employeeIds: number[]): Promise<void> => {
	const payslips = usePayslipsStore();
	const vouchers = useVouchersStore();
	const employees = useEmployeesStore();

	for (let offsetIdx = 0; offsetIdx < 3; offsetIdx++) {
		const offset = -2 + offsetIdx; // -2, -1, 0
		const bounds = monthBoundsFromOffset(offset);
		const payDate = bounds.end;

		for (let i = 0; i < employeeIds.length; i++) {
			const empId = employeeIds[i]!;
			const e = employees.employees.find((x) => x.id === empId);
			if (!e) continue;

			const payslipId = await payslips.createPayslip({
				employee: {
					id: e.id,
					full_name: e.full_name,
					employee_number: e.employee_number,
					nic: e.nic,
					designation: e.designation,
					email: e.email,
					phone: e.phone,
					address_line1: e.address_line1,
					address_line2: e.address_line2,
					city: e.city,
					postal_code: e.postal_code,
					country: e.country,
					joining_date: e.joining_date,
					basic_salary_cents: e.basic_salary_cents,
					bank_name: e.bank_name,
					bank_branch: e.bank_branch,
					bank_account_number: e.bank_account_number,
					bank_account_name: e.bank_account_name
				},
				periodStart: bounds.start,
				periodEnd: bounds.end,
				payDate
			});

			// Decide status + payment per the timeline above. The default
			// payslip seed only has the Basic earning line, so net ==
			// basic_salary_cents (good enough for the dashboard plots).
			const net = e.basic_salary_cents;
			let issue = true;
			let payAmount: number | null = null;
			if (offset === -2) {
				payAmount = net; // fully paid
			} else if (offset === -1) {
				if (i === 0) payAmount = Math.round(net / 2); // partial
				else if (i === 1) payAmount = null; // unpaid
				else payAmount = net; // paid
			} else {
				// Current month: alternate draft / issued. Pay half of
				// the issued ones so "in progress" tells a believable story.
				if (i % 2 === 0) {
					issue = false; // draft
				} else {
					payAmount = i % 4 === 1 ? net : null;
				}
			}

			if (issue) await payslips.setStatus(payslipId, "issued");
			if (payAmount !== null && payAmount > 0) {
				await vouchers.create({
					voucher_type: "payment",
					voucher_date: payDate,
					party_name: e.full_name,
					amount_cents: payAmount,
					payment_method: "bank_transfer",
					reference: `TXN-${payDate.replace(/-/g, "")}-${e.employee_number ?? e.id}`,
					description: `Salary for ${bounds.start.slice(0, 7)}`,
					related_invoice_id: null,
					related_bill_id: null,
					related_payslip_id: payslipId,
					attachment_path: null
				});
			}
		}
	}
};

// ---------- Bulk fill (for pagination / list-perf testing) ---------------

// How many extra rows of each entity to add on top of the curated seed.
// Tuned to push totals past the comfortable single-screen threshold so list
// pages, filters, and (eventually) pagination get exercised.
const BULK_COUNT = 22;

const CITIES = ["Colombo", "Kandy", "Galle", "Jaffna", "Negombo", "Matara", "Kurunegala", "Anuradhapura"] as const;

const seedBulkClients = async (): Promise<number[]> => {
	const store = useClientsStore();
	const ids: number[] = [];
	for (let i = 1; i <= BULK_COUNT; i++) {
		const tag = String(i).padStart(2, "0");
		ids.push(await store.create({
			name: `Demo Client ${tag}`,
			contact_person: `Contact ${tag}`,
			email: `client-${tag}@demo.example`,
			phone: null,
			address_line1: `${i * 7} Test Street`,
			address_line2: null,
			city: CITIES[i % CITIES.length] ?? "Colombo",
			postal_code: null,
			country: "Sri Lanka",
			tax_id: i % 3 === 0 ? `VAT-9${tag}00${tag}` : null,
			notes: null
		}));
	}
	return ids;
};

const seedBulkVendors = async (): Promise<number[]> => {
	const store = useVendorsStore();
	const ids: number[] = [];
	for (let i = 1; i <= BULK_COUNT; i++) {
		const tag = String(i).padStart(2, "0");
		ids.push(await store.create({
			name: `Demo Vendor ${tag}`,
			contact_person: null,
			email: `vendor-${tag}@demo.example`,
			phone: null,
			address_line1: `${i * 11} Supplier Lane`,
			address_line2: null,
			city: CITIES[(i + 3) % CITIES.length] ?? "Colombo",
			postal_code: null,
			country: "Sri Lanka",
			tax_id: null,
			notes: null
		}));
	}
	return ids;
};

const seedBulkQuotes = async (clientIds: number[]) => {
	const quotes = useQuotesStore();
	const clients = useClientsStore();
	// Cycle through 4 status outcomes: draft → sent → accepted → rejected.
	// Expired quotes happen automatically when sent ones with valid_until in
	// the past hit `expireOverdue()` at the end of the seed.
	const outcomes = ["draft", "sent", "accepted", "rejected", "sent-old"] as const;
	for (let i = 1; i <= BULK_COUNT; i++) {
		const cid = clientIds[i % clientIds.length]!;
		const client = clients.clients.find((c) => c.id === cid);
		if (!client) continue;
		const id = await quotes.createDraft({
			client: { ...client, id: client.id },
			project_title: `Bulk project ${String(i).padStart(2, "0")}`
		});
		const subtotal = (5 + (i % 20)) * 1_000_000; // 5M..25M LKR
		const tax = Math.round(subtotal * 0.18);
		const issueDays = (i * 13) % 300; // spread across roughly the past 10 months
		await quotes.update(id, {
			pricing_mode: "bundle",
			issue_date: daysAgo(issueDays),
			valid_until: daysAgo(issueDays - 30), // 30-day validity from issue
			vat_rate_basis_points: 1800,
			subtotal_cents: subtotal,
			tax_cents: tax,
			total_cents: subtotal + tax,
			notes: null,
			prepared_by: "Demo seeder"
		});
		const outcome = outcomes[i % outcomes.length];
		if (outcome === "sent" || outcome === "sent-old" || outcome === "accepted" || outcome === "rejected") {
			await quotes.setStatus(id, "sent");
		}
		if (outcome === "accepted") await quotes.setStatus(id, "accepted");
		if (outcome === "rejected") await quotes.setStatus(id, "rejected");
		// "sent-old" stays sent with a past valid_until — expireOverdue() at
		// the end will flip it to expired, populating that filter bucket.
	}
};

const seedBulkInvoices = async (clientIds: number[]) => {
	const invoices = useInvoicesStore();
	const clients = useClientsStore();
	const vouchers = useVouchersStore();
	// Mix: draft / sent / partial / paid / overdue / cancelled.
	const outcomes = ["draft", "sent", "partial", "paid", "overdue", "cancelled"] as const;
	for (let i = 1; i <= BULK_COUNT; i++) {
		const cid = clientIds[(i + 5) % clientIds.length]!;
		const client = clients.clients.find((c) => c.id === cid);
		if (!client) continue;
		const id = await invoices.createDraft({
			client: { ...client, id: client.id },
			project_title: `Bulk invoice ${String(i).padStart(2, "0")}`
		});
		const subtotal = (10 + (i % 30)) * 1_000_000; // 10M..40M LKR
		const tax = Math.round(subtotal * 0.18);
		const total = subtotal + tax;
		const issueDays = (i * 11) % 320;
		const dueOffset = i % 5 === 0 ? -30 : 30; // every 5th: already overdue
		await invoices.update(id, {
			pricing_mode: "bundle",
			issue_date: daysAgo(issueDays),
			due_date: daysAgo(issueDays - dueOffset),
			vat_rate_basis_points: 1800,
			subtotal_cents: subtotal,
			tax_cents: tax,
			total_cents: total,
			notes: null,
			terms: null,
			prepared_by: "Demo seeder"
		});
		const outcome = outcomes[i % outcomes.length];
		if (outcome === "draft") continue;
		await invoices.setStatus(id, "sent");
		// Payments now flow through receipt vouchers — invoices don't
		// carry their own paid_cents, status flips to 'partial' /
		// 'paid' purely from linked vouchers' amount sums. "Overdue"
		// is derived from the due date, no flagOverdue call needed.
		const clientName = client.name;
		if (outcome === "partial") {
			await vouchers.create({
				voucher_type: "receipt",
				voucher_date: daysAgo(Math.max(0, issueDays - 5)),
				party_name: clientName,
				amount_cents: Math.floor(total / 2),
				payment_method: "bank_transfer",
				reference: `PART-${String(i).padStart(3, "0")}`,
				description: `Bulk partial invoice #${i}`,
				related_invoice_id: id,
				related_bill_id: null,
				related_payslip_id: null,
				attachment_path: null
			});
		} else if (outcome === "paid") {
			await vouchers.create({
				voucher_type: "receipt",
				voucher_date: daysAgo(Math.max(0, issueDays - 5)),
				party_name: clientName,
				amount_cents: total,
				payment_method: "bank_transfer",
				reference: `PAID-${String(i).padStart(3, "0")}`,
				description: `Bulk paid invoice #${i}`,
				related_invoice_id: id,
				related_bill_id: null,
				related_payslip_id: null,
				attachment_path: null
			});
		} else if (outcome === "cancelled") {
			await invoices.setStatus(id, "cancelled");
		}
	}
};

const seedBulkBills = async (vendorIds: number[], catIds: CategoryIds, allCats: number[]) => {
	const bills = useBillsStore();
	const vendors = useVendorsStore();
	const vouchers = useVouchersStore();
	const categoriesStore = useBillCategoriesStore();
	const snapFor = (id: number): string => {
		const row = categoriesStore.categories.find((c) => c.id === id);
		if (!row) throw new Error(`bulk bills: category ${id} missing`);
		return buildCategorySnapshot(row);
	};
	const outcomes = ["unpaid", "partial", "paid", "overdue", "cancelled"] as const;
	void catIds; // kept for parity if a future variant wants the curated trio
	for (let i = 1; i <= BULK_COUNT; i++) {
		const vid = vendorIds[i % vendorIds.length]!;
		const vendor = vendors.vendors.find((v) => v.id === vid);
		if (!vendor) continue;
		const id = await bills.createBill({ vendor: {
			id: vendor.id,
			name: vendor.name,
			contact_person: vendor.contact_person,
			email: vendor.email,
			phone: vendor.phone,
			address_line1: vendor.address_line1,
			address_line2: vendor.address_line2,
			city: vendor.city,
			postal_code: vendor.postal_code,
			country: vendor.country,
			tax_id: vendor.tax_id
		} });
		const subtotal = (2 + (i % 15)) * 500_000; // 1M..8.5M
		const tax = Math.round(subtotal * 0.18);
		const total = subtotal + tax;
		const issueDays = (i * 9) % 300;
		const dueOffset = i % 4 === 0 ? -20 : 30;
		const cid = allCats[i % allCats.length]!;
		await bills.update(id, {
			pricing_mode: "bundle",
			issue_date: daysAgo(issueDays),
			due_date: daysAgo(issueDays - dueOffset),
			vendor_invoice_number: `BLK-${String(i).padStart(4, "0")}`,
			vat_rate_basis_points: 1800,
			subtotal_cents: subtotal,
			tax_cents: tax,
			total_cents: total,
			category_id: cid,
			category_snapshot: snapFor(cid),
			notes: null
		});
		const outcome = outcomes[i % outcomes.length];
		// Payments now flow through vouchers — bills don't carry their own
		// paid_cents, status flips to 'partial' / 'paid' purely from
		// linked vouchers' amount sums. "Overdue" is derived from the
		// due date and how much remains, no flagOverdue call needed.
		const vendorName = vendor.name;
		if (outcome === "paid") {
			await vouchers.create({
				voucher_type: "payment",
				voucher_date: daysAgo(Math.max(0, issueDays - 5)),
				party_name: vendorName,
				amount_cents: total,
				payment_method: "bank_transfer",
				reference: `BLK-PAY-${String(i).padStart(4, "0")}`,
				description: `Bulk paid bill #${i}`,
				related_invoice_id: null,
				related_bill_id: id,
				related_payslip_id: null,
				attachment_path: null
			});
		} else if (outcome === "partial") {
			await vouchers.create({
				voucher_type: "payment",
				voucher_date: daysAgo(Math.max(0, issueDays - 3)),
				party_name: vendorName,
				amount_cents: Math.floor(total / 2),
				payment_method: "bank_transfer",
				reference: `BLK-PAY-${String(i).padStart(4, "0")}-P`,
				description: `Bulk partial bill #${i}`,
				related_invoice_id: null,
				related_bill_id: id,
				related_payslip_id: null,
				attachment_path: null
			});
		} else if (outcome === "cancelled") {
			await bills.setCancelled(id, true);
		}
	}
};

const seedBulkVouchers = async (clientIds: number[], vendorIds: number[]) => {
	const vouchers = useVouchersStore();
	const clients = useClientsStore();
	const vendors = useVendorsStore();
	const methods = ["bank_transfer", "cash", "cheque", "card", "other"] as const;
	for (let i = 1; i <= BULK_COUNT; i++) {
		const isReceipt = i % 2 === 0;
		const partyId = isReceipt
			? clientIds[i % clientIds.length]!
			: vendorIds[i % vendorIds.length]!;
		const partyName = isReceipt
			? clients.clients.find((c) => c.id === partyId)?.name ?? "Demo client"
			: vendors.vendors.find((v) => v.id === partyId)?.name ?? "Demo vendor";
		const amount = (1 + (i % 12)) * 500_000;
		await vouchers.create({
			voucher_type: isReceipt ? "receipt" : "payment",
			voucher_date: daysAgo((i * 7) % 280),
			party_name: partyName,
			amount_cents: amount,
			payment_method: methods[i % methods.length] ?? "bank_transfer",
			reference: `BLK-VCH-${String(i).padStart(4, "0")}`,
			description: isReceipt
				? `Bulk receipt #${i}`
				: `Bulk payment #${i}`,
			related_invoice_id: null,
			related_bill_id: null,
			related_payslip_id: null,
			attachment_path: null
		});
	}
};

// ---------- Public entry point -------------------------------------------

/**
 * Create a fully-populated demo tenant and activate it. Returns the new
 * tenant. Caller is expected to navigate (typically
 * `window.location.assign("/")`) after this resolves so every Pinia store
 * re-hydrates against the freshly-seeded DB.
 *
 * `displayName` is what shows up in the sidebar / picker — defaults to
 * "Acme Trading Co (demo)" so it's unambiguous in the businesses list.
 */
export const createDemoBusiness = async (
	displayName = "Acme Trading Co (demo)"
): Promise<Tenant> => {
	const tenants = useTenantsStore();

	// 1. Create the tenant + 2. activate it. After activate(), getDb() in
	// every other store will use this new DB.
	const t = await tenants.create(displayName);
	await tenants.activate(t.id);

	// 3. Seed — curated handcrafted set first, so the dashboard / detail
	// pages have realistic content. Bulk fill afterwards adds enough volume
	// to exercise list pages, filters, and (eventually) pagination.
	await seedSettings();
	// Bank account is seeded before clients/quotes/invoices so the
	// document seeders can pick it up via the default-bank lookup in
	// quotes/invoices stores.
	await seedBanks();
	const clients = await seedClients();
	const vendors = await seedVendors();
	const categories = await seedCategories();
	const quotes = await seedQuotes(clients);
	const invoices = await seedInvoices(clients, quotes);
	const bills = await seedBills(vendors, categories);
	await seedVouchers(clients, vendors, bills, invoices);

	// Payroll: 10 employees + 3 months of payslips with realistic status
	// mix so the dashboard / chart / recent-runs all light up.
	const employeeIds = await seedEmployees();
	await seedPayslips(employeeIds);

	// 4. Bulk fill. Adds ~22 more rows of each entity on top of the curated
	// set so list pages have realistic volume to scroll/filter/paginate.
	const bulkClientIds = await seedBulkClients();
	const bulkVendorIds = await seedBulkVendors();
	const allClientIds = [
		...Object.values(clients),
		...bulkClientIds
	];
	const allVendorIds = [
		...Object.values(vendors),
		...bulkVendorIds
	];
	const allCategoryIds = useBillCategoriesStore().categories.map((c) => c.id);
	await seedBulkQuotes(allClientIds);
	await seedBulkInvoices(allClientIds);
	await seedBulkBills(allVendorIds, categories, allCategoryIds);
	await seedBulkVouchers(allClientIds, allVendorIds);

	// Both invoices and bills now derive their overdue presentation
	// from due_date + linked-voucher sums every time it's read — no
	// flagOverdue call needed at the end of the seed.

	return t;
};
