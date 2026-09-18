import { describe, expect, it } from "vitest";
import {
	canTransitionCreditNote,
	CREDIT_NOTE_TRANSITIONS,
	invoiceMutationBlocker
} from "./document-guards";

describe("invoiceMutationBlocker", () => {
	const clean = { receipts: 0, issuedCreditNotes: 0 };

	it("allows every mutation on an invoice with no money or credit against it", () => {
		for (const op of ["cancel", "revert_to_draft", "delete", "revert_conversion"] as const) {
			expect(invoiceMutationBlocker(op, clean)).toBeNull();
		}
	});

	it("refuses cancel / revert / revert-conversion while receipts exist", () => {
		const links = { receipts: 2, issuedCreditNotes: 0 };
		expect(invoiceMutationBlocker("cancel", links)).toMatch(/receipt vouchers/i);
		expect(invoiceMutationBlocker("revert_to_draft", links)).toMatch(/receipt vouchers/i);
		expect(invoiceMutationBlocker("revert_conversion", links)).toMatch(/receipt vouchers/i);
	});

	it("still allows the universal delete with receipts — vouchers are unlinked, not lost", () => {
		expect(invoiceMutationBlocker("delete", { receipts: 2, issuedCreditNotes: 0 })).toBeNull();
	});

	// The v0.159.0 gap: an issued credit note reverses income + output VAT by
	// its own date. If its invoice is voided the reversal becomes phantom; if
	// the invoice is DELETED the FK nulls source_invoice_id and the note turns
	// into an unapplied client credit that nets off unrelated invoices.
	it("refuses every mutation while an issued credit note is linked", () => {
		const links = { receipts: 0, issuedCreditNotes: 1 };
		for (const op of ["cancel", "revert_to_draft", "delete", "revert_conversion"] as const) {
			expect(invoiceMutationBlocker(op, links)).toMatch(/credit note/i);
		}
	});

	it("reports the receipts problem first when both are present", () => {
		expect(invoiceMutationBlocker("cancel", { receipts: 1, issuedCreditNotes: 1 })).toMatch(/receipt vouchers/i);
	});
});

describe("credit note transitions", () => {
	it("matches the persisted FSM", () => {
		expect(CREDIT_NOTE_TRANSITIONS).toEqual({
			draft: ["issued", "cancelled"],
			issued: ["draft", "cancelled"],
			cancelled: ["draft"]
		});
	});

	it("rejects a transition the FSM doesn't list", () => {
		expect(canTransitionCreditNote("cancelled", "issued")).toBe(false);
		expect(canTransitionCreditNote("draft", "draft")).toBe(false);
	});

	it("accepts the legal ones", () => {
		expect(canTransitionCreditNote("draft", "issued")).toBe(true);
		expect(canTransitionCreditNote("issued", "cancelled")).toBe(true);
		expect(canTransitionCreditNote("cancelled", "draft")).toBe(true);
	});
});
