// Invoices store. Mirrors `quotes` for the document lifecycle, plus
// the convert-from-quote operation.
//
// Status model
// ------------
// The DB persists three states the user sets directly:
//   draft     — not yet issued; editable, deletable, no payments expected
//   sent      — issued; payments may now arrive
//   cancelled — terminal user-set state; sticky, never auto-overridden
//
// Every other state the UI presents — partial / paid / overdue — is
// **derived** from the linked receipt vouchers and the due_date. There
// is no `paid_cents` column any more (migration 0014). Receipts are
// recorded by creating a voucher with `voucher_type='receipt'` and
// `related_invoice_id` set; the bills refactor in 0013 introduced the
// same pattern for payments. The voucher ledger is the single source
// of truth for cash flow.
//
// Recording a payment is just navigating to /vouchers/new?invoice=N
// from the invoice detail page — the New Voucher form prefills the
// type, party, amount, and link, then bounces back here on save.

import type { ClientSnapshot, PricingMode, QuoteLineRow, QuoteRow } from "~/stores/quotes";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { deriveInvoiceStatus, invoiceDerivedFrom } from "~/lib/derived-status";
import { computeLineTotals, sumCents } from "~/lib/money";
import { allocateDocumentNumber, allocateSpecificDocumentNumber, reserveDocumentNumber } from "~/lib/numbering";
import { useBusinessBanksStore } from "~/stores/business_banks";
import { purgeDocumentAttachments } from "~/stores/document_attachments";
import { useSettingsStore } from "~/stores/settings";
import { useVouchersStore } from "~/stores/vouchers";

// Persisted on `invoices.status` — the only states the user sets
// directly. The richer enum below is the derived view the UI consumes.
export type InvoicePersistedStatus = "draft" | "sent" | "cancelled";

// Derived status — what list pages, badges, and filters see.
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";

export interface InvoiceRow {
	id: number
	number: string
	client_id: number
	client_snapshot: string
	/// Denormalised from `client_snapshot.name` — set whenever the
	/// snapshot is written so the list page can render the client
	/// name + sort + search without paying a JSON.parse per row.
	/// See migration 0028.
	client_name: string
	source_quote_id: number | null
	issue_date: string
	due_date: string
	/// The persisted enum (draft|sent|cancelled). Use derivedStatus()
	/// for the user-visible payment state.
	status: InvoicePersistedStatus
	pricing_mode: PricingMode
	project_title: string
	vat_rate_basis_points: number
	subtotal_cents: number
	tax_cents: number
	total_cents: number
	notes: string | null
	terms: string | null
	prepared_by: string | null
	bank_details_snapshot: string | null
	business_bank_id: number | null
	/**
	 * Per-document override of the PDF's big header. Null/empty = the
	 * hardcoded default ("INVOICE"); when set, the PDF builder
	 * upper-cases this verbatim for the header.
	 */
	title_override: string | null
	created_at: string
	updated_at: string
}

export interface InvoiceLineRow {
	id: number
	invoice_id: number
	sort_order: number
	item_label: string
	description: string
	quantity_milli: number
	unit: string | null
	unit_price_cents: number
	tax_rate_basis_points: number
	line_subtotal_cents: number
	line_tax_cents: number
	line_total_cents: number
}

// sort_order is omitted from the draft because `replaceLines` always
// derives it from the array index at write time — passing it in would
// have no effect, so the type contract shouldn't pretend it's an input.
export type InvoiceLineDraft = Omit<InvoiceLineRow,	| "id" | "invoice_id" | "sort_order"
	| "line_subtotal_cents" | "line_tax_cents" | "line_total_cents">;

