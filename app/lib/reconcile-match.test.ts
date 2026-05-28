import type { MatchInputs } from "./reconcile-match";
import { describe, expect, it } from "vitest";
import { suggestMatches } from "./reconcile-match";

const baseRow = {
	id: 1,
	business_bank_id: 1,
	statement_date: "2026-05-15",
	amount_cents: -50000, // payment
	reference: "TXN123",
	matched_voucher_id: null
};

const baseVoucher = {
	id: 100,
	business_bank_id: 1,
	voucher_type: "payment" as const,
	voucher_date: "2026-05-15",
	amount_cents: 50000,
	reference: "TXN123",
	reconciled_at: null
};

describe("suggestMatches", () => {
	it("returns the only candidate for an exact match", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [baseVoucher]
		} as MatchInputs);
		expect(result.get(1)).toEqual([{ voucher: baseVoucher, score: 120 }]);
	});

	it("excludes vouchers on a different bank", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [{ ...baseVoucher, business_bank_id: 2 }]
		} as MatchInputs);
		expect(result.get(1)).toEqual([]);
	});

	it("excludes vouchers with wrong sign", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [{ ...baseVoucher, voucher_type: "receipt" }]
		} as MatchInputs);
		expect(result.get(1)).toEqual([]);
	});

	it("excludes already-reconciled vouchers", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [{ ...baseVoucher, reconciled_at: "2026-05-16T10:00:00" }]
		} as MatchInputs);
		expect(result.get(1)).toEqual([]);
	});

	it("excludes amounts that don't match", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [{ ...baseVoucher, amount_cents: 49999 }]
		} as MatchInputs);
		expect(result.get(1)).toEqual([]);
	});

	it("excludes dates outside the ±3 day window", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [{ ...baseVoucher, voucher_date: "2026-05-19" }]
		} as MatchInputs);
		expect(result.get(1)).toEqual([]);
	});

	it("scores ±1 day at 100 (+ 20 for reference match = 120)", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [{ ...baseVoucher, voucher_date: "2026-05-16" }]
		} as MatchInputs);
		expect(result.get(1)?.[0]?.score).toBe(120);
	});

	it("scores ±2 days at 90", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [{ ...baseVoucher, voucher_date: "2026-05-17", reference: null }]
		} as MatchInputs);
		expect(result.get(1)?.[0]?.score).toBe(90);
	});

	it("scores ±3 days at 80", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [{ ...baseVoucher, voucher_date: "2026-05-18", reference: null }]
		} as MatchInputs);
		expect(result.get(1)?.[0]?.score).toBe(80);
	});

	it("adds 20 when references share a non-empty substring", () => {
		const result = suggestMatches({
			rows: [{ ...baseRow, reference: "ABC-TXN123-456" }],
			vouchers: [{ ...baseVoucher, reference: "TXN123" }]
		} as MatchInputs);
		expect(result.get(1)?.[0]?.score).toBe(120);
	});

	it("sorts multiple candidates by score desc, then date proximity asc, then id asc", () => {
		const result = suggestMatches({
			rows: [baseRow],
			vouchers: [
				{ ...baseVoucher, id: 100, voucher_date: "2026-05-18", reference: null }, // ±3 = 80
				{ ...baseVoucher, id: 101, voucher_date: "2026-05-15", reference: null }, // ±0 = 100
				{ ...baseVoucher, id: 102, voucher_date: "2026-05-16", reference: null } // ±1 = 100
			]
		} as MatchInputs);
		const got = result.get(1)?.map((c) => c.voucher.id);
		expect(got).toEqual([101, 102, 100]);
	});

	it("matches receipt vouchers against positive statement amounts", () => {
		const result = suggestMatches({
			rows: [{ ...baseRow, amount_cents: 50000 }],
			vouchers: [{ ...baseVoucher, voucher_type: "receipt" }]
		} as MatchInputs);
		expect(result.get(1)?.length).toBe(1);
	});

	it("skips already-matched statement rows", () => {
		const result = suggestMatches({
			rows: [{ ...baseRow, matched_voucher_id: 999 }],
			vouchers: [baseVoucher]
		} as MatchInputs);
		expect(result.get(1)).toBeUndefined();
	});
});
