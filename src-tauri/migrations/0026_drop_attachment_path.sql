-- Drop the dead `attachment_path` columns from `bills` and `vouchers`.
--
-- These columns date back to the original 0003 schema and have been
-- vestigial since migration 0022 introduced the polymorphic
-- `document_attachments` table — every attachment (local file or phone
-- upload) now lives there, keyed by (document_type, document_id),
-- with the file path on the attachment row.
--
-- Bills carry an extra hop because 0008 + 0013 each rebuilt the table
-- and faithfully copied the column forward; vouchers still has the
-- original definition. SQLite 3.35+ supports ALTER TABLE DROP COLUMN,
-- which we lean on here instead of a table-rebuild dance.

ALTER TABLE bills DROP COLUMN attachment_path;
ALTER TABLE vouchers DROP COLUMN attachment_path;
