// Reusable letter signature templates. Mirrors letter_categories plus a default
// flag. Applying a signature to a letter copies its body_json into the letter
// (letters stay self-contained), so there's no FK from letters to here.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";

export interface LetterSignatureRow {
	id: number
	name: string
	body_json: string
	is_default: number
	created_at: string
	updated_at: string
}

export const useLetterSignaturesStore = defineStore("letter_signatures", () => {
	const signatures = ref<LetterSignatureRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// The current default (pre-filled into new letters), or null.
	const defaultSignature = computed(() => signatures.value.find((s) => s.is_default === 1) ?? null);

	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			signatures.value = await select<LetterSignatureRow>(
				"SELECT * FROM letter_signatures ORDER BY name COLLATE NOCASE ASC"
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

	const get = async (id: number): Promise<LetterSignatureRow | null> =>
		selectOne<LetterSignatureRow>("SELECT * FROM letter_signatures WHERE id = ?", [id]);

	// Exactly one default at a time — single atomic statement (mirrors
	// business_banks.setDefault). Signatures aren't archivable, so the CASE-WHEN
	// covers every row.
	const setDefault = async (id: number): Promise<void> => {
		await execute(
			`UPDATE letter_signatures
			 SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END, updated_at = datetime('now')`,
			[id]
		);
		await load();
	};

	const create = async (input: { name: string, body_json: string, isDefault?: boolean }): Promise<number> => {
		const result = await execute(
			"INSERT INTO letter_signatures (name, body_json, is_default) VALUES (?, ?, 0)",
			[input.name.trim(), input.body_json]
		);
		if (result.lastInsertId === undefined) throw new Error("create: no lastInsertId");
		if (input.isDefault) await setDefault(result.lastInsertId);
		else await load();
		return result.lastInsertId;
	};

	const update = async (id: number, patch: { name: string, body_json: string }): Promise<void> => {
		await execute(
			"UPDATE letter_signatures SET name = ?, body_json = ?, updated_at = datetime('now') WHERE id = ?",
			[patch.name.trim(), patch.body_json, id]
		);
		await load();
	};

	const remove = async (id: number): Promise<void> => {
		await execute("DELETE FROM letter_signatures WHERE id = ?", [id]);
		await load();
	};

	return {
		signatures,
		loading,
		error,
		defaultSignature,
		loaded,
		load,
		ensureLoaded,
		get,
		create,
		update,
		setDefault,
		remove
	};
});
