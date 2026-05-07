-- Add a separate font choice for PDFs.
--
-- Previously `ui_font` was used for both the in-app UI and the rendered
-- PDF (via the Typst template's font cascade). Splitting them lets a
-- user pick, say, "Google Sans Flex" for the UI but "Miriam Libre" or
-- "Inter" for printed documents — handy when the screen-reading
-- preference doesn't match the print preference.
--
-- Default mirrors the new ui_font default ('Google Sans Flex') so
-- existing tenants land on a sensible PDF font even before they touch
-- the appearance settings page.

ALTER TABLE company_settings ADD COLUMN pdf_font TEXT NOT NULL DEFAULT 'Google Sans Flex';
