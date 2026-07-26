# PDF header logo: cropper, size control, honest preview

**Date:** 2026-07-26
**Status:** Approved, ready for implementation

**Sub-project A** of the PDF-header revamp (sub-project B, the settings-page
revamp, shipped as PR #317). A third sub-project — a rich-text company-details
block rendered beside the logo — is deliberately **out of scope here** and gets
its own spec next; see "Follow-up" at the end.

## Problem

The header logo is upload-and-pray:

1. **No cropping.** Logos often carry baked-in padding; the PDF renders it all,
   so the visible mark ends up smaller than intended.
2. **No size control.** Every template hardcodes the logo height (12mm on
   classic/modern/letter/report/statement, 9mm compact, 14mm voucher). Users
   can't nudge it.
3. **No honest preview.** The upload tile uses the theme background — in dark
   mode a dark logo disappears, in light-cream mode colours shift. The PDF is
   white; the tile should be too. And there's no one-click way to see the logo
   on an actual rendered PDF.
4. **Layout fragility.** Width is derived from height × aspect ratio, so a very
   wide logo can collide with the title (worst on `modern`, where the logo
   shares a grid row with the title block).

## Decisions

| Question | Decision |
|---|---|
| Scope | Logo tooling only; company-details block is a separate follow-up PR |
| Crop model | **Non-destructive**: original kept on disk, derivative rendered; Re-crop reopens the original with the last crop rect |
| SVG | Passes through uncropped (stays vector; cropping would rasterise). Size control still applies |
| Size control | Slider **50–150%**, step 5, one per-business multiplier applied to each template's own baseline height. 100% = today's output |
| Ratio safety | Free crop, plus a **55mm width clamp** in the templates: an over-wide logo scales down to fit instead of colliding |
| Cropper | **Hand-rolled** canvas modal (house style: charts/calendar/drag-scroll are all hand-rolled; desktop mouse-first). Named fallback if it proves janky: `vue-advanced-cropper` |
| Tile background | Fixed white in both themes — the tile is a PDF preview and the PDF is white. A white-on-transparent logo will look invisible there, which is the truth |

## Changes

### 1. Schema — `src-tauri/migrations/0051_pdf_logo_controls.sql`

```sql
ALTER TABLE company_settings ADD COLUMN pdf_logo_scale INTEGER NOT NULL DEFAULT 100;
ALTER TABLE company_settings ADD COLUMN pdf_logo_crop TEXT;
```

- `pdf_logo_scale` — percent, UI-clamped to 50..150. Default 100 means existing
  tenants render byte-identically until they touch the slider.
- `pdf_logo_crop` — nullable JSON `{ "x": n, "y": n, "w": n, "h": n }` in
  **source-image pixels**. Null for SVG or never-cropped logos.

Register in `MIGRATIONS` (`tenants.rs`), bump `SCHEMA_VERSION` 50 → 51
(`data_io.rs`). `company_settings` is already exported; `PRAGMA table_info`
picks the columns up automatically.

### 2. Business-folder files & Rust

| File | Meaning |
|---|---|
| `pdf-header.<ext>` | The derivative every PDF renders (unchanged name/role) |
| `pdf-header-original.<ext>` | The untouched upload, kept so Re-crop never needs the source file again (raster only) |

Rust, both in `tenants.rs`:

- `save_business_asset` gains a third `kind` arm:
  `"pdf-header-original" => (folder_for(&app, &id)?, "pdf-header-original")`.
  The existing stale-extension cleanup applies as-is.
- New command `read_business_asset(app, id, kind) -> Result<Vec<u8>, String>` —
  resolves the same `(dir, stem)` mapping, finds the file with any extension,
  returns `(String, Vec<u8>)` — the extension and the bytes — so the frontend
  can build a correctly-typed Blob. Errors if no file exists for that stem.
  Registered in `lib.rs`.

**Why bytes instead of the asset protocol:** the crop canvas must read pixels.
`convertFileSrc()` URLs are cross-origin to the renderer, and drawing a
cross-origin image taints the canvas — `toBlob()` then throws. Bytes → blob URL
keeps the canvas clean. (Same class of reasoning as the PdfPreviewModal blob-URL
decision.)

### 3. Upload / crop / re-crop flow — `app/pages/settings/pdf.vue`

**Raster upload:** file → `save_business_asset("pdf-header-original")` → crop
modal opens with the image → user crops → canvas exports PNG bytes →
`save_business_asset("pdf-header")` → save `pdf_header_logo_path` +
`pdf_logo_crop`. Cancelling the modal on a *fresh* upload falls back to saving
the uncropped image as the derivative (upload still succeeds; crop is optional).

**SVG upload:** saved directly as `pdf-header.svg`; `pdf_logo_crop` nulled; no
original written; Re-crop hidden.

**Re-crop (raster only):** `read_business_asset("pdf-header-original")` → modal
pre-loaded with the stored rect → new derivative + rect saved. If the original
file is missing (pre-feature upload or user deleted it), fall back to reading
the derivative itself as the crop source and say so in the modal caption.

**Remove:** unchanged behaviour (nulls the path; files stay on disk), plus
nulls `pdf_logo_crop`.

### 4. `ImageCropModal.vue` (new component)

Hand-rolled, single purpose:

- UModal hosting a **white-background** stage; the image drawn scaled-to-fit
  with a draggable, corner-resizable crop rect (pointer events; free ratio;
  minimum 16×16 source px; rect clamped to image bounds).
- Dimmed overlay outside the rect; live `W × H px` readout.
- Props: `open`, `imageBlob: Blob`, `initialRect?: {x,y,w,h}`. Emits
  `cropped(rect, blob)` (rect in source px, blob a PNG of the crop at source
  resolution — no upscaling, no quality loss beyond PNG re-encode) and `cancel`.
- Footer: Cancel · Reset (full image) · Apply crop.

### 5. Size slider + Typst clamp

**UI:** on the Header logo card — `USlider` bound to `form.pdf_logo_scale`
(min 50, max 150, step 5), with a live readout derived
from the classic baseline: `Logo size — 115% (classic prints ≈ 13.8mm tall)`.
Wired into the page's existing form dirty/save/reset like `pdf_theme_color`.

**Typst:** new shared helper in `common.typ`:

```typst
// Header logo at the template's baseline height × the user's scale, with a
// hard width cap so banner-shaped logos shrink instead of colliding with
// the title. Ratio comes from measure(), so nothing ever distorts.
#let header-logo(data, base-h) = context {
  let s = data.at("logo_scale", default: 100) / 100
  let m = measure(image(data.logo_file))
  let h = base-h * s
  let w = h * m.width / m.height
  let w-max = 55mm
  if w > w-max {
    h = h * w-max / w
    w = w-max
  }
  image(data.logo_file, width: w, height: h)
}
```

All nine `image(data.logo_file, height: …)` sites switch to
`header-logo(data, <their current baseline>)`:
`common.typ:415` (uses its `logo-h` arg) and `:438` (12mm),
`doc-classic.typ` (12mm), `doc-compact.typ` (9mm), `doc-modern.typ` (12mm),
`letter.typ` (12mm), `report.typ` (12mm), `statement.typ` (12mm),
`voucher.typ` (14mm).

`voucher.typ`, `report.typ`, and `statement.typ` don't currently import
`common.typ` and aren't rendered with it: each gains the import, and their three
`export_*_pdf` commands in `pdf.rs` gain `&[("common.typ", COMMON_TEMPLATE)]`
as companion files (one-line changes; letter and the doc family already have
both).

**Payloads:** every builder that emits `logo_path` also emits
`logo_scale: settings?.pdf_logo_scale ?? 100` — quote, invoice, bill, payslip,
voucher, letter, report, statement, and the three sample payloads. The template
default (`data.at(…, default: 100)`) keeps any unmigrated payload safe.

### 6. Card UI polish

- Upload tile: `bg-white ring-1 ring-(--ui-border)` in **both** themes (replaces
  the theme-reactive `bg-(--ui-bg-muted)`); dashed border and drag-over states
  kept.
- Buttons row: Upload · Re-crop (raster only) · Remove · **Preview on PDF** —
  the last reuses the page's existing `invoicePreview` (`usePdfPreview` +
  `sampleInvoicePayload`), which after the payload change carries the real
  logo + scale through the real Typst pipeline.

