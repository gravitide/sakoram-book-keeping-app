-- Letter settings: a managed category list + the pre-printed top-margin.
--
-- `letter_categories` is a simple managed lookup (name only — letters don't
-- need the colour/icon that bill_categories carry). It's the pick-list source
-- for the letter Category field; the letter itself still stores the category
-- as plain text (letters.category), so deleting a category never rewrites or
-- breaks existing letters.
--
-- `company_settings.letter_preprinted_top_margin_mm` drives how much blank
-- space letter.typ reserves at the top when a letter is set to "pre-printed
-- letterhead paper". Default 55mm (matches the previously hardcoded value).
--
-- Pre-1.0 destructive: brand-new table + column, no backfill.

CREATE TABLE letter_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE company_settings
  ADD COLUMN letter_preprinted_top_margin_mm INTEGER NOT NULL DEFAULT 55;
