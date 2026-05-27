// Customer statement template — printable "you owe us this much" PDF.
//
// Renders a snapshot of every outstanding invoice for one client, with
// per-row balance + days overdue + an aging summary across the top. Not
// a document the business issues numbered + immutable like an invoice;
// it's a point-in-time report, generated on demand from current data.
//
// The Rust side writes `data.json` alongside this template in a
// per-render working dir and optionally copies the logo as
// `logo.<ext>`. Both are read relative to the project root which Rust
// sets to that working dir.

#let data = json("data.json")

#set document(title: data.title, author: data.business_name)
#set page(
  paper: "a4",
  margin: (x: 18mm, top: 16mm, bottom: 20mm),
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
    #v(4pt)
    #grid(
      columns: (1fr, auto),
      align(left, text(size: 8pt, fill: rgb("#6b7280"))[
        #if data.business_name != none [#data.business_name]
        #if data.website != none [ | #data.website]
        #if data.phone != none [ | #data.phone]
      ]),
      align(right, text(size: 8pt, fill: rgb("#6b7280"))[
        Page #context counter(page).display() of #context counter(page).final().first()
      ]),
    )
  ],
)

// Font cascade same as document.typ — user pick first, bundled
// fallbacks after.
#let chosen-font = if "font_family" in data and data.font_family != none { data.font_family } else { "Akt" }
#set text(font: (chosen-font, "Inter", "Inter Tight", "Miriam Libre"), size: 9.5pt, lang: "en", number-width: "tabular")
#set par(leading: 0.55em, spacing: 0.65em)

#let theme = rgb(data.theme_color)
#let muted = rgb("#6b7280")
#let dim = rgb("#9ca3af")
#let line-color = rgb("#e5e7eb")
#let row-alt = rgb("#f9fafb")
#let success-color = rgb("#16a34a")
#let error-color = rgb("#dc2626")
#let warning-color = rgb("#d97706")

// ============================================================
// Header: logo (or wordmark) + theme rule
// ============================================================
#align(right)[
  #if data.logo_file != none {
    image(data.logo_file, height: 12mm)
  } else if data.business_name != none and data.business_name != "" {
    box(height: 12mm)[
      #set align(right + horizon)
      #text(weight: "bold", size: 16pt, tracking: 0.02em)[#data.business_name]
    ]
  } else {
    box(height: 12mm)
  }
]
#v(-2mm)
#line(length: 100%, stroke: 2pt + theme)

// ============================================================
// Title row
// ============================================================
#v(10pt)
#grid(
  columns: (1fr, auto),
  align(left)[
    #text(weight: "bold", size: 20pt, tracking: 0.04em)[STATEMENT OF ACCOUNT]
    #v(2pt)
    #text(size: 9.5pt, fill: muted)[As of #data.as_of_date]
  ],
  align(right)[
    #text(size: 8pt, fill: muted, tracking: 0.05em)[OUTSTANDING BALANCE]
    #v(2pt)
    #text(weight: "bold", size: 18pt, fill: error-color)[#data.total_balance]
    #v(2pt)
    #text(size: 8.5pt, fill: muted)[
      #data.invoice_count invoice#if data.invoice_count != 1 [s] outstanding
    ]
  ],
)

#v(14pt)

// ============================================================
// Two-column party block: business (left), client (right)
// ============================================================
#grid(
  columns: (1fr, 1fr),
  column-gutter: 14pt,
  // FROM block
  block(
    fill: rgb("#f9fafb"),
    stroke: 0.5pt + line-color,
    radius: 4pt,
    inset: (x: 10pt, y: 10pt),
    width: 100%,
  )[
    #text(size: 8pt, fill: muted, tracking: 0.05em)[FROM]
    #v(4pt)
    #text(weight: "bold", size: 10.5pt)[#data.business_name]
    #if data.business_address != none [
      #v(2pt)
      #text(size: 9pt, fill: muted)[#data.business_address]
    ]
    #if data.business_tax_id != none [
      #v(2pt)
      #text(size: 8.5pt, fill: muted)[Tax ID: #data.business_tax_id]
    ]
    #if data.business_phone != none [
      #v(2pt)
      #text(size: 8.5pt, fill: muted)[Phone: #data.business_phone]
    ]
  ],
  // TO block
  block(
    fill: theme.lighten(92%),
    stroke: 0.5pt + theme.lighten(60%),
    radius: 4pt,
    inset: (x: 10pt, y: 10pt),
    width: 100%,
  )[
    #text(size: 8pt, fill: muted, tracking: 0.05em)[STATEMENT FOR]
    #v(4pt)
    #text(weight: "bold", size: 10.5pt)[#data.client_name]
    #if data.client_address != none [
      #v(2pt)
      #text(size: 9pt, fill: muted)[#data.client_address]
    ]
    #if data.client_tax_id != none [
      #v(2pt)
      #text(size: 8.5pt, fill: muted)[Tax ID: #data.client_tax_id]
    ]
    #if data.client_email != none [
      #v(2pt)
      #text(size: 8.5pt, fill: muted)[#data.client_email]
    ]
  ],
)