const todayISO = (): string => {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${dd}`;
};

const addDays = (iso: string, days: number): string => {
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return iso;
	const dt = new Date(y, m - 1, d);
	dt.setDate(dt.getDate() + days);
	const yy = dt.getFullYear();
	const mm = String(dt.getMonth() + 1).padStart(2, "0");
	const dd = String(dt.getDate()).padStart(2, "0");
	return `${yy}-${mm}-${dd}`;
};

// Whole-day gap between two YYYY-MM-DD strings (toISO − fromISO).
const daysBetween = (fromISO: string, toISO: string): number => {
	const [y1, m1, d1] = fromISO.split("-").map(Number);
	const [y2, m2, d2] = toISO.split("-").map(Number);
	if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
	const a = new Date(y1, m1 - 1, d1).getTime();
	const b = new Date(y2, m2 - 1, d2).getTime();
	return Math.round((b - a) / 86_400_000);
};

/// Extract the `name` field from a stored client-snapshot JSON string.
/// Only used by `update()` to keep the denormalised `client_name` column
/// in lockstep with the snapshot when the Refresh-client-snapshot button
/// fires (the only flow that mutates client_snapshot post-create). All
/// the create / duplicate / convert paths pass the name directly — they
/// have it as a plain field on the input object or on the source row's
/// `client_name` column. Falls back to empty string for malformed
/// snapshots; the column has a NOT NULL DEFAULT '' so empty is legal.
function nameFromClientSnapshot(snap: string): string {
	try {
		return (JSON.parse(snap) as { name?: string }).name ?? "";
	} catch {
		return "";
	}
}

const buildClientSnapshot = (
	c: { name: string, contact_person?: string | null, email?: string | null, phone?: string | null, address_line1?: string | null, address_line2?: string | null, city?: string | null, postal_code?: string | null, country?: string | null, tax_id?: string | null }
): string => JSON.stringify({
	name: c.name,
	contact_person: c.contact_person ?? null,
	email: c.email ?? null,
	phone: c.phone ?? null,
	address_line1: c.address_line1 ?? null,
	address_line2: c.address_line2 ?? null,
	city: c.city ?? null,
	postal_code: c.postal_code ?? null,
	country: c.country ?? null,
	tax_id: c.tax_id ?? null
} satisfies ClientSnapshot);

// Resolve the bank id + snapshot pair for a draft. If no explicit id is
// passed, falls back to the business default. Returns nulls when no
// banks exist yet (the document just renders without a bank block).
const resolveBankForDraft = async (
	explicitId?: number | null
): Promise<{ id: number | null, snapshot: string | null }> => {
	const banksStore = useBusinessBanksStore();
	await banksStore.ensureLoaded();
	const id = explicitId !== undefined && explicitId !== null
		? explicitId
		: banksStore.defaultBank?.id ?? null;
	const snapshot = await banksStore.buildSnapshotForId(id);
	return { id, snapshot };
};

export const useInvoicesStore = defineStore("invoices", () => {
	const invoices = ref<InvoiceRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	// Multi-select status filter. Empty = show everything (no narrowing).
	// "Outstanding" is no longer a single sentinel — with multi-select
	// the user just ticks sent + partial + overdue to express it.
	const statusFilters = ref<InvoiceStatus[]>([]);
	const toggleStatusFilter = (s: InvoiceStatus) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};
	const clearStatusFilters = () => {
		statusFilters.value = [];
	};
	// "all" = no narrowing; otherwise the FK id of a single client.
	// Filters on client_id (not the snapshot name) so renames don't
	// orphan the filter.
	const clientFilter = ref<number | "all">("all");
	// Optional date-range narrowing — issue_date / due_date.
	const issuedFrom = ref<string | null>(null);
	const issuedTo = ref<string | null>(null);
	const dueFrom = ref<string | null>(null);
	const dueTo = ref<string | null>(null);

	const hasDateFilters = computed(() =>
		Boolean(issuedFrom.value || issuedTo.value || dueFrom.value || dueTo.value)
	);

	const clearDateFilters = () => {
		issuedFrom.value = null;
		issuedTo.value = null;
		dueFrom.value = null;
		dueTo.value = null;
	};

	// ---------- Derived payment helpers --------------------------------
	// Mirror of bills' helpers — we read receipt vouchers off the
	// vouchers store rather than caching anything on the invoice row.
	// Voucher ledger is small (single-user app) and Pinia tracks the
	// dependency, so the derived values stay fresh through every edit.

	/// All receipt vouchers (voucher_type='receipt') linked to this
	/// invoice, ordered most-recent first to match the detail page's
	/// payments panel.
	const linkedPayments = (invoiceId: number) => {
		const vouchers = useVouchersStore();
		return vouchers.vouchers
			.filter((v) => v.related_invoice_id === invoiceId && v.voucher_type === "receipt")
			.slice()
			.sort((a, b) => b.voucher_date.localeCompare(a.voucher_date) || b.id - a.id);
	};

	/// Total recorded receipts against an invoice, in cents. Sums
	/// voucher amounts; safe when the vouchers store hasn't loaded yet.
	const paidCentsFor = (invoiceId: number): number =>
		linkedPayments(invoiceId).reduce((sum, v) => sum + v.amount_cents, 0);

	const balanceCentsFor = (inv: InvoiceRow): number =>
		Math.max(0, inv.total_cents - paidCentsFor(inv.id));

	/// User-visible status from persisted status + receipt sum +
	/// due date. Order of precedence:
	///   draft / cancelled — sticky (whatever the user set)
	///   paid              — receipts cover the full total
	///   overdue           — sent + balance > 0 + due_date < today
	///   partial           — sent + 0 < paid < total
	///   sent              — sent + nothing paid (still pending)
	const derivedStatus = (inv: InvoiceRow, now: string = todayISO()): InvoiceStatus =>
		deriveInvoiceStatus(inv.status, paidCentsFor(inv.id), inv.total_cents, inv.due_date, now);

	const filtered = computed(() => {
		const today = todayISO();
		const q = search.value.trim().toLowerCase();
		return invoices.value.filter((row) => {
			const ds = derivedStatus(row, today);
			if (statusFilters.value.length > 0 && !statusFilters.value.includes(ds)) return false;
			if (clientFilter.value !== "all" && row.client_id !== clientFilter.value) return false;
			if (issuedFrom.value && row.issue_date < issuedFrom.value) return false;
			if (issuedTo.value && row.issue_date > issuedTo.value) return false;
			if (dueFrom.value && row.due_date < dueFrom.value) return false;
			if (dueTo.value && row.due_date > dueTo.value) return false;
			if (!q) return true;
			// Search the denormalised client_name directly — no JSON parse
			// per row. At 800+ invoices this used to be the most expensive
			// part of every keystroke in the search box.
			return (
				row.number.toLowerCase().includes(q)
				|| row.project_title.toLowerCase().includes(q)
				|| row.client_name.toLowerCase().includes(q)
			);
		});
	});

	const outstandingTotal = computed(() => {
		const today = todayISO();
		let sum = 0;
		for (const r of invoices.value) {
			const ds = derivedStatus(r, today);
			if (ds === "sent" || ds === "partial" || ds === "overdue") {
				sum += balanceCentsFor(r);
			}
		}
		return sum;
	});

	const overdueCount = computed(() => {
		const today = todayISO();
		return invoices.value.filter((r) => derivedStatus(r, today) === "overdue").length;
	});

	// Packaged filter snapshot for the server-paginated list page.
	const listFilters = computed(() => ({
		search: search.value,
		statusFilters: statusFilters.value,
		clientFilter: clientFilter.value,
		issuedFrom: issuedFrom.value,
		issuedTo: issuedTo.value,
		dueFrom: dueFrom.value,
		dueTo: dueTo.value
	}));

	// Grand total count + global outstanding (matches outstandingTotal) in one
	// wrapped query over the derived-status subquery, so the paginated page
	// needn't load every row to show the header.
	const fetchHeaderStats = async (): Promise<{ total: number, outstandingCents: number, overdueCount: number }> => {
		const rows = await select<{ total: number, outstanding: number, overdue: number }>(
			`SELECT COUNT(*) AS total,
			        COALESCE(SUM(CASE WHEN _status IN ('sent','partial','overdue') THEN _balance ELSE 0 END), 0) AS outstanding,
			        SUM(CASE WHEN _status = 'overdue' THEN 1 ELSE 0 END) AS overdue
			 FROM ${invoiceDerivedFrom(todayISO())}`
		);
		return {
			total: rows[0]?.total ?? 0,
			outstandingCents: rows[0]?.outstanding ?? 0,
			overdueCount: rows[0]?.overdue ?? 0
		};
	};

	// `loaded` flips true after the first successful load and stays true
	// for the lifetime of the store — i.e. the active tenant session,
	// since tenant switch hard-reloads. `ensureLoaded` lets callers skip
	// re-fetching when the store is already populated (the dashboard
	// uses this so navigating back to / doesn't re-issue the full
	// SELECT every time). Mutations still call `load()` directly to
	// force a refresh — that path stays untouched.
	const loaded = ref(false);

	// Shared in-flight promise so concurrent callers (e.g. dashboard +
	// /invoices both mounting at once) wait for the same load instead
	// of triggering two parallel SELECTs.
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			invoices.value = await select<InvoiceRow>(
				"SELECT * FROM invoices ORDER BY datetime(created_at) DESC"
			);
			loaded.value = true;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const ensureLoaded = async () => {
		if (loaded.value) return;
		if (!pendingLoad) {
			pendingLoad = load().finally(() => {
				pendingLoad = null;
			});
		}
		await pendingLoad;
	};

	const get = async (id: number): Promise<InvoiceRow | null> =>
		selectOne<InvoiceRow>("SELECT * FROM invoices WHERE id = ?", [id]);

	const getLines = async (invoiceId: number): Promise<InvoiceLineRow[]> =>
		select<InvoiceLineRow>(
			"SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC",
			[invoiceId]
		);

	const createDraft = async (input: {
		client: ClientSnapshot & { id: number }
		project_title?: string
		/**
			 Override `issue_date` (e.g. when launched from the calendar
			with a specific day in mind). Defaults to today. `due_date`
			derives from this date + the business's default payment terms.
			*/
		issue_date?: string
		/**
			 Override the auto-allocated sequence number. Used by the New
			modal's editable Number field so the user can fill a gap left
			by an earlier deletion. Validates uniqueness before insert.
			*/
		sequence?: number
	}): Promise<number> => {
		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("createDraft: settings not loaded");

		const issue = input.issue_date ?? todayISO();
		const due = addDays(issue, settings.default_payment_terms_days);

		const allocation = input.sequence !== undefined
			? await allocateSpecificDocumentNumber("invoice", input.sequence)
			: await allocateDocumentNumber("invoice");
		const clientSnap = buildClientSnapshot(input.client);
		const { id: bankId, snapshot: bankSnap } = await resolveBankForDraft();

		// Seed the draft's VAT rate from the business profile's default so
		// the editor lands with the right percentage already filled in.
		// Stored as basis points (18% → 1800). The editor still lets the
		// user override per-invoice.
		const defaultVatBp = settings.default_vat_rate ?? 0;
		const result = await execute(
			`INSERT INTO invoices (
				number, client_id, client_snapshot, client_name, source_quote_id,
				issue_date, due_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				notes, prepared_by, bank_details_snapshot, business_bank_id
			) VALUES (?, ?, ?, ?, NULL, ?, ?, 'draft', 'bundle', ?, ?, 0, 0, 0, ?, ?, ?, ?)`,
			[
				allocation.number,
				input.client.id,
				clientSnap,
				input.client.name,
				issue,
				due,
				input.project_title ?? "",
				defaultVatBp,
				// Seed the editable note from the business default (Settings ->
				// Quotes & invoices). Editable per-invoice afterwards.
				settings.invoice_footer_notes ?? null,
				settings.default_prepared_by ?? null,
				bankSnap,
				bankId
			]
		);
		if (result.lastInsertId === undefined) throw new Error("createDraft: no lastInsertId");
		await load();
		return result.lastInsertId;
	};

	// Convert an accepted quote into a draft invoice. Clones header + lines.
	// The caller then transitions the source quote's status to 'converted'.
	// `sequence` lets the caller pick the invoice number (gap-fill), matching
	// createDraft; omitted → next auto-allocated number.
	const createFromQuote = async (
		quote: QuoteRow,
		quoteLines: QuoteLineRow[],
		sequence?: number
	): Promise<number> => {
		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("createFromQuote: settings not loaded");

		const issue = todayISO();
		const due = addDays(issue, settings.default_payment_terms_days);
		const allocation = sequence !== undefined
			? await allocateSpecificDocumentNumber("invoice", sequence)
			: await allocateDocumentNumber("invoice");

		// Inherit the source quote's chosen bank, falling back to the
		// business default if the quote's bank has been deleted. Snapshot
		// is rebuilt from the bank's current row.
		const { id: bankId, snapshot: bankSnap } = await resolveBankForDraft(quote.business_bank_id);

		const result = await execute(
			`INSERT INTO invoices (
				number, client_id, client_snapshot, client_name, source_quote_id,
				issue_date, due_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				notes, terms, prepared_by, bank_details_snapshot, business_bank_id
			) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				allocation.number,
				quote.client_id,
				quote.client_snapshot,
				quote.client_name,
				quote.id,
				issue,
				due,
				quote.pricing_mode,
				quote.project_title,
				quote.vat_rate_basis_points,
				quote.subtotal_cents,
				quote.tax_cents,
				quote.total_cents,
				quote.notes,
				quote.terms,
				quote.prepared_by,
				bankSnap,
				bankId
			]
		);
		if (result.lastInsertId === undefined) throw new Error("createFromQuote: no lastInsertId");
		const invoiceId = result.lastInsertId;

		// Clone line rows.
		for (let i = 0; i < quoteLines.length; i++) {
			const l = quoteLines[i];
			if (!l) continue;
			await execute(
				`INSERT INTO invoice_lines (
					invoice_id, sort_order, item_label, description,
					quantity_milli, unit, unit_price_cents, tax_rate_basis_points,
					line_subtotal_cents, line_tax_cents, line_total_cents
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					invoiceId,
					i,
					l.item_label,
					l.description,
					l.quantity_milli,
					l.unit,
					l.unit_price_cents,
					l.tax_rate_basis_points,
					l.line_subtotal_cents,
					l.line_tax_cents,
					l.line_total_cents
				]
			);
		}

		await load();
		return invoiceId;
	};

	// Clone an existing invoice into a fresh draft. Copies the client, line
	// items, project, VAT rate, notes/terms, and totals; resets status to
	// 'draft', allocates a new number, drops the source-quote link, and
	// re-dates it to today. The payment-term length is preserved (due_date
	// = today + the original issue→due span). Bank details are
	// re-snapshotted from current settings, same as any new document.
	const duplicate = async (id: number): Promise<number> => {
		const src = await get(id);
		if (!src) throw new Error("duplicate: invoice not found");
		const srcLines = await getLines(id);

		const issue = todayISO();
		const span = Math.max(0, daysBetween(src.issue_date, src.due_date));
		const due = addDays(issue, span);

		const allocation = await allocateDocumentNumber("invoice");
		const { id: bankId, snapshot: bankSnap } = await resolveBankForDraft(src.business_bank_id);

		const result = await execute(
			`INSERT INTO invoices (
				number, client_id, client_snapshot, client_name, source_quote_id,
				issue_date, due_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				notes, terms, prepared_by, bank_details_snapshot, business_bank_id
			) VALUES (?, ?, ?, ?, NULL, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				allocation.number,
				src.client_id,
				src.client_snapshot,
				src.client_name,
				issue,
				due,
				src.pricing_mode,
				src.project_title,
				src.vat_rate_basis_points,
				src.subtotal_cents,
				src.tax_cents,
				src.total_cents,
				src.notes,
				src.terms,
				src.prepared_by,
				bankSnap,
				bankId
			]
		);
		if (result.lastInsertId === undefined) throw new Error("duplicate: no lastInsertId");
		const newId = result.lastInsertId;

		for (let i = 0; i < srcLines.length; i++) {
			const l = srcLines[i];
			if (!l) continue;
			await execute(
				`INSERT INTO invoice_lines (
					invoice_id, sort_order, item_label, description,
					quantity_milli, unit, unit_price_cents, tax_rate_basis_points,
					line_subtotal_cents, line_tax_cents, line_total_cents
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					newId,
					i,
					l.item_label,
					l.description,
					l.quantity_milli,
					l.unit,
					l.unit_price_cents,
					l.tax_rate_basis_points,
					l.line_subtotal_cents,
					l.line_tax_cents,
					l.line_total_cents
				]
			);
		}

		await load();
		return newId;
	};

	type InvoiceUpdate = Partial<Pick<InvoiceRow, | "client_id" | "client_snapshot" | "issue_date" | "due_date"
		| "pricing_mode" | "project_title"
		| "vat_rate_basis_points"
		| "subtotal_cents" | "tax_cents" | "total_cents"
		| "notes" | "terms" | "prepared_by" | "bank_details_snapshot" | "business_bank_id"
		| "title_override">>;

	const UPDATABLE: ReadonlyArray<keyof InvoiceUpdate> = [
		"client_id",
		"client_snapshot",
		"issue_date",
		"due_date",
		"pricing_mode",
		"project_title",
		"vat_rate_basis_points",
		"subtotal_cents",
		"tax_cents",
		"total_cents",
		"notes",
		"terms",
		"prepared_by",
		"bank_details_snapshot",
		"business_bank_id",
		"title_override"
	];

	const update = async (id: number, patch: InvoiceUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		// Keep `client_name` in lockstep with the snapshot. The patch
		// doesn't carry client_name explicitly — it's a derived column
		// owned by this store. Refresh-client-snapshot on the detail
		// page is the only flow that touches the snapshot post-create.
		let extraSet = "";
		if (Object.hasOwn(patch, "client_snapshot")) {
			extraSet = ", client_name = ?";
			params.push(nameFromClientSnapshot(patch.client_snapshot ?? ""));
		}
		params.push(id);
		await execute(
			`UPDATE invoices SET ${setClause}${extraSet}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
	};

	// Renumber a DRAFT invoice in place (edit its number from the detail page).
	// Refused once issued — the number is immutable then. Validates uniqueness
	// (excluding this invoice) + advances the counter via reserveDocumentNumber.
	const setNumber = async (id: number, sequence: number): Promise<string> => {
		const row = await get(id);
		if (!row) throw new Error("setNumber: invoice not found");
		if (row.status !== "draft") throw new Error("Only draft invoice numbers can be edited");
		const formatted = await reserveDocumentNumber("invoice", id, sequence);
		await execute(
			"UPDATE invoices SET number = ?, updated_at = datetime('now') WHERE id = ?",
			[formatted, id]
		);
		return formatted;
	};

	const replaceLines = async (
		invoiceId: number,
		lines: InvoiceLineDraft[]
	): Promise<{ subtotal_cents: number, tax_cents: number, total_cents: number }> => {
		const computed = lines.map((l) => ({
			...l,
			...computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points)
		}));

		await execute("DELETE FROM invoice_lines WHERE invoice_id = ?", [invoiceId]);
		for (let i = 0; i < computed.length; i++) {
			const l = computed[i];
			if (!l) continue;
			await execute(
				`INSERT INTO invoice_lines (
					invoice_id, sort_order, item_label, description,
					quantity_milli, unit, unit_price_cents, tax_rate_basis_points,
					line_subtotal_cents, line_tax_cents, line_total_cents
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					invoiceId,
					i,
					l.item_label ?? "",
					l.description ?? "",
					l.quantity_milli,
					l.unit ?? null,
					l.unit_price_cents,
					l.tax_rate_basis_points,
					l.line_subtotal_cents,
					l.line_tax_cents,
					l.line_total_cents
				]
			);
		}

		return {
			subtotal_cents: sumCents(...computed.map((l) => l.line_subtotal_cents)),
			tax_cents: sumCents(...computed.map((l) => l.line_tax_cents)),
			total_cents: sumCents(...computed.map((l) => l.line_total_cents))
		};
	};

	/// Move between the three persisted states. The legal transitions
	/// are now extremely simple:
	///   draft     ↔ sent            (issue / un-issue)
	///   draft     → cancelled       (kill before issuing)
	///   sent      → cancelled       (void after issuing)
	///   cancelled ↔ sent            (reopen — refund flow)
	///
	/// We don't model "draft → cancelled → draft" since the user is
	/// likely to just delete a never-sent invoice instead.
	const setStatus = async (id: number, target: InvoicePersistedStatus): Promise<void> => {
		// Cancelling an invoice with recorded receipts would orphan
		// those vouchers (cash in the bank, no liability on record).
		// Refuse and tell the user to delete the receipts first, same
		// guard payslips uses for the equivalent flow.
		if (target === "cancelled" && paidCentsFor(id) > 0) {
			throw new Error("This invoice has recorded payments. Delete the receipt vouchers first, then cancel.");
		}
		await execute(
			"UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?",
			[target, id]
		);
		await load();
	};

	const deleteDraft = async (id: number): Promise<void> => {
		const row = await get(id);
		if (!row) return;
		if (row.status !== "draft") {
			throw new Error("Only draft invoices can be deleted");
		}
		// invoice_lines cascade via FK ON DELETE CASCADE.
		await execute("DELETE FROM invoices WHERE id = ?", [id]);
		await purgeDocumentAttachments("invoice", id);
		await load();
	};

	// Universal delete — removes an invoice regardless of status. Used by
	// the typed-name confirm flow on the detail page when the user
	// genuinely needs to scrub a record. Reverse FKs without an ON DELETE
	// clause are nulled first so the DELETE doesn't fault on dangling
	// references when foreign_keys is enabled. Linked receipt vouchers
	// stay intact (they record real money received) — they just lose
	// their link back to the now-deleted invoice.
	const remove = async (id: number): Promise<void> => {
		const row = await get(id);
		if (!row) return;
		await execute(
			"UPDATE quotes SET converted_invoice_id = NULL WHERE converted_invoice_id = ?",
			[id]
		);
		await execute(
			"UPDATE vouchers SET related_invoice_id = NULL WHERE related_invoice_id = ?",
			[id]
		);
		await execute("DELETE FROM invoices WHERE id = ?", [id]);
		await purgeDocumentAttachments("invoice", id);
		await load();
		// Refresh vouchers too so the un-linked rows reflect immediately
		// in the vouchers list.
		await useVouchersStore().load().catch(() => { /* non-fatal */ });
	};

	return {
		invoices,
		loading,
		error,
		search,
		statusFilters,
		toggleStatusFilter,
		clearStatusFilters,
		clientFilter,
		issuedFrom,
		issuedTo,
		dueFrom,
		dueTo,
		hasDateFilters,
		clearDateFilters,
		listFilters,
		fetchHeaderStats,
		filtered,
		outstandingTotal,
		overdueCount,
		loaded,
		load,
		ensureLoaded,
		get,
		getLines,
		createDraft,
		setNumber,
		createFromQuote,
		duplicate,
		update,
		replaceLines,
		setStatus,
		deleteDraft,
		remove,
		buildClientSnapshot,
		// Derived payment helpers — read these instead of the old paid_cents
		// column. They live on the store so any consumer (list page, detail
		// page, dashboard, PDF builder) shares the same derivation.
		linkedPayments,
		paidCentsFor,
		balanceCentsFor,
		derivedStatus
	};
});
