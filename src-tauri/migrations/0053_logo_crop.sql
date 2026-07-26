-- Square identity-logo crop rect, mirroring pdf_logo_crop from 0051.
--
-- JSON {x,y,w,h} in SOURCE-image pixels. NULL when the logo is an SVG (which
-- passes through uncropped so it stays vector) or was uploaded before the
-- cropper existed. The untouched upload lives beside the derivative as
-- logos/logo-original.<ext>, so Re-crop can reopen the original with this rect.
ALTER TABLE company_settings ADD COLUMN logo_crop TEXT;
