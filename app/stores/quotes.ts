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

import type { QuoteListFilters } from "~/lib/quote-query";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { computeLineTotals, sumCents } from "~/lib/money";
import { allocateDocumentNumber, allocateSpecificDocumentNumber, renumberForIssueDate } from "~/lib/numbering";
import { useBusinessBanksStore } from "~/stores/business_banks";
import { purgeDocumentAttachments } from "~/stores/document_attachments";
import { useSettingsStore } from "~/stores/settings";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";
export type PricingMode = "bundle" | "itemized";

export interface QuoteRow {
	id: number
	number: string
	client_id: number
	client_snapshot: string // JSON-serialised
	/// Denormalised from `client_snapshot.name` — set whenever the
	/// snapshot is set so the list page can render + sort + search by
	/// client name without parsing the JSON blob on every keystroke.
	/// Migration 0028 added this column and backfilled it from the
	/// existing snapshots.
	client_name: string
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
	business_bank_id: number | null
	/**
	 * Per-document override of the PDF's big header. Null/empty = the
	 * hardcoded default ("QUOTATION"); when set, the PDF builder
	 * upper-cases this verbatim for the header.
	 */
	title_override: string | null
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

// sort_order is omitted from the draft because `replaceLines` always
// derives it from the array index at write time — passing it in would
// have no effect, so the type contract shouldn't pretend it's an input.
export type QuoteLineDraft = Omit<QuoteLineRow,	| "id" | "quote_id" | "sort_order"
	| "line_subtotal_cents" | "line_tax_cents" | "line_total_cents">;

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
	// Rejected and expired are user-decision states, not data-loss
	// states — allow reopening back to draft so an accidental click
	// or a customer change of mind doesn't burn the quote number.
	rejected: ["draft"],
	expired: ["draft"],
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

