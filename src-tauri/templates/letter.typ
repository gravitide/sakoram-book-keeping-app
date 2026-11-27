// Letter — free-form correspondence on the business letterhead.
//
// The letterhead, footer and page number are the business's page design,
// drawn behind the content by page-setup (common.typ design-items). A letter
// printed onto pre-printed paper gets no design items (page-settings.ts
// omitItems), only the design's safe area.
//
// The rich-text body arrives pre-normalised in `data.blocks` (see
// app/lib/letter-body.ts): an array of paragraph / heading / bullet_list /
// ordered_list blocks whose inline runs carry bold/italic/underline flags.
// Text is always plain JSON string values — never interpreted as Typst markup.

#import "common.typ": caption, page-setup, render-blocks

#let data = json("data.json")

#set document(
  title: if data.number != none { data.number } else { "Letter" },
  author: if data.business_name != none { data.business_name } else { () },
)

#let chosen-font = if "font_family" in data and data.font_family != none { data.font_family } else { "Akt" }
#set text(font: (chosen-font, "Inter", "Inter Tight", "Miriam Libre"), size: 10pt, lang: "en")
#set par(leading: 0.6em, spacing: 0.8em)

#set page(..page-setup(data))


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
