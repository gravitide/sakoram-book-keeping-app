# Bank Reconciliation — Design

**Date**: 2026-05-28
**Branch**: `feat/bank-reconciliation`
**Roadmap tier**: Tier 2 (biggest remaining productivity gap after credit notes / customer statements / recurring docs)

---

## Goal

Let the user import a bank statement CSV, match its rows against existing vouchers (or create new vouchers from unmatched rows), and persist the reconciliation state so the work isn't lost between sessions.

The deliverable is **"Standard scope"** — auto-suggest matches but never silently auto-link; user clicks Accept per suggestion or "Accept all". One-click voucher creation from unmatched statement rows.

## Non-goals (v1)

- Period tracking / opening + closing balance verification (the "Full scope" tier — Xero-style sessions). Deferred.
- ML / fuzzy matching beyond amount+date+reference-substring. Out of scope.
- Bank API auto-fetch (Plaid / SaltEdge). Out of scope.
- Multi-currency reconciliation. One currency per business — golden rule.
- Statement row "skip / ignore" mark so unmatched-by-design rows drop off the unmatched count. Out of scope; user can leave rows unmatched.
- Detecting that a matched voucher's amount has been edited post-match. Out of scope; user trust v1.

## Scope expansion: voucher-level bank linkage

Vouchers currently don't have a `business_bank_id` FK — they only have a `payment_method` text (`cash` / `bank_transfer` / etc.). To scope matching cleanly per bank, this PR adds the FK. This is a small but cross-cutting change: voucher store, voucher form, voucher detail page, demo seed.

---

## Schema

### Migration 0033: `vouchers.business_bank_id`

```sql
ALTER TABLE vouchers
ADD COLUMN business_bank_id INTEGER REFERENCES business_banks(id) ON DELETE SET NULL;

CREATE INDEX idx_vouchers_bank
  ON vouchers(business_bank_id) WHERE business_bank_id IS NOT NULL;

-- Backfill: cash vouchers stay NULL. Non-cash vouchers get the default
-- bank (pre-1.0 pragmatism for demo data; users can edit existing
-- vouchers' bank account after).
UPDATE vouchers
SET business_bank_id = (SELECT id FROM business_banks WHERE is_default = 1 LIMIT 1)
WHERE payment_method != 'cash' AND business_bank_id IS NULL;
```

### Migration 0034: bank reconciliation tables

```sql
ALTER TABLE vouchers ADD COLUMN reconciled_at TEXT;

CREATE TABLE bank_statement_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_bank_id INTEGER NOT NULL REFERENCES business_banks(id) ON DELETE RESTRICT,
  filename TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL DEFAULT 0,
  column_mapping TEXT  -- JSON: { date: 0, description: 1, amount: 2, ... }
);

CREATE TABLE bank_statement_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  business_bank_id INTEGER NOT NULL REFERENCES business_banks(id) ON DELETE RESTRICT,
  statement_date TEXT NOT NULL,         -- ISO YYYY-MM-DD
  description TEXT,
  amount_cents INTEGER NOT NULL,        -- signed: + = receipt, - = payment
  reference TEXT,
  balance_cents INTEGER,                -- running balance after this txn, optional
  matched_voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  matched_at TEXT,
  dedupe_hash TEXT NOT NULL,
  UNIQUE (business_bank_id, dedupe_hash)
);
CREATE INDEX idx_bank_statement_rows_unmatched
  ON bank_statement_rows(business_bank_id) WHERE matched_voucher_id IS NULL;
```

- `dedupe_hash` = `sha256(statement_date|amount_cents|description|reference)` — re-imports skip duplicates silently.
- `bank_statement_imports.business_bank_id` is **RESTRICT**, not CASCADE — deleting a bank with reconciliation history must be blocked at the bank-delete UI (friendly toast nudging the user to clear imports first). Same protection on `bank_statement_rows.business_bank_id`.
- `bank_statement_rows.matched_voucher_id` is **SET NULL** — deleting a matched voucher quietly unmatches the row so the statement history survives.

### `SCHEMA_VERSION` and `TABLES`

- `src-tauri/src/data_io.rs`: bump `SCHEMA_VERSION` 32 → 34
- Add `bank_statement_imports` and `bank_statement_rows` to the `TABLES` array — children first on delete (statement_rows before statement_imports), parents first on insert.

---

## Stores

### `app/stores/bank_statements.ts` (new)

Public surface:

| Method | What it does |
|---|---|
| `ensureLoaded()` / `load()` | Fetch imports + rows into Pinia state. |
| `importCsv({ bankId, filename, columnMapping, rows })` | Insert one `bank_statement_imports` row, then bulk-insert `bank_statement_rows` skipping duplicates. Returns `{ inserted, skipped }`. |
| `linkMatch(rowId, voucherId)` | Two sequential auto-commits: `UPDATE bank_statement_rows SET matched_voucher_id, matched_at` + `UPDATE vouchers SET reconciled_at`. |
| `unlinkMatch(rowId)` | Mirror: clear both ends. |
| `deleteImport(importId)` | Clear `reconciled_at` on matched vouchers + cascade-delete the import. User-confirmed. |
| `suggestMatches(bankId)` | Returns `Map<rowId, VoucherRow[]>` ranked by score. Pure computation over already-loaded data. |

