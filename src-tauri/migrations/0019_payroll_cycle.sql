-- Phase: payroll — per-tenant cycle template (period + pay-date rule).
--
-- These three columns describe the *default* payroll cycle for the
-- business, so the bulk payslip flow and the upcoming-cycle widget on
-- the payroll dashboard can derive concrete dates from a month picker
-- instead of asking the user to enter three dates every time.
--
-- All three are day-of-month integers (1..31). At runtime we clamp to
-- `min(day, daysInMonth(month, year))`, which means 31 naturally means
-- "last day of whatever month this is" — February becomes 28/29
-- automatically, April 30, etc. No magic sentinel needed.
--
-- Defaults model the most common Sri Lankan setup:
--   - period: 1st → last of the calendar month
--   - pay date: last day of the same month

ALTER TABLE company_settings ADD COLUMN payroll_period_start_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_settings ADD COLUMN payroll_period_end_day   INTEGER NOT NULL DEFAULT 31;
ALTER TABLE company_settings ADD COLUMN payroll_pay_day          INTEGER NOT NULL DEFAULT 31;
