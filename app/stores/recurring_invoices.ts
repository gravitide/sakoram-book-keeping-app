// Recurring invoices store. Tracks invoice TEMPLATES that get
// materialised into real draft invoices on a user-initiated cadence.
//
// A recurring invoice is NOT an issued document. It's a template
// + a "next_issue_date" pointer that the user clicks to advance.
// Each click of "Generate" inserts a fresh row into `invoices` (with
// a new allocated number, today's issue_date, due_date derived from
// the template's payment_terms_days) and advances next_issue_date by
// one frequency step.
//
// Generation is deliberately user-initiated — silently auto-generating
// on app load would be scary (what if the user wanted to skip a
// month?). The /recurring-invoices page surfaces a pending count
// (templates where is_paused=0 AND next_issue_date <= today AND
// the schedule hasn't reached end_date) and the user clicks through
// a modal to confirm + materialise.
//
// Lines are stored in a sibling table `recurring_invoice_lines`,
// schema close to but not identical to invoice_lines: lines on a
// template don't carry computed totals (subtotal/tax/total_cents) —
// those are recomputed at generation time so a VAT rate change on
// the template flows into the next generated invoice cleanly.

import type { ClientSnapshot, PricingMode } from "~/stores/quotes";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { bundleTaxCents, computeLineTotals } from "~/lib/money";
import { allocateDocumentNumber } from "~/lib/numbering";
import { useBusinessBanksStore } from "~/stores/business_banks";
import { useInvoicesStore } from "~/stores/invoices";
import { useSettingsStore } from "~/stores/settings";

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringInvoiceRow {
	id: number
	template_name: string
	is_paused: number // 0 or 1 (SQLite has no native bool)
	client_id: number
	client_snapshot: string
	/// Denormalised from client_snapshot.name. Set whenever the snapshot
	/// is written so the list page can sort + search without a JSON
	/// parse per row.
	client_name: string | null
	frequency: RecurringFrequency
	start_date: string
	next_issue_date: string
	end_date: string | null
	project_title: string | null
	pricing_mode: PricingMode
	// Bundle-mode lump-sum amount. Ignored when pricing_mode is
	// 'itemized' (totals roll up from line qty × price × VAT).
	// Defaults to 0 on freshly-created templates; migration 0031
	// backfilled existing rows with 0.
	bundle_subtotal_cents: number
	vat_rate_basis_points: number
	payment_terms_days: number
	notes: string | null
	business_bank_id: number | null
	invoices_generated: number
	last_generated_at: string | null
	created_at: string
	updated_at: string
}

export interface RecurringInvoiceLineRow {
	id: number
	recurring_invoice_id: number
	position: number
	item_label: string
	description: string | null
	quantity_milli: number
	unit_price_cents: number
	vat_rate_basis_points: number
}

// Line shape the editor + create flow use. `position` is derived from
// the array index at write time so callers don't pass it.
export interface RecurringInvoiceLineDraft {
	item_label: string
	description: string | null
	quantity_milli: number
	unit_price_cents: number
	vat_rate_basis_points: number
}

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

// Advance an ISO date by ONE step of the given frequency. Month-end
// overflow handled by clamping to the last day of the target month
// (Jan 31 + 1 month → Feb 28/29). JS's Date constructor doesn't
// auto-clamp — `new Date(2024, 1, 31)` rolls forward to Mar 2 — so
// we set the day to 1 first, advance the month, then clamp the day
// to the new month's length.
export const advanceDate = (iso: string, frequency: RecurringFrequency): string => {
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return iso;
	if (frequency === "weekly") return addDays(iso, 7);

	const stepMonths = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
	// Build a date at day 1 so the month addition doesn't roll forward.
	const dt = new Date(y, m - 1, 1);
	dt.setMonth(dt.getMonth() + stepMonths);
	// Last day of the target month — Date(year, month+1, 0) gives it.
	const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
	const targetDay = Math.min(d, lastDay);
	dt.setDate(targetDay);
	const yy = dt.getFullYear();
	const mm = String(dt.getMonth() + 1).padStart(2, "0");
	const dd = String(dt.getDate()).padStart(2, "0");
	return `${yy}-${mm}-${dd}`;
};

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

