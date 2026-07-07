-- Letters — free-form correspondence on the business letterhead.
--
-- A non-financial document type: service letters, internship confirmations,
-- any typed letter the user wants to render on the company letterhead and
-- keep track of. No line items, no money, no party snapshot — a letter is
-- entirely self-contained free text (recipient + subject + rich-text body).
--
-- `number` is a reference the user can keep, override, or clear — NOT a
-- gapless legal number. It is auto-suggested as LET-YYYY-NNNN via the shared
-- document_counters allocator but stored as a plain, non-unique string
-- (a custom "SAK/HR/2026/012" or an empty value are both allowed).
--
-- `body_json` holds the TipTap/ProseMirror rich-text document as JSON.
-- `pre_printed` = 1 reserves blank top space for physical pre-printed
-- stationery; 0 (default) makes the PDF render the app letterhead.
--
-- Pre-1.0 destructive: brand-new table, no backfill.

CREATE TABLE letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Reference (see header). Non-unique + default '' so it can be cleared
  -- or given a custom format.
  number TEXT NOT NULL DEFAULT '',
  letter_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  recipient_name TEXT NOT NULL DEFAULT '',
  recipient_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  -- TipTap/ProseMirror document JSON. Empty string = empty document.
  body_json TEXT NOT NULL DEFAULT '',
  signatory_name TEXT NOT NULL DEFAULT '',
  signatory_title TEXT NOT NULL DEFAULT '',
  pre_printed INTEGER NOT NULL DEFAULT 0 CHECK (pre_printed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_letters_letter_date ON letters(letter_date);
CREATE INDEX idx_letters_category ON letters(category);
