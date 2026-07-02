// Classic — the default client-facing layout. Reproduces the original
// document.typ output exactly: letterhead logo top-right, theme-coloured
// rule, centred title, party block (left) + meta block (right), items table,
// then paid / notes / bank / sign-off. Shared rendering lives in common.typ.

#import "common.typ": *

#let data = json("data.json")

#set document(title: data.number, author: data.business_name)
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

// Header: logo top-right (or business-name wordmark), red rule below.
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
#v(2mm)
#line(length: 100%, stroke: 2pt + rgb(data.theme_color))

// Title
#v(8pt)
#align(center, text(weight: "bold", size: 14pt, tracking: 0.04em)[#data.title])
#v(14pt)

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
