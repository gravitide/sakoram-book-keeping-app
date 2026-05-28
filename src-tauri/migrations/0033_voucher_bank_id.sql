-- vouchers.business_bank_id — explicit FK to the bank account this
-- voucher hit (or NULL for cash transactions). Powers per-bank
-- reconciliation in migration 0034 — matching needs to scope to "is
-- this voucher on Bank A's statement" cleanly, and the existing
-- payment_method text column ('cash' / 'bank_transfer' / 'cheque' /
-- 'card' / 'other') doesn't carry that info.
--
-- ON DELETE SET NULL — deleting a bank account leaves the voucher's
-- history intact, just unlinked. Matches the broader pattern: rows
-- survive their party deletes.
--
-- Backfill is pre-1.0 pragmatic: every non-cash voucher gets the
-- business's default bank. Cash vouchers stay NULL (they don't
-- belong to any bank account). Users editing existing vouchers can
-- correct the assignment if needed.

ALTER TABLE vouchers
ADD COLUMN business_bank_id INTEGER REFERENCES business_banks(id) ON DELETE SET NULL;

CREATE INDEX idx_vouchers_bank
  ON vouchers(business_bank_id) WHERE business_bank_id IS NOT NULL;

UPDATE vouchers
SET business_bank_id = (SELECT id FROM business_banks WHERE is_default = 1 LIMIT 1)
WHERE payment_method != 'cash' AND business_bank_id IS NULL;