export const useRecurringInvoicesStore = defineStore("recurring_invoices", () => {
	const templates = ref<RecurringInvoiceRow[]>([]);
	// Lines keyed by recurring_invoice_id. The detail page loads its
	// template's lines on demand; this map keeps them cached so a
	// re-visit doesn't re-fetch.
	const linesById = ref<Map<number, RecurringInvoiceLineRow[]>>(new Map());

	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	// Multi-select status filter: "active" | "paused". Empty set =
	// show everything (no narrowing). Mirrors the chip-filter pattern
	// every other list page uses.
	type StatusKey = "active" | "paused";
	const statusFilters = ref<StatusKey[]>([]);
	const toggleStatusFilter = (s: StatusKey) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};
	const clearStatusFilters = () => {
		statusFilters.value = [];
	};

	// Multi-select frequency filter.
	const frequencyFilters = ref<RecurringFrequency[]>([]);
	const toggleFrequencyFilter = (f: RecurringFrequency) => {
		const idx = frequencyFilters.value.indexOf(f);
		if (idx === -1) frequencyFilters.value.push(f);
		else frequencyFilters.value.splice(idx, 1);
	};
	const clearFrequencyFilters = () => {
		frequencyFilters.value = [];
	};

	// "all" = no narrowing; otherwise the FK id of a single client.
	const clientFilter = ref<number | "all">("all");

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return templates.value.filter((row) => {
			if (statusFilters.value.length > 0) {
				const isPaused = row.is_paused === 1;
				const matchesActive = statusFilters.value.includes("active") && !isPaused;
				const matchesPaused = statusFilters.value.includes("paused") && isPaused;
				if (!matchesActive && !matchesPaused) return false;
			}
			if (frequencyFilters.value.length > 0 && !frequencyFilters.value.includes(row.frequency)) return false;
			if (clientFilter.value !== "all" && row.client_id !== clientFilter.value) return false;
			if (!q) return true;
			return (
				row.template_name.toLowerCase().includes(q)
				|| (row.client_name ?? "").toLowerCase().includes(q)
				|| (row.project_title ?? "").toLowerCase().includes(q)
			);
		});
	});

	// Templates ready to generate: not paused, next issue date is today
	// or in the past, and (if an end_date is set) the next_issue_date
	// is still inside the window.
	const pendingTemplates = computed<RecurringInvoiceRow[]>(() => {
		const today = todayISO();
		return templates.value.filter((t) => {
			if (t.is_paused === 1) return false;
			if (t.next_issue_date > today) return false;
			if (t.end_date !== null && t.next_issue_date > t.end_date) return false;
			return true;
		});
	});
	const pendingCount = computed(() => pendingTemplates.value.length);

	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			templates.value = await select<RecurringInvoiceRow>(
				"SELECT * FROM recurring_invoices ORDER BY datetime(created_at) DESC"
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

	const get = async (id: number): Promise<RecurringInvoiceRow | null> =>
		selectOne<RecurringInvoiceRow>("SELECT * FROM recurring_invoices WHERE id = ?", [id]);

	const getLines = async (recurringId: number): Promise<RecurringInvoiceLineRow[]> => {
		const rows = await select<RecurringInvoiceLineRow>(
			"SELECT * FROM recurring_invoice_lines WHERE recurring_invoice_id = ? ORDER BY position ASC, id ASC",
			[recurringId]
		);
		linesById.value.set(recurringId, rows);
		return rows;
	};

	// Resolve the default bank for a new template — same shape every
	// other create path uses. Returns null when the business has no
	// banks set up yet.
	const resolveDefaultBankId = async (): Promise<number | null> => {
		const banksStore = useBusinessBanksStore();
		await banksStore.ensureLoaded();
		return banksStore.defaultBank?.id ?? null;
	};

	const create = async (input: {
		template_name: string
		client: ClientSnapshot & { id: number }
		frequency: RecurringFrequency
		start_date: string
	}): Promise<number> => {
		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("create: settings not loaded");

		const snap = buildClientSnapshot(input.client);
		const bankId = await resolveDefaultBankId();
		const defaultVatBp = settings.default_vat_rate ?? 0;
		const defaultTerms = settings.default_payment_terms_days ?? 30;

		const result = await execute(
			`INSERT INTO recurring_invoices (
				template_name, is_paused, client_id, client_snapshot, client_name,
				frequency, start_date, next_issue_date, end_date,
				project_title, pricing_mode, vat_rate_basis_points, payment_terms_days,
				notes, business_bank_id, invoices_generated, last_generated_at
			) VALUES (?, 0, ?, ?, ?, ?, ?, ?, NULL, NULL, 'itemized', ?, ?, NULL, ?, 0, NULL)`,
			[
				input.template_name,
				input.client.id,
				snap,
				input.client.name,
				input.frequency,
				input.start_date,
				// Seed next_issue_date one frequency step after start_date.
				// "Start" reads as "when the subscription / contract began"
				// and "next issue" as "when the next bill fires" — same
				// mental model Stripe / Xero use. If the user wants the
				// first invoice ON the start date (e.g. rent due May 1
				// for a tenant who started May 1), they can edit
				// next_issue_date back manually on the detail page.
				advanceDate(input.start_date, input.frequency),
				defaultVatBp,
				defaultTerms,
				bankId
			]
		);
		if (result.lastInsertId === undefined) throw new Error("create: no lastInsertId");
		await load();
		return result.lastInsertId;
	};

	type RecurringUpdate = Partial<Pick<RecurringInvoiceRow, | "template_name" | "client_id" | "client_snapshot"
		| "frequency" | "start_date" | "next_issue_date" | "end_date"
		| "project_title" | "pricing_mode" | "bundle_subtotal_cents"
		| "vat_rate_basis_points"
		| "payment_terms_days" | "notes" | "business_bank_id">>;

	const UPDATABLE: ReadonlyArray<keyof RecurringUpdate> = [
		"template_name",
		"client_id",
		"client_snapshot",
		"frequency",
		"start_date",
		"next_issue_date",
		"end_date",
		"project_title",
		"pricing_mode",
		"bundle_subtotal_cents",
		"vat_rate_basis_points",
		"payment_terms_days",
		"notes",
		"business_bank_id"
	];

	const update = async (id: number, patch: RecurringUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		// Keep client_name denormalised column in sync if the snapshot
		// is being patched. Same pattern invoices uses post-0028.
		let extraSet = "";
		if (Object.hasOwn(patch, "client_snapshot")) {
			extraSet = ", client_name = ?";
			params.push(nameFromClientSnapshot(patch.client_snapshot ?? ""));
		}
		params.push(id);
		await execute(
			`UPDATE recurring_invoices SET ${setClause}${extraSet}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
	};

	const replaceLines = async (
		recurringId: number,
		lines: RecurringInvoiceLineDraft[]
	): Promise<void> => {
		await execute(
			"DELETE FROM recurring_invoice_lines WHERE recurring_invoice_id = ?",
			[recurringId]
		);
		for (let i = 0; i < lines.length; i++) {
			const l = lines[i];
			if (!l) continue;
			await execute(
				`INSERT INTO recurring_invoice_lines (
					recurring_invoice_id, position, item_label, description,
					quantity_milli, unit_price_cents, vat_rate_basis_points
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[
					recurringId,
					i,
					l.item_label ?? "",
					l.description ?? null,
					l.quantity_milli,
					l.unit_price_cents,
					l.vat_rate_basis_points
				]
			);
		}
		// Drop the cache for this template so the next getLines() refetches.
		linesById.value.delete(recurringId);
	};

	const togglePause = async (id: number): Promise<void> => {
		const row = await get(id);
		if (!row) return;
		const next = row.is_paused === 1 ? 0 : 1;
		await execute(
			"UPDATE recurring_invoices SET is_paused = ?, updated_at = datetime('now') WHERE id = ?",
			[next, id]
		);
		await load();
	};

	const remove = async (id: number): Promise<void> => {
		// recurring_invoice_lines cascades via FK ON DELETE CASCADE.
		await execute("DELETE FROM recurring_invoices WHERE id = ?", [id]);
		linesById.value.delete(id);
		await load();
	};

	// Materialise ONE template into a real draft invoice. Returns the
	// new invoice's id so callers (the bulk Generate modal) can
	// route to it if they want.
	//
	// Connection-pool note (see CLAUDE.md): all the writes here are
	// sequential auto-commits — no BEGIN/COMMIT from JS. If we crash
	// between inserting the invoice and advancing next_issue_date,
	// the next pending-generation pass will pick the template up
	// again and the user gets a duplicate draft. That's fine — drafts
	// are deletable.
	const generateOne = async (id: number): Promise<number> => {
		const template = await get(id);
		if (!template) throw new Error("generateOne: template not found");

		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("generateOne: settings not loaded");

		const lines = await select<RecurringInvoiceLineRow>(
			"SELECT * FROM recurring_invoice_lines WHERE recurring_invoice_id = ? ORDER BY position ASC, id ASC",
			[id]
		);

		const issue = todayISO();
		const due = addDays(issue, template.payment_terms_days);

		// Bank snapshot for the generated invoice — built from the
		// template's chosen bank's current row (so a label/account-number
		// edit on the bank flows into each generated invoice). Falls
		// back to the business default when the template's bank has
		// since been deleted.
		const banksStore = useBusinessBanksStore();
		await banksStore.ensureLoaded();
		const bankId = template.business_bank_id ?? banksStore.defaultBank?.id ?? null;
		const bankSnap = await banksStore.buildSnapshotForId(bankId);

		// Compute the generated invoice's totals.
		//   - Itemized: each line carries its own qty × price × VAT,
		//     totals roll up.
		//   - Bundle: lines are scope text only; the lump-sum amount
		//     lives on the template (bundle_subtotal_cents). VAT is
		//     the template-level rate. The single first line on the
		//     generated invoice carries the bundle amount as its
		//     price so the invoice's PDF + payment ledger work
		//     without special-casing bundle invoices downstream.
		const isBundle = template.pricing_mode === "bundle";
		let subtotal: number;
		let tax: number;
		let total: number;
		let computed: (RecurringInvoiceLineRow & ReturnType<typeof computeLineTotals>)[];
		if (isBundle) {
			subtotal = template.bundle_subtotal_cents;
			tax = bundleTaxCents(subtotal, template.vat_rate_basis_points);
			total = subtotal + tax;
			// Build a single "summary line" for the invoice carrying the
			// bundle amount. Falls back to project title / template name
			// for the item_label when the user didn't add any scope
			// lines. Multi-line scope from the template is collapsed
			// onto this one line's description field separated by
			// newlines so nothing is lost — invoice PDFs in bundle
			// mode render the description as scope copy anyway.
			const scopeDescription = lines.length === 0
				? null
				: lines.map((l) => {
					const head = l.item_label?.trim();
					const body = l.description?.trim();
					if (head && body) return `${head}\n${body}`;
					return head || body || null;
				}).filter((s) => s).join("\n\n") || null;
			const summaryLabel = (lines[0]?.item_label?.trim())
				|| template.project_title?.trim()
				|| template.template_name;
			computed = [{
				id: 0,
				recurring_invoice_id: template.id,
				position: 0,
				item_label: summaryLabel,
				description: scopeDescription,
				quantity_milli: 1000,
				unit_price_cents: subtotal,
				vat_rate_basis_points: template.vat_rate_basis_points,
				line_subtotal_cents: subtotal,
				line_tax_cents: tax,
				line_total_cents: total
			}];
		} else {
			computed = lines.map((l) => ({
				...l,
				...computeLineTotals(l.quantity_milli, l.unit_price_cents, l.vat_rate_basis_points)
			}));
			subtotal = computed.reduce((s, l) => s + l.line_subtotal_cents, 0);
			tax = computed.reduce((s, l) => s + l.line_tax_cents, 0);
			total = computed.reduce((s, l) => s + l.line_total_cents, 0);
		}

		const allocation = await allocateDocumentNumber("invoice");

		// Generated invoices start as DRAFT. The user reviews them on
		// /invoices before issuing. That's the safety net for edge
		// cases the template author didn't anticipate (rate change,
		// one-off discount, off-month special).
		const result = await execute(
			`INSERT INTO invoices (
				number, client_id, client_snapshot, client_name, source_quote_id,
				issue_date, due_date, status, pricing_mode, project_title,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				notes, prepared_by, bank_details_snapshot, business_bank_id
			) VALUES (?, ?, ?, ?, NULL, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				allocation.number,
				template.client_id,
				template.client_snapshot,
				template.client_name ?? nameFromClientSnapshot(template.client_snapshot),
				issue,
				due,
				template.pricing_mode,
				template.project_title ?? "",
				template.vat_rate_basis_points,
				subtotal,
				tax,
				total,
				template.notes,
				null,
				bankSnap,
				bankId
			]
		);
		if (result.lastInsertId === undefined) throw new Error("generateOne: no lastInsertId");
		const invoiceId = result.lastInsertId;

		// Clone each line verbatim. Template lines don't carry computed
		// totals (so a VAT rate edit on the template flows cleanly) —
		// we recomputed above and now persist those onto invoice_lines.
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
					l.item_label,
					l.description ?? "",
					l.quantity_milli,
					null,
					l.unit_price_cents,
					l.vat_rate_basis_points,
					l.line_subtotal_cents,
					l.line_tax_cents,
					l.line_total_cents
				]
			);
		}

		// Advance the template — bump next_issue_date by one frequency
		// step, increment the counter, stamp last_generated_at.
		const nextIssue = advanceDate(template.next_issue_date, template.frequency);
		await execute(
			`UPDATE recurring_invoices
			 SET next_issue_date = ?,
				 invoices_generated = invoices_generated + 1,
				 last_generated_at = datetime('now'),
				 updated_at = datetime('now')
			 WHERE id = ?`,
			[nextIssue, id]
		);

		// Refresh both stores so the UI updates immediately.
		await load();
		await useInvoicesStore().load().catch(() => { /* non-fatal */ });
		return invoiceId;
	};

	return {
		templates,
		linesById,
		loading,
		error,
		search,
		statusFilters,
		toggleStatusFilter,
		clearStatusFilters,
		frequencyFilters,
		toggleFrequencyFilter,
		clearFrequencyFilters,
		clientFilter,
		filtered,
		pendingTemplates,
		pendingCount,
		loaded,
		load,
		ensureLoaded,
		get,
		getLines,
		create,
		update,
		replaceLines,
		togglePause,
		remove,
		generateOne,
		buildClientSnapshot
	};
});
