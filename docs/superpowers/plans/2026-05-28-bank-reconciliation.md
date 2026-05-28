# Bank Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship bank reconciliation — import CSV bank statements, auto-suggest matches against existing vouchers, one-click voucher creation from unmatched rows, persisted statement-row history.

**Architecture:** Two-migration schema change (vouchers gain a `business_bank_id` FK in 0033, reconciliation tables land in 0034). New Pinia store `bank_statements.ts` plus a CSV parser composable, a date helper, and a pure matching-algorithm module. Single page at `/reconcile` orchestrates the workflow; three new modal components (import / voucher-picker / create-voucher-from-row). Voucher form + detail page gain a Bank picker.

**Tech Stack:** Tauri 2, Nuxt 4 SSG, Pinia composition stores, SQLite via tauri-plugin-sql, NuxtUI 4, Vitest (tests next to source as `*.test.ts`), Typst (no PDF templates needed here).

**Spec:** `docs/superpowers/specs/2026-05-28-bank-reconciliation-design.md`

**Branch:** `feat/bank-reconciliation` (already checked out).

**Phasing note:** Tasks 1–6 build the `vouchers.business_bank_id` foundation and are independently shippable. Tasks 7–11 add the core reconciliation logic. Tasks 12–21 add the UI + docs. A natural mid-feature commit + push checkpoint after Task 6 lets you smoke-test the voucher-bank linkage before building on it.

---

## Task 1: Migration 0033 — `vouchers.business_bank_id`

**Files:**
- Create: `src-tauri/migrations/0033_voucher_bank_id.sql`
- Modify: `src-tauri/src/tenants.rs` (MIGRATIONS array)
- Modify: `src-tauri/src/data_io.rs` (SCHEMA_VERSION)

- [ ] **Step 1: Write the migration SQL**

Create `src-tauri/migrations/0033_voucher_bank_id.sql`:

```sql
-- vouchers.business_bank_id — explicit FK to the bank account this
-- voucher hit (or NULL for cash transactions). Powers per-bank
-- reconciliation in migration 0034 — matching needs to scope to "is
-- this voucher on Bank A's statement" cleanly, and the existing
-- payment_method text column ('cash' / 'bank_transfer' / 'cheque' /
-- 'card' / 'other') doesn't carry that info.
--
-- ON DELETE SET NULL — deleting a bank account leaves the voucher's
-- history intact, just unlinked. Matches the broader pattern: rows
-- survive their party deletes.
--
-- Backfill is pre-1.0 pragmatic: every non-cash voucher gets the
-- business's default bank. Cash vouchers stay NULL (they don't
-- belong to any bank account). Users editing existing vouchers can
-- correct the assignment if needed.

ALTER TABLE vouchers
ADD COLUMN business_bank_id INTEGER REFERENCES business_banks(id) ON DELETE SET NULL;

CREATE INDEX idx_vouchers_bank
  ON vouchers(business_bank_id) WHERE business_bank_id IS NOT NULL;

UPDATE vouchers
SET business_bank_id = (SELECT id FROM business_banks WHERE is_default = 1 LIMIT 1)
WHERE payment_method != 'cash' AND business_bank_id IS NULL;
```

- [ ] **Step 2: Register in MIGRATIONS array**

Edit `src-tauri/src/tenants.rs`. Find the `MIGRATIONS` array (around line 45). Append after the last entry (`(32, "recurring bills", ...)`):

```rust
(33, "voucher bank id", include_str!("../migrations/0033_voucher_bank_id.sql")),
```

- [ ] **Step 3: Bump SCHEMA_VERSION**

Edit `src-tauri/src/data_io.rs`. Find `const SCHEMA_VERSION: i32 = 32;` (around line 37). Change to:

```rust
const SCHEMA_VERSION: i32 = 33;
```

- [ ] **Step 4: Verify cargo check**

```bash
cd src-tauri && cargo check 2>&1 | tail -3
```
Expected: `Finished dev profile [unoptimized + debuginfo] target(s)` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/migrations/0033_voucher_bank_id.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs
git commit -m "feat(db): migration 0033 — vouchers.business_bank_id

Adds the explicit bank-account FK we need to scope reconciliation
matching cleanly. Defaults non-cash existing vouchers to the
business's default bank; cash vouchers stay NULL."
```

---

## Task 2: Extend voucher store type + CRUD

**Files:**
- Modify: `app/stores/vouchers.ts`

- [ ] **Step 1: Add columns to `VoucherRow` type**

In `app/stores/vouchers.ts`, find the `VoucherRow` interface. Add two fields:

```ts
export interface VoucherRow {
  // ... existing fields ...
  business_bank_id: number | null
  reconciled_at: string | null  // ISO timestamp when matched to a statement row (set in migration 0034)
}
```

Note: `reconciled_at` is added now even though the column doesn't exist yet — migration 0034 in Task 7 adds it. That keeps the type change in one commit. The store's `create` won't write to it, and the `SELECT *` will read it as undefined until 0034 lands.

Actually, wait — better to add `reconciled_at` in Task 7's store extension, not here. Revert: only add `business_bank_id` in this task:

```ts
export interface VoucherRow {
  // ... existing fields ...
  business_bank_id: number | null
}
```

- [ ] **Step 2: Add to INSERTABLE_COLUMNS / UPDATABLE_COLUMNS arrays**

Find the column arrays the store uses for INSERT / UPDATE (search for `INSERTABLE_COLUMNS` and `UPDATABLE_COLUMNS` or equivalent — the project's voucher store uses lists to drive dynamic SQL). Add `"business_bank_id"` to both.

Example (the actual list may vary slightly — match the existing pattern):

```ts
const INSERTABLE_COLUMNS: ReadonlyArray<keyof VoucherInput> = [
  "voucher_type",
  "voucher_date",
  // ... existing ...
  "business_bank_id"
];
```

- [ ] **Step 3: Update `VoucherInput` type if it's separate**

If `VoucherInput` is defined separately (a Pick<> or Omit<>), include `business_bank_id` so callers can pass it.

- [ ] **Step 4: Run lint to verify**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean output.

- [ ] **Step 5: Commit**

```bash
git add app/stores/vouchers.ts
git commit -m "feat(vouchers): thread business_bank_id through store CRUD"
```

---

## Task 3: Add Bank picker to voucher detail page

**Files:**
- Modify: `app/pages/vouchers/[id].vue`

- [ ] **Step 1: Add `formBankId` ref + import banks store**

In the script setup block, near the other form refs, add:

```ts
import { useBusinessBanksStore } from "~/stores/business_banks";

const banksStore = useBusinessBanksStore();
const formBankId = ref<number | null>(null);
```

- [ ] **Step 2: Build the `bankPickerOptions` computed**

Mirror the pattern in `app/pages/invoices/[id].vue` (look for `bankPickerOptions`):

```ts
const bankPickerOptions = computed<{ label: string, value: number | null }[]>(() => {
  const items: { label: string, value: number | null }[] = [
    { label: "—", value: null }
  ];
  for (const b of banksStore.activeBanks) {
    items.push({
      label: b.bank_name ? `${b.label} · ${b.bank_name}` : b.label,
      value: b.id
    });
  }
  return items;
});
```

- [ ] **Step 3: Hydrate `formBankId` from `row.business_bank_id` in the hydrate function**

Find where the form fields are populated from the loaded voucher (search `formVoucherType.value = row` or similar). Add:

```ts
formBankId.value = row.business_bank_id;
```

- [ ] **Step 4: Reset on payment-method change to 'cash'**

Add a watcher near the existing form watchers:

```ts
// Cash vouchers don't carry a bank — clear the bank picker
// automatically when the payment method flips to cash. When the
// user flips back to a non-cash method, default to the business's
// default bank (or NULL if no default is configured).
watch(formPaymentMethod, (next, prev) => {
  if (hydrating.value) return;
  if (next === "cash") {
    formBankId.value = null;
  } else if (prev === "cash" && formBankId.value === null) {
    formBankId.value = banksStore.defaultBank?.id ?? null;
  }
});
```

- [ ] **Step 5: Add the `<UFormField>` in the template**

Place it next to the payment method field. Show only when payment_method is not 'cash':

```vue
<UFormField
  v-if="formPaymentMethod !== 'cash'"
  label="Bank account"
  help="Which of your bank accounts received / sent the money."
>
  <USelect
    v-model="formBankId"
    :items="bankPickerOptions"
    value-key="value"
    class="w-full"
    :disabled="!editable"
  />
</UFormField>
```

- [ ] **Step 6: Add `formBankId` to the dirty-tracking watcher**

Find the `watch(...)` array that triggers `dirty.value = true` on field changes, and add `formBankId` to the watched list.

- [ ] **Step 7: Add `business_bank_id` to the save payload**

Find the `update(voucherId, { ... })` call inside `save`. Add:

```ts
business_bank_id: formBankId.value,
```

- [ ] **Step 8: Load banks store on mount**

Find the `await Promise.all([...])` near the top of script setup. Add:

```ts
banksStore.ensureLoaded()
```

(per the perf convention from PR #216 — `ensureLoaded` on mount, not `.load()`).

- [ ] **Step 9: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add app/pages/vouchers/[id].vue
git commit -m "feat(vouchers): bank-account picker on voucher detail page

Shown when payment method is not 'cash'. Auto-clears on flip to
cash; defaults to the business's default bank on flip back."
```

---

## Task 4: Add Bank picker to `/vouchers/new` page

**Files:**
- Modify: `app/pages/vouchers/new.vue`

- [ ] **Step 1: Add `formBankId` ref + banks store**

Same imports as Task 3. Initialize:

```ts
const banksStore = useBusinessBanksStore();
const formBankId = ref<number | null>(banksStore.defaultBank?.id ?? null);
```

(default to the default bank since this is the create path — most vouchers are non-cash).

- [ ] **Step 2: Add the `bankPickerOptions` computed**

Same code as Task 3 Step 2.

- [ ] **Step 3: Add the `<UFormField>` in the template**

Same template as Task 3 Step 5. Place near the payment method input.

- [ ] **Step 4: Add the watcher to clear/restore on payment-method change**

Same watcher as Task 3 Step 4, but without the `hydrating` guard (no hydrating on a new page).

- [ ] **Step 5: Add `business_bank_id` to the `store.create({...})` call**

Find the create call and add:

```ts
business_bank_id: formPaymentMethod.value === "cash" ? null : formBankId.value,
```

