-- Allow businesses to use a currency that isn't in the curated CURRENCIES
-- map in app/lib/money.ts.
--
-- The picker on onboarding + Settings → Business details now offers a
-- "Custom currency…" option that reveals two inputs (Code + Symbol).
-- The chosen code still lands in company_settings.currency_code; the
-- symbol the user typed goes into this column. On load, the settings
-- store registers the pair as a CurrencyMeta in money.ts so
-- formatMoney() / formatLKR() pick it up the same way they pick up
-- built-in codes — no caller-side changes needed.
--
-- NULL means "use the built-in symbol from CURRENCIES for this code".
-- Set when the saved code isn't in the curated map.
-- SCHEMA_VERSION → 25.

ALTER TABLE company_settings
  ADD COLUMN currency_symbol_override TEXT;
