// Letter — free-form correspondence on the business letterhead.
//
// The header (logo + accent rule) and footer match the client-facing document
// templates (doc-classic.typ) — same logo size, margins, and shared
// `footer-content` (business · website · phone · address) — so a letter looks
// like it came from the same stationery as an invoice/quote. Two modes via
// `data.pre_printed`:
//   - false (default): render the app letterhead.
//   - true: reserve blank top space + no footer, so the body prints onto
//     physical pre-printed letterhead paper.
//
// The rich-text body arrives pre-normalised in `data.blocks` (see
// app/lib/letter-body.ts): an array of paragraph / heading / bullet_list /
// ordered_list blocks whose inline runs carry bold/italic/underline flags.
// Text is always plain JSON string values — never interpreted as Typst markup.

#import "common.typ": caption, footer-content, header-logo, render-blocks

#let data = json("data.json")

#set document(
  title: if data.number != none { data.number } else { "Letter" },
  author: data.business_name,
)

#let chosen-font = if "font_family" in data and data.font_family != none { data.font_family } else { "Akt" }
#set text(font: (chosen-font, "Inter", "Inter Tight", "Miriam Libre"), size: 10pt, lang: "en")
#set par(leading: 0.6em, spacing: 0.8em)

#let pre-printed = data.at("pre_printed", default: false)
#let preprinted-top = data.at("preprinted_top_margin_mm", default: 55) * 1mm
#let preprinted-bottom = data.at("preprinted_bottom_margin_mm", default: 20) * 1mm

#set page(
  paper: "a4",
  // Same margins as doc-classic (x: 18mm, top: 16mm, bottom: 18mm) for the
  // app-rendered letterhead; pre-printed mode reserves its own blank top +
  // bottom space to clear the physical letterhead + footer.
  margin: if pre-printed { (x: 18mm, top: preprinted-top, bottom: preprinted-bottom) } else { (x: 18mm, top: 16mm, bottom: 18mm) },
  footer: if pre-printed { [] } else {
    [
      #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
      #v(4pt)
      #align(center, text(size: 8pt, fill: rgb("#6b7280"))[#footer-content(data)])
    ]
  },
)

// --- letterhead header (skipped for pre-printed paper) -------------------
// Matches doc-classic: logo top-right at 12mm (or business-name wordmark),
// theme-coloured 2pt rule below.
#if not pre-printed {
  align(right)[
    #if data.logo_file != none {
      header-logo(data, 12mm)
    } else if data.business_name != none and data.business_name != "" {
      box(height: 12mm)[
        #set align(right + horizon)
        #text(weight: "bold", size: 16pt, tracking: 0.02em)[#data.business_name]
      ]
    } else {
      box(height: 12mm)
    }
  ]
  v(2mm)
  line(length: 100%, stroke: 2pt + rgb(data.theme_color))
  v(12pt)
}

// --- date + reference row ------------------------------------------------
// Muted caption over a strong value, matching the quote / invoice meta block:
// Date on the left, Reference (bold) on the right.
#grid(
  columns: (1fr, auto),
  [
    #caption("Date")
    #v(3pt)
    #text(fill: rgb("#3d4450"))[#data.letter_date]
  ],
  if data.number != none and data.number != "" {
    align(right)[
      #caption("Reference")
      #v(3pt)
      #text(fill: rgb("#3d4450"))[#data.number]
    ]
  } else [],
)

#v(14pt)

// --- recipient block -----------------------------------------------------
#if data.recipient_name != none and data.recipient_name != "" {
  text(weight: "semibold")[#data.recipient_name]
  linebreak()
}
#if data.recipient_address != none and data.recipient_address != "" {
  for (i, ln) in data.recipient_address.split("\n").enumerate() {
    if i > 0 { linebreak() }
    ln
  }
}

#v(16pt)

// --- subject -------------------------------------------------------------
#if data.subject != none and data.subject != "" {
  align(center, text(weight: "bold", size: 13pt, tracking: 0.03em)[#upper(data.subject)])
  v(14pt)
}

// --- body ----------------------------------------------------------------
#render-blocks(data.blocks)

// --- signature -----------------------------------------------------------
// Free-form rich-text sign-off, rendered below a signature line. The blocks
// arrive pre-normalised (same shape as the body). Only drawn when the user has
// typed something. The signature line follows the sign-off's own alignment
// (taken from the first block) — right-aligned sign-off → line on the right.
#let signature-blocks = data.at("signature_blocks", default: ())
#if signature-blocks.len() > 0 {
  v(64pt)
  let sig-align = signature-blocks.at(0).at("align", default: "left")
  let line-pos = if sig-align == "right" { right } else if sig-align == "center" { center } else { left }
  align(line-pos, line(length: 40%, stroke: 0.5pt + rgb("#9ca3af")))
  v(6pt)
  render-blocks(signature-blocks)
}
