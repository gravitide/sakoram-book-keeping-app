// One-click "create a demo business" — used from the welcome screen and
// from Settings → Businesses to give new users something to click
// around in immediately.
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
// The demo is a SHOWCASE, not a stress test: a small, hand-written
// business with one of everything the app can do — every quote /
// invoice / bill / payslip status, a credit note, recurring templates
// (one already due), two bank accounts, a statement import to
// reconcile, letters with signatures, and a few attachments — all dated
// within the last ~6 months so the dashboard, calendar and report
// presets light up. It seeds in seconds. (The earlier 200-client /
// 800-invoice bulk fill that exercised list paging was retired in
// v0.164.0; if a stress fixture is ever wanted again, build it as a
// separate script, not into the demo.)

import type { AttachmentFile, DocumentType } from "~/stores/document_attachments";
import type { Tenant } from "~/stores/tenants";
import type { VendorRow } from "~/stores/vendors";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, appLocalDataDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";
import { peekNextSequence } from "~/lib/numbering";
import { useBankStatementsStore } from "~/stores/bank_statements";
import { buildCategorySnapshot, useBillCategoriesStore } from "~/stores/bill_categories";
import { useBillsStore } from "~/stores/bills";
import { useBusinessBanksStore } from "~/stores/business_banks";
import { useClientsStore } from "~/stores/clients";
import { useCreditNotesStore } from "~/stores/credit_notes";
import { useDocumentAttachmentsStore } from "~/stores/document_attachments";
import { useEmployeesStore } from "~/stores/employees";
import { useInvoicesStore } from "~/stores/invoices";
import { useLetterCategoriesStore } from "~/stores/letter_categories";
import { useLetterSignaturesStore } from "~/stores/letter_signatures";
import { useLettersStore } from "~/stores/letters";
import { usePayslipsStore } from "~/stores/payslips";
import { useQuotesStore } from "~/stores/quotes";
import { useRecurringBillsStore } from "~/stores/recurring_bills";
import { useRecurringInvoicesStore } from "~/stores/recurring_invoices";
import { useSettingsStore } from "~/stores/settings";
import { useTenantsStore } from "~/stores/tenants";
import { useVendorsStore } from "~/stores/vendors";
import { useVouchersStore } from "~/stores/vouchers";

/// Per-stage progress reporter passed by callers (the welcome page +
/// Settings → Businesses). `total` is 0 when the stage is a single
/// atomic step — the UI then shows just the stage label. The seed is
/// quick now, but the overlay still needs something to say.
export interface SeedProgress {
	stage: string
	done: number
	total: number
}

export type SeedProgressFn = (p: SeedProgress) => void;

const noopProgress: SeedProgressFn = () => { /* */ };

// ---------- Dates ----------------------------------------------------------

// Every demo document is some `daysAgo(N)` so the lists land sorted
// naturally and "This month" / "Last month" / "Fiscal year" all catch
// something.
const isoOf = (d: Date): string =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return isoOf(d);
}

function daysFromNow(n: number): string {
	return daysAgo(-n);
}

// First / last day of "the month N months back from today" (0 = this
// month, -1 = last month …).
function monthBoundsFromOffset(offset: number): { start: string, end: string } {
	const today = new Date();
	const ref = new Date(today.getFullYear(), today.getMonth() + offset, 1);
	return {
		start: isoOf(new Date(ref.getFullYear(), ref.getMonth(), 1)),
		end: isoOf(new Date(ref.getFullYear(), ref.getMonth() + 1, 0))
	};
}

// ---------- Rich text ------------------------------------------------------

// Minimal TipTap / ProseMirror document builders for letter bodies and
// signatures — the same JSON the RichTextEditor produces, so
// letter-body.ts renders them exactly like a hand-written letter.
interface Run { type: "text", text: string, marks?: { type: string }[] }
const text = (t: string): Run => ({ type: "text", text: t });
const bold = (t: string): Run => ({ type: "text", text: t, marks: [{ type: "bold" }] });
const paragraph = (...runs: Run[]) => (runs.length > 0 ? { type: "paragraph", content: runs } : { type: "paragraph" });
const bullets = (...items: string[]) => ({
	type: "bulletList",
	content: items.map((i) => ({ type: "listItem", content: [paragraph(text(i))] }))
});
const richDoc = (...content: unknown[]): string => JSON.stringify({ type: "doc", content });

// ---------- Settings + banks -----------------------------------------------

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
		fiscal_year_start_month: 4,
		// Quotes / invoices pre-fill "Prepared by" from here.
		default_prepared_by: richDoc(paragraph(bold("Nimal Perera")), paragraph(text("Managing Director, Acme Trading Co"))),
		// EPF / ETF on so every payslip shows the statutory lines; PAYE
		// stays off — none of the demo salaries clear the relief anyway.
		statutory_auto_compute: 1,
		paye_auto_compute: 0,
		payslip_show_signatures: 1
	});
};

interface BankIds {
	hnb: number
	comBank: number
}

// Two accounts so the colour dots, the per-bank voucher method cell and
// the /reconcile bank scope all have something to distinguish.
const seedBanks = async (): Promise<BankIds> => {
	const store = useBusinessBanksStore();
	const hnb = await store.create({
		label: "HNB Colombo Main",
		bank_name: "Hatton National Bank",
		bank_account_name: "Acme Trading Co",
		bank_account_number: "0049-1234-5678",
		bank_branch: "Colombo Main",
		color: "green"
	});
	const comBank = await store.create({
		label: "Commercial Bank — Savings",
		bank_name: "Commercial Bank of Ceylon",
		bank_account_name: "Acme Trading Co",
		bank_account_number: "8001-2345-6789",
		bank_branch: "Kollupitiya",
		color: "blue"
	});
	await store.setDefault(hnb);
	return { hnb, comBank };
};

// ---------- Signatures (shared by letters + "Prepared by") -----------------

