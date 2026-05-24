-- Per-document title override.
--
-- The PDF "big header" is hardcoded per document type today
-- (QUOTATION / INVOICE / BILL). Some users want a finer label —
-- "Development quote", "Pro-forma invoice", "Recurring bill" — without
-- losing the business meaning of the doc type. Each row gains an
-- optional `title_override` text column; the PDF builder uses it
-- (upper-cased) when set and falls back to the hardcoded default
-- otherwise.
--
-- Vouchers + payslips are left untouched — they don't have a free-form
-- title to begin with (Receipt/Payment is the meaning; PAYSLIP is
-- legally constrained).

ALTER TABLE quotes   ADD COLUMN title_override TEXT;
ALTER TABLE invoices ADD COLUMN title_override TEXT;
ALTER TABLE bills    ADD COLUMN title_override TEXT;
