-- Phase: invoice attachments — scans / photos attached to an invoice.
--
-- Each invoice can carry many attachments. A row records where the file
-- lives on disk plus enough metadata to render a thumbnail / list entry
-- without re-reading the file. Files themselves live outside the DB,
-- under app_data_dir/invoice_attachments/<tenant_id>/<invoice_id>/.
--
-- `source` distinguishes how the file arrived:
--   'local' — picked from disk via the desktop file dialog
--   'phone' — captured on a phone and pushed over the LAN upload server
--
-- ON DELETE CASCADE: deleting an invoice removes its attachment rows.
-- The files on disk are cleaned up by the JS store before the DELETE.

CREATE TABLE invoice_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  filename    TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  mime        TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'phone')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invoice_attachments_invoice ON invoice_attachments(invoice_id);
