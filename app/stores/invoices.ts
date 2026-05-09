// Invoices store. Mirrors `quotes` for the document lifecycle but adds the
// payment ledger and the convert-from-quote operation.
//
// Status transitions:
//   draft     → sent | cancelled
//   sent      → partial | paid | overdue | cancelled
//   partial   → paid | overdue | cancelled
//   paid      → (terminal — refunds aren't modelled in v1)
//   overdue   → partial | paid | cancelled
//   cancelled → (terminal)
//
// `partial` and `paid` are derived from paid_cents, but we store them as
// explicit status so list filters and dashboard tiles don't need to do the
// math. recordPayment() updates both atomically (one statement each, in
// sequence — see db.ts for why we don't use JS-side transactions).

import type { BankSnapshot, ClientSnapshot, PricingMode, QuoteLineRow, QuoteRow } from "~/stores/quotes";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { computeLineTotals, sumCents } from "~/lib/money";
import { allocateDocumentNumber } from "~/lib/numbering";

import { useSettingsStore } from "~/stores/settings";

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";

export interface InvoiceRow {
	id: number
	number: string
	client_id: number
	client_snapshot: string
	source_quote_id: number | null
	issue_date: string
	due_date: string
	status: InvoiceStatus
	pricing_mode: PricingMode
	project_title: string
	vat_rate_basis_points: number
	subtotal_cents: number
	tax_cents: number
	total_cents: number
	paid_cents: number
	notes: string | null
	terms: string | null
	prepared_by: string | null
	bank_details_snapshot: string | null
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

export type PaymentMethod = "cash" | "bank_transfer" | "cheque" | "card" | "other";

export interface InvoicePaymentRow {
	id: number
	invoice_id: number
	payment_date: string
	amount_cents: number
	method: PaymentMethod | null
	reference: string | null
	notes: string | null
	created_at: string
}

export interface PaymentDraft {
	payment_date: string
	amount_cents: number
	method: PaymentMethod | null
	reference: string | null
	notes: string | null
}

const STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
	draft: ["sent", "cancelled"],
	sent: ["partial", "paid", "overdue", "cancelled"],
	partial: ["paid", "overdue", "cancelled"],
	overdue: ["partial", "paid", "cancelled"],
	paid: [],
	cancelled: []
};

export const canTransition = (from: InvoiceStatus, to: InvoiceStatus): boolean =>
	STATUS_TRANSITIONS[from]?.includes(to) ?? false;

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

const buildBankSnapshot = (): string | null => {
	const settingsStore = useSettingsStore();
	const row = settingsStore.settings;
	if (!row) return null;
	const snap: BankSnapshot = {
		bank_name: row.bank_name,
		bank_branch: row.bank_branch,
		bank_account_name: row.bank_account_name,
		bank_account_number: row.bank_account_number
	};
	const anyFilled = Object.values(snap).some((v) => v != null && v !== "");
	return anyFilled ? JSON.stringify(snap) : null;
};

