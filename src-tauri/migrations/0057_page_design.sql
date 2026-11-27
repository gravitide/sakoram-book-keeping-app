-- The page design replaces the four Stationery modes and the separate PDF
-- header logo / header & footer text: one JSON design (safe area + canvas
-- items: images, text boxes, a page number, lines) — app/lib/page-design.ts.
-- NULL = never chosen, which renders the Classic starter template.
--
-- Pre-1.0: the old settings are dropped, not converted (CLAUDE.md "Pre-1.0
-- status"). Their files (pdf-header.*, stationery/background|header|footer.*)
-- are left on disk unread; nothing points at them any more.
-- Spec: docs/superpowers/specs/2026-11-27-page-designer-design.md
ALTER TABLE company_settings DROP COLUMN pdf_stationery_mode;
ALTER TABLE company_settings DROP COLUMN pdf_stationery;
ALTER TABLE company_settings DROP COLUMN pdf_header_logo_path;
ALTER TABLE company_settings DROP COLUMN pdf_logo_scale;
ALTER TABLE company_settings DROP COLUMN pdf_logo_crop;
ALTER TABLE company_settings DROP COLUMN pdf_header_custom;
ALTER TABLE company_settings DROP COLUMN pdf_header_text;
ALTER TABLE company_settings DROP COLUMN pdf_footer_custom;
ALTER TABLE company_settings DROP COLUMN pdf_footer_text;
ALTER TABLE company_settings ADD COLUMN pdf_design TEXT;
