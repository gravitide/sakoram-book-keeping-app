// Vendors store: list + search + create/update/archive.
//
// Mirrors the clients store exactly — same shape, same patterns. Vendors
// are the counterparties on the bills side of the ledger, kept as a
// standalone address book in this initial cut. (A future change can
// thread a saved vendor through into bill creation; for now bills keep
// their own free-text vendor fields.)

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";

export interface VendorRow {
	id: number
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
	notes: string | null
	is_archived: number
	created_at: string
	updated_at: string
}

export type VendorInput = Omit<VendorRow, "id" | "is_archived" | "created_at" | "updated_at">;

const INSERTABLE_COLUMNS: ReadonlyArray<keyof VendorInput> = [
	"name",
	"contact_person",
	"email",
	"phone",
	"address_line1",
	"address_line2",
	"city",
	"postal_code",
	"country",
	"tax_id",
	"notes"
];

export const useVendorsStore = defineStore("vendors", () => {
	const vendors = ref<VendorRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// UI filter state lives with the store so navigating away/back is sticky.
	const search = ref("");
	const showArchived = ref(false);

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return vendors.value.filter((v) => {
			if (!showArchived.value && v.is_archived === 1) return false;
			if (showArchived.value && v.is_archived === 0) return false;
			if (!q) return true;
			return (
				v.name.toLowerCase().includes(q)
				|| (v.email ?? "").toLowerCase().includes(q)
				|| (v.contact_person ?? "").toLowerCase().includes(q)
				|| (v.phone ?? "").toLowerCase().includes(q)
				|| (v.tax_id ?? "").toLowerCase().includes(q)
			);
		});
	});

	const activeCount = computed(() => vendors.value.filter((v) => v.is_archived === 0).length);
	const archivedCount = computed(() => vendors.value.filter((v) => v.is_archived === 1).length);

	// See app/stores/invoices.ts for the `loaded` / `ensureLoaded`
	// rationale — same pattern across every collection store.
	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			vendors.value = await select<VendorRow>(
				"SELECT * FROM vendors ORDER BY name COLLATE NOCASE ASC"
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

	const get = async (id: number): Promise<VendorRow | null> => {
		return selectOne<VendorRow>("SELECT * FROM vendors WHERE id = ?", [id]);
	};

	const create = async (input: VendorInput): Promise<number> => {
		const cols = INSERTABLE_COLUMNS.slice();
		const placeholders = cols.map(() => "?").join(", ");
		const params = cols.map((c) => input[c] ?? null);
		const result = await execute(
			`INSERT INTO vendors (${cols.join(", ")}) VALUES (${placeholders})`,
			params
		);
		await load();
		if (result.lastInsertId === undefined) {
			throw new Error("create: no lastInsertId returned");
		}
		return result.lastInsertId;
	};

	const update = async (id: number, patch: Partial<VendorInput>) => {
		const cols = INSERTABLE_COLUMNS.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(
			`UPDATE vendors SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
		await load();
	};

	const setArchived = async (id: number, archived: boolean) => {
		await execute(
			"UPDATE vendors SET is_archived = ?, updated_at = datetime('now') WHERE id = ?",
			[archived ? 1 : 0, id]
		);
		await load();
	};

	// Hard delete. The bills FK references vendors(id) without an
	// explicit ON DELETE clause (NO ACTION), so SQLite blocks the
	// delete once a bill references the vendor — the caller surfaces
	// the constraint error as a friendly nudge toward Archive.
	const remove = async (id: number): Promise<void> => {
		await execute("DELETE FROM vendors WHERE id = ?", [id]);
		await load();
	};

	return {
		vendors,
		loading,
		error,
		search,
		showArchived,
		filtered,
		activeCount,
		archivedCount,
		loaded,
		load,
		ensureLoaded,
		get,
		create,
		update,
		setArchived,
		remove
	};
});
