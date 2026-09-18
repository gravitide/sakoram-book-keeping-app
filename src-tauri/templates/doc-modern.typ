// Modern — a bold header band in the business's theme colour, with the
// document title + number and the logo/wordmark reversed out in white. The
// body (party / meta / items / totals) is the shared common.typ content.

#import "common.typ": *

#let data = json("data.json")

#set document(title: data.number, author: if data.business_name != none { data.business_name } else { () })
#set page(
  paper: "a4",
  margin: (x: 18mm, top: 16mm, bottom: 18mm),
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
    #v(4pt)
    #align(center, text(size: 8pt, fill: rgb("#6b7280"))[#footer-content(data)])
  ],
)
#set text(font: resolve-font(data), size: 9.5pt, lang: "en", number-width: "tabular")
#set par(leading: 0.55em, spacing: 0.65em)

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

#v(12pt)
#items-table(data)
#paid-block(data)
#notes-block(data)
#bank-block(data)
#signoff-block(data)
