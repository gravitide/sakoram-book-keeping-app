-- Continuous per-type document numbering (drop the fiscal-year scope).
--
-- Document numbers used to be `{PREFIX}-{YYYY}-{NNNN}` with the counter keyed
-- per (document_type, fiscal_year), so the sequence reset each fiscal year and
-- converting a quote to an invoice jumped the number into the CURRENT fiscal
-- year (QUO-2025-0004 -> INV-2026-0004). We now use one ever-incrementing
-- counter per document type: `{PREFIX}-{NNNN}` (QUO-0004, INV-0032).
--
-- Pre-1.0, data is disposable: the counter table is dropped and recreated
-- rather than migrated. Documents already numbered with the old YYYY format
-- keep their stored number strings (they're immutable); only new numbers omit
-- the year. No collision — the formats are distinct.

DROP TABLE IF EXISTS document_counters;
CREATE TABLE document_counters (
  document_type TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);
