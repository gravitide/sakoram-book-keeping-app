---
status: accepted
---

# Stationery is a separate setting from Layout

The old PDF "template" key mixed two things: the branding drawn around the page
(logo, header text, footer, the `letterhead` template's reserved 45 mm band) and
how the document's own content is typeset. We split it into **Stationery** (one
of Built-in / Full-page background / Header & footer images / Pre-printed
paper, owning the page's margins and artwork) and **Layout** (Classic / Modern /
Minimal / Compact, owning typography and density inside the Safe area), so any
Layout works on any Stationery and custom artwork doesn't force the user to give
up a Layout.

## Considered Options

- **A fixed set of templates per stationery mode** (e.g. two designs that only
  exist for header & footer images). Rejected: it multiplies templates by modes,
  and the user loses the Layout they already chose the moment they add artwork.
- **Keep `letterhead` as a template** next to the new modes. Rejected: it and
  the letters' own pre-printed margins were two unrelated implementations of the
  same idea; both fold into the Pre-printed paper mode.

## Consequences

- **Margins come from two places, on purpose.** In Built-in mode the Layout's
  margins apply (they are part of how Compact or Minimal look) and scale with
  paper width. In every other mode the Stationery's four margins apply and the
  Layout only controls what happens inside them. Don't "simplify" this into a
  single source.
- **Artwork files live at fixed names** under `stationery/` in the business
  folder, and the database stores only extension + geometry — never a path.
  Three older columns store absolute paths and need `relocate_stored_paths` to
  survive a moved folder; this one deliberately doesn't. Artwork and its
  originals travel in both the export bundle and the Drive snapshot.
- **Stationery is not frozen per document.** Re-rendering an old invoice uses the
  current Stationery, the same as logos and templates did before.

## Amendment (2026-11-27): Layout is a Built-in choice only

In use, picking a Layout under Full-page background, Header & footer images or
Pre-printed paper added little: the artwork (or the printed paper) is the
design, and once the Layout's own logo and header text are suppressed the four
Layouts differ only in small ways. The Layout picker is therefore shown only
under Built-in, and every other Stationery mode renders with **Classic**. The
stored Layout is kept, so switching back to Built-in restores it. The rest of
this ADR stands: Stationery and Layout remain separate settings, and margins
still come from the Layout under Built-in and from the Stationery otherwise.
