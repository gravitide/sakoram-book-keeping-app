-- Phase: payroll — employees address book.
--
-- Mirrors clients / vendors in shape (identity + contact + archive)
-- with payroll-specific fields layered on: NIC, designation, joining
-- date, monthly basic salary in integer cents, and a bank-payment
-- block separate from company_settings (each employee may bank with
-- a different institution).
--
-- Keeping this standalone for v1 — the payslips table (0016) will FK
-- into employees with ON DELETE RESTRICT and snapshot the row at issue
-- so renames/edits don't rewrite history (same pattern as
-- vendor_snapshot on bills).

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  nic TEXT,
  designation TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Sri Lanka',
  joining_date TEXT,                         -- ISO YYYY-MM-DD
  basic_salary_cents INTEGER NOT NULL DEFAULT 0,
  bank_name TEXT,
  bank_branch TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  notes TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_employees_full_name ON employees(full_name);
CREATE INDEX IF NOT EXISTS idx_employees_archived ON employees(is_archived);
