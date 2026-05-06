// Bills store. Vendor invoices we receive and need to pay.
//
// Status flow (no draft state — bills come from outside, the moment we
// record one it's already "issued" by the vendor):
//   unpaid    → partial | paid | overdue | cancelled
//   partial   → paid | overdue | cancelled
//   overdue   → partial | paid | cancelled
//   paid      → (terminal)
//   cancelled → (terminal)
//
// Unlike invoices we don't keep a payment ledger here — the spec stores
// only `paid_cents` on the bill itself, and that's plenty for tracking
// what we owe. If a user wants individual payment receipts they create
// vouchers (Phase 5 too).

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { computeLineTotals, sumCents } from "~/lib/money";
import { allocateDocumentNumber } from "~/lib/numbering";

export type BillStatus = "unpaid" | "partial" | "paid" | "overdue" | "cancelled";
export type PricingMode = "bundle" | "itemized";

export interface BillRow {
	id: number
	number: string
	vendor_name: string
	vendor_tax_id: string | null
	vendor_address: string | null
	vendor_invoice_number: string | null
	issue_date: string
	due_date: string
	status: BillStatus
	pricing_mode: PricingMode
	vat_rate_basis_points: number
	subtotal_cents: number
	tax_cents: number
	total_cents: number
	paid_cents: number
	category: string | null
	notes: string | null
	attachment_path: string | null
	created_at: string
	updated_at: string
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

const STATUS_TRANSITIONS: Record<BillStatus, BillStatus[]> = {
	unpaid: ["partial", "paid", "overdue", "cancelled"],
	partial: ["paid", "overdue", "cancelled"],
	overdue: ["partial", "paid", "cancelled"],
	paid: [],
	cancelled: []
};

export const canTransition = (from: BillStatus, to: BillStatus): boolean =>
	STATUS_TRANSITIONS[from]?.includes(to) ?? false;

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

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return bills.value.filter((row) => {
			if (statusFilter.value === "outstanding") {
				if (!["unpaid", "partial", "overdue"].includes(row.status)) return false;
			} else if (statusFilter.value !== "all" && row.status !== statusFilter.value) {
				return false;
			}
			if (!q) return true;
			return (
				row.number.toLowerCase().includes(q)
				|| row.vendor_name.toLowerCase().includes(q)
				|| (row.vendor_invoice_number ?? "").toLowerCase().includes(q)
				|| (row.category ?? "").toLowerCase().includes(q)
			);
		});
	});

	const outstandingTotal = computed(() => {
		let sum = 0;
		for (const r of bills.value) {
			if (r.status === "unpaid" || r.status === "partial" || r.status === "overdue") {
				sum += Math.max(0, r.total_cents - r.paid_cents);
			}
		}
		return sum;
	});

	const overdueCount = computed(() =>
		bills.value.filter((r) => r.status === "overdue").length
	);

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

	const createBill = async (input: { vendor_name: string }): Promise<number> => {
		const issue = todayISO();
		const allocation = await allocateDocumentNumber("bill", issue);
		// Default due_date = today (vendor probably wants payment "now"); user
		// can change it on the editor. We don't depend on company_settings here
		// because bill due dates are dictated by the vendor, not our terms.
		const result = await execute(
			`INSERT INTO bills (
				number, vendor_name,
				issue_date, due_date, status, pricing_mode,
				vat_rate_basis_points, subtotal_cents, tax_cents, total_cents, paid_cents
			) VALUES (?, ?, ?, ?, 'unpaid', 'bundle', 0, 0, 0, 0, 0)`,
			[allocation.number, input.vendor_name, issue, issue]
		);
		if (result.lastInsertId === undefined) throw new Error("createBill: no lastInsertId");
		await load();
		return result.lastInsertId;
	};

	type BillUpdate = Partial<Pick<BillRow, | "vendor_name" | "vendor_tax_id" | "vendor_address" | "vendor_invoice_number"
		| "issue_date" | "due_date"
		| "pricing_mode"
		| "vat_rate_basis_points"
		| "subtotal_cents" | "tax_cents" | "total_cents"
		| "category" | "notes" | "attachment_path">>;

	const UPDATABLE: ReadonlyArray<keyof BillUpdate> = [
		"vendor_name",
		"vendor_tax_id",
		"vendor_address",
		"vendor_invoice_number",
		"issue_date",
		"due_date",
		"pricing_mode",
		"vat_rate_basis_points",
		"subtotal_cents",
		"tax_cents",
		"total_cents",
		"category",
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

	// Decide the next status after a paid_cents change.
	const statusAfterPayment = (
		current: BillStatus,
		totalCents: number,
		paidCents: number
	): BillStatus => {
		if (current === "cancelled") return current;
		if (paidCents <= 0) return "unpaid";
		if (paidCents >= totalCents) return "paid";
		return "partial";
	};

	// Bills don't have an individual payment ledger — we just bump
	// `paid_cents` directly. If you need a paper trail, create a voucher
	// for each payment.
	const recordPayment = async (
		billId: number,
		amountCents: number
	): Promise<void> => {
		if (amountCents <= 0) throw new Error("Payment amount must be positive");
		const bill = await get(billId);
		if (!bill) throw new Error("recordPayment: bill not found");
		if (bill.status === "cancelled") {
			throw new Error("Cannot record payments against a cancelled bill");
		}
		const newPaid = bill.paid_cents + amountCents;
		const next = statusAfterPayment(bill.status, bill.total_cents, newPaid);
		await execute(
			"UPDATE bills SET paid_cents = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
			[newPaid, next, billId]
		);
		await load();
	};

	const setPaidAmount = async (billId: number, paidCents: number): Promise<void> => {
		const bill = await get(billId);
		if (!bill) throw new Error("setPaidAmount: bill not found");
		const clamped = Math.max(0, paidCents);
		const next = statusAfterPayment(bill.status, bill.total_cents, clamped);
		await execute(
			"UPDATE bills SET paid_cents = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
			[clamped, next, billId]
		);
		await load();
	};

	const setStatus = async (id: number, target: BillStatus): Promise<void> => {
		const row = await get(id);
		if (!row) throw new Error("setStatus: bill not found");
		if (!canTransition(row.status, target)) {
			throw new Error(`Cannot move bill from ${row.status} to ${target}`);
		}
		await execute(
			"UPDATE bills SET status = ?, updated_at = datetime('now') WHERE id = ?",
			[target, id]
		);
		await load();
	};

	// We allow deleting any UNPAID bill (no payments recorded). Once
	// payments exist the bill is part of the user's books and should be
	// cancelled instead.
	const deleteBill = async (id: number): Promise<void> => {
		const row = await get(id);
		if (!row) return;
		if (row.paid_cents > 0) {
			throw new Error("Cannot delete a bill with recorded payments — cancel it instead");
		}
		// bill_lines cascade.
		await execute("DELETE FROM bills WHERE id = ?", [id]);
		await load();
	};

	const flagOverdue = async (): Promise<number> => {
		const today = todayISO();
		const result = await execute(
			`UPDATE bills
			 SET status = 'overdue', updated_at = datetime('now')
			 WHERE status IN ('unpaid','partial') AND due_date < ?`,
			[today]
		);
		if (result.rowsAffected > 0) await load();
		return result.rowsAffected;
	};

	return {
		bills,
		loading,
		error,
		search,
		statusFilter,
		filtered,
		outstandingTotal,
		overdueCount,
		load,
		get,
		getLines,
		createBill,
		update,
		replaceLines,
		recordPayment,
		setPaidAmount,
		setStatus,
		deleteBill,
		flagOverdue
	};
});