const seedSignatures = async () => {
	const store = useLetterSignaturesStore();
	await store.create({
		name: "Nimal Perera — Managing Director",
		body_json: richDoc(paragraph(text("Yours sincerely,")), paragraph(), paragraph(bold("Nimal Perera")), paragraph(text("Managing Director")), paragraph(text("Acme Trading Co"))),
		isDefault: true
	});
	await store.create({
		name: "Kumari Wijesinghe — Accounts",
		body_json: richDoc(paragraph(text("Kind regards,")), paragraph(), paragraph(bold("Kumari Wijesinghe")), paragraph(text("Senior Accountant, Acme Trading Co")))
	});
};

// ---------- Clients --------------------------------------------------------

interface ClientIds {
	kandyTea: number
	galleHotels: number
	lankaSoftware: number
	premier: number
	serendib: number
	oceanView: number
	harbour: number
	dental: number
}

const seedClients = async (): Promise<ClientIds> => {
	const store = useClientsStore();
	const base = { address_line2: null, country: "Sri Lanka", tax_id: null, notes: null };
	const ids: ClientIds = {
		kandyTea: await store.create({ ...base, name: "Kandy Tea Exports", contact_person: "Nimal Perera", email: "nimal@kandytea.example", phone: "+94 81 222 3344", address_line1: "45 Peradeniya Road", city: "Kandy", postal_code: "20000", tax_id: "VAT-998877665", notes: "Quarterly tea-export campaigns; pays late in the season." }),
		galleHotels: await store.create({ ...base, name: "Galle Hotels Ltd", contact_person: "Ruwani Jayasuriya", email: "accounts@gallehotels.example", phone: "+94 91 555 1212", address_line1: "Lighthouse Street", address_line2: "Galle Fort", city: "Galle", postal_code: "80000", tax_id: "VAT-554433221", notes: "Hospitality group — books branding work seasonally." }),
		lankaSoftware: await store.create({ ...base, name: "Lanka Software Solutions", contact_person: "Dinesh Fernando", email: "dinesh@lankasw.example", phone: "+94 11 778 9090", address_line1: "Tower B, Floor 7", address_line2: "Trace City", city: "Colombo", postal_code: "01000", tax_id: "VAT-112233445", notes: "Monthly design retainer." }),
		premier: await store.create({ ...base, name: "Premier Construction", contact_person: "Asela Bandara", email: "asela@premier.example", phone: "+94 11 234 9090", address_line1: "88 Duplication Road", city: "Colombo", postal_code: "00400", notes: "Long-running site project — invoiced per stage." }),
		serendib: await store.create({ ...base, name: "Serendib Spice Traders", contact_person: "Fathima Rizvi", email: "fathima@serendibspice.example", phone: "+94 11 345 6677", address_line1: "5 Old Moor Street", city: "Colombo", postal_code: "01200", tax_id: "VAT-667788990" }),
		oceanView: await store.create({ ...base, name: "Ocean View Villas", contact_person: "Chaminda Silva", email: "stay@oceanviewvillas.example", phone: "+94 41 223 8899", address_line1: "Beach Road", city: "Mirissa", postal_code: "81740" }),
		harbour: await store.create({ ...base, name: "Harbour Logistics (Pvt) Ltd", contact_person: "Roshan Mendis", email: "roshan@harbourlogistics.example", phone: "+94 11 242 1010", address_line1: "Port Access Road", city: "Colombo", postal_code: "01500", tax_id: "VAT-334455667", notes: "Returned the first print batch — credit note issued." }),
		dental: await store.create({ ...base, name: "Colombo Dental Care", contact_person: "Dr. Shanika Perera", email: "clinic@colombodental.example", phone: "+94 11 258 4433", address_line1: "22 Ward Place", city: "Colombo", postal_code: "00700", notes: "Clinic closed in mid-year — archived." })
	};
	// One archived client so the list's archived filter has a row.
	await store.setArchived(ids.dental, true);
	return ids;
};

// ---------- Vendors --------------------------------------------------------

interface VendorIds {
	hnb: number
	office: number
	ceb: number
	dialog: number
	property: number
	courier: number
}

const seedVendors = async (): Promise<VendorIds> => {
	const store = useVendorsStore();
	const base = { contact_person: null, email: null, address_line2: null, country: "Sri Lanka", tax_id: null, notes: null };
	const ids: VendorIds = {
		hnb: await store.create({ ...base, name: "Hatton National Bank", email: "support@hnb.example", phone: "+94 11 246 4646", address_line1: "479 T.B. Jayah Mawatha", city: "Colombo", postal_code: "01000", notes: "Bank charges and FX fees." }),
		office: await store.create({ ...base, name: "Lanka Office Supplies", contact_person: "Saman Silva", email: "orders@lankaoffice.example", phone: "+94 11 555 0011", address_line1: "201 Negombo Road", city: "Colombo", postal_code: "01400", tax_id: "VAT-223344556" }),
		ceb: await store.create({ ...base, name: "Ceylon Electricity Board", phone: "+94 11 232 4471", address_line1: "50 Sir Chittampalam A. Gardiner Mawatha", city: "Colombo", postal_code: "00200", notes: "Electricity utility." }),
		dialog: await store.create({ ...base, name: "Dialog Axiata", email: "business@dialog.example", phone: "+94 77 767 8888", address_line1: "475 Union Place", city: "Colombo", postal_code: "00200", tax_id: "VAT-101010101", notes: "Office fibre + mobile plans." }),
		property: await store.create({ ...base, name: "Colombo Property Holdings", contact_person: "Mrs. Dilrukshi Amarasinghe", email: "leases@cph.example", phone: "+94 11 250 7070", address_line1: "9 Flower Road", city: "Colombo", postal_code: "00700", notes: "Landlord — office lease, rent due on the 1st." }),
		courier: await store.create({ ...base, name: "Island Courier Service", phone: "+94 11 299 1100", address_line1: "14 Station Road", city: "Ratmalana", postal_code: "10390", notes: "Switched to a cheaper courier — archived." })
	};
	await store.setArchived(ids.courier, true);
	return ids;
};

