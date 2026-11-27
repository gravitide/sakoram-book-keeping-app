// Source of the raster + PDF Full-page background fixtures used by
// scripts/verify-pdf-render.ts. Regenerate (from the repo root) with:
//
//   typst compile --ignore-system-fonts --creation-timestamp 1767225600 scripts/fixtures/stationery/background.typ scripts/fixtures/stationery/background.pdf
//   typst compile --ignore-system-fonts --input second=false --format png --ppi 40 scripts/fixtures/stationery/background.typ scripts/fixtures/stationery/background.png
//   ffmpeg -y -i scripts/fixtures/stationery/background.png -q:v 5 -flags +bitexact -map_metadata -1 scripts/fixtures/stationery/background.jpg
//
// then re-capture baselines (bun run verify:pdf --update). The PDF has a red
// second page that must NEVER show up: a background is its first page only.
// The PNG is single-page (--input second=false); the JPEG is re-encoded from
// it (Typst can't write JPEG). All three are tiny on purpose —
// a real upload is downscaled to ~300 DPI by the settings page, not here.

#let show-second = sys.inputs.at("second", default: "true") == "true"
#set page(paper: "a4", margin: 0pt)
#let ink = rgb("#7c2d12")
#rect(width: 100%, height: 100%, fill: rgb("#fff7ed"), stroke: none, inset: 0pt)[
  #place(top + left, rect(width: 100%, height: 34mm, fill: ink))
  #place(top + left, dy: 34mm, rect(width: 100%, height: 1.5mm, fill: rgb("#fb923c")))
  #place(top + right, dx: -18mm, dy: 9mm, rect(width: 16mm, height: 16mm, radius: 3mm, fill: rgb("#ffedd5")))
  #place(top + left, dx: 18mm, dy: 12mm, rect(width: 80mm, height: 4mm, radius: 1mm, fill: rgb("#ffedd5")))
  #place(top + left, dx: 18mm, dy: 19mm, rect(width: 52mm, height: 3mm, radius: 1mm, fill: rgb("#fdba74")))
  #place(bottom + left, rect(width: 100%, height: 12mm, fill: ink))
]
#if show-second {
  pagebreak()
  rect(width: 100%, height: 100%, fill: red)
}
