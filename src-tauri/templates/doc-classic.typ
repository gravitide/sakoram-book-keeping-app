// Classic — the default client-facing layout. Reproduces the original
// document.typ output exactly: letterhead logo top-right, theme-coloured
// rule, centred title, party block (left) + meta block (right), items table,
// then paid / notes / bank / sign-off. Shared rendering lives in common.typ.

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

// Header + title. The five selectable header treatments live in one place
// (doc-header in common.typ) so a change lands on every template at once —
// they used to be six inline copies that had to be kept in sync by hand.
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
