-- Separate the "company logo" (square, used for the sidebar / tenant
-- switcher / identity hero) from a "PDF header logo" (wide format used
-- in the printed document header).
--
-- Until now the same `logo_path` row served both purposes. This was
-- awkward: the sidebar wants a square crop while invoice headers look
-- best with a wide letterhead-style image.
--
-- Adds a nullable column. NULL means "no PDF header logo set" — the
-- frontend interprets that as "render PDFs with no logo" rather than
-- falling back to the identity logo, so users explicitly opt in to
-- branding their PDFs.

ALTER TABLE company_settings
	ADD COLUMN pdf_header_logo_path TEXT;
