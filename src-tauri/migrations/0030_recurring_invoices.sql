-- Recurring invoices — Tier 2 productivity feature.
--
-- A recurring invoice is a TEMPLATE, not an issued document. The user
-- sets one up ("Acme Co, monthly retainer, Rs 50,000 + VAT") and
-- Sakoram tracks when each template's next invoice is due. Generation
-- is user-initiated, not automatic: the /recurring-invoices page
-- surfaces a "pending" count and a one-click flow that materialises
-- the pending templates as real draft invoices in the invoices table.
--
-- The template carries its own client_id + client_snapshot pair (same
-- pattern every other document uses post-migration 0028) plus a tiny
-- bag of invoice defaults — pricing_mode, vat_rate_basis_points,
-- payment_terms_days, project_title, notes, business_bank_id — used
-- as the seed for each generated invoice. The lines table mirrors
-- invoice_lines verbatim (label, description, qty, unit price, VAT).
--
-- next_issue_date is the load-bearing column: anything where
-- is_paused=0 AND next_issue_date <= today AND
-- (end_date IS NULL OR end_date >= next_issue_date) is "pending".
-- The store's generateOne() advances next_issue_date by one frequency
-- step after inserting the generated invoice, so each click of the
-- generate-pending button consumes one cycle.
--
-- Pre-1.0 destructive: brand-new tables, no backfill.

CREATE TABLE recurring_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_name TEXT NOT NULL,
  is_paused INTEGER NOT NULL DEFAULT 0 CHECK (is_paused IN (0, 1)),

  -- Client (FK + snapshot — same pattern every other doc uses)
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  client_snapshot TEXT NOT NULL,
  -- Denormalised from client_snapshot.name — set whenever the
  -- snapshot is written so the list page can sort + search the
  -- client column without paying a JSON.parse per row.
  client_name TEXT,

  -- Schedule
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date TEXT NOT NULL,
  next_issue_date TEXT NOT NULL,
  end_date TEXT,  -- optional stop date

  -- Invoice defaults — used as the seed for each generated invoice
  project_title TEXT,
  pricing_mode TEXT NOT NULL DEFAULT 'itemized' CHECK (pricing_mode IN ('bundle', 'itemized')),
  vat_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  notes TEXT,
  business_bank_id INTEGER REFERENCES business_banks(id) ON DELETE SET NULL,

  -- Tracking
  invoices_generated INTEGER NOT NULL DEFAULT 0,
  last_generated_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recurring_invoices_pending ON recurring_invoices(next_issue_date) WHERE is_paused = 0;
CREATE INDEX idx_recurring_invoices_client ON recurring_invoices(client_id);

CREATE TABLE recurring_invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recurring_invoice_id INTEGER NOT NULL REFERENCES recurring_invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  item_label TEXT NOT NULL,
  description TEXT,
  quantity_milli INTEGER NOT NULL DEFAULT 1000,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  vat_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  UNIQUE (recurring_invoice_id, position)
);

CREATE INDEX idx_recurring_invoice_lines_parent ON recurring_invoice_lines(recurring_invoice_id);
