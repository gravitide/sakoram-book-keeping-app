// Letter categories: a managed lookup the letter Category picker reads from.
// Name-only (no colour/icon — letters don't need them). Mirrors the
// eager-load, in-memory-filter shape of bill_categories, minus the extras.
//
// A letter stores its category as plain text (letters.category), NOT an FK —
// this list is only the pick-list source, so archiving/deleting a category
// never rewrites existing letters.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";

export interface LetterCategoryRow {
	id: number
	name: string
	is_archived: number
	created_at: string
	updated_at: string
}

export const useLetterCategoriesStore = defineStore("letter_categories", () => {
	const categories = ref<LetterCategoryRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// Active (non-archived) category names, sorted — what the picker offers.
	const activeNames = computed(() =>
		categories.value
			.filter((c) => c.is_archived === 0)
			.map((c) => c.name)
			.sort((a, b) => a.localeCompare(b))
	);

	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			categories.value = await select<LetterCategoryRow>(
				"SELECT * FROM letter_categories ORDER BY name COLLATE NOCASE ASC"
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

	const get = async (id: number): Promise<LetterCategoryRow | null> =>
		selectOne<LetterCategoryRow>("SELECT * FROM letter_categories WHERE id = ?", [id]);

	// Create a category by name. Returns the existing row's id if the name is
	// already taken (case-insensitive) so the inline "+ New" flow is idempotent.
	const create = async (name: string): Promise<number> => {
		const trimmed = name.trim();
		if (!trimmed) throw new Error("Category name is required");
		const existing = await selectOne<{ id: number }>(
			"SELECT id FROM letter_categories WHERE name = ? COLLATE NOCASE",
			[trimmed]
		);
		if (existing) return existing.id;
		const result = await execute(
			"INSERT INTO letter_categories (name) VALUES (?)",
			[trimmed]
		);
		await load();
		if (result.lastInsertId === undefined) throw new Error("create: no lastInsertId");
		return result.lastInsertId;
	};

	const rename = async (id: number, name: string): Promise<void> => {
		const trimmed = name.trim();
		if (!trimmed) throw new Error("Category name is required");
		await execute(
			"UPDATE letter_categories SET name = ?, updated_at = datetime('now') WHERE id = ?",
			[trimmed, id]
		);
		await load();
	};

	const setArchived = async (id: number, archived: boolean): Promise<void> => {
		await execute(
			"UPDATE letter_categories SET is_archived = ?, updated_at = datetime('now') WHERE id = ?",
			[archived ? 1 : 0, id]
		);
		await load();
	};

	const remove = async (id: number): Promise<void> => {
		await execute("DELETE FROM letter_categories WHERE id = ?", [id]);
		await load();
	};

	return {
		categories,
		loading,
		error,
		activeNames,
		loaded,
		load,
		ensureLoaded,
		get,
		create,
		rename,
		setArchived,
		remove
	};
});