// ---------- Bill categories -----------------------------------------------

interface CategoryIds {
	utilities: number
	supplies: number
	fees: number
	rent: number
	travel: number
}

// Default categories are stamped into every new DB by the Rust
// create_tenant flow; we only need their ids.
const seedCategories = async (): Promise<CategoryIds> => {
	const store = useBillCategoriesStore();
	await store.load();
	const findId = (name: string): number => {
		const row = store.categories.find((c) => c.name === name);
		if (!row) throw new Error(`seedCategories: expected default category "${name}" missing`);
		return row.id;
	};
	return { utilities: findId("Utilities"), supplies: findId("Supplies"), fees: findId("Fees"), rent: findId("Rent"), travel: findId("Travel") };
};

const categorySnapshot = (id: number): string => {
	const row = useBillCategoriesStore().categories.find((c) => c.id === id);
	if (!row) throw new Error(`categorySnapshot: category ${id} not found`);
	return buildCategorySnapshot(row);
};

// ---------- Quotes ---------------------------------------------------------

interface QuoteIds {
	galle: number // accepted → converted below
}

// One per status: draft, sent, accepted, converted, rejected, expired.
const seedQuotes = async (cs: ClientIds): Promise<QuoteIds> => {
	const quotes = useQuotesStore();
	const client = (id: number) => {
		const c = useClientsStore().clients.find((x) => x.id === id);
		if (!c) throw new Error(`seedQuotes: client ${id} missing`);
		return { ...c, id: c.id };
	};
	const bundle = (subtotal: number) => ({ pricing_mode: "bundle" as const, vat_rate_basis_points: 1800, subtotal_cents: subtotal, tax_cents: Math.round(subtotal * 0.18), total_cents: subtotal + Math.round(subtotal * 0.18) });

	// Sent — Kandy Tea, bundle, still valid.
	const tea = await quotes.createDraft({ client: client(cs.kandyTea), project_title: "Tea-export packaging design" });
	await quotes.update(tea, { ...bundle(25_000_000), issue_date: daysAgo(20), valid_until: daysFromNow(10), notes: "Includes 3 design rounds and final print-ready artwork." });
	await quotes.replaceLines(tea, [{ item_label: "Packaging design", description: "Logo refresh, label artwork, and tin-can illustrations", quantity_milli: 1000, unit: null, unit_price_cents: 0, tax_rate_basis_points: 0 }]);
	await quotes.setStatus(tea, "sent");

	// Accepted → converted — Galle Hotels, itemized, becomes the paid invoice.
	const galle = await quotes.createDraft({ client: client(cs.galleHotels), project_title: "Hotel branding refresh" });
	await quotes.update(galle, { pricing_mode: "itemized", issue_date: daysAgo(75), valid_until: daysAgo(45), vat_rate_basis_points: 1800, notes: "Final visuals delivered as production-ready PDFs.", include_bank_details: 1 });
	await quotes.replaceLines(galle, [
		{ item_label: "Brand identity", description: "Logo, colour palette, type system", quantity_milli: 1000, unit: null, unit_price_cents: 18_000_000, tax_rate_basis_points: 1800 },
		{ item_label: "Stationery design", description: "Letterheads, business cards, room cards", quantity_milli: 1000, unit: null, unit_price_cents: 12_000_000, tax_rate_basis_points: 1800 },
		{ item_label: "Photography", description: "Two-day on-site shoot, edited deliverables", quantity_milli: 1000, unit: null, unit_price_cents: 18_000_000, tax_rate_basis_points: 1800 }
	]);
	await quotes.update(galle, { subtotal_cents: 48_000_000, tax_cents: 8_640_000, total_cents: 56_640_000 });
	await quotes.setStatus(galle, "sent");
	await quotes.setStatus(galle, "accepted");

	// Accepted (not converted yet) — Premier, Stage 3.
	const premier = await quotes.createDraft({ client: client(cs.premier), project_title: "Office tower — Stage 3 signage" });
	await quotes.update(premier, { ...bundle(42_000_000), issue_date: daysAgo(9), valid_until: daysFromNow(21), notes: "Wayfinding + external signage for Stage 3 handover." });
	await quotes.replaceLines(premier, [{ item_label: "Signage package", description: "Design, fabrication supervision, installation drawings", quantity_milli: 1000, unit: null, unit_price_cents: 0, tax_rate_basis_points: 0 }]);
	await quotes.setStatus(premier, "sent");
	await quotes.setStatus(premier, "accepted");

	// Draft — Lanka Software, kept editable.
	const lanka = await quotes.createDraft({ client: client(cs.lankaSoftware), project_title: "Internal dashboard prototype" });
	await quotes.update(lanka, { ...bundle(35_000_000), notes: "Two-week sprint; results delivered as a clickable Figma file." });

	// Rejected — Serendib went with another agency.
	const serendib = await quotes.createDraft({ client: client(cs.serendib), project_title: "Spice range label redesign" });
	await quotes.update(serendib, { ...bundle(9_500_000), issue_date: daysAgo(50), valid_until: daysAgo(20), notes: "Client chose a cheaper local printer's in-house design." });
	await quotes.setStatus(serendib, "sent");
	await quotes.setStatus(serendib, "rejected");

	// Expired — Ocean View never answered.
	const ocean = await quotes.createDraft({ client: client(cs.oceanView), project_title: "Villa website + booking photos" });
	await quotes.update(ocean, { ...bundle(28_000_000), issue_date: daysAgo(95), valid_until: daysAgo(65) });
	await quotes.setStatus(ocean, "sent");
	await quotes.setStatus(ocean, "expired");

	return { galle };
};

// ---------- Invoices ------------------------------------------------------

interface InvoiceIds {
	galle: number // paid (converted from the quote)
	premier: number // partial
	tea: number // overdue
	draft: number
	serendib: number // sent, not yet due
	oceanView: number // paid, older, second bank
	dental: number // cancelled
	harbour: number // credited
}

