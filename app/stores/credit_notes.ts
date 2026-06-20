// Credit notes store. Structurally mirrors `invoices` but without the
// payment-lifecycle machinery — a credit note doesn't have receipts
// against it, doesn't have a due_date, doesn't have an "overdue" state.
//
// Status model
// ------------
// The DB persists three states the user sets directly:
//   draft     — not yet issued; editable, deletable
//   issued    — given to the client; immutable except for notes
//   cancelled — terminal user-set state; sticky
//
// Unlike invoices there is no derived enrichment here — what's
// persisted is what the UI shows. The interaction between a credit
// note and its source invoice (reducing the invoice's outstanding
// balance) lives in the invoices store, not here.

import type { InvoiceLineRow, InvoiceRow } from "~/stores/invoices";
import type { ClientSnapshot, PricingMode } from "~/stores/quotes";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { computeLineTotals, sumCents } from "~/lib/money";
import { allocateDocumentNumber, allocateSpecificDocumentNumber } from "~/lib/numbering";
import { purgeDocumentAttachments } from "~/stores/document_attachments";
import { useSettingsStore } from "~/stores/settings";

export type CreditNoteStatus = "draft" | "issued" | "cancelled";

export interface CreditNoteRow {
	id: number
	number: string
	client_id: number
	client_snapshot: string
	/// Denormalised from `client_snapshot.name` — set whenever the
	/// snapshot is written so the list page can render the client
	/// name + sort + search without a JSON parse per row.
	client_name: string
	/// Optional FK to the invoice this credit settles. When set, the
	/// invoice's derived balance subtracts this credit note's total
	/// (alongside the receipt vouchers).
	source_invoice_id: number | null
	issue_date: string
	status: CreditNoteStatus
	pricing_mode: PricingMode
	project_title: string
	vat_rate_basis_points: number
	subtotal_cents: number
	tax_cents: number
	total_cents: number
	notes: string | null
	/// Optional override for the PDF's big header ("Refund note"
	/// instead of "CREDIT NOTE"). Same column shape as other documents.
	title_override: string | null
	created_at: string
	updated_at: string
}

