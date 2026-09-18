// Letterhead — leaves the top ~45mm blank for pre-printed company stationery,
// so no logo/wordmark block is rendered (the user's letterhead occupies that
// space). Content starts with the centred title + accent rule, then the shared
// body. Any uploaded PDF logo is intentionally ignored here.

#import "common.typ": *

#let data = json("data.json")

#set document(title: data.number, author: if data.business_name != none { data.business_name } else { () })
#set page(
  paper: "a4",
  margin: (x: 18mm, top: 45mm, bottom: 18mm),
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
    #v(4pt)
    #align(center, text(size: 8pt, fill: rgb("#6b7280"))[#footer-content(data)])
  ],
)
#set text(font: resolve-font(data), size: 9.5pt, lang: "en", number-width: "tabular")
#set par(leading: 0.55em, spacing: 0.65em)

// Header + title — see doc-header in common.typ. The letterhead branch draws
// no logo: the reserved top margin belongs to the pre-printed stationery.
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
