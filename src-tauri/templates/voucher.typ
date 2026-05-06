// Voucher template — receipts (money in) and payments (money out).
//
// Single-page receipt-style layout: big amount up top, then the party,
// method, reference, description as a labelled grid. Sign-off at the
// bottom with two signature lines (authorised by / received by).

#let data = json("data.json")

#set document(title: data.number, author: data.business_name)
#set page(
  paper: "a4",
  margin: (x: 22mm, top: 18mm, bottom: 22mm),
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
    #v(4pt)
    #align(center, text(size: 8pt, fill: rgb("#6b7280"))[
      #if data.business_name != none [#data.business_name]
      #if data.website != none [ | #data.website]
      #if data.phone != none [ | #data.phone]
    ])
  ],
)
#set text(font: ("Miriam Libre", "Inter"), size: 10pt, lang: "en")
#set par(leading: 0.6em, spacing: 0.7em)

// ============================================================
// Header: logo + red rule
// ============================================================
#align(right)[
  #if data.logo_file != none {
    image(data.logo_file, height: 14mm)
  } else {
    box(height: 14mm)
  }
]
#v(-2mm)
#line(length: 100%, stroke: 2pt + rgb(data.theme_color))

// ============================================================
// Title block
// ============================================================
#v(14pt)
#align(center)[
  #text(weight: "bold", size: 18pt, tracking: 0.06em)[#upper(data.title)]
  #v(2pt)
  #text(fill: rgb("#6b7280"), size: 10pt)[\##data.number  ·  #data.voucher_date]
]

#v(24pt)

// ============================================================
// Big amount card
// ============================================================
#align(center)[
  #box(
    inset: (x: 28pt, y: 16pt),
    fill: rgb("#fafafa"),
    radius: 4pt,
    stroke: 0.5pt + rgb("#e5e7eb"),
  )[
    #align(center)[
      #text(fill: rgb("#6b7280"), size: 9pt, tracking: 0.04em)[#upper("Amount")]
      #v(4pt)
      #text(weight: "bold", size: 22pt, fill: rgb(data.amount_color))[LKR #data.amount_display]
    ]
  ]
]

#v(24pt)

// ============================================================
// Detail grid
// ============================================================

#let lbl(t) = text(fill: rgb("#6b7280"), size: 9pt, tracking: 0.04em)[#upper(t)]
#let val(t) = text(weight: "semibold", size: 11pt)[#t]

#grid(
  columns: (1fr, 1fr),
  column-gutter: 24pt,
  row-gutter: 16pt,
  [#lbl(data.party_label) \ #v(2pt) #val(data.party_name)],
  [#lbl("Date") \ #v(2pt) #val(data.voucher_date)],
  ..if data.method_display != none {
    ([#lbl("Method") \ #v(2pt) #val(data.method_display)],)
  } else { () },
  ..if data.reference != none and data.reference != "" {
    ([#lbl("Reference") \ #v(2pt) #val(data.reference)],)
  } else { () },
)

#if data.description != none and data.description != "" [
  #v(20pt)
  #lbl("Description")
  #v(4pt)
  #text(size: 10pt)[
    #for (i, ln) in data.description.split("\n").enumerate() [
      #if i > 0 [#linebreak()]
      #ln
    ]
  ]
]

#if data.related_label != none [
  #v(16pt)
  #text(fill: rgb("#6b7280"), size: 8.5pt)[Related: #data.related_label]
]

// ============================================================
// Sign-off (two lines: authorised by / received by)
// ============================================================
#v(48pt)
#grid(
  columns: (1fr, 1fr),
  column-gutter: 60pt,
  [
    #line(length: 80%, stroke: 0.5pt + rgb("#9ca3af"))
    #v(2pt)
    #text(fill: rgb("#6b7280"), size: 9pt)[Authorised by]
  ],
  [
    #line(length: 80%, stroke: 0.5pt + rgb("#9ca3af"))
    #v(2pt)
    #text(fill: rgb("#6b7280"), size: 9pt)[#data.counter_signature_label]
  ],
)