export interface CreditNoteLineRow {
	id: number
	credit_note_id: number
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
// derives it from the array index at write time.
export type CreditNoteLineDraft = Omit<CreditNoteLineRow,	| "id" | "credit_note_id" | "sort_order"
	| "line_subtotal_cents" | "line_tax_cents" | "line_total_cents">;

const todayISO = (): string => {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${dd}`;
};

/// Extract the `name` field from a stored client-snapshot JSON string.
/// Only used by update() to keep the denormalised column in lockstep
/// with the snapshot when the Refresh-client-snapshot button fires.
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

export const useCreditNotesStore = defineStore("credit_notes", () => {
	const creditNotes = ref<CreditNoteRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	const statusFilters = ref<CreditNoteStatus[]>([]);
	const toggleStatusFilter = (s: CreditNoteStatus) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};
	const clearStatusFilters = () => {
		statusFilters.value = [];
	};
	const clientFilter = ref<number | "all">("all");
	const issuedFrom = ref<string | null>(null);
	const issuedTo = ref<string | null>(null);

	const hasDateFilters = computed(() =>
		Boolean(issuedFrom.value || issuedTo.value)
	);

	const clearDateFilters = () => {
		issuedFrom.value = null;
		issuedTo.value = null;
	};

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return creditNotes.value.filter((row) => {
			if (statusFilters.value.length > 0 && !statusFilters.value.includes(row.status)) return false;
			if (clientFilter.value !== "all" && row.client_id !== clientFilter.value) return false;
			if (issuedFrom.value && row.issue_date < issuedFrom.value) return false;
			if (issuedTo.value && row.issue_date > issuedTo.value) return false;
			if (!q) return true;
			return (
				row.number.toLowerCase().includes(q)
				|| row.project_title.toLowerCase().includes(q)
				|| row.client_name.toLowerCase().includes(q)
			);
		});
	});

	/// Total credit issued across all non-cancelled credit notes.
	/// Used by the list page's filtered-row chip + dashboard tile.
	const totalIssuedCents = computed(() => {
		let sum = 0;
		for (const r of creditNotes.value) {
			if (r.status === "issued") sum += r.total_cents;
		}
		return sum;
	});

	// Packaged filter snapshot for the server-paginated list page (drives the
	// page's buildWhere + the useServerTable refetch dependency).
	const listFilters = computed(() => ({
		search: search.value,
		statusFilters: statusFilters.value,
		clientFilter: clientFilter.value,
		issuedFrom: issuedFrom.value,
		issuedTo: issuedTo.value
	}));

	// Header stats (grand total count + issued-credit sum) from one query, so
	// the paginated page doesn't load every row to show them.
	const fetchHeaderStats = async (): Promise<{ total: number, issuedCents: number }> => {
		const rows = await select<{ total: number, issued: number }>(
			"SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'issued' THEN total_cents ELSE 0 END), 0) AS issued FROM credit_notes"
		);
		return { total: rows[0]?.total ?? 0, issuedCents: rows[0]?.issued ?? 0 };
	};

	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			creditNotes.value = await select<CreditNoteRow>(
				"SELECT * FROM credit_notes ORDER BY datetime(created_at) DESC"
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

	const get = async (id: number): Promise<CreditNoteRow | null> =>
		selectOne<CreditNoteRow>("SELECT * FROM credit_notes WHERE id = ?", [id]);

	const getLines = async (creditNoteId: number): Promise<CreditNoteLineRow[]> =>
		select<CreditNoteLineRow>(
			"SELECT * FROM credit_note_lines WHERE credit_note_id = ? ORDER BY sort_order ASC, id ASC",
			[creditNoteId]
		);

	const createDraft = async (input: {
		client: ClientSnapshot & { id: number }
		project_title?: string
		/// Optional FK to the source invoice. When set, the credit note
		/// records the link from creation; the invoice's derived balance
		/// will pick it up once the credit note hits 'issued'.
		source_invoice_id?: number | null
		issue_date?: string
		sequence?: number
	}): Promise<number> => {
		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("createDraft: settings not loaded");

		const issue = input.issue_date ?? todayISO();
		const allocation = input.sequence !== undefined
			? await allocateSpecificDocumentNumber("credit_note", issue, input.sequence)
			: await allocateDocumentNumber("credit_note", issue);
		const clientSnap = buildClientSnapshot(input.client);
		const defaultVatBp = settings.default_vat_rate ?? 0;

		const result = await execute(
			`INSERT INTO credit_notes (
				number, client_id, client_snapshot, client_name, source_invoice_id,
				issue_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents
			) VALUES (?, ?, ?, ?, ?, ?, 'draft', 'bundle', ?, ?, 0, 0, 0)`,
			[
				allocation.number,
				input.client.id,
				clientSnap,
				input.client.name,
				input.source_invoice_id ?? null,
				issue,
				input.project_title ?? "",
				defaultVatBp
			]
		);
		if (result.lastInsertId === undefined) throw new Error("createDraft: no lastInsertId");
		await load();
		return result.lastInsertId;
	};

	/// Spin up a credit-note draft from an existing invoice. Clones the
	/// client + line items + project title + VAT rate, links the new
	/// credit note back via source_invoice_id, and re-dates to today.
	/// The caller decides what to do with the source invoice's status
	/// afterwards (typically leave it alone — issued credit notes reduce
	/// the invoice's outstanding balance via derivation).
	const createFromInvoice = async (
		invoice: InvoiceRow,
		invoiceLines: InvoiceLineRow[]
	): Promise<number> => {
		const issue = todayISO();
		const allocation = await allocateDocumentNumber("credit_note", issue);

		const result = await execute(
			`INSERT INTO credit_notes (
				number, client_id, client_snapshot, client_name, source_invoice_id,
				issue_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents, notes
			) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
			[
				allocation.number,
				invoice.client_id,
				invoice.client_snapshot,
				invoice.client_name,
				invoice.id,
				issue,
				invoice.pricing_mode,
				invoice.project_title,
				invoice.vat_rate_basis_points,
				invoice.subtotal_cents,
				invoice.tax_cents,
				invoice.total_cents,
				`Credit against invoice ${invoice.number}.`
			]
		);
		if (result.lastInsertId === undefined) throw new Error("createFromInvoice: no lastInsertId");
		const creditNoteId = result.lastInsertId;

