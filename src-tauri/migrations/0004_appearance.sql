-- Phase 7+: appearance settings (UI font + theme color).
--
-- ui_font is a free-text CSS font-family name. If the font isn't on the
-- user's system, the layout's CSS fallback chain handles it gracefully.
--
-- theme_color is one of a fixed set of NuxtUI palette names: red, orange,
-- amber, green, emerald, sky, blue, violet. The frontend maps it to a
-- Tailwind primary color and a hex code for PDF accents.

ALTER TABLE company_settings ADD COLUMN ui_font TEXT NOT NULL DEFAULT 'Miriam Libre';
ALTER TABLE company_settings ADD COLUMN theme_color TEXT NOT NULL DEFAULT 'red';
