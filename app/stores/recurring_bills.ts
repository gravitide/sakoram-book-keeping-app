// Recurring bills store. Vendor-side mirror of recurring_invoices —
// tracks bill TEMPLATES that get materialised into real bills on a
// user-initiated cadence.
//
// A recurring bill is NOT an issued bill. It's a template + a
// "next_issue_date" pointer that the user clicks to advance. Each click
// of "Generate" inserts a fresh row into `bills` (with a new allocated
// number, today's issue_date, due_date derived from the template's
// payment_terms_days) and advances next_issue_date by one frequency
// step.
//
// Generation is deliberately user-initiated — same UX convention as
// recurring invoices. The /recurring-bills page surfaces a pending
// count (templates where is_paused=0 AND next_issue_date <= today AND
// the schedule hasn't reached end_date) and the user clicks through a
// modal to confirm + materialise.
//
// Lines are stored in a sibling table `recurring_bill_lines` with the
// same simpler shape recurring_invoice_lines uses: no per-line
// computed totals (subtotal/tax/total_cents) — those are recomputed at
// generation time so a VAT rate or unit-price edit on the template
// flows into the next generated bill cleanly.
//
// Bills don't have a 'draft' state — generated bills land in status
// 'unpaid' (the derived view of the persisted 'open' status with zero
// payments). See app/stores/bills.ts for the full lifecycle.

import type { VendorSnapshot } from "~/stores/bills";
import type { PricingMode } from "~/stores/quotes";
import type { RecurringFrequency } from "~/stores/recurring_invoices";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { computeLineTotals } from "~/lib/money";
import { allocateDocumentNumber } from "~/lib/numbering";
import { useBillCategoriesStore } from "~/stores/bill_categories";
import { useBillsStore } from "~/stores/bills";
// RecurringFrequency + advanceDate are owned by the recurring_invoices store
// (single source of truth) — importing them here avoids duplicate auto-imports.
import { advanceDate } from "~/stores/recurring_invoices";
import { useSettingsStore } from "~/stores/settings";

export interface RecurringBillRow {
	id: number
	template_name: string
	is_paused: number // 0 or 1 (SQLite has no native bool)
	vendor_id: number
	vendor_snapshot: string
	/// Denormalised from vendor_snapshot.name. Set whenever the
	/// snapshot is written so the list page can sort + search without
	/// a JSON parse per row.
	vendor_name: string | null
	/// Optional bill category. Mirrors bills.category_id; the trio of
	/// denormalised columns below stay in lockstep with the snapshot.
	category_id: number | null
	category_snapshot: string | null
	category_name: string | null
	category_color: string | null
	category_icon: string | null
	frequency: RecurringFrequency
	start_date: string
	next_issue_date: string
	end_date: string | null
	pricing_mode: PricingMode
	/// Bundle-mode lump-sum amount. Ignored when pricing_mode is
	/// 'itemized' (totals roll up from line qty × price × VAT).
	bundle_subtotal_cents: number
	vat_rate_basis_points: number
	payment_terms_days: number
	notes: string | null
	bills_generated: number
	last_generated_at: string | null
	created_at: string
	updated_at: string
}

export interface RecurringBillLineRow {
	id: number
	recurring_bill_id: number
	position: number
	item_label: string
	description: string | null
	quantity_milli: number
	unit_price_cents: number
	vat_rate_basis_points: number
}

