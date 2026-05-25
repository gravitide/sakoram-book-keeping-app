// Clients store: list + search + create/update/archive.
//
// We deliberately keep the list eagerly loaded for the active set — for a
// single-user app a few thousand rows is a non-issue. The search input
// filters in-memory below; we re-fetch on archive toggle.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";

export interface ClientRow {
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

export type ClientInput = Omit<ClientRow, "id" | "is_archived" | "created_at" | "updated_at">;

const INSERTABLE_COLUMNS: ReadonlyArray<keyof ClientInput> = [
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

export const useClientsStore = defineStore("clients", () => {
	const clients = ref<ClientRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// UI filter state lives with the store so navigating away/back is sticky.
	const search = ref("");
	const showArchived = ref(false);

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return clients.value.filter((c) => {
			if (!showArchived.value && c.is_archived === 1) return false;
			if (showArchived.value && c.is_archived === 0) return false;
			if (!q) return true;
			return (
				c.name.toLowerCase().includes(q)
				|| (c.email ?? "").toLowerCase().includes(q)
				|| (c.contact_person ?? "").toLowerCase().includes(q)
				|| (c.phone ?? "").toLowerCase().includes(q)
				|| (c.tax_id ?? "").toLowerCase().includes(q)
			);
		});
	});

	const activeCount = computed(() => clients.value.filter((c) => c.is_archived === 0).length);
	const archivedCount = computed(() => clients.value.filter((c) => c.is_archived === 1).length);

	// See app/stores/invoices.ts for the `loaded` / `ensureLoaded`
	// rationale — same pattern across every collection store.
	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			clients.value = await select<ClientRow>(
				"SELECT * FROM clients ORDER BY name COLLATE NOCASE ASC"
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

	const get = async (id: number): Promise<ClientRow | null> => {
		return selectOne<ClientRow>("SELECT * FROM clients WHERE id = ?", [id]);
	};

	const create = async (input: ClientInput): Promise<number> => {
		const cols = INSERTABLE_COLUMNS.slice();
		const placeholders = cols.map(() => "?").join(", ");
		const params = cols.map((c) => input[c] ?? null);
		const result = await execute(
			`INSERT INTO clients (${cols.join(", ")}) VALUES (${placeholders})`,
			params
		);
		await load();
		if (result.lastInsertId === undefined) {
			throw new Error("create: no lastInsertId returned");
		}
		return result.lastInsertId;
	};

	const update = async (id: number, patch: Partial<ClientInput>) => {
		const cols = INSERTABLE_COLUMNS.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(
			`UPDATE clients SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
		await load();
	};

	const setArchived = async (id: number, archived: boolean) => {
		await execute(
			"UPDATE clients SET is_archived = ?, updated_at = datetime('now') WHERE id = ?",
			[archived ? 1 : 0, id]
		);
		await load();
	};

	// Hard delete. The quotes / invoices FKs default to NO ACTION
	// (no explicit ON DELETE clause), so SQLite blocks the delete
	// once a document references the client — the caller surfaces
	// that as a friendly toast nudging the user to Archive instead.
	const remove = async (id: number): Promise<void> => {
		await execute("DELETE FROM clients WHERE id = ?", [id]);
		await load();
	};

	return {
		clients,
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
