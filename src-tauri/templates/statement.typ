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

// SELECTIVE import (a wildcard would shadow this file's local label/faint).
// The letterhead, footer and page number are the business's page design,
// drawn behind the content by page-setup (common.typ design-items).
#import "common.typ": page-setup

#let data = json("data.json")

#set document(title: data.title, author: if data.business_name != none { data.business_name } else { () })
// Portrait, like every document: the page design is laid out on a portrait
// sheet. The 7-column invoice table is sized to fit it.
#set page(..page-setup(data))

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
// The logo and letterhead rule are the page design's (common.typ design-items).

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
// Two-column party block: business (left, Built-in only), client (right)
// ============================================================
#grid(
  columns: (1fr, 1fr),
  column-gutter: 14pt,
  // No FROM block: the business's identity is the page design's.
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

// Width-adaptive parts (tiles + invoice table) only exist off landscape: a
// landscape page (Built-in) is always wide, and keeping it on the original
// code path keeps its output byte-identical. A portrait page (any other
// Stationery) checks its own Safe area: A4 / Letter / Legal still get the
// wide forms; an A5 Safe area (~110 mm) gets the narrow ones.
#let narrow-below = 140mm
// The Safe area's width from the sheet in context and the Stationery's own
// side margins (every portrait statement has them). Not layout(): its
// content can't break across pages, so the table would jump to page 2.
#let adaptive(body) = context {
  let m = data.page.margins
  body(page.width - (m.left + m.right) * 1mm < narrow-below)
}

// Narrow: three tiles a row, so a six-figure bucket still fits its tile.
#adaptive(narrow => grid(
  columns: if narrow { (1fr, 1fr, 1fr) } else { (1fr, 1fr, 1fr, 1fr, 1fr) },
  column-gutter: 6pt,
  row-gutter: 6pt,
  ..data.aging_buckets.map(bucket-tile)
))

#v(14pt)

// ============================================================
// Invoice table — # / Issue / Due / Total / Paid / Balance / Overdue
// ============================================================

#let label(t) = text(weight: "bold", size: 8pt, tracking: 0.04em)[#upper(t)]

// The heading travels with the table (sticky), so a table pushed onto the
// next page doesn't leave it stranded at the foot of this one.
#block(sticky: true, below: 4pt + 0.65em)[#text(weight: "bold", size: 11pt)[Outstanding invoices]]

#let wide-table() = table(
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

// Narrow (an A5 portrait Safe area): seven columns don't fit, so each row
// folds into four — the invoice number carries its status beneath it, the
// due date its issue date — and the amounts keep their natural width.
#let narrow-table() = table(
  columns: (1fr, auto, auto, auto, auto),
  align: (left, left, right, right, right),
  stroke: 0.4pt + line-color,
  inset: (x: 4pt, y: 5pt),
  table.header(
    table.cell(fill: rgb("#f3f4f6"))[#label("Invoice")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Due")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Total")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Paid")],
    table.cell(fill: rgb("#f3f4f6"))[#label("Balance")],
  ),
  ..data.rows.enumerate().map(((i, row)) => {
    let bg = if calc.rem(i, 2) == 0 { white } else { row-alt }
    let status-color = if row.tone == "error" { error-color } else if row.tone == "warning" { warning-color } else { muted }
    (
      table.cell(fill: bg)[
        #text(size: 8.5pt, weight: "medium")[#row.number]
        #linebreak()
        #text(size: 7.5pt, fill: status-color)[#row.status]
      ],
      table.cell(fill: bg)[
        #text(size: 8.5pt)[#row.due_date]
        #linebreak()
        #text(size: 7.5pt, fill: muted)[Issued #row.issue_date]
      ],
      table.cell(fill: bg)[#text(size: 8.5pt)[#row.total]],
      table.cell(fill: bg)[#text(size: 8.5pt, fill: muted)[#row.paid]],
      table.cell(fill: bg)[#text(size: 9pt, weight: "medium")[#row.balance]],
    )
  }).flatten(),
  table.cell(fill: theme.lighten(85%), colspan: 2)[#text(weight: "bold", size: 9.5pt)[Total outstanding]],
  table.cell(fill: theme.lighten(85%))[#text(weight: "bold", size: 9pt)[#data.totals_row.total]],
  table.cell(fill: theme.lighten(85%))[#text(weight: "bold", size: 9pt)[#data.totals_row.paid]],
  table.cell(fill: theme.lighten(85%))[#text(weight: "bold", size: 10pt, fill: error-color)[#data.totals_row.balance]],
)

#adaptive(narrow => if narrow { narrow-table() } else { wide-table() })

// Unapplied credit notes — credits issued to this client that aren't
// tied to any invoice above. Deducted below the table rather than
// inside it, because they belong to no row. Both fields are null
// unless such a credit exists, so this whole block is skipped on the
// ordinary statement and the layout is byte-identical to before.
#if data.unapplied_credit != none [
  #v(8pt)
  #align(right)[
    #block(width: 60%)[
      #grid(
        columns: (1fr, auto),
        row-gutter: 4pt,
        // Without this the label butts straight into the amount —
        // "Amount dueRs 8,500.00".
        column-gutter: 12pt,
        [#text(size: 9pt)[Invoice balances]],
        [#text(size: 9pt)[#data.gross_balance]],
        [#text(size: 9pt)[Unapplied credit notes]],
        [#text(size: 9pt, fill: error-color)[− #data.unapplied_credit]],
        grid.cell(colspan: 2)[#line(length: 100%, stroke: 0.5pt + line-color)],
        [#text(weight: "bold", size: 10pt)[Amount due]],
        [#text(weight: "bold", size: 11pt, fill: error-color)[#data.total_balance]],
      )
    ]
  ]
]

#v(14pt)

// ============================================================
// Optional bank details + payment instructions
// ============================================================

#if data.bank_block != none [
  // breakable: false keeps the whole card on one page — bank +
  // branch + account name + account number must be readable
  // together for the recipient to actually pay. Without this the
  // card would split at whatever line the page floor lands on
  // (typically Bank/Branch on page 1, account number on page 2).
  #block(
    fill: rgb("#f9fafb"),
    stroke: 0.5pt + line-color,
    radius: 4pt,
    inset: (x: 10pt, y: 10pt),
    width: 100%,
    breakable: false,
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
