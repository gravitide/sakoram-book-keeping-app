-- Switch the default UI font from Miriam Libre to Google Sans Flex.
--
-- Google Sans Flex is now bundled with the app (variable font, ~125 KB,
-- shipped both as a frontend asset for the UI and as a Typst font-path
-- entry for PDF rendering). Miriam Libre is no longer the natural
-- default since it's not bundled in the frontend CSS — users without
-- it installed locally would silently fall back to system-ui.
--
-- We only update rows that still hold the historical default
-- ('Miriam Libre'). Anyone who deliberately picked a different font
-- via the appearance settings keeps their choice. New tenants get the
-- old default from migration 0004 ('Miriam Libre') first, then this
-- migration immediately rewrites it — net effect is they start on
-- Google Sans Flex.
--
-- We can't change the column DEFAULT in SQLite without recreating the
-- table; the UPDATE here is the practical equivalent for our purposes.

UPDATE company_settings
SET ui_font = 'Google Sans Flex'
WHERE ui_font = 'Miriam Libre';
