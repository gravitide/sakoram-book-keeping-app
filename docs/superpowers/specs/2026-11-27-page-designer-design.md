# Page designer — design

Status: agreed with the user on 2026-11-27 (grilling session). This replaces the
four Stationery modes from `2026-11-26-pdf-stationery-design.md`.

## Goal

The user designs the PDF "paper" directly. They drag images, text and a page number
anywhere on a live page, in a separate window, much like a simple layout editor.
The four Stationery modes go away: Built-in, Full-page background, Header &
footer images and Pre-printed paper. In their place are a single canvas and a set
of starter templates.

## Decisions

### What the canvas is
- **The canvas designs the paper, not the document.** Canvas items are the
  stationery: letterhead, footer, page number, seals and watermarks. The app still
  lays out the document itself inside the **safe area**: the title, number,
  parties, lines, totals and notes. The document flows onto page 2, 3 and so on.
- **There is one design per business**, used by every document type: quote,
  invoice, bill, voucher, payslip, credit note, letter, statement and report.
- **The safe area is the only rule for where the document goes.** It is four
  margins in mm. Canvas items never push content. An item overlapping the safe
  area gets a warning in the designer but is allowed, because watermarks overlap
  on purpose.
- **Every canvas item is drawn behind the document.** The user can reorder items
  among themselves with bring forward / send back.

### Items
Each item has a position and size in mm from the page's top-left, and a
**pages** rule: `every` (the default), `first` (first page only) or
`not_first` (every page except the first).

- **Image**
  - Formats: SVG, PDF (first page), PNG or JPEG, with any number of images.
  - Resizing keeps the aspect ratio. Cropping uses the existing crop tool.
  - Any image can be marked **Guide only — not printed**. Pre-printed paper
    works by placing a scan of the sheet as a guide.
  - An image item with no file is an **empty slot**. It shows "Drop an image" in
    the designer and prints nothing. Templates use this.
- **Text box**
  - Content is plain text plus live **company fields**: Company name, Address,
    Phone, Email, Website and VAT / TIN no. These fill from Company settings at
    render time.
  - An empty field drops out along with its line. The designer shows empty
    fields faded.
  - Styling:
    - font: one of the six bundled fonts
    - size and bold/italic
    - colour: a fixed colour or **Accent**
    - alignment: left, centre or right
  - The width is fixed and the text wraps. The height grows with the text. There
    are no line-spacing or letter-spacing controls.
- **Page number**
  - Placed once, it appears on every page in that spot.
  - Formats: "Page 1 of 3", "1 / 3" or "1".
  - It takes the same styling as a text box.
  - It has an option to hide on single-page documents.
  - Without this item, documents have no page numbers.
- **Line**: horizontal or vertical, with a thickness and a colour (fixed or
  Accent). Rectangles and other shapes are out of scope.

### Document panel (in the designer)
- **Paper size.** Changing it scales the design proportionally:
  - x scales with the width ratio and y with the height ratio;
  - item sizes scale by the smaller of the two ratios, so nothing stretches;
  - the designer then shows a "Check your design for <paper>" note.
- **Document style**: Classic, Modern, Minimal or Compact. These are today's
  four Layouts, now styling only the generated part of the document (title
  block, spacing, rules), not a letterhead.
- **Accent colour.** It colours the highlighted totals in statements and reports
  and any item set to Accent.
- **Font** for the document body.

### Templates (starting designs)
- There are seven: Classic, Modern, Minimal and Compact (today's letterheads
  rebuilt from items, each also setting its Document style), Full-page background
  (a page-sized empty image slot plus a page number), Pre-printed paper (a
  guide-only empty image slot plus the safe area) and Blank (the safe area only).
- Picking a template **replaces** the design, after a confirm if the design has
  been changed.
- A template with a logo spot **copies the business's company logo** (Company
  settings `logo_path`) in as an ordinary, independent image. If there is no
  company logo, the spot stays an empty slot.
- **A new business starts on Classic** automatically. Onboarding's logo step sets
  the company logo, so the first design already includes it.
- The company logo in Company settings stays as it is. The separate **PDF header
  logo** (`pdf_header_logo_path`) and the header and footer text settings go
  away; text boxes replace them.

### The designer window
- It is a separate OS window, built the same way as Help (`useHelpWindow.ts`:
  `WebviewWindow`, a fixed label, `capabilities/main.json` `windows` list). It
  runs its own Nuxt app and Pinia, and goes through the tenant guard.
- **Everything about the page lives in the designer.** `/settings/pdf` becomes a
  thumbnail of the current design plus an **Open page designer** button. The
  Letters settings button opens the same window.
- **The designer saves its own changes.**
  - It has a Save / Discard bar and asks before closing with unsaved changes.
  - On save it writes the database, then emits an event that makes the main
    window reload its settings and thumbnail.
  - The main window stays usable while the designer is open.
- **The designer window closes itself when the main window switches business or
  locks**, so it can never save into the wrong business or a locked one.
- **The page view** is the real Typst render (`render_document_page_png`, about
  500 ms debounced, latest result wins). Instant HTML handles sit on top of it for
  dragging and resizing, and a **Page 1 / Page 2** switch shows the first-page
  rules.
- **Editing**:
  - select one item at a time;
  - drag, and resize from the corners (images keep their proportions);
  - snap to the page edges, the centre line, the safe area and other items'
    edges;
  - nudge with the arrow keys (Shift for 5 mm);
  - duplicate, delete, bring forward / send back;
  - undo/redo for as long as the window stays open;
  - the existing rulers and zoom.
  - Out of scope: selecting several items, rotation, grouping.
- **Preview as PDF** renders a made-up two-page invoice in the current, unsaved
  design.

### Data and migration
- Pre-1.0, so old stationery settings are **reset, not converted**. The columns
  `pdf_stationery_mode`, `pdf_stationery`, the header logo and the header/footer
  text columns are dropped. Bump `SCHEMA_VERSION`.
- Uploaded item images live under `<business>/stationery/`. One file per item is
  keyed by the item's id, so the existing export/restore copies them, because it
  copies the whole folder. Deleting an item, or replacing the design, removes its
  file.

## Delivery: four PRs, each leaving a working app

1. **Data model + rendering.** Canvas items are stored in the database and drawn by
   Typst (behind content, with the pages rules, page number and fields), the
   seven templates exist as data, and the old modes are removed. For now
   `/settings/pdf` offers a template picker, the safe-area margins, Paper size,
   Document style, Accent and Font. `verify:pdf` baselines are re-captured per
   template.
2. **Designer window.** The separate window with the real render, images,
   drag / resize / snap, the safe area, Save / Discard, undo and Preview as PDF.
   `/settings/pdf` becomes the thumbnail plus the Open page designer button.
3. **Text, fields, page number and lines** in the designer.
4. **Polish.** The paper-size check note, guide-only images, the pages-rule
   picker, overlap warnings, and help topics.