const seedInvoices = async (cs: ClientIds, qs: QuoteIds): Promise<InvoiceIds> => {
	const invoices = useInvoicesStore();
	const quotes = useQuotesStore();
	const client = (id: number) => {
		const c = useClientsStore().clients.find((x) => x.id === id);
		if (!c) throw new Error(`seedInvoices: client ${id} missing`);
		return { ...c, id: c.id };
	};
	const bundle = (subtotal: number) => ({ pricing_mode: "bundle" as const, vat_rate_basis_points: 1800, subtotal_cents: subtotal, tax_cents: Math.round(subtotal * 0.18), total_cents: subtotal + Math.round(subtotal * 0.18) });
	const oneLine = (label: string, description: string) => [{ item_label: label, description, quantity_milli: 1000, unit: null, unit_price_cents: 0, tax_rate_basis_points: 0 }];

	// Paid — converted from the accepted Galle quote. The receipt voucher
	// that settles it is created in seedVouchers.
	const acceptedQuote = await quotes.get(qs.galle);
	const acceptedLines = await quotes.getLines(qs.galle);
	if (!acceptedQuote) throw new Error("seedInvoices: missing accepted quote");
	const galle = await invoices.createFromQuote(acceptedQuote, acceptedLines);
	await quotes.markConverted(qs.galle, galle);
	await invoices.update(galle, { issue_date: daysAgo(40), due_date: daysAgo(10) });
	await invoices.setStatus(galle, "sent");

	// Partial — Premier Stage 2, half paid by cheque.
	const premier = await invoices.createDraft({ client: client(cs.premier), project_title: "Office tower — Stage 2 invoicing" });
	await invoices.update(premier, { ...bundle(120_000_000), issue_date: daysAgo(15), due_date: daysFromNow(15), notes: "Stage-2 site work as per the agreed schedule." });
	await invoices.replaceLines(premier, oneLine("Site work — Stage 2", "Foundations and ground-floor frame"));
	await invoices.setStatus(premier, "sent");

	// Overdue — Kandy Tea, due 20 days ago, nothing received.
	const tea = await invoices.createDraft({ client: client(cs.kandyTea), project_title: "Q1 packaging — production" });
	await invoices.update(tea, { ...bundle(18_000_000), issue_date: daysAgo(60), due_date: daysAgo(20), notes: "Print run for the Q1 export shipment." });
	await invoices.replaceLines(tea, [{ item_label: "Print production", description: "5,000 units, full-colour, single-side", quantity_milli: 5_000_000, unit: "units", unit_price_cents: 360, tax_rate_basis_points: 1800 }]);
	await invoices.setStatus(tea, "sent");

	// Draft — Lanka Software, lets the user try the editor.
	const draft = await invoices.createDraft({ client: client(cs.lankaSoftware), project_title: "Discovery sprint — placeholder" });
	await invoices.update(draft, bundle(9_000_000));

	// Sent, not yet due — Serendib, with a custom PDF title.
	const serendib = await invoices.createDraft({ client: client(cs.serendib), project_title: "Trade-fair stand graphics" });
	await invoices.update(serendib, { ...bundle(14_000_000), issue_date: daysAgo(6), due_date: daysFromNow(24), title_override: "Tax invoice", notes: "Payable within 30 days by bank transfer." });
	await invoices.replaceLines(serendib, oneLine("Stand graphics", "6 m backdrop, two roll-ups, product cards"));
	await invoices.setStatus(serendib, "sent");

	// Paid, older — Ocean View, settled into the second bank account.
	const oceanView = await invoices.createDraft({ client: client(cs.oceanView), project_title: "Villa photography — summer season" });
	await invoices.update(oceanView, { ...bundle(22_000_000), issue_date: daysAgo(100), due_date: daysAgo(70) });
	await invoices.replaceLines(oceanView, oneLine("Photography", "Two-day shoot, 80 edited images"));
	await invoices.setStatus(oceanView, "sent");

	// Cancelled — Colombo Dental closed before paying; no receipts, so
	// cancel is allowed.
	const dental = await invoices.createDraft({ client: client(cs.dental), project_title: "Clinic signage refresh" });
	await invoices.update(dental, { ...bundle(6_500_000), issue_date: daysAgo(85), due_date: daysAgo(55), notes: "Clinic ceased trading — invoice withdrawn." });
	await invoices.replaceLines(dental, oneLine("Signage", "Fascia + window vinyl"));
	await invoices.setStatus(dental, "sent");
	await invoices.setStatus(dental, "cancelled");

	// Credited — Harbour Logistics returned the first batch; an issued
	// credit note (seedCreditNotes) settles the whole invoice.
	const harbour = await invoices.createDraft({ client: client(cs.harbour), project_title: "Fleet livery — print batch 1" });
	await invoices.update(harbour, { ...bundle(10_000_000), issue_date: daysAgo(30), due_date: daysAgo(0), notes: "Batch rejected by the client for colour drift; credited in full." });
	await invoices.replaceLines(harbour, oneLine("Vinyl livery — batch 1", "12 vehicles, printed + laminated"));
	await invoices.setStatus(harbour, "sent");

	return { galle, premier, tea, draft, serendib, oceanView, dental, harbour };
};

// ---------- Credit notes ---------------------------------------------------

