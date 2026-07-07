# Letters — design

**Date:** 2026-07-07
**Status:** Approved (brainstorming)

## Goal

Add a **Letters** section so the user can type free-form letters (service
letters, internship confirmations, anything) on the business letterhead,
render them to PDF through the existing Typst engine, and keep track of them
all in one place — searchable, categorised, and duplicable.

## Motivation

The app already has a high-quality offline PDF engine and a stored letterhead
logo (`company_settings.pdf_header_logo_path`). Today there is nowhere to
compose ad-hoc correspondence. This feature reuses the PDF pipeline for a new,
non-financial document type: a **letter**.

## Scope

Free-form, rich-text letters. **No templates, no merge fields** (explicitly
rejected during brainstorming). Letters are ordinary editable documents — no
finalize-lock, no snapshots, no money math.

### Out of scope (v1 / YAGNI)

- Letter templates or merge-field placeholders
- Linking a recipient to Employees / Clients (recipient is free text)
- Finalize / lock lifecycle (letters stay editable)
- PDF owner-password protection (letters render unencrypted, like reports)
- Attachments on letters
- Images / tables inside the rich-text body (bold / italic / underline /
  headings / bullet + numbered lists only)
- A company-settings default for the pre-printed toggle (per-letter only in v1)

## Data model

New table `letters` (migration `0037_letters.sql`). No lines table, no FK, no
`*_snapshot` column — a letter is fully self-contained free text.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `number` | TEXT | Auto-suggested `LET-YYYY-NNNN`; user-editable free text; may be empty. Named `number` (not `reference`) to match every other document table + the `TABLE_FOR_TYPE` convention in `numbering.ts`. Shown in the UI as "Reference". |
| `letter_date` | TEXT | ISO `YYYY-MM-DD` |
| `category` | TEXT | Free-text tag (e.g. "Service letter"); empty allowed. Filter dropdown autocompletes from distinct existing values |
| `recipient_name` | TEXT | Free text |
| `recipient_address` | TEXT | Free text, multi-line |
| `subject` | TEXT | Letter subject line |
| `body_json` | TEXT | Rich-text document as TipTap/ProseMirror JSON (default `""` → empty doc) |
| `signatory_name` | TEXT | Printed above the signature line; defaults blank |
| `signatory_title` | TEXT | Designation under the signatory name; defaults blank |
| `pre_printed` | INTEGER | 0/1 — 1 reserves blank top space for pre-printed stationery; 0 (default) renders the app letterhead |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

`SCHEMA_VERSION` bumps to **37**; `letters` is added to the `TABLES` list in
`data_io.rs` so export/import covers it. Register `0037_letters.sql` in the
`MIGRATIONS` array in `tenants.rs`.

### Numbering

Reuse `app/lib/numbering.ts`: add `"letter"` to the `DocumentType` union,
`PREFIX.letter = "LET"`, and `TABLE_FOR_TYPE.letter = "letters"` (whose `number`
column the helpers query). The New-letter modal previews the next reference via
`peekNextSequence("letter", date)` (reads only `document_counters`, never the
table), but because the field is plain editable text the user may keep, change,
or clear it. Letters do **not** need gapless legal numbering, so we never call
`allocateDocumentNumber`. On create:

- If the kept value exactly equals the suggested `LET-YYYY-NNNN` string, bump the
  counter via `allocateSpecificDocumentNumber("letter", date, seq)` so the next
  suggestion advances (its table-uniqueness check works because the column is
  `number`).
- If the user cleared or typed a custom reference, store it verbatim and leave
  the counter untouched.

## Rich text

### Editor

`app/components/RichTextEditor.vue` — a thin wrapper over **TipTap v2**
(`@tiptap/vue-3` + `@tiptap/starter-kit` + `@tiptap/extension-underline`). TipTap
is MIT, Vue-3 native, and bundles fully offline (ProseMirror under the hood) — no
runtime network, consistent with the app's offline requirement. Toolbar:
**bold, italic, underline, heading, bullet list, numbered list**. `v-model` is the
TipTap JSON document (serialised to a string for storage).

### Body → PDF conversion

