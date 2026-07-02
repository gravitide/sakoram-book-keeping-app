// Modern — a bold header band in the business's theme colour, with the
// document title + number and the logo/wordmark reversed out in white. The
// body (party / meta / items / totals) is the shared common.typ content.

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

// Header band — full text width, theme colour, white content.
#block(
  width: 100%,
  fill: rgb(data.theme_color),
  inset: (x: 16pt, y: 14pt),
  radius: 3pt,
)[
  #set text(fill: white)
  #grid(
    columns: (1fr, auto),
    align: horizon,
    gutter: 16pt,
    [
      #text(weight: "bold", size: 20pt, tracking: 0.04em)[#data.title]
      #v(2pt)
      #text(size: 10.5pt)[\##data.number]
    ],
    if data.logo_file != none {
      image(data.logo_file, height: 12mm)
    } else if data.business_name != none and data.business_name != "" {
      text(weight: "bold", size: 15pt, tracking: 0.02em)[#data.business_name]
    } else { [] },
  )
]

#v(16pt)

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
#footer-notes-block(data)
#signoff-block(data)
