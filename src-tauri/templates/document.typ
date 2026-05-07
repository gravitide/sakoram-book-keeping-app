// Unified document template: quotes, invoices, bills.
//
// All three share the same A4 layout (logo + red rule, centered title,
// party block + meta block, optional project subtitle, items table,
// notes, optional bank details, optional sign-off). The JSON drives the
// labels (party_label, primary_label, secondary_label) and toggles the
// optional sections (paid/balance row, bank, prepared_by, etc.).
//
// The Rust side writes a `data.json` file alongside this template (in a
// per-render working dir) and optionally copies the logo as `logo.<ext>`.
// We read both relative to the project root (which Rust sets to that dir).

#let data = json("data.json")

#set document(title: data.number, author: data.business_name)
#set page(
  paper: "a4",
  margin: (x: 18mm, top: 16mm, bottom: 18mm),
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
    #v(4pt)
    #align(center, text(size: 8pt, fill: rgb("#6b7280"))[
      #if data.business_name != none [#data.business_name]
      #if data.website != none [ | #data.website]
      #if data.phone != none [ | #data.phone]
      #if data.address_line1 != none [
        | #data.address_line1#if data.city != none [, #data.city]
      ]
    ])
  ],
)

// Font cascade: Google Sans Flex is bundled with the app, so it's always
// available. Miriam Libre is kept as a fallback so existing renders that
// expected it still resolve, and Inter is a soft fallback for any glyph
// the others lack. We deliberately don't list Linux-only fonts here —
// they generate noise warnings on Windows.
#set text(font: ("Google Sans Flex", "Miriam Libre", "Inter"), size: 9.5pt, lang: "en")
#set par(leading: 0.55em, spacing: 0.65em)

// ============================================================
// Header: logo top-right, red rule below
// ============================================================
#align(right)[
  #if data.logo_file != none {
    image(data.logo_file, height: 12mm)
  } else {
    box(height: 12mm)
  }
]
#v(-2mm)
#line(length: 100%, stroke: 2pt + rgb(data.theme_color))

// ============================================================
// Title
// ============================================================
#v(8pt)
#align(center, text(weight: "bold", size: 14pt, tracking: 0.04em)[
  #data.title
])
#v(14pt)

// ============================================================
// Meta block: party block (left) + doc meta rows (right)
// ============================================================

#let label(t) = text(weight: "bold", size: 8.5pt, tracking: 0.04em)[#upper(t)]
#let faint(t) = text(fill: rgb("#6b7280"), size: 8.5pt)[#t]

#grid(
  columns: (1fr, auto),
  gutter: 24pt,
  // ----- left: party block (client / vendor)
  [
    #label(data.party_label)
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
  ],
  // ----- right: meta rows
  align(right)[
    #grid(
      columns: 1,
      row-gutter: 6pt,
      [
        #label(data.primary_label) \
        \##data.number
      ],
      [
        #label(data.date_label) \
        #data.date_value
      ],
      ..if data.secondary_label != none {
        (
          [
            #label(data.secondary_label) \
            #data.secondary_value
          ],
        )
      } else { () },
      ..if data.vendor_invoice_label != none {
        (
          [
            #label(data.vendor_invoice_label) \
            #data.vendor_invoice_value
          ],
        )
      } else { () },
    )
  ],
)

// ============================================================
// Project subtitle (centered, bold)
// ============================================================
#if data.project_title != none and data.project_title != "" [
  #v(14pt)
  #align(center, text(weight: "bold", size: 11pt)[#data.project_title])
]

#v(12pt)

// ============================================================
// Items table — bundle vs itemized layouts
// ============================================================

#let header-cell(s) = table.cell(
  fill: rgb("#fafafa"),
  inset: 7pt,
  text(weight: "bold", size: 8.5pt, tracking: 0.03em)[#upper(s)]
)

#let body-cell(content, align-h: left) = table.cell(
  inset: 8pt,
  align: align-h + top,
  content
)

#if data.pricing_mode == "bundle" [
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

    // Totals — only show subtotal/VAT when VAT > 0
    ..if data.has_vat {(
      table.cell(colspan: 2, fill: rgb("#fafafa"), inset: 7pt, align: right)[Subtotal],
      table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right, text(weight: "regular")[#data.formatted.subtotal]),
      table.cell(colspan: 2, fill: rgb("#fafafa"), inset: 7pt, align: right)[VAT],
      table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right, text(weight: "regular")[#data.formatted.tax]),
    )} else {()},

    table.cell(
      colspan: 2,
      fill: rgb("#f3f4f6"),
      inset: 9pt,
    )[],
    table.cell(
      fill: rgb("#f3f4f6"),
      inset: 9pt,
      align: right,
      text(weight: "bold", size: 11pt)[LKR #data.formatted.total]
    ),
  )
] else [
  // Itemized table
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

    // Totals
    table.cell(colspan: cols.len() - 1, fill: rgb("#fafafa"), inset: 7pt, align: right)[Subtotal],
    table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right)[#data.formatted.subtotal_no_symbol],
    ..if data.has_vat {(
      table.cell(colspan: cols.len() - 1, fill: rgb("#fafafa"), inset: 7pt, align: right)[VAT],
      table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right)[#data.formatted.tax_no_symbol],
    )} else {()},
    table.cell(colspan: cols.len() - 1, fill: rgb("#f3f4f6"), inset: 9pt, align: right)[],
    table.cell(fill: rgb("#f3f4f6"), inset: 9pt, align: right, text(weight: "bold", size: 11pt)[LKR #data.formatted.total_no_symbol]),
  )
]

// ============================================================
// Paid / balance-due block (only when paid > 0)
// ============================================================
#if data.paid_cents != none and data.paid_cents > 0 [
  #v(8pt)
  #align(right)[
    #grid(
      columns: (auto, auto),
      column-gutter: 16pt,
      row-gutter: 4pt,
      align: (right, right),
      text(fill: rgb("#6b7280"))[Paid:],
      text(fill: rgb("#16a34a"))[LKR #data.paid_display],
      text(weight: "semibold")[Balance due:],
      text(weight: "bold", size: 11pt, fill: rgb("#dc2626"))[LKR #data.balance_display],
    )
  ]
]

// ============================================================
// Notes
// ============================================================
#if data.notes != none and data.notes != "" [
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

// ============================================================
// Bank details (from the snapshot taken at issue time)
// ============================================================
#if data.bank != none [
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

// ============================================================
// Sign-off (right-aligned)
// ============================================================
#if data.prepared_by != none and data.prepared_by != "" [
  #v(28pt)
  #align(right)[
    #text(weight: "bold")[Prepared by] \
    #text(fill: rgb("#4b5563"))[#data.prepared_by]
  ]
]
