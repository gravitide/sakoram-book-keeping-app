-- Phase 8: vendor management.
--
-- Mirrors the clients table — same identity / address / tax-id / notes /
-- archive shape — so the UI patterns from /clients can be reused
-- wholesale. Bills already carry their vendor info as free-text fields
-- (vendor_name, vendor_tax_id, vendor_address); the vendors table here
-- is initially a *standalone* address book. A future step can wire a
-- VendorPicker into the bills page that prefills those text fields
-- from a saved vendor, but bills.vendor_name etc. stay the source of
-- truth on the bill row (so existing data and snapshot semantics are
-- unaffected).

CREATE TABLE IF NOT EXISTS vendors (
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
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);
CREATE INDEX IF NOT EXISTS idx_vendors_archived ON vendors(is_archived);
