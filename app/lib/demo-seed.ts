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
import { useClientsStore } from "~/stores/clients";
import { useInvoicesStore } from "~/stores/invoices";
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
		bank_name: "Hatton National Bank",
		bank_account_name: "Acme Trading Co",
		bank_account_number: "0049-1234-5678",
		bank_branch: "Colombo Main",
		default_vat_rate: 1800,
		default_payment_terms_days: 30,
		default_quote_validity_days: 30,
		fiscal_year_start_month: 4
	});
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

const seedInvoices = async (cs: ClientIds, qs: QuoteIds) => {
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
	await invoices.recordPayment(galleInvoiceId, {
		payment_date: daysAgo(8),
		amount_cents: 56_640_000,
		method: "bank_transfer",
		reference: "TXN-883421",
		notes: "Full payment received."
	});

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
	await invoices.recordPayment(premierId, {
		payment_date: daysAgo(5),
		amount_cents: 60_000_000,
		method: "cheque",
		reference: "CHQ-001245",
		notes: "Initial milestone payment."
	});

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
};

// ---------- Bills ---------------------------------------------------------

// ---------- Bill categories -----------------------------------------------

interface CategoryIds {
	utilities: number
	supplies: number
	fees: number
}

const seedCategories = async (): Promise<CategoryIds> => {
	const store = useBillCategoriesStore();
	const ids: CategoryIds = {
		utilities: await store.create({ name: "Utilities", color: "amber", icon: "i-lucide-zap" }),
		supplies: await store.create({ name: "Supplies", color: "blue", icon: "i-lucide-package" }),
		fees: await store.create({ name: "Fees", color: "violet", icon: "i-lucide-briefcase" })
	};
	return ids;
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
	await bills.recordPayment(ids.ceb, 3_540_000);

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
	await bills.recordPayment(ids.bank, 800_000);

	return ids;
};

// ---------- Vouchers ------------------------------------------------------

const seedVouchers = async (cs: ClientIds, vs: VendorIds, bs: BillIds) => {
	const vouchers = useVouchersStore();
	const clients = useClientsStore();
	const vendors = useVendorsStore();

	const galle = clients.clients.find((c) => c.id === cs.galleHotels)!;
	const premier = clients.clients.find((c) => c.id === cs.premier)!;
	const ceb = vendors.vendors.find((v) => v.id === vs.ceb)!;
	const office = vendors.vendors.find((v) => v.id === vs.officeSupplies)!;

	// 1. Receipt: Galle Hotels paid the converted invoice in full.
	await vouchers.create({
		voucher_type: "receipt",
		voucher_date: daysAgo(8),
		party_name: galle.name,
		amount_cents: 56_640_000,
		payment_method: "bank_transfer",
		reference: "TXN-883421",
		description: "Full payment for hotel branding refresh.",
		related_invoice_id: null,
		related_bill_id: null,
		attachment_path: null
	});

	// 2. Receipt: Premier first-milestone payment.
	await vouchers.create({
		voucher_type: "receipt",
		voucher_date: daysAgo(5),
		party_name: premier.name,
		amount_cents: 60_000_000,
		payment_method: "cheque",
		reference: "CHQ-001245",
		description: "Stage-2 milestone (50%).",
		related_invoice_id: null,
		related_bill_id: null,
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
		attachment_path: null
	});
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

	// 3. Seed.
	await seedSettings();
	const clients = await seedClients();
	const vendors = await seedVendors();
	const categories = await seedCategories();
	const quotes = await seedQuotes(clients);
	await seedInvoices(clients, quotes);
	const bills = await seedBills(vendors, categories);
	await seedVouchers(clients, vendors, bills);

	// Auto-overdue any sent invoices/bills whose due date is already past.
	// `flagOverdue` runs anyway on next dashboard load — calling it
	// here makes sure the demo's "overdue" tile shows real data
	// immediately on first paint.
	await useInvoicesStore().flagOverdue();
	await useBillsStore().flagOverdue();

	return t;
};
