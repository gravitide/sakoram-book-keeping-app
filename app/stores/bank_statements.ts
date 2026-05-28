// Bank reconciliation store. Holds imported bank statement rows and
// the link-state to vouchers.
//
// Generation, matching, and import are all user-initiated. No
// background jobs. All multi-step writes use sequential auto-commits
// per the connection-pool caveat — no JS-side BEGIN/COMMIT.
//
// linkMatch is the load-bearing op: it sets bank_statement_rows.
// matched_voucher_id + vouchers.reconciled_at as two separate
// UPDATEs. A crash between them leaves the row matched while the
// voucher shows unreconciled — recoverable: the next suggestion
// pass surfaces the inconsistency and the user can re-link.

import type { MatchableRow, MatchableVoucher, MatchCandidate } from "~/lib/reconcile-match";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select } from "~/lib/db";
import { suggestMatches as suggestMatchesFn } from "~/lib/reconcile-match";
import { useVouchersStore } from "~/stores/vouchers";

export interface BankStatementImportRow {
	id: number
	business_bank_id: number
	filename: string | null
	imported_at: string
	row_count: number
	column_mapping: string | null // JSON
}

export interface BankStatementRowRow {
	id: number
	import_id: number
	business_bank_id: number
	statement_date: string
	description: string | null
	amount_cents: number
	reference: string | null
	balance_cents: number | null
	matched_voucher_id: number | null
	matched_at: string | null
	dedupe_hash: string
}

export interface ColumnMapping {
	// Index into the CSV's columns array. -1 means "not mapped".
	date: number
	description: number
	amount: number // signed; if -1 and (debit + credit) are set, computed
	debit: number
	credit: number
	reference: number
	balance: number
	// Parsing config
	dateFormat: "YYYY-MM-DD" | "DD/MM/YYYY" | "DD-MM-YYYY" | "DD-MMM-YYYY"
}

export interface ImportCsvInput {
	bankId: number
	filename: string
	columnMapping: ColumnMapping
	rows: { dateIso: string, description: string | null, amountCents: number, reference: string | null, balanceCents: number | null }[]
}

// SHA-256 via Web Crypto. Returns lowercase hex.
const sha256 = async (s: string): Promise<string> => {
	const enc = new TextEncoder().encode(s);
	const buf = await crypto.subtle.digest("SHA-256", enc);
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
};

const dedupeHashInput = (r: ImportCsvInput["rows"][number]): string =>
	`${r.dateIso}|${r.amountCents}|${r.description ?? ""}|${r.reference ?? ""}`;

