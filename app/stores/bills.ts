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

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { computeLineTotals, sumCents } from "~/lib/money";
import { allocateDocumentNumber } from "~/lib/numbering";
import { useVouchersStore } from "~/stores/vouchers";

// Persisted on `bills.status` — the only two states the user sets
// directly. The richer enum below is the derived view the UI consumes.
export type BillPersistedStatus = "open" | "cancelled";

// Derived status — what list pages, badges, and filters see. Computed
// from the bill's persisted status + sum of linked payment vouchers +
// today's date vs due_date.
export type BillStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled";

export type PricingMode = "bundle" | "itemized";

export interface BillRow {
	id: number
	number: string
	vendor_id: number
	vendor_snapshot: string // JSON-serialised
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
	attachment_path: string | null
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

export type BillLineDraft = Omit<BillLineRow,	| "id" | "bill_id"
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
	const statusFilter = ref<BillStatus | "all" | "outstanding">("all");
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
	const derivedStatus = (bill: BillRow, now: string = todayISO()): BillStatus => {
		if (bill.status === "cancelled") return "cancelled";
		const paid = paidCentsFor(bill.id);
		if (paid >= bill.total_cents && bill.total_cents > 0) return "paid";
		if (bill.due_date < now) return "overdue";
		if (paid > 0) return "partial";
		return "unpaid";
	};

	const filtered = computed(() => {
		const today = todayISO();
		const q = search.value.trim().toLowerCase();
		return bills.value.filter((row) => {
			const ds = derivedStatus(row, today);
			if (statusFilter.value === "outstanding") {
				if (!["unpaid", "partial", "overdue"].includes(ds)) return false;
			} else if (statusFilter.value !== "all" && ds !== statusFilter.value) {
				return false;
			}
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
			let snapName = "";
			try {
				snapName = (JSON.parse(row.vendor_snapshot) as VendorSnapshot).name?.toLowerCase() ?? "";
			} catch { /* ignore */ }
			let catName = "";
			try {
				if (row.category_snapshot) {
					catName = (JSON.parse(row.category_snapshot) as { name: string }).name?.toLowerCase() ?? "";
				}
			} catch { /* ignore */ }
			return (
				row.number.toLowerCase().includes(q)
				|| snapName.includes(q)
				|| (row.vendor_invoice_number ?? "").toLowerCase().includes(q)
				|| catName.includes(q)
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

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			bills.value = await select<BillRow>(
				"SELECT * FROM bills ORDER BY datetime(created_at) DESC"
			);
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const get = async (id: number): Promise<BillRow | null> =>
		selectOne<BillRow>("SELECT * FROM bills WHERE id = ?", [id]);

	const getLines = async (billId: number): Promise<BillLineRow[]> =>
		select<BillLineRow>(
			"SELECT * FROM bill_lines WHERE bill_id = ? ORDER BY sort_order ASC, id ASC",
			[billId]
		);

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

	const createBill = async (input: { vendor: VendorSnapshot & { id: number } }): Promise<number> => {
		const issue = todayISO();
		const allocation = await allocateDocumentNumber("bill", issue);
		const snap = buildVendorSnapshot(input.vendor);
		// Default due_date = today (vendor probably wants payment "now"); user
		// can change it on the editor. We don't depend on company_settings here
		// because bill due dates are dictated by the vendor, not our terms.
		const result = await execute(
			`INSERT INTO bills (
				number, vendor_id, vendor_snapshot,
				issue_date, due_date, status, pricing_mode,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents
			) VALUES (?, ?, ?, ?, ?, 'open', 'bundle', 0, 0, 0, 0)`,
			[allocation.number, input.vendor.id, snap, issue, issue]
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
		| "category_id" | "category_snapshot" | "notes" | "attachment_path">>;

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
		"attachment_path"
	];

	const update = async (id: number, patch: BillUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(
			`UPDATE bills SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
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
		statusFilter,
		vendorFilter,
		categoryFilter,
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
