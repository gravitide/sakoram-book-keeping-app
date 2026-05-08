-- Switch the default UI/PDF font from Google Sans Flex to Inter, and
-- drop Google Sans Flex from the bundled font set.
--
-- The app now ships Inter (variable) + Inter Tight (variable) + Miriam
-- Libre (static Regular/Bold). Google Sans Flex is no longer bundled,
-- so any tenant whose ui_font / pdf_font still points at it would fall
-- through to system-ui on the next launch. Rewrite those rows to
-- "Inter" so the UI keeps a guaranteed-bundled face.
--
-- Tenants who deliberately picked something else (Inter, Miriam Libre,
-- a system font) keep their choice — only the default-by-default rows
-- get rewritten.

UPDATE company_settings
SET ui_font = 'Inter'
WHERE ui_font = 'Google Sans Flex';

UPDATE company_settings
SET pdf_font = 'Inter'
WHERE pdf_font = 'Google Sans Flex';
