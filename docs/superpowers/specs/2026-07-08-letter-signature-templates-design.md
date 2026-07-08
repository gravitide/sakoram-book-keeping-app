# Letter signature templates — design

**Date:** 2026-07-08
**Status:** Approved (brainstorming)

## Goal

Let the user save **multiple named signature templates** (rich text) and reuse
them when composing letters — pick one to insert into a letter, and optionally
mark one **default** that pre-fills every new letter's signature.

## Apply model (decided)

**Insert a copy, with a default.** Applying a saved signature copies its content
into that letter's own `signature_json`, which stays editable for that letter.
Editing a template later does NOT change past letters (letters stay
self-contained — consistent with how issued documents freeze their content). One
signature can be marked default and is pre-filled into new letters.

Because we insert a *copy*, the PDF pipeline is unchanged: `letter.typ` already
renders `signature_json`; there's no template lookup at print time.

## Data model

New table `letter_signatures` (migration `0045_letter_signatures.sql`):

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT NOT NULL | Label shown in the picker / manager (e.g. "Director sign-off") |
| `body_json` | TEXT NOT NULL DEFAULT '' | TipTap rich text — same shape as `letters.signature_json` |
| `is_default` | INTEGER NOT NULL DEFAULT 0 | 0/1. At most one row is 1 (enforced by the store, not a DB constraint) |
| `created_at` / `updated_at` | TEXT | ISO timestamps |

`SCHEMA_VERSION` bumps to **45**; `letter_signatures` added to the `TABLES`
list in `data_io.rs`; migration registered in `tenants.rs`.

## Store

`app/stores/letter_signatures.ts` (mirrors `letter_categories` + a default flag):
- state `signatures`, `load()` / `ensureLoaded()`, `get(id)`.
- `create({ name, body_json, isDefault })`, `update(id, { name, body_json })`,
  `remove(id)`.
- `setDefault(id)` — atomic single `UPDATE letter_signatures SET is_default =
  CASE WHEN id = ? THEN 1 ELSE 0 END` (same one-statement pattern as
  `business_banks.setDefault`), so exactly one default at a time.
- `defaultSignature` computed (the `is_default = 1` row, or null).

## Managing them — `/settings/letters`

New **Signatures** section (`id="signatures"`, Business group), alongside
Categories + margins:
- A list of saved signatures: **name** · a plain-text preview (first line of the
  body, derived via `letterBodyToBlocks`) · a **Default** badge on the default.
- **New signature** button + per-row **Edit** open a modal
  (`LetterSignatureFormModal.vue`): a name input + the shared `RichTextEditor` +
  a "Set as default" toggle. Save persists via the store.
- Per-row actions: **Edit** · **Set default** · **Delete**.
- Sidebar third-level anchor `#signatures` added to the `/settings/letters` nav
  entry in `default.vue`.

## Using one on a letter — `/letters/[id]`

In the letter's **Signature** section:
- A **"Use a saved signature ▾"** dropdown (`UDropdownMenu`) listing the saved
  signatures. Picking one **replaces** `form.signature_json` with a copy of that
  template's `body_json`. (Replace, not append — you're choosing "the
  signature".) The dropdown is hidden when there are no saved signatures.
- The `RichTextEditor`'s `watch(model)` already re-renders when
  `signature_json` is replaced, so the editor updates live.

## New-letter default

`useLettersStore.create(...)` seeds `signature_json` from the default signature:
one extra `SELECT body_json FROM letter_signatures WHERE is_default = 1 LIMIT 1`
at create time. If no default is set, the signature starts empty (today's
behaviour). Duplicate-to-clone keeps the source letter's signature (unchanged).

## Testing

The store/UI aren't unit-testable (Tauri/Pinia). A tiny pure helper
`signaturePreview(bodyJson: string): string` (first non-empty line of text from
`letterBodyToBlocks`) gets a `*.test.ts` in `app/lib/` for the list preview.
Editor behaviour (replace-on-apply) verified in the browser harness.

## Out of scope (v1)

- Merge fields / placeholders in signatures.
- Images in signatures (the editor is text-only).
- Per-letter *linking* to a live template (we insert a copy).
- A separate signatures management page (managed inline on `/settings/letters`).

## File map

**Create**
- `src-tauri/migrations/0045_letter_signatures.sql`
- `app/stores/letter_signatures.ts`
- `app/components/LetterSignatureFormModal.vue`
- `app/lib/signature-preview.ts` + `app/lib/signature-preview.test.ts`

**Modify**
- `src-tauri/src/tenants.rs` (register migration)
- `src-tauri/src/data_io.rs` (`SCHEMA_VERSION` 45 + `letter_signatures` in `TABLES`)
- `app/stores/letters.ts` (`create` seeds `signature_json` from the default)
- `app/pages/settings/letters.vue` (Signatures section)
- `app/pages/letters/[id].vue` ("Use a saved signature" dropdown)
- `app/layouts/default.vue` (`#signatures` section anchor)
- `CLAUDE.md` (migration + settings notes)
