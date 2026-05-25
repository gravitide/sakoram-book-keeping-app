// Payslips store. Per-employee, per-period pay records.
//
// Mirrors bills' shape: each payslip is an issued document with a
// frozen employee_snapshot, a list of earning/deduction lines, and a
// status FSM. The persisted status is draft|issued|cancelled — every
// other state the UI shows (unpaid / partial / paid) is derived from
// vouchers.related_payslip_id, exactly the same way bills derive
// payment state from related_bill_id.
//
// Why no tax / VAT on lines: payroll deductions (EPF, PAYE, etc.) are
// flat amounts entered by the user, not a % of a sub-total. We sum
// the earning side and the deduction side independently; net pay is
// earnings − deductions. v1 has no statutory auto-compute — that
// can ride on top later.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { sumCents } from "~/lib/money";
import { allocateDocumentNumber, allocateSpecificDocumentNumber } from "~/lib/numbering";
import { useVouchersStore } from "~/stores/vouchers";

export type PayslipPersistedStatus = "draft" | "issued" | "cancelled";

// Derived view consumed by list pages, badges, filters. Issued
// payslips that haven't been paid show as 'unpaid'; payments via
// vouchers move them through 'partial' to 'paid'. Cancelled is
// sticky.
export type PayslipStatus = "draft" | "unpaid" | "partial" | "paid" | "cancelled";

export interface PayslipRow {
	id: number
	number: string
	fiscal_year: number
	employee_id: number
	employee_snapshot: string // JSON
	/// Denormalised from `employee_snapshot.full_name` — set whenever the
	/// snapshot is set so the list page can render + sort + search
	/// without parsing the JSON blob. Migration 0028 added this column
	/// and backfilled it from existing snapshots.
	employee_name: string
	period_start: string
	period_end: string
	pay_date: string
	earnings_cents: number
	deductions_cents: number
	net_cents: number
	notes: string | null
	status: PayslipPersistedStatus
	created_at: string
	updated_at: string
}

export interface EmployeeSnapshot {
	full_name: string
	employee_number: string | null
	nic: string | null
	designation: string | null
	email: string | null
	phone: string | null
	address_line1: string | null
	address_line2: string | null
	city: string | null
	postal_code: string | null
	country: string | null
	joining_date: string | null
	bank_name: string | null
	bank_branch: string | null
	bank_account_number: string | null
	bank_account_name: string | null
}

export type PayslipLineKind = "earning" | "deduction";

export interface PayslipLineRow {
	id: number
	payslip_id: number
	sort_order: number
	kind: PayslipLineKind
	label: string
	amount_cents: number
}

export type PayslipLineDraft = Omit<PayslipLineRow, "id" | "payslip_id">;

