// Quotes store. Encapsulates the lifecycle (draft → sent → terminal) and the
// dual-mode pricing (bundle vs itemized).
//
// Status transitions are enforced here, not in the SQL CHECK alone — the UI
// shouldn't even offer illegal moves. Allowed paths:
//   draft     → sent | rejected (cancel)
//   sent      → accepted | rejected | expired
//   accepted  → converted     (set automatically when an invoice is created)
//   rejected  → (terminal)
//   expired   → (terminal)
//   converted → (terminal)

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { computeLineTotals, sumCents } from "~/lib/money";
import { allocateDocumentNumber } from "~/lib/numbering";
import { useSettingsStore } from "~/stores/settings";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";
export type PricingMode = "bundle" | "itemized";

export interface QuoteRow {
	id: number
	number: string
	client_id: number
	client_snapshot: string // JSON-serialised
	issue_date: string
	valid_until: string
	status: QuoteStatus
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
	converted_invoice_id: number | null
	created_at: string
	updated_at: string
}

export interface QuoteLineRow {
	id: number
	quote_id: number
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

export type QuoteLineDraft = Omit<QuoteLineRow, "id" | "quote_id" | "line_subtotal_cents" | "line_tax_cents" | "line_total_cents">;

export interface ClientSnapshot {
	name: string
	contact_person: string | null
	email: string | null
	phone: string | null
	address_line1: string | null
	address_line2: string | null
	city: string | null
	postal_code: string | null
	country: string | null
	tax_id: string | null
}

export interface BankSnapshot {
	bank_name: string | null
	bank_branch: string | null
	bank_account_name: string | null
	bank_account_number: string | null
}

const STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
	draft: ["sent", "rejected"],
	sent: ["accepted", "rejected", "expired"],
	accepted: ["converted"],
	rejected: [],
	expired: [],
	converted: []
};

export const canTransition = (from: QuoteStatus, to: QuoteStatus): boolean =>
	STATUS_TRANSITIONS[from]?.includes(to) ?? false;

