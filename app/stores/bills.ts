// Bills store. Vendor invoices we receive and need to pay.
//
// Status model
// ------------
// The DB only persists two states: 'open' (the default — the bill is
// active in the books) and 'cancelled' (the user has explicitly voided
// it). Every other state the UI shows — unpaid / partial / paid /
// overdue — is **derived** from the linked payment vouchers and the
// due_date.
//
// This makes the voucher ledger the single source of truth for cash
// flow. There's no `paid_cents` column on `bills` any more: we sum the
// `amount_cents` on payment vouchers where `related_bill_id` matches.
// Recording a payment is just creating a voucher — see
// app/pages/bills/[id].vue's "Record payment" button which routes to
// /vouchers/new?bill=N. Editing or deleting a voucher automatically
// reflects on the bill's derived presentation; no cache to keep in sync.

import type { PricingMode } from "~/stores/quotes";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { billDerivedFrom, deriveBillStatus } from "~/lib/derived-status";
import { computeLineTotals, sumCents } from "~/lib/money";
import { allocateDocumentNumber, allocateSpecificDocumentNumber } from "~/lib/numbering";
import { purgeDocumentAttachments } from "~/stores/document_attachments";
import { useVouchersStore } from "~/stores/vouchers";

// Persisted on `bills.status` — the only two states the user sets
// directly. The richer enum below is the derived view the UI consumes.
export type BillPersistedStatus = "open" | "cancelled";

// Derived status — what list pages, badges, and filters see. Computed
// from the bill's persisted status + sum of linked payment vouchers +
// today's date vs due_date.
export type BillStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled";

export interface BillRow {
	id: number
	number: string
	vendor_id: number
	vendor_snapshot: string // JSON-serialised
	/// Denormalised from `vendor_snapshot.name` and the category
	/// snapshot — set whenever the snapshot is set so the list page
	/// can render + sort + search without parsing JSON. See migration
	/// 0028 (backfilled from the snapshots on existing rows).
	vendor_name: string
	category_name: string | null
	category_color: string | null
	category_icon: string | null
	vendor_invoice_number: string | null
	issue_date: string
	due_date: string
	/// The persisted status (open|cancelled). Use derivedStatus(bill)
	/// below for the user-visible payment state.
	status: BillPersistedStatus
	pricing_mode: PricingMode
	vat_rate_basis_points: number
	subtotal_cents: number
	tax_cents: number
	total_cents: number
	category_id: number | null
	category_snapshot: string | null
	notes: string | null
	/**
	 * Per-document override of the PDF's big header. Null/empty = the
	 * hardcoded default ("BILL"); when set, the PDF builder
	 * upper-cases this verbatim for the header.
	 */
	title_override: string | null
	created_at: string
	updated_at: string
}

