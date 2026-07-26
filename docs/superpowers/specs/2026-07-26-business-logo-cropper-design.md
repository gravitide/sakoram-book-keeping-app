# Business identity logo: cropper + white plate

**Date:** 2026-07-26
**Status:** approved

## Goal

Bring the square business (identity) logo uploader on `/settings/company` to
parity with the PDF header logo:

1. A **square-locked cropper** on upload, with Re-crop from the untouched
   original.
2. A **white plate** behind the logo — on the uploader tile *and* at the three
   places the logo actually renders.

## Why the white plate reaches beyond the uploader

The PDF header tile is fixed white because PDFs print on white paper — the
preview shows the real substrate. The identity logo is the opposite: it renders
only in app chrome, in a `bg-(--ui-bg-muted)` square at three sites:

| Site | Element |
|---|---|
| Sidebar business switcher | `app/layouts/default.vue` — `size-9` |
| Welcome screen tenant cards | `app/pages/welcome.vue` — `size-12` |
| Settings → Businesses list | `app/pages/settings/businesses.vue` — `size-11` |

That background is dark in dark mode and warm cream in light. A white uploader
tile alone would show the logo against a surface it never appears on, and would
*hide* the actual complaint — a dark-on-transparent mark disappearing against
dark chrome.

So the plate goes white at all four places. One refinement: **white only when a
logo is present.** The empty-state `i-lucide-building-2` icon keeps
`bg-(--ui-bg-muted)`, because a white square holding a grey icon reads as a
broken image in dark mode.

## Design

### Migration 0053

`company_settings.logo_crop` — TEXT, nullable, JSON `{x,y,w,h}` in source
pixels. NULL for SVG or an uncropped logo. Mirrors `pdf_logo_crop` from 0051.
`SCHEMA_VERSION` → 53. No new table, so the `TABLES` list is unchanged.

### Rust: a `logo-original` asset kind

`save_business_asset` and `read_business_asset` in `src-tauri/src/tenants.rs`
each gain one match arm:

```rust
"logo-original" => (logos_dir_for(&app, &id)?, "logo-original"),
```

The business folder then holds:

```
logos/logo.<ext>           ← cropped derivative; what every UI surface renders
logos/logo-original.<ext>  ← untouched upload, source for Re-crop
```

The stale-extension cleanup in `save_business_asset` keys on `file_stem`, and
`"logo-original" != "logo"`, so saving one never deletes the other.

### `crop-rect.ts`: optional aspect lock

`ImageCropModal` is free-form today, built for the wide letterhead. Square
locking belongs in the pure helpers, not the component:

- `fullRect(imgW, imgH, aspect?)` — with an aspect, seed the largest centred
  rect of that ratio instead of the whole image.
- `resizeRect(..., aspect?)` — hold the ratio while a corner is dragged,
  driving the rect from whichever axis the pointer moved further, then clamp
  to the image. Clamping must preserve the ratio, not just truncate one axis.

`moveRect` is unaffected — translating never changes dimensions.

### `ImageCropModal`: an `aspect?: number` prop

Threaded into the two helpers above. Absent (the PDF header) keeps today's
free-form behaviour exactly.

### `settings/company.vue`

Mirrors the PDF page's flow:

- **Raster upload** → save bytes as `logo-original` → open the cropper with
  `:aspect="1"` → on apply, write the derivative as `logo` and persist
  `logo_crop`.
- **SVG** → passes through uncropped and stays vector; `logo_crop` set to NULL.
- **Re-crop** → `read_business_asset("logo-original")`, reopen seeded with the
  stored rect.
- Uploader tile background → fixed white in both themes, matching the plate.

### The sharp edge

Cropping a raster produces a **PNG** blob, so a JPEG upload lands as
`logo.png`. `tenants.setLogoFile(tenantId, "logo.<ext>")` mirrors the filename
into `tenants.json`, which the welcome screen and Businesses list read
*directly* without going through the DB. Passing the pre-crop extension there
would leave both pointing at a file that no longer exists — a logo that
vanishes everywhere except the settings page.

`setLogoFile` must therefore be given the extension of the file actually
written.

## Out of scope

- The wide PDF header logo — already done in 0051.
- Changing logo storage for existing tenants. A logo uploaded before this
  change has no `logo-original`, so Re-crop is unavailable until it's
  re-uploaded; the existing `logo.<ext>` keeps rendering untouched.
- Re-cropping existing wide logos automatically. They keep letterboxing via
  `object-contain` until the user chooses to re-crop.

## Testing

- `app/lib/crop-rect.test.ts` — extend for the aspect path: `fullRect` with
  `aspect: 1` on landscape, portrait and already-square sources; `resizeRect`
  holding 1:1 from each of the four corners; ratio preserved when the drag
  would exit the image; free-form behaviour unchanged when `aspect` is omitted.
- Manual: upload a raster, confirm the crop box is square and stays square;
  confirm the derivative renders on a white plate in the sidebar, welcome and
  Businesses; confirm Re-crop reopens the original with the stored rect;
  confirm an SVG skips the cropper.
