-- Phase: generalise invoice attachments to all document types.
--
-- Migration 0021 shipped `invoice_attachments` (invoice-only). This
-- replaces it with a polymorphic `document_attachments` table keyed by
-- (document_type, document_id) so quotes, invoices, bills, and vouchers
-- all share one table, one store, and one set of Rust commands.
--
-- Pre-1.0: we drop and recreate rather than ALTER. Any attachment rows
-- on a dev machine are disposable (the user opted out of backfill).
-- The orphaned files left under app_data_dir/invoice_attachments/ are
-- harmless; new files land under app_data_dir/attachments/<type>/<id>/.
--
-- There is deliberately no foreign key — a polymorphic document_id can't
-- reference a single table. Each document store's delete path is
-- responsible for purging the matching attachment rows + files (see
-- purgeDocumentAttachments in app/stores/document_attachments.ts).

DROP TABLE IF EXISTS invoice_attachments;

CREATE TABLE document_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_type TEXT NOT NULL CHECK (document_type IN ('quote', 'invoice', 'bill', 'voucher')),
  document_id   INTEGER NOT NULL,
  file_path     TEXT NOT NULL,
  filename      TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  mime          TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'phone')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_document_attachments_doc ON document_attachments(document_type, document_id);
