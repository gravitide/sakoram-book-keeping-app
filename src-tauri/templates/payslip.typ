// Payslip template — single-page A4 with header, employee block, two
// stacked tables (earnings, deductions), big NET PAY card, optional bank
// details and notes, and a two-column sign-off.
//
// Driven by data.json fields produced in app/pages/payslips/[id].vue's
// buildPdfPayload(). Mirrors the look-and-feel of document.typ /
// voucher.typ (logo + red rule + Inter family).

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

#let chosen-font = if "font_family" in data and data.font_family != none { data.font_family } else { "Inter" }
#set text(font: (chosen-font, "Inter", "Inter Tight", "Miriam Libre"), size: 9.5pt, lang: "en", number-width: "tabular")
#set par(leading: 0.55em, spacing: 0.65em)

// ============================================================
// Header: logo or business-name wordmark + theme rule
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
#line(length: 100%, stroke: 2pt + rgb(data.theme_color))

// ============================================================
// Title
// ============================================================
#v(8pt)
#align(center, text(weight: "bold", size: 14pt, tracking: 0.04em)[
  PAY SLIP
])
#v(14pt)

// ============================================================
// Meta block: employee (left) + payslip details (right)
// ============================================================

#let label(t) = text(weight: "bold", size: 8.5pt, tracking: 0.04em)[#upper(t)]
#let faint(t) = text(fill: rgb("#6b7280"), size: 8.5pt)[#t]

#grid(
  columns: (1fr, auto),
  gutter: 24pt,
  // ----- left: employee block
  [
    #label("Employee")
    #v(2pt)
    #text(weight: "semibold")[#data.employee.full_name]
    #if data.employee.designation != none [
      #linebreak()
      #faint(data.employee.designation)
    ]
    #if data.employee.employee_number != none [
      #v(4pt)
      #faint("Employee #: " + data.employee.employee_number)
    ]
    #if data.employee.nic != none [
      #v(4pt)
      #faint("NIC: " + data.employee.nic)
    ]
  ],
  // ----- right: meta rows
  align(right)[
    #grid(
      columns: 1,
      row-gutter: 6pt,
      [
        #label("Payslip #")
        \
        #data.number
      ],
      [
        #label("Pay period")
        \
        #data.period_display
      ],
      [
        #label("Pay date")
        \
        #data.pay_date
      ],
    )
  ],
)

#v(16pt)

// ============================================================
// Earnings + deductions tables
// ============================================================

#let header-cell(s, fill) = table.cell(
  fill: fill,
  inset: 7pt,
  text(weight: "bold", size: 8.5pt, tracking: 0.03em)[#upper(s)]
)

#let body-cell(content, align-h: left) = table.cell(
  inset: 8pt,
  align: align-h + top,
  content
)

#grid(
  columns: (1fr, 1fr),
  column-gutter: 14pt,
  // ===== Earnings =====
  [
    #table(
      columns: (1fr, 30%),
      stroke: 0.5pt + rgb("#e5e7eb"),
      align: (left + top, right + top),

      header-cell("Earnings", rgb("#f0fdf4")),
      header-cell("Amount", rgb("#f0fdf4")),

      ..if data.earnings.len() == 0 {
        (table.cell(colspan: 2, inset: 12pt, align: center, text(fill: rgb("#9ca3af"), size: 9pt)[No earnings]),)
      } else { () },
      ..for line in data.earnings {
        (
          body-cell(line.label),
          body-cell(line.amount_display, align-h: right),
        )
      },

      table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right, text(weight: "bold")[Total earnings]),
      table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right, text(weight: "bold")[#data.formatted.earnings]),
    )
  ],
  // ===== Deductions =====
  [
    #table(
      columns: (1fr, 30%),
      stroke: 0.5pt + rgb("#e5e7eb"),
      align: (left + top, right + top),

      header-cell("Deductions", rgb("#fef2f2")),
      header-cell("Amount", rgb("#fef2f2")),

      ..if data.deductions.len() == 0 {
        (table.cell(colspan: 2, inset: 12pt, align: center, text(fill: rgb("#9ca3af"), size: 9pt)[No deductions]),)
      } else { () },
      ..for line in data.deductions {
        (
          body-cell(line.label),
          body-cell(line.amount_display, align-h: right),
        )
      },

      table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right, text(weight: "bold")[Total deductions]),
      table.cell(fill: rgb("#fafafa"), inset: 7pt, align: right, text(weight: "bold")[#data.formatted.deductions]),
    )
  ],
)

// ============================================================
// Net pay card
// ============================================================
#v(14pt)
#align(right)[
  #box(
    inset: (x: 24pt, y: 12pt),
    fill: rgb("#f3f4f6"),
    radius: 4pt,
    stroke: 0.5pt + rgb("#e5e7eb"),
  )[
    #grid(
      columns: (auto, auto),
      column-gutter: 18pt,
      align: (right + horizon, right + horizon),
      text(fill: rgb("#6b7280"), size: 9.5pt, tracking: 0.04em)[#upper("Net pay")],
      text(weight: "bold", size: 16pt)[#data.currency_symbol #data.formatted.net],
    )
  ]
]

// ============================================================
// Paid / balance — only shown when there are recorded payments
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
      text(fill: rgb("#16a34a"))[#data.currency_symbol #data.paid_display],
      text(weight: "semibold")[Balance due:],
      text(weight: "bold", size: 11pt, fill: rgb("#dc2626"))[#data.currency_symbol #data.balance_display],
    )
  ]
]

// ============================================================
// Bank details (from the employee snapshot)
// ============================================================
#if data.employee.bank_account_number != none and data.employee.bank_account_number != "" [
  #v(14pt)
  #block(breakable: false)[
    #label("Pay to")
    #v(4pt)
    #if data.employee.bank_account_name != none [
      Account name: #text(weight: "semibold")[#data.employee.bank_account_name] \
    ]
    Account no.: #text(weight: "semibold")[#data.employee.bank_account_number] \
    #if data.employee.bank_name != none [
      Bank: #text(weight: "semibold")[
        #data.employee.bank_name#if data.employee.bank_branch != none [, #data.employee.bank_branch]
      ]
    ]
  ]
]

// ============================================================
// Notes
// ============================================================
#if data.notes != none and data.notes != "" [
  #v(14pt)
  #block(breakable: false)[
    #label("Notes")
    \
    #for (i, ln) in data.notes.split("\n").enumerate() [
      #if i > 0 [#linebreak()]
      #ln
    ]
  ]
]

// ============================================================
// Sign-off (two columns)
// ============================================================
// Generous lead-in so the signature lines have actual writing room
// above them on a printed copy.
#v(72pt)
#grid(
  columns: (1fr, 1fr),
  column-gutter: 60pt,
  [
    #line(length: 80%, stroke: 0.5pt + rgb("#9ca3af"))
    #v(2pt)
    #faint("Authorised by")
  ],
  [
    #line(length: 80%, stroke: 0.5pt + rgb("#9ca3af"))
    #v(2pt)
    #faint("Received by (employee)")
  ],
)
