-- Per-quote "include bank details" toggle.
--
-- Quotes used to always print the (default) business bank block on the PDF.
-- Quotes are often sent before payment terms are agreed, so the bank details
-- are now opt-in per quote: this flag defaults OFF and the user flips it on
-- (revealing the bank-account picker) when they want payment details printed.
-- Invoices are unaffected — they keep printing the selected bank as before.

ALTER TABLE quotes ADD COLUMN include_bank_details INTEGER NOT NULL DEFAULT 0;