#v(14pt)

// ============================================================
// Aging summary — five buckets across the top
// ============================================================

#let bucket-tile(b) = block(
  fill: rgb("#f9fafb"),
  stroke: 0.5pt + line-color,
  radius: 4pt,
  inset: (x: 8pt, y: 8pt),
  width: 100%,
)[
  #text(size: 7.5pt, fill: muted, tracking: 0.05em)[#upper(b.label)]
  #v(3pt)
  #let value-color = if b.tone == "error" { error-color } else if b.tone == "warning" { warning-color } else if b.tone == "success" { success-color } else { rgb("#111827") }
  #text(size: 11pt, weight: "bold", fill: value-color)[#b.amount]
  #v(1pt)
  #text(size: 7.5pt, fill: muted)[#b.count inv]
]

#grid(
  columns: (1fr, 1fr, 1fr, 1fr, 1fr),
  column-gutter: 6pt,
  ..data.aging_buckets.map(bucket-tile)
)

#v(14pt)

// ============================================================
// Invoice table — # / Issue / Due / Total / Paid / Balance / Overdue
// ============================================================

#let label(t) = text(weight: "bold", size: 8pt, tracking: 0.04em)[#upper(t)]

#text(weight: "bold", size: 11pt)[Outstanding invoices]
#v(4pt)

#table(
  columns: (auto, auto, auto, 1fr, 1fr, 1fr, auto),
  align: (left, left, left, right, right, right, right),
  stroke: 0.4pt + line-color,
  inset: (x: 4pt, y: 5pt),
  table.header(
    table.cell(fill: rgb("#f3f4f6"))[#label("Invoice")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Issued")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Due")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Total")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Paid")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Balance")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Status")],
  ),
  ..data.rows.enumerate().map(((i, row)) => {
    let bg = if calc.rem(i, 2) == 0 { white } else { row-alt }
    let status-color = if row.tone == "error" { error-color } else if row.tone == "warning" { warning-color } else { muted }
    (
      table.cell(fill: bg)[#text(size: 8.5pt, weight: "medium")[#row.number]],
      table.cell(fill: bg)[#text(size: 8.5pt)[#row.issue_date]],
      table.cell(fill: bg)[#text(size: 8.5pt)[#row.due_date]],
      table.cell(fill: bg)[#text(size: 8.5pt)[#row.total]],
      table.cell(fill: bg)[#text(size: 8.5pt, fill: muted)[#row.paid]],
      table.cell(fill: bg)[#text(size: 9pt, weight: "medium")[#row.balance]],
      table.cell(fill: bg)[#text(size: 8pt, fill: status-color)[#row.status]],
    )
  }).flatten(),
  // Totals row in primary tone.
  table.cell(fill: theme.lighten(85%), colspan: 3)[#text(weight: "bold", size: 9.5pt)[Total outstanding]],
  table.cell(fill: theme.lighten(85%))[#text(weight: "bold", size: 9pt)[#data.totals_row.total]],
  table.cell(fill: theme.lighten(85%))[#text(weight: "bold", size: 9pt)[#data.totals_row.paid]],
  table.cell(fill: theme.lighten(85%))[#text(weight: "bold", size: 10pt, fill: error-color)[#data.totals_row.balance]],
  table.cell(fill: theme.lighten(85%))[],
)

#v(14pt)

// ============================================================
// Optional bank details + payment instructions
// ============================================================

#if data.bank_block != none [
  #block(
    fill: rgb("#f9fafb"),
    stroke: 0.5pt + line-color,
    radius: 4pt,
    inset: (x: 10pt, y: 10pt),
    width: 100%,
  )[
    #text(size: 8pt, fill: muted, tracking: 0.05em)[PAYMENT DETAILS]
    #v(4pt)
    #grid(
      columns: (auto, 1fr),
      column-gutter: 12pt,
      row-gutter: 3pt,
      ..data.bank_block.map(line => (
        text(size: 8.5pt, fill: muted)[#line.label],
        text(size: 9pt)[#line.value],
      )).flatten()
    )
  ]
  #v(10pt)
]

// ============================================================
// Notes / disclaimer
// ============================================================

#if data.notes != none and data.notes != "" [
  #text(size: 8.5pt, fill: muted)[#data.notes]
]
