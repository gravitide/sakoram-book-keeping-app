// Minimal — understated and airy: a light business wordmark, the document
// title as small tracked uppercase, no rules or header fills, generous
// whitespace. Reads cleanly in black & white. The shared items table still
// carries its subtle row fills (kept for legibility).

#import "common.typ": *

#let data = json("data.json")

#set document(title: data.number, author: if data.business_name != none { data.business_name } else { () })
#set page(
  paper: "a4",
  margin: (x: 22mm, top: 22mm, bottom: 22mm),
  footer: align(center, text(size: 8pt, fill: rgb("#9ca3af"))[#footer-content(data)]),
)
#set text(font: resolve-font(data), size: 9pt, lang: "en", number-width: "tabular")
#set par(leading: 0.62em, spacing: 0.72em)

// Header + title — see doc-header in common.typ.
#doc-header(data)

// Party block (left) + meta rows (right)
#grid(
  columns: (1fr, auto),
  gutter: 24pt,
  party-block(data),
  align(right, meta-block(data)),
)

#project-subtitle(data)

#v(16pt)
#items-table(data)
#paid-block(data)
#notes-block(data)
#bank-block(data)
#signoff-block(data)
