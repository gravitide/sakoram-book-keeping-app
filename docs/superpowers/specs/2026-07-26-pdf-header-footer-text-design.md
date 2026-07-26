# Customizable PDF header & footer text

**Date:** 2026-07-26
**Status:** Approved, ready for implementation

Third and final sub-project of the PDF-header revamp. Predecessors:
`2026-07-26-pdf-settings-revamp-design.md` (PR #317),
`2026-07-26-pdf-logo-cropper-design.md` (PR #318), and the header unification
(PR #319) that this spec depends on.

## Problem

The page chrome is hardcoded. Every PDF prints the same footer strip —
`business_name | website | phone | address` — and the header carries only a
logo or a wordmark. A business that wants its address, registration number, or
a tax line beside the logo (the standard letterhead arrangement) has no way to
ask for it, and a business that wants a different footer has no way to change
it.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Opt-in mechanism | **Separate `_custom` flag + `_text` column** | Toggling custom off keeps the text for later rather than destroying it. |
| Stale-data risk | **Token substitution** — `{business_name}`, `{phone}`, … | Otherwise contact details live in two places and the PDF silently goes stale when Business details change. |
| Editor | **Existing `RichTextEditor` + a new `minimal` toolbar mode** | Bold/italic/underline/align only. Headings and lists in a footer strip produce genuinely bad output, so the fix is to not offer them. |
| Header placement | **Per template**, opposite the logo; skipped on `letterhead` | Letterhead's premise is that the pre-printed stationery already carries these details. |
| Scope of header text | Templates that render through **`doc-header`** — the five `doc-*` plus `payslip` | `voucher` / `report` / `statement` have bespoke headers; bringing them in is a separate job with little payoff. |
| Scope of footer text | **Everything** | All templates already route through one `footer-content(data)`. |
| Overflow | **Footer capped at 3 blocks**, enforced in the payload builder | Typst's page footer is a fixed region; unbounded content fights the page layout on every page of every document. |

## Changes

### 1. Schema — `src-tauri/migrations/0052_pdf_header_footer_text.sql`

```sql
ALTER TABLE company_settings ADD COLUMN pdf_header_custom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_header_text TEXT;
ALTER TABLE company_settings ADD COLUMN pdf_footer_custom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_footer_text TEXT;
```

Both flags default 0, so **existing tenants render byte-identically** until
they opt in. `_text` holds TipTap JSON, same as `letters.body_json`.

Register in `MIGRATIONS` (`tenants.rs`); `SCHEMA_VERSION` 51 → 52
(`data_io.rs`). No `TABLES` change — `company_settings` is already exported and
columns are discovered via `PRAGMA table_info`.

### 2. Tokens — `app/lib/pdf-tokens.ts` (new, pure, unit-tested)

```ts
export interface PdfToken { token: string, label: string }

export const PDF_TOKENS: PdfToken[];           // {business_name} … {tax_id}
export function tokenValuesFromSettings(settings: CompanySettingsRow | null): Record<string, string>;
export function resolveTokens(blocks: LetterBlock[], values: Record<string, string>): LetterBlock[];
```

Tokens: `{business_name}`, `{address}`, `{city}`, `{phone}`, `{email}`,
`{website}`, `{tax_id}`.

`resolveTokens` walks the block tree recursively — paragraphs, headings,
`bullet_list` / `ordered_list` items, and `table` cells all carry `runs` of
`LetterInline` — and substitutes inside `run.text` only. Marks (`bold`,
`italic`, `color`, `fontSizePt`) are preserved, so **a token inside a bold run
stays bold**.

Two deliberate behaviours:

- **Unknown tokens render literally.** `{phne}` prints as `{phne}` rather than
  vanishing, so a typo is visible instead of silently eating text.
- **Empty values substitute to an empty string.** If someone writes
  `{phone} | {email}` and has no email, they get a trailing separator. That is
  their text and their separators; collapsing them would be guesswork.

### 3. Typst — `common.typ`

**`render-blocks` gains a `spacing` parameter:**

```typst
#let render-blocks(blocks, default-align: none, spacing: 8pt) = { … }
```

Default `8pt` means every existing caller renders identically. The footer
passes `spacing: 2pt`; its current body-copy spacing would blow out an 8pt
strip.

**`footer-content(data)` renders custom blocks when present:**

```typst
#let footer-content(data) = {
  let blocks = data.at("footer_blocks", default: ())
  if blocks.len() > 0 {
    render-blocks(blocks, default-align: "center", spacing: 2pt)
  } else {
    [ … current business_name | website | phone | address line … ]
  }
}
```

> **Definition-order landmine.** `footer-content` currently sits at line ~30 of
> `common.typ`; `render-blocks` is at ~244. Typst resolves module names in
> definition order, so as written `footer-content` **cannot** call
> `render-blocks` — it would fail with `unknown variable: render-blocks`,
> exactly the bug fixed in PR #319. `footer-content` must therefore **move
> below `render-blocks`** (and stay above `template-config` at ~363, which
> calls it). This is a relocation only; no content change.

**`doc-header(data)` gains a header-text slot.** Each branch renders
`data.header_blocks` when non-empty, and is **otherwise untouched**:

| Template | With header text | Without |
|---|---|---|
| classic | `grid(columns: (1fr, auto))` — text left (top-aligned), logo right | current `align(right)[logo]`, unchanged |
| compact | same, at 9mm logo height | unchanged |
| minimal | text replaces the business-name wordmark in the left cell | unchanged |
| modern | text under the title inside the band, in white | unchanged |
| letterhead | **skipped** — no logo, no text | unchanged |

The `if blocks.len() > 0 { … } else { <existing markup verbatim> }` shape is
what guarantees no visual change for tenants who never opt in.

### 4. Payload builders

Every builder that already emits `logo_path` also emits:

```ts
header_blocks: buildHeaderBlocks(settings),   // [] unless pdf_header_custom
footer_blocks: buildFooterBlocks(settings),   // [] unless pdf_footer_custom, max 3
```

Both helpers live in `app/lib/pdf-chrome.ts` (new) so ten call sites share one
implementation:

```ts
export function buildHeaderBlocks(settings: CompanySettingsRow | null): LetterBlock[];
export function buildFooterBlocks(settings: CompanySettingsRow | null): LetterBlock[];
```

Each: return `[]` when the flag is 0 or the text is empty; otherwise
`resolveTokens(richTextToBlocks(text), tokenValuesFromSettings(settings))`.
`buildFooterBlocks` additionally slices to the first 3 blocks.

Call sites: `quote-pdf`, `invoice-pdf`, `bill-pdf`, `payslip-pdf`,
`voucher-pdf`, `letter-pdf`, `report-pdf`, `statement-pdf`, and both sample
payloads in `sample-pdf.ts`. (`voucher` / `report` / `statement` receive
`footer_blocks` only — their headers are bespoke, per the scope decision.)

### 5. Editor — `RichTextEditor` gains `minimal`

New prop `minimal?: boolean` (default false). When true the toolbar shows
bold / italic / underline / align only — no headings, no lists, no tables.
Existing callers are unaffected.

It also gains an exposed method so the Insert-field menu can reach the editor:

```ts
defineExpose({ insertText: (text: string) => void });
// implementation: editor.value?.chain().focus().insertContent(text).run();
```

The parent holds a `ref` to the component and calls `insertText("{phone}")`.
Mutating the `v-model` string instead would not work — the editor parses that
prop only on mount, so a rewritten JSON document would not be picked up.

Because both columns are new, there is no legacy content that could contain a
heading, so the footer cannot receive oversized text through the back door.

### 6. UI — `app/pages/settings/pdf.vue`

New `#header-footer` section below Header logo, with two blocks:

- **Header text** — toggle, `RichTextEditor` (minimal, `min-height` 120),
  Insert-field menu, and a note that it is skipped on the Letterhead template.
- **Footer text** — toggle, same editor, Insert-field menu, and a note that
  the footer prints on every page and is limited to 3 blocks.

The **Insert field** menu is a `UDropdownMenu` listing `PDF_TOKENS`; picking
one inserts its `token` at the cursor via the editor's TipTap instance.

Add `{ hash: "#header-footer", label: "Header & footer", icon: "i-lucide-panel-top" }`
to the `/settings/pdf` `sections` array in `app/layouts/default.vue`, between
Header logo and Templates, matching DOM order.

The live A4 preview grows a header-text column beside the logo when custom
header text is on, so the arrangement is visible before saving. It renders
plain text (tokens resolved, marks ignored) — a faithful rich-text mock is not
worth the complexity; the **Preview on PDF** button is the source of truth.

## Testing

**Unit** — `app/lib/pdf-tokens.test.ts`:

- substitutes in a paragraph run
- a token inside a bold run keeps `bold: true`
- substitutes inside heading runs, list items, and table cells
- unknown token renders literally
- empty setting value substitutes to an empty string
- multiple tokens in one run all resolve
- `tokenValuesFromSettings(null)` yields empty strings, not `"null"`

`app/lib/pdf-chrome.test.ts`: returns `[]` when the flag is 0; returns `[]` for
empty text with the flag on; caps the footer at 3 blocks.

**Typst, via the sidecar harness** — the load-bearing checks:

1. **No-opt-in is byte-identical.** Render all five doc templates × with/without
   logo before and after, flags off; sha256 must match, exactly as PR #319 did.
2. Header text renders on classic / compact / minimal / modern, and is **absent**
   on letterhead.
3. Custom footer replaces the default line; the default returns when the flag
   is off.
4. A 3-block footer does not overflow the page region.
5. `voucher` / `report` / `statement` / `letter` still compile (selective
   imports intact).

**Browser** — Insert-field inserts at the cursor; the minimal toolbar hides
heading/list controls; the live preview shows header text.

**In-app** — migration applies; toggling off preserves the text; a real PDF
carries the custom chrome.

`bun run lint`, `bun run test`, `cargo check`.

## Version

`0.152.1` → **`0.153.0`**, plus a CLAUDE.md migration row for 0052.

## Out of scope

- Per-template header/footer text.
- Header text on `voucher` / `report` / `statement` (bespoke headers).
- Images in the header/footer text.
- Page numbers or `{page}` / `{total_pages}` tokens — worth doing, but they
  need Typst `counter` context rather than string substitution, which is a
  different mechanism.
