-- Invoices: same refactor we did for bills in migration 0013. Drop the
-- embedded paid_cents column, drop the standalone invoice_payments
-- ledger entirely, and collapse the persisted status enum to the three
-- states the user explicitly sets: draft | sent | cancelled. The
-- user-visible partial / paid / overdue states are now **derived** in
-- JS from the sum of receipt vouchers where vouchers.related_invoice_id
-- matches, the invoice's total_cents, and today's date vs due_date.
--
-- Single source of truth for cash flow: creating a receipt voucher
-- against an invoice is the only way money received gets registered.
--
-- Pre-1.0 destructive migration: invoices + invoice_lines are dropped
-- and recreated. invoice_payments is dropped without a replacement.
-- See "Pre-1.0 status" in CLAUDE.md. SCHEMA_VERSION → 14.
--
-- Soft FKs that point at invoices(id) — quotes.converted_invoice_id
-- and vouchers.related_invoice_id — are nulled before the drop so we
-- don't leave dangling references when the invoice IDs reset.

UPDATE quotes SET converted_invoice_id = NULL;
UPDATE vouchers SET related_invoice_id = NULL;

DROP TABLE IF EXISTS invoice_payments;
DROP TABLE IF EXISTS invoice_lines;
DROP TABLE IF EXISTS invoices;

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  client_snapshot TEXT NOT NULL,
  source_quote_id INTEGER REFERENCES quotes(id),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  -- Persisted enum: only the three states the user sets directly.
  -- Derived: 'partial' / 'paid' / 'overdue' come from
  -- app/stores/invoices.ts derivedStatus().
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','cancelled')),
  pricing_mode TEXT NOT NULL DEFAULT 'bundle'
    CHECK (pricing_mode IN ('bundle','itemized')),
  project_title TEXT NOT NULL DEFAULT '',
  vat_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  prepared_by TEXT,
  bank_details_snapshot TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

CREATE TABLE invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
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
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
