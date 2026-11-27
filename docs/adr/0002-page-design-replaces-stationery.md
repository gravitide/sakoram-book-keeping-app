---
status: accepted
supersedes: 0001-stationery-separate-from-layout.md
---

# One page design replaces the four Stationery modes

ADR 0001 split the PDF page into Stationery (Built-in / Full-page background /
Header & footer images / Pre-printed paper) and Layout. Each mode had its own
settings card and limits: Built-in drew a fixed letterhead from a logo and
header text, the image modes accepted one background or exactly one header and
one footer image, and changing mode meant learning a different screen. We
replace the modes with **one page design** per business
(`company_settings.pdf_design`, `app/lib/page-design.ts`): a safe area plus
canvas items placed in mm — images, text boxes with live company fields, a page
number, lines — each drawn on every page, the first page only, or every page
but the first. Templates (Classic, Modern, Minimal, Compact, Full-page
background, Pre-printed paper, Blank) are starting designs, not modes.

Spec: `docs/superpowers/specs/2026-11-27-page-designer-design.md`.

## Considered Options

- **Keep the modes and share one editor between them.** Rejected: the user
  still picks a mode first and lives with its limits (one header image, no
  free text), which is what the page designer exists to remove.
- **Make the Built-in letterhead draggable as well** (logo and text block as
  special items). Rejected in favour of plain text boxes with company fields:
  one kind of item instead of a second layout engine.
- **Link the logo item to the company logo.** Rejected by the user: a template
  COPIES the company logo in as an ordinary image; changing the company logo
  later doesn't touch the design. (The only live link is the never-chosen
  default, `pdf_design` NULL, which renders Classic with the current logo.)

## Consequences

- **Layout narrows to "Document style".** `pdf_layout` now styles only the
  generated title block (`doc-header` in common.typ) and payslip's density;
  the letterhead, footer, rules and page number are the design's items.
- **Margins come from one place**: the design's safe area. Paper size changes
  scale the design (`scaleDesign`) instead of re-fitting per mode.
- **The document never prints the business identity itself** (no statement
  FROM block, no built-in footer line); only the design's text items do.
- **Every document is portrait**, the statement included — a design is laid
  out on a portrait sheet.
- **A letter on pre-printed paper** prints none of the design's items and keeps
  its safe area (`buildPageSettings(…, { omitItems: true })`).
- Image files live at `stationery/item-<id>.<ext>`; the id is checked in TS
  (Zod) and again in Rust (`is_item_id`) before any path is built.
