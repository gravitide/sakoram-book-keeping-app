// Shared building blocks for the client-facing document
// Layouts (doc-classic / doc-modern / doc-minimal / doc-compact).
//
// Each template `#import "common.typ": *`, loads its own `data` from
// data.json, sets up the page/text, renders its distinctive header, and
// composes the blocks below. The fiddly, must-stay-consistent parts — the
// items table, party/meta blocks, money/label formatting — live here once so
// every template renders them identically. The Rust side (pdf.rs) writes this
// file into the per-render work dir alongside the chosen template.

// --- text helpers ------------------------------------------------------
// `lbl` (not `label` — that shadows Typst's built-in) = a small bold
// uppercase tracked field label. `faint` = muted grey secondary text.
#let lbl(t) = text(weight: "bold", size: 8.5pt, tracking: 0.04em)[#upper(t)]
#let faint(t) = text(fill: rgb("#6b7280"), size: 8.5pt)[#t]
// `caption` = a muted, lightly-tracked small-caps label for the party / meta
// blocks. Deliberately lighter than `lbl` so the label recedes and the value
// (name / number / date) leads — the hierarchy the flat all-black labels lacked.
#let caption(t) = text(fill: rgb("#9ca3af"), weight: "medium", size: 7.5pt, tracking: 0.09em)[#upper(t)]

// Font cascade: the user's chosen PDF font first, bundled fallbacks after so
// any missing glyph still resolves. Returns the tuple for `#set text(font:)`.
#let resolve-font(data) = {
  let chosen = if "font_family" in data and data.font_family != none { data.font_family } else { "Akt" }
  (chosen, "Inter", "Inter Tight", "Miriam Libre")
}

// --- party block (client / vendor) -------------------------------------
#let party-block(data) = [
  #caption(data.party_label)
  #v(5pt)
  #text(weight: "semibold", size: 11.5pt, fill: rgb("#1f2937"))[#data.party.name]
  #for ln in data.party.address_lines [
    #linebreak()
    #text(fill: rgb("#5b636e"))[#ln]
  ]
  #if data.party.tax_id != none and data.party.tax_id != "" [
    #v(4pt)
    #faint("Tax ID: " + data.party.tax_id)
  ]
]

// --- meta block (number / date / secondary date / vendor invoice #) -----
// A right-aligned label -> value grid: muted caption in the left column, the
// value flush to the right margin in the right column, reading straight down.
// The number is bold (but the same size as the dates); dates are muted-dark.
// Templates wrap the whole thing in `align(right, …)`.
#let meta-value(t) = text(fill: rgb("#3d4450"))[#t]
#let meta-block(data) = {
  let rows = (
    (caption(data.primary_label), text(weight: "bold", fill: rgb("#1f2937"))[#data.number]),
    (caption(data.date_label), meta-value(data.date_value)),
  )
  if data.secondary_label != none {
    rows.push((caption(data.secondary_label), meta-value(data.secondary_value)))
  }
  if data.vendor_invoice_label != none {
    rows.push((caption(data.vendor_invoice_label), meta-value(data.vendor_invoice_value)))
  }
  grid(
    columns: (auto, auto),
    column-gutter: 14pt,
    row-gutter: 8pt,
    align: right + horizon,
    ..rows.flatten()
  )
}

// --- project subtitle (centered, bold) ---------------------------------
#let project-subtitle(data) = if data.project_title != none and data.project_title != "" [
  #v(14pt)
  #align(center, text(weight: "bold", size: 11pt)[#data.project_title])
]

