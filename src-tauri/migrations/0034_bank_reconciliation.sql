-- Bank reconciliation tables + voucher.reconciled_at.
--
-- `bank_statement_imports` — one row per CSV upload. Tracks the file
-- name + import timestamp + the column mapping used (so the NEXT
-- CSV from the same bank pre-selects the same mapping).
--
-- `bank_statement_rows` — one row per parsed statement line. Carries
-- signed amount_cents (+ = receipt, - = payment), optional balance,
-- optional reference, and a nullable matched_voucher_id pointing at
-- a linked voucher. dedupe_hash is sha256(date+amount+desc+ref) and
-- UNIQUE per bank — re-imports skip duplicates silently.
--
-- ON DELETE rules:
--   - imports.business_bank_id RESTRICT: a bank with reconciliation
--     history can't be deleted without clearing imports first.
--   - rows.import_id CASCADE: deleting an import drops its rows.
--   - rows.business_bank_id RESTRICT: same rationale as imports.
--   - rows.matched_voucher_id SET NULL: deleting a voucher quietly
--     unmatches the row so statement history survives.
--
-- `vouchers.reconciled_at` — set when a voucher gets linked to a
-- statement row; cleared when unlinked. Powers the "unreconciled
-- vouchers" side panel on the reconcile page.

ALTER TABLE vouchers ADD COLUMN reconciled_at TEXT;

CREATE TABLE bank_statement_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_bank_id INTEGER NOT NULL REFERENCES business_banks(id) ON DELETE RESTRICT,
  filename TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL DEFAULT 0,
  column_mapping TEXT  -- JSON
);

CREATE INDEX idx_bank_statement_imports_bank
  ON bank_statement_imports(business_bank_id);

CREATE TABLE bank_statement_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  business_bank_id INTEGER NOT NULL REFERENCES business_banks(id) ON DELETE RESTRICT,
  statement_date TEXT NOT NULL,
  description TEXT,
  amount_cents INTEGER NOT NULL,
  reference TEXT,
  balance_cents INTEGER,
  matched_voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  matched_at TEXT,
  dedupe_hash TEXT NOT NULL,
  UNIQUE (business_bank_id, dedupe_hash)
);

CREATE INDEX idx_bank_statement_rows_unmatched
  ON bank_statement_rows(business_bank_id) WHERE matched_voucher_id IS NULL;

CREATE INDEX idx_bank_statement_rows_import
  ON bank_statement_rows(import_id);
