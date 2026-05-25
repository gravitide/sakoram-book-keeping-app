// Unified report template: P&L, VAT (and future Tier 1 reports).
//
// Layout is the same shape every report uses:
//
//   Header (logo + red rule)
//   Title + period subtitle
//   Three-up KPI summary tiles
//   Breakdown table (line / amount / percent + totals row)
//   Optional detail sections (one table per source — invoices / bills /
//   payslips for P&L; invoices / bills for VAT)
//
// The Rust side writes `data.json` alongside this template (in a
// per-render working dir) and optionally copies the logo as
// `logo.<ext>`. We read both relative to the project root which Rust
// sets to that dir.

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

// ============================================================
// Header: logo (or wordmark) + red rule
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
// Title + period subtitle
// ============================================================
#v(8pt)
#align(center)[
  #text(weight: "bold", size: 16pt, tracking: 0.04em)[#data.title]
  #v(4pt)
  #if "subtitle" in data and data.subtitle != none [
    #text(size: 9.5pt, fill: muted)[#data.subtitle]
    #v(2pt)
  ]
  #text(size: 10pt, fill: muted)[#data.period_label]
  #if "generated_at" in data and data.generated_at != none [
    #v(2pt)
    #text(size: 8pt, fill: dim)[Generated #data.generated_at]
  ]
]
#v(14pt)

// ============================================================
// Three-up KPI summary tiles
// ============================================================

#let tone-color(tone) = {
  if tone == "success" { success-color }
  else if tone == "error" { error-color }
  else { rgb("#111827") }
}

#let kpi-tile(item) = box(
  fill: rgb("#f9fafb"),
  stroke: 0.5pt + line-color,
  radius: 4pt,
  inset: (x: 10pt, y: 10pt),
  width: 100%,
)[
  #text(size: 8pt, fill: muted, tracking: 0.05em)[#upper(item.label)]
  #v(4pt)
  #text(size: 14pt, weight: "bold", fill: tone-color(item.tone))[#item.value]
  #if "sub" in item and item.sub != none [
    #v(2pt)
    #text(size: 8.5pt, fill: muted)[#item.sub]
  ]
]

#grid(
  columns: (1fr, 1fr, 1fr),
  column-gutter: 10pt,
  ..data.summary.map(kpi-tile)
)

#v(14pt)

// ============================================================
// Breakdown table
// ============================================================

#let label(t) = text(weight: "bold", size: 8.5pt, tracking: 0.04em)[#upper(t)]

#if "breakdown" in data and data.breakdown != none [
  #text(weight: "bold", size: 11pt)[#data.breakdown.title]
  #v(4pt)
  #table(
    columns: (1fr, auto, auto),
    align: (left, right, right),
    stroke: none,
    table.header(
      table.cell(fill: rgb("#f3f4f6"))[#label("Line")],
      table.cell(fill: rgb("#f3f4f6"))[#label("Amount")],
      table.cell(fill: rgb("#f3f4f6"))[#label("% of base")],
    ),
    ..data.breakdown.rows.enumerate().map(((i, row)) => {
      let bg = if calc.rem(i, 2) == 0 { white } else { row-alt }
      (
        table.cell(fill: bg)[
          #text(size: 9pt)[#row.label]
          #if "sublabel" in row and row.sublabel != none [
            #linebreak()
            #text(size: 8pt, fill: muted)[#row.sublabel]
          ]
        ],
        table.cell(fill: bg)[
          #text(size: 9.5pt, fill: tone-color(row.tone), weight: "medium")[#row.amount]
        ],
        table.cell(fill: bg)[
          #text(size: 9pt, fill: muted)[#row.percent]
        ],
      )
    }).flatten(),
    // Totals row sits at the bottom in primary tone.
    table.cell(fill: theme.lighten(85%))[#text(weight: "bold", size: 10pt)[#data.breakdown.total.label]],
    table.cell(fill: theme.lighten(85%))[#text(weight: "bold", size: 10.5pt, fill: tone-color(data.breakdown.total.tone))[#data.breakdown.total.amount]],
    table.cell(fill: theme.lighten(85%))[#text(weight: "bold", size: 9pt, fill: tone-color(data.breakdown.total.tone))[#data.breakdown.total.percent]],
  )
  #v(14pt)
]

// ============================================================
// Detail sections (optional)
// ============================================================

#if "details" in data and data.details != none {
  for section in data.details {
    // Page-break before each detail section so the report's printed
    // summary lives on its own page — easier to file separately.
    pagebreak()

    text(weight: "bold", size: 11pt)[#section.title]
    v(4pt)

    let columns = section.columns
    let col-count = columns.len()
    // Build column-width tuple: first column auto, last 1-2 columns
    // right-aligned amounts, middle columns flex.
    let col-widths = if col-count == 7 {
      // Client / Current / 1-30 / 31-60 / 61-90 / 90+ / Total
      // (Aged receivables per-client table). Explicit mm widths so
      // the Client column doesn't get squeezed to nothing on
      // portrait A4 — six amount columns + a readable name don't
      // fit if everything claims its natural width. Currency prefix
      // is stripped from per-cell amounts (see report-pdf.ts) so
      // 18mm holds "1,368,800.00" at 8pt comfortably.
      (1fr, 18mm, 18mm, 18mm, 18mm, 18mm, 22mm)
    } else if col-count == 5 {
      // Number / Date / Party / Subtotal / Tax (VAT report)
      (auto, auto, 1fr, auto, auto)
    } else if col-count == 4 {
      // Number / Date / Party / Amount (P&L report)
      (auto, auto, 1fr, auto)
    } else {
      // Fallback — auto everywhere
      (..columns.map(_ => auto))
    }
    // Per-column alignment: aged receivables right-aligns every column
    // after the client name; other tables right-align just the last two
    // (amount columns).
    let col-aligns = (..columns.enumerate().map(((i, _)) => {
      if col-count == 7 {
        if i == 0 { left } else { right }
      } else if i >= col-count - 2 and col-count >= 4 {
        right
      } else {
        left
      }
    }))

    // Wider 7-col aged-receivables table drops to 8pt so amount cells
    // fit on one line without forcing the Client column into the
    // gutter. Other detail tables stay at 9pt.
    let cell-size = if col-count == 7 { 8pt } else { 9pt }

    table(
      columns: col-widths,
      align: col-aligns,
      stroke: none,
      inset: (x: 4pt, y: 5pt),
      table.header(
        ..columns.map(c => table.cell(fill: rgb("#f3f4f6"))[#label(c)])
      ),
      ..section.rows.enumerate().map(((i, row)) => {
        let bg = if calc.rem(i, 2) == 0 { white } else { row-alt }
        row.map(cell => table.cell(fill: bg)[#text(size: cell-size)[#cell]])
      }).flatten()
    )
  }
}