// --- items table (bundle vs itemized) ----------------------------------
#let items-table(data) = {
  let header-cell(s) = table.cell(
    fill: rgb("#fafafa"),
    inset: 7pt,
    text(weight: "bold", size: 8.5pt, tracking: 0.03em)[#upper(s)]
  )
  let body-cell(content, align-h: left) = table.cell(
    inset: 8pt,
    align: align-h + top,
    content
  )

  if data.pricing_mode == "bundle" [
    // Bundle mode has no per-line amount — the whole quote/invoice is one
    // lump sum. So the items table is just Item + Description; the single
    // total (and subtotal / VAT when charged) sits in the summary rows below.
    #table(
      columns: (28%, 1fr),
      stroke: 0.5pt + rgb("#e5e7eb"),
      align: (left + top, left + top),

      header-cell("Item"),
      header-cell("Description"),

      ..for line in data.lines {
        (
          body-cell(line.item_label),
          body-cell([
            #for (i, part) in line.description.split("\n").enumerate() [
              #if i > 0 [#linebreak()]
              #part
            ]
          ]),
        )
      },

      ..if data.has_vat {(
        table.cell(colspan: 2, fill: rgb("#fafafa"), inset: 7pt, align: right)[Subtotal #h(1.2em) #data.formatted.subtotal_no_symbol],
        table.cell(colspan: 2, fill: rgb("#fafafa"), inset: 7pt, align: right)[VAT #h(1.2em) #data.formatted.tax_no_symbol],
      )} else {()},

      table.cell(
        colspan: 2,
        fill: rgb("#f3f4f6"),
        inset: 9pt,
        align: right,
        // currency symbol + the no-symbol total (formatted.total already
        // carries a symbol — using it here double-prints "Rs Rs …").
        text(weight: "bold", size: 11pt)[#data.currency_symbol #data.formatted.total_no_symbol]
      ),
    )
  ] else [
    #let cols = if data.has_vat {
      (5%, 1fr, 8%, 16%, 8%, 16%)
    } else {
      (5%, 1fr, 10%, 18%, 18%)
    }

    #table(
      columns: cols,
      stroke: 0.5pt + rgb("#e5e7eb"),
      align: (center + top, left + top, right + top, right + top, ..if data.has_vat { (right + top,) } else { () }, right + top),

      header-cell("#"),
      header-cell("Item / description"),
      header-cell("Qty"),
      header-cell("Unit price"),
      ..if data.has_vat { (header-cell("VAT"),) } else { () },
      header-cell("Total"),

      ..for (idx, line) in data.lines.enumerate() {
        (
          body-cell(str(idx + 1), align-h: center),
          body-cell([
            #if line.item_label != "" [#text(weight: "semibold")[#line.item_label]]
            #if line.description != "" [
              #if line.item_label != "" [#linebreak()]
              #text(fill: rgb("#4b5563"), size: 8.5pt)[
                #for (i, part) in line.description.split("\n").enumerate() [
                  #if i > 0 [#linebreak()]
                  #part
                ]
              ]
            ]
          ]),
          body-cell(line.qty_display, align-h: right),
          body-cell(line.unit_price_display, align-h: right),
          ..if data.has_vat {
            (body-cell(line.vat_display, align-h: right),)
          } else { () },
          body-cell(line.total_display, align-h: right),
        )
      },

      table.cell(colspan: cols.len() - 1, fill: rgb("#fafafa"), inset: 7pt, align: right)[Subtotal],
      table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right)[#data.formatted.subtotal_no_symbol],
      ..if data.has_vat {(
        table.cell(colspan: cols.len() - 1, fill: rgb("#fafafa"), inset: 7pt, align: right)[VAT],
        table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right)[#data.formatted.tax_no_symbol],
      )} else {()},
      table.cell(colspan: cols.len(), fill: rgb("#f3f4f6"), inset: 9pt, align: right, text(weight: "bold", size: 11pt)[#data.currency_symbol #data.formatted.total_no_symbol]),
    )
  ]
}

// --- paid / credited / balance-due block -------------------------------
// Shown once anything has been paid OR credited. `credited_*` only exists on
// invoice payloads (issued credit notes settled against the invoice), so it
// is read with a default — quote / bill payloads don't carry the key. A
// paid-only invoice renders exactly the two rows it always did.
#let paid-block(data) = {
  let paid = data.at("paid_cents", default: none)
  let credited = data.at("credited_cents", default: none)
  let has-paid = paid != none and paid > 0
  let has-credit = credited != none and credited > 0
  if has-paid or has-credit [
    #v(8pt)
    #align(right)[
      #grid(
        columns: (auto, auto),
        column-gutter: 16pt,
        row-gutter: 4pt,
        align: (right, right),
        ..if has-paid {
          (
            text(fill: rgb("#6b7280"))[Paid:],
            text(fill: rgb("#16a34a"))[#data.currency_symbol #data.paid_display],
          )
        } else { () },
        ..if has-credit {
          (
            text(fill: rgb("#6b7280"))[Credited:],
            text(fill: rgb("#16a34a"))[#data.currency_symbol #data.credited_display],
          )
        } else { () },
        text(weight: "semibold")[Balance due:],
        text(weight: "bold", size: 11pt, fill: rgb("#dc2626"))[#data.currency_symbol #data.balance_display],
      )
    ]
  ]
}

