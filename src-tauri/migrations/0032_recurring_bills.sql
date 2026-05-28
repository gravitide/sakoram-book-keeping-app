-- Recurring bills — Tier 2 productivity feature (vendor-side mirror of
-- recurring_invoices, migration 0030+0031).
--
-- A recurring bill is a TEMPLATE, not an issued bill. The user sets one
-- up ("Office rent — Landlord LLC, monthly, Rs 75,000") and Sakoram
-- tracks when each template's next bill is due. Generation is
-- user-initiated, not automatic: the /recurring-bills page surfaces a
-- "pending" count and a one-click flow that materialises the pending
-- templates as real bills (status `unpaid`) in the bills table.
--
-- The template carries its own vendor_id + vendor_snapshot pair (same
-- pattern every other document uses post-migration 0028), an optional
-- category (mirrors bills — invoice templates don't carry one), plus a
-- tiny bag of bill defaults — pricing_mode, vat_rate_basis_points,
-- payment_terms_days, notes — used as the seed for each generated bill.
-- No business_bank_id (bills don't carry one — we're paying THEM) and
-- no project_title (vendor invoices typically don't have one).
--
-- Lines table mirrors recurring_invoice_lines verbatim. The
-- bundle_subtotal_cents column from recurring_invoices 0031 is folded
-- in from the start here (no separate migration).
--
-- next_issue_date is the load-bearing column: anything where
-- is_paused=0 AND next_issue_date <= today AND
-- (end_date IS NULL OR end_date >= next_issue_date) is "pending". The
-- store's generateOne() advances next_issue_date by one frequency step
-- after inserting the generated bill, so each click of the
-- generate-pending button consumes one cycle.
--
-- Pre-1.0 destructive: brand-new tables, no backfill.

CREATE TABLE recurring_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_name TEXT NOT NULL,
  is_paused INTEGER NOT NULL DEFAULT 0 CHECK (is_paused IN (0, 1)),

  -- Vendor (FK + snapshot — same pattern bills use)
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  vendor_snapshot TEXT NOT NULL,
  -- Denormalised from vendor_snapshot.name — set whenever the snapshot
  -- is written so the list page can sort + search the vendor column
  -- without paying a JSON.parse per row.
  vendor_name TEXT,

  -- Optional bill category. Mirrors bills.category_id + the trio of
  -- denormalised display columns (set whenever category_snapshot is
  -- set). When the category is later deleted, category_id falls to
  -- NULL but the snapshot copy stays — same shape as bills.
  category_id INTEGER REFERENCES bill_categories(id) ON DELETE SET NULL,
  category_snapshot TEXT,
  category_name TEXT,
  category_color TEXT,
  category_icon TEXT,

  -- Schedule
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date TEXT NOT NULL,
  next_issue_date TEXT NOT NULL,
  end_date TEXT,  -- optional stop date

  -- Bill defaults — used as the seed for each generated bill.
  pricing_mode TEXT NOT NULL DEFAULT 'bundle' CHECK (pricing_mode IN ('bundle', 'itemized')),
  -- Bundle-mode lump-sum amount. Ignored when pricing_mode is
  -- 'itemized' (totals roll up from line qty × price × VAT). Defaults
  -- to 0 on freshly-created templates.
  bundle_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  vat_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  notes TEXT,

  -- Tracking
  bills_generated INTEGER NOT NULL DEFAULT 0,
  last_generated_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recurring_bills_pending ON recurring_bills(next_issue_date) WHERE is_paused = 0;
CREATE INDEX idx_recurring_bills_vendor ON recurring_bills(vendor_id);
CREATE INDEX idx_recurring_bills_category ON recurring_bills(category_id);

CREATE TABLE recurring_bill_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recurring_bill_id INTEGER NOT NULL REFERENCES recurring_bills(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  item_label TEXT NOT NULL,
  description TEXT,
  quantity_milli INTEGER NOT NULL DEFAULT 1000,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  vat_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  UNIQUE (recurring_bill_id, position)
);

CREATE INDEX idx_recurring_bill_lines_parent ON recurring_bill_lines(recurring_bill_id);
