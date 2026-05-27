-- Add bundle-mode lump-sum amount to recurring invoice templates.
--
-- Bundle mode shows a lump-sum total on the generated invoice with
-- the line editor below it carrying just scope text (item +
-- description). The lump sum needs a home on the template that's
-- independent of the lines — same shape as `invoices.subtotal_cents`
-- which already works this way for issued invoices in bundle mode.
--
-- Defaults to 0; itemized templates ignore the column (totals are
-- rolled up from each line's own qty × price × VAT).

ALTER TABLE recurring_invoices
ADD COLUMN bundle_subtotal_cents INTEGER NOT NULL DEFAULT 0;
