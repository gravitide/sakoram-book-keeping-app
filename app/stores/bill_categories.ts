// Bill categories: a managed lookup the bill page picker reads from.
// Tiny shape (name + color + icon + archive flag); same eager-load,
// in-memory-filter pattern as clients/vendors.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";

export interface BillCategoryRow {
	id: number
	name: string
	color: string
	icon: string
	is_archived: number
	created_at: string
	updated_at: string
}

export type BillCategoryInput = Pick<BillCategoryRow, "name" | "color" | "icon">;

const INSERTABLE_COLUMNS: ReadonlyArray<keyof BillCategoryInput> = ["name", "color", "icon"];

// Snapshot the user-visible bits onto a bill so renames/recolors don't
// rewrite history. Same idea as vendor_snapshot.
export interface BillCategorySnapshot {
	name: string
	color: string
	icon: string
}

export const buildCategorySnapshot = (c: BillCategoryRow): string =>
	JSON.stringify({ name: c.name, color: c.color, icon: c.icon } satisfies BillCategorySnapshot);

export const useBillCategoriesStore = defineStore("bill_categories", () => {
	const categories = ref<BillCategoryRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	const showArchived = ref(false);

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return categories.value.filter((c) => {
			if (!showArchived.value && c.is_archived === 1) return false;
			if (showArchived.value && c.is_archived === 0) return false;
			if (!q) return true;
			return c.name.toLowerCase().includes(q);
		});
	});

	const activeCount = computed(() => categories.value.filter((c) => c.is_archived === 0).length);
	const archivedCount = computed(() => categories.value.filter((c) => c.is_archived === 1).length);

	// See app/stores/invoices.ts for the `loaded` / `ensureLoaded`
	// rationale — same pattern across every collection store.
	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			categories.value = await select<BillCategoryRow>(
				"SELECT * FROM bill_categories ORDER BY name COLLATE NOCASE ASC"
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

	const get = async (id: number): Promise<BillCategoryRow | null> =>
		selectOne<BillCategoryRow>("SELECT * FROM bill_categories WHERE id = ?", [id]);

	const create = async (input: BillCategoryInput): Promise<number> => {
		const cols = INSERTABLE_COLUMNS.slice();
		const placeholders = cols.map(() => "?").join(", ");
		const params = cols.map((c) => input[c]);
		const result = await execute(
			`INSERT INTO bill_categories (${cols.join(", ")}) VALUES (${placeholders})`,
			params
		);
		await load();
		if (result.lastInsertId === undefined) {
			throw new Error("create: no lastInsertId returned");
		}
		return result.lastInsertId;
	};

	const update = async (id: number, patch: Partial<BillCategoryInput>) => {
		const cols = INSERTABLE_COLUMNS.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c]);
		params.push(id);
		await execute(
			`UPDATE bill_categories SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
		await load();
	};

	const setArchived = async (id: number, archived: boolean) => {
		await execute(
			"UPDATE bill_categories SET is_archived = ?, updated_at = datetime('now') WHERE id = ?",
			[archived ? 1 : 0, id]
		);
		await load();
	};

	return {
		categories,
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
		setArchived
	};
});