// First and last day of the calendar month containing the given ISO date.
// Used as the default period when creating a new payslip.
export const monthBounds = (iso: string): { start: string, end: string } => {
	const d = new Date(`${iso}T00:00:00`);
	const y = d.getFullYear();
	const m = d.getMonth();
	const start = new Date(y, m, 1);
	const end = new Date(y, m + 1, 0);
	const fmt = (x: Date) =>
		`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
	return { start: fmt(start), end: fmt(end) };
};

export const usePayslipsStore = defineStore("payslips", () => {
	const payslips = ref<PayslipRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	// Multi-select status filter. Empty = show everything. The previous
	// 'outstanding' sentinel is no longer needed — with multi-select
	// the user just ticks unpaid + partial to express it.
	const statusFilters = ref<PayslipStatus[]>([]);
	const toggleStatusFilter = (s: PayslipStatus) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};
	const clearStatusFilters = () => {
		statusFilters.value = [];
	};
	const employeeFilter = ref<number | "all">("all");
	const periodFrom = ref<string | null>(null);
	const periodTo = ref<string | null>(null);

	const hasDateFilters = computed(() => Boolean(periodFrom.value || periodTo.value));
	const clearDateFilters = () => {
		periodFrom.value = null;
		periodTo.value = null;
	};

	// Read off the vouchers store like bills does — no cached paid_cents.
	const linkedPayments = (payslipId: number) => {
		const vouchers = useVouchersStore();
		return vouchers.vouchers
			.filter((v) => v.related_payslip_id === payslipId && v.voucher_type === "payment")
			.slice()
			.sort((a, b) => b.voucher_date.localeCompare(a.voucher_date) || b.id - a.id);
	};

	const paidCentsFor = (payslipId: number): number =>
		linkedPayments(payslipId).reduce((sum, v) => sum + v.amount_cents, 0);

	const balanceCentsFor = (row: PayslipRow): number =>
		Math.max(0, row.net_cents - paidCentsFor(row.id));

	const derivedStatus = (row: PayslipRow): PayslipStatus => {
		if (row.status === "cancelled") return "cancelled";
		if (row.status === "draft") return "draft";
		const paid = paidCentsFor(row.id);
		if (paid >= row.net_cents && row.net_cents > 0) return "paid";
		if (paid > 0) return "partial";
		return "unpaid";
	};

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return payslips.value.filter((row) => {
			const ds = derivedStatus(row);
			if (statusFilters.value.length > 0 && !statusFilters.value.includes(ds)) return false;
			if (employeeFilter.value !== "all" && row.employee_id !== employeeFilter.value) return false;
			if (periodFrom.value && row.period_start < periodFrom.value) return false;
			if (periodTo.value && row.period_end > periodTo.value) return false;
			if (!q) return true;
			// Search the denormalised employee_name column (migration
			// 0028) so no JSON.parse runs per row.
			return row.number.toLowerCase().includes(q)
				|| row.employee_name.toLowerCase().includes(q);
		});
	});

	const outstandingTotal = computed(() => {
		let sum = 0;
		for (const r of payslips.value) {
			const ds = derivedStatus(r);
			if (ds === "unpaid" || ds === "partial") sum += balanceCentsFor(r);
		}
		return sum;
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
			payslips.value = await select<PayslipRow>(
				"SELECT * FROM payslips ORDER BY date(period_start) DESC, id DESC"
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

	const get = async (id: number): Promise<PayslipRow | null> =>
		selectOne<PayslipRow>("SELECT * FROM payslips WHERE id = ?", [id]);

	const getLines = async (payslipId: number): Promise<PayslipLineRow[]> =>
		select<PayslipLineRow>(
			"SELECT * FROM payslip_lines WHERE payslip_id = ? ORDER BY sort_order ASC, id ASC",
			[payslipId]
		);

	// Pull the full_name field out of a stored employee_snapshot JSON.
	// Used at write time to keep the denormalised employee_name column
	// in lockstep with the snapshot — see migration 0028.
	const nameFromEmployeeSnapshot = (snap: string): string => {
		try {
			return (JSON.parse(snap) as { full_name?: string }).full_name ?? "";
		} catch {
			return "";
		}
	};

	const buildEmployeeSnapshot = (e: {
		full_name: string
		employee_number?: string | null
		nic?: string | null
		designation?: string | null
		email?: string | null
		phone?: string | null
		address_line1?: string | null
		address_line2?: string | null
		city?: string | null
		postal_code?: string | null
		country?: string | null
		joining_date?: string | null
		bank_name?: string | null
		bank_branch?: string | null
		bank_account_number?: string | null
		bank_account_name?: string | null
	}): string => JSON.stringify({
		full_name: e.full_name,
		employee_number: e.employee_number ?? null,
		nic: e.nic ?? null,
		designation: e.designation ?? null,
		email: e.email ?? null,
		phone: e.phone ?? null,
		address_line1: e.address_line1 ?? null,
		address_line2: e.address_line2 ?? null,
		city: e.city ?? null,
		postal_code: e.postal_code ?? null,
		country: e.country ?? null,
		joining_date: e.joining_date ?? null,
		bank_name: e.bank_name ?? null,
		bank_branch: e.bank_branch ?? null,
		bank_account_number: e.bank_account_number ?? null,
		bank_account_name: e.bank_account_name ?? null
	} satisfies EmployeeSnapshot);

	const createPayslip = async (input: {
		employee: EmployeeSnapshot & { id: number, basic_salary_cents: number }
		periodStart: string
		periodEnd: string
		payDate: string
		/**
			 Override the auto-allocated sequence number. Used by the New
			modal's editable Number field so the user can fill a gap left
			by an earlier deletion. Validates uniqueness before insert.
			*/
		sequence?: number
	}): Promise<number> => {
		const allocation = input.sequence !== undefined
			? await allocateSpecificDocumentNumber("payslip", input.payDate, input.sequence)
			: await allocateDocumentNumber("payslip", input.payDate);
		const snap = buildEmployeeSnapshot(input.employee);
		// Seed the draft with a single Basic earning line equal to the
		// employee's basic_salary_cents so the user has something concrete
		// on the editor — they can edit/delete and add their own lines.
		const result = await execute(
			`INSERT INTO payslips (
				number, fiscal_year, employee_id, employee_snapshot, employee_name,
				period_start, period_end, pay_date,
				earnings_cents, deductions_cents, net_cents, status
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'draft')`,
			[
				allocation.number,
				allocation.fiscalYear,
				input.employee.id,
				snap,
				nameFromEmployeeSnapshot(snap),
				input.periodStart,
				input.periodEnd,
				input.payDate,
				input.employee.basic_salary_cents,
				input.employee.basic_salary_cents
			]
		);
		if (result.lastInsertId === undefined) throw new Error("createPayslip: no lastInsertId");
		const id = result.lastInsertId;
		if (input.employee.basic_salary_cents > 0) {
			await execute(
				`INSERT INTO payslip_lines (
					payslip_id, sort_order, kind, label, amount_cents
				) VALUES (?, 0, 'earning', 'Basic', ?)`,
				[id, input.employee.basic_salary_cents]
			);
		}
		await load();
		return id;
	};

	type PayslipUpdate = Partial<Pick<PayslipRow, | "period_start" | "period_end" | "pay_date"
		| "earnings_cents" | "deductions_cents" | "net_cents" | "notes">>;

	const UPDATABLE: ReadonlyArray<keyof PayslipUpdate> = [
		"period_start",
		"period_end",
		"pay_date",
		"earnings_cents",
		"deductions_cents",
		"net_cents",
		"notes"
	];

	const update = async (id: number, patch: PayslipUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(
			`UPDATE payslips SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
	};

	// Replace the line set wholesale and recompute totals. Sequential
	// auto-commits — see "Connection pool caveat" in CLAUDE.md.
	const replaceLines = async (
		payslipId: number,
		lines: PayslipLineDraft[]
	): Promise<{ earnings_cents: number, deductions_cents: number, net_cents: number }> => {
		await execute("DELETE FROM payslip_lines WHERE payslip_id = ?", [payslipId]);
		for (let i = 0; i < lines.length; i++) {
			const l = lines[i];
			if (!l) continue;
			await execute(
				`INSERT INTO payslip_lines (
					payslip_id, sort_order, kind, label, amount_cents
				) VALUES (?, ?, ?, ?, ?)`,
				[payslipId, i, l.kind, l.label, l.amount_cents]
			);
		}
		const earnings = sumCents(...lines.filter((l) => l.kind === "earning").map((l) => l.amount_cents));
		const deductions = sumCents(...lines.filter((l) => l.kind === "deduction").map((l) => l.amount_cents));
		return {
			earnings_cents: earnings,
			deductions_cents: deductions,
			net_cents: Math.max(0, earnings - deductions)
		};
	};

	// Persisted FSM transitions. The UI consults canTransition() before
	// offering buttons; the DB CHECK constraint is a safety net.
	const TRANSITIONS: Record<PayslipPersistedStatus, PayslipPersistedStatus[]> = {
		draft: ["issued", "cancelled"],
		issued: ["cancelled"],
		cancelled: []
	};

	const canTransition = (from: PayslipPersistedStatus, to: PayslipPersistedStatus): boolean =>
		TRANSITIONS[from].includes(to);

	const setStatus = async (id: number, next: PayslipPersistedStatus): Promise<void> => {
		const row = await get(id);
		if (!row) throw new Error("Payslip not found");
		// Issued + paid is locked: cancellation requires deleting the
		// payment vouchers first. Surface a clear error rather than
		// quietly leaving the books wrong.
		if (next === "cancelled" && row.status === "issued" && paidCentsFor(id) > 0) {
			throw new Error("This payslip has recorded payments. Delete the payment vouchers first, then cancel.");
		}
		if (!canTransition(row.status, next)) {
			throw new Error(`Cannot move payslip from ${row.status} to ${next}`);
		}
		await execute(
			"UPDATE payslips SET status = ?, updated_at = datetime('now') WHERE id = ?",
			[next, id]
		);
		await load();
	};

	// Universal delete — same trade-off as bills. Vouchers stay, lose
	// their payslip link via ON DELETE SET NULL on the column itself.
	const remove = async (id: number): Promise<void> => {
		await execute("DELETE FROM payslips WHERE id = ?", [id]);
		await load();
		await useVouchersStore().load().catch(() => { /* non-fatal */ });
	};

	return {
		payslips,
		loading,
		error,
		search,
		statusFilters,
		toggleStatusFilter,
		clearStatusFilters,
		employeeFilter,
		periodFrom,
		periodTo,
		hasDateFilters,
		clearDateFilters,
		filtered,
		outstandingTotal,
		loaded,
		load,
		ensureLoaded,
		get,
		getLines,
		buildEmployeeSnapshot,
		createPayslip,
		update,
		replaceLines,
		canTransition,
		setStatus,
		remove,
		linkedPayments,
		paidCentsFor,
		balanceCentsFor,
		derivedStatus
	};
});
