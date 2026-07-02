// Shared building blocks for the client-facing document templates
// (doc-classic / doc-modern / doc-minimal / doc-compact / doc-letterhead).
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

// Font cascade: the user's chosen PDF font first, bundled fallbacks after so
// any missing glyph still resolves. Returns the tuple for `#set text(font:)`.
#let resolve-font(data) = {
  let chosen = if "font_family" in data and data.font_family != none { data.font_family } else { "Akt" }
  (chosen, "Inter", "Inter Tight", "Miriam Libre")
}

// Footer line content (business name | website | phone | address). The page
// `footer:` in each template wraps this with its own rule / alignment.
#let footer-content(data) = [
  #if data.business_name != none [#data.business_name]
  #if data.website != none [ | #data.website]
  #if data.phone != none [ | #data.phone]
  #if data.address_line1 != none [
    | #data.address_line1#if data.city != none [, #data.city]
  ]
]

// --- party block (client / vendor) -------------------------------------
#let party-block(data) = [
  #lbl(data.party_label)
  #v(2pt)
  #text(weight: "semibold")[#data.party.name],
  #for ln in data.party.address_lines [
    #linebreak()
    #ln#if ln == data.party.address_lines.last() [.] else [,]
  ]
  #if data.party.tax_id != none [
    #v(4pt)
    #faint("Tax ID: " + data.party.tax_id)
  ]
]

// --- meta block (number / date / secondary date / vendor invoice #) -----
// Returns the right-aligned grid; templates wrap it (e.g. `align(right, …)`).
#let meta-block(data) = grid(
  columns: (auto, auto),
  column-gutter: 24pt,
  row-gutter: 12pt,
  align: right,
  grid.cell(colspan: 2)[
    #lbl(data.primary_label) \
    \##data.number
  ],
  [
    #lbl(data.date_label) \
    #data.date_value
  ],
  if data.secondary_label != none [
    #lbl(data.secondary_label) \
    #data.secondary_value
  ] else [],
  ..if data.vendor_invoice_label != none {
    (
      grid.cell(colspan: 2)[
        #lbl(data.vendor_invoice_label) \
        #data.vendor_invoice_value
      ],
    )
  } else { () },
)

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
    #table(
      columns: (24%, 1fr, 22%),
      stroke: 0.5pt + rgb("#e5e7eb"),
      align: (left + top, left + top, right + top),

      header-cell("Item"),
      header-cell("Description"),
      header-cell("Amount"),

      ..for line in data.lines {
        (
          body-cell(line.item_label),
          body-cell([
            #for (i, part) in line.description.split("\n").enumerate() [
              #if i > 0 [#linebreak()]
              #part
            ]
          ]),
          body-cell([], align-h: right),
        )
      },

      ..if data.has_vat {(
        table.cell(colspan: 2, fill: rgb("#fafafa"), inset: 7pt, align: right)[Subtotal],
        table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right, text(weight: "regular")[#data.formatted.subtotal]),
        table.cell(colspan: 2, fill: rgb("#fafafa"), inset: 7pt, align: right)[VAT],
        table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right, text(weight: "regular")[#data.formatted.tax]),
      )} else {()},

      table.cell(
        colspan: 3,
        fill: rgb("#f3f4f6"),
        inset: 9pt,
        align: right,
        text(weight: "bold", size: 11pt)[#data.currency_symbol #data.formatted.total]
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

// --- paid / balance-due block (only when paid > 0) ---------------------
#let paid-block(data) = if data.paid_cents != none and data.paid_cents > 0 [
  #v(8pt)
  #align(right)[
    #grid(
      columns: (auto, auto),
      column-gutter: 16pt,
      row-gutter: 4pt,
      align: (right, right),
      text(fill: rgb("#6b7280"))[Paid:],
      text(fill: rgb("#16a34a"))[#data.currency_symbol #data.paid_display],
      text(weight: "semibold")[Balance due:],
      text(weight: "bold", size: 11pt, fill: rgb("#dc2626"))[#data.currency_symbol #data.balance_display],
    )
  ]
]

// --- notes -------------------------------------------------------------
#let notes-block(data) = if data.notes != none and data.notes != "" [
  #v(14pt)
  #block(breakable: false)[
    #text(weight: "bold")[NOTES:] \
    #for (i, para) in data.notes_paragraphs.enumerate() [
      #if i > 0 [#v(8pt)]
      #for (j, ln) in para.split("\n").enumerate() [
        #if j > 0 [#linebreak()]
        #ln
      ]
    ]
  ]
]

// --- company footer notes (fine print appended to every quote/invoice) --
// The per-business note from Settings -> Quotes & invoices. Read with a
// default so templates shared with bills (no footer setting) don't error on
// a missing key — they just render nothing.
#let footer-notes-block(data) = {
  let notes = data.at("footer_notes", default: "")
  if notes != none and notes != "" [
    #v(12pt)
    #block(breakable: false)[
      #text(fill: rgb("#6b7280"), size: 9pt)[
        #for (j, ln) in notes.split("\n").enumerate() [
          #if j > 0 [#linebreak()]
          #ln
        ]
      ]
    ]
  ]
}

// --- bank details (from the snapshot frozen at issue time) -------------
#let bank-block(data) = if data.bank != none [
  #v(10pt)
  #block(breakable: false)[
    #if data.bank.bank_account_number != none [
      Account Number: #text(weight: "semibold")[#data.bank.bank_account_number] \
    ]
    #if data.bank.bank_account_name != none [
      Account Name: #text(weight: "semibold")[#data.bank.bank_account_name] \
    ]
    #if data.bank.bank_name != none [
      BANK: #text(weight: "semibold")[
        #data.bank.bank_name#if data.bank.bank_branch != none [, #data.bank.bank_branch]
      ]
    ]
  ]
]

// --- sign-off (right-aligned) ------------------------------------------
#let signoff-block(data) = if data.prepared_by != none and data.prepared_by != "" [
  #v(28pt)
  #align(right)[
    #text(weight: "bold")[Prepared by] \
    #text(fill: rgb("#4b5563"))[#data.prepared_by]
  ]
]
