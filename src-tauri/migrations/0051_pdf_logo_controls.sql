-- Header-logo controls: per-business size multiplier + remembered crop.
--
-- pdf_logo_scale is an integer percent (UI range 50..150, default 100)
-- applied to each template's own baseline logo height (12mm classic, 9mm
-- compact, 14mm voucher...), so relative template intent survives. 100 means
-- existing tenants render byte-identically until they touch the slider.
--
-- pdf_logo_crop is the last crop rect as JSON {x,y,w,h} in source-image
-- pixels, kept so "Re-crop" can reopen the original where the user left off.
-- NULL for SVG logos (never cropped - cropping would rasterise a vector) and
-- for logos uploaded before this feature.

ALTER TABLE company_settings ADD COLUMN pdf_logo_scale INTEGER NOT NULL DEFAULT 100;
ALTER TABLE company_settings ADD COLUMN pdf_logo_crop TEXT;