// --- rich-text rendering ----------------------------------------------
// Shared with letter.typ (which imports render-blocks from here). The block
// tree arrives pre-normalised from the JS side (app/lib/rich-text.ts /
// letter-body.ts): paragraph / heading / bullet_list / ordered_list nodes,
// each carrying inline runs with bold/italic/underline + optional colour/size
// and a per-block alignment. Text stays plain strings throughout, so the
// template never builds Typst source from user input (no injection risk).
#let render-run(r) = {
  if r.at("line_break", default: false) {
    linebreak()
  } else {
    let c = [#r.text]
    let ts = (:)
    let col = r.at("color", default: none)
    let sz = r.at("fontSizePt", default: none)
    if col != none { ts.insert("fill", rgb(col)) }
    if sz != none { ts.insert("size", sz * 1pt) }
    if ts.len() > 0 { c = text(..ts)[#c] }
    if r.at("underline", default: false) { c = underline(c) }
    if r.at("italic", default: false) { c = emph(c) }
    if r.at("bold", default: false) { c = strong(c) }
    c
  }
}
#let render-runs(runs) = { for r in runs { render-run(r) } }
#let apply-align(a, body) = {
  if a == "center" { align(center, body) }
  else if a == "right" { align(right, body) }
  else if a == "justify" { par(justify: true, body) }
  else { body }
}
// `default-align` sets the alignment for blocks that don't carry their own
// (the editor only stores a non-left alignment). Body / notes leave it `none`
// (natural left); the sign-off passes "right" so an un-aligned name still sits
// against the right margin like the old plain-text sign-off did.
#let render-blocks(blocks, default-align: none, spacing: 8pt) = {
  for b in blocks {
    if b.kind == "paragraph" {
      block(width: 100%, below: spacing, apply-align(b.at("align", default: default-align), render-runs(b.runs)))
    } else if b.kind == "heading" {
      let lvl = b.at("level", default: 2)
      let hsize = if lvl == 1 { 15pt } else if lvl == 2 { 13pt } else { 11.5pt }
      block(width: 100%, above: 10pt, below: spacing * 0.75, apply-align(b.at("align", default: default-align), text(weight: "bold", size: hsize, render-runs(b.runs))))
    } else if b.kind == "bullet_list" {
      list(..b.items.map(items => render-blocks(items, default-align: default-align, spacing: spacing)))
    } else if b.kind == "ordered_list" {
      enum(..b.items.map(items => render-blocks(items, default-align: default-align, spacing: spacing)))
    } else if b.kind == "table" {
      // Rich-text table. Inlined (not a separate helper) because it needs to
      // call render-blocks for each cell's content, and Typst only lets a
      // function reference names defined before it — self-recursion works,
      // mutual recursion between two module functions does not.
      //
      // Column count = the widest row's total colspan (TipTap tables are
      // rectangular). Cells arrive row-major with spans on the anchor cell
      // only — the model Typst's table.cell(colspan/rowspan) uses — so they
      // flow into place. Header cells get a light fill + bold; borders + inset
      // match the items table for consistency.
      let colcount = 1
      for row in b.rows {
        let w = 0
        for cell in row { w += cell.at("colspan", default: 1) }
        if w > colcount { colcount = w }
      }
      let cells = ()
      for row in b.rows {
        for cell in row {
          let is-header = cell.at("header", default: false)
          let body = render-blocks(cell.blocks)
          if is-header { body = text(weight: "bold", body) }
          cells.push(table.cell(
            colspan: cell.at("colspan", default: 1),
            rowspan: cell.at("rowspan", default: 1),
            fill: if is-header { rgb("#fafafa") } else { none },
            body,
          ))
        }
      }
      block(width: 100%, above: 4pt, below: 10pt, table(
        columns: colcount,
        stroke: 0.5pt + rgb("#e5e7eb"),
        inset: (x: 7pt, y: 5pt),
        ..cells,
      ))
    }
  }
}

