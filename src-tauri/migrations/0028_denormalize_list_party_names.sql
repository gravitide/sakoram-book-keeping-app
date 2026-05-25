-- Denormalised "party name" columns on the document tables.
--
-- The list pages (/invoices, /bills, /quotes, /payslips) all need to
-- show the counterparty's name in the table — but each row stores
-- that name inside a JSON snapshot blob (client_snapshot,
-- vendor_snapshot, employee_snapshot). Until now, list rendering
-- meant calling JSON.parse() on every row of the store on every
-- filter / sort change. At the new demo-seed scale (~800 invoices /
-- 1000 bills) that's ~1800 parses on every keystroke in the search
-- box, plus all the snapshot bytes shipped across the Tauri IPC
-- bridge for each list load.
--
-- This migration adds a plain TEXT column carrying just the party
-- name on each document table, and backfills it from the matching
-- snapshot's JSON via SQLite's built-in json_extract. Stores set the
-- column whenever the snapshot is set (see app/stores/invoices.ts
-- etc) so the two stay in lockstep. Snapshot columns stay around —
-- detail pages still read them for the full address / tax_id block,
-- and the immutability rule for issued documents is unchanged.
--
-- Bills get three extra columns for the category meta block
-- (category swatch + icon + name) which renders on every bill row.
-- Same JSON-parse-on-every-render pain, same fix.

ALTER TABLE invoices ADD COLUMN client_name TEXT NOT NULL DEFAULT '';
UPDATE invoices
SET client_name = COALESCE(json_extract(client_snapshot, '$.name'), '');
CREATE INDEX IF NOT EXISTS idx_invoices_client_name ON invoices(client_name);

ALTER TABLE quotes ADD COLUMN client_name TEXT NOT NULL DEFAULT '';
UPDATE quotes
SET client_name = COALESCE(json_extract(client_snapshot, '$.name'), '');
CREATE INDEX IF NOT EXISTS idx_quotes_client_name ON quotes(client_name);

ALTER TABLE bills ADD COLUMN vendor_name TEXT NOT NULL DEFAULT '';
UPDATE bills
SET vendor_name = COALESCE(json_extract(vendor_snapshot, '$.name'), '');
CREATE INDEX IF NOT EXISTS idx_bills_vendor_name ON bills(vendor_name);

-- Category trio on bills. Nullable since not every bill has a category;
-- the list page renders the swatch / icon / label only when set.
ALTER TABLE bills ADD COLUMN category_name TEXT;
ALTER TABLE bills ADD COLUMN category_color TEXT;
ALTER TABLE bills ADD COLUMN category_icon TEXT;
UPDATE bills
SET
	category_name = json_extract(category_snapshot, '$.name'),
	category_color = json_extract(category_snapshot, '$.color'),
	category_icon = json_extract(category_snapshot, '$.icon')
WHERE category_snapshot IS NOT NULL;

ALTER TABLE payslips ADD COLUMN employee_name TEXT NOT NULL DEFAULT '';
UPDATE payslips
SET employee_name = COALESCE(json_extract(employee_snapshot, '$.full_name'), '');
CREATE INDEX IF NOT EXISTS idx_payslips_employee_name ON payslips(employee_name);
