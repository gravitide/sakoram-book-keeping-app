-- Per-business default "Prepared by" that seeds new quotes and invoices.
--
-- The value still lives per-document on quotes.prepared_by /
-- invoices.prepared_by (frozen at issue like every other snapshot field);
-- this column is only the default the create flow copies onto a fresh draft,
-- editable on the document afterwards. Nullable / empty = no default (current
-- behaviour). Surfaced on Settings -> Quotes & invoices.
ALTER TABLE company_settings ADD COLUMN default_prepared_by TEXT;
