-- Phase: payroll — statutory auto-compute (EPF + ETF).
--
-- Adds the per-business rate config + master toggle to company_settings,
-- a per-line EPF-liable flag + auto-source tag on payslip_lines, and
-- the stored employer-contribution figures + per-payslip enable flag on
-- payslips. Rates are basis points (golden rule #3): 8% = 800.
--
-- Pre-1.0 additive ALTERs with SL-default seeds; no backfill. Existing
-- payslips keep auto_source NULL / epf_liable 1 / employer cols 0, which
-- is correct — they simply carry no managed EPF line.

ALTER TABLE company_settings ADD COLUMN statutory_auto_compute INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_settings ADD COLUMN epf_employee_rate_bp   INTEGER NOT NULL DEFAULT 800;
ALTER TABLE company_settings ADD COLUMN epf_employer_rate_bp   INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE company_settings ADD COLUMN etf_rate_bp            INTEGER NOT NULL DEFAULT 300;

ALTER TABLE payslip_lines ADD COLUMN epf_liable  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE payslip_lines ADD COLUMN auto_source TEXT;

ALTER TABLE payslips ADD COLUMN epf_employee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN epf_employer_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN etf_cents          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN statutory_enabled  INTEGER NOT NULL DEFAULT 1;