// Line shape the editor + create flow use. `position` is derived from
// the array index at write time so callers don't pass it.
export interface RecurringBillLineDraft {
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

function nameFromVendorSnapshot(snap: string): string {
	try {
		return (JSON.parse(snap) as { name?: string }).name ?? "";
	} catch {
		return "";
	}
}

function categoryMetaFromSnapshot(
	snap: string | null
): { name: string | null, color: string | null, icon: string | null } {
	if (!snap) return { name: null, color: null, icon: null };
	try {
		const o = JSON.parse(snap) as { name?: string, color?: string, icon?: string };
		return {
			name: o.name ?? null,
			color: o.color ?? null,
			icon: o.icon ?? null
		};
	} catch {
		return { name: null, color: null, icon: null };
	}
}

const buildVendorSnapshot = (
	v: { name: string, contact_person?: string | null, email?: string | null, phone?: string | null, address_line1?: string | null, address_line2?: string | null, city?: string | null, postal_code?: string | null, country?: string | null, tax_id?: string | null }
): string => JSON.stringify({
	name: v.name,
	contact_person: v.contact_person ?? null,
	email: v.email ?? null,
	phone: v.phone ?? null,
	address_line1: v.address_line1 ?? null,
	address_line2: v.address_line2 ?? null,
	city: v.city ?? null,
	postal_code: v.postal_code ?? null,
	country: v.country ?? null,
	tax_id: v.tax_id ?? null
} satisfies VendorSnapshot);

export const useRecurringBillsStore = defineStore("recurring_bills", () => {
	const templates = ref<RecurringBillRow[]>([]);
	// Lines keyed by recurring_bill_id. The detail page loads its
	// template's lines on demand; this map keeps them cached so a
	// re-visit doesn't re-fetch.
	const linesById = ref<Map<number, RecurringBillLineRow[]>>(new Map());

	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	// Multi-select status filter: "active" | "paused". Empty set =
	// show everything (no narrowing).
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

	// "all" = no narrowing; otherwise the FK id of a single vendor.
	const vendorFilter = ref<number | "all">("all");
	// Same shape bills uses — "uncategorised" sentinel for templates
	// without a category_id.
	const categoryFilter = ref<number | "all" | "uncategorised">("all");

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
			if (vendorFilter.value !== "all" && row.vendor_id !== vendorFilter.value) return false;
			if (categoryFilter.value === "uncategorised") {
				if (row.category_id !== null) return false;
			} else if (categoryFilter.value !== "all" && row.category_id !== categoryFilter.value) {
				return false;
			}
			if (!q) return true;
			return (
				row.template_name.toLowerCase().includes(q)
				|| (row.vendor_name ?? "").toLowerCase().includes(q)
				|| (row.category_name ?? "").toLowerCase().includes(q)
			);
		});
	});

	// Templates ready to generate: not paused, next issue date is today
	// or in the past, and (if an end_date is set) the next_issue_date
	// is still inside the window.
	const pendingTemplates = computed<RecurringBillRow[]>(() => {
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
			templates.value = await select<RecurringBillRow>(
				"SELECT * FROM recurring_bills ORDER BY datetime(created_at) DESC"
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

	const get = async (id: number): Promise<RecurringBillRow | null> =>
		selectOne<RecurringBillRow>("SELECT * FROM recurring_bills WHERE id = ?", [id]);

	const getLines = async (recurringId: number): Promise<RecurringBillLineRow[]> => {
		const rows = await select<RecurringBillLineRow>(
			"SELECT * FROM recurring_bill_lines WHERE recurring_bill_id = ? ORDER BY position ASC, id ASC",
			[recurringId]
		);
		linesById.value.set(recurringId, rows);
		return rows;
	};

	const create = async (input: {
		template_name: string
		vendor: VendorSnapshot & { id: number }
		frequency: RecurringFrequency
		start_date: string
	}): Promise<number> => {
		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("create: settings not loaded");

		const snap = buildVendorSnapshot(input.vendor);
		const defaultVatBp = settings.default_vat_rate ?? 0;
		// Bills typically have terms set by the vendor — default to 30
		// to mirror the invoice-side default. The user adjusts on the
		// detail page if their vendor offers different terms.
		const defaultTerms = 30;

		const result = await execute(
			`INSERT INTO recurring_bills (
				template_name, is_paused, vendor_id, vendor_snapshot, vendor_name,
				category_id, category_snapshot, category_name, category_color, category_icon,
				frequency, start_date, next_issue_date, end_date,
				pricing_mode, bundle_subtotal_cents, vat_rate_basis_points,
				payment_terms_days, notes, bills_generated, last_generated_at
			) VALUES (?, 0, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, 'bundle', 0, ?, ?, NULL, 0, NULL)`,
			[
				input.template_name,
				input.vendor.id,
				snap,
				input.vendor.name,
				input.frequency,
				input.start_date,
				// Seed next_issue_date one frequency step after start_date.
				// "Start" reads as "when the recurring liability began"
				// and "next issue" as "when the next bill fires". If the
				// user wants the first bill ON the start date, they can
				// edit next_issue_date back manually on the detail page.
				advanceDate(input.start_date, input.frequency),
				defaultVatBp,
				defaultTerms
			]
		);
		if (result.lastInsertId === undefined) throw new Error("create: no lastInsertId");
		await load();
		return result.lastInsertId;
	};

	type RecurringUpdate = Partial<Pick<RecurringBillRow, | "template_name" | "vendor_id" | "vendor_snapshot"
		| "category_id" | "category_snapshot"
		| "frequency" | "start_date" | "next_issue_date" | "end_date"
		| "pricing_mode" | "bundle_subtotal_cents"
		| "vat_rate_basis_points"
		| "payment_terms_days" | "notes">>;

	const UPDATABLE: ReadonlyArray<keyof RecurringUpdate> = [
		"template_name",
		"vendor_id",
		"vendor_snapshot",
		"category_id",
		"category_snapshot",
		"frequency",
		"start_date",
		"next_issue_date",
		"end_date",
		"pricing_mode",
		"bundle_subtotal_cents",
		"vat_rate_basis_points",
		"payment_terms_days",
		"notes"
	];

	const update = async (id: number, patch: RecurringUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		// Keep the denormalised columns in lockstep with the snapshots
		// whenever the patch touches them. Same pattern bills.ts uses.
		const extras: string[] = [];
		if (Object.hasOwn(patch, "vendor_snapshot")) {
			extras.push("vendor_name = ?");
			params.push(nameFromVendorSnapshot(patch.vendor_snapshot ?? ""));
		}
		if (Object.hasOwn(patch, "category_snapshot")) {
			const meta = categoryMetaFromSnapshot(patch.category_snapshot ?? null);
			extras.push("category_name = ?", "category_color = ?", "category_icon = ?");
			params.push(meta.name, meta.color, meta.icon);
		}
		const extraSet = extras.length > 0 ? `, ${extras.join(", ")}` : "";
		params.push(id);
		await execute(
			`UPDATE recurring_bills SET ${setClause}${extraSet}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
	};

	const replaceLines = async (
		recurringId: number,
		lines: RecurringBillLineDraft[]
	): Promise<void> => {
		await execute(
			"DELETE FROM recurring_bill_lines WHERE recurring_bill_id = ?",
			[recurringId]
		);
		for (let i = 0; i < lines.length; i++) {
			const l = lines[i];
			if (!l) continue;
			await execute(
				`INSERT INTO recurring_bill_lines (
					recurring_bill_id, position, item_label, description,
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
			"UPDATE recurring_bills SET is_paused = ?, updated_at = datetime('now') WHERE id = ?",
			[next, id]
		);
		await load();
	};

	const remove = async (id: number): Promise<void> => {
		// recurring_bill_lines cascades via FK ON DELETE CASCADE.
		await execute("DELETE FROM recurring_bills WHERE id = ?", [id]);
		linesById.value.delete(id);
		await load();
	};

	// Materialise ONE template into a real bill. Returns the new bill's
	// id so callers (the bulk Generate modal) can route to it if they
	// want.
	//
	// Connection-pool note (see CLAUDE.md): all the writes here are
	// sequential auto-commits — no BEGIN/COMMIT from JS. If we crash
	// between inserting the bill and advancing next_issue_date, the
	// next pending-generation pass will pick the template up again and
	// the user gets a duplicate. That's fine — bills are deletable.
	const generateOne = async (id: number): Promise<number> => {
		const template = await get(id);
		if (!template) throw new Error("generateOne: template not found");

		const settingsStore = useSettingsStore();
		await settingsStore.ensureLoaded();
		const settings = settingsStore.settings;
		if (!settings) throw new Error("generateOne: settings not loaded");

		const lines = await select<RecurringBillLineRow>(
			"SELECT * FROM recurring_bill_lines WHERE recurring_bill_id = ? ORDER BY position ASC, id ASC",
			[id]
		);

		const issue = todayISO();
		const due = addDays(issue, template.payment_terms_days);

		// Compute the generated bill's totals.
		//   - Itemized: each line carries its own qty × price × VAT,
		//     totals roll up.
		//   - Bundle: lines are scope text only; the lump-sum amount
		//     lives on the template (bundle_subtotal_cents). VAT is
		//     the template-level rate. The single first line on the
		//     generated bill carries the bundle amount as its price so
		//     the bill's PDF + payment ledger work without
		//     special-casing bundle bills downstream.
		const isBundle = template.pricing_mode === "bundle";
		let subtotal: number;
		let tax: number;
		let total: number;
		let computed: (RecurringBillLineRow & ReturnType<typeof computeLineTotals>)[];
		if (isBundle) {
			subtotal = template.bundle_subtotal_cents;
			tax = Math.round((subtotal * template.vat_rate_basis_points) / 10000);
			total = subtotal + tax;
			// Build a single "summary line" for the bill carrying the
			// bundle amount. Falls back to template name for the
			// item_label when the user didn't add any scope lines.
			const scopeDescription = lines.length === 0
				? null
				: lines.map((l) => {
					const head = l.item_label?.trim();
					const body = l.description?.trim();
					if (head && body) return `${head}\n${body}`;
					return head || body || null;
				}).filter((s) => s).join("\n\n") || null;
			const summaryLabel = (lines[0]?.item_label?.trim())
				|| template.template_name;
			computed = [{
				id: 0,
				recurring_bill_id: template.id,
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

		const allocation = await allocateDocumentNumber("bill", issue);

		// Generated bills land in status 'open' (the persisted state)
		// which the bills store derives as 'unpaid' until payments come
		// in. Bills don't have a 'draft' state — the user reviews the
		// auto-generated row on /bills and either records a payment or
		// edits the amount.
		const categoriesStore = useBillCategoriesStore();
		await categoriesStore.ensureLoaded();
		// Resolve the denormalised category trio from the snapshot the
		// template carries. INSERT into bills with the same shape
		// bills.createBill builds.
		const categoryMeta = categoryMetaFromSnapshot(template.category_snapshot);

		const result = await execute(
			`INSERT INTO bills (
				number, vendor_id, vendor_snapshot, vendor_name,
				issue_date, due_date, status, pricing_mode,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents,
				category_id, category_snapshot, category_name, category_color, category_icon,
				notes
			) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				allocation.number,
				template.vendor_id,
				template.vendor_snapshot,
				template.vendor_name ?? nameFromVendorSnapshot(template.vendor_snapshot),
				issue,
				due,
				template.pricing_mode,
				template.vat_rate_basis_points,
				subtotal,
				tax,
				total,
				template.category_id,
				template.category_snapshot,
				categoryMeta.name,
				categoryMeta.color,
				categoryMeta.icon,
				template.notes
			]
		);
		if (result.lastInsertId === undefined) throw new Error("generateOne: no lastInsertId");
		const billId = result.lastInsertId;

		// Clone each line verbatim. Template lines don't carry computed
		// totals (so a VAT rate edit on the template flows cleanly) —
		// we recomputed above and now persist those onto bill_lines.
		for (let i = 0; i < computed.length; i++) {
			const l = computed[i];
			if (!l) continue;
			await execute(
				`INSERT INTO bill_lines (
					bill_id, sort_order, item_label, description,
					quantity_milli, unit, unit_price_cents, tax_rate_basis_points,
					line_subtotal_cents, line_tax_cents, line_total_cents
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					billId,
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
			`UPDATE recurring_bills
			 SET next_issue_date = ?,
				 bills_generated = bills_generated + 1,
				 last_generated_at = datetime('now'),
				 updated_at = datetime('now')
			 WHERE id = ?`,
			[nextIssue, id]
		);

		// Refresh both stores so the UI updates immediately.
		await load();
		await useBillsStore().load().catch(() => { /* non-fatal */ });
		return billId;
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
		vendorFilter,
		categoryFilter,
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
		buildVendorSnapshot
	};
});
