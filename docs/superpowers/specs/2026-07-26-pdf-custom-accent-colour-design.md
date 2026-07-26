# Custom PDF accent colour

**Date:** 2026-07-26
**Status:** Approved, ready for implementation

## Problem

The PDF accent — the header rule and highlights — can only be one of eight
preset swatches. A business whose brand colour isn't in that list can't match
its own documents.

## The landmine this has to avoid

`themeHex()` in `app/lib/theme.ts` resolves a preset **name** to a hex and
falls back to `#ef4444` for anything it doesn't recognise:

```ts
export const themeHex = (name: string | null | undefined): string => {
	const found = THEME_COLORS.find((c) => c.value === name);
	return found?.hex ?? "#ef4444";
};
```

So the moment a hex string lands in `pdf_theme_color`, every PDF renders
**red** — silently, with no error. The passthrough below is therefore a
correctness requirement, not a convenience.

## What makes this cheap

- **`pdf_theme_color` is a `TEXT` column**, so storing `#1d4ed8` needs **no
  migration**.
- **`isValidThemeColor` never guards `pdf_theme_color`.** It is used for the UI
  theme (`app/layouts/default.vue`, `settings/appearance.vue`) and for bank
  dots (`BankColorDot.vue`). Nothing will reject a hex.
- **The PDF payload already carries a resolved hex** (`theme_color:
  pdfThemeHex(settings)`), so no Typst change and no payload change.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Storage | **Hex directly in `pdf_theme_color`** | No migration; "the accent" stays one field rather than a name column plus a hex column that can disagree. |
| Input | **Colour well + hex text field** | The well opens the OS picker for browsing; the hex field is for pasting an exact brand colour, which is the more common case for an invoice accent. |
| Selected state | **Custom row takes the selection ring** | Exactly one thing on the card always looks chosen; otherwise the card reads as though no colour is set. |
| Scope | **`/settings/pdf` only** | Onboarding keeps its eight presets — a first-run wizard is not where someone dials in a brand hex, and it stays correct because it writes a preset name. |

## Changes

### 1. `app/lib/theme.ts`

`themeHex` gains a hex passthrough, ahead of the preset lookup:

```ts
/** True for #rgb / #rrggbb (case-insensitive). */
export const isHexColor = (v: string | null | undefined): boolean =>
	typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

export const themeHex = (name: string | null | undefined): string => {
	// A custom PDF accent is stored as a literal hex in the same column that
	// otherwise holds a preset name — pass it straight through. Without this
	// the lookup below misses and every PDF silently renders the red fallback.
	if (isHexColor(name)) return name!.trim().toLowerCase();
	const found = THEME_COLORS.find((c) => c.value === name);
	return found?.hex ?? "#ef4444";
};
```

`isHexColor` is exported because the settings page needs the same validity
rule to decide whether the custom row is the active selection.

Shared consumers (`BankColorDot`, `CategoryFormModal`, `CategoryPicker`,
`ExpensesByCategoryChart`) only ever pass preset names, so the passthrough is
additive and cannot change their output.

### 2. `app/pages/settings/pdf.vue` — Colour card

Below the eight-swatch grid, a custom row:

- A native `<input type="color">` styled as a swatch, bound to the current
  resolved hex. Native rather than hand-rolled: it opens the OS picker, has
  zero dependencies, and works offline — which matters for a desktop app.
- A text input accepting `#rrggbb`, committing on valid input only, so a
  half-typed `#1d` never becomes the stored value.
- The selection ring applies to this row when `isHexColor(form.pdf_theme_color)`
  is true, and the preset swatches' `=== c.value` comparison naturally
  deselects.

Both controls write to the same `form.pdf_theme_color`, so the existing dirty
tracking, save, and the live A4 preview all work unchanged — the preview reads
`themeColor`, which is `themeHex(form.pdf_theme_color)`.

### 3. Cleanup

Delete `sampleQuotePayload` and `samplePayslipPayload` from
`app/lib/sample-pdf.ts`. They lost their only callers when the settings page
dropped to an invoice-only preview in the previous PR.

## Testing

`app/lib/theme.test.ts` (new — the module has no test file today):

- `themeHex("blue")` returns the preset hex
- `themeHex("#1d4ed8")` passes through
- `themeHex("#FFF")` normalises case, `themeHex(" #fff ")` trims
- `themeHex("#12345")` and `themeHex("nonsense")` fall back to `#ef4444`
- `themeHex(null)` / `themeHex(undefined)` fall back
- `isHexColor` accepts 3- and 6-digit forms, rejects 4/5-digit, missing `#`,
  and non-hex characters

Browser: the colour well and hex field both update the live A4 preview's accent
rule; the selection ring moves off the presets when a custom value is set.

In-app: pick a custom colour, save, generate a PDF and confirm the header rule
matches — this is the check that would have caught the red-fallback bug.

`bun run lint`, `bun run test`.

## Version

`0.153.0` → **`0.153.1`** (patch: no schema change, no new user-facing surface
beyond one input row).

## Out of scope

- Custom colours for the UI theme, bank dots, or bill categories — those are
  separate pickers with their own constraints (NuxtUI's `primary` needs a
  named palette, not a hex).
- A colour history or saved brand palette.
- Contrast checking against white paper.
