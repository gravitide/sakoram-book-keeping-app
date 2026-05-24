-- Migration 0023: multi-bank business accounts.
--
-- Replaces the single bank record embedded in company_settings with a
-- managed list of bank accounts (`business_banks`). Quote and invoice
-- rows gain a FK to the bank chosen at create / edit time. The existing
-- `bank_details_snapshot` JSON column on quotes / invoices stays — it's
-- still the immutable post-issue copy that the PDF templates render
-- from, so no PDF / template change is needed.
--
-- Pre-1.0: no data preservation. Existing dev tenants need to re-enter
-- their bank details via the new UI after migrating. SCHEMA_VERSION → 23.

-- --- Bank accounts ---------------------------------------------------
--
-- `is_default` (0/1) + a partial unique index together guarantee that
-- at most one non-archived row carries is_default = 1. The setDefault
-- operation in the store flips this with a single CASE-WHEN UPDATE so
-- the swap is atomic under the connection-pool caveat (no JS BEGIN /
-- COMMIT across multiple statements).
--
-- `archived` lets the user soft-delete banks. Issued documents already
-- have the bank details frozen in their `bank_details_snapshot`, so
-- archived banks have no effect on historical PDFs. Drafts referencing
-- an archived bank fall back to the current default at next save.
CREATE TABLE business_banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_branch TEXT,
  is_default INTEGER NOT NULL DEFAULT 0
    CHECK (is_default IN (0, 1)),
  archived INTEGER NOT NULL DEFAULT 0
    CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_business_banks_unique_default
  ON business_banks (is_default)
  WHERE is_default = 1 AND archived = 0;

-- --- company_settings cleanup ----------------------------------------
--
-- The four bank_* columns on company_settings are gone. Bank info now
-- lives only in `business_banks`. Using ALTER TABLE DROP COLUMN (SQLite
-- ≥ 3.35) instead of the codebase's usual drop+recreate pattern because
-- company_settings has ~20 unrelated columns we'd otherwise have to
-- re-declare.
ALTER TABLE company_settings DROP COLUMN bank_name;
ALTER TABLE company_settings DROP COLUMN bank_account_name;
ALTER TABLE company_settings DROP COLUMN bank_account_number;
ALTER TABLE company_settings DROP COLUMN bank_branch;

-- --- Document → bank link --------------------------------------------
--
-- `business_bank_id` records which bank the user picked at the time of
-- create / edit. ON DELETE SET NULL because the historical bank info
-- already lives in the document's bank_details_snapshot JSON — losing
-- the FK doesn't break the PDF, it just means "the bank that was used
-- is no longer in the active list". Drafts with NULL fall back to the
-- current default at next save.
ALTER TABLE quotes
  ADD COLUMN business_bank_id INTEGER
    REFERENCES business_banks(id) ON DELETE SET NULL;

ALTER TABLE invoices
  ADD COLUMN business_bank_id INTEGER
    REFERENCES business_banks(id) ON DELETE SET NULL;

CREATE INDEX idx_quotes_business_bank ON quotes(business_bank_id);
CREATE INDEX idx_invoices_business_bank ON invoices(business_bank_id);