const seedCreditNotes = async (cs: ClientIds, is: InvoiceIds) => {
	const creditNotes = useCreditNotesStore();
	const invoices = useInvoicesStore();

	// Issued, linked — reverses the Harbour invoice in full → 'credited'.
	const harbourInvoice = await invoices.get(is.harbour);
	const harbourLines = await invoices.getLines(is.harbour);
	if (!harbourInvoice) throw new Error("seedCreditNotes: missing Harbour invoice");
	const linked = await creditNotes.createFromInvoice(harbourInvoice, harbourLines);
	await creditNotes.update(linked, { issue_date: daysAgo(22), notes: "Batch 1 returned — colour drift on 9 of 12 vehicles. Re-print billed separately." });
	await creditNotes.setStatus(linked, "issued");

	// Draft, unlinked — a goodwill credit for Galle still being written up.
	const client = useClientsStore().clients.find((c) => c.id === cs.galleHotels);
	if (!client) throw new Error("seedCreditNotes: missing Galle client");
	const goodwill = await creditNotes.createDraft({ client: { ...client, id: client.id }, project_title: "Goodwill credit — delayed photo delivery" });
	const totals = await creditNotes.replaceLines(goodwill, [{ item_label: "Goodwill credit", description: "Late delivery of the edited photo set", quantity_milli: 1000, unit: null, unit_price_cents: 1_500_000, tax_rate_basis_points: 1800 }]);
	await creditNotes.update(goodwill, { pricing_mode: "itemized", ...totals });
};

// ---------- Bills ----------------------------------------------------------

interface BillIds {
	cebPaid: number
	office: number // unpaid, due soon
	hnbFees: number // partial
	dialog: number // overdue
	rent: number // paid
	officeOld: number // paid, older (gets an attachment)
	courier: number // paid, archived vendor
	cebCurrent: number // unpaid, this month
}

const vendorSnap = (v: VendorRow) => ({ id: v.id, name: v.name, contact_person: v.contact_person, email: v.email, phone: v.phone, address_line1: v.address_line1, address_line2: v.address_line2, city: v.city, postal_code: v.postal_code, country: v.country, tax_id: v.tax_id });

const seedBills = async (vs: VendorIds, cats: CategoryIds): Promise<BillIds> => {
	const bills = useBillsStore();
	const vendor = (id: number) => {
		const v = useVendorsStore().vendors.find((x) => x.id === id);
		if (!v) throw new Error(`seedBills: vendor ${id} missing`);
		return vendorSnap(v);
	};
	const bundle = (subtotal: number, vatBp = 1800) => ({ pricing_mode: "bundle" as const, vat_rate_basis_points: vatBp, subtotal_cents: subtotal, tax_cents: Math.round(subtotal * vatBp / 10_000), total_cents: subtotal + Math.round(subtotal * vatBp / 10_000) });
	const create = async (vendorId: number, patch: Parameters<typeof bills.update>[1] & { category_id: number }) => {
		const id = await bills.createBill({ vendor: vendor(vendorId) });
		await bills.update(id, { ...patch, category_snapshot: categorySnapshot(patch.category_id) });
		return id;
	};

	const cebPaid = await create(vs.ceb, { ...bundle(3_000_000), issue_date: daysAgo(35), due_date: daysAgo(20), vendor_invoice_number: "CEB-7782", category_id: cats.utilities, notes: "Commercial-rate consumption, last month." });
	const office = await create(vs.office, { ...bundle(4_500_000), issue_date: daysAgo(5), due_date: daysFromNow(25), vendor_invoice_number: "LOS-90213", category_id: cats.supplies, notes: "Stationery + printer toner restock." });
	const hnbFees = await create(vs.hnb, { ...bundle(1_500_000, 0), issue_date: daysAgo(12), due_date: daysFromNow(3), vendor_invoice_number: "HNB-FX-0048", category_id: cats.fees, notes: "Wire transfer + FX fees." });
	const dialog = await create(vs.dialog, { ...bundle(1_250_000), issue_date: daysAgo(40), due_date: daysAgo(10), vendor_invoice_number: "DLG-2231-88", category_id: cats.utilities, title_override: "Telecom invoice", notes: "Office fibre — last month. Overdue: waiting on the disputed roaming charge." });
	const rent = await create(vs.property, { ...bundle(15_000_000, 0), issue_date: daysAgo(31), due_date: daysAgo(30), vendor_invoice_number: "CPH-LEASE-09", category_id: cats.rent, notes: "Office lease — last month." });
	const officeOld = await create(vs.office, { ...bundle(2_200_000), issue_date: daysAgo(70), due_date: daysAgo(40), vendor_invoice_number: "LOS-88710", category_id: cats.supplies });
	const courier = await create(vs.courier, { ...bundle(640_000), issue_date: daysAgo(80), due_date: daysAgo(66), vendor_invoice_number: "ICS-4410", category_id: cats.travel, notes: "Sample deliveries to Kandy + Galle." });
	const cebCurrent = await create(vs.ceb, { ...bundle(3_200_000), issue_date: daysAgo(3), due_date: daysFromNow(12), vendor_invoice_number: "CEB-8104", category_id: cats.utilities });

	return { cebPaid, office, hnbFees, dialog, rent, officeOld, courier, cebCurrent };
};

// ---------- Vouchers -------------------------------------------------------

interface VoucherIds {
	galleReceipt: number
	premierCheque: number
	cebPayment: number
	rentPayment: number
}

