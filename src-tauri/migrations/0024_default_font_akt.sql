-- Switch the default UI / PDF font from Inter to Akt.
--
-- Akt is a geometric sans-serif bundled with the app (static-weight
-- TTFs under app/assets/fonts/ and src-tauri/fonts/, plus @font-face
-- declarations in main.css and a Typst font-path entry for PDFs).
-- Migration 0010 moved the default from Google Sans Flex to Inter;
-- this one moves it from Inter to Akt.
--
-- Tenants whose ui_font / pdf_font still holds the historical default
-- ("Inter") get rewritten. Anyone who deliberately picked a different
-- font via the appearance / PDF settings pages keeps their choice.
-- We can't change the column DEFAULT in SQLite without recreating the
-- table; the UPDATE here is the practical equivalent for our purposes
-- (fresh tenants land on Akt after the full migration chain runs).
-- SCHEMA_VERSION → 24.

UPDATE company_settings
SET ui_font = 'Akt'
WHERE ui_font = 'Inter';

UPDATE company_settings
SET pdf_font = 'Akt'
WHERE pdf_font = 'Inter';
