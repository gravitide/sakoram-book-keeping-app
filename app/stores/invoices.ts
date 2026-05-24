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
import { computeLineTotals, sumCents } from "~/lib/money";
import { allocateDocumentNumber } from "~/lib/numbering";
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

export type InvoiceLineDraft = Omit<InvoiceLineRow,	| "id" | "invoice_id"
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
	const derivedStatus = (inv: InvoiceRow, now: string = todayISO()): InvoiceStatus => {
		if (inv.status === "draft") return "draft";
		if (inv.status === "cancelled") return "cancelled";
		const paid = paidCentsFor(inv.id);
		if (paid >= inv.total_cents && inv.total_cents > 0) return "paid";
		if (inv.due_date < now) return "overdue";
		if (paid > 0) return "partial";
		return "sent";
	};

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
			let snapName = "";
			try {
				snapName = (JSON.parse(row.client_snapshot) as ClientSnapshot).name?.toLowerCase() ?? "";
			} catch { /* ignore */ }
			return (
				row.number.toLowerCase().includes(q)
				|| row.project_title.toLowerCase().includes(q)
				|| snapName.includes(q)
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

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			invoices.value = await select<InvoiceRow>(
				"SELECT * FROM invoices ORDER BY datetime(created_at) DESC"
			);
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			loading.value = false;
		}
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
	}): Promise<number> => {
		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("createDraft: settings not loaded");

		const issue = todayISO();
		const due = addDays(issue, settings.default_payment_terms_days);

		const allocation = await allocateDocumentNumber("invoice", issue);
		const clientSnap = buildClientSnapshot(input.client);
		const { id: bankId, snapshot: bankSnap } = await resolveBankForDraft();

		// Seed the draft's VAT rate from the business profile's default so
		// the editor lands with the right percentage already filled in.
		// Stored as basis points (18% → 1800). The editor still lets the
		// user override per-invoice.
		const defaultVatBp = settings.default_vat_rate ?? 0;
		const result = await execute(
			`INSERT INTO invoices (
				number, client_id, client_snapshot, source_quote_id,
				issue_date, due_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				prepared_by, bank_details_snapshot, business_bank_id
			) VALUES (?, ?, ?, NULL, ?, ?, 'draft', 'bundle', ?, ?, 0, 0, 0, ?, ?, ?)`,
			[
				allocation.number,
				input.client.id,
				clientSnap,
				issue,
				due,
				input.project_title ?? "",
				defaultVatBp,
				null,
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
	const createFromQuote = async (
		quote: QuoteRow,
		quoteLines: QuoteLineRow[]
	): Promise<number> => {
		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("createFromQuote: settings not loaded");

		const issue = todayISO();
		const due = addDays(issue, settings.default_payment_terms_days);
		const allocation = await allocateDocumentNumber("invoice", issue);

		// Inherit the source quote's chosen bank, falling back to the
		// business default if the quote's bank has been deleted. Snapshot
		// is rebuilt from the bank's current row.
		const { id: bankId, snapshot: bankSnap } = await resolveBankForDraft(quote.business_bank_id);

		const result = await execute(
			`INSERT INTO invoices (
				number, client_id, client_snapshot, source_quote_id,
				issue_date, due_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				notes, terms, prepared_by, bank_details_snapshot, business_bank_id
			) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				allocation.number,
				quote.client_id,
				quote.client_snapshot,
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

		const allocation = await allocateDocumentNumber("invoice", issue);
		const { id: bankId, snapshot: bankSnap } = await resolveBankForDraft(src.business_bank_id);

		const result = await execute(
			`INSERT INTO invoices (
				number, client_id, client_snapshot, source_quote_id,
				issue_date, due_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				notes, terms, prepared_by, bank_details_snapshot, business_bank_id
			) VALUES (?, ?, ?, NULL, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				allocation.number,
				src.client_id,
				src.client_snapshot,
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
		| "notes" | "terms" | "prepared_by" | "bank_details_snapshot" | "business_bank_id">>;

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
		"business_bank_id"
	];

	const update = async (id: number, patch: InvoiceUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(
			`UPDATE invoices SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
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
		filtered,
		outstandingTotal,
		overdueCount,
		load,
		get,
		getLines,
		createDraft,
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
