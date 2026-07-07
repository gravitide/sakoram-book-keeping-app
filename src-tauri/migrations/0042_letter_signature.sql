-- Richer letter signature block.
--
-- Letters already carried signatory_name + signatory_title. A formal letter's
-- sign-off usually also names the company and gives contact details, so we add
-- three more per-letter fields. Kept per-letter (not pulled from
-- company_settings) so the signer can tailor them — and duplicate-to-clone
-- carries them forward.
--
-- Pre-1.0 destructive: new columns only, no backfill.

ALTER TABLE letters ADD COLUMN signatory_company TEXT NOT NULL DEFAULT '';
ALTER TABLE letters ADD COLUMN signatory_email TEXT NOT NULL DEFAULT '';
ALTER TABLE letters ADD COLUMN signatory_phone TEXT NOT NULL DEFAULT '';