// Every receipt / payment against a document lives here (the documents'
// paid / partial / overdue states derive from these), plus two
// standalone vouchers for the "no link" path.
const seedVouchers = async (cs: ClientIds, vs: VendorIds, bs: BillIds, is: InvoiceIds, banks: BankIds): Promise<VoucherIds> => {
	const vouchers = useVouchersStore();
	const clientName = (id: number) => useClientsStore().clients.find((c) => c.id === id)?.name ?? "";
	const vendorName = (id: number) => useVendorsStore().vendors.find((v) => v.id === id)?.name ?? "";
	const none = { related_invoice_id: null, related_bill_id: null, related_payslip_id: null };

	const galleReceipt = await vouchers.create({ ...none, voucher_type: "receipt", voucher_date: daysAgo(8), party_name: clientName(cs.galleHotels), amount_cents: 56_640_000, payment_method: "bank_transfer", business_bank_id: banks.hnb, reference: "TXN-883421", description: "Full payment for hotel branding refresh.", related_invoice_id: is.galle });
	const premierCheque = await vouchers.create({ ...none, voucher_type: "receipt", voucher_date: daysAgo(5), party_name: clientName(cs.premier), amount_cents: 60_000_000, payment_method: "cheque", business_bank_id: banks.hnb, reference: "CHQ-001245", description: "Stage-2 milestone (50%).", related_invoice_id: is.premier });
	await vouchers.create({ ...none, voucher_type: "receipt", voucher_date: daysAgo(72), party_name: clientName(cs.oceanView), amount_cents: 25_960_000, payment_method: "bank_transfer", business_bank_id: banks.comBank, reference: "TXN-771002", description: "Villa photography — paid in full.", related_invoice_id: is.oceanView });

	const cebPayment = await vouchers.create({ ...none, voucher_type: "payment", voucher_date: daysAgo(20), party_name: vendorName(vs.ceb), amount_cents: 3_540_000, payment_method: "bank_transfer", business_bank_id: banks.hnb, reference: "OUT-CEB-7782", description: "Electricity — last month.", related_bill_id: bs.cebPaid });
	await vouchers.create({ ...none, voucher_type: "payment", voucher_date: daysAgo(8), party_name: vendorName(vs.hnb), amount_cents: 800_000, payment_method: "bank_transfer", business_bank_id: banks.hnb, reference: "OUT-HNB-FX-1", description: "Part payment of bank fees.", related_bill_id: bs.hnbFees });
	const rentPayment = await vouchers.create({ ...none, voucher_type: "payment", voucher_date: daysAgo(30), party_name: vendorName(vs.property), amount_cents: 15_000_000, payment_method: "bank_transfer", business_bank_id: banks.hnb, reference: "OUT-RENT-09", description: "Office rent — last month.", related_bill_id: bs.rent });
	await vouchers.create({ ...none, voucher_type: "payment", voucher_date: daysAgo(42), party_name: vendorName(vs.office), amount_cents: 2_596_000, payment_method: "bank_transfer", business_bank_id: banks.comBank, reference: "OUT-LOS-88710", description: "Stationery restock.", related_bill_id: bs.officeOld });
	await vouchers.create({ ...none, voucher_type: "payment", voucher_date: daysAgo(66), party_name: vendorName(vs.courier), amount_cents: 755_200, payment_method: "cash", business_bank_id: null, reference: null, description: "Courier — sample deliveries.", related_bill_id: bs.courier });

	// Standalone — nothing linked.
	await vouchers.create({ ...none, voucher_type: "payment", voucher_date: daysAgo(2), party_name: vendorName(vs.office), amount_cents: 250_000, payment_method: "cash", business_bank_id: null, reference: null, description: "Petty-cash advance for the delivery handler." });
	await vouchers.create({ ...none, voucher_type: "receipt", voucher_date: daysAgo(11), party_name: "Walk-in customer", amount_cents: 4_500_000, payment_method: "cash", business_bank_id: null, reference: null, description: "Cash sale — surplus print stock." });

	return { galleReceipt, premierCheque, cebPayment, rentPayment };
};

// ---------- Recurring templates --------------------------------------------

// One invoice template + one bill template already DUE so the "pending"
// count and the bulk-generate modal have something to do; one of each
// not due yet (one paused).
const seedRecurring = async (cs: ClientIds, vs: VendorIds, cats: CategoryIds) => {
	const rInvoices = useRecurringInvoicesStore();
	const rBills = useRecurringBillsStore();
	const client = (id: number) => {
		const c = useClientsStore().clients.find((x) => x.id === id);
		if (!c) throw new Error(`seedRecurring: client ${id} missing`);
		return { ...c, id: c.id };
	};
	const vendor = (id: number) => {
		const v = useVendorsStore().vendors.find((x) => x.id === id);
		if (!v) throw new Error(`seedRecurring: vendor ${id} missing`);
		return vendorSnap(v);
	};

	const retainer = await rInvoices.create({ template_name: "Monthly design retainer", client: client(cs.lankaSoftware), frequency: "monthly", start_date: daysAgo(95) });
	await rInvoices.update(retainer, { project_title: "Design retainer", next_issue_date: daysAgo(4), notes: "20 hours of design support per month, unused hours don't roll over." });
	await rInvoices.replaceLines(retainer, [
		{ item_label: "Design retainer", description: "20 hours, monthly", quantity_milli: 1000, unit_price_cents: 8_000_000, vat_rate_basis_points: 1800 },
		{ item_label: "Stock photography licence", description: "Shared team licence", quantity_milli: 1000, unit_price_cents: 450_000, vat_rate_basis_points: 1800 }
	]);

	const maintenance = await rInvoices.create({ template_name: "Quarterly brand maintenance", client: client(cs.galleHotels), frequency: "quarterly", start_date: daysAgo(60) });
	await rInvoices.update(maintenance, { project_title: "Brand maintenance", pricing_mode: "bundle", bundle_subtotal_cents: 6_000_000, notes: "Paused until the new season's collateral is agreed." });
	await rInvoices.togglePause(maintenance);

	const rent = await rBills.create({ template_name: "Office rent", vendor: vendor(vs.property), frequency: "monthly", start_date: daysAgo(62) });
	await rBills.update(rent, { category_id: cats.rent, category_snapshot: categorySnapshot(cats.rent), bundle_subtotal_cents: 15_000_000, vat_rate_basis_points: 0, next_issue_date: daysAgo(1), notes: "Due on the 1st." });

	const internet = await rBills.create({ template_name: "Office fibre — Dialog", vendor: vendor(vs.dialog), frequency: "monthly", start_date: daysAgo(20) });
	await rBills.update(internet, { category_id: cats.utilities, category_snapshot: categorySnapshot(cats.utilities), bundle_subtotal_cents: 1_250_000 });
};

// ---------- Payroll ---------------------------------------------------------

interface DemoEmployee {
	full_name: string
	employee_number: string
	nic: string
	designation: string
	email: string
	phone: string
	address_line1: string
	city: string
	joining_date: string
	basic_salary_cents: number
	bank_branch: string
	bank_account_number: string
}

