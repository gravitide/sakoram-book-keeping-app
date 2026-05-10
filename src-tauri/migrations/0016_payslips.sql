-- Phase: payroll — payslips and their line items.
--
-- Mirrors bills' shape (issued doc with snapshot + lines + status FSM)
-- but trimmed for payroll: no pricing_mode, no tax-rate per line.
-- Each line is either an EARNING (basic, allowance, overtime, bonus)
-- or a DEDUCTION (EPF, PAYE, salary advance, etc.). Net = earnings −
-- deductions, recomputed when lines change.
--
-- Status persisted: draft / issued / cancelled. The richer
-- unpaid|partial|paid view the UI shows is derived in the store from
-- vouchers.related_payslip_id (added in migration 0017), exactly the
-- same way bills do it.
--
-- One payslip per (employee, period_start) — enforced via UNIQUE.
-- This catches the "I issued April twice by mistake" case at the DB
-- level. Bonuses or corrections for the same period either ride on
-- the same payslip as extra lines, or use a different period_start.

CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  fiscal_year INTEGER NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  employee_snapshot TEXT NOT NULL,             -- JSON, frozen at create
  period_start TEXT NOT NULL,                   -- ISO YYYY-MM-DD (usually month start)
  period_end TEXT NOT NULL,                     -- ISO YYYY-MM-DD (usually month end)
  pay_date TEXT NOT NULL,                       -- ISO YYYY-MM-DD
  earnings_cents INTEGER NOT NULL DEFAULT 0,
  deductions_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_period_start ON payslips(period_start);
CREATE INDEX IF NOT EXISTS idx_payslips_pay_date ON payslips(pay_date);
CREATE INDEX IF NOT EXISTS idx_payslips_status ON payslips(status);

CREATE TABLE IF NOT EXISTS payslip_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payslip_id INTEGER NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('earning','deduction')),
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_payslip_lines_payslip ON payslip_lines(payslip_id);
