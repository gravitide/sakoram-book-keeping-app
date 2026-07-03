-- Split the PDF accent colour from the UI theme colour.
--
-- Previously generated PDFs inherited company_settings.theme_color (the same
-- name that drives every UI accent). Businesses want these independent — e.g.
-- a green app UI but red invoices. `pdf_theme_color` is the dedicated PDF
-- accent (a name from the THEME_COLORS palette, same 8 swatches as the UI).
--
-- Seeded from the current theme_color so existing PDFs render unchanged until
-- the user deliberately picks a different colour on the PDF settings page.
-- The PDF payload builders fall back to theme_color when this is NULL, so the
-- column is always safe to read.
ALTER TABLE company_settings ADD COLUMN pdf_theme_color TEXT;
UPDATE company_settings SET pdf_theme_color = theme_color WHERE pdf_theme_color IS NULL;
