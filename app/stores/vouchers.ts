// Vouchers store. Money-in / money-out log, intentionally generic.
//
// Two types:
//   payment — we paid someone (vendor, landlord, employee)
//   receipt — someone paid us (typically a client)
//
// Vouchers can stand alone or carry an optional link to an invoice or
// bill. We deliberately do NOT auto-create vouchers from invoice payments
// — the user might want a different paper trail (e.g. one voucher per
// month covering several payments). Keep them explicit.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";
import { allocateDocumentNumber, allocateSpecificDocumentNumber } from "~/lib/numbering";
import { purgeDocumentAttachments } from "~/stores/document_attachments";

export type VoucherType = "payment" | "receipt";
export type VoucherMethod = "cash" | "bank_transfer" | "cheque" | "card" | "other";

export interface VoucherRow {
	id: number
	number: string
	voucher_type: VoucherType
	voucher_date: string
	party_name: string
	amount_cents: number
	payment_method: VoucherMethod | null
	reference: string | null
	description: string | null
	related_invoice_id: number | null
	related_bill_id: number | null
	related_payslip_id: number | null
	// Bank account this voucher hit (NULL for cash transactions). Used
	// by the reconcile page to scope matching per bank. Added in
	// migration 0033.
	business_bank_id: number | null
	// ISO timestamp set when this voucher is matched to a bank
	// statement row via the reconcile page; cleared on unlink.
	// Updated by the bank_statements store directly — not part of
	// the regular CRUD path, so not in INSERT or UPDATABLE.
	reconciled_at: string | null
	created_at: string
}

// `reconciled_at` is excluded from VoucherInput because it's never
// set by the regular create/update path — only the bank_statements
// store writes to it via direct UPDATE when linking/unlinking a
// statement row. Keeping it out of the input type means callers
// don't have to pass `reconciled_at: null` on every create.
export type VoucherInput = Omit<VoucherRow, "id" | "number" | "created_at" | "reconciled_at">;
type VoucherUpdate = Partial<Omit<VoucherInput, "voucher_type">>;
// voucher_type is immutable post-creation: switching a payment to a
// receipt would invert the accounting and is almost certainly a data-
// entry mistake we'd rather force the user to delete + re-create.

const todayISO = (): string => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const useVouchersStore = defineStore("vouchers", () => {
	const vouchers = ref<VoucherRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const search = ref("");
	// Multi-select type filter (receipt / payment). Empty = show both.
	// Kept as an array for visual consistency with the chip-style
	// status filters on quotes / invoices / bills / payslips.
	const typeFilters = ref<VoucherType[]>([]);
	const toggleTypeFilter = (t: VoucherType) => {
		const idx = typeFilters.value.indexOf(t);
		if (idx === -1) typeFilters.value.push(t);
		else typeFilters.value.splice(idx, 1);
	};
	const clearTypeFilters = () => {
		typeFilters.value = [];
	};
	// Optional date-range narrowing on voucher_date.
	const dateFrom = ref<string | null>(null);
	const dateTo = ref<string | null>(null);

	const hasDateFilters = computed(() => Boolean(dateFrom.value || dateTo.value));

	const clearDateFilters = () => {
		dateFrom.value = null;
		dateTo.value = null;
	};

	const filtered = computed(() => {
		const q = search.value.trim().toLowerCase();
		return vouchers.value.filter((row) => {
			if (typeFilters.value.length > 0 && !typeFilters.value.includes(row.voucher_type)) return false;
			if (dateFrom.value && row.voucher_date < dateFrom.value) return false;
			if (dateTo.value && row.voucher_date > dateTo.value) return false;
			if (!q) return true;
			return (
				row.number.toLowerCase().includes(q)
				|| row.party_name.toLowerCase().includes(q)
				|| (row.reference ?? "").toLowerCase().includes(q)
				|| (row.description ?? "").toLowerCase().includes(q)
			);
		});
	});

	const totalPayments = computed(() =>
		vouchers.value
			.filter((v) => v.voucher_type === "payment")
			.reduce((s, v) => s + v.amount_cents, 0)
	);

	const totalReceipts = computed(() =>
		vouchers.value
			.filter((v) => v.voucher_type === "receipt")
			.reduce((s, v) => s + v.amount_cents, 0)
	);

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
			vouchers.value = await select<VoucherRow>(
				"SELECT * FROM vouchers ORDER BY date(voucher_date) DESC, id DESC"
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

	const get = async (id: number): Promise<VoucherRow | null> =>
		selectOne<VoucherRow>("SELECT * FROM vouchers WHERE id = ?", [id]);

	const create = async (input: VoucherInput & { sequence?: number }, opts: { reload?: boolean } = {}): Promise<number> => {
		if (input.amount_cents <= 0) {
			throw new Error("Voucher amount must be positive");
		}
		const issue = input.voucher_date || todayISO();
		// `sequence` is the user-picked number override from the New
		// voucher form's editable Number field. When set we go through
		// the specific-allocator (validates uniqueness, bumps counter to
		// MAX). When absent we auto-allocate as usual.
		const allocation = input.sequence !== undefined
			? await allocateSpecificDocumentNumber("voucher", issue, input.sequence)
			: await allocateDocumentNumber("voucher", issue);
		const result = await execute(
			`INSERT INTO vouchers (
				number, voucher_type, voucher_date, party_name, amount_cents,
				payment_method, reference, description,
				related_invoice_id, related_bill_id, related_payslip_id,
				business_bank_id
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				allocation.number,
				input.voucher_type,
				issue,
				input.party_name,
				input.amount_cents,
				input.payment_method,
				input.reference,
				input.description,
				input.related_invoice_id,
				input.related_bill_id,
				input.related_payslip_id,
				input.business_bank_id
			]
		);
		if (result.lastInsertId === undefined) throw new Error("create: no lastInsertId");
		// Skip the in-memory reload when batching (opts.reload === false) — the
		// bulk payroll run refreshes vouchers once at the end instead of after
		// every payment.
		if (opts.reload !== false) await load();
		return result.lastInsertId;
	};

	const UPDATABLE: ReadonlyArray<keyof VoucherUpdate> = [
		"voucher_date",
		"party_name",
		"amount_cents",
		"payment_method",
		"reference",
		"description",
		"related_invoice_id",
		"related_bill_id",
		"related_payslip_id",
		"business_bank_id"
	];

	const update = async (id: number, patch: VoucherUpdate): Promise<void> => {
		if (patch.amount_cents !== undefined && patch.amount_cents <= 0) {
			throw new Error("Voucher amount must be positive");
		}
		const cols = UPDATABLE.filter((c) => Object.hasOwn(patch, c));
		if (cols.length === 0) return;
		const setClause = cols.map((c) => `${c} = ?`).join(", ");
		const params: unknown[] = cols.map((c) => patch[c] ?? null);
		params.push(id);
		await execute(`UPDATE vouchers SET ${setClause} WHERE id = ?`, params);
		await load();
	};

	const remove = async (id: number): Promise<void> => {
		await execute("DELETE FROM vouchers WHERE id = ?", [id]);
		await purgeDocumentAttachments("voucher", id);
		await load();
	};

	return {
		vouchers,
		loading,
		error,
		search,
		typeFilters,
		toggleTypeFilter,
		clearTypeFilters,
		dateFrom,
		dateTo,
		hasDateFilters,
		clearDateFilters,
		filtered,
		totalPayments,
		totalReceipts,
		loaded,
		load,
		ensureLoaded,
		get,
		create,
		update,
		remove
	};
});
