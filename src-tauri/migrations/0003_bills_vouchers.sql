-- Phase 5 schema: bills (vendor invoices we receive) + vouchers
-- (payment/receipt log).
--
-- Bills mirror our invoices conceptually but carry vendor-side identity:
-- the vendor's name and their invoice number live on the row directly,
-- since bills don't link to a `clients` row. Line items follow the same
-- itemized/bundle dichotomy as quotes/invoices, but the UI defaults to
-- header-only entry — most users just record a single total per bill
-- with the vendor's PDF attached.
--
-- Vouchers are intentionally generic: they're a money-in/money-out log
-- that can stand alone OR reference an invoice / bill. v1 doesn't auto-
-- create vouchers from invoice payments; users record vouchers manually
-- when they want a separate payment-record document.

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,                     -- internal: BIL-YYYY-NNNN
  vendor_name TEXT NOT NULL,
  vendor_tax_id TEXT,
  vendor_address TEXT,
  vendor_invoice_number TEXT,                      -- the number on THEIR invoice
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
  category TEXT,                                   -- 'utilities','rent','supplies',...
  notes TEXT,
  attachment_path TEXT,                            -- scan/PDF of vendor's invoice
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);
CREATE INDEX IF NOT EXISTS idx_bills_vendor ON bills(vendor_name);

CREATE TABLE IF NOT EXISTS bill_lines (
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
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON bill_lines(bill_id);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,                     -- VCH-YYYY-NNNN
  voucher_type TEXT NOT NULL
    CHECK (voucher_type IN ('payment','receipt')),
  voucher_date TEXT NOT NULL,
  party_name TEXT NOT NULL,                        -- who was paid / who paid
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payment_method TEXT,                             -- 'cash','bank_transfer','cheque','card','other'
  reference TEXT,                                  -- cheque no, txn id
  description TEXT,
  related_invoice_id INTEGER REFERENCES invoices(id),
  related_bill_id INTEGER REFERENCES bills(id),
  attachment_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(voucher_date);
CREATE INDEX IF NOT EXISTS idx_vouchers_invoice ON vouchers(related_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_bill ON vouchers(related_bill_id);
