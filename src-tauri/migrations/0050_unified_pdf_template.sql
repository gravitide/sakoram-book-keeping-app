-- One PDF template for every document, replacing the per-type columns.
--
-- pdf_template_invoice / pdf_template_quote (migration 0037) only ever
-- reached quotes and invoices; bills were hardcoded to classic and payslips
-- had their own standalone template entirely. Collapsing to a single column
-- lets the payslip and bill obey the user's choice too. Per-type divergence
-- can come back later as a purely additive change.
--
-- The INVOICE choice wins the collapse: it is the document users tune first,
-- so carrying it forward keeps the most-seen output visually unchanged.

ALTER TABLE company_settings ADD COLUMN pdf_template TEXT NOT NULL DEFAULT 'classic';
UPDATE company_settings SET pdf_template = pdf_template_invoice;
ALTER TABLE company_settings DROP COLUMN pdf_template_invoice;
ALTER TABLE company_settings DROP COLUMN pdf_template_quote;
