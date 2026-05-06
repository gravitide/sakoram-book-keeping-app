-- Phase 1: foundation tables (settings, clients, document counters)
-- Money is stored as INTEGER cents of LKR. Tax rates as basis points (1800 = 18.00%).
-- Quantities as quantity_milli (qty * 1000) to support 3 decimal places.

CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Sri Lanka',
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_branch TEXT,
  logo_path TEXT,
  default_vat_rate INTEGER NOT NULL DEFAULT 1800,
  default_payment_terms_days INTEGER NOT NULL DEFAULT 30,
  default_quote_validity_days INTEGER NOT NULL DEFAULT 30,
  invoice_footer_notes TEXT,
  quote_footer_notes TEXT,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed the singleton row so settings page can always UPDATE.
INSERT OR IGNORE INTO company_settings (id, business_name) VALUES (1, 'Sakoram');

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Sri Lanka',
  tax_id TEXT,
  notes TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_archived ON clients(is_archived);

CREATE TABLE IF NOT EXISTS document_counters (
  document_type TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (document_type, fiscal_year)
);