State:
- `imports: Ref<ImportRow[]>`
- `rows: Ref<StatementRowRow[]>` (keyed implicitly by id; filtered downstream)
- `loaded`, `pendingLoad` (load-once pattern matching every other store)

Sequential-auto-commits per the connection-pool caveat — no JS-side `BEGIN`/`COMMIT`. Crash mid-write between the two `UPDATE`s is recoverable: the statement row appears matched while the voucher appears unreconciled. The next visit can re-link via the suggestions pass.

### `app/stores/vouchers.ts` (extend)

- `VoucherRow` type gains `business_bank_id: number | null` and `reconciled_at: string | null`.
- `create` / `update` accept and persist both.
- Demo seed sets `business_bank_id` alongside `payment_method` (`cash` → null; everything else → default bank).

### Matching algorithm (`suggestMatches`)

For each unmatched statement row on bank X:
1. Candidate set = vouchers where:
   - `business_bank_id = X`
   - `reconciled_at IS NULL`
   - `voucher_type = 'receipt'` if `statement.amount_cents > 0`, else `'payment'`
   - `amount_cents = abs(statement.amount_cents)`
2. Filter to candidates within `±3 days` of `statement.statement_date`.
3. Score:
   - `±1 day` → 100
   - `±2 days` → 90
   - `±3 days` → 80
   - `+20` if both rows have a non-empty reference and `voucher.reference` shares a non-empty substring with `statement.reference`
4. Return all candidates sorted by score desc, then date proximity asc, then voucher id asc (stable).

UI uses the highest-scored candidate as the default suggestion; "Pick other" expands to show the rest.

---

## Composables + helpers

- **`app/composables/useCsvParser.ts`** — pure JS CSV tokenizer (~40 lines). Handles quoted fields, escaped quotes (`""`), CR/LF/CRLF line endings, empty fields. Returns `{ headers: string[], rows: string[][] }`. No new dependency.
- **`app/lib/date-parse.ts`** — accepts a format key (`'YYYY-MM-DD'` / `'DD/MM/YYYY'` / `'DD-MM-YYYY'` / `'DD-MMM-YYYY'`) and a raw string, returns ISO `YYYY-MM-DD` or null on parse failure. Handles month name abbreviations (`Jan`, `Feb`, ...) case-insensitively.

---

## Pages + components

### `/reconcile` (new page — `app/pages/reconcile.vue`)

Single page, the whole workflow. Top-level sidebar entry between Vouchers and the documents-group divider:

```typescript
{ to: "/reconcile", label: "Reconcile", icon: "i-lucide-scale" }
```

