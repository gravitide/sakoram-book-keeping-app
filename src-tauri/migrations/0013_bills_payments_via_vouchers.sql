-- Bills: drop the embedded paid_cents column and collapse the payment-state
-- statuses (unpaid/partial/paid/overdue) onto a single 'open' status. From
-- now on, payments against a bill are recorded as payment vouchers
-- (vouchers.related_bill_id), and the "amount paid", "balance", and
-- effective payment status are derived in JS from the linked vouchers.
--
-- This makes the voucher ledger the single source of truth for cash flow:
-- creating a payment voucher is the only way to register that money left
-- the till, and the bill's paid/unpaid presentation falls out of that.
--
-- Pre-1.0 destructive migration: bills + bill_lines are dropped and
-- recreated. See "Pre-1.0 status" in CLAUDE.md. SCHEMA_VERSION → 13.

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
  -- Only two terminal user-set states. The unpaid / partial / paid /
  -- overdue presentation is derived from the linked payment vouchers
  -- and the due date — see app/stores/bills.ts derivedStatus().
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','cancelled')),
  pricing_mode TEXT NOT NULL DEFAULT 'bundle'
    CHECK (pricing_mode IN ('bundle','itemized')),
  vat_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES bill_categories(id),
  category_snapshot TEXT,
  notes TEXT,
  attachment_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_due_date ON bills(due_date);
CREATE INDEX idx_bills_vendor ON bills(vendor_id);
CREATE INDEX idx_bills_category ON bills(category_id);

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
