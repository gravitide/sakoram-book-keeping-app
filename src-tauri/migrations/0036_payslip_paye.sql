-- Phase: payroll — PAYE / APIT auto-compute (monthly tax-table method).
--
-- Configurable progressive table on company_settings: a tax-free relief,
-- a JSON bracket array (taxable-income upper bounds in cents + basis-point
-- rates; null upper bound = open top band), and a "deduct employee EPF
-- before PAYE" flag. Master toggle defaults OFF (PAYE withholding is
-- employer/threshold-specific — opt-in, unlike near-universal EPF).
--
-- Seed = current SL 2025/26 monthly table: relief Rs 150,000; bands
-- 6% / 18% / 24% / 30% / 36%.
--
-- payslips store the frozen paye figure + a per-payslip enable flag (seeded
-- from settings). payslip_lines reuse auto_source with the new value 'paye'
-- — no new line column. Pre-1.0 additive ALTERs; no backfill.

ALTER TABLE company_settings ADD COLUMN paye_auto_compute INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN paye_relief_cents INTEGER NOT NULL DEFAULT 15000000;
ALTER TABLE company_settings ADD COLUMN paye_deduct_epf   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_settings ADD COLUMN paye_brackets     TEXT NOT NULL DEFAULT '[{"upToCents":8333333,"rateBp":600},{"upToCents":12500000,"rateBp":1800},{"upToCents":16666667,"rateBp":2400},{"upToCents":20833333,"rateBp":3000},{"upToCents":null,"rateBp":3600}]';

ALTER TABLE payslips ADD COLUMN paye_cents   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN paye_enabled INTEGER NOT NULL DEFAULT 0;