export const useQuotesStore = defineStore("quotes", () => {
	const quotes = ref<QuoteRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	// Multi-select status filter. Empty array = show everything (no
	// narrowing). Each clicked badge in the list-page header toggles its
	// status in/out of this array.
	const statusFilters = ref<QuoteStatus[]>([]);
	const toggleStatusFilter = (s: QuoteStatus) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};
	const clearStatusFilters = () => {
		statusFilters.value = [];
	};
	// "all" = no narrowing; otherwise the FK id of a single client to
	// scope the list to. Filters on client_id (the FK), not the snapshot
	// name — clients keep the same id even after a rename.
	const clientFilter = ref<number | "all">("all");
	// Optional date-range narrowing. Each field is its own from/to pair —
	// "Issued" filters on issue_date, "Valid until" filters on valid_until.
	// Empty string means unset. ISO date strings sort lexicographically so
	// direct string compare is correct.
	const issuedFrom = ref<string | null>(null);
	const issuedTo = ref<string | null>(null);
	const validFrom = ref<string | null>(null);
	const validTo = ref<string | null>(null);

	const hasDateFilters = computed(() =>
		Boolean(issuedFrom.value || issuedTo.value || validFrom.value || validTo.value)
	);

	const clearDateFilters = () => {
		issuedFrom.value = null;
		issuedTo.value = null;
		validFrom.value = null;
		validTo.value = null;
	};

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return quotes.value.filter((row) => {
			if (statusFilters.value.length > 0 && !statusFilters.value.includes(row.status)) return false;
			if (clientFilter.value !== "all" && row.client_id !== clientFilter.value) return false;
			if (issuedFrom.value && row.issue_date < issuedFrom.value) return false;
			if (issuedTo.value && row.issue_date > issuedTo.value) return false;
			if (validFrom.value && row.valid_until < validFrom.value) return false;
			if (validTo.value && row.valid_until > validTo.value) return false;
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

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			quotes.value = await select<QuoteRow>(
				"SELECT * FROM quotes ORDER BY datetime(created_at) DESC"
			);
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const get = async (id: number): Promise<QuoteRow | null> =>
		selectOne<QuoteRow>("SELECT * FROM quotes WHERE id = ?", [id]);

	const getLines = async (quoteId: number): Promise<QuoteLineRow[]> =>
		select<QuoteLineRow>(
			"SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order ASC, id ASC",
			[quoteId]
		);

	const buildClientSnapshot = (
		client: { name: string, contact_person?: string | null, email?: string | null, phone?: string | null, address_line1?: string | null, address_line2?: string | null, city?: string | null, postal_code?: string | null, country?: string | null, tax_id?: string | null }
	): string => JSON.stringify({
		name: client.name,
		contact_person: client.contact_person ?? null,
		email: client.email ?? null,
		phone: client.phone ?? null,
		address_line1: client.address_line1 ?? null,
		address_line2: client.address_line2 ?? null,
		city: client.city ?? null,
		postal_code: client.postal_code ?? null,
		country: client.country ?? null,
		tax_id: client.tax_id ?? null
	} satisfies ClientSnapshot);

	// Read bank fields from the settings store at issue time. Returns a JSON
	// string snapshot or null if no bank fields are filled in.
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

	// Today's date in YYYY-MM-DD using local time (not UTC).
	const todayISO = (): string => {
		const d = new Date();
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${dd}`;
	};

	// Add `days` to a YYYY-MM-DD string, returning another YYYY-MM-DD.
	const addDaysSafe = (iso: string, days: number): string => {
		const [y, m, d] = iso.split("-").map(Number);
		if (!y || !m || !d) return iso;
		const dt = new Date(y, m - 1, d);
		dt.setDate(dt.getDate() + days);
		const yy = dt.getFullYear();
		const mm = String(dt.getMonth() + 1).padStart(2, "0");
		const dd = String(dt.getDate()).padStart(2, "0");
		return `${yy}-${mm}-${dd}`;
	};

	const createDraft = async (input: { client: ClientSnapshot & { id: number }, project_title?: string }): Promise<number> => {
		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("createDraft: settings not loaded");

		const issue = todayISO();
		const validity = settings.default_quote_validity_days;
		const validUntil = addDaysSafe(issue, validity);

		const allocation = await allocateDocumentNumber("quote", issue);
		const clientSnap = buildClientSnapshot(input.client);
		const bankSnap = buildBankSnapshot();

		// Seed the draft's VAT rate from the business profile's default so
		// the editor lands with the right percentage already filled in.
		// Stored as basis points (18% → 1800). The editor still lets the
		// user override per-quote.
		const defaultVatBp = settings.default_vat_rate ?? 0;
		const result = await execute(
			`INSERT INTO quotes (
				number, client_id, client_snapshot, issue_date, valid_until,
				status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				prepared_by, bank_details_snapshot
			) VALUES (?, ?, ?, ?, ?, 'draft', 'bundle', ?, ?, 0, 0, 0, ?, ?)`,
			[
				allocation.number,
				input.client.id,
				clientSnap,
				issue,
				validUntil,
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

	type QuoteUpdate = Partial<Pick<QuoteRow, | "client_id" | "client_snapshot" | "issue_date" | "valid_until"
		| "pricing_mode" | "project_title"
		| "vat_rate_basis_points"
		| "subtotal_cents" | "tax_cents" | "total_cents"
		| "notes" | "terms" | "prepared_by" | "bank_details_snapshot">>;

	const UPDATABLE: ReadonlyArray<keyof QuoteUpdate> = [
		"client_id",
		"client_snapshot",
		"issue_date",
		"valid_until",
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

	const update = async (id: number, patch: QuoteUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(
			`UPDATE quotes SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
	};

	// Replace all line rows for a quote in a single transaction. Simpler than
	// diffing — line counts are small (single-digits to low-tens) and the
	// totals recomputation lives in one place.
	const replaceLines = async (
		quoteId: number,
		lines: QuoteLineDraft[]
	): Promise<{ subtotal_cents: number, tax_cents: number, total_cents: number }> => {
		const computed = lines.map((l) => {
			const totals = computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points);
			return { ...l, ...totals };
		});

		// Best-effort sequential rewrite. The plugin's pool prevents true
		// JS-side transactions; if this is interrupted, the user re-saves
		// to recover. Issued documents shouldn't reach this code path.
		await execute("DELETE FROM quote_lines WHERE quote_id = ?", [quoteId]);
		for (let i = 0; i < computed.length; i++) {
			const l = computed[i];
			if (!l) continue;
			await execute(
				`INSERT INTO quote_lines (
					quote_id, sort_order, item_label, description,
					quantity_milli, unit, unit_price_cents, tax_rate_basis_points,
					line_subtotal_cents, line_tax_cents, line_total_cents
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					quoteId,
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

		const subtotal = sumCents(...computed.map((l) => l.line_subtotal_cents));
		const tax = sumCents(...computed.map((l) => l.line_tax_cents));
		const total = sumCents(...computed.map((l) => l.line_total_cents));
		return { subtotal_cents: subtotal, tax_cents: tax, total_cents: total };
	};

	const setStatus = async (id: number, target: QuoteStatus): Promise<void> => {
		const row = await get(id);
		if (!row) throw new Error("setStatus: quote not found");
		if (!canTransition(row.status, target)) {
			throw new Error(`Cannot move quote from ${row.status} to ${target}`);
		}
		await execute(
			"UPDATE quotes SET status = ?, updated_at = datetime('now') WHERE id = ?",
			[target, id]
		);
		await load();
	};

	// Mark a quote as 'converted' and link it to the invoice that was created
	// from it. Should only be called by the invoice-create flow after the
	// invoice row is in place — the link is bidirectional (invoices.source_quote_id
	// + quotes.converted_invoice_id).
	const markConverted = async (quoteId: number, invoiceId: number): Promise<void> => {
		await execute(
			`UPDATE quotes
			 SET status = 'converted', converted_invoice_id = ?, updated_at = datetime('now')
			 WHERE id = ?`,
			[invoiceId, quoteId]
		);
		await load();
	};

	// Drafts can be deleted. Issued quotes cannot.
	const deleteDraft = async (id: number): Promise<void> => {
		const row = await get(id);
		if (!row) return;
		if (row.status !== "draft") {
			throw new Error("Only draft quotes can be deleted");
		}
		// quote_lines.quote_id has ON DELETE CASCADE, so a single DELETE
		// removes both. (sqlx enables foreign_keys by default.)
		await execute("DELETE FROM quotes WHERE id = ?", [id]);
		await load();
	};

	// Universal delete — removes a quote regardless of status. Used by the
	// "Delete" action on the detail page once the user has confirmed via the
	// typed-name modal. Issued documents are normally immutable; this is the
	// escape hatch when the user genuinely needs to scrub a record.
	//
	// `invoices.source_quote_id` has no ON DELETE clause (defaults to NO
	// ACTION), so we null it out first; otherwise the DELETE fails with a
	// foreign-key violation when the quote was converted into an invoice.
	const remove = async (id: number): Promise<void> => {
		const row = await get(id);
		if (!row) return;
		await execute(
			"UPDATE invoices SET source_quote_id = NULL WHERE source_quote_id = ?",
			[id]
		);
		await execute("DELETE FROM quotes WHERE id = ?", [id]);
		await load();
	};

	// Run on app boot. Marks any 'sent' quote past its valid_until as 'expired'.
	const expireOverdue = async (): Promise<number> => {
		const today = todayISO();
		const result = await execute(
			`UPDATE quotes
			 SET status = 'expired', updated_at = datetime('now')
			 WHERE status = 'sent' AND valid_until < ?`,
			[today]
		);
		if (result.rowsAffected > 0) await load();
		return result.rowsAffected;
	};

	return {
		quotes,
		loading,
		error,
		search,
		statusFilters,
		toggleStatusFilter,
		clearStatusFilters,
		clientFilter,
		issuedFrom,
		issuedTo,
		validFrom,
		validTo,
		hasDateFilters,
		clearDateFilters,
		filtered,
		load,
		get,
		getLines,
		createDraft,
		update,
		replaceLines,
		setStatus,
		markConverted,
		deleteDraft,
		remove,
		expireOverdue,
		buildClientSnapshot,
		buildBankSnapshot
	};
});