		for (let i = 0; i < invoiceLines.length; i++) {
			const l = invoiceLines[i];
			if (!l) continue;
			await execute(
				`INSERT INTO credit_note_lines (
					credit_note_id, sort_order, item_label, description,
					quantity_milli, unit, unit_price_cents, tax_rate_basis_points,
					line_subtotal_cents, line_tax_cents, line_total_cents
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					creditNoteId,
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
		return creditNoteId;
	};

	type CreditNoteUpdate = Partial<Pick<CreditNoteRow, | "client_id" | "client_snapshot" | "source_invoice_id"
		| "issue_date" | "pricing_mode" | "project_title"
		| "vat_rate_basis_points"
		| "subtotal_cents" | "tax_cents" | "total_cents"
		| "notes" | "title_override">>;

	const UPDATABLE: ReadonlyArray<keyof CreditNoteUpdate> = [
		"client_id",
		"client_snapshot",
		"source_invoice_id",
		"issue_date",
		"pricing_mode",
		"project_title",
		"vat_rate_basis_points",
		"subtotal_cents",
		"tax_cents",
		"total_cents",
		"notes",
		"title_override"
	];

	const update = async (id: number, patch: CreditNoteUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		let extraSet = "";
		if (Object.hasOwn(patch, "client_snapshot")) {
			extraSet = ", client_name = ?";
			params.push(nameFromClientSnapshot(patch.client_snapshot ?? ""));
		}
		params.push(id);
		await execute(
			`UPDATE credit_notes SET ${setClause}${extraSet}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
	};

	const replaceLines = async (
		creditNoteId: number,
		lines: CreditNoteLineDraft[]
	): Promise<{ subtotal_cents: number, tax_cents: number, total_cents: number }> => {
		const computed = lines.map((l) => ({
			...l,
			...computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points)
		}));

		await execute("DELETE FROM credit_note_lines WHERE credit_note_id = ?", [creditNoteId]);
		for (let i = 0; i < computed.length; i++) {
			const l = computed[i];
			if (!l) continue;
			await execute(
				`INSERT INTO credit_note_lines (
					credit_note_id, sort_order, item_label, description,
					quantity_milli, unit, unit_price_cents, tax_rate_basis_points,
					line_subtotal_cents, line_tax_cents, line_total_cents
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					creditNoteId,
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

	/// Legal transitions:
	///   draft     → issued       (publish — locks lines)
	///   draft     → cancelled    (kill before issuing)
	///   issued    → cancelled    (void after issuing)
	///   issued    → draft        (un-issue, e.g. correct an error)
	///   cancelled → issued       (reopen — refund flow)
	const setStatus = async (id: number, target: CreditNoteStatus): Promise<void> => {
		await execute(
			"UPDATE credit_notes SET status = ?, updated_at = datetime('now') WHERE id = ?",
			[target, id]
		);
		await load();
	};

	const deleteDraft = async (id: number): Promise<void> => {
		const row = await get(id);
		if (!row) return;
		if (row.status !== "draft") {
			throw new Error("Only draft credit notes can be deleted");
		}
		// credit_note_lines cascade via FK ON DELETE CASCADE.
		await execute("DELETE FROM credit_notes WHERE id = ?", [id]);
		await purgeDocumentAttachments("credit_note", id);
		await load();
	};

	const remove = async (id: number): Promise<void> => {
		const row = await get(id);
		if (!row) return;
		await execute("DELETE FROM credit_notes WHERE id = ?", [id]);
		await purgeDocumentAttachments("credit_note", id);
		await load();
	};

	return {
		creditNotes,
		loading,
		error,
		search,
		statusFilters,
		toggleStatusFilter,
		clearStatusFilters,
		clientFilter,
		issuedFrom,
		issuedTo,
		hasDateFilters,
		clearDateFilters,
		listFilters,
		fetchHeaderStats,
		filtered,
		totalIssuedCents,
		loaded,
		load,
		ensureLoaded,
		get,
		getLines,
		createDraft,
		createFromInvoice,
		update,
		replaceLines,
		setStatus,
		deleteDraft,
		remove,
		buildClientSnapshot
	};
});
