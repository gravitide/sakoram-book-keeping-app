-- Reusable letter signature templates.
--
-- A saved sign-off (rich text) the user can insert into any letter. Applying
-- one copies its body_json into the letter's own signature_json (letters stay
-- self-contained), so this table is only a template source — no FK from
-- letters. At most one row is the default (enforced by the store's setDefault,
-- which is a single atomic CASE-WHEN update); the default pre-fills new letters.

CREATE TABLE letter_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body_json TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_letter_signatures_default ON letter_signatures(is_default);
