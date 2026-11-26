-- Layout + Stationery replace the PDF "template" (ADR 0001).
--
-- The old pdf_template mixed two things: how a document's content is laid out
-- and the branding drawn around the page (the `letterhead` template's
-- reserved top band). They are now separate settings:
--
--   pdf_layout           classic | modern | minimal | compact
--                        (app/lib/pdf-layouts.ts + document_template in pdf.rs)
--   pdf_stationery_mode  builtin | background | header_footer | preprinted
--                        (app/lib/stationery.ts; background / header_footer are
--                        accepted here but not rendered yet)
--   pdf_stationery       JSON with EVERY mode's own settings, so switching modes
--                        keeps each one's margins. NULL = all defaults; malformed
--                        JSON degrades to defaults (Zod, app/lib/stationery.ts).
--
-- A business on the retired Letterhead template moves to Classic + Pre-printed
-- paper. Pre-printed paper's bands start from the business's letter
-- pre-printed margins, so letters can move onto them without changing (#358
-- then drops letter_preprinted_*).
ALTER TABLE company_settings ADD COLUMN pdf_layout TEXT NOT NULL DEFAULT 'classic'
	CHECK (pdf_layout IN ('classic', 'modern', 'minimal', 'compact'));
ALTER TABLE company_settings ADD COLUMN pdf_stationery_mode TEXT NOT NULL DEFAULT 'builtin'
	CHECK (pdf_stationery_mode IN ('builtin', 'background', 'header_footer', 'preprinted'));
ALTER TABLE company_settings ADD COLUMN pdf_stationery TEXT;

UPDATE company_settings SET
	pdf_layout = CASE WHEN pdf_template IN ('modern', 'minimal', 'compact') THEN pdf_template ELSE 'classic' END,
	pdf_stationery_mode = CASE WHEN pdf_template = 'letterhead' THEN 'preprinted' ELSE 'builtin' END,
	pdf_stationery = json_object('preprinted', json_object(
		'top', letter_preprinted_top_margin_mm,
		'right', 18,
		'bottom', letter_preprinted_bottom_margin_mm,
		'left', 18
	));

ALTER TABLE company_settings DROP COLUMN pdf_template;
