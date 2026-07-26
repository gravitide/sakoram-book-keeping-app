// Payslip template — single-page A4 with header, employee block, two
// stacked tables (earnings, deductions), big NET PAY card, optional bank
// details and notes, and an optional two-column sign-off.
//
// Driven by data.json fields produced by app/lib/payslip-pdf.ts. Page setup
// and the header come from common.typ so the payslip honours the user's
// selected PDF template (migration 0050) exactly as quotes/invoices do.

#import "common.typ": *

#let data = json("data.json")
#let cfg = template-config(data)

#set document(title: data.number, author: data.business_name)
#set page(paper: "a4", margin: cfg.margin, footer: cfg.footer)
#set text(font: resolve-font(data), size: cfg.text-size, lang: "en", number-width: "tabular")
#set par(leading: cfg.leading, spacing: cfg.spacing)

// ============================================================
// Header + title (per the selected template)
// ============================================================
#doc-header(data)

// ============================================================
// Meta block: employee (left) + payslip details (right)
// ============================================================

#grid(
  columns: (1fr, auto),
  gutter: 24pt,
  // ----- left: employee block
  [
    #lbl("Employee")
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
  // 12pt row-gutter (was 6pt) so each label/value pair has a clear
  // break before the next — matches the same change on document.typ.
  align(right)[
    #grid(
      columns: 1,
      row-gutter: 12pt,
      [
        #lbl("Payslip #")
        \
        #data.number
      ],
      [
        #lbl("Pay period")
        \
        #data.period_display
      ],
      [
        #lbl("Pay date")
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
// Employer contributions (not deducted from net)
// ============================================================
#if data.statutory_enabled == true and (data.epf_employer_display != none or data.etf_display != none) [
  #v(14pt)
  #block(breakable: false)[
    #lbl("Employer contributions (not deducted)")
    #v(4pt)
    #grid(
      columns: (auto, auto),
      column-gutter: 16pt,
      row-gutter: 4pt,
      align: (left, right),
      ..if data.epf_employer_display != none { (faint("EPF (employer)"), [#data.currency_symbol #data.epf_employer_display]) } else { () },
      ..if data.etf_display != none { (faint("ETF (employer)"), [#data.currency_symbol #data.etf_display]) } else { () },
      text(weight: "semibold")[Total cost of employment],
      text(weight: "bold")[#data.currency_symbol #data.total_cost_display],
    )
  ]
]

// ============================================================
// Bank details (from the employee snapshot)
// ============================================================
#if data.employee.bank_account_number != none and data.employee.bank_account_number != "" [
  #v(14pt)
  #block(breakable: false)[
    #lbl("Pay to")
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
    #lbl("Notes")
    \
    #for (i, ln) in data.notes.split("\n").enumerate() [
      #if i > 0 [#linebreak()]
      #ln
    ]
  ]
]

// ============================================================
// Sign-off (two columns) — opt-in
// ============================================================
// Off by default, driven by company_settings.payslip_show_signatures
// (migration 0049). The 72pt lead-in sits INSIDE the conditional on
// purpose: with signatures off the page should end after the notes
// block rather than trailing an inch of whitespace.
#if data.show_signatures == true [
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
]
