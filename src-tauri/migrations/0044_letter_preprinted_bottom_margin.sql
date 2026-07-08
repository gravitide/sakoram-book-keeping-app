-- Bottom margin for pre-printed letterhead paper.
--
-- The pre-printed mode already reserves blank space at the TOP (for the printed
-- letterhead header, migration 0041). Physical stationery often has a printed
-- FOOTER band too, so reserve blank space at the bottom as well. Default 20mm.

ALTER TABLE company_settings
  ADD COLUMN letter_preprinted_bottom_margin_mm INTEGER NOT NULL DEFAULT 20;
