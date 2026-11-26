-- A letter's "pre-printed paper" switch now reserves the business's own
-- Pre-printed paper bands (company_settings.pdf_stationery → preprinted), so
-- the letter-only margins retire. 0055 already seeded those bands from these
-- columns for every business, so nothing is lost.
ALTER TABLE company_settings DROP COLUMN letter_preprinted_top_margin_mm;
ALTER TABLE company_settings DROP COLUMN letter_preprinted_bottom_margin_mm;
