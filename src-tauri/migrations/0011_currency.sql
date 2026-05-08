-- Add a per-business currency.
--
-- Until now the app was hard-coded to LKR (Sri Lankan Rupee). This
-- migration introduces a `currency_code` column on the singleton
-- company_settings row so each business can pick its own.
--
-- Stored as ISO 4217 alpha codes (LKR, USD, EUR, GBP, INR, AED, AUD,
-- SGD, ...). The actual symbol/locale used for formatting is derived
-- in JS from the code (see app/lib/money.ts CURRENCIES map). Existing
-- tenants default to LKR so display doesn't change after migrating.
--
-- Constraint: we only support 100-minor-unit currencies for now (most
-- of the world). JPY/KRW (no decimals) and Gulf 1000-mil currencies
-- (KWD/BHD/OMR) are deliberately out of scope — adding them later
-- means revisiting the cents math throughout the app.

ALTER TABLE company_settings
	ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'LKR';
