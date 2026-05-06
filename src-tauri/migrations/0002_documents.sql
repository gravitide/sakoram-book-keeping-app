-- Phase 3 + Phase 4 schema: quotes, invoices, and invoice payments.
-- We pre-create the invoices tables here so Phase 4 lands without another
-- migration churn. Bills + vouchers come in 0003 (Phase 5).
--
-- Bundle vs itemized pricing:
--   Each quote/invoice has a `pricing_mode`. In 'bundle' mode the line rows
--   describe scope only (item_label + description) and the document total
--   is entered directly into subtotal_cents. In 'itemized' mode the lines
--   carry qty/unit_price/tax and the totals are sums of line values. The
--   DB stores the resolved subtotal/tax/total either way; the mode flag
--   just tells the UI/PDF which inputs to expose.
--
-- Snapshots:
--   client_snapshot, prepared_by, and bank_details_snapshot are JSON or
--   plain-text copies of the relevant settings/client at issue time. Past
--   documents must remain stable even if the source records change later.

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  client_snapshot TEXT NOT NULL,           -- JSON: {name, address_lines[], tax_id}
  issue_date TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','rejected','expired','converted')),
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
  converted_invoice_id INTEGER,            -- FK to invoices(id), set when converted
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_issue_date ON quotes(issue_date);

CREATE TABLE IF NOT EXISTS quote_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  client_snapshot TEXT NOT NULL,
  source_quote_id INTEGER REFERENCES quotes(id),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled')),
  pricing_mode TEXT NOT NULL DEFAULT 'bundle'
    CHECK (pricing_mode IN ('bundle','itemized')),
  project_title TEXT NOT NULL DEFAULT '',
  vat_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  prepared_by TEXT,
  bank_details_snapshot TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

CREATE TABLE IF NOT EXISTS invoice_lines (
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
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  method TEXT,
  reference TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
