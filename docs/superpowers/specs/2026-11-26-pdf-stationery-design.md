# PDF Stationery, Layout & Paper size — design

Outcome of a grilling session on 2026-11-26. Vocabulary is defined in
`GLOSSARY.md`; the core split is recorded in
`docs/adr/0001-stationery-separate-from-layout.md`.

## The model

- **Stationery** — one per business, applied to **every** PDF (quote, invoice,
  bill, voucher, payslip, statement, report, letter). Exactly one mode:
  1. **Built-in** — today's logo + header text + footer text. Default.
  2. **Full-page background** — one page-sized artwork behind the content.
  3. **Header & footer images** — two independently placed artworks.
  4. **Pre-printed paper** — nothing printed; blank bands reserved.
  Modes are exclusive (want a header image *and* a background → make one
  full-page background).
- **Layout** — Classic / Modern / Minimal / Compact. All four work under every
  mode. The `letterhead` template is removed (→ Pre-printed paper + Classic).
- **Paper size** — A4 (default), A5, US Letter, US Legal. One per business.

## Rules

- **Margins.** Built-in: the Layout's margins, not editable, scaled with paper
  width (18 mm on A4 ≈ 12.7 mm on A5). Other modes: the Stationery's four
  draggable margins; the Layout only controls typography/density inside them.
  Text sizes are fixed points everywhere — never auto-shrunk.
- **Under any non-Built-in mode** every template drops its own logo and
  header text / business block. Layouts keep title + number + accent rule;
  voucher / report / statement / letter keep their own content design (no
  Layout picker) but obey Stationery + Paper size.
- **Multi-page.** Artwork and reserved bands repeat on every page. A lighter
  continuation-page variant is a later feature.
- **Footer text** (rich-text custom footer) is Built-in only.
- **Page numbers** — new: "Page N of M", every mode, only on documents of more
  than one page, small, right-aligned just inside the bottom of the Safe area.
- **Letters** keep a per-letter "use stationery / pre-printed paper" switch.
  Pre-printed paper margins always exist (even when another mode is active) and
  replace `letter_preprinted_{top,bottom}_margin_mm`.
- **Switching modes is non-destructive** — each mode remembers its artwork and
  geometry; only an explicit Remove deletes.
- **Not frozen per document** — old documents re-render with current Stationery.

## Artwork

- Background formats: SVG, PNG, JPEG, PDF (first page). Raster that isn't the
  paper's aspect → `ImageCropModal` locked to the paper aspect; SVG/PDF cover
  the page uncropped (stay vector).
- Raster downscaled on import to ~300 DPI at the paper size (A4: 2480×3508).
  SVGs containing live text get a "convert text to outlines" warning; no
  automatic fix.
- **Header & footer images**: drop in at full page width flush to their edge;
  free drag + corner resize, aspect locked, snapping to edges and centre. The
  reserved band follows the image (its inner edge + 4 mm); the guide can be
  dragged further out for more room, never into the image.
- **Paper-size change**: A4 ↔ A5 scales artwork, geometry and margins
  proportionally. To/from Letter/Legal: header/footer images keep mm size and
  are clamped; raster backgrounds need a re-crop (cropper reopens on the
  original); SVG/PDF re-cover; editor opens with a "check your stationery"
  banner. Never silently destructive.
- **Storage**: `stationery/` in the business folder, fixed names
  (`background.<ext>`, `header.<ext>`, `footer.<ext>` + originals). DB holds
  extension + geometry only, never a path. Artwork **and originals** go into
  both the export bundle and the Drive snapshot. All file ops via Rust commands.

## Editor

- `/settings/pdf` reorganised into **Paper & layout** (paper size + Layout
  picker), **Stationery** (mode picker, current-page thumbnail, Edit stationery
  button; Built-in's logo + header/footer text controls shown only for
  Built-in), **Font**.
- Editor is a full-window modal: page to scale, mm rulers, artwork, four
  draggable margin guides, draggable header/footer images, grey placeholder
  content bars, and an informational hatched 5 mm "most printers can't print
  here" band (no snapping, no enforcement).
- **Preview sample invoice** renders a fixed, made-up ~25-line invoice through
  Typst — always two pages, so continuation, repeated stationery and the page
  number are visible. No live Typst render on drag.

## Data

Pre-1.0: drop and recreate, no backfill.

- `pdf_template` → `pdf_layout` (classic | modern | minimal | compact;
  `letterhead` → classic + pre-printed mode).
- New `pdf_paper_size`, `pdf_stationery_mode` columns.
- New `pdf_stationery` JSON — per-mode margins + image geometry, validated by a
  Zod schema in `app/lib`.
- Drop `letter_preprinted_top_margin_mm` / `letter_preprinted_bottom_margin_mm`.
- Bump `SCHEMA_VERSION`.

## Demo seed

Ship one simple generated A4 SVG letterhead; the demo business uses
Full-page background.

## Delivery — three PRs, in order

1. **Foundation** — paper size, Layout rename, page numbers, margin ownership,
   Stationery model with Built-in + Pre-printed paper only, adopted by every
   template (incl. voucher / report / statement / letter), letter migration,
   render checks of every template at all four paper sizes. Pre-printed margins
   as number inputs; no editor yet.
2. **Full-page background** — editor modal (canvas, rulers, guides, printer
   band, Typst preview), upload / crop / downscale, SVG text warning, backups,
   demo seed.
3. **Header & footer images** — image placement in the editor, image-following
   bands, paper-size-change handling for images.

## Acceptance checks

- Every Layout and every bespoke template rendered at A4 / A5 / Letter / Legal.
- Built-in mode at A4 with no new settings touched renders as today, apart from
  the new page numbers on multi-page documents (byte-identical on single-page
  documents).