const DEMO_EMPLOYEES: DemoEmployee[] = [
	{ full_name: "Kumari Wijesinghe", employee_number: "E001", nic: "198734567890", designation: "Senior Accountant", email: "kumari@acme.example", phone: "+94 77 333 4455", address_line1: "7 Marine Avenue", city: "Colombo", joining_date: daysAgo(1280), basic_salary_cents: 22_500_000, bank_branch: "Colombo Main", bank_account_number: "0049-1000-0003" },
	{ full_name: "Ravindra De Silva", employee_number: "E002", nic: "199145678901", designation: "Graphic Designer", email: "ravi@acme.example", phone: "+94 77 444 5566", address_line1: "55 Galle Road", city: "Colombo", joining_date: daysAgo(910), basic_salary_cents: 18_500_000, bank_branch: "Colombo Main", bank_account_number: "0049-1000-0004" },
	{ full_name: "Anushka Bandara", employee_number: "E003", nic: "199256789012", designation: "Sales Executive", email: "anushka@acme.example", phone: "+94 77 555 6677", address_line1: "12 Hill Street", city: "Negombo", joining_date: daysAgo(730), basic_salary_cents: 12_500_000, bank_branch: "Negombo", bank_account_number: "0049-1000-0005" },
	{ full_name: "Sandun Rathnayake", employee_number: "E004", nic: "199801234567", designation: "Driver", email: "sandun@acme.example", phone: "+94 77 121 3344", address_line1: "44 Old Road", city: "Anuradhapura", joining_date: daysAgo(180), basic_salary_cents: 6_000_000, bank_branch: "Anuradhapura", bank_account_number: "0049-1000-0010" }
];

const seedEmployees = async (): Promise<number[]> => {
	const store = useEmployeesStore();
	const ids: number[] = [];
	for (const e of DEMO_EMPLOYEES) {
		ids.push(await store.create({
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
		}));
	}
	return ids;
};

// Three months of payslips:
//   -2: everyone issued + paid (clean history)
//   -1: everyone issued — two paid, one partial, one unpaid ("pending" run)
//    0: two drafts, two issued (one paid) — the current cycle in progress
// createPayslip seeds Basic + the managed EPF deduction from settings, so
// net = basic − EPF; we read the stored net rather than assume it.
const seedPayslips = async (employeeIds: number[], bank: number): Promise<void> => {
	const payslips = usePayslipsStore();
	const vouchers = useVouchersStore();
	const employees = useEmployeesStore();

	for (const offset of [-2, -1, 0]) {
		const bounds = monthBoundsFromOffset(offset);
		const payDate = bounds.end;
		for (let i = 0; i < employeeIds.length; i++) {
			const e = employees.employees.find((x) => x.id === employeeIds[i]);
			if (!e) continue;
			const id = await payslips.createPayslip({ employee: { ...e, id: e.id }, periodStart: bounds.start, periodEnd: bounds.end, payDate });
			const net = (await payslips.get(id))?.net_cents ?? e.basic_salary_cents;

			let issue = true;
			let pay = 0;
			if (offset === -2) pay = net;
			else if (offset === -1) pay = i === 2 ? Math.round(net / 2) : (i === 3 ? 0 : net);
			else if (i % 2 === 0) issue = false;
			else pay = i === 1 ? net : 0;

			if (issue) await payslips.setStatus(id, "issued");
			if (pay > 0) {
				await vouchers.create({
					voucher_type: "payment",
					voucher_date: payDate,
					party_name: e.full_name,
					amount_cents: pay,
					payment_method: "bank_transfer",
					business_bank_id: bank,
					reference: `SAL-${payDate.slice(0, 7).replace("-", "")}-${e.employee_number}`,
					description: `Salary for ${bounds.start.slice(0, 7)}`,
					related_invoice_id: null,
					related_bill_id: null,
					related_payslip_id: id
				});
			}
		}
	}
};

// ---------- Letters ---------------------------------------------------------

const seedLetters = async () => {
	const categories = useLetterCategoriesStore();
	const letters = useLettersStore();
	for (const name of ["Service letters", "Internship", "General"]) await categories.create(name);

	const create = async (input: { category: string, recipient_name: string, subject: string, days_ago: number, recipient_address: string, body: string, pre_printed?: boolean }) => {
		const number = (await peekNextSequence("letter")).number;
		const id = await letters.create({ number, letter_date: daysAgo(input.days_ago), category: input.category, recipient_name: input.recipient_name, subject: input.subject });
		await letters.update(id, { recipient_address: input.recipient_address, body_json: input.body, pre_printed: input.pre_printed ? 1 : 0 });
	};

	await create({
		category: "Service letters",
		recipient_name: "To whom it may concern",
		recipient_address: "",
		subject: "Service letter — Mr. Tharindu Jayasooriya",
		days_ago: 14,
		body: richDoc(
			paragraph(text("This is to certify that "), bold("Mr. Tharindu Jayasooriya"), text(" was employed by Acme Trading Co as Marketing Coordinator from 3 March 2024 to 31 July 2026.")),
			paragraph(text("During his time with us he was responsible for:")),
			bullets("Campaign planning and social media for our export clients", "Coordinating print production with our packaging suppliers", "Trade-fair logistics in Colombo and Kandy"),
			paragraph(text("He left of his own accord, and we wish him well in his future endeavours."))
		)
	});
	await create({
		category: "Internship",
		recipient_name: "Ms. Iresha Liyanage",
		recipient_address: "31 Sunset Crescent\nGalle 80000",
		subject: "Confirmation of internship placement",
		days_ago: 5,
		body: richDoc(
			paragraph(text("Dear Ms. Liyanage,")),
			paragraph(text("We are pleased to confirm your placement as a "), bold("Design Intern"), text(" with Acme Trading Co for twelve weeks starting Monday 5 October 2026. You will report to Ravindra De Silva and receive a monthly stipend of LKR 40,000.")),
			paragraph(text("Please bring a copy of your NIC and your university's placement letter on your first day."))
		)
	});
	await create({
		category: "General",
		recipient_name: "Inland Revenue Department",
		recipient_address: "Sir Chittampalam A. Gardiner Mawatha\nColombo 02",
		subject: "Request for VAT clearance certificate — VAT-123456789",
		days_ago: 33,
		pre_printed: true,
		body: richDoc(
			paragraph(text("Dear Sir / Madam,")),
			paragraph(text("We kindly request a VAT clearance certificate for Acme Trading Co (VAT-123456789) for the year ended 31 March 2026, for submission with a tender to the Ports Authority.")),
			paragraph(text("All returns to date have been filed and settled. Please contact our accounts office should any further documents be required."))
		)
	});
};