**Layout**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Bank reconciliation [?]                                                  │
│ [Bank selector ▾]  [Date range]            [+ Import statement]          │
│                                                                          │
│ 12 of 30 reconciled · 18 unmatched · 4 unmatched vouchers                │
├──────────────────────────────────────────────────────────────────────────┤
│ [Status filter chips: Matched · Suggested · Unmatched]                   │
├──────────────────────────────────────────────────────────────────────────┤
│ Date       Description       Amount    Status        Actions             │
│ 2026-05-01 ABC TRADING TXFR -50,000   🟢 MATCHED    V-0123 ✕            │
│ 2026-05-02 STAFF SALARY     -75,000   🟡 SUGGESTED  V-0145 [Accept][Other]│
│ 2026-05-03 ATM WITHDRAWAL   -10,000   ⚪ UNMATCHED  [Find][+ Create]     │
├──────────────────────────────────────────────────────────────────────────┤
│ Unreconciled vouchers (not on the statement)                             │
│ V-0150  2026-05-04  Cash receipt — Client X    +25,000                   │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Bank selector** — `USelect` against `business_banks` (default to the user's default bank).
- **Status chips** — multi-select filter (empty = show all). Same pattern as document list pages.
- **Bulk action**: "Accept all suggestions" button → confirms every yellow row at once.
- **Unreconciled vouchers panel** — vouchers for this bank with `reconciled_at IS NULL` that don't appear as a suggestion anywhere. Signals "this voucher is in your books but not on the statement" (possible missing txn or bounced).

### `BankStatementImportModal.vue` (new)

Triggered by the **Import statement** button.

1. Open file dialog via `@tauri-apps/plugin-dialog`'s `open()`.
2. Read file via `@tauri-apps/plugin-fs`'s `readTextFile`.
3. Parse with `useCsvParser`. Show first 10 rows in a preview table.
4. Per-column dropdowns assign role: `Date` / `Description` / `Amount` (signed) / `Debit` / `Credit` / `Reference` / `Balance` / `Ignore`. Defaults to last-used mapping for the selected bank (from `bank_statement_imports.column_mapping`).
5. Date format radio: `YYYY-MM-DD` / `DD/MM/YYYY` / `DD-MM-YYYY` / `DD-MMM-YYYY`.
6. Sign convention is implicit: single `Amount` column = signed; `Debit`+`Credit` = computed as `credit - debit`.
7. **Pre-confirm summary**: "N rows will be imported · M will be skipped (already present)" computed by hashing each row + querying for existing `dedupe_hash`.
8. Confirm → `bankStatementsStore.importCsv(...)` → close modal → page reloads.

### `BankStatementCreateVoucherModal.vue` (new)

Triggered by `[+ Create]` on an unmatched statement row.

Sized modal wrapping the standard voucher form, pre-filled with:
- `voucher_type` = `receipt` if `amount_cents > 0`, else `payment`
- `voucher_date` = statement row's `statement_date`
- `amount_cents` = `abs(statement.amount_cents)`
- `payment_method` = `bank_transfer`
- `business_bank_id` = the current reconciliation's bank
- `description` = statement row's `description`
- `reference` = statement row's `reference`

On save: voucher inserted **and** linked to the statement row in one atomic-from-the-user's-perspective action (two sequential auto-commits). Newly created voucher gets `reconciled_at = now`.

### `VoucherPicker.vue` (new — for the manual link flow)

Triggered by `[Find voucher]` on an unmatched row, or `[Pick other]` on a suggested row.

Modal listing all unreconciled vouchers for the current bank, with search + filter by voucher type + sort by date. User clicks a voucher → links to the statement row, closes modal.

### Voucher form changes

- `NewVoucherModal.vue` and `/vouchers/new` page: new **Bank account** field (USelect against active business banks). Auto-hides when `payment_method === 'cash'`; auto-defaults to the business's default bank otherwise.
- `/vouchers/[id]` detail page: show bank account on the read-only view; bank picker in edit mode.

### `app/help/topics/reconciliation.vue` (new)

What / when / how / common mistakes / SL tax angle. Cross-references on `vouchers` topic. `<HelpButton slug="reconciliation" />` on the `/reconcile` page header.

---

## CLAUDE.md updates

- Project layout: mention `app/pages/reconcile.vue`
- Schema overview: describe `bank_statement_imports` + `bank_statement_rows`
- Migrations list: 0033 + 0034
- Sidebar grouping: add Reconcile entry
- Done section + Roadmap status: mark bank reconciliation shipped; pointer moves to statutory auto-compute on payslips OR Cmd-K command palette

---

## Edge cases

| Case | Behaviour |
|---|---|
| Re-import same CSV | `dedupe_hash` UNIQUE skips duplicates. Toast: "N new · M skipped." |
| Delete import | Confirm modal → clear `reconciled_at` on matched vouchers → cascade delete rows. |
| Delete matched voucher | `ON DELETE SET NULL` on `matched_voucher_id` → row becomes unmatched. |
| Edit matched voucher's amount/date | v1 trusts user. Future: passive warning. |
| Delete a bank with reconciliation history | RESTRICT blocks at DB level → friendly toast at UI ("Delete imports first"). |
| Cash voucher | Excluded from matching (filter `business_bank_id IS NOT NULL`). Bank picker hides on the form. |
| Cross-bank match | Blocked — matching scoped to `business_bank_id = bank X`. |
| Malformed CSV | Toast: "Couldn't parse this CSV." |
| Wrong column assignment | Per-row parse failures → toast lists first 3 bad row indices. |
| Empty CSV | Modal blocks confirm: "No data rows found." |
| Tied suggestions | All in "Pick other" expander; default = first (date proximity, then amount sign, then voucher id). |
| Unmatched-by-design row (bank fee, interest) | User leaves unmatched OR `[+ Create]` a voucher for it. Future: "Skip" mark. |

---

## Testing

Per CLAUDE.md the project uses Vitest. New unit tests:

- `app/lib/date-parse.test.ts` — every supported format, good + malformed input
- `app/composables/useCsvParser.test.ts` — quoted fields, CRLF, empty fields, fixture CSVs from real SL banks
- A thin matching-logic test if Pinia stores can be tested in isolation; otherwise the matching algorithm extracted to a pure function in `app/lib/reconcile-match.ts` and tested there.

No new e2e infrastructure (project doesn't have e2e tests today).

---

## Effort estimate

| Piece | Days |
|---|---|
| Migrations 0033 + 0034 | 0.25 |
| Voucher store + form bank-picker | 0.5 |
| Demo seed update | 0.25 |
| Bank statements store | 0.75 |
| CSV parser + date helper | 0.5 |
| Reconcile page + table component | 1.5 |
| Import modal | 0.75 |
| Create-voucher modal | 0.5 |
| Voucher picker modal | 0.25 |
| Help topic + button | 0.25 |
| Sidebar + CLAUDE.md | 0.25 |
| Tests | 0.5 |
| **Total** | **~6.25 days** |

---

## Deferred (future PRs)

- "Skip / Ignore" mark on statement rows (drop from unmatched counts)
- Passive warning when a matched voucher's amount/date diverges
- Period sessions (Xero/QuickBooks "May 2026 reconciliation") with opening/closing balance verification
- Re-suggest after voucher edit (recompute matches)
- Reconciliation status as a report (PDF: "all matched txns for May")
