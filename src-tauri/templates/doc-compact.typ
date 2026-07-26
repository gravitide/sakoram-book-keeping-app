// Compact — the Classic layout with tighter margins, smaller type, and
// condensed spacing so long itemised documents fit on fewer pages. The shared
// items table inherits the smaller base font and so renders denser.

#import "common.typ": *

#let data = json("data.json")

#set document(title: data.number, author: data.business_name)
#set page(
  paper: "a4",
  margin: (x: 14mm, top: 12mm, bottom: 12mm),
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
    #v(3pt)
    #align(center, text(size: 7.5pt, fill: rgb("#6b7280"))[#footer-content(data)])
  ],
)
#set text(font: resolve-font(data), size: 8.5pt, lang: "en", number-width: "tabular")
#set par(leading: 0.5em, spacing: 0.5em)

// Header: smaller logo / wordmark, thinner accent rule.
#align(right)[
  #if data.logo_file != none {
    header-logo(data, 9mm)
  } else if data.business_name != none and data.business_name != "" {
    box(height: 9mm)[
      #set align(right + horizon)
      #text(weight: "bold", size: 13pt, tracking: 0.02em)[#data.business_name]
    ]
  } else {
    box(height: 9mm)
  }
]
#v(-1.5mm)
#line(length: 100%, stroke: 1.5pt + rgb(data.theme_color))

// Title
#v(6pt)
#align(center, text(weight: "bold", size: 12pt, tracking: 0.04em)[#data.title])
#v(10pt)

// Party block (left) + meta rows (right)
#grid(
  columns: (1fr, auto),
  gutter: 18pt,
  party-block(data),
  align(right, meta-block(data)),
)

#project-subtitle(data)

#v(9pt)
#items-table(data)
#paid-block(data)
#notes-block(data)
#bank-block(data)
#signoff-block(data)