	// Packaged filter snapshot for the server-side list query — fed to
	// `buildQuoteWhere` (app/lib/quote-query.ts) on the paginated quotes page.
	// Mirror of the `filtered` predicates below, in object form.
	const listFilters = computed<QuoteListFilters>(() => ({
		search: search.value,
		statusFilters: statusFilters.value,
		clientFilter: clientFilter.value,
		issuedFrom: issuedFrom.value,
		issuedTo: issuedTo.value,
		validFrom: validFrom.value,
		validTo: validTo.value
	}));

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
			// Search on the denormalised client_name column (migration
			// 0028) so we don't JSON.parse the snapshot blob on every
			// keystroke — used to be the most expensive part of the
			// search filter at heavy demo scale.
			return (
				row.number.toLowerCase().includes(q)
				|| row.project_title.toLowerCase().includes(q)
				|| row.client_name.toLowerCase().includes(q)
			);
		});
	});

	// See app/stores/invoices.ts for the `loaded` / `ensureLoaded`
	// rationale + shared pendingLoad — same pattern: skip refetching
	// when already populated, share a single in-flight promise across
	// concurrent callers.
	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			quotes.value = await select<QuoteRow>(
				"SELECT * FROM quotes ORDER BY datetime(created_at) DESC"
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

	const get = async (id: number): Promise<QuoteRow | null> =>
		selectOne<QuoteRow>("SELECT * FROM quotes WHERE id = ?", [id]);

	const getLines = async (quoteId: number): Promise<QuoteLineRow[]> =>
		select<QuoteLineRow>(
			"SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order ASC, id ASC",
			[quoteId]
		);

	// Pull the name field out of a stored client_snapshot JSON. Only
	// the `update()` path uses this — for the Refresh-client-snapshot
	// button on the detail page, which is the one flow that mutates
	// the snapshot post-create. createDraft / duplicate pass the name
	// directly from their input / source row.
	const nameFromClientSnapshot = (snap: string): string => {
		try {
			return (JSON.parse(snap) as { name?: string }).name ?? "";
		} catch {
			return "";
		}
	};

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

	// Resolve the bank id + snapshot pair for a draft. If no explicit id is
	// passed, falls back to the business's default bank. Returns
	// { id: null, snapshot: null } when no banks exist yet (e.g. on a
	// fresh tenant before the user has added any) — the document just
	// renders without a bank block.
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

	// Whole-day gap between two YYYY-MM-DD strings (toISO − fromISO).
	const daysBetween = (fromISO: string, toISO: string): number => {
		const [y1, m1, d1] = fromISO.split("-").map(Number);
		const [y2, m2, d2] = toISO.split("-").map(Number);
		if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
		const a = new Date(y1, m1 - 1, d1).getTime();
		const b = new Date(y2, m2 - 1, d2).getTime();
		return Math.round((b - a) / 86_400_000);
	};

	const createDraft = async (input: {
		client: ClientSnapshot & { id: number }
		project_title?: string
		/**
			 Override `issue_date` (e.g. when launched from the calendar
			with a specific day in mind). Defaults to today. `valid_until`
			derives from this date + the business's default quote validity.
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
		const validity = settings.default_quote_validity_days;
		const validUntil = addDaysSafe(issue, validity);

		const allocation = input.sequence !== undefined
			? await allocateSpecificDocumentNumber("quote", issue, input.sequence)
			: await allocateDocumentNumber("quote", issue);
		const clientSnap = buildClientSnapshot(input.client);
		const { id: bankId, snapshot: bankSnap } = await resolveBankForDraft();

		// Seed the draft's VAT rate from the business profile's default so
		// the editor lands with the right percentage already filled in.
		// Stored as basis points (18% → 1800). The editor still lets the
		// user override per-quote.
		const defaultVatBp = settings.default_vat_rate ?? 0;
		const result = await execute(
			`INSERT INTO quotes (
				number, client_id, client_snapshot, client_name, issue_date, valid_until,
				status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				prepared_by, bank_details_snapshot, business_bank_id
			) VALUES (?, ?, ?, ?, ?, ?, 'draft', 'bundle', ?, ?, 0, 0, 0, ?, ?, ?)`,
			[
				allocation.number,
				input.client.id,
				clientSnap,
				input.client.name,
				issue,
				validUntil,
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

	// Clone an existing quote into a fresh draft. Copies the client, line
	// items, project, VAT rate, notes/terms, and totals; resets status to
	// 'draft', allocates a new number, and re-dates it to today. The
	// validity window length is preserved (valid_until = today + the
	// original issue→valid span). Bank details are re-snapshotted from
	// current settings, same as any other freshly-created document.
	const duplicate = async (id: number): Promise<number> => {
		const src = await get(id);
		if (!src) throw new Error("duplicate: quote not found");
		const srcLines = await getLines(id);

		const issue = todayISO();
		const span = Math.max(0, daysBetween(src.issue_date, src.valid_until));
		const validUntil = addDaysSafe(issue, span);

		const allocation = await allocateDocumentNumber("quote", issue);
		// Carry forward the source quote's chosen bank if it still exists
		// (resolveBankForDraft falls back to default when null). Snapshot
		// is rebuilt from the bank's current row, so a renamed account
		// shows the new details on the duplicate.
		const { id: bankId, snapshot: bankSnap } = await resolveBankForDraft(src.business_bank_id);

		const result = await execute(
			`INSERT INTO quotes (
				number, client_id, client_snapshot, client_name, issue_date, valid_until,
				status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				notes, terms, prepared_by, bank_details_snapshot, business_bank_id
			) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				allocation.number,
				src.client_id,
				src.client_snapshot,
				src.client_name,
				issue,
				validUntil,
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
				`INSERT INTO quote_lines (
					quote_id, sort_order, item_label, description,
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

	type QuoteUpdate = Partial<Pick<QuoteRow, | "client_id" | "client_snapshot" | "issue_date" | "valid_until"
		| "pricing_mode" | "project_title"
		| "vat_rate_basis_points"
		| "subtotal_cents" | "tax_cents" | "total_cents"
		| "notes" | "terms" | "prepared_by" | "bank_details_snapshot" | "business_bank_id"
		| "title_override">>;

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
		"bank_details_snapshot",
		"business_bank_id",
		"title_override"
	];

	const update = async (id: number, patch: QuoteUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		// Keep client_name in lockstep with the snapshot whenever the
		// patch touches the snapshot (refresh-snapshot on detail page).
		let extraSet = "";
		if (Object.hasOwn(patch, "client_snapshot")) {
			extraSet = ", client_name = ?";
			params.push(nameFromClientSnapshot(patch.client_snapshot ?? ""));
		}
		params.push(id);
		await execute(
			`UPDATE quotes SET ${setClause}${extraSet}, updated_at = datetime('now') WHERE id = ?`,
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
		await purgeDocumentAttachments("quote", id);
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
		await purgeDocumentAttachments("quote", id);
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

	// Per-status totals straight from the DB (one grouped query) for the
	// list-page header summary, so the server-paginated page doesn't need
	// every row in memory just to count them.
	const fetchStatusCounts = async (): Promise<Record<QuoteStatus, number>> => {
		const rows = await select<{ status: QuoteStatus, n: number }>(
			"SELECT status, COUNT(*) AS n FROM quotes GROUP BY status"
		);
		const out: Record<QuoteStatus, number> = {
			draft: 0,
			sent: 0,
			accepted: 0,
			rejected: 0,
			expired: 0,
			converted: 0
		};
		for (const r of rows) out[r.status] = r.n;
		return out;
	};

	// Re-derive a DRAFT quote's number when its issue date moves to a
	// different fiscal year (back-dating a historical quote). Collision-safe —
	// see renumberForIssueDate. No-op on issued quotes or when the year is
	// unchanged. Returns the new number, or null when nothing changed.
	const renumberDraft = async (id: number, newIssueDate: string): Promise<string | null> => {
		const row = await get(id);
		if (!row || row.status !== "draft") return null;
		const newNumber = await renumberForIssueDate("quote", row.number, newIssueDate);
		if (!newNumber) return null;
		await execute(
			"UPDATE quotes SET number = ?, updated_at = datetime('now') WHERE id = ?",
			[newNumber, id]
		);
		return newNumber;
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
		listFilters,
		filtered,
		loaded,
		load,
		ensureLoaded,
		get,
		getLines,
		createDraft,
		duplicate,
		update,
		renumberDraft,
		replaceLines,
		setStatus,
		markConverted,
		deleteDraft,
		remove,
		expireOverdue,
		fetchStatusCounts,
		buildClientSnapshot,
		resolveBankForDraft
	};
});