(belt-and-suspenders: if somehow the picker isn't hidden when method is cash, still write NULL).

- [ ] **Step 6: Load banks on mount**

In the page's top-level await:

```ts
await banksStore.ensureLoaded();
```

- [ ] **Step 7: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add app/pages/vouchers/new.vue
git commit -m "feat(vouchers): bank-account picker on new voucher page"
```

---

## Task 5: Update demo seed

**Files:**
- Modify: `app/lib/demo-seed.ts`

- [ ] **Step 1: Find voucher inserts**

Search the file for `voucher_type` or `INSERT INTO vouchers` or where vouchers are created in bulk.

- [ ] **Step 2: Add `business_bank_id` to every voucher insert**

For each voucher being created:
- If `payment_method === 'cash'`: pass `business_bank_id: null`
- Otherwise: pass `business_bank_id: defaultBankId` (look up the seeded business bank's id once at the top of the seed function and reuse)

Example:

```ts
const defaultBankId = (await selectOne<{ id: number }>(
  "SELECT id FROM business_banks WHERE is_default = 1 LIMIT 1"
))?.id ?? null;

// ... later, in voucher creation ...
const bankId = paymentMethod === "cash" ? null : defaultBankId;
await vouchersStore.create({
  // ... existing fields ...
  business_bank_id: bankId
});
```

- [ ] **Step 3: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/lib/demo-seed.ts
git commit -m "feat(demo-seed): assign business_bank_id to seeded vouchers"
```

---

## Task 6: Smoke-test phase 1 + commit checkpoint

- [ ] **Step 1: Run lint + cargo check**

```bash
bun run lint 2>&1 | tail -3
cd src-tauri && cargo check 2>&1 | tail -3 && cd ..
```
Both expected clean.

- [ ] **Step 2: Push the phase-1 commits**

```bash
git push -u origin feat/bank-reconciliation
```

- [ ] **Step 3: Wait for user verification**

Pause here. The user should:
1. Restart `bun run tauri:dev` — migration 0033 will apply on tenant DB open.
2. Open an existing voucher — bank picker visible when payment method isn't cash. Picker pre-populated with the default bank for backfilled vouchers.
3. Create a new voucher — bank picker present, defaults to default bank. Flipping to cash hides it.
4. Confirm the demo seed re-creation works (delete + re-create the demo tenant from welcome screen).

If anything breaks, fix here before proceeding to phase 2.

---

## Task 7: Migration 0034 — reconciliation tables + `vouchers.reconciled_at`

**Files:**
- Create: `src-tauri/migrations/0034_bank_reconciliation.sql`
- Modify: `src-tauri/src/tenants.rs`
- Modify: `src-tauri/src/data_io.rs`

- [ ] **Step 1: Write the migration SQL**

Create `src-tauri/migrations/0034_bank_reconciliation.sql`:

```sql
-- Bank reconciliation tables + voucher.reconciled_at.
--
-- `bank_statement_imports` — one row per CSV upload. Tracks the file
-- name + import timestamp + the column mapping used (so the NEXT
-- CSV from the same bank pre-selects the same mapping).
--
-- `bank_statement_rows` — one row per parsed statement line. Carries
-- signed amount_cents (+ = receipt, - = payment), optional balance,
-- optional reference, and a nullable matched_voucher_id pointing at
-- a linked voucher. dedupe_hash is sha256(date+amount+desc+ref) and
-- UNIQUE per bank — re-imports skip duplicates silently.
--
-- ON DELETE rules:
--   - imports.business_bank_id RESTRICT: a bank with reconciliation
--     history can't be deleted without clearing imports first.
--   - rows.import_id CASCADE: deleting an import drops its rows.
--   - rows.business_bank_id RESTRICT: same rationale as imports.
--   - rows.matched_voucher_id SET NULL: deleting a voucher quietly
--     unmatches the row so statement history survives.
--
-- `vouchers.reconciled_at` — set when a voucher gets linked to a
-- statement row; cleared when unlinked. Powers the "unreconciled
-- vouchers" side panel on the reconcile page.

ALTER TABLE vouchers ADD COLUMN reconciled_at TEXT;

CREATE TABLE bank_statement_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_bank_id INTEGER NOT NULL REFERENCES business_banks(id) ON DELETE RESTRICT,
  filename TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL DEFAULT 0,
  column_mapping TEXT  -- JSON
);

CREATE INDEX idx_bank_statement_imports_bank
  ON bank_statement_imports(business_bank_id);

CREATE TABLE bank_statement_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  business_bank_id INTEGER NOT NULL REFERENCES business_banks(id) ON DELETE RESTRICT,
  statement_date TEXT NOT NULL,
  description TEXT,
  amount_cents INTEGER NOT NULL,
  reference TEXT,
  balance_cents INTEGER,
  matched_voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  matched_at TEXT,
  dedupe_hash TEXT NOT NULL,
  UNIQUE (business_bank_id, dedupe_hash)
);

CREATE INDEX idx_bank_statement_rows_unmatched
  ON bank_statement_rows(business_bank_id) WHERE matched_voucher_id IS NULL;

CREATE INDEX idx_bank_statement_rows_import
  ON bank_statement_rows(import_id);
```

- [ ] **Step 2: Register the migration**

Edit `src-tauri/src/tenants.rs`. Append after migration 33:

```rust
(34, "bank reconciliation", include_str!("../migrations/0034_bank_reconciliation.sql")),
```

- [ ] **Step 3: Bump SCHEMA_VERSION**

Edit `src-tauri/src/data_io.rs`. Change:

```rust
const SCHEMA_VERSION: i32 = 34;
```

- [ ] **Step 4: Add tables to TABLES list**

Same file. Find the `TABLES` array. Add the two new tables. Insertion order matters — children first on delete, parents first on insert. Place `bank_statement_imports` after `business_banks` (its parent), and `bank_statement_rows` after `bank_statement_imports`:

```rust
const TABLES: &[&str] = &[
    // ... existing entries ...
    "bank_statement_imports",
    "bank_statement_rows",
    // ... continue with whatever was after ...
];
```

- [ ] **Step 5: Verify cargo check**

```bash
cd src-tauri && cargo check 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 6: Add `reconciled_at` to the voucher store's VoucherRow**

In `app/stores/vouchers.ts`, the `VoucherRow` interface (which we already edited in Task 2) gets the new column:

```ts
export interface VoucherRow {
  // ... existing fields including business_bank_id ...
  reconciled_at: string | null
}
```

No need to add to insertable/updatable arrays — `reconciled_at` is only written by the bank statements store (via `linkMatch` / `unlinkMatch`), not via the regular voucher CRUD path.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/migrations/0034_bank_reconciliation.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs app/stores/vouchers.ts
git commit -m "feat(db): migration 0034 — bank reconciliation tables

Two new tables (bank_statement_imports + bank_statement_rows) and
vouchers.reconciled_at. RESTRICT on business_bank_id prevents
deleting a bank that has reconciliation history. CASCADE on
imports → rows. SET NULL on voucher deletes preserves statement
history."
```

---

## Task 8: CSV parser composable

**Files:**
- Create: `app/composables/useCsvParser.ts`
- Create: `app/composables/useCsvParser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/composables/useCsvParser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCsv } from "./useCsvParser";

describe("parseCsv", () => {
  it("parses a simple CSV with a header row", () => {
    const csv = "Date,Amount,Description\n2026-05-01,1000,RENT\n2026-05-02,-50,FEE";
    const result = parseCsv(csv);
    expect(result.headers).toEqual(["Date", "Amount", "Description"]);
    expect(result.rows).toEqual([
      ["2026-05-01", "1000", "RENT"],
      ["2026-05-02", "-50", "FEE"]
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = "A,B\n\"hello, world\",2";
    const result = parseCsv(csv);
    expect(result.rows).toEqual([["hello, world", "2"]]);
  });

  it("handles escaped quotes (\"\")", () => {
    const csv = "A\n\"she said \"\"hi\"\"\"";
    const result = parseCsv(csv);
    expect(result.rows).toEqual([["she said \"hi\""]]);
  });

  it("handles CRLF line endings", () => {
    const csv = "A,B\r\n1,2\r\n3,4";
    const result = parseCsv(csv);
    expect(result.rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("handles trailing newline", () => {
    const csv = "A,B\n1,2\n";
    const result = parseCsv(csv);
    expect(result.rows).toEqual([["1", "2"]]);
  });

  it("handles empty fields", () => {
    const csv = "A,B,C\n1,,3";
    const result = parseCsv(csv);
    expect(result.rows).toEqual([["1", "", "3"]]);
  });

  it("strips UTF-8 BOM", () => {
    const csv = "﻿A,B\n1,2";
    const result = parseCsv(csv);
    expect(result.headers).toEqual(["A", "B"]);
  });

  it("returns empty rows for header-only input", () => {
    const csv = "A,B,C";
    const result = parseCsv(csv);
    expect(result.headers).toEqual(["A", "B", "C"]);
    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test app/composables/useCsvParser.test.ts 2>&1 | tail -10
```
Expected: FAIL — `parseCsv is not defined` or "Cannot find module".

- [ ] **Step 3: Implement the parser**

Create `app/composables/useCsvParser.ts`:

```ts
// Minimal CSV parser. Handles quoted fields (with embedded commas
// and escaped quotes ""), CR/LF/CRLF line endings, empty fields,
// and a UTF-8 BOM. Returns { headers, rows } with rows as string
// arrays — type coercion is the caller's job.
//
// Deliberately no new dependency — this is ~50 lines and covers
// every shape SL bank CSVs throw at it.

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

export const parseCsv = (input: string): ParsedCsv => {
  // Strip UTF-8 BOM if present.
  let src = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
  // Normalise line endings.
  src = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const tokens: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === "\"") {
        // Escaped quote ("") inside a quoted field
        if (src[i + 1] === "\"") {
          field += "\"";
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      tokens.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Flush any trailing field/row (no final newline).
  if (field !== "" || row.length > 0) {
    row.push(field);
    tokens.push(row);
  }

  if (tokens.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = tokens;
  // Drop fully-empty trailing rows (a trailing newline produces a [""] row).
  const cleaned = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  return { headers: headers ?? [], rows: cleaned };
};
```

- [ ] **Step 4: Run tests**

```bash
bun run test app/composables/useCsvParser.test.ts 2>&1 | tail -10
```
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useCsvParser.ts app/composables/useCsvParser.test.ts
git commit -m "feat(reconcile): CSV parser composable + tests

~50-line tokenizer covering quoted fields, escaped quotes,
CR/LF/CRLF endings, empty fields, UTF-8 BOM. No new dependency."
```

---

## Task 9: Date parser helper

**Files:**
- Create: `app/lib/date-parse.ts`
- Create: `app/lib/date-parse.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/date-parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStatementDate, type StatementDateFormat } from "./date-parse";

const cases: { format: StatementDateFormat, input: string, expected: string | null }[] = [
  { format: "YYYY-MM-DD",   input: "2026-05-27",  expected: "2026-05-27" },
  { format: "DD/MM/YYYY",   input: "27/05/2026",  expected: "2026-05-27" },
  { format: "DD-MM-YYYY",   input: "27-05-2026",  expected: "2026-05-27" },
  { format: "DD-MMM-YYYY",  input: "27-MAY-2026", expected: "2026-05-27" },
  { format: "DD-MMM-YYYY",  input: "27-may-2026", expected: "2026-05-27" },
  { format: "DD-MMM-YYYY",  input: "01-Jan-2026", expected: "2026-01-01" },
];

