-- Selectable client-facing PDF templates, chosen per document type.
-- Free-text key validated by the Rust template registry (unknown -> classic).
ALTER TABLE company_settings ADD COLUMN pdf_template_invoice TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE company_settings ADD COLUMN pdf_template_quote   TEXT NOT NULL DEFAULT 'classic';
