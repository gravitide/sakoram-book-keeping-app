// Letter — free-form correspondence on the business letterhead.
//
// Standalone template (does not import common.typ — letters share none of the
// items-table / party / meta machinery). Two modes via `data.pre_printed`:
//   - false (default): render the app letterhead (header logo/wordmark +
//     accent rule + footer), like invoices/quotes.
//   - true: reserve blank top space + no footer, so the body prints onto
//     physical pre-printed letterhead paper.
//
// The rich-text body arrives pre-normalised in `data.blocks` (see
// app/lib/letter-body.ts): an array of paragraph / heading / bullet_list /
// ordered_list blocks whose inline runs carry bold/italic/underline flags.
// Text is always plain JSON string values — never interpreted as Typst markup.

#let data = json("data.json")

#set document(
  title: if data.number != none { data.number } else { "Letter" },
  author: data.business_name,
)

#let chosen-font = if "font_family" in data and data.font_family != none { data.font_family } else { "Akt" }
#set text(font: (chosen-font, "Inter", "Inter Tight", "Miriam Libre"), size: 10.5pt, lang: "en")
#set par(leading: 0.65em, spacing: 0.9em)

#let pre-printed = data.at("pre_printed", default: false)
#let preprinted-top = data.at("preprinted_top_margin_mm", default: 55) * 1mm

#set page(
  paper: "a4",
  margin: if pre-printed { (x: 22mm, top: preprinted-top, bottom: 22mm) } else { (x: 22mm, top: 20mm, bottom: 24mm) },
  footer: if pre-printed { [] } else {
    [
      #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
      #v(4pt)
      #align(center, text(size: 8pt, fill: rgb("#6b7280"))[
        #if data.business_name != none [#data.business_name]
        #if data.website != none [ | #data.website]
        #if data.phone != none [ | #data.phone]
      ])
    ]
  },
)

// --- inline run + block rendering ----------------------------------------
#let render-run(r) = {
  let c = [#r.text]
  if r.at("underline", default: false) { c = underline(c) }
  if r.at("italic", default: false) { c = emph(c) }
  if r.at("bold", default: false) { c = strong(c) }
  c
}
#let render-runs(runs) = { for r in runs { render-run(r) } }
// Apply a paragraph/heading alignment ("center"/"right"/"justify"); left/none
// falls through unchanged (the natural default).
#let apply-align(a, body) = {
  if a == "center" { align(center, body) }
  else if a == "right" { align(right, body) }
  else if a == "justify" { par(justify: true, body) }
  else { body }
}
#let render-blocks(blocks) = {
  for b in blocks {
    if b.kind == "paragraph" {
      block(below: 8pt, apply-align(b.at("align", default: none), render-runs(b.runs)))
    } else if b.kind == "heading" {
      block(above: 10pt, below: 6pt, apply-align(b.at("align", default: none), text(weight: "bold", size: 12pt, render-runs(b.runs))))
    } else if b.kind == "bullet_list" {
      list(..b.items.map(items => render-blocks(items)))
    } else if b.kind == "ordered_list" {
      enum(..b.items.map(items => render-blocks(items)))
    }
  }
}

// --- letterhead header (skipped for pre-printed paper) -------------------
#if not pre-printed {
  if data.logo_file != none {
    align(left, image(data.logo_file, height: 18mm))
    v(2pt)
  } else if data.business_name != none and data.business_name != "" {
    text(weight: "bold", size: 18pt, tracking: 0.02em)[#data.business_name]
    v(2pt)
  }
  line(length: 100%, stroke: 2pt + rgb(data.theme_color))
  v(12pt)
}

// --- date + reference row ------------------------------------------------
#grid(
  columns: (1fr, auto),
  [#text(fill: rgb("#6b7280"))[#data.letter_date]],
  if data.number != none and data.number != "" {
    align(right, text(fill: rgb("#6b7280"))[Ref: #data.number])
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
// A field's value or none (treats missing / empty-string alike).
#let sig-field(k) = {
  let v = data.at(k, default: none)
  if v == none or v == "" { none } else { v }
}
// Ordered sign-off lines: name (emphasised), then title / company / email /
// phone. Empty fields drop out so the block only shows what's filled.
#let sig-lines = (
  sig-field("signatory_name"),
  sig-field("signatory_title"),
  sig-field("signatory_company"),
  sig-field("signatory_email"),
  sig-field("signatory_phone"),
).filter(x => x != none)
#if sig-lines.len() > 0 {
  v(40pt)
  line(length: 40%, stroke: 0.5pt + rgb("#9ca3af"))
  v(3pt)
  for (i, ln) in sig-lines.enumerate() {
    if i > 0 { linebreak() }
    if i == 0 {
      text(weight: "semibold")[#ln]
    } else {
      text(fill: rgb("#4b5563"), size: 9.5pt)[#ln]
    }
  }
}