## Testing

- Unit: none new beyond what lands in `app/lib/` — if crop-rect clamping math is
  extracted (pure), it goes to `app/lib/crop-rect.ts` + test per house rule.
  The modal's pointer handling is exercised in the browser, not vitest.
- **Typst, via the sidecar harness:** render a sample invoice at scale 50 / 100 /
  150 and confirm heights ≈ 6 / 12 / 18mm; render with an extreme banner crop
  (e.g. 2000×100px) and confirm the width clamps at 55mm with no title
  collision on `classic` and `modern`; render voucher/report/statement once
  each to prove the new `common.typ` import resolves.
- **Browser, scratch route** (with `resize_window` first — zero-viewport
  gotcha): crop rect drags/resizes/clamps; Apply emits the right source-px
  rect; white stage in dark mode.
- **In-app (`tauri:dev`):** upload → crop → save → generate a PDF; Re-crop
  reopens with the stored rect; slider changes print size; Preview on PDF shows
  the current logo; migration applies to a live DB.
- `bun run lint`, `bun run test`, `cargo check`.

## Version

`0.151.0` → **`0.152.0`** across the usual four files; CLAUDE.md migration row
for 0051.

## Out of scope / follow-up

- **Company-details block beside the logo** (rich text via the existing
  `RichTextEditor` → `richTextToBlocks` → `render-blocks` pipeline from
  Letters). Own spec + PR next — it changes template *header layouts*, and
  wants the finished logo card to build on. The user has more ideas pending
  here ("i might need few more things once we land on this").
- Per-template logo scale overrides.
- Deleting orphaned logo files on Remove (pre-existing behaviour, unchanged).
