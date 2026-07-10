// Letters store — free-form correspondence rendered on the letterhead.
//
// Simplest document store in the app: no line items, no snapshots, no
// status FSM, no derived-from-vouchers math. Letters are always editable.
// The `number` reference is a plain string the user may keep (auto-suggested
// LET-YYYY-NNNN), override, or clear — so we only touch the shared counter to
// ADVANCE it when the user kept the suggested value (see create/duplicate).

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { allocateSpecificDocumentNumber, peekNextSequence } from "~/lib/numbering";

export interface LetterRow {
	id: number
	number: string
	letter_date: string
	category: string
	recipient_name: string
	recipient_address: string
	subject: string
	body_json: string
	signature_json: string
	pre_printed: number
	created_at: string
	updated_at: string
}

const todayISO = (): string => {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${dd}`;
};

// Advance the LET counter iff the caller kept the auto-suggested reference.
// Returns nothing — purely a side effect on document_counters. Never throws
// (a taken sequence just means the counter already moved on).
const bumpCounterIfSuggested = async (number: string): Promise<void> => {
	const trimmed = number.trim();
	if (!trimmed) return;
	const peek = await peekNextSequence("letter").catch(() => null);
	if (peek && trimmed === peek.number) {
		await allocateSpecificDocumentNumber("letter", peek.sequence).catch(() => { /* already taken */ });
	}
};

export const useLettersStore = defineStore("letters", () => {
	const letters = ref<LetterRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	const categoryFilter = ref<string | "all">("all");
	const dateFrom = ref<string | null>(null);
	const dateTo = ref<string | null>(null);

	const hasDateFilters = computed(() => Boolean(dateFrom.value || dateTo.value));
	const clearDateFilters = () => {
		dateFrom.value = null;
		dateTo.value = null;
	};

	// Distinct non-empty categories for the filter dropdown + New-modal autocomplete.
	const categories = computed(() => {
		const set = new Set<string>();
		for (const l of letters.value) {
			const c = l.category.trim();
			if (c) set.add(c);
		}
		return [...set].sort((a, b) => a.localeCompare(b));
	});

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return letters.value.filter((row) => {
			if (categoryFilter.value !== "all" && row.category !== categoryFilter.value) return false;
			if (dateFrom.value && row.letter_date < dateFrom.value) return false;
			if (dateTo.value && row.letter_date > dateTo.value) return false;
			if (!q) return true;
			return (
				row.number.toLowerCase().includes(q)
				|| row.subject.toLowerCase().includes(q)
				|| row.recipient_name.toLowerCase().includes(q)
				|| row.category.toLowerCase().includes(q)
			);
		});
	});

	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			letters.value = await select<LetterRow>(
				"SELECT * FROM letters ORDER BY datetime(created_at) DESC"
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

	const get = async (id: number): Promise<LetterRow | null> =>
		selectOne<LetterRow>("SELECT * FROM letters WHERE id = ?", [id]);

	const create = async (input: {
		number: string
		letter_date: string
		category: string
		recipient_name: string
		subject: string
	}): Promise<number> => {
		await bumpCounterIfSuggested(input.number);
		// Pre-fill the sign-off from the default signature template, if one is set.
		const def = await selectOne<{ body_json: string }>(
			"SELECT body_json FROM letter_signatures WHERE is_default = 1 LIMIT 1"
		);
		const result = await execute(
			`INSERT INTO letters (number, letter_date, category, recipient_name, subject, signature_json)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[
				input.number.trim(),
				input.letter_date,
				input.category.trim(),
				input.recipient_name.trim(),
				input.subject.trim(),
				def?.body_json ?? ""
			]
		);
		if (result.lastInsertId === undefined) throw new Error("create: no lastInsertId");
		await load();
		return result.lastInsertId;
	};

	type LetterUpdate = Partial<Pick<LetterRow, | "number" | "letter_date" | "category"
		| "recipient_name" | "recipient_address" | "subject" | "body_json"
		| "signature_json" | "pre_printed">>;

	const UPDATABLE: ReadonlyArray<keyof LetterUpdate> = [
		"number",
		"letter_date",
		"category",
		"recipient_name",
		"recipient_address",
		"subject",
		"body_json",
		"signature_json",
		"pre_printed"
	];

	const update = async (id: number, patch: LetterUpdate): Promise<void> => {
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(
			`UPDATE letters SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
			params
		);
	};

	// Clone an existing letter with a fresh suggested reference + today's date +
	// a "Copy of …" subject, so the user can tweak a few things and re-issue.
	const duplicate = async (id: number): Promise<number> => {
		const row = await get(id);
		if (!row) throw new Error("duplicate: letter not found");
		const date = todayISO();
		const peek = await peekNextSequence("letter").catch(() => null);
		let number = "";
		if (peek) {
			try {
				await allocateSpecificDocumentNumber("letter", peek.sequence);
				number = peek.number;
			} catch {
				number = "";
			}
		}
		const result = await execute(
			`INSERT INTO letters (
				number, letter_date, category, recipient_name, recipient_address,
				subject, body_json, signature_json, pre_printed
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				number,
				date,
				row.category,
				row.recipient_name,
				row.recipient_address,
				`Copy of ${row.subject}`.trim(),
				row.body_json,
				row.signature_json,
				row.pre_printed
			]
		);
		if (result.lastInsertId === undefined) throw new Error("duplicate: no lastInsertId");
		await load();
		return result.lastInsertId;
	};

	const remove = async (id: number): Promise<void> => {
		await execute("DELETE FROM letters WHERE id = ?", [id]);
		await load();
	};

	return {
		letters,
		loading,
		error,
		search,
		categoryFilter,
		dateFrom,
		dateTo,
		hasDateFilters,
		clearDateFilters,
		categories,
		filtered,
		loaded,
		load,
		ensureLoaded,
		get,
		create,
		update,
		duplicate,
		remove
	};
});
