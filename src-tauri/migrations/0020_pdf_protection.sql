-- Phase: PDF security — owner-password protection on generated documents.
--
-- Goal: stop a recipient editing/altering an issued invoice or bill after
-- we send it. We encrypt the PDF with an *owner* password only — the user
-- password stays empty, so the document still opens freely with no prompt,
-- but editing / copying / annotating is blocked. Printing stays allowed.
--
-- Encryption is AES-256 (R6), applied by the qpdf crate as a post-process
-- step after Typst renders the PDF (see src/pdf.rs).
--
-- `pdf_protect_password` is the owner password. Nullable: when NULL or
-- empty, protection is off regardless of the per-type toggles.
--
-- The five `pdf_protect_*` flags are per-document-type opt-ins (0/1). A
-- document type is encrypted only when its flag is 1 AND a password is set.

ALTER TABLE company_settings ADD COLUMN pdf_protect_password TEXT;
ALTER TABLE company_settings ADD COLUMN pdf_protect_quote   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_protect_invoice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_protect_bill    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_protect_voucher INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_protect_payslip INTEGER NOT NULL DEFAULT 0;