// Frozen copy of the vendor info as it was at bill-creation time.
// Mirrors quotes/invoices client_snapshot — keeps historical bills
// rendering with the vendor address they had on the day, even if the
// vendors row is later edited or archived.
export interface VendorSnapshot {
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

export interface BillLineRow {
	id: number
	bill_id: number
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
export type BillLineDraft = Omit<BillLineRow,	| "id" | "bill_id" | "sort_order"
	| "line_subtotal_cents" | "line_tax_cents" | "line_total_cents">;

const todayISO = (): string => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const useBillsStore = defineStore("bills", () => {
	const bills = ref<BillRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	// Multi-select status filter. Empty = show everything. The previous
	// 'outstanding' sentinel is no longer needed — the user just ticks
	// unpaid + partial + overdue to express it.
	const statusFilters = ref<BillStatus[]>([]);
	const toggleStatusFilter = (s: BillStatus) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};
	const clearStatusFilters = () => {
		statusFilters.value = [];
	};
	const vendorFilter = ref<number | "all">("all");
	const categoryFilter = ref<number | "all" | "uncategorised">("all");
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
	// Each helper reads off the vouchers store. We deliberately don't
	// cache anything on the bill row — the voucher ledger is small
	// (single-user app) and Pinia/Vue tracks the dependency for us, so
	// every paid_cents read stays fresh through every voucher edit.

	/// All payment vouchers (voucher_type='payment') linked to this bill,
	/// ordered most-recent first to match the detail page's ledger view.
	const linkedPayments = (billId: number) => {
		const vouchers = useVouchersStore();
		return vouchers.vouchers
			.filter((v) => v.related_bill_id === billId && v.voucher_type === "payment")
			.slice()
			.sort((a, b) => b.voucher_date.localeCompare(a.voucher_date) || b.id - a.id);
	};

	/// Total recorded payments against a bill, in cents. Sums voucher
	/// amounts; safe when the vouchers store hasn't loaded yet (returns 0).
	const paidCentsFor = (billId: number): number =>
		linkedPayments(billId).reduce((sum, v) => sum + v.amount_cents, 0);

	const balanceCentsFor = (bill: BillRow): number =>
		Math.max(0, bill.total_cents - paidCentsFor(bill.id));

	/// User-visible status from persisted status + payment sum + due date.
	/// 'cancelled' is sticky — never overridden by payment math. Otherwise
	/// 'paid' takes precedence over 'overdue' (a paid-late bill is paid),
	/// then 'overdue', then 'partial', then 'unpaid'.
	const derivedStatus = (bill: BillRow, now: string = todayISO()): BillStatus =>
		deriveBillStatus(bill.status, paidCentsFor(bill.id), bill.total_cents, bill.due_date, now);

	const filtered = computed(() => {
		const today = todayISO();
		const q = search.value.trim().toLowerCase();
		return bills.value.filter((row) => {
			const ds = derivedStatus(row, today);
			if (statusFilters.value.length > 0 && !statusFilters.value.includes(ds)) return false;
			if (vendorFilter.value !== "all" && row.vendor_id !== vendorFilter.value) return false;
			if (categoryFilter.value === "uncategorised") {
				if (row.category_id !== null) return false;
			} else if (categoryFilter.value !== "all" && row.category_id !== categoryFilter.value) {
				return false;
			}
			if (issuedFrom.value && row.issue_date < issuedFrom.value) return false;
			if (issuedTo.value && row.issue_date > issuedTo.value) return false;
			if (dueFrom.value && row.due_date < dueFrom.value) return false;
			if (dueTo.value && row.due_date > dueTo.value) return false;
			if (!q) return true;
			// Search the denormalised vendor_name + category_name columns
			// (migration 0028) so no JSON.parse runs per row.
			return (
				row.number.toLowerCase().includes(q)
				|| row.vendor_name.toLowerCase().includes(q)
				|| (row.vendor_invoice_number ?? "").toLowerCase().includes(q)
				|| (row.category_name ?? "").toLowerCase().includes(q)
			);
		});
	});

	const outstandingTotal = computed(() => {
		const today = todayISO();
		let sum = 0;
		for (const r of bills.value) {
			const ds = derivedStatus(r, today);
			if (ds === "unpaid" || ds === "partial" || ds === "overdue") {
				sum += balanceCentsFor(r);
			}
		}
		return sum;
	});

	const overdueCount = computed(() => {
		const today = todayISO();
		return bills.value.filter((r) => derivedStatus(r, today) === "overdue").length;
	});

	// Packaged filter snapshot for the server-paginated list page.
	const listFilters = computed(() => ({
		search: search.value,
		statusFilters: statusFilters.value,
		vendorFilter: vendorFilter.value,
		categoryFilter: categoryFilter.value,
		issuedFrom: issuedFrom.value,
		issuedTo: issuedTo.value,
		dueFrom: dueFrom.value,
		dueTo: dueTo.value
	}));

	// Grand total count + global outstanding in one wrapped query over the
	// derived-status subquery.
	const fetchHeaderStats = async (): Promise<{ total: number, outstandingCents: number, overdueCount: number }> => {
		const rows = await select<{ total: number, outstanding: number, overdue: number }>(
			`SELECT COUNT(*) AS total,
			        COALESCE(SUM(CASE WHEN _status IN ('unpaid','partial','overdue') THEN _balance ELSE 0 END), 0) AS outstanding,
			        SUM(CASE WHEN _status = 'overdue' THEN 1 ELSE 0 END) AS overdue
			 FROM ${billDerivedFrom(todayISO())}`
		);
		return {
			total: rows[0]?.total ?? 0,
			outstandingCents: rows[0]?.outstanding ?? 0,
			overdueCount: rows[0]?.overdue ?? 0
		};
	};

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
			bills.value = await select<BillRow>(
				"SELECT * FROM bills ORDER BY datetime(created_at) DESC"
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

	const get = async (id: number): Promise<BillRow | null> =>
		selectOne<BillRow>("SELECT * FROM bills WHERE id = ?", [id]);

	const getLines = async (billId: number): Promise<BillLineRow[]> =>
		select<BillLineRow>(
			"SELECT * FROM bill_lines WHERE bill_id = ? ORDER BY sort_order ASC, id ASC",
			[billId]
		);

	// Pull the name field out of a stored vendor_snapshot JSON. Only
	// the `update()` path uses this — for the Refresh-vendor-snapshot
	// button on the detail page, which is the one flow that mutates
	// the snapshot post-create. createBill passes the vendor name
	// directly from its input.
	const nameFromVendorSnapshot = (snap: string): string => {
		try {
			return (JSON.parse(snap) as { name?: string }).name ?? "";
		} catch {
			return "";
		}
	};
	// Same idea for the category trio (name / color / icon) the list
	// page renders as a swatch+icon+label cell. Returns null fields
	// when the bill has no category attached.
	const categoryMetaFromSnapshot = (
		snap: string | null
	): { name: string | null, color: string | null, icon: string | null } => {
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
	};

	// Build a snapshot from a vendor row, freezing the vendor's identity at
	// bill-creation time. Same shape as the client snapshot used on
	// quotes/invoices.
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

	const createBill = async (input: {
		vendor: VendorSnapshot & { id: number }
		/**
			 Override `issue_date` (e.g. when launched from the calendar
			with a specific day in mind). Defaults to today. `due_date`
			matches `issue_date` on create — the user typically adjusts
			it on the editor based on the vendor's terms.
			*/
		issue_date?: string
		/**
			 Override the auto-allocated sequence number. Used by the New
			modal's editable Number field so the user can fill a gap left
			by an earlier deletion. Validates uniqueness before insert.
			*/
		sequence?: number
	}): Promise<number> => {
		const issue = input.issue_date ?? todayISO();
		const due = issue;
		const allocation = input.sequence !== undefined
			? await allocateSpecificDocumentNumber("bill", input.sequence)
			: await allocateDocumentNumber("bill");
		const snap = buildVendorSnapshot(input.vendor);
		// Default due_date = today (vendor probably wants payment "now"); user
		// can change it on the editor. We don't depend on company_settings here
		// because bill due dates are dictated by the vendor, not our terms.
		const result = await execute(
			`INSERT INTO bills (
				number, vendor_id, vendor_snapshot, vendor_name,
				issue_date, due_date, status, pricing_mode,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents
			) VALUES (?, ?, ?, ?, ?, ?, 'open', 'bundle', 0, 0, 0, 0)`,
			[allocation.number, input.vendor.id, snap, input.vendor.name, issue, due]
		);
		if (result.lastInsertId === undefined) throw new Error("createBill: no lastInsertId");
		await load();
		return result.lastInsertId;
	};

	type BillUpdate = Partial<Pick<BillRow, | "vendor_id" | "vendor_snapshot" | "vendor_invoice_number"
		| "issue_date" | "due_date"
		| "pricing_mode"
		| "vat_rate_basis_points"
		| "subtotal_cents" | "tax_cents" | "total_cents"
		| "category_id" | "category_snapshot" | "notes"
		| "title_override">>;

	const UPDATABLE: ReadonlyArray<keyof BillUpdate> = [
		"vendor_id",
		"vendor_snapshot",
		"vendor_invoice_number",
		"issue_date",
		"due_date",
		"pricing_mode",
		"vat_rate_basis_points",
		"subtotal_cents",
		"tax_cents",
		"total_cents",
		"category_id",
		"category_snapshot",
		"notes",
		"title_override"
	];

	const update = async (id: number, patch: BillUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		// Keep the denormalised columns in lockstep with the snapshots
		// whenever the patch touches them. vendor_snapshot is touched by
		// the Refresh-vendor-snapshot button on the detail page;
		// category_snapshot is touched whenever the user picks a
		// different category.
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
			`UPDATE bills SET ${setClause}${extraSet}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
	};

	const replaceLines = async (
		billId: number,
		lines: BillLineDraft[]
	): Promise<{ subtotal_cents: number, tax_cents: number, total_cents: number }> => {
		const computed = lines.map((l) => ({
			...l,
			...computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points)
		}));
		await execute("DELETE FROM bill_lines WHERE bill_id = ?", [billId]);
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

	/// Toggle the 'cancelled' state. There's no FSM any more — cancel
	/// and re-open are the only persisted transitions, and either is
	/// always allowed. Note that linked payment vouchers are NOT
	/// touched: cancelling a bill keeps the historical money-out
	/// record intact (the user can manually delete the vouchers if
	/// the cancellation was a real refund).
	const setCancelled = async (id: number, cancelled: boolean): Promise<void> => {
		// Refuse to cancel a bill that's already covered by payment
		// vouchers — cancelling would leave money paid out against a
		// voided bill, which is a books inconsistency. The user must
		// delete the relevant payment vouchers first.
		if (cancelled) {
			const row = await get(id);
			if (row && paidCentsFor(id) >= row.total_cents && row.total_cents > 0) {
				throw new Error(
					"This bill is fully paid. Delete the payment vouchers first, then cancel."
				);
			}
		}
		await execute(
			"UPDATE bills SET status = ?, updated_at = datetime('now') WHERE id = ?",
			[cancelled ? "cancelled" : "open", id]
		);
		await load();
	};

	// Universal delete — removes a bill regardless of payment state. Used by
	// the typed-name confirm flow on the detail page when the user genuinely
	// needs to scrub a record. `vouchers.related_bill_id` has no ON DELETE
	// clause, so we null it out first; otherwise the DELETE would fail with
	// an FK violation when payment vouchers reference this bill. The vouchers
	// themselves stay (they record real money flow) — they just lose their
	// link back to the now-deleted bill.
	const remove = async (id: number): Promise<void> => {
		const row = await get(id);
		if (!row) return;
		await execute(
			"UPDATE vouchers SET related_bill_id = NULL WHERE related_bill_id = ?",
			[id]
		);
		await execute("DELETE FROM bills WHERE id = ?", [id]);
		await purgeDocumentAttachments("bill", id);
		await load();
		// Refresh vouchers too so the un-linked rows reflect immediately
		// in the vouchers list.
		await useVouchersStore().load().catch(() => { /* non-fatal */ });
	};

	return {
		bills,
		loading,
		error,
		search,
		statusFilters,
		toggleStatusFilter,
		clearStatusFilters,
		vendorFilter,
		categoryFilter,
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
		createBill,
		update,
		replaceLines,
		setCancelled,
		remove,
		buildVendorSnapshot,
		// Derived payment helpers — read these instead of the old paid_cents
		// column. They live on the store so any consumer (list page, detail
		// page, dashboard, PDF builder) shares the same derivation.
		linkedPayments,
		paidCentsFor,
		balanceCentsFor,
		derivedStatus
	};
});
