# PDF settings page revamp

**Date:** 2026-07-26
**Status:** Approved, ready for implementation

**Sub-project B of two.** Sub-project A — header-logo cropper and size control —
is specced separately and lands after this. See "Follow-up" at the end for the
decisions already taken there, so they aren't lost.

## Problem

`/settings/pdf` has accumulated. The Font card alone carries a free-text input,
nine tappable font chips across two labelled rows, and a two-line preview panel
— roughly 300px of vertical space to set one string. Around it:

- The bundled-font arrays are **duplicated** between
  `app/pages/settings/pdf.vue:434` and `app/pages/settings/appearance.vue:308`.
  Adding a bundled font means editing two files and hoping they match.
- The sidebar lists the page's sections as Font / Colour / Templates / Header
  logo; the page actually renders Font / Header logo / Colour / Templates.
- The Font subtitle says the font applies to "quotes, invoices, bills, and
  vouchers" — payslips and letters use it too, and after migration 0050 bills
  render through the shared template family as well.
- The page header still carries "Footer notes moved to Quotes & invoices" — a
  signpost for a change that has long since landed.
- Document protection is a full-width card whose entire content is one button
  linking to `/settings/security#pdf-protection`.

## Goal

A cleaner page, with the font chosen from a dropdown instead of a chip wall.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Font control | **`USelectMenu`, bundled fonts only** | User's call. Every selectable font ships with the app, so output is guaranteed identical on any machine. |
| Unrecognised stored font | **Preserved as a `"<name> (custom)"` option, pre-selected** | See below — silently rewriting someone's typeface is not an acceptable side effect of a UI change. |
| Preview panel | **Kept, slimmed to one line** | The UI loads the same TTF the PDF does, so it is an honest preview rather than an approximation. |
| Font list location | **New `app/lib/fonts.ts`, imported by both settings pages** | Kills the duplication. Pure module, unit-testable, and adding a font becomes a one-line edit in one place. |
| Cleanups | **All four** — sidebar order, subtitle, migration note, protection card | |
| `/settings/appearance` | **Shares the new registry, keeps its chip picker** | Out of scope; converting it is a natural follow-up. |

### The bundled-only migration edge

Today `pdf_font` is free text, so a business may have a locally-installed font
name stored. A strict bundled-only dropdown would render blank for them, and the
next save would rewrite their PDF typeface to whatever the dropdown defaulted to
— a change to their documents that they never asked for.

So: `pdf_font` values that are not in `BUNDLED_FONTS` are appended to the option
list as `"<name> (custom)"`, already selected. The setting is untouched until the
user deliberately picks something else; once they do, the custom entry
disappears from the list. No schema change, one computed.

## Changes

### 1. `app/lib/fonts.ts` (new)

```ts
export interface BundledFont {
	/** Family name as passed to Typst and used in CSS font stacks. */
	name: string
	/** Monospaced faces are grouped separately in the pickers. */
	mono: boolean
}

export const BUNDLED_FONTS: BundledFont[] = [ … ];

export function isBundledFont(name: string | null | undefined): boolean;
```

Contents are the union of the two existing arrays, preserving their current
order: `Akt`, `Inter`, `Inter Tight`, `Stack Sans Text`, `Miriam Libre`,
`Amarna` (sans), then `Iosevka Charon Mono`, `Martian Mono`,
`Google Sans Code` (mono).

Unit-tested: the list is non-empty, `Akt` is present and first (it is the
default in migration 0024), names are unique, and `isBundledFont` is
case-sensitive-exact and false for unknown values.

### 2. Font control — `app/pages/settings/pdf.vue`

The `UInput` plus both chip rows are replaced by one `USelectMenu` bound to
`form.pdf_font`, following the pattern already used on the bills list page
(`:items`, `value-key`, `label-key`, `:search-input`, `#item-leading`):

- Sans and monospaced are visually separated. Grouping uses NuxtUI's
  array-of-arrays items convention; if that does not behave as expected on the
  installed NuxtUI version, fall back to a flat list where monospaced entries
  carry a leading `i-lucide-code` icon. The plan resolves this concretely.
- Each option renders in its own face via an inline `font-family`, exactly as
  the chips do today.
- The trigger renders the selected font in its own face too.
- Options come from `BUNDLED_FONTS`, plus the custom entry described above when
  applicable.

### 3. Preview

One line instead of two — the `INVOICE INV-2026-0042` sample in the chosen face.
The `Total: … — due …` second line and the parenthetical in the caption go.

### 4. Cleanups

- **Sidebar** (`app/layouts/default.vue:653-658`): reorder the `sections` array
  to Font / Header logo / Colour / Templates, matching the rendered page.
- **Font subtitle**: replace the enumerated list so it cannot go stale again.
  Exact copy: *"Used for every PDF this app generates. All fonts here are
  bundled with the app, so your documents look identical on any machine."*
- **Page header**: drop the "Footer notes moved to Quotes & invoices" sentence.
- **Document protection**: replace the `SectionCard` with a compact bordered row
  — icon, one-line label, and the existing link button — sitting below the
  Templates card.

## Testing

`app/lib/fonts.ts` gets `app/lib/fonts.test.ts` per the project rule that pure
logic lives in `app/lib/` with a sibling vitest file. The rest is presentational.

Verified in a browser against a scratch route (the DB-free recipe in CLAUDE.md),
plus `bun run tauri:dev` for the real page:

1. The dropdown lists all nine bundled fonts, each rendered in its own face.
2. Picking one updates the trigger, the preview, and marks the form dirty.
3. A `pdf_font` value not in the list appears as `"<name> (custom)"` and is
   pre-selected; saving without touching it leaves the value unchanged.
4. The sidebar section order matches the page.
5. Save persists, and generating a PDF uses the selected font.
6. `/settings/appearance` still works after the array extraction.

`bun run lint` and `bun run test`.

## Out of scope

- The header-logo cropper and size control — sub-project A, next.
- Converting `/settings/appearance` to a dropdown.
- Adding or removing bundled fonts.
- Schema, Rust, and Typst changes. This is frontend-only.

## Follow-up: sub-project A (header logo)

Recorded here so the decisions survive:

- **Cropping runs in the webview via `<canvas>`** — no image library exists in
  either `package.json` or `Cargo.toml`, and none is needed. Cropped bytes go to
  the existing `save_business_asset` command, so no Rust change.
- **SVG passes through uncropped.** Canvas cropping rasterises, which would
  destroy resolution independence exactly where it matters — on print. The
  cropper is offered for PNG / JPG / WebP only; SVG still uploads and still gets
  the size control.
- **Size control should be a scale multiplier, not absolute mm.** Logo height is
  hardcoded in nine places and deliberately varies by template — 12mm for
  classic / modern / letter / report / statement, 9mm for compact, 14mm for
  voucher. A multiplier on each template's baseline preserves that intent; an
  absolute value discards it.