describe("parseStatementDate", () => {
  for (const c of cases) {
    it(`parses ${c.input} (${c.format})`, () => {
      expect(parseStatementDate(c.input, c.format)).toBe(c.expected);
    });
  }

  it("returns null for empty input", () => {
    expect(parseStatementDate("", "YYYY-MM-DD")).toBe(null);
  });

  it("returns null for malformed input", () => {
    expect(parseStatementDate("not-a-date", "DD/MM/YYYY")).toBe(null);
    expect(parseStatementDate("32/13/2026", "DD/MM/YYYY")).toBe(null);
    expect(parseStatementDate("27/XX/2026", "DD/MM/YYYY")).toBe(null);
  });

  it("returns null for unknown month abbreviation", () => {
    expect(parseStatementDate("27-XYZ-2026", "DD-MMM-YYYY")).toBe(null);
  });

  it("trims whitespace before parsing", () => {
    expect(parseStatementDate("  2026-05-27  ", "YYYY-MM-DD")).toBe("2026-05-27");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test app/lib/date-parse.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

Create `app/lib/date-parse.ts`:

```ts
// Statement-date parsing. SL banks export dates in wildly different
// formats; the reconcile-import flow lets the user pick which format
// applies to the column they mapped to "Date". This function turns
// the format key + raw string into ISO YYYY-MM-DD (the canonical
// format the rest of the codebase uses) or null on parse failure.

export type StatementDateFormat =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "DD-MM-YYYY"
  | "DD-MMM-YYYY";

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

const isValidYmd = (y: number, m: number, d: number): boolean => {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Cross-check via Date constructor — it normalises invalid combos
  // (e.g. Feb 31 → Mar 3). If the constructed date roundtrips back
  // to the same y/m/d, the input was valid.
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

const pad = (n: number): string => String(n).padStart(2, "0");

const toIso = (y: number, m: number, d: number): string =>
  `${y}-${pad(m)}-${pad(d)}`;

export const parseStatementDate = (
  raw: string,
  format: StatementDateFormat
): string | null => {
  const s = raw.trim();
  if (!s) return null;

  switch (format) {
    case "YYYY-MM-DD": {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
      if (!m) return null;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
    }
    case "DD/MM/YYYY": {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
      if (!m) return null;
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = Number(m[3]);
      return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
    }
    case "DD-MM-YYYY": {
      const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
      if (!m) return null;
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = Number(m[3]);
      return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
    }
    case "DD-MMM-YYYY": {
      const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
      if (!m) return null;
      const d = Number(m[1]);
      const mo = MONTH_ABBR[m[2]!.toLowerCase()];
      const y = Number(m[3]);
      if (!mo) return null;
      return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
    }
  }
};
```

- [ ] **Step 4: Run tests**

```bash
bun run test app/lib/date-parse.test.ts 2>&1 | tail -10
```
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/date-parse.ts app/lib/date-parse.test.ts
git commit -m "feat(reconcile): date parser helper + tests

Four formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD-MMM-YYYY.
Validates via Date roundtrip (Feb 31 → null, not Mar 3)."
```

---

## Task 10: Matching algorithm (pure function)

**Files:**
- Create: `app/lib/reconcile-match.ts`
- Create: `app/lib/reconcile-match.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/reconcile-match.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { suggestMatches, type MatchInputs } from "./reconcile-match";

const baseRow = {
  id: 1,
  business_bank_id: 1,
  statement_date: "2026-05-15",
  amount_cents: -50000,  // payment
  reference: "TXN123",
  matched_voucher_id: null
};

const baseVoucher = {
  id: 100,
  business_bank_id: 1,
  voucher_type: "payment" as const,
  voucher_date: "2026-05-15",
  amount_cents: 50000,
  reference: "TXN123",
  reconciled_at: null
};

describe("suggestMatches", () => {
  it("returns the only candidate for an exact match", () => {
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [baseVoucher]
    } as MatchInputs);
    expect(result.get(1)).toEqual([{ voucher: baseVoucher, score: 120 }]);
  });

  it("excludes vouchers on a different bank", () => {
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [{ ...baseVoucher, business_bank_id: 2 }]
    } as MatchInputs);
    expect(result.get(1)).toEqual([]);
  });

  it("excludes vouchers with wrong sign", () => {
    // statement is -50000 (payment), voucher is receipt
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [{ ...baseVoucher, voucher_type: "receipt" }]
    } as MatchInputs);
    expect(result.get(1)).toEqual([]);
  });

  it("excludes already-reconciled vouchers", () => {
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [{ ...baseVoucher, reconciled_at: "2026-05-16T10:00:00" }]
    } as MatchInputs);
    expect(result.get(1)).toEqual([]);
  });

  it("excludes amounts that don't match", () => {
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [{ ...baseVoucher, amount_cents: 49999 }]
    } as MatchInputs);
    expect(result.get(1)).toEqual([]);
  });

  it("excludes dates outside the ±3 day window", () => {
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [{ ...baseVoucher, voucher_date: "2026-05-19" }]  // +4 days
    } as MatchInputs);
    expect(result.get(1)).toEqual([]);
  });

  it("scores ±1 day at 100 (+ 20 for reference match = 120)", () => {
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [{ ...baseVoucher, voucher_date: "2026-05-16" }]
    } as MatchInputs);
    expect(result.get(1)?.[0]?.score).toBe(120);
  });

  it("scores ±2 days at 90", () => {
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [{ ...baseVoucher, voucher_date: "2026-05-17", reference: null }]
    } as MatchInputs);
    expect(result.get(1)?.[0]?.score).toBe(90);
  });

  it("scores ±3 days at 80", () => {
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [{ ...baseVoucher, voucher_date: "2026-05-18", reference: null }]
    } as MatchInputs);
    expect(result.get(1)?.[0]?.score).toBe(80);
  });

  it("adds 20 when references share a non-empty substring", () => {
    const result = suggestMatches({
      rows: [{ ...baseRow, reference: "ABC-TXN123-456" }],
      vouchers: [{ ...baseVoucher, reference: "TXN123" }]
    } as MatchInputs);
    expect(result.get(1)?.[0]?.score).toBe(120);
  });

  it("sorts multiple candidates by score desc, then date proximity asc, then id asc", () => {
    const result = suggestMatches({
      rows: [baseRow],
      vouchers: [
        { ...baseVoucher, id: 100, voucher_date: "2026-05-18", reference: null }, // ±3 = 80
        { ...baseVoucher, id: 101, voucher_date: "2026-05-15", reference: null }, // ±0 = 100
        { ...baseVoucher, id: 102, voucher_date: "2026-05-16", reference: null }  // ±1 = 100
      ]
    } as MatchInputs);
    const got = result.get(1)?.map((c) => c.voucher.id);
    expect(got).toEqual([101, 102, 100]);
  });

  it("matches receipt vouchers against positive statement amounts", () => {
    const result = suggestMatches({
      rows: [{ ...baseRow, amount_cents: 50000 }],
      vouchers: [{ ...baseVoucher, voucher_type: "receipt" }]
    } as MatchInputs);
    expect(result.get(1)?.length).toBe(1);
  });

  it("skips already-matched statement rows", () => {
    const result = suggestMatches({
      rows: [{ ...baseRow, matched_voucher_id: 999 }],
      vouchers: [baseVoucher]
    } as MatchInputs);
    expect(result.get(1)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test app/lib/reconcile-match.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the matcher**

Create `app/lib/reconcile-match.ts`:

```ts
// Pure matching algorithm extracted for testability. Stays free of
// Pinia / Vue / store imports — pass plain data in, get a Map back.
// The bank_statements store wraps this in suggestMatches(bankId) by
// passing rows + vouchers filtered by bank.

export interface MatchableRow {
  id: number
  business_bank_id: number
  statement_date: string         // ISO YYYY-MM-DD
  amount_cents: number           // signed: + receipt, - payment
  reference: string | null
  matched_voucher_id: number | null
}

export interface MatchableVoucher {
  id: number
  business_bank_id: number | null
  voucher_type: "receipt" | "payment"
  voucher_date: string           // ISO YYYY-MM-DD
  amount_cents: number           // always positive (the voucher's own amount)
  reference: string | null
  reconciled_at: string | null
}

export interface MatchInputs {
  rows: MatchableRow[]
  vouchers: MatchableVoucher[]
}

export interface MatchCandidate {
  voucher: MatchableVoucher
  score: number
}

const dayDiff = (aIso: string, bIso: string): number => {
  const a = new Date(`${aIso}T00:00:00`).getTime();
  const b = new Date(`${bIso}T00:00:00`).getTime();
  return Math.round(Math.abs(a - b) / 86400000);
};

const sharesSubstring = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return false;
  // Tokenise both, then check for any 3+ char token overlap. Prevents
  // single-letter matches; "the reference contains the voucher
  // number" style hits get the bonus.
  const tokens = (s: string) =>
    s.split(/[^A-Za-z0-9]+/).filter((t) => t.length >= 3).map((t) => t.toLowerCase());
  const at = new Set(tokens(a));
  const bt = tokens(b);
  return bt.some((t) => at.has(t));
};

export const suggestMatches = (inputs: MatchInputs): Map<number, MatchCandidate[]> => {
  const result = new Map<number, MatchCandidate[]>();

  for (const row of inputs.rows) {
    if (row.matched_voucher_id !== null) continue;

    const wantType: "receipt" | "payment" = row.amount_cents > 0 ? "receipt" : "payment";
    const wantAmount = Math.abs(row.amount_cents);

    const candidates: MatchCandidate[] = [];
    for (const voucher of inputs.vouchers) {
      if (voucher.reconciled_at !== null) continue;
      if (voucher.business_bank_id !== row.business_bank_id) continue;
      if (voucher.voucher_type !== wantType) continue;
      if (voucher.amount_cents !== wantAmount) continue;

      const diff = dayDiff(row.statement_date, voucher.voucher_date);
      if (diff > 3) continue;

      let score = 0;
      if (diff <= 1) score = 100;
      else if (diff === 2) score = 90;
      else score = 80;

      if (sharesSubstring(row.reference, voucher.reference)) score += 20;

      candidates.push({ voucher, score });
    }

    // Sort: score desc, then date proximity asc, then voucher id asc.
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = dayDiff(row.statement_date, a.voucher.voucher_date);
      const db = dayDiff(row.statement_date, b.voucher.voucher_date);
      if (da !== db) return da - db;
      return a.voucher.id - b.voucher.id;
    });

    result.set(row.id, candidates);
  }

  return result;
};
```

- [ ] **Step 4: Run tests**

```bash
bun run test app/lib/reconcile-match.test.ts 2>&1 | tail -10
```
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/reconcile-match.ts app/lib/reconcile-match.test.ts
git commit -m "feat(reconcile): pure matching algorithm + tests

Amount-exact + sign + bank scoping + ±3 day window. Score: ±1 day
= 100, ±2 = 90, ±3 = 80; +20 for shared reference token (3+ char
non-alphanumeric tokens). Sort: score desc, date proximity asc,
voucher id asc."
```

---

## Task 11: `bank_statements` Pinia store

**Files:**
- Create: `app/stores/bank_statements.ts`

- [ ] **Step 1: Implement the store**

Create `app/stores/bank_statements.ts`. Mirror the shape of `app/stores/recurring_invoices.ts` (load-once cache, ensureLoaded, pendingLoad, etc.):

```ts
// Bank reconciliation store. Holds imported bank statement rows and
// the link-state to vouchers.
//
// Generation, matching, and import are all user-initiated. No
// background jobs. All multi-step writes use sequential auto-commits
// per the connection-pool caveat — no JS-side BEGIN/COMMIT.
//
// linkMatch is the load-bearing op: it sets bank_statement_rows.
// matched_voucher_id + vouchers.reconciled_at as two separate
// UPDATEs. A crash between them leaves the row matched while the
// voucher shows unreconciled — recoverable: the next suggestion
// pass surfaces the inconsistency and the user can re-link.

import type { MatchableRow, MatchableVoucher, MatchCandidate } from "~/lib/reconcile-match";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select } from "~/lib/db";
import { suggestMatches as suggestMatchesFn } from "~/lib/reconcile-match";
import { useVouchersStore } from "~/stores/vouchers";

export interface BankStatementImportRow {
  id: number
  business_bank_id: number
  filename: string | null
  imported_at: string
  row_count: number
  column_mapping: string | null  // JSON
}

export interface BankStatementRowRow {
  id: number
  import_id: number
  business_bank_id: number
  statement_date: string
  description: string | null
  amount_cents: number
  reference: string | null
  balance_cents: number | null
  matched_voucher_id: number | null
  matched_at: string | null
  dedupe_hash: string
}

export interface ColumnMapping {
  // Index into the CSV's columns array. -1 means "not mapped".
  date: number
  description: number
  amount: number          // signed; if -1 and (debit + credit) are set, computed
  debit: number
  credit: number
  reference: number
  balance: number
  // Parsing config
  dateFormat: "YYYY-MM-DD" | "DD/MM/YYYY" | "DD-MM-YYYY" | "DD-MMM-YYYY"
}

export interface ImportCsvInput {
  bankId: number
  filename: string
  columnMapping: ColumnMapping
  rows: { dateIso: string, description: string | null, amountCents: number, reference: string | null, balanceCents: number | null }[]
}

// SHA-256 via Web Crypto. Returns lowercase hex.
const sha256 = async (s: string): Promise<string> => {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const dedupeHashInput = (r: ImportCsvInput["rows"][number]): string =>
  `${r.dateIso}|${r.amountCents}|${r.description ?? ""}|${r.reference ?? ""}`;

export const useBankStatementsStore = defineStore("bank_statements", () => {
  const imports = ref<BankStatementImportRow[]>([]);
  const rows = ref<BankStatementRowRow[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const loaded = ref(false);
  let pendingLoad: Promise<void> | null = null;

  const load = async () => {
    loading.value = true;
    error.value = null;
    try {
      imports.value = await select<BankStatementImportRow>(
        "SELECT * FROM bank_statement_imports ORDER BY imported_at DESC"
      );
      rows.value = await select<BankStatementRowRow>(
        "SELECT * FROM bank_statement_rows ORDER BY statement_date DESC, id DESC"
      );
      loaded.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const ensureLoaded = async () => {
    if (loaded.value) return;
    if (!pendingLoad) {
      pendingLoad = load().finally(() => {
        pendingLoad = null;
      });
    }
    await pendingLoad;
  };

  const importCsv = async (input: ImportCsvInput): Promise<{ inserted: number, skipped: number }> => {
    // Insert the import row first.
    const importResult = await execute(
      `INSERT INTO bank_statement_imports
        (business_bank_id, filename, row_count, column_mapping)
       VALUES (?, ?, ?, ?)`,
      [input.bankId, input.filename, input.rows.length, JSON.stringify(input.columnMapping)]
    );
    const importId = importResult.lastInsertId;
    if (importId === undefined) throw new Error("importCsv: no import lastInsertId");

    let inserted = 0;
    let skipped = 0;
    for (const r of input.rows) {
      const hash = await sha256(dedupeHashInput(r));
      try {
        await execute(
          `INSERT INTO bank_statement_rows
            (import_id, business_bank_id, statement_date, description,
             amount_cents, reference, balance_cents, dedupe_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            importId,
            input.bankId,
            r.dateIso,
            r.description,
            r.amountCents,
            r.reference,
            r.balanceCents,
            hash
          ]
        );
        inserted += 1;
      } catch (e) {
        // UNIQUE (business_bank_id, dedupe_hash) collision → already imported.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE") || msg.includes("constraint")) {
          skipped += 1;
        } else {
          throw e;
        }
      }
    }

    // Update the row_count to reflect what actually went in.
    if (inserted !== input.rows.length) {
      await execute(
        "UPDATE bank_statement_imports SET row_count = ? WHERE id = ?",
        [inserted, importId]
      );
    }

    await load();
    return { inserted, skipped };
  };

  const linkMatch = async (rowId: number, voucherId: number): Promise<void> => {
    const now = new Date().toISOString();
    // Two sequential auto-commits — see header comment.
    await execute(
      "UPDATE bank_statement_rows SET matched_voucher_id = ?, matched_at = ? WHERE id = ?",
      [voucherId, now, rowId]
    );
    await execute(
      "UPDATE vouchers SET reconciled_at = ? WHERE id = ?",
      [now, voucherId]
    );
    // Refresh local state.
    const row = rows.value.find((r) => r.id === rowId);
    if (row) {
      row.matched_voucher_id = voucherId;
      row.matched_at = now;
    }
    await useVouchersStore().load();
  };

  const unlinkMatch = async (rowId: number): Promise<void> => {
    const row = rows.value.find((r) => r.id === rowId);
    const voucherId = row?.matched_voucher_id ?? null;
    await execute(
      "UPDATE bank_statement_rows SET matched_voucher_id = NULL, matched_at = NULL WHERE id = ?",
      [rowId]
    );
    if (voucherId !== null) {
      await execute(
        "UPDATE vouchers SET reconciled_at = NULL WHERE id = ?",
        [voucherId]
      );
      await useVouchersStore().load();
    }
    if (row) {
      row.matched_voucher_id = null;
      row.matched_at = null;
    }
  };

  const deleteImport = async (importId: number): Promise<void> => {
    // Clear reconciled_at on any vouchers matched to this import's
    // rows BEFORE deleting (so they're unreconciled going forward).
    const matchedVoucherIds = rows.value
      .filter((r) => r.import_id === importId && r.matched_voucher_id !== null)
      .map((r) => r.matched_voucher_id!);
    for (const vid of matchedVoucherIds) {
      await execute("UPDATE vouchers SET reconciled_at = NULL WHERE id = ?", [vid]);
    }
    // Delete the import — CASCADE drops the rows.
    await execute("DELETE FROM bank_statement_imports WHERE id = ?", [importId]);
    await load();
    if (matchedVoucherIds.length > 0) await useVouchersStore().load();
  };

  const suggestMatchesFor = (bankId: number): Map<number, MatchCandidate[]> => {
    const vouchers = useVouchersStore();
    const matchable: MatchableRow[] = rows.value
      .filter((r) => r.business_bank_id === bankId)
      .map((r) => ({
        id: r.id,
        business_bank_id: r.business_bank_id,
        statement_date: r.statement_date,
        amount_cents: r.amount_cents,
        reference: r.reference,
        matched_voucher_id: r.matched_voucher_id
      }));
    const matchableVouchers: MatchableVoucher[] = vouchers.vouchers
      .filter((v) => v.business_bank_id === bankId)
      .map((v) => ({
        id: v.id,
        business_bank_id: v.business_bank_id,
        voucher_type: v.voucher_type,
        voucher_date: v.voucher_date,
        amount_cents: v.amount_cents,
        reference: v.reference,
        reconciled_at: v.reconciled_at
      }));
    return suggestMatchesFn({ rows: matchable, vouchers: matchableVouchers });
  };

  // Last-used column mapping for a bank — pre-selects the import
  // modal's dropdowns next time.
  const lastMappingFor = (bankId: number): ColumnMapping | null => {
    const lastImport = imports.value.find((i) => i.business_bank_id === bankId);
    if (!lastImport?.column_mapping) return null;
    try {
      return JSON.parse(lastImport.column_mapping) as ColumnMapping;
    } catch {
      return null;
    }
  };

  // Unreconciled vouchers for a bank — vouchers with this bank_id
  // and reconciled_at NULL. The reconcile page's "Unreconciled
  // vouchers" panel reads off this.
  const unreconciledVouchersFor = (bankId: number) =>
    computed(() => useVouchersStore().vouchers.filter(
      (v) => v.business_bank_id === bankId && v.reconciled_at === null
    ));

  return {
    imports,
    rows,
    loading,
    error,
    loaded,
    load,
    ensureLoaded,
    importCsv,
    linkMatch,
    unlinkMatch,
    deleteImport,
    suggestMatchesFor,
    lastMappingFor,
    unreconciledVouchersFor
  };
});
```

- [ ] **Step 2: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/stores/bank_statements.ts
git commit -m "feat(reconcile): bank_statements Pinia store

CRUD on imports + rows, linkMatch / unlinkMatch (two sequential
auto-commits per the connection-pool caveat), deleteImport with
matched-voucher unreconciliation, suggestMatchesFor (wraps the
pure matcher), lastMappingFor (last-used column mapping per bank),
unreconciledVouchersFor (the side-panel data source)."
```

---

## Task 12: Reconcile page skeleton

**Files:**
- Create: `app/pages/reconcile.vue`

- [ ] **Step 1: Implement the page**

Create `app/pages/reconcile.vue`. Mirror the structure of `app/pages/reports/aged-receivables.vue` (bank selector + filter chips + table + side panel pattern):

```vue
<template>
	<div class="select-none">
		<!-- Top toolbar: title + help + import button -->
		<div class="mb-4 flex items-center justify-between gap-4 flex-wrap">
			<h1 class="text-2xl font-semibold flex items-center gap-3">
				Bank reconciliation
				<HelpButton slug="reconciliation" />
			</h1>
			<UButton
				size="sm"
				icon="i-lucide-upload"
				:disabled="banks.activeBanks.length === 0"
				@click="importOpen = true"
			>
				Import statement
			</UButton>
		</div>

		<!-- Bank selector + summary -->
		<UCard class="mb-6">
			<template #header>
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<UFormField label="Bank account" :ui="{ root: 'w-auto' }">
						<USelect
							v-model="selectedBankId"
							:items="bankOptions"
							value-key="value"
							class="md:w-72"
						/>
					</UFormField>
					<div class="text-sm text-(--ui-text-muted) tabular-nums">
						<span class="font-medium text-(--ui-text)">{{ matchedCount }}</span> of
						<span class="font-medium text-(--ui-text)">{{ allRows.length }}</span> reconciled
						·
						<span class="font-medium text-(--ui-text)">{{ unmatchedRows.length }}</span> unmatched
						·
						<span class="font-medium text-(--ui-text)">{{ unreconciledVouchers.length }}</span> unmatched vouchers
					</div>
				</div>
			</template>

			<!-- Status filter chips -->
			<div class="flex items-center gap-2 flex-wrap">
				<UButton
					v-for="s in STATUS_FILTERS"
					:key="s.key"
					size="xs"
					:variant="statusFilters.includes(s.key) ? 'solid' : 'soft'"
					:color="statusFilters.includes(s.key) ? 'primary' : 'neutral'"
					@click="toggleStatusFilter(s.key)"
				>
					{{ s.label }}
				</UButton>
				<UButton
					v-if="suggestedRows.length > 0"
					size="xs"
					variant="soft"
					color="primary"
					icon="i-lucide-check-check"
					class="ml-auto"
					@click="acceptAllSuggestions"
				>
					Accept all suggestions ({{ suggestedRows.length }})
				</UButton>
			</div>
		</UCard>

		<!-- Statement rows table -->
		<UCard class="mb-6">
			<template #header>
				<div class="app-chrome font-medium">
					Statement rows
				</div>
			</template>
			<div v-if="visibleRows.length === 0" class="py-10 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-file-search" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="allRows.length === 0">
					No statement rows yet. Click <span class="font-medium">Import statement</span> to upload a CSV.
				</div>
				<div v-else>
					No rows match the current filter.
				</div>
			</div>
			<ReconcileStatementRowList
				v-else
				:rows="visibleRows"
				:suggestions="suggestionsMap"
				@accept="onAccept"
				@unlink="onUnlink"
				@pick-other="(rowId) => openPicker(rowId)"
				@find-voucher="(rowId) => openPicker(rowId)"
				@create-voucher="(rowId) => openCreateVoucher(rowId)"
			/>
		</UCard>

		<!-- Import history -->
		<UCard v-if="importsForBank.length > 0" class="mb-6">
			<template #header>
				<div class="app-chrome font-medium">
					Imports
				</div>
			</template>
			<div class="space-y-1.5">
				<div
					v-for="imp in importsForBank"
					:key="imp.id"
					class="flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm"
				>
					<div class="min-w-0 flex-1">
						<div class="font-medium truncate">{{ imp.filename || "(no filename)" }}</div>
						<div class="text-xs text-(--ui-text-muted)">
							{{ imp.row_count }} row{{ imp.row_count === 1 ? '' : 's' }} · {{ imp.imported_at.split(' ')[0] }}
						</div>
					</div>
					<UButton
						size="xs"
						variant="ghost"
						color="error"
						icon="i-lucide-trash-2"
						@click="confirmDeleteImport(imp.id, imp.filename, imp.row_count)"
					/>
				</div>
			</div>
		</UCard>

		<!-- Unreconciled vouchers side panel -->
		<UCard v-if="unreconciledVouchers.length > 0">
			<template #header>
				<div class="app-chrome font-medium">
					Unreconciled vouchers ({{ unreconciledVouchers.length }})
				</div>
			</template>
			<div class="text-xs text-(--ui-text-muted) mb-3">
				Vouchers on this bank that aren't on the imported statement. Could be a missing entry or a bounced transaction.
			</div>
			<div class="space-y-1">
				<NuxtLink
					v-for="v in unreconciledVouchers.slice(0, 20)"
					:key="v.id"
					:to="`/vouchers/${v.id}`"
					class="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-(--ui-bg-elevated) text-sm"
				>
					<span class="font-mono text-xs">{{ v.number }}</span>
					<span class="text-(--ui-text-muted)">{{ v.voucher_date }}</span>
					<span class="flex-1 truncate text-(--ui-text-muted)">{{ v.description || "—" }}</span>
					<span class="tabular-nums" :class="v.voucher_type === 'receipt' ? 'text-(--ui-success)' : 'text-(--ui-error)'">
						{{ v.voucher_type === "receipt" ? "+" : "−" }}{{ formatLKR(v.amount_cents) }}
					</span>
				</NuxtLink>
			</div>
			<div v-if="unreconciledVouchers.length > 20" class="text-xs text-(--ui-text-muted) mt-3 text-center">
				+ {{ unreconciledVouchers.length - 20 }} more
			</div>
		</UCard>

		<!-- Modals -->
		<BankStatementImportModal
			v-model:open="importOpen"
			:bank-id="selectedBankId"
		/>
		<BankStatementVoucherPickerModal
			v-model:open="pickerOpen"
			:bank-id="selectedBankId"
			:row-id="pickerRowId"
			@picked="onPickerPicked"
		/>
		<BankStatementCreateVoucherModal
			v-model:open="createOpen"
			:bank-id="selectedBankId"
			:source-row="createSourceRow"
			@created="onVoucherCreated"
		/>
	</div>
</template>

<script setup lang="ts">
	import type { MatchCandidate } from "~/lib/reconcile-match";
	import { formatLKR } from "~/lib/money";
	import { useBankStatementsStore } from "~/stores/bank_statements";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Reconcile" });

	const banks = useBusinessBanksStore();
	const vouchersStore = useVouchersStore();
	const store = useBankStatementsStore();
	const toast = useToast();

	await Promise.all([
		banks.ensureLoaded(),
		vouchersStore.ensureLoaded(),
		store.ensureLoaded()
	]);

	const selectedBankId = ref<number | null>(banks.defaultBank?.id ?? banks.activeBanks[0]?.id ?? null);

	type StatusKey = "matched" | "suggested" | "unmatched";
	const STATUS_FILTERS: { key: StatusKey, label: string }[] = [
		{ key: "matched", label: "Matched" },
		{ key: "suggested", label: "Suggested" },
		{ key: "unmatched", label: "Unmatched" }
	];
	const statusFilters = ref<StatusKey[]>([]);
	const toggleStatusFilter = (s: StatusKey) => {
		const idx = statusFilters.value.indexOf(s);
		if (idx === -1) statusFilters.value.push(s);
		else statusFilters.value.splice(idx, 1);
	};

	const bankOptions = computed(() =>
		banks.activeBanks.map((b) => ({
			label: b.bank_name ? `${b.label} · ${b.bank_name}` : b.label,
			value: b.id
		}))
	);

	const allRows = computed(() =>
		selectedBankId.value === null
			? []
			: store.rows.filter((r) => r.business_bank_id === selectedBankId.value)
	);

	const suggestionsMap = computed<Map<number, MatchCandidate[]>>(() =>
		selectedBankId.value === null
			? new Map()
			: store.suggestMatchesFor(selectedBankId.value)
	);

	const statusOf = (row: typeof allRows.value[number]): StatusKey => {
		if (row.matched_voucher_id !== null) return "matched";
		const suggestions = suggestionsMap.value.get(row.id);
		if (suggestions && suggestions.length > 0) return "suggested";
		return "unmatched";
	};

	const matchedCount = computed(() => allRows.value.filter((r) => r.matched_voucher_id !== null).length);
	const unmatchedRows = computed(() => allRows.value.filter((r) => r.matched_voucher_id === null));
	const suggestedRows = computed(() =>
		unmatchedRows.value.filter((r) => (suggestionsMap.value.get(r.id)?.length ?? 0) > 0)
	);

	const visibleRows = computed(() => {
		if (statusFilters.value.length === 0) return allRows.value;
		return allRows.value.filter((r) => statusFilters.value.includes(statusOf(r)));
	});

	const unreconciledVouchers = computed(() =>
		selectedBankId.value === null
			? []
			: vouchersStore.vouchers
				.filter((v) => v.business_bank_id === selectedBankId.value && v.reconciled_at === null)
				.sort((a, b) => b.voucher_date.localeCompare(a.voucher_date))
	);

	const onAccept = async (rowId: number, voucherId: number) => {
		try {
			await store.linkMatch(rowId, voucherId);
			toast.add({ title: "Linked", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Could not link", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	const onUnlink = async (rowId: number) => {
		try {
			await store.unlinkMatch(rowId);
			toast.add({ title: "Unlinked", color: "info", icon: "i-lucide-unlink" });
		} catch (err) {
			toast.add({ title: "Could not unlink", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	const acceptAllSuggestions = async () => {
		const ops: Promise<void>[] = [];
		for (const row of suggestedRows.value) {
			const top = suggestionsMap.value.get(row.id)?.[0];
			if (!top) continue;
			ops.push(store.linkMatch(row.id, top.voucher.id));
		}
		try {
			await Promise.all(ops);
			toast.add({ title: `Linked ${ops.length} suggestion${ops.length === 1 ? "" : "s"}`, color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Some links failed", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	// Modal state
	const importOpen = ref(false);
	const pickerOpen = ref(false);
	const pickerRowId = ref<number | null>(null);
	const openPicker = (rowId: number) => {
		pickerRowId.value = rowId;
		pickerOpen.value = true;
	};
	const onPickerPicked = async (rowId: number, voucherId: number) => {
		await onAccept(rowId, voucherId);
		pickerOpen.value = false;
	};

	const createOpen = ref(false);
	const createSourceRow = ref<typeof allRows.value[number] | null>(null);
	const openCreateVoucher = (rowId: number) => {
		createSourceRow.value = allRows.value.find((r) => r.id === rowId) ?? null;
		createOpen.value = true;
	};
	const onVoucherCreated = async () => {
		createOpen.value = false;
		// linkMatch already called in the modal; refresh state.
		await Promise.all([store.load(), vouchersStore.load()]);
	};

	// Imports for the selected bank, newest first.
	const importsForBank = computed(() =>
		selectedBankId.value === null
			? []
			: store.imports.filter((i) => i.business_bank_id === selectedBankId.value)
	);

	// Delete-import confirmation. Uses window.confirm for v1 simplicity;
	// upgrade to a UModal later if the question grows more nuanced. The
	// store's deleteImport handles the cascade: clears reconciled_at on
	// every matched voucher, then deletes the import (CASCADE drops the
	// statement rows).
	const confirmDeleteImport = async (id: number, filename: string | null, rowCount: number) => {
		const matchedCount = store.rows.filter(
			(r) => r.import_id === id && r.matched_voucher_id !== null
		).length;
		const msg = `Delete this import?\n\n${rowCount} statement row${rowCount === 1 ? "" : "s"} (${filename ?? "no filename"}) will be removed. ${matchedCount} matched voucher${matchedCount === 1 ? "" : "s"} will be marked unreconciled.`;
		if (!window.confirm(msg)) return;
		try {
			await store.deleteImport(id);
			toast.add({ title: "Import deleted", color: "info", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};
</script>
```

- [ ] **Step 2: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean (will warn about unimported components — they'll be created in next tasks).

- [ ] **Step 3: Commit**

```bash
git add app/pages/reconcile.vue
git commit -m "feat(reconcile): skeleton page — bank selector, status chips, table, side panel"
```

---

## Task 13: `ReconcileStatementRowList` component

**Files:**
- Create: `app/components/ReconcileStatementRowList.vue`

- [ ] **Step 1: Implement the row list**

Create `app/components/ReconcileStatementRowList.vue`:

```vue
<template>
	<div>
		<!-- Column header -->
		<div class="hidden md:grid md:grid-cols-[10rem_minmax(12rem,1fr)_8rem_8rem_minmax(10rem,16rem)] gap-3 text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border) pb-2 mb-3">
			<span>Date</span>
			<span>Description</span>
			<span class="text-right">Amount</span>
			<span>Status</span>
			<span>Actions</span>
		</div>

		<div class="space-y-2">
			<div
				v-for="row in rows"
				:key="row.id"
				class="rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated)/40 p-3 md:grid md:grid-cols-[10rem_minmax(12rem,1fr)_8rem_8rem_minmax(10rem,16rem)] md:gap-3 md:items-center"
				:class="rowToneClass(row)"
			>
				<!-- Date -->
				<div class="text-sm tabular-nums">{{ row.statement_date }}</div>

				<!-- Description + reference -->
				<div class="min-w-0">
					<div class="font-medium truncate">{{ row.description || "—" }}</div>
					<div v-if="row.reference" class="text-xs text-(--ui-text-muted) truncate font-mono">{{ row.reference }}</div>
				</div>

				<!-- Amount -->
				<div class="tabular-nums text-right font-medium" :class="row.amount_cents > 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'">
					{{ row.amount_cents > 0 ? "+" : "−" }}{{ formatLKR(Math.abs(row.amount_cents)) }}
				</div>

				<!-- Status badge -->
				<div>
					<UBadge v-if="row.matched_voucher_id !== null" color="success" variant="subtle">Matched</UBadge>
					<UBadge v-else-if="hasSuggestion(row)" color="warning" variant="subtle">Suggested</UBadge>
					<UBadge v-else color="neutral" variant="subtle">Unmatched</UBadge>
				</div>

				<!-- Actions -->
				<div class="flex items-center gap-1.5 flex-wrap">
					<template v-if="row.matched_voucher_id !== null">
						<NuxtLink :to="`/vouchers/${row.matched_voucher_id}`" class="text-xs font-mono text-(--ui-primary) hover:underline">
							{{ matchedNumberOf(row) }}
						</NuxtLink>
						<UButton
							size="xs"
							variant="ghost"
							color="neutral"
							icon="i-lucide-unlink"
							title="Unlink"
							@click="$emit('unlink', row.id)"
						/>
					</template>
					<template v-else-if="hasSuggestion(row)">
						<NuxtLink :to="`/vouchers/${topSuggestionOf(row)!.voucher.id}`" class="text-xs font-mono text-(--ui-primary) hover:underline">
							{{ topSuggestionOf(row)!.voucher.number }}
						</NuxtLink>
						<UButton size="xs" variant="solid" color="primary" @click="$emit('accept', row.id, topSuggestionOf(row)!.voucher.id)">
							Accept
						</UButton>
						<UButton size="xs" variant="soft" color="neutral" @click="$emit('pickOther', row.id)">
							Other
						</UButton>
					</template>
					<template v-else>
						<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-search" @click="$emit('findVoucher', row.id)">
							Find
						</UButton>
						<UButton size="xs" variant="soft" color="primary" icon="i-lucide-plus" @click="$emit('createVoucher', row.id)">
							Create
						</UButton>
					</template>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import type { MatchCandidate } from "~/lib/reconcile-match";
	import type { BankStatementRowRow } from "~/stores/bank_statements";
	import { formatLKR } from "~/lib/money";
	import { useVouchersStore } from "~/stores/vouchers";

	const props = defineProps<{
		rows: BankStatementRowRow[]
		suggestions: Map<number, MatchCandidate[]>
	}>();

	defineEmits<{
		accept: [rowId: number, voucherId: number]
		unlink: [rowId: number]
		pickOther: [rowId: number]
		findVoucher: [rowId: number]
		createVoucher: [rowId: number]
	}>();

	const vouchers = useVouchersStore();

	const hasSuggestion = (row: BankStatementRowRow) =>
		(props.suggestions.get(row.id)?.length ?? 0) > 0;

	const topSuggestionOf = (row: BankStatementRowRow): MatchCandidate | undefined =>
		props.suggestions.get(row.id)?.[0];

	const matchedNumberOf = (row: BankStatementRowRow): string => {
		if (row.matched_voucher_id === null) return "";
		return vouchers.vouchers.find((v) => v.id === row.matched_voucher_id)?.number ?? `#${row.matched_voucher_id}`;
	};

	const rowToneClass = (row: BankStatementRowRow): string => {
		if (row.matched_voucher_id !== null) return "border-(--ui-success)/30";
		if (hasSuggestion(row)) return "border-(--ui-warning)/30";
		return "";
	};
</script>
```

- [ ] **Step 2: Add `topSuggestionOf(row)!.voucher.number` requires the candidate's voucher to have `number`**

Look at the `MatchableVoucher` interface in `app/lib/reconcile-match.ts`. It doesn't have `number`. The page passes `vouchers.vouchers` which DOES have `number`. To make the row list render the voucher number from the match candidate, we need the `MatchableVoucher` type to expose it, OR look it up via the vouchers store.

Simpler: look it up via vouchers store in the component (matches the `matchedNumberOf` pattern). Replace:

```vue
<NuxtLink :to="`/vouchers/${topSuggestionOf(row)!.voucher.id}`" class="text-xs font-mono text-(--ui-primary) hover:underline">
  {{ topSuggestionOf(row)!.voucher.number }}
</NuxtLink>
```

with:

```vue
<NuxtLink :to="`/vouchers/${topSuggestionOf(row)!.voucher.id}`" class="text-xs font-mono text-(--ui-primary) hover:underline">
  {{ voucherNumberOf(topSuggestionOf(row)!.voucher.id) }}
</NuxtLink>
```

And add to script:

```ts
const voucherNumberOf = (id: number): string =>
  vouchers.vouchers.find((v) => v.id === id)?.number ?? `#${id}`;
```

- [ ] **Step 3: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/components/ReconcileStatementRowList.vue
git commit -m "feat(reconcile): statement row list component

Per-row card with date / description / amount / status badge /
inline actions. Status-tinted left border (success / warning /
neutral). Top suggestion + Accept/Other buttons for suggested
rows; Find/Create for unmatched."
```

---

## Task 14: `BankStatementImportModal` component

**Files:**
- Create: `app/components/BankStatementImportModal.vue`

- [ ] **Step 1: Implement the modal**

Create `app/components/BankStatementImportModal.vue`:

```vue
<template>
	<UModal v-model:open="openModel" :title="`Import statement for ${bankName}`" :ui="{ content: 'max-w-3xl' }">
		<template #body>
			<div v-if="step === 'pick'" class="space-y-4">
				<p class="text-sm text-(--ui-text-muted)">
					Upload a CSV bank statement. After you map the columns, we'll import the rows and try to match them against existing vouchers on this bank account.
				</p>
				<UButton icon="i-lucide-file-up" :loading="reading" @click="onPickFile">
					Choose CSV file…
				</UButton>
			</div>

			<div v-else-if="step === 'map'" class="space-y-4">
				<p class="text-sm text-(--ui-text-muted)">
					<strong>{{ filename }}</strong> — {{ rawRows.length }} rows detected. Map each CSV column to its meaning, then confirm.
				</p>

				<!-- Column mapping table -->
				<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
					<table class="w-full text-sm">
						<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
							<tr>
								<th class="px-2 py-2 font-medium">Column</th>
								<th class="px-2 py-2 font-medium">Role</th>
								<th
									v-for="(_, i) in rawRows.slice(0, 3)"
									:key="i"
									class="px-2 py-2 font-medium"
								>Sample {{ i + 1 }}</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="(header, colIdx) in headers"
								:key="colIdx"
								class="border-t border-(--ui-border)"
							>
								<td class="px-2 py-2 font-mono text-xs">{{ header || `(col ${colIdx + 1})` }}</td>
								<td class="px-2 py-2">
									<USelect
										v-model="columnRoles[colIdx]"
										:items="ROLE_OPTIONS"
										value-key="value"
										class="min-w-40"
									/>
								</td>
								<td
									v-for="(row, rowIdx) in rawRows.slice(0, 3)"
									:key="rowIdx"
									class="px-2 py-2 text-(--ui-text-muted) truncate max-w-[12rem]"
								>{{ row[colIdx] }}</td>
							</tr>
						</tbody>
					</table>
				</div>

				<!-- Date format -->
				<UFormField label="Date format" help="Pick the format used in the Date column.">
					<URadioGroup
						v-model="dateFormat"
						:items="DATE_FORMAT_OPTIONS"
						value-key="value"
						orientation="horizontal"
					/>
				</UFormField>

				<!-- Parse preview / errors -->
				<UAlert
					v-if="parseError"
					color="error"
					icon="i-lucide-circle-alert"
					:title="parseError"
				/>
				<div v-else-if="parsedRows.length > 0" class="text-sm text-(--ui-text-muted)">
					<strong>{{ parsedRows.length }}</strong> rows ready to import.
				</div>
			</div>
		</template>

		<template #footer>
			<div class="flex justify-between items-center gap-2 w-full">
				<UButton
					v-if="step === 'map'"
					variant="ghost"
					color="neutral"
					@click="step = 'pick'"
				>
					Back
				</UButton>
				<div v-else />
				<div class="flex gap-2">
					<UButton color="neutral" variant="outline" :disabled="importing" @click="cancel">
						Cancel
					</UButton>
					<UButton
						v-if="step === 'map'"
						color="primary"
						icon="i-lucide-upload"
						:loading="importing"
						:disabled="!canImport"
						@click="confirmImport"
					>
						Import {{ parsedRows.length }} rows
					</UButton>
				</div>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import type { ColumnMapping } from "~/stores/bank_statements";
	import type { StatementDateFormat } from "~/lib/date-parse";
	import { open as openDialog } from "@tauri-apps/plugin-dialog";
	import { readTextFile } from "@tauri-apps/plugin-fs";
	import { parseCsv } from "~/composables/useCsvParser";
	import { parseStatementDate } from "~/lib/date-parse";
	import { useBankStatementsStore } from "~/stores/bank_statements";
	import { useBusinessBanksStore } from "~/stores/business_banks";

	const props = defineProps<{
		bankId: number | null
	}>();
	const openModel = defineModel<boolean>("open", { default: false });

	const store = useBankStatementsStore();
	const banks = useBusinessBanksStore();
	const toast = useToast();

	const bankName = computed(() => {
		const b = banks.activeBanks.find((x) => x.id === props.bankId);
		return b ? (b.bank_name ?? b.label) : "—";
	});

	type Role = "ignore" | "date" | "description" | "amount" | "debit" | "credit" | "reference" | "balance";
	const ROLE_OPTIONS: { label: string, value: Role }[] = [
		{ label: "Ignore", value: "ignore" },
		{ label: "Date", value: "date" },
		{ label: "Description", value: "description" },
		{ label: "Amount (signed)", value: "amount" },
		{ label: "Debit (outflow)", value: "debit" },
		{ label: "Credit (inflow)", value: "credit" },
		{ label: "Reference", value: "reference" },
		{ label: "Balance", value: "balance" }
	];

	const DATE_FORMAT_OPTIONS: { label: string, value: StatementDateFormat }[] = [
		{ label: "YYYY-MM-DD", value: "YYYY-MM-DD" },
		{ label: "DD/MM/YYYY", value: "DD/MM/YYYY" },
		{ label: "DD-MM-YYYY", value: "DD-MM-YYYY" },
		{ label: "DD-MMM-YYYY", value: "DD-MMM-YYYY" }
	];

	const step = ref<"pick" | "map">("pick");
	const filename = ref("");
	const headers = ref<string[]>([]);
	const rawRows = ref<string[][]>([]);
	const columnRoles = ref<Role[]>([]);
	const dateFormat = ref<StatementDateFormat>("YYYY-MM-DD");
	const reading = ref(false);
	const importing = ref(false);

	// Reset on close
	watch(openModel, (open) => {
		if (!open) {
			step.value = "pick";
			filename.value = "";
			headers.value = [];
			rawRows.value = [];
			columnRoles.value = [];
			dateFormat.value = "YYYY-MM-DD";
			importing.value = false;
		} else if (props.bankId !== null) {
			// Pre-select last-used mapping if any
			const last = store.lastMappingFor(props.bankId);
			if (last) dateFormat.value = last.dateFormat;
		}
	});

	const onPickFile = async () => {
		reading.value = true;
		try {
			const picked = await openDialog({
				multiple: false,
				filters: [{ name: "CSV", extensions: ["csv", "txt"] }]
			});
			if (!picked || typeof picked !== "string") {
				reading.value = false;
				return;
			}
			const contents = await readTextFile(picked);
			const parsed = parseCsv(contents);
			if (parsed.rows.length === 0) {
				toast.add({
					title: "No data rows found",
					description: "The file appears to be empty or only contains headers.",
					color: "warning",
					icon: "i-lucide-circle-alert"
				});
				reading.value = false;
				return;
			}
			filename.value = picked.split(/[\\/]/).pop() ?? "statement.csv";
			headers.value = parsed.headers;
			rawRows.value = parsed.rows;
			// Apply last-used mapping if columns match by count, else default
			const last = props.bankId !== null ? store.lastMappingFor(props.bankId) : null;
			columnRoles.value = headers.value.map((h, idx) => {
				if (last) {
					if (last.date === idx) return "date";
					if (last.description === idx) return "description";
					if (last.amount === idx) return "amount";
					if (last.debit === idx) return "debit";
					if (last.credit === idx) return "credit";
					if (last.reference === idx) return "reference";
					if (last.balance === idx) return "balance";
				}
				// Heuristic fallback: match header to a role
				const lower = h.toLowerCase().trim();
				if (/date/.test(lower)) return "date";
				if (/desc|narration|particulars/.test(lower)) return "description";
				if (/amount/.test(lower)) return "amount";
				if (/debit|withdraw/.test(lower)) return "debit";
				if (/credit|deposit/.test(lower)) return "credit";
				if (/ref|cheque|txn/.test(lower)) return "reference";
				if (/balance/.test(lower)) return "balance";
				return "ignore";
			});
			step.value = "map";
		} catch (err) {
			toast.add({
				title: "Couldn't read the CSV",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			reading.value = false;
		}
	};

	const findCol = (role: Role): number => columnRoles.value.findIndex((r) => r === role);

	const parseError = ref<string | null>(null);

	const parsedRows = computed<{ dateIso: string, description: string | null, amountCents: number, reference: string | null, balanceCents: number | null }[]>(() => {
		parseError.value = null;
		const dateCol = findCol("date");
		const amountCol = findCol("amount");
		const debitCol = findCol("debit");
		const creditCol = findCol("credit");
		const descCol = findCol("description");
		const refCol = findCol("reference");
		const balCol = findCol("balance");

		if (dateCol === -1) { parseError.value = "Pick a Date column."; return []; }
		const hasAmount = amountCol !== -1;
		const hasDebitCredit = debitCol !== -1 && creditCol !== -1;
		if (!hasAmount && !hasDebitCredit) {
			parseError.value = "Pick either an Amount column OR both Debit + Credit columns.";
			return [];
		}

		const out: ReturnType<typeof parsedRows.value> = [];
		const failures: number[] = [];
		for (let i = 0; i < rawRows.value.length; i++) {
			const r = rawRows.value[i]!;
			const dateIso = parseStatementDate(r[dateCol] ?? "", dateFormat.value);
			if (!dateIso) { failures.push(i); continue; }

			let amountCents: number;
			if (hasAmount) {
				const raw = (r[amountCol] ?? "").replace(/[, ]/g, "");
				const n = parseFloat(raw);
				if (!Number.isFinite(n)) { failures.push(i); continue; }
				amountCents = Math.round(n * 100);
			} else {
				const dRaw = (r[debitCol] ?? "").replace(/[, ]/g, "");
				const cRaw = (r[creditCol] ?? "").replace(/[, ]/g, "");
				const dN = dRaw ? parseFloat(dRaw) : 0;
				const cN = cRaw ? parseFloat(cRaw) : 0;
				if (!Number.isFinite(dN) || !Number.isFinite(cN)) { failures.push(i); continue; }
				amountCents = Math.round((cN - dN) * 100);
			}

			const description = descCol !== -1 ? (r[descCol] ?? "").trim() || null : null;
			const reference = refCol !== -1 ? (r[refCol] ?? "").trim() || null : null;
			const balRaw = balCol !== -1 ? (r[balCol] ?? "").replace(/[, ]/g, "") : "";
			const balN = balRaw ? parseFloat(balRaw) : NaN;
			const balanceCents = Number.isFinite(balN) ? Math.round(balN * 100) : null;

			out.push({ dateIso, description, amountCents, reference, balanceCents });
		}
		if (failures.length > 0) {
			const sample = failures.slice(0, 3).map((i) => i + 2).join(", "); // +2 = +1 for 0-indexed + 1 for header
			parseError.value = `Couldn't parse ${failures.length} row${failures.length === 1 ? "" : "s"} (e.g. CSV line${failures.length === 1 ? "" : "s"} ${sample}). Check your column mapping.`;
		}
		return out;
	});

	const canImport = computed(() => parsedRows.value.length > 0 && parseError.value === null);

	const confirmImport = async () => {
		if (!props.bankId || !canImport.value) return;
		importing.value = true;
		try {
			const mapping: ColumnMapping = {
				date: findCol("date"),
				description: findCol("description"),
				amount: findCol("amount"),
				debit: findCol("debit"),
				credit: findCol("credit"),
				reference: findCol("reference"),
				balance: findCol("balance"),
				dateFormat: dateFormat.value
			};
			const { inserted, skipped } = await store.importCsv({
				bankId: props.bankId,
				filename: filename.value,
				columnMapping: mapping,
				rows: parsedRows.value
			});
			toast.add({
				title: `Imported ${inserted} row${inserted === 1 ? "" : "s"}`,
				description: skipped > 0 ? `${skipped} skipped (already imported)` : undefined,
				color: "success",
				icon: "i-lucide-check"
			});
			openModel.value = false;
		} catch (err) {
			toast.add({
				title: "Import failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			importing.value = false;
		}
	};

	const cancel = () => {
		if (importing.value) return;
		openModel.value = false;
	};
</script>
```

- [ ] **Step 2: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/BankStatementImportModal.vue
git commit -m "feat(reconcile): import modal with column-mapping UI

Two-step modal: file picker, then column-mapping table with preview
+ date format picker. Per-bank last-mapping recall (pre-selects
roles from the most recent import for this bank). Pre-confirm
summary shows row count + parse errors. Heuristic header matching
('Description' / 'Amount' / etc.) as a fallback default."
```

---

## Task 15: `BankStatementVoucherPickerModal` component

**Files:**
- Create: `app/components/BankStatementVoucherPickerModal.vue`

- [ ] **Step 1: Implement the picker**

Create `app/components/BankStatementVoucherPickerModal.vue`:

```vue
<template>
	<UModal v-model:open="openModel" title="Pick a voucher to link" :ui="{ content: 'max-w-2xl' }">
		<template #body>
			<div class="space-y-3">
				<p v-if="row" class="text-sm text-(--ui-text-muted)">
					Linking statement row from <strong>{{ row.statement_date }}</strong>,
					amount <strong class="tabular-nums" :class="row.amount_cents > 0 ? 'text-(--ui-success)' : 'text-(--ui-error)'">
						{{ row.amount_cents > 0 ? "+" : "−" }}{{ formatLKR(Math.abs(row.amount_cents)) }}
					</strong>.
				</p>

				<UInput v-model="search" placeholder="Search by number, description, reference…" icon="i-lucide-search" class="w-full" />

				<div class="max-h-96 overflow-y-auto rounded-lg border border-(--ui-border) divide-y divide-(--ui-border)/60">
					<button
						v-for="v in candidates"
						:key="v.id"
						type="button"
						class="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-(--ui-bg-muted) cursor-pointer text-sm"
						@click="pick(v.id)"
					>
						<div class="min-w-0">
							<div class="font-mono text-xs">{{ v.number }}</div>
							<div class="text-(--ui-text-muted) truncate">{{ v.description || "—" }}</div>
						</div>
						<div class="text-(--ui-text-muted) text-xs whitespace-nowrap">{{ v.voucher_date }}</div>
						<div class="tabular-nums font-medium" :class="v.voucher_type === 'receipt' ? 'text-(--ui-success)' : 'text-(--ui-error)'">
							{{ v.voucher_type === "receipt" ? "+" : "−" }}{{ formatLKR(v.amount_cents) }}
						</div>
					</button>
					<div v-if="candidates.length === 0" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">
						No matching vouchers.
					</div>
				</div>
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end w-full">
				<UButton color="neutral" variant="ghost" @click="openModel = false">
					Cancel
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import { formatLKR } from "~/lib/money";
	import { useBankStatementsStore } from "~/stores/bank_statements";
	import { useVouchersStore } from "~/stores/vouchers";

	const props = defineProps<{
		bankId: number | null
		rowId: number | null
	}>();
	const openModel = defineModel<boolean>("open", { default: false });

	const emit = defineEmits<{
		picked: [rowId: number, voucherId: number]
	}>();

	const vouchers = useVouchersStore();
	const store = useBankStatementsStore();

	const search = ref("");

	const row = computed(() =>
		props.rowId === null ? null : store.rows.find((r) => r.id === props.rowId)
	);

	const candidates = computed(() => {
		if (props.bankId === null) return [];
		const q = search.value.trim().toLowerCase();
		let list = vouchers.vouchers.filter(
			(v) => v.business_bank_id === props.bankId && v.reconciled_at === null
		);
		// If the row's amount + sign are known, prefer those candidates first
		if (row.value) {
			const wantType = row.value.amount_cents > 0 ? "receipt" : "payment";
			const wantAmount = Math.abs(row.value.amount_cents);
			list = list.sort((a, b) => {
				const aMatch = a.voucher_type === wantType && a.amount_cents === wantAmount ? 0 : 1;
				const bMatch = b.voucher_type === wantType && b.amount_cents === wantAmount ? 0 : 1;
				if (aMatch !== bMatch) return aMatch - bMatch;
				return b.voucher_date.localeCompare(a.voucher_date);
			});
		}
		if (q) {
			list = list.filter((v) =>
				v.number.toLowerCase().includes(q)
				|| (v.description ?? "").toLowerCase().includes(q)
				|| (v.reference ?? "").toLowerCase().includes(q)
			);
		}
		return list.slice(0, 100);  // cap for performance
	});

	const pick = (voucherId: number) => {
		if (props.rowId === null) return;
		emit("picked", props.rowId, voucherId);
	};

	watch(openModel, (open) => {
		if (open) search.value = "";
	});
</script>
```

- [ ] **Step 2: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/BankStatementVoucherPickerModal.vue
git commit -m "feat(reconcile): voucher picker modal for manual link

Lists unreconciled vouchers for the bank with amount+type-match
sort priority (exact matches lead). Search by number / description
/ reference. Capped at 100 results for perf."
```

---

## Task 16: `BankStatementCreateVoucherModal` component

**Files:**
- Create: `app/components/BankStatementCreateVoucherModal.vue`

- [ ] **Step 1: Implement the create modal**

Create `app/components/BankStatementCreateVoucherModal.vue`:

```vue
<template>
	<UModal v-model:open="openModel" title="Create voucher from statement row" :ui="{ content: 'max-w-xl' }">
		<template #body>
			<form id="create-voucher-from-row-form" class="space-y-3" @submit.prevent="onSubmit">
				<p class="text-sm text-(--ui-text-muted)">
					A new voucher will be created and linked to this statement row.
				</p>
				<UFormField label="Voucher type" required>
					<URadioGroup
						v-model="voucherType"
						:items="[
							{ label: 'Receipt (money in)', value: 'receipt' },
							{ label: 'Payment (money out)', value: 'payment' }
						]"
						value-key="value"
						orientation="horizontal"
					/>
				</UFormField>
				<UFormField label="Date" required>
					<DateField v-model="voucherDate" />
				</UFormField>
				<UFormField label="Amount" required>
					<MoneyInput v-model="amountCents" />
				</UFormField>
				<UFormField label="Description">
					<UInput v-model="description" />
				</UFormField>
				<UFormField label="Reference">
					<UInput v-model="reference" />
				</UFormField>
				<UFormField label="Payment method" required>
					<USelect
						v-model="paymentMethod"
						:items="[
							{ label: 'Bank transfer', value: 'bank_transfer' },
							{ label: 'Cheque', value: 'cheque' },
							{ label: 'Card', value: 'card' },
							{ label: 'Other', value: 'other' }
						]"
						value-key="value"
						class="w-full"
					/>
				</UFormField>
			</form>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton color="neutral" variant="outline" :disabled="saving" @click="openModel = false">
					Cancel
				</UButton>
				<UButton
					type="submit"
					form="create-voucher-from-row-form"
					color="primary"
					:loading="saving"
					icon="i-lucide-plus"
				>
					Create + link
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import type { BankStatementRowRow } from "~/stores/bank_statements";
	import { useBankStatementsStore } from "~/stores/bank_statements";
	import { useVouchersStore } from "~/stores/vouchers";

	const props = defineProps<{
		bankId: number | null
		sourceRow: BankStatementRowRow | null
	}>();
	const openModel = defineModel<boolean>("open", { default: false });

	const emit = defineEmits<{
		created: []
	}>();

	const vouchers = useVouchersStore();
	const store = useBankStatementsStore();
	const toast = useToast();

	const voucherType = ref<"receipt" | "payment">("payment");
	const voucherDate = ref("");
	const amountCents = ref(0);
	const description = ref("");
	const reference = ref("");
	const paymentMethod = ref<"bank_transfer" | "cheque" | "card" | "other">("bank_transfer");
	const saving = ref(false);

	watch(() => props.sourceRow, (r) => {
		if (!r) return;
		voucherType.value = r.amount_cents > 0 ? "receipt" : "payment";
		voucherDate.value = r.statement_date;
		amountCents.value = Math.abs(r.amount_cents);
		description.value = r.description ?? "";
		reference.value = r.reference ?? "";
		paymentMethod.value = "bank_transfer";
	}, { immediate: true });

	const onSubmit = async () => {
		if (!props.sourceRow || !props.bankId) return;
		saving.value = true;
		try {
			// Build voucher payload (matches the voucher store's create input).
			const newId = await vouchers.create({
				voucher_type: voucherType.value,
				voucher_date: voucherDate.value,
				amount_cents: amountCents.value,
				description: description.value || null,
				reference: reference.value || null,
				payment_method: paymentMethod.value,
				business_bank_id: props.bankId,
				related_invoice_id: null,
				related_bill_id: null,
				related_payslip_id: null
			});
			await store.linkMatch(props.sourceRow.id, newId);
			toast.add({ title: "Voucher created and linked", color: "success", icon: "i-lucide-check" });
			emit("created");
		} catch (err) {
			toast.add({
				title: "Couldn't create voucher",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};
</script>
```

Note on `vouchers.create(...)`: the actual voucher store's `create` signature may differ. After this modal is in place, run lint — if the create call signature doesn't match, adjust to match the existing shape. Look at how `app/pages/vouchers/new.vue` calls create today.

- [ ] **Step 2: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean. If there are signature errors, fix them based on the actual `vouchers.create` shape, then re-lint.

- [ ] **Step 3: Commit**

```bash
git add app/components/BankStatementCreateVoucherModal.vue
git commit -m "feat(reconcile): create-voucher-from-row modal

Pre-fills voucher type / date / amount / description / reference
/ bank from the statement row. On save: creates the voucher AND
links it to the statement row in one user action (two sequential
auto-commits)."
```

---

## Task 17: Sidebar entry + CLAUDE.md updates

**Files:**
- Modify: `app/layouts/default.vue`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add sidebar entry**

Edit `app/layouts/default.vue`. Find the documents-group nav array (look for `to: "/vouchers"`). Add right after vouchers:

```ts
{ to: "/reconcile", label: "Reconcile", icon: "i-lucide-scale" },
```

- [ ] **Step 2: Update CLAUDE.md project layout**

Find the project layout section (search for `app/pages/`). Add an entry under the pages list:

```
│  │  ├─ reconcile.vue                ← bank reconciliation: import bank statement CSV, match rows to vouchers, create vouchers from unmatched. /reconcile route.
```

- [ ] **Step 3: Update CLAUDE.md schema overview**

Find the schema overview section. Add after vouchers:

```
- `bank_statement_imports` — one row per CSV statement upload.
  business_bank_id FK + filename + imported_at + column_mapping
  (JSON, so re-imports remember the column assignment).
- `bank_statement_rows` — one row per parsed statement line.
  Signed amount_cents, optional balance, dedupe_hash (sha256 of
  date|amount|description|reference) UNIQUE per bank so re-imports
  silently skip duplicates. matched_voucher_id nullable FK to
  vouchers (SET NULL on voucher delete so statement history
  survives).
- `vouchers.business_bank_id` — explicit FK to business_banks for
  per-bank reconciliation scoping. NULL for cash vouchers.
  Backfilled to default bank for existing non-cash vouchers in
  migration 0033.
- `vouchers.reconciled_at` — ISO timestamp set when a voucher is
  matched to a statement row; cleared on unlink.
```

- [ ] **Step 4: Update CLAUDE.md migrations list**

Add two entries at the bottom of the migrations list:

```
0033_voucher_bank_id.sql                ← `vouchers.business_bank_id` FK to business_banks (ON DELETE SET NULL) + index. Backfilled non-cash existing vouchers to the default bank.
0034_bank_reconciliation.sql            ← `bank_statement_imports` + `bank_statement_rows` tables. `vouchers.reconciled_at` ISO timestamp column. Bank FKs are RESTRICT (a bank with reconciliation history can't be deleted without clearing imports first). `matched_voucher_id` is SET NULL so deleting a voucher quietly unmatches its statement row.
```

- [ ] **Step 5: Update CLAUDE.md sidebar grouping**

Find the sidebar-grouping section. Add `Reconcile` after `Vouchers`:

```
Reconcile             ← /reconcile — bank reconciliation; import CSV statement, match rows to vouchers, create vouchers from unmatched rows
```

- [ ] **Step 6: Update CLAUDE.md Done section**

Add an entry to the Done bullets:

```
- ✅ **Bank reconciliation** — shipped. Standard-scope reconciliation:
  CSV import with column-mapping UI (per-bank last-mapping recall),
  auto-suggest matches (amount + date ±3d + reference token overlap,
  scored), one-click voucher creation from unmatched rows. Persisted
  statement rows via two new tables (`bank_statement_imports` +
  `bank_statement_rows`), dedupe via sha256 hash so re-imports skip
  duplicates. `vouchers.business_bank_id` FK added (migration 0033)
  so matching is cleanly scoped per bank.
```

- [ ] **Step 7: Update CLAUDE.md roadmap status**

Find the Status (YYYY-MM-DD) line at the bottom of the Roadmap section. Update with current state:

```
**Status (2026-05-28):** P&L + VAT + aged receivables + aged payables
+ cash flow + report PDF export shipped — Tier 1 reports module is
complete. **Sales by client + Expenses by vendor + Payroll register**
also shipped. Credit notes (Tier 2) shipped. Customer statements
(Tier 2) shipped. Recurring invoices + Recurring bills (Tier 2)
shipped. **Bank reconciliation (Tier 2) shipped** — CSV import,
suggestion-based matching, voucher creation from unmatched rows.
Next biggest gap is **statutory auto-compute on payslips** (EPF 8%
/ ETF 3% / PAYE) — would dramatically lift the SL payroll
credibility. After that, the **Cmd/Ctrl+K command palette** is the
next "feels native" win.
```

- [ ] **Step 8: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add app/layouts/default.vue CLAUDE.md
git commit -m "feat(reconcile): sidebar entry + CLAUDE.md updates"
```

---

## Task 18: Help topic + HelpButton

**Files:**
- Create: `app/help/topics/reconciliation.vue`
- Modify: `app/help/index.ts`

- [ ] **Step 1: Write the topic**

Create `app/help/topics/reconciliation.vue`. Model after `app/help/topics/customer-statements.vue`:

```vue
<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is bank reconciliation?" icon="i-lucide-info">
			<p>
				<strong>Bank reconciliation</strong> is the practice of comparing your bank statement against your accounting records and matching every transaction. The goal: every line on the bank statement has a corresponding voucher in your books, and every voucher in your books shows up on the bank statement.
			</p>
			<p>
				Two reasons it matters: (1) it catches transactions you forgot to enter, and (2) it catches transactions the bank charged you that you didn't authorise (fraud, double-debits, wrong fees). If the IRD audits you, they may ask to see that your books reconcile to the bank statements.
			</p>
		</HelpSection>

		<HelpSection title="How to use it in Sakoram" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/reconcile" class="text-(--ui-primary) hover:underline">Reconcile</NuxtLink> in the sidebar.
				</li>
				<li>
					Pick the bank account whose statement you're importing.
				</li>
				<li>
					Click <strong>Import statement</strong>. Pick the CSV file your bank exported.
				</li>
				<li>
					Map each CSV column to its meaning (Date / Description / Amount / Debit / Credit / Reference). Sakoram remembers your mapping per bank for next time.
				</li>
				<li>
					Pick the date format used in your CSV (most SL banks use <span class="font-mono text-xs">DD/MM/YYYY</span> or <span class="font-mono text-xs">DD-MMM-YYYY</span>).
				</li>
				<li>
					Click <strong>Import</strong>. Sakoram auto-suggests matches: any statement row whose amount + type matches an existing voucher within ±3 days gets a Suggested badge.
				</li>
				<li>
					For suggested rows: click <strong>Accept</strong> per row, or <strong>Accept all suggestions</strong> at the top.
				</li>
				<li>
					For unmatched rows: <strong>Find</strong> to manually pick a voucher, or <strong>Create</strong> to make a new voucher from the statement row (the form is pre-filled — just confirm).
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Wrong column mapping = wrong amounts">
				If you map the Description column as Amount by mistake, the import will silently fail to parse every row. Always check the preview row counts before confirming — it should show your statement's actual row count.
			</HelpCallout>
			<HelpCallout variant="warning" title="Cash vouchers don't reconcile">
				Vouchers with payment method = Cash don't have a bank account assigned (they're cash transactions). They're excluded from matching entirely. If you see a cash voucher in your books that should be on the bank statement, change its payment method to Bank transfer.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't delete the bank account with reconciliation history">
				Once you've imported statements for a bank account, you can't delete the bank — Sakoram will refuse. You'd need to delete the imports first. This is on purpose: deleting the bank would orphan all the reconciliation history.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Sri Lankan tax angle" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="Reconciled books = audit-ready books">
				The IRD doesn't audit casually, but when they do, the question is always the same: <em>can you prove the numbers in your VAT return came from real transactions?</em> A reconciled set of books — every voucher tied to a statement row — answers that in seconds. An unreconciled set of books takes weeks to defend.
			</HelpCallout>
		</HelpSection>
	</div>
</template>
```

- [ ] **Step 2: Register the topic**

Edit `app/help/index.ts`. Add a new entry under the `documents` category (or create a new category if you prefer — `documents` works since reconciliation involves vouchers):

```ts
{
  slug: "reconciliation",
  title: "Bank reconciliation",
  summary: "Import a CSV bank statement, match its rows against existing vouchers, create vouchers from unmatched rows. Audit-ready books in minutes.",
  category: "documents",
  icon: "i-lucide-scale",
  relatedSlugs: ["vouchers", "bills", "invoices"],
  component: () => import("./topics/reconciliation.vue")
},
```

Also add `"reconciliation"` to `vouchers`'s `relatedSlugs`.

- [ ] **Step 3: Run lint**

```bash
bun run lint 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/help/topics/reconciliation.vue app/help/index.ts
git commit -m "docs(help): bank reconciliation topic"
```

---

## Task 19: Final smoke test, version bump, lint

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Bump version**

Edit `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`. Bump from current (0.97.x) to **0.98.0** (minor — new user-facing feature).

- [ ] **Step 2: Run lint + cargo check**

```bash
bun run lint 2>&1 | tail -3
cd src-tauri && cargo check 2>&1 | tail -3 && cd ..
```
Both expected clean.

- [ ] **Step 3: Run tests**

```bash
bun run test 2>&1 | tail -10
```
Expected: all green, including the three new test files from Tasks 8, 9, 10.

- [ ] **Step 4: Commit version bump**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore: bump to 0.98.0 for bank reconciliation feature"
```

- [ ] **Step 5: Push**

```bash
git push
```

---

## Task 20: User verification + PR

- [ ] **Step 1: Pause for user smoke-test**

Don't open the PR yet. Ask the user to verify:

1. `bun run tauri:dev` — migrations 0033 + 0034 should apply on tenant DB open.
2. Open any existing voucher — bank picker visible (assuming non-cash payment method); pre-populated with default bank (from backfill).
3. Open `/reconcile` — empty state visible ("No statement rows yet. Click Import statement…").
4. Click Import statement → pick a sample SL bank CSV. Map columns. Confirm import.
5. Verify: statement rows appear; auto-suggestions highlighted yellow; matched/unmatched/suggested counts correct.
6. Click Accept on a suggestion — voucher and row both flip to Matched.
7. Click Create on an unmatched row — voucher form modal opens with pre-fill; save it — both flip to Matched.
8. Manually click Other or Find on a suggestion — voucher picker modal opens; pick a voucher — flips to Matched.
9. Unlink a matched row — both ends clear correctly.
10. Try deleting the bank account from Settings → Businesses → bank list. Should be blocked with a friendly toast.

If any of those break, fix here before opening the PR.

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: bank reconciliation — Tier 2 productivity feature" --body "$(cat <<'EOF'
## Summary

Closes the biggest remaining Tier 2 gap. Standard-scope reconciliation:

- CSV import with column-mapping UI; per-bank last-mapping recall
- Auto-suggest matches (amount + date ±3d + reference token overlap, scored)
- One-click voucher creation from unmatched rows
- Persisted statement rows via two new tables; sha256 dedupe so re-imports skip duplicates
- \`vouchers.business_bank_id\` FK added so matching is cleanly scoped per bank

## Schema (two migrations)

- **0033**: \`vouchers.business_bank_id\` FK to business_banks (ON DELETE SET NULL) + backfill of non-cash existing vouchers to the default bank.
- **0034**: \`bank_statement_imports\` + \`bank_statement_rows\` tables, \`vouchers.reconciled_at\` column.

SCHEMA_VERSION 32 → 34.

## Files

New:
- \`src-tauri/migrations/0033_voucher_bank_id.sql\`
- \`src-tauri/migrations/0034_bank_reconciliation.sql\`
- \`app/stores/bank_statements.ts\`
- \`app/composables/useCsvParser.ts\` + tests
- \`app/lib/date-parse.ts\` + tests
- \`app/lib/reconcile-match.ts\` + tests
- \`app/pages/reconcile.vue\`
- \`app/components/ReconcileStatementRowList.vue\`
- \`app/components/BankStatementImportModal.vue\`
- \`app/components/BankStatementVoucherPickerModal.vue\`
- \`app/components/BankStatementCreateVoucherModal.vue\`
- \`app/help/topics/reconciliation.vue\`

Modified:
- \`src-tauri/src/tenants.rs\` (migrations registry)
- \`src-tauri/src/data_io.rs\` (SCHEMA_VERSION + TABLES)
- \`app/stores/vouchers.ts\` (business_bank_id + reconciled_at columns)
- \`app/pages/vouchers/[id].vue\` (bank picker)
- \`app/pages/vouchers/new.vue\` (bank picker)
- \`app/lib/demo-seed.ts\` (assigns bank_id to seeded vouchers)
- \`app/layouts/default.vue\` (sidebar entry)
- \`app/help/index.ts\` (register topic)
- \`CLAUDE.md\` (project layout + schema + migrations + sidebar + Done + roadmap)

Bumps 0.97.1 → 0.98.0.

## Test plan

- [ ] Migrations apply cleanly on tenant DB open
- [ ] Existing vouchers backfilled with bank id (non-cash)
- [ ] Voucher form's bank picker hides when payment method = cash
- [ ] CSV import: file picker → column mapping UI → preview row count → confirm
- [ ] Re-import same CSV: dedupes silently (toast shows N new · M skipped)
- [ ] Auto-suggestions highlight rows that match within ±3 days
- [ ] Accept / Accept all / Unlink all work correctly
- [ ] Find voucher modal: lists unreconciled vouchers, search works
- [ ] Create voucher modal: pre-fill correct, save creates + links in one shot
- [ ] Delete bank with reconciliation history: blocked with friendly toast
- [ ] Help button on /reconcile opens the topic
- [ ] Lint + cargo check + Vitest all clean
EOF
)"
```

- [ ] **Step 3: Wait for user merge approval**

Per the workflow rules, do not merge without explicit confirmation. After the PR is open, ask the user to review and confirm before merging.

- [ ] **Step 4: Merge after approval**

```bash
gh pr merge <pr-number> --squash --delete-branch
git checkout main
git pull --ff-only
```