export const useInvoicesStore = defineStore("invoices", () => {
	const invoices = ref<InvoiceRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	const statusFilter = ref<InvoiceStatus | "all" | "outstanding">("all");
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

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return invoices.value.filter((row) => {
			if (statusFilter.value === "outstanding") {
				if (!["sent", "partial", "overdue"].includes(row.status)) return false;
			} else if (statusFilter.value !== "all" && row.status !== statusFilter.value) {
				return false;
			}
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
		let sum = 0;
		for (const r of invoices.value) {
			if (r.status === "sent" || r.status === "partial" || r.status === "overdue") {
				sum += Math.max(0, r.total_cents - r.paid_cents);
			}
		}
		return sum;
	});

	const overdueCount = computed(() =>
		invoices.value.filter((r) => r.status === "overdue").length
	);

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

	const getPayments = async (invoiceId: number): Promise<InvoicePaymentRow[]> =>
		select<InvoicePaymentRow>(
			"SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY date(payment_date) ASC, id ASC",
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
		const bankSnap = buildBankSnapshot();

		// Seed the draft's VAT rate from the business profile's default so
		// the editor lands with the right percentage already filled in.
		// Stored as basis points (18% → 1800). The editor still lets the
		// user override per-invoice.
		const defaultVatBp = settings.default_vat_rate ?? 0;
		const result = await execute(
			`INSERT INTO invoices (
				number, client_id, client_snapshot, source_quote_id,
				issue_date, due_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents, paid_cents,
				prepared_by, bank_details_snapshot
			) VALUES (?, ?, ?, NULL, ?, ?, 'draft', 'bundle', ?, ?, 0, 0, 0, 0, ?, ?)`,
			[
				allocation.number,
				input.client.id,
				clientSnap,
				issue,
				due,
				input.project_title ?? "",
				defaultVatBp,
				null,
				bankSnap
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

		// Snapshot of bank details captured fresh at issue time for the invoice;
		// the quote's snapshot is preserved on the quote row.
		const bankSnap = buildBankSnapshot();

		const result = await execute(
			`INSERT INTO invoices (
				number, client_id, client_snapshot, source_quote_id,
				issue_date, due_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents, paid_cents,
				notes, terms, prepared_by, bank_details_snapshot
			) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
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
				bankSnap
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

	type InvoiceUpdate = Partial<Pick<InvoiceRow, | "client_id" | "client_snapshot" | "issue_date" | "due_date"
		| "pricing_mode" | "project_title"
		| "vat_rate_basis_points"
		| "subtotal_cents" | "tax_cents" | "total_cents"
		| "notes" | "terms" | "prepared_by" | "bank_details_snapshot">>;

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
		"bank_details_snapshot"
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

	// Decide the next status after a paid_cents change. Pure helper.
	const statusAfterPayment = (
		current: InvoiceStatus,
		totalCents: number,
		paidCents: number
	): InvoiceStatus => {
		if (current === "draft" || current === "cancelled") return current;
		if (paidCents <= 0) return current === "partial" ? "sent" : current;
		if (paidCents >= totalCents) return "paid";
		return "partial";
	};

	const recordPayment = async (
		invoiceId: number,
		payment: PaymentDraft
	): Promise<void> => {
		const inv = await get(invoiceId);
		if (!inv) throw new Error("recordPayment: invoice not found");
		if (inv.status === "draft") {
			throw new Error("Cannot record payments against a draft invoice");
		}
		if (inv.status === "cancelled") {
			throw new Error("Cannot record payments against a cancelled invoice");
		}
		if (payment.amount_cents <= 0) {
			throw new Error("Payment amount must be positive");
		}

		await execute(
			`INSERT INTO invoice_payments (
				invoice_id, payment_date, amount_cents, method, reference, notes
			) VALUES (?, ?, ?, ?, ?, ?)`,
			[
				invoiceId,
				payment.payment_date,
				payment.amount_cents,
				payment.method,
				payment.reference,
				payment.notes
			]
		);

		// Re-derive paid_cents from the ledger so we self-heal if anything's
		// gone out of sync. Cheap because payment counts are tiny per invoice.
		const sumRow = await selectOne<{ s: number }>(
			"SELECT COALESCE(SUM(amount_cents), 0) AS s FROM invoice_payments WHERE invoice_id = ?",
			[invoiceId]
		);
		const newPaid = sumRow?.s ?? 0;
		const next = statusAfterPayment(inv.status, inv.total_cents, newPaid);
		await execute(
			"UPDATE invoices SET paid_cents = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
			[newPaid, next, invoiceId]
		);
		await load();
	};

	const deletePayment = async (invoiceId: number, paymentId: number): Promise<void> => {
		const inv = await get(invoiceId);
		if (!inv) throw new Error("deletePayment: invoice not found");
		await execute("DELETE FROM invoice_payments WHERE id = ? AND invoice_id = ?", [paymentId, invoiceId]);
		const sumRow = await selectOne<{ s: number }>(
			"SELECT COALESCE(SUM(amount_cents), 0) AS s FROM invoice_payments WHERE invoice_id = ?",
			[invoiceId]
		);
		const newPaid = sumRow?.s ?? 0;
		const next = statusAfterPayment(inv.status, inv.total_cents, newPaid);
		await execute(
			"UPDATE invoices SET paid_cents = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
			[newPaid, next, invoiceId]
		);
		await load();
	};

	const setStatus = async (id: number, target: InvoiceStatus): Promise<void> => {
		const row = await get(id);
		if (!row) throw new Error("setStatus: invoice not found");
		if (!canTransition(row.status, target)) {
			throw new Error(`Cannot move invoice from ${row.status} to ${target}`);
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
		// invoice_lines and invoice_payments cascade via FK ON DELETE CASCADE.
		await execute("DELETE FROM invoices WHERE id = ?", [id]);
		await load();
	};

	// Universal delete — removes an invoice regardless of status, including
	// any payment ledger entries (cascaded). Used by the typed-name confirm
	// flow on the detail page when the user genuinely needs to scrub a
	// record. Reverse FKs without an ON DELETE clause are nulled first:
	//   - quotes.converted_invoice_id (back-link from a converted quote)
	//   - vouchers.related_invoice_id (loose link from receipts)
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
		await load();
	};

	// Run on app boot / list load. Flips sent|partial invoices past their
	// due_date to 'overdue'. Doesn't touch paid/draft/cancelled.
	const flagOverdue = async (): Promise<number> => {
		const today = todayISO();
		const result = await execute(
			`UPDATE invoices
			 SET status = 'overdue', updated_at = datetime('now')
			 WHERE status IN ('sent','partial') AND due_date < ?`,
			[today]
		);
		if (result.rowsAffected > 0) await load();
		return result.rowsAffected;
	};

	return {
		invoices,
		loading,
		error,
		search,
		statusFilter,
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
		getPayments,
		createDraft,
		createFromQuote,
		update,
		replaceLines,
		recordPayment,
		deletePayment,
		setStatus,
		deleteDraft,
		remove,
		flagOverdue,
		buildClientSnapshot
	};
});
