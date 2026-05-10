// Employees store: list + search + create/update/archive.
//
// Address book for the payroll side of the ledger. Mirrors clients /
// vendors in shape (identity + contact + archive) plus payroll-only
// fields: NIC, designation, joining date, integer-cents basic salary,
// and a per-employee bank-payment block.
//
// Payslips (separate store, later PR) FK into employees with
// ON DELETE RESTRICT and snapshot the row at issue, so any rename /
// salary change here doesn't rewrite the history of past payslips.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";

export interface EmployeeRow {
	id: number
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
	basic_salary_cents: number
	bank_name: string | null
	bank_branch: string | null
	bank_account_number: string | null
	bank_account_name: string | null
	notes: string | null
	is_archived: number
	created_at: string
	updated_at: string
}

export type EmployeeInput = Omit<EmployeeRow, "id" | "is_archived" | "created_at" | "updated_at">;

const INSERTABLE_COLUMNS: ReadonlyArray<keyof EmployeeInput> = [
	"full_name",
	"employee_number",
	"nic",
	"designation",
	"email",
	"phone",
	"address_line1",
	"address_line2",
	"city",
	"postal_code",
	"country",
	"joining_date",
	"basic_salary_cents",
	"bank_name",
	"bank_branch",
	"bank_account_number",
	"bank_account_name",
	"notes"
];

export const useEmployeesStore = defineStore("employees", () => {
	const employees = ref<EmployeeRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	const showArchived = ref(false);

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return employees.value.filter((e) => {
			if (!showArchived.value && e.is_archived === 1) return false;
			if (showArchived.value && e.is_archived === 0) return false;
			if (!q) return true;
			return (
				e.full_name.toLowerCase().includes(q)
				|| (e.employee_number ?? "").toLowerCase().includes(q)
				|| (e.email ?? "").toLowerCase().includes(q)
				|| (e.designation ?? "").toLowerCase().includes(q)
				|| (e.phone ?? "").toLowerCase().includes(q)
				|| (e.nic ?? "").toLowerCase().includes(q)
			);
		});
	});

	const activeCount = computed(() => employees.value.filter((e) => e.is_archived === 0).length);
	const archivedCount = computed(() => employees.value.filter((e) => e.is_archived === 1).length);

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			employees.value = await select<EmployeeRow>(
				"SELECT * FROM employees ORDER BY full_name COLLATE NOCASE ASC"
			);
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const get = async (id: number): Promise<EmployeeRow | null> => {
		return selectOne<EmployeeRow>("SELECT * FROM employees WHERE id = ?", [id]);
	};

	const create = async (input: EmployeeInput): Promise<number> => {
		const cols = INSERTABLE_COLUMNS.slice();
		const placeholders = cols.map(() => "?").join(", ");
		const params = cols.map((c) => input[c] ?? null);
		const result = await execute(
			`INSERT INTO employees (${cols.join(", ")}) VALUES (${placeholders})`,
			params
		);
		await load();
		if (result.lastInsertId === undefined) {
			throw new Error("create: no lastInsertId returned");
		}
		return result.lastInsertId;
	};

	const update = async (id: number, patch: Partial<EmployeeInput>) => {
		const cols = INSERTABLE_COLUMNS.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(
			`UPDATE employees SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
		await load();
	};

	const setArchived = async (id: number, archived: boolean) => {
		await execute(
			"UPDATE employees SET is_archived = ?, updated_at = datetime('now') WHERE id = ?",
			[archived ? 1 : 0, id]
		);
		await load();
	};

	return {
		employees,
		loading,
		error,
		search,
		showArchived,
		filtered,
		activeCount,
		archivedCount,
		load,
		get,
		create,
		update,
		setArchived
	};
});
