-- Paper size: the sheet every PDF of the business is laid out on.
--
-- The stored value is the Typst paper name, so templates hand it straight to
-- `set page(paper: …)`. A4 is the default, so existing businesses render
-- exactly as before. Built-in Layout margins scale with the paper's width
-- relative to A4 (app/lib/page-settings.ts); type sizes never change.
ALTER TABLE company_settings ADD COLUMN pdf_paper_size TEXT NOT NULL DEFAULT 'a4'
	CHECK (pdf_paper_size IN ('a4', 'a5', 'us-letter', 'us-legal'));
