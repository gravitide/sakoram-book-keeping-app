# Revert a converted quote to draft — design

**Date:** 2026-07-11
**Status:** Approved

## Problem

Converting a quote creates a linked invoice and moves the quote to the
terminal `converted` status. If the owner converted by mistake (wrong
quote, premature conversion, errors discovered afterwards), there is no
way back — the quote is locked and the stray invoice lingers. This is an
owner-managed single-user app: the owner takes responsibility for
destructive actions, so a deliberate revert affordance is appropriate.
(Password protection for such actions is a possible future follow-up,
out of scope here.)

## Decision summary

- New compound store method `revertConversion(quoteId)` on the quotes
  store — the exact inverse of the existing `markConverted`.
- Revert is **blocked while the linked invoice has recorded payments**
  (receipt vouchers). The user must delete those vouchers first —
  mirrors the existing "cancel is refused once payments exist" guard.
  Money records are never silently touched.
- The action appears on the **quote detail page only** (header button +
  ⋯ dropdown entry when the quote is `converted`). Not on list row
  menus, not on the invoice detail page.
- The quote returns to **`draft`** (user's explicit choice — full
  re-edit, not `accepted`).

## Store logic — `app/stores/quotes.ts`

`revertConversion(quoteId: number): Promise<void>`:

1. Load the quote. Guard: must be status `converted` with a non-null
   `converted_invoice_id`; otherwise throw.
2. Payments guard: direct SQL count of vouchers where
   `related_invoice_id = <invoiceId> AND voucher_type = 'receipt'`.
   If any exist, throw
   `"This invoice has recorded payments. Delete the receipt vouchers first, then revert."`
   (Direct SQL, not the vouchers store — the store may not be loaded.)
3. Delete the invoice via `invoicesStore.remove(invoiceId)`. That method
   already nulls `quotes.converted_invoice_id`, nulls any remaining
   voucher links, cascades `invoice_lines`, and purges invoice
   attachments.
4. Flip the quote back:
   `UPDATE quotes SET status = 'draft', converted_invoice_id = NULL, updated_at = datetime('now') WHERE id = ?`
   then `load()`.

Ordering + atomicity: sequential auto-commits per the connection-pool
rule. The invoice is deleted **before** the quote flips, so a crash
mid-way can never leave a draft quote pointing at a live invoice. The
worst crash window leaves a `converted` quote with a null
`converted_invoice_id`. To make re-running the revert recover from that
state, step 1's guard accepts `status = 'converted'` with a null link
as a degenerate case: skip steps 2–3 and just flip the quote to draft.
The operation is therefore idempotent across a crash.

`STATUS_TRANSITIONS` stays `converted: []` — revert is a compound
operation invoked by name, not a free transition, exactly like
`markConverted` is on the way in. The DB CHECK constraint on
`quotes.status` only validates values, so no schema change.

The allocated INV number is *not* rolled back (counters never
decrement). The gap is recoverable via the existing editable-sequence
gap-fill affordance on the New-invoice modal and the convert dialog.

## UI — `app/pages/quotes/[id].vue`

- When `status === 'converted'`: a **Revert to draft** button
  (icon `i-lucide-undo-2`, warning tone) joins the header cluster, and
  a matching entry lands in `actionMenuItems` (grouped with the
  transition actions).
- Clicking opens a confirm `UModal`:
  > Invoice **INV-0012** and its attachments will be permanently
  > deleted, and this quote returns to draft.
  Cancel / Revert to draft (error-tone confirm button).
- On confirm: call `quotesStore.revertConversion(quoteId)`, then patch
  the keep-alive local refs (`quote.value.status = 'draft'`,
  `converted_invoice_id = null`, `convertedInvoice.value = null`),
  success toast, stay on the quote page (now fully editable).
- If the store throws (payments guard), show the standard error toast
  with the thrown message.

## Out of scope

- Password / PIN protection on the revert (future follow-up the user
  mentioned).
- Reverting from the invoice side or from list rows.
- Rolling back the document-number counter.

## Testing

No new unit tests: the logic is guarded SQL inside a Pinia store, which
is not unit-testable per project convention (stores import `~/lib/db` →
Tauri). No pure-logic extraction is warranted for two SQL statements.
Verification is hands-on via `bun run tauri:dev`: convert a quote,
revert it, confirm the invoice is gone and the quote is an editable
draft; record a payment on another converted quote's invoice and confirm
the revert is refused with the guard message.

## Versioning

Minor feature bump → `0.141.0` across `package.json`,
`src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (+ `Cargo.lock`).
