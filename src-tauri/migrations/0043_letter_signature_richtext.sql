-- Free-form rich-text signature.
--
-- The structured signature fields (name / title / company / email / phone,
-- from 0040 + 0042) were too rigid — users want to type whatever sign-off they
-- like. Replace them with a single TipTap rich-text document (same shape as
-- letters.body_json), rendered in the signature area of the PDF.
--
-- SQLite 3.35+ DROP COLUMN (already used in 0026) keeps existing letter rows —
-- only the old signatory_* values are discarded (pre-1.0, disposable; no
-- backfill into signature_json).

ALTER TABLE letters ADD COLUMN signature_json TEXT NOT NULL DEFAULT '';
ALTER TABLE letters DROP COLUMN signatory_name;
ALTER TABLE letters DROP COLUMN signatory_title;
ALTER TABLE letters DROP COLUMN signatory_company;
ALTER TABLE letters DROP COLUMN signatory_email;
ALTER TABLE letters DROP COLUMN signatory_phone;