export const useBankStatementsStore = defineStore("bank_statements", () => {
	const imports = ref<BankStatementImportRow[]>([]);
	const rows = ref<BankStatementRowRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			imports.value = await select<BankStatementImportRow>(
				"SELECT * FROM bank_statement_imports ORDER BY imported_at DESC"
			);
			rows.value = await select<BankStatementRowRow>(
				"SELECT * FROM bank_statement_rows ORDER BY statement_date DESC, id DESC"
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

	const importCsv = async (input: ImportCsvInput): Promise<{ inserted: number, skipped: number }> => {
		// Insert the import row first.
		const importResult = await execute(
			`INSERT INTO bank_statement_imports
				(business_bank_id, filename, row_count, column_mapping)
			 VALUES (?, ?, ?, ?)`,
			[input.bankId, input.filename, input.rows.length, JSON.stringify(input.columnMapping)]
		);
		const importId = importResult.lastInsertId;
		if (importId === undefined) throw new Error("importCsv: no import lastInsertId");

		let inserted = 0;
		let skipped = 0;
		for (const r of input.rows) {
			const hash = await sha256(dedupeHashInput(r));
			try {
				await execute(
					`INSERT INTO bank_statement_rows
						(import_id, business_bank_id, statement_date, description,
						 amount_cents, reference, balance_cents, dedupe_hash)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						importId,
						input.bankId,
						r.dateIso,
						r.description,
						r.amountCents,
						r.reference,
						r.balanceCents,
						hash
					]
				);
				inserted += 1;
			} catch (e) {
				// UNIQUE (business_bank_id, dedupe_hash) collision → already imported.
				const msg = e instanceof Error ? e.message : String(e);
				if (msg.includes("UNIQUE") || msg.includes("constraint")) {
					skipped += 1;
				} else {
					throw e;
				}
			}
		}

		// Update the row_count to reflect what actually went in.
		if (inserted !== input.rows.length) {
			await execute(
				"UPDATE bank_statement_imports SET row_count = ? WHERE id = ?",
				[inserted, importId]
			);
		}

		await load();
		return { inserted, skipped };
	};

	const linkMatch = async (rowId: number, voucherId: number): Promise<void> => {
		const now = new Date().toISOString();
		// Two sequential auto-commits — see header comment.
		await execute(
			"UPDATE bank_statement_rows SET matched_voucher_id = ?, matched_at = ? WHERE id = ?",
			[voucherId, now, rowId]
		);
		await execute(
			"UPDATE vouchers SET reconciled_at = ? WHERE id = ?",
			[now, voucherId]
		);
		// Refresh local state.
		const row = rows.value.find((r) => r.id === rowId);
		if (row) {
			row.matched_voucher_id = voucherId;
			row.matched_at = now;
		}
		await useVouchersStore().load();
	};

	const unlinkMatch = async (rowId: number): Promise<void> => {
		const row = rows.value.find((r) => r.id === rowId);
		const voucherId = row?.matched_voucher_id ?? null;
		await execute(
			"UPDATE bank_statement_rows SET matched_voucher_id = NULL, matched_at = NULL WHERE id = ?",
			[rowId]
		);
		if (voucherId !== null) {
			await execute(
				"UPDATE vouchers SET reconciled_at = NULL WHERE id = ?",
				[voucherId]
			);
			await useVouchersStore().load();
		}
		if (row) {
			row.matched_voucher_id = null;
			row.matched_at = null;
		}
	};

	const deleteImport = async (importId: number): Promise<void> => {
		// Clear reconciled_at on any vouchers matched to this import's
		// rows BEFORE deleting (so they're unreconciled going forward).
		const matchedVoucherIds = rows.value
			.filter((r) => r.import_id === importId && r.matched_voucher_id !== null)
			.map((r) => r.matched_voucher_id!);
		for (const vid of matchedVoucherIds) {
			await execute("UPDATE vouchers SET reconciled_at = NULL WHERE id = ?", [vid]);
		}
		// Delete the import — CASCADE drops the rows.
		await execute("DELETE FROM bank_statement_imports WHERE id = ?", [importId]);
		await load();
		if (matchedVoucherIds.length > 0) await useVouchersStore().load();
	};

	const suggestMatchesFor = (bankId: number): Map<number, MatchCandidate[]> => {
		const vouchers = useVouchersStore();
		const matchable: MatchableRow[] = rows.value
			.filter((r) => r.business_bank_id === bankId)
			.map((r) => ({
				id: r.id,
				business_bank_id: r.business_bank_id,
				statement_date: r.statement_date,
				amount_cents: r.amount_cents,
				reference: r.reference,
				matched_voucher_id: r.matched_voucher_id
			}));
		const matchableVouchers: MatchableVoucher[] = vouchers.vouchers
			.filter((v) => v.business_bank_id === bankId)
			.map((v) => ({
				id: v.id,
				business_bank_id: v.business_bank_id,
				voucher_type: v.voucher_type,
				voucher_date: v.voucher_date,
				amount_cents: v.amount_cents,
				reference: v.reference,
				reconciled_at: v.reconciled_at
			}));
		return suggestMatchesFn({ rows: matchable, vouchers: matchableVouchers });
	};

	// Last-used column mapping for a bank — pre-selects the import
	// modal's dropdowns next time.
	const lastMappingFor = (bankId: number): ColumnMapping | null => {
		const lastImport = imports.value.find((i) => i.business_bank_id === bankId);
		if (!lastImport?.column_mapping) return null;
		try {
			return JSON.parse(lastImport.column_mapping) as ColumnMapping;
		} catch {
			return null;
		}
	};

	// Unreconciled vouchers for a bank — vouchers with this bank_id
	// and reconciled_at NULL. The reconcile page's "Unreconciled
	// vouchers" panel reads off this.
	const unreconciledVouchersFor = (bankId: number) =>
		computed(() => useVouchersStore().vouchers.filter(
			(v) => v.business_bank_id === bankId && v.reconciled_at === null
		));

	return {
		imports,
		rows,
		loading,
		error,
		loaded,
		load,
		ensureLoaded,
		importCsv,
		linkMatch,
		unlinkMatch,
		deleteImport,
		suggestMatchesFor,
		lastMappingFor,
		unreconciledVouchersFor
	};
});
