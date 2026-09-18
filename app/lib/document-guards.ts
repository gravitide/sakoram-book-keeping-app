// Pure lifecycle guards shared by the invoices / quotes / credit-notes stores.
//
// Lives in app/lib (not a store) so vitest can import it — stores drag in
// ~/lib/db (Tauri). The stores do the SQL counting and hand the numbers here.
//
// WHY this exists: credit notes were wired into the books in v0.159.0 (an
// issued note reduces its invoice's balance and reverses income + output VAT
// by its own date), but nothing tied them into the INVOICE lifecycle:
//
//   - cancel / revert-to-draft only counted receipt vouchers, so an invoice
//     could be voided while its issued credit note kept reversing revenue
//     that was no longer recognised (phantom negative income + VAT);
//   - delete / quote revert-conversion nulled credit_notes.source_invoice_id
//     via the FK, silently turning the note into an UNAPPLIED client credit
//     that then netted off that client's unrelated invoices.
//
// The rule: an issued credit note pins its invoice. Cancel or un-issue the
// credit note first — same shape as "delete the receipt vouchers first".

import type { CreditNoteStatus } from "~/stores/credit_notes";

export type InvoiceMutation = "cancel" | "revert_to_draft" | "delete" | "revert_conversion";

export interface InvoiceLinks {
	/** Receipt vouchers with related_invoice_id = this invoice. */
	receipts: number
	/** Credit notes with source_invoice_id = this invoice AND status = 'issued'. */
	issuedCreditNotes: number
}

const THEN: Record<InvoiceMutation, string> = {
	cancel: "then cancel",
	revert_to_draft: "then revert to draft",
	delete: "then delete",
	revert_conversion: "then revert"
};

/// Returns the user-facing reason a mutation must be refused, or null when
/// it may proceed. Receipts are reported first — they're the older, more
/// familiar guard, and clearing them is usually the bigger job.
///
/// `delete` deliberately ignores receipts: the universal delete unlinks the
/// vouchers and keeps them (they record real money). A credit note can't be
/// treated the same way — unlinked, it changes meaning.
export const invoiceMutationBlocker = (op: InvoiceMutation, links: InvoiceLinks): string | null => {
	if (op !== "delete" && links.receipts > 0) {
		return `This invoice has recorded payments. Delete the receipt vouchers first, ${THEN[op]}.`;
	}
	if (links.issuedCreditNotes > 0) {
		return `This invoice has an issued credit note against it. Cancel or un-issue the credit note first, ${THEN[op]}.`;
	}
	return null;
};

/// Persisted credit-note FSM. The DB CHECK only constrains the value set;
/// this is the single source of truth for which moves are legal (the detail
/// page renders its transition buttons from it, the store enforces it).
export const CREDIT_NOTE_TRANSITIONS: Record<CreditNoteStatus, CreditNoteStatus[]> = {
	draft: ["issued", "cancelled"],
	issued: ["draft", "cancelled"],
	cancelled: ["draft"]
};

export const canTransitionCreditNote = (from: CreditNoteStatus, to: CreditNoteStatus): boolean =>
	CREDIT_NOTE_TRANSITIONS[from].includes(to);
