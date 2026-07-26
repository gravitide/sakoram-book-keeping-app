-- Customizable PDF header block + footer strip.
--
-- Both are opt-in: the *_custom flags default 0, so existing tenants keep the
-- hardcoded chrome (logo/wordmark header, "name | website | phone | address"
-- footer) and render byte-identically until they turn one on.
--
-- The flag is separate from the text on purpose: toggling custom OFF keeps
-- what the user wrote, so they can turn it back on without retyping.
--
-- *_text holds TipTap JSON, same shape as letters.body_json, and may contain
-- {business_name} / {phone} / … tokens resolved at render time by
-- app/lib/pdf-tokens.ts — so contact details never go stale in two places.

ALTER TABLE company_settings ADD COLUMN pdf_header_custom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_header_text TEXT;
ALTER TABLE company_settings ADD COLUMN pdf_footer_custom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_footer_text TEXT;