`app/lib/letter-body.ts` (pure, unit-tested — follows the "pure logic in
`app/lib/`" convention). `letterBodyToBlocks(docJson: string): LetterBlock[]`
walks the TipTap/ProseMirror JSON and normalises it into a small, stable block
tree:

```ts
type Inline = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
type LetterBlock =
  | { kind: "paragraph"; runs: Inline[] }
  | { kind: "heading"; level: number; runs: Inline[] }
  | { kind: "bullet_list" | "ordered_list"; items: LetterBlock[][] };
```

The block tree ships inside `data.json`; `letter.typ` renders it recursively.
Text stays as JSON string values throughout, so there is **no Typst-markup
injection risk** (we never build a Typst source string from user text). Malformed
or empty JSON yields an empty block list.

## PDF

New template `src-tauri/templates/letter.typ` + new Rust command
`export_letter_pdf` (registered in `lib.rs`; reuses `render_pdf`; no extra
companion files). `app/lib/letter-pdf.ts` builds the payload.

Payload includes: `number`, `letter_date`, `recipient_name`,
`recipient_address`, `subject`, `blocks` (the block tree),
`signatory_name`, `signatory_title`, `pre_printed`, `theme_color`,
`font_family`, `business_name`, `website`, `phone`, and
`logo_path = pdf_header_logo_path` (Rust copies it to `logo_file`).

### Letterhead modes (per-letter `pre_printed`)

`letter.typ` branches on `data.pre_printed`:

- **`pre_printed = false` (default) — app renders the letterhead.** Uses the same
  header treatment as invoices/quotes: the wide PDF header logo at the top
  (falling back to the square logo, then a business-name wordmark) + the theme
  accent rule, and the standard footer (business name · website · phone). Normal
  top margin.
- **`pre_printed = true` — reserve blank space.** Top margin expands (~45mm, as in
  the existing `doc-letterhead.typ`), no header block and no footer rendered, so
  the letter body prints cleanly onto physical pre-printed letterhead paper.

Body layout (both modes): date + reference row → recipient block → subject
(bold) → rendered body blocks → signature block (blank space, signature line,
`signatory_name`, `signatory_title`).

Letters render **unencrypted** (no per-type protection toggle, matching reports/
statements). PDF preview + Save-as/Print reuse the `usePdfPreview` composable and
`PdfPreviewModal` exactly like every other detail page.

## Screens

Follows the existing list/detail conventions (see `payslips/index.vue` for the
reference list shape, `credit-notes` for a recent full document type).

- **Sidebar:** new top-level **Letters** entry (icon `i-lucide-mail`), placed
  after Vouchers in the documents area under its own sense of grouping.
- **`/letters` list** — `ResizableDataTable`, client-mode (`store.load()` +
  `store.filtered`; letter volume is low). Columns: Reference · Date · Category ·
  Recipient · Subject. Filter strip: search + category chips + date presets +
  Reset. Row actions (context menu + ⋯): **View · PDF & Print · Duplicate ·
  Delete**. Filtered-count `StatChip` (plain count — no money).
- **New letter modal** (`NewLetterModal.vue`) — recipient name + subject + date +
  category + reference (pre-filled from `peekNextSequence`, editable). Create
  inserts a blank letter and navigates to `/letters/[id]`. Dashboard/other
  `?new=1` entry optional (not required for v1).
- **`/letters/[id]` detail** — header fields (reference, date, category,
  recipient name + address, subject, signatory name + title, pre-printed toggle) +
  `RichTextEditor` for the body + sticky save bar (dirty-tracking, Discard / Save)
  + header buttons: **PDF & Print · Duplicate · Delete**. Always editable.

### Duplicate

`store.duplicate(id)` clones the row: fresh suggested reference, subject prefixed
"Copy of …", `letter_date` = today, same body/recipient/category/signatory, then
navigates to the new detail page. Lets the user tweak a few things and re-issue.

## Store

`app/stores/letters.ts` (composition store, mirrors `credit_notes.ts` shape):
`letters` state, `load()` / `ensureLoaded()`, `filtered` computed (search +
category + date range refs the page binds), `categories` computed (distinct
non-empty values for the filter dropdown), `create(header)`, `update(id, patch)`,
`duplicate(id)`, `remove(id)`. All writes are single auto-commit statements
(connection-pool caveat). Cross-doc filter refs live on the store so future
"View letters for X" shortcuts can set them before navigating.

## Testing

- `app/lib/letter-body.test.ts` — TipTap JSON → block tree: paragraphs with
  bold/italic/underline runs, headings, nested bullet + ordered lists, empty/
  malformed input → empty list.
- `app/lib/numbering` already unit-tested; adding the `letter` prefix is covered
  by the existing shape (no new numbering test needed, but a smoke assertion that
  `formatDocumentNumber("letter", 2026, 1) === "LET-2026-0001"` is cheap to add).

## Verification gates

`bun run lint` (clean) · `bun run test` (green, incl. new letter-body tests) ·
`bun run generate` (routes incl. `/letters`) · `cargo check` (letter.typ command
compiles).

## Version

Minor bump (new feature): `0.130.0 → 0.131.0` across `package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`). CLAUDE.md:
add a Letters entry to the project layout + migrations list + "What's done".

## File map

**Create**
- `src-tauri/migrations/0037_letters.sql`
- `src-tauri/templates/letter.typ`
- `app/lib/letter-body.ts` + `app/lib/letter-body.test.ts`
- `app/lib/letter-pdf.ts`
- `app/stores/letters.ts`
- `app/components/RichTextEditor.vue`
- `app/components/NewLetterModal.vue`
- `app/pages/letters/index.vue`
- `app/pages/letters/[id].vue`

**Modify**
- `app/lib/numbering.ts` (add `letter` type)
- `src-tauri/src/pdf.rs` (add `export_letter_pdf`)
- `src-tauri/src/lib.rs` (register the command)
- `src-tauri/src/tenants.rs` (register the migration)
- `src-tauri/src/data_io.rs` (`SCHEMA_VERSION` 37 + `letters` in `TABLES`)
- `app/layouts/default.vue` (sidebar Letters entry)
- `package.json`, `tauri.conf.json`, `Cargo.toml` (version bump)
- `CLAUDE.md` (docs)