// --- page design -----------------------------------------------------------
// The business's page design (app/lib/page-design.ts) is the paper: its safe
// area is the page margins, and its items — images, text boxes, a page
// number, lines — are drawn by design-items in the page's BACKGROUND layer,
// behind the content and out of its flow, so they never move it.
// `data.page.items` is built by app/lib/page-settings.ts (text fields already
// filled, Accent already a hex colour, unprintable items already left out);
// pdf.rs stage_page_items adds each image's `file` and drops an image it
// can't stage. Positions and sizes are mm from the page's top-left; font
// sizes and line thickness are points.

// Which pages an item is drawn on. Mirrors itemOnPage in page-design.ts.
#let design-item-on-page(rule, n) = if rule == "first" { n == 1 } else if rule == "not_first" { n > 1 } else { true }

// Italic, slanted: no bundled font ships an italic face (Typst would quietly
// draw it upright), so each line is skewed about its own centre, as a browser
// does for a font without one.
#let design-slant(item, line) = if item.italic { box(skew(ax: -12deg, line)) } else { line }

// A text box / page number: a block of the item's width, the item's font
// first with the bundled fallbacks after.
#let design-text(item, body) = {
  let al = if item.align == "center" { center } else if item.align == "right" { right } else { left }
  block(width: item.w * 1mm, align(al, text(
    font: (item.font, "Inter", "Inter Tight", "Miriam Libre"),
    size: item.size * 1pt,
    weight: if item.bold { "bold" } else { "regular" },
    fill: rgb(item.color),
    body,
  )))
}

