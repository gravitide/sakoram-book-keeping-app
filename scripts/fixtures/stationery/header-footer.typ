// Source of the raster + PDF Header & footer image fixtures used by
// scripts/verify-pdf-render.ts. Regenerate (from the repo root) with:
//
//   typst compile --ignore-system-fonts --input part=header --format png --ppi 60 scripts/fixtures/stationery/header-footer.typ scripts/fixtures/stationery/header.png
//   typst compile --ignore-system-fonts --input part=footer --creation-timestamp 1767225600 scripts/fixtures/stationery/header-footer.typ scripts/fixtures/stationery/footer.pdf
//
// then re-capture baselines (bun run verify:pdf --update). The footer PDF has
// a red second page that must NEVER show up: an image is its first page only.
// header.svg / footer.svg are written by hand (outlined shapes, no text).

#let part = sys.inputs.at("part", default: "header")
#let ink = rgb("#14532d")
#if part == "header" {
  set page(width: 210mm, height: 36mm, margin: 0pt)
  rect(width: 100%, height: 100%, fill: ink, stroke: none, inset: 0pt)[
    #place(bottom + left, rect(width: 100%, height: 2.5mm, fill: rgb("#4ade80")))
    #place(top + left, dx: 14mm, dy: 9mm, rect(width: 16mm, height: 16mm, radius: 3mm, fill: rgb("#dcfce7")))
    #place(top + left, dx: 36mm, dy: 11mm, rect(width: 80mm, height: 4mm, radius: 1mm, fill: rgb("#dcfce7")))
    #place(top + left, dx: 36mm, dy: 18mm, rect(width: 52mm, height: 3mm, radius: 1mm, fill: rgb("#86efac")))
  ]
} else {
  set page(width: 210mm, height: 14mm, margin: 0pt)
  rect(width: 100%, height: 100%, fill: ink, stroke: none, inset: 0pt)[
    #place(top + left, rect(width: 100%, height: 1.5mm, fill: rgb("#4ade80")))
    #place(top + left, dx: 18mm, dy: 6mm, rect(width: 120mm, height: 2.5mm, radius: 1mm, fill: rgb("#86efac")))
  ]
  pagebreak()
  rect(width: 100%, height: 100%, fill: red)
}
