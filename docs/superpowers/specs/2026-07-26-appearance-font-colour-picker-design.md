# Appearance settings: font dropdown + custom theme colour

**Date:** 2026-07-26
**Status:** approved

## Goal

Bring `/settings/appearance` to parity with the revamped `/settings/pdf`:

1. **UI font** — replace the free-text input plus three rows of chips with one
   searchable, grouped `USelectMenu` whose items render in their own face.
2. **Theme color** — add a custom colour row (native colour well + hex field)
   below the eight preset swatches.

## Why the theme colour is not a straight port

`pdf_theme_color` is a single hex handed to Typst. The UI accent is not one
colour — NuxtUI 4 consumes an eleven-step ramp:

```css
/* .nuxt/ui.css */
--color-primary-50 … --color-primary-950  →  var(--ui-color-primary-{shade})
--color-primary                            →  var(--ui-primary)
```

Setting `appConfig.ui.colors.primary = "green"` makes NuxtUI emit a `:root`
block mapping `--ui-color-primary-*` onto Tailwind's `--color-green-*`, and
derive `--ui-primary` from shade 500 (light) / 400 (dark). Buttons, hovers,
borders, tints and rings all read different steps of that ramp.

So a custom hex has to become a ramp before NuxtUI can use it.

### Load-bearing assumption

Inline styles on `<html>` outrank a `:root` rule, **unless** that rule uses
`!important`. `.nuxt/ui.css` contains no `!important`, and the runtime block
NuxtUI injects is a plain design-token declaration — but this is generated at
runtime and has not been observed directly.

**This must be verified in the running app before anything is built on it.**
If NuxtUI marks those declarations `!important`, the override approach fails
and the theme-colour half of this work reduces to "presets only, restyled".
The font half is unaffected either way.

## Design

### `app/lib/color-ramp.ts` (new, pure, unit-tested)

```ts
buildPrimaryRamp(hex: string): Record<Shade, string>
```

Takes the **hue and chroma** from the input hex and forces a fixed lightness
curve borrowed from Tailwind v4's own palettes. Returns eleven `oklch(L C h)`
strings keyed `50 … 950`.

Forcing lightness is what makes an arbitrary pick safe. A user who chooses
near-white or near-black still gets an accent that sits at the standard 500
lightness, so filled buttons keep their contrast — no separate clamping step,
and no way to pick an unreadable theme. Chroma is clamped to `[0, 0.30]`;
`0` yields a legitimate grey accent rather than an error.

Colour maths is hand-rolled (sRGB → linear → OKLab → OKLCH). No new
dependency — the app ships offline and a colour library would be ~15 kB for
one conversion.

Also exported, not unit-tested (touches the DOM):

```ts
applyPrimaryColor(appConfig, value: string | null | undefined): void
```

- named preset → remove the inline ramp overrides, set
  `appConfig.ui.colors.primary = name` (today's behaviour, untouched)
- hex → write `--ui-color-primary-{shade}` as inline styles on
  `document.documentElement`

`--ui-primary` derives from the ramp automatically, so light and dark both
work with no extra branch.

### Call sites

Two places apply the accent today, and both switch to `applyPrimaryColor`:

- `app/layouts/default.vue:~464` — the saved-settings watcher, currently
  `if (isValidThemeColor(name)) appConfig.ui.colors.primary = name` (which
  silently ignores a hex).
- `app/pages/settings/appearance.vue:~346` — the live-preview watcher.

### `app/pages/settings/appearance.vue`

**UI font.** One `USelectMenu` replacing the input and the three chip rows,
with four groups:

- **Bundled** — `BUNDLED_FONTS.filter(f => !f.mono)`
- **Monospaced** — `BUNDLED_FONTS.filter(f => f.mono)`
- **System fonts** — the local `systemFonts` array, which stays in this page.
  "Only renders if installed" is a UI-only concern with no meaning for Typst,
  so it does not belong in the shared `app/lib/fonts.ts` registry.
- **Not listed** — appended only when the stored font matches none of the
  above, so an existing custom value stays selected and visible.

`create-item` is enabled so a user can still name any font installed on their
machine. The PDF page could be a closed list because Typst only sees bundled
fonts; here it cannot be. The live preview panel is unchanged.

**Theme color.** The custom row from `/settings/pdf` verbatim: a `<label>`
swatch wrapping a hidden `<input type="color">` (opens the OS picker, no
dependency, works offline) plus a `UInput` for pasting an exact brand hex.
Uses the base body font, not mono.

`themeColor` loosens from `ThemeColor` to `string`. `themeHex()` already
accepts a hex, so the sidebar mark, template thumbnails, bank dots and
category chips keep working with no change.

### Storage

`company_settings.theme_color` is already `TEXT`. A hex fits. **No migration**
— same as `pdf_theme_color`.

## Out of scope

- Custom colours for bank dots or bill categories — separate pickers, and
  their swatch names are stored per-row rather than as one global accent.
- Changing the eight presets, the Theme (light/dark) card, or the Zoom card.
- Deriving `--ui-secondary` / `--ui-success` etc. from the custom accent.

## Testing

- `app/lib/color-ramp.test.ts` — round-trip a known hex, assert eleven keys,
  assert monotonically decreasing lightness, assert a grey input yields zero
  chroma, assert the forced lightness curve rescues a near-white input.
- Manual, in the running app: verify the inline-override assumption above,
  then pick a custom colour and confirm buttons, sidebar active state, hover
  tints and the dark-mode variant all follow.
