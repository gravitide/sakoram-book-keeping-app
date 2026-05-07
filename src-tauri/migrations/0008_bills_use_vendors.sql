-- Bills: swap free-text vendor fields for a foreign key + snapshot.
--
-- Old shape:
--   bills.vendor_name, vendor_tax_id, vendor_address (all free text)
--
-- New shape (mirrors how quotes/invoices treat clients):
--   bills.vendor_id        FK → vendors(id)
--   bills.vendor_snapshot  JSON copy of the vendor row at issue time
--
-- The user manages a saved address book on /vendors, picks one when
-- creating a bill, and the snapshot freezes the vendor info at that
-- moment so future renames/edits don't rewrite history.
--
-- This is a destructive migration: bills + bill_lines are dropped and
-- recreated. We're pre-1.0 (no production data) — see the "Pre-1.0
-- status" section in CLAUDE.md. SCHEMA_VERSION is bumped accordingly
-- so backup bundles stay version-aligned.

DROP TABLE IF EXISTS bill_lines;
DROP TABLE IF EXISTS bills;

CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  vendor_snapshot TEXT NOT NULL,
  vendor_invoice_number TEXT,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid','partial','paid','overdue','cancelled')),
  pricing_mode TEXT NOT NULL DEFAULT 'bundle'
    CHECK (pricing_mode IN ('bundle','itemized')),
  vat_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  notes TEXT,
  attachment_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_due_date ON bills(due_date);
CREATE INDEX idx_bills_vendor ON bills(vendor_id);

CREATE TABLE bill_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
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
CREATE INDEX idx_bill_lines_bill ON bill_lines(bill_id);
