// Compact — the Classic layout with tighter margins, smaller type, and
// condensed spacing so long itemised documents fit on fewer pages. The shared
// items table inherits the smaller base font and so renders denser.

#import "common.typ": *

#let data = json("data.json")

#set document(title: data.number, author: if data.business_name != none { data.business_name } else { () })
#set page(..page-setup(data))
#set text(font: resolve-font(data), size: 8.5pt, lang: "en", number-width: "tabular")
#set par(leading: 0.5em, spacing: 0.5em)

// Header + title — see doc-header in common.typ.
#doc-header(data)

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
