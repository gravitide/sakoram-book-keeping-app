// Business bank accounts. Replaces the single bank record that used to
// live on company_settings. A business can register many bank accounts;
// one is marked the default and is auto-applied to new quotes/invoices.
// The user can pick a different one on a per-document basis.
//
// Snapshot shape (BankSnapshot in stores/quotes.ts) is preserved exactly,
// so PDF templates need no change — they keep reading
// `bank_details_snapshot` from the quote / invoice row as before.

import type { BankSnapshot } from "~/stores/quotes";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";

export interface BusinessBankRow {
	id: number
	label: string
	bank_name: string | null
	bank_account_name: string | null
	bank_account_number: string | null
	bank_branch: string | null
	is_default: number
	archived: number
	created_at: string
	updated_at: string
}

export type BusinessBankInput = Pick<
	BusinessBankRow,
	"label" | "bank_name" | "bank_account_name" | "bank_account_number" | "bank_branch"
>;

const UPSERTABLE_COLUMNS: ReadonlyArray<keyof BusinessBankInput> = [
	"label",
	"bank_name",
	"bank_account_name",
	"bank_account_number",
	"bank_branch"
];

// Build the JSON snapshot that lives on a quote / invoice row. Shape is
// fixed by the PDF templates (document.typ) — must match BankSnapshot
// in stores/quotes.ts. Returns null if every bank field is empty so the
// document just omits the bank block instead of printing an empty card.
export const buildBankSnapshotFromRow = (bank: BusinessBankRow): string | null => {
	const snap: BankSnapshot = {
		bank_name: bank.bank_name,
		bank_branch: bank.bank_branch,
		bank_account_name: bank.bank_account_name,
		bank_account_number: bank.bank_account_number
	};
	const anyFilled = Object.values(snap).some((v) => v != null && v !== "");
	return anyFilled ? JSON.stringify(snap) : null;
};

export const useBusinessBanksStore = defineStore("business_banks", () => {
	const banks = ref<BusinessBankRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// Active (non-archived), default-first then alpha — what the picker
	// + the settings list both render off of.
	const activeBanks = computed(() =>
		banks.value
			.filter((b) => b.archived === 0)
			.sort((a, b) => {
				if (a.is_default !== b.is_default) return b.is_default - a.is_default;
				return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
			})
	);

	const defaultBank = computed<BusinessBankRow | null>(
		() => activeBanks.value.find((b) => b.is_default === 1) ?? null
	);

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			banks.value = await select<BusinessBankRow>(
				"SELECT * FROM business_banks ORDER BY label COLLATE NOCASE ASC"
			);
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const ensureLoaded = async () => {
		if (banks.value.length === 0 && !loading.value) await load();
	};

	const get = async (id: number): Promise<BusinessBankRow | null> =>
		selectOne<BusinessBankRow>("SELECT * FROM business_banks WHERE id = ?", [id]);

	// True if at least one active bank exists. Used by the document side
	// to decide whether to seed a freshly-created draft with the default.
	const hasAny = computed(() => activeBanks.value.length > 0);

	// Returns the JSON snapshot string for a given bank id, or null if
	// the id is null / the bank doesn't exist / it has no filled fields.
	// Used by quote / invoice stores when creating or saving a document.
	const buildSnapshotForId = async (id: number | null): Promise<string | null> => {
		if (id === null) return null;
		const row = await get(id);
		if (!row) return null;
		return buildBankSnapshotFromRow(row);
	};

	const create = async (input: BusinessBankInput): Promise<number> => {
		const cols = UPSERTABLE_COLUMNS.slice();
		const placeholders = cols.map(() => "?").join(", ");
		const params = cols.map((c) => input[c] ?? null);
		const result = await execute(
			`INSERT INTO business_banks (${cols.join(", ")}) VALUES (${placeholders})`,
			params
		);
		await load();
		if (result.lastInsertId === undefined) {
			throw new Error("create: no lastInsertId returned");
		}
		return result.lastInsertId;
	};

	const update = async (id: number, patch: Partial<BusinessBankInput>) => {
		const cols = UPSERTABLE_COLUMNS.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(
			`UPDATE business_banks SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
		await load();
	};

	// Flip the default flag in one statement so the swap is atomic under
	// the connection-pool caveat (can't run multi-statement transactions
	// from JS — see CLAUDE.md). The partial unique index
	// idx_business_banks_unique_default still allows this because we
	// clear all existing defaults in the same write.
	const setDefault = async (id: number) => {
		await execute(
			`UPDATE business_banks
			 SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END,
			     updated_at = datetime('now')
			 WHERE archived = 0`,
			[id]
		);
		await load();
	};

	// Hard delete. Quote / invoice FKs (business_bank_id) are ON DELETE
	// SET NULL so historical documents keep their bank_details_snapshot
	// (PDF still renders); only the link back to the source bank is lost.
	// If the deleted bank was the default and other banks exist, callers
	// should pick a new default after — the UI does this via toast prompt.
	const remove = async (id: number) => {
		await execute("DELETE FROM business_banks WHERE id = ?", [id]);
		await load();
	};

	return {
		banks,
		loading,
		error,
		activeBanks,
		defaultBank,
		hasAny,
		load,
		ensureLoaded,
		get,
		create,
		update,
		setDefault,
		remove,
		buildSnapshotForId
	};
});
