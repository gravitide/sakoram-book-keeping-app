-- Credit notes — Tier 2 workflow gap.
--
-- A credit note is a "negative invoice" issued to a client to:
--   - refund an over-invoiced amount,
--   - credit a return,
--   - apply a discount after the original invoice has been issued.
--
-- Schema mirrors invoices almost verbatim, plus:
--   - `source_invoice_id` — the invoice this credit is settled against
--     (nullable; standalone credit notes are allowed but the common
--     path is "credit X back against invoice Y").
--
-- When a credit note is issued AND linked to an invoice, the invoice's
-- derived balance subtracts the credit note's total (alongside the
-- receipt vouchers). Cancelled credit notes drop out of the math.
-- All of that derivation lives in app/stores/invoices.ts.
--
-- Numbering: credit notes get their own (document_type, fiscal_year)
-- counter — same atomic allocator every other document type uses.
-- Number format: CRN-YYYY-NNNN (e.g. CRN-2026-0001).
--
-- Pre-1.0 destructive: no backfill needed — no production tenant has
-- credit notes yet. Table is new from scratch.

CREATE TABLE credit_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  client_snapshot TEXT NOT NULL,
  -- Denormalised party name for list-page rendering (mirrors invoices
  -- post-migration 0028 — no JSON parse on every row).
  client_name TEXT NOT NULL DEFAULT '',
  -- Optional source invoice. ON DELETE SET NULL so a deleted invoice
  -- doesn't take its credit notes with it (the credit note retains
  -- its own number + client snapshot, just loses the cross-link).
  source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  issue_date TEXT NOT NULL,
  -- Persisted enum mirrors invoices: only the three states the user
  -- explicitly sets. There is no "partial" / "applied" state for v1
  -- — once issued, the credit's full amount counts against the
  -- linked invoice's balance. Future refinement: track partial
  -- application via separate ledger entries.
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','cancelled')),
  pricing_mode TEXT NOT NULL DEFAULT 'bundle'
    CHECK (pricing_mode IN ('bundle','itemized')),
  -- Free-text subject ("Refund for damaged item", "Credit for over-
  -- billing on May invoice", etc.). Renders as the project_title
  -- under the document header.
  project_title TEXT NOT NULL DEFAULT '',
  vat_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  -- Amounts are always stored positive. The "this is money going OUT
  -- of our books" sign is implicit in the document type — the PDF
  -- and the on-screen UI both make the negative-direction explicit
  -- in labels rather than carrying signed integers around (which
  -- would complicate the rest of the line-total math).
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  -- Optional override for the big PDF header ("Refund note" instead
  -- of the default "CREDIT NOTE"). Same column shape as the other
  -- documents post-migration 0027.
  title_override TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_credit_notes_client ON credit_notes(client_id);
CREATE INDEX idx_credit_notes_status ON credit_notes(status);
CREATE INDEX idx_credit_notes_source_invoice ON credit_notes(source_invoice_id);
CREATE INDEX idx_credit_notes_issue_date ON credit_notes(issue_date);
CREATE INDEX idx_credit_notes_client_name ON credit_notes(client_name);

CREATE TABLE credit_note_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  item_label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  quantity_milli INTEGER NOT NULL DEFAULT 1000,
  unit TEXT,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  line_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  line_tax_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_credit_note_lines_credit_note ON credit_note_lines(credit_note_id);