// The design's items on the current page. Each drawn item carries a metadata
// marker (<sakoram-design-item>, and <sakoram-page-number> on the page number)
// that `bun run verify:pdf` queries to prove each item lands on exactly the
// pages its rule names.
#let design-items(data) = context {
  let n = counter(page).get().first()
  let total = counter(page).final().first()
  for item in data.page.items {
    let drawn = if not design-item-on-page(item.pages, n) {
      none
    } else if item.type == "image" {
      if item.at("file", default: none) != none {
        image(item.file, width: item.w * 1mm, height: item.h * 1mm, fit: "contain")
      }
    } else if item.type == "text" {
      // A faded line: one PDFs leave out (all its fields empty), kept by the designer.
      design-text(item, item.lines.map(l => design-slant(item, if l.faded { text(fill: rgb(item.color).transparentize(65%), l.text) } else [#l.text])).join(linebreak()))
    } else if item.type == "page_number" {
      if not (item.hide_single and total == 1) {
        let label = if item.format == "slash" [#n / #total] else if item.format == "number" [#n] else [Page #n of #total]
        [#design-text(item, design-slant(item, label))#metadata((page: n, total: total))<sakoram-page-number>]
      }
    } else if item.type == "line" {
      line(length: item.length * 1mm, angle: if item.vertical { 90deg } else { 0deg }, stroke: item.thickness * 1pt + rgb(item.color))
    }
    if drawn != none {
      place(top + left, dx: item.x * 1mm, dy: item.y * 1mm, [#drawn#metadata((id: item.id, page: n))<sakoram-design-item>])
    }
  }
}

// --- page setup ----------------------------------------------------------
// The ONE page setup every template applies, as
//   #set page(..page-setup(data))
// `data.page` is built by app/lib/page-settings.ts (the only place the page is
// decided) and sent by every PDF builder:
//   paper    Typst paper name (the business's Paper size)
//   margins  the design's safe area { top, right, bottom, left } in mm
//   items    the design's printable items, drawn behind the content
// Always portrait: a design is laid out on a portrait sheet. No footer — the
// design's own items are the footer.
// Returns the argument dict rather than applying `set page` itself: a set rule
// inside a function only reaches that function's own content.
//
// MUST stay above every caller (Typst resolves names in definition order).
#let page-setup(data) = {
  let m = data.page.margins
  (
    paper: data.page.paper,
    margin: (top: m.top * 1mm, right: m.right * 1mm, bottom: m.bottom * 1mm, left: m.left * 1mm),
    background: design-items(data),
  )
}

// --- notes -------------------------------------------------------------
// Rich-text notes. `notes_blocks` is the normalised block tree; `notes` is the
// raw stored string, kept only so we can cheaply skip the whole block when the
// field is empty.
#let notes-block(data) = if data.notes != none and data.notes != "" [
  #v(14pt)
  #block(breakable: false)[
    #text(weight: "bold")[NOTES:]
    #v(4pt)
    #render-blocks(data.notes_blocks)
  ]
]

// --- bank details (from the snapshot frozen at issue time) -------------
#let bank-block(data) = if data.bank != none {
  // Collect only the present fields into (label, value) rows, then render a
  // bordered label|value table matching the items table's stroke / fills.
  let rows = ()
  if data.bank.bank_name != none {
    rows.push(("Bank", data.bank.bank_name + if data.bank.bank_branch != none { ", " + data.bank.bank_branch } else { "" }))
  }
  if data.bank.bank_account_name != none {
    rows.push(("Account name", data.bank.bank_account_name))
  }
  if data.bank.bank_account_number != none {
    rows.push(("Account no.", data.bank.bank_account_number))
  }
  if rows.len() > 0 [
    #v(12pt)
    #block(breakable: false)[
      #lbl("Payment details")
      #v(5pt)
      #table(
        columns: (auto, auto),
        stroke: 0.5pt + rgb("#e5e7eb"),
        inset: (x: 10pt, y: 6pt),
        // `field` not `label` — label shadows a Typst built-in.
        ..for (field, value) in rows {
          (
            table.cell(fill: rgb("#fafafa"), text(fill: rgb("#4b5563"), size: 9pt)[#field]),
            table.cell(text(weight: "semibold", size: 9.5pt)[#value]),
          )
        }
      )
    ]
  ]
}

// --- sign-off (right-aligned) ------------------------------------------
#let signoff-block(data) = {
  let blocks = data.at("prepared_by_blocks", default: ())
  if data.prepared_by != none and data.prepared_by != "" and blocks.len() > 0 {
    v(28pt)
    align(right)[
      #caption("Prepared by")
      #v(6pt)
      #render-blocks(blocks, default-align: "right")
    ]
  }
}

// --- layout config ------------------------------------------------------
// Page-level settings per Layout key (data.layout). Typst `set` rules inside
// a function are scoped to that function's content, so the caller applies
// these with its own `set` rules. Only payslip.typ uses it; its `margin` is
// unused since the page design owns the margins.
#let layout-config(data) = {
  let key = data.at("layout", default: "classic")
  if key == "minimal" {
    (
      margin: (x: 22mm, top: 22mm, bottom: 22mm),
      text-size: 9pt,
      leading: 0.62em,
      spacing: 0.72em,
    )
  } else if key == "compact" {
    (
      margin: (x: 14mm, top: 12mm, bottom: 12mm),
      text-size: 8.5pt,
      leading: 0.5em,
      spacing: 0.5em,
    )
  } else {
    // classic + modern share the same page setup.
    (
      margin: (x: 18mm, top: 16mm, bottom: 18mm),
      text-size: 9.5pt,
      leading: 0.55em,
      spacing: 0.65em,
    )
  }
}


// --- shared document header --------------------------------------------
// The four Document styles' title blocks (data.layout). The letterhead —
// logo, business details, rules, footer — belongs to the page design
// (design-items, above), so this is only the document's own title. Needs
// data.title and data.number. Shared by the four doc-*.typ templates and
// payslip.typ.
#let doc-header(data) = {
  let key = data.at("layout", default: "classic")
  if key == "modern" [
    // A left-aligned title (the accent bar is the Modern template's own
    // design item, so every document gets it). The number is in meta-block.
    #text(weight: "bold", size: 16pt, tracking: 0.02em)[#data.title]
    #v(14pt)
  ] else if key == "minimal" [
    #align(right)[
      #text(size: 9pt, tracking: 0.2em, fill: rgb("#6b7280"))[#upper(data.title)]
      #v(2pt)
      #text(weight: "semibold", size: 13pt)[\##data.number]
    ]
    #v(24pt)
  ] else if key == "compact" [
    #align(center, text(weight: "bold", size: 12pt, tracking: 0.04em)[#data.title])
    #v(10pt)
  ] else [
    #align(center, text(weight: "bold", size: 14pt, tracking: 0.04em)[#data.title])
    #v(14pt)
  ]
}