// ---------- Bank statement (reconcile) ------------------------------------

// A short statement for the default account: three lines that match
// vouchers we created (linked straight away), two that don't — so
// /reconcile opens with both a matched and an unmatched state to look at.
const seedBankStatement = async (bank: number, vouchers: VoucherIds) => {
	const statements = useBankStatementsStore();
	const rows = [
		{ dateIso: daysAgo(30), description: "TRF COLOMBO PROPERTY HOLDINGS", amountCents: -15_000_000, reference: "OUT-RENT-09", balanceCents: 84_300_000 },
		{ dateIso: daysAgo(20), description: "TRF CEYLON ELECTRICITY BOARD", amountCents: -3_540_000, reference: "OUT-CEB-7782", balanceCents: 80_760_000 },
		{ dateIso: daysAgo(15), description: "BANK CHARGES — SEPT", amountCents: -1_500, reference: null, balanceCents: 80_758_500 },
		{ dateIso: daysAgo(8), description: "INWARD TRF GALLE HOTELS LTD", amountCents: 56_640_000, reference: "TXN-883421", balanceCents: 137_398_500 },
		{ dateIso: daysAgo(3), description: "CASH DEPOSIT — BRANCH", amountCents: 4_500_000, reference: null, balanceCents: 141_898_500 }
	];
	await statements.importCsv({
		bankId: bank,
		filename: "hnb-statement-demo.csv",
		columnMapping: { date: 0, description: 1, amount: 2, debit: -1, credit: -1, reference: 3, balance: 4, dateFormat: "YYYY-MM-DD" },
		rows
	});
	const link = async (reference: string, voucherId: number) => {
		const row = statements.rows.find((r) => r.business_bank_id === bank && r.reference === reference);
		if (row) await statements.linkMatch(row.id, voucherId);
	};
	await link("OUT-RENT-09", vouchers.rentPayment);
	await link("OUT-CEB-7782", vouchers.cebPayment);
	await link("TXN-883421", vouchers.galleReceipt);
};

// ---------- Attachments ----------------------------------------------------

function decodeBase64(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

// A 1×1 PNG — enough to pass the image magic-bytes check. The value is
// in exercising the attachment row + on-disk plumbing, not the picture.
const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const seedSampleAttachments = async (targets: { type: DocumentType, id: number }[]): Promise<void> => {
	const attachments = useDocumentAttachmentsStore();
	const srcName = "demo-seed-placeholder.png";
	await writeFile(srcName, decodeBase64(TINY_PNG_BASE64), { baseDir: BaseDirectory.AppLocalData });
	const srcPath = await join(await appLocalDataDir(), srcName);
	for (const t of targets) {
		try {
			const file = await invoke<AttachmentFile>("import_document_attachment", { documentType: t.type, documentId: String(t.id), srcPath });
			await attachments.add(t.type, t.id, file, "local");
		} catch (e) {
			// One failed attachment shouldn't sink the whole demo.
			console.warn(`seed: attachment ${t.type}/${t.id} failed`, e);
		}
	}
};

// ---------- Public entry point ---------------------------------------------

/**
 * Create the demo tenant, seed it and activate it. Returns the new
 * tenant; the caller navigates (`window.location.assign("/")`) so every
 * Pinia store re-hydrates against the fresh DB.
 *
 * `displayName` is what shows in the sidebar / picker. `onProgress`
 * receives the current stage label for the overlay.
 */
export const createDemoBusiness = async (
	displayName = "Acme Trading Co (demo)",
	onProgress: SeedProgressFn = noopProgress,
	parentDir?: string
): Promise<Tenant> => {
	const tenants = useTenantsStore();
	const step = (stage: string) => onProgress({ stage, done: 0, total: 0 });

	// 1 + 2. Create + activate. The demo is a one-click affordance, so
	// no folder dialog: the throwaway lands under %APPDATA% unless the
	// caller picked a parent.
	step("Creating the business");
	const t = await tenants.create(displayName, parentDir ?? (await appDataDir()));
	await tenants.activate(t.id);

	// 3. Seed. Order matters only where a later stage links to an
	// earlier one (vouchers → documents, statement → vouchers).
	step("Setting up the business");
	await seedSettings();
	const banks = await seedBanks();
	await seedSignatures();

	step("Adding clients & vendors");
	const clients = await seedClients();
	const vendors = await seedVendors();
	const categories = await seedCategories();

	step("Writing quotes, invoices & bills");
	const quotes = await seedQuotes(clients);
	const invoices = await seedInvoices(clients, quotes);
	await seedCreditNotes(clients, invoices);
	const bills = await seedBills(vendors, categories);
	const vouchers = await seedVouchers(clients, vendors, bills, invoices, banks);
	await seedRecurring(clients, vendors, categories);

	step("Running payroll");
	const employeeIds = await seedEmployees();
	await seedPayslips(employeeIds, banks.hnb);

	step("Writing letters");
	await seedLetters();

	step("Importing a bank statement");
	await seedBankStatement(banks.hnb, vouchers);

	step("Attaching sample files");
	await seedSampleAttachments([
		{ type: "invoice", id: invoices.galle },
		{ type: "bill", id: bills.cebPaid },
		{ type: "bill", id: bills.officeOld },
		{ type: "voucher", id: vouchers.galleReceipt }
	]);

	step("Done");
	return t;
};
