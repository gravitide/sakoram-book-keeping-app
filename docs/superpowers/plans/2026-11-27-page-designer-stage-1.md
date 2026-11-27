# Page designer, stage 1: data model + rendering — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four Stationery modes with one stored **page design** (safe area + canvas items: image, text box, page number, line) that every PDF renders behind its content. Ship the seven starter templates as data. Give `/settings/pdf` a temporary template picker until the designer window lands in stage 2.

**Architecture:**
- **Storage.** The design lives as Zod-validated JSON in a new `company_settings.pdf_design` column. A pure `app/lib/page-design*.ts` layer parses it, scales it to the paper and resolves text fields.
- **Payload.** `buildPageSettings` turns it into a flat `data.page.items` list in the payload. Rust copies each item's image into the render work dir.
- **Drawing.** One Typst function (`design-items`) draws the items in the page `background`, honouring the which-pages rule. The four Layouts shrink to "Document style": title block only.

**Tech Stack:** Nuxt 4 / Vue 3 / TypeScript strict, Zod, Pinia, Vitest, Tauri 2 (Rust), SQLite via tauri-plugin-sql, Typst sidecar.

**Spec:** `docs/superpowers/specs/2026-11-27-page-designer-design.md` (stage 1 of the "Delivery" section). Read it first.

## Global Constraints

- `bun` only (`bun run lint`, `bun run test`, `bun run verify:sql`, `bun run verify:pdf`). Lint with `--ignore-pattern ".claude/**" --ignore-pattern ".impeccable/**"` if the full run trips on those folders.
- Tabs and the strict eslint config. Pure logic goes in `app/lib/*.ts` with a sibling `*.test.ts`, never in a store (vitest can't import `~/lib/db`).
- Every DB write is a single SQL statement. No `BEGIN`/`COMMIT` from JS.
- Pre-1.0: old stationery settings are **reset, not converted**. The migration drops the old columns.
- A new migration file must be added to `MIGRATIONS` in `src-tauri/src/tenants.rs`, and `SCHEMA_VERSION` in `src-tauri/src/data_io.rs` goes 56 → 57.
- File ops on a business folder go through Rust commands, never the fs plugin.
- Item ids match `^[a-z0-9]{6,32}$`. Rust re-checks this before touching any path.
- All positions and sizes are mm from the page's top-left. Font sizes and line thickness are pt.
- Canvas items are drawn **behind** content: the page `background`, never `foreground`.
- Text fonts: `Akt`, `Inter`, `Inter Tight`, `Stack Sans Text`, `Miriam Libre`, `Amarna` (the bundled six).
- Page number formats: `page_of_total` → "Page 1 of 3", `slash` → "1 / 3", `number` → "1".
- Pages rule: `every` | `first` | `not_first`.
- Template keys, in picker order: `classic`, `modern`, `minimal`, `compact`, `background`, `preprinted`, `blank`.
- Bump the version to **0.170.0** in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.lock`.
- Don't commit `CLAUDE.md`, `PRODUCT.md`, `docs/agents/**`, `src-tauri/migrations/CLAUDE.md`, `src-tauri/src/drive/CLAUDE.md` or `src-tauri/templates/CLAUDE.md`. They are the user's uncommitted work in progress. Task 9 lists what they need, for the user to apply.

## Calls this plan makes that the spec left open

- **A business that never chose a design** (`pdf_design` NULL) renders Classic with the company logo **read live** (`src: company_logo`). Applying any template, editing the safe area, or finishing onboarding turns it into a copied image, as the spec says. Only the untouched default follows the company logo.
- **Statements stop turning landscape.** Designs are placed in portrait mm. Only Built-in allowed landscape before.
- **The statement's FROM block goes away.** The design is the single source of the business's identity on the page, as it already was for the non-Built-in modes.
- **A letter marked "Pre-printed paper"** prints no design items and keeps the design's safe area. The separate pre-printed bands are gone.

## Review Focus

1. **A design item's image file is missing on disk** (deleted, or the folder was copied without `stationery/`). The PDF still renders, minus that image. Tested in Task 4.
2. **Malformed or hand-edited `pdf_design` JSON**, or an unknown `version`. It parses to `null`, which renders the Classic template; it never throws. Tested in Task 1.
3. **A business with no website / phone / email.** Field-only lines drop out and separators collapse: no `" ·  · "`, no leading `", "`. Tested in Task 2.
4. **A design saved on A4, then Paper size switched to A5 or US Letter.** Every item and margin scales to the new sheet, nothing lands off the page, and the stored design is not rewritten. Tested in Task 1.
5. **A tampered item id such as `../../x`** in the JSON. Zod rejects it in TS, and Rust refuses it in `asset_slot` and staging. Tested in Tasks 1 and 4.

---

### Task 1: The design model (pure)

**Files:**
- Create: `app/lib/page-design.ts`, `app/lib/page-design.test.ts`

**Interfaces:**
- Consumes: `PaperSize`, `resolvePaperSize` from `app/lib/page-settings.ts` (unchanged exports).
- Produces:
  ```ts
  export type PagesRule = "every" | "first" | "not_first";
  export type DesignFont = "Akt" | "Inter" | "Inter Tight" | "Stack Sans Text" | "Miriam Libre" | "Amarna";
  export const DESIGN_FONTS: readonly DesignFont[];
  export type DesignColor = "accent" | `#${string}`;           // #rrggbb
  export type TextAlign = "left" | "center" | "right";
  export type PageNumberFormat = "page_of_total" | "slash" | "number";
  export interface MarginsMm { top: number, right: number, bottom: number, left: number }
  export interface TextStyle { font: DesignFont, size: number, bold: boolean, italic: boolean, color: DesignColor, align: TextAlign }
  export type ImageSource = { kind: "file", ext: "svg" | "pdf" | "png" | "jpg" } | { kind: "company_logo" } | null;
  export type DesignItem =
    | { type: "image", id: string, x: number, y: number, w: number, h: number, pages: PagesRule, src: ImageSource, guide: boolean }
    | { type: "text", id: string, x: number, y: number, w: number, pages: PagesRule, text: string, style: TextStyle }
    | { type: "page_number", id: string, x: number, y: number, w: number, pages: PagesRule, format: PageNumberFormat, hide_single: boolean, style: TextStyle }
    | { type: "line", id: string, x: number, y: number, length: number, vertical: boolean, thickness: number, color: DesignColor, pages: PagesRule };
  export interface PageDesign { version: 1, paper: PaperSize, margins: MarginsMm, items: DesignItem[] }
  export const ITEM_ID_PATTERN: RegExp;                        // /^[a-z0-9]{6,32}$/
  export function newItemId(): string;                          // 12 chars, crypto.getRandomValues
  export function parsePageDesign(stored: string | null | undefined): PageDesign | null;
  export function scaleDesign(design: PageDesign, to: PaperSize): PageDesign;
  export function itemOnPage(rule: PagesRule, page: number): boolean;
  export function formatMm(mm: number): string;                 // moved from stationery-geometry.ts, same behaviour
  ```

- [ ] **Step 1: Write the failing tests** in `page-design.test.ts`:
  - `parsePageDesign` returns `null` for `null`, `""`, `"not json"`, `{"version":2,…}`, and for a design whose item id is `"../../x"`.
  - It round-trips a valid design: `parsePageDesign(JSON.stringify(d))` toEqual `d`.
  - It drops **only** an invalid item: a design with one good item and one item with `w: -5` parses to the good item alone.
  - `newItemId()` matches `ITEM_ID_PATTERN`; 1000 calls give 1000 distinct ids.
  - `scaleDesign(a4Design, "a5")` scales by the A4→A5 ratios:
    - `x` and `length` (when horizontal) by the width ratio `148/210`;
    - `y` by the height ratio `210/297`;
    - image `w` and `h`, text `w` and `style.size` by `min(148/210, 210/297)`;
    - margins top/bottom by the height ratio and left/right by the width ratio;
    - `paper` becomes `"a5"`.
  - `scaleDesign(d, d.paper)` returns `d` unchanged (toEqual).
  - After `scaleDesign` to every paper, each image satisfies `x + w <= paperWidth + 0.01` and `y + h <= paperHeight + 0.01`.
  - `itemOnPage`: `every` → true on pages 1 and 2; `first` → true on 1, false on 2; `not_first` → false on 1, true on 2.
  - `formatMm` keeps its existing cases. Move the existing `formatMm` tests from `stationery-geometry.test.ts`.

- [ ] **Step 2: Run** `bun run test app/lib/page-design.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `page-design.ts`.**
  - Zod schema per item type, with numbers finite and `>= 0` (sizes `> 0`) and `id` matching `ITEM_ID_PATTERN`.
  - Parse items one by one with `safeParse` and keep the valid ones, so a single bad item doesn't blank the design.
  - Clamp the paper through `resolvePaperSize`.
  - A failed top-level parse returns `null`.

- [ ] **Step 4: Run** the test again. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(page-design): design model, parse, scale`.

---

### Task 2: Text fields (pure)

**Files:**
- Create: `app/lib/page-design-text.ts`, `app/lib/page-design-text.test.ts`

**Interfaces:**
- Consumes: `tokenValuesFromSettings`, `PDF_TOKENS` from `app/lib/pdf-tokens.ts`. The token syntax is `{business_name}`, `{address}`, `{city}`, `{phone}`, `{email}`, `{website}`, `{tax_id}`.
- Produces: `export function resolveDesignText(text: string, values: Record<string, string>): string[]` returns the printed lines.

- [ ] **Step 1: Write the failing tests:**
  - `"{business_name}"` with name `"Gravitide"` → `["Gravitide"]`.
  - `"{address}, {city}\n{phone} · {email}\n{website}"` with every value empty except city `"Colombo"` → `["Colombo"]`. The empty address leaves no leading `", "`, and the phone/email and website lines drop out.
  - `"{business_name} · {website} · {phone}"` with an empty website → `["Gravitide · 077 123 4567"]`, with no doubled separator.
  - `"Web: {website}"` with an empty website → `[]`. A line that has at least one token, all of them empty, drops out together with its label.
  - `"Thank you"` (no tokens) → `["Thank you"]`.
  - `"Line one\n\nLine three"` → `["Line one", "", "Line three"]`. Blank typed lines are kept.
  - `"{unknown}"` → `["{unknown}"]` (left as typed, matching `pdf-tokens.ts`).

- [ ] **Step 2: Run** `bun run test app/lib/page-design-text.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `resolveDesignText`.**
  - Split on `\n`.
  - A line containing ≥1 known token, all of which resolve to `""`, is dropped.
  - Otherwise substitute the tokens, then tidy the separators `·`, `|` and `,`:
    - collapse runs (separator, whitespace, separator) to the first separator;
    - trim separators and whitespace at the line's ends.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit** — `feat(page-design): text boxes resolve company fields`.

---

### Task 3: Starter templates (pure)

**Files:**
- Create: `app/lib/design-templates.ts`, `app/lib/design-templates.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `newItemId`, `scaleDesign`; `PdfLayoutKey` from `app/lib/pdf-layouts.ts:13`.
- Produces:
  ```ts
  export type DesignTemplateKey = "classic" | "modern" | "minimal" | "compact" | "background" | "preprinted" | "blank";
  export const DESIGN_TEMPLATES: readonly { key: DesignTemplateKey, label: string, description: string }[];
  export const DEFAULT_DESIGN_TEMPLATE: DesignTemplateKey;     // "classic"
  export function designTemplate(key: DesignTemplateKey, paper: PaperSize): { design: PageDesign, documentStyle: PdfLayoutKey | null };
  ```
  - Templates are authored at A4 (210×297) and passed through `scaleDesign` for other papers.
  - The logo spot is `{ type: "image", src: { kind: "company_logo" }, … }`. Task 7 swaps it for a copied file, or `null`, when a template is applied.

- [ ] **Step 1: Write the failing tests:**
  - `DESIGN_TEMPLATES.map(t => t.key)` equals the Global Constraints order.
  - For every key × every paper: the design parses back through `parsePageDesign(JSON.stringify(design))` unchanged, all item ids are unique, and every item lies inside the page.
  - `classic`, `modern`, `minimal` and `compact` each contain exactly one `company_logo` image, at least one text item containing `{business_name}`, and one `page_number` item with `hide_single: true` and `pages: "every"`. Their `documentStyle` equals their own key.
  - `background`: one image `{ x: 0, y: 0, w: 210, h: 297, src: null, guide: false }` on A4, plus a `page_number` item. Margins are `{ top: 40, right: 18, bottom: 25, left: 18 }` and `documentStyle` is `null`.
  - `preprinted`: one full-page image with `src: null, guide: true`, no page number, margins `{ top: 55, right: 18, bottom: 20, left: 18 }`, `documentStyle: null`.
  - `blank`: no items, margins `{ top: 20, right: 18, bottom: 20, left: 18 }`, `documentStyle: null`.
  - Two calls to `designTemplate("classic","a4")` give different item ids (fresh ids each time).

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement the templates.** Classic, at A4, as follows (the other letterhead templates follow its pattern and today's look):

  | Item | Values |
  |---|---|
  | logo image | x 168, y 12, w 24, h 24, `company_logo` (top-right, as today) |
  | name text | x 18, y 13, w 140, `"{business_name}"`, Akt 14pt bold, `#111827`, left |
  | details text | x 18, y 20, w 140, `"{address}, {city}\n{phone} · {email}\n{website}"`, Akt 8.5pt, `#4b5563`, left |
  | accent line | x 18, y 40, length 174, horizontal, 2pt, `accent` |
  | footer rule | x 18, y 281, length 174, horizontal, 0.5pt, `#e5e7eb` |
  | footer text | x 18, y 284, w 174, `"{business_name} · {website} · {phone}"`, Akt 7.5pt, `#6b7280`, center |
  | page number | x 142, y 289, w 50, `page_of_total`, hide_single, Akt 7pt, `#6b7280`, right |
  | margins | top 48, right 18, bottom 26, left 18 |

  The other three:
  - **Modern:** a 14 mm logo top-left, with the name and details beside it from x 36. A 3pt accent line under them at y 36. The same footer.
  - **Minimal:** no lines. The name at 14pt regular top-left, the details right-aligned top-right, the page number bottom-centre.
  - **Compact:** a 9 mm logo top-right, the details as one line top-left, a 1.5pt accent line at y 24, margins top 30.

  Check every template visually in Task 6 (`verify:pdf --keep`) against today's Built-in renders of the same Layout.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit** — `feat(page-design): seven starter templates`.

---

### Task 4: Rust — item asset slots and render staging

**Files:**
- Modify: `src-tauri/src/tenants.rs` (`asset_slot` ~:924-938, `relocate_stored_paths` ~:323-345)
- Modify: `src-tauri/src/pdf.rs`:
  - `stage_render` :173-230
  - `stage_background` :241-258, `stage_stationery_file` :261-274, `stage_header_footer` :284-308
  - `ARTWORK_PREVIEW_STEMS` :526, `render_stationery_artwork_png` ~:555
  - the tests in `mod tests` :597+
- Modify: `src-tauri/src/data_io.rs` (the `pdf_header_logo_path` export/import rewrite at ~:743-823 and ~:888-940)

**Interfaces:**
- Produces:
  - Asset kind `stationery-item-<id>` ↔ file `stationery/item-<id>.<ext>`.
  - `fn stage_page_items(data: &mut serde_json::Value, folder: &Path, work_dir: &Path) -> Result<(), String>`.
  - Payload contract read by Typst (Task 6) — each image item in `data.page.items` arrives from TS as `{ "type":"image", "src":"item"|"company_logo", "id", "ext"?, x,y,w,h,pages }`. After staging it has `"file": "<name in work_dir>"`, or it is **removed** from the array when its file is missing, `src` is unknown, or its id fails `ITEM_ID_PATTERN`.
  - A `company_logo` image takes `file` from the already-staged `data.logo_file` (the logo is staged first). It is removed when there is no logo.

- [ ] **Step 1: Write the failing Rust tests:**
  - `asset_slot("stationery-item-abc123def456")` → `Some(("stationery", "item-abc123def456"))`.
  - `asset_slot("stationery-item-../x")`, `asset_slot("stationery-item-")` and `asset_slot("stationery-background")` → `None`.
  - `asset_slot("pdf-header")` → `None` (the kind is retired).
  - `stage_page_items` with the following input:

    | Image item | Expected |
    |---|---|
    | file present on disk | gets `file: "item-<id>.png"`, and the file is copied |
    | missing on disk | removed |
    | id `"../x"` | removed |
    | `company_logo` with `data.logo_file = "logo.png"` | gets `file: "logo.png"` |

    Text and line items pass through untouched.
  - `stage_page_items` with `company_logo` and `logo_file: null` removes that item.

- [ ] **Step 2: Run** `cargo test --lib` in `src-tauri`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - `asset_slot` accepts the `stationery-item-` prefix plus an id checked against `^[a-z0-9]{6,32}$` (hand-rolled check, no new crate). It drops the `stationery-background|header|footer(-original)` and `pdf-header(-original)` arms.
  - `stage_render` calls `stage_page_items` after logo staging, replacing the background and header/footer staging.
  - Delete `stage_background`, `stage_header_footer` and their tests.
  - `render_stationery_artwork_png` accepts `item-<id>` stems with the same id check, in place of `ARTWORK_PREVIEW_STEMS`. Stage 2 uses it for PDF images.
  - Remove `pdf_header_logo_path` from `relocate_stored_paths` and from the data_io export/import rewrite.

- [ ] **Step 4: Run** `cargo test --lib`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(pdf): stage page-design images; item asset slots`.

---

### Task 5: Migration 0057 and the settings row

**Files:**
- Create: `src-tauri/migrations/0057_page_design.sql`
- Modify: `src-tauri/src/tenants.rs` (`MIGRATIONS`, after the `(56, …)` entry at ~:112), `src-tauri/src/data_io.rs:60` (`SCHEMA_VERSION = 57`)
- Modify: `app/stores/settings.ts` (`CompanySettingsRow` :11-114, `UPDATABLE_COLUMNS` :118-173, remove `pdfHeaderLogoSrc` :211-219)
- Modify: `scripts/verify-derived-sql.ts` (the 0055/0056 assertions at ~:206-238)

**Interfaces:**
- Produces: the `company_settings.pdf_design TEXT` column, NULL by default. NULL means "Classic, never chosen", which Task 7 resolves. `CompanySettingsRow.pdf_design: string | null`.

- [ ] **Step 1: Write the failing check** in `verify-derived-sql.ts`:
  - after all migrations, `pdf_design` exists and is NULL on a fresh row;
  - none of `pdf_stationery_mode`, `pdf_stationery`, `pdf_header_logo_path`, `pdf_logo_scale`, `pdf_logo_crop`, `pdf_header_custom`, `pdf_header_text`, `pdf_footer_custom` or `pdf_footer_text` exist (`pragma_table_info`).
  - Delete the assertions that expect `builtin`.

- [ ] **Step 2: Run** `bun run verify:sql`. Expected: FAIL on the new check.

- [ ] **Step 3: Implement.**
  - The migration has one `ALTER TABLE company_settings DROP COLUMN …` per old column and one `ADD COLUMN pdf_design TEXT`.
  - If SQLite refuses to drop `pdf_stationery_mode` because of its column CHECK, rebuild the table the way earlier migrations did. Check `0055` / `0050` for the house pattern.
  - Register the migration as `(57, "page design", include_str!("../migrations/0057_page_design.sql"))`.
  - In the settings row, remove the nine fields from the type and the whitelist, and add `pdf_design`.

- [ ] **Step 4: Run** `bun run verify:sql` and `cargo test --lib`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(db): 0057 page design column, drop stationery columns`.

  `bun run lint` will fail until Task 7 removes the old readers. That's expected; the next tasks fix it, and the plan only needs a green tree at Task 8. If you want green commits, do Tasks 5–8 before committing, as one commit per task in that order.

---

### Task 6: Typst — draw the design, shrink Layouts to Document style

**Files:**
- Modify: `src-tauri/templates/common.typ`:
  - `footer-content` :314-326, `page-number` :346-354, `page-number-footer` :359-362
  - `page-background` :380-384, `page-header-footer` :394-407
  - `page-geometry` :410-444, `page-setup` :446-493
  - `header-logo` :603-616, `logo-or-wordmark` :623-632, `builtin-logo` :638-641
  - `doc-header` :663-758
- Modify: `doc-classic.typ`, `doc-modern.typ`, `doc-minimal.typ`, `doc-compact.typ`, `payslip.typ`, `letter.typ`, `report.typ`, `statement.typ`, `voucher.typ`
- Modify: `scripts/verify-pdf-render.ts`; re-capture `scripts/pdf-render-baselines.json`

**Interfaces:**
- Consumes: `data.page = { paper, margins: {top,right,bottom,left}, items: [...] }` (Task 7 builds it, Task 4 stages it) and `data.theme_color`.
- Payload item shapes (TS has already resolved `accent` → hex and text → lines):
  ```
  image:       { type, x, y, w, h, pages, file }
  text:        { type, x, y, w, pages, lines: string[], font, size, bold, italic, color, align }
  page_number: { type, x, y, w, pages, format, hide_single, font, size, bold, italic, color, align }
  line:        { type, x, y, length, vertical, thickness, color, pages }
  ```
- Produces:
  - `#let design-items(data)`, drawn as `page-setup`'s `background`.
  - It keeps emitting `metadata((page: n, total: m)) <sakoram-page-number>` from each **drawn** page-number item, so the verify check keeps working.

- [ ] **Step 1: Rework `scripts/verify-pdf-render.ts` first, so it fails.**
  - Replace the stationery-mode cases (:689-844) and helpers (`stageBackground`, `stageHeaderFooter`, `imagePlacementProblem`, `orientationProblem`, the preprinted/background/header-footer fixtures) with these cases:
    - **every template × the classic invoice fixture** (multipage);
    - **every template × the other documents** (quote, bill, payslip, voucher, report, statement, letter, letter-pre-printed);
    - **`classic` × every paper**;
    - **an image-file case**: the `background` template whose slot has `src: { kind: "file", ext }` for each of svg / png / jpg / pdf. Reuse `scripts/fixtures/stationery/background.*`, copied to `item-<id>.<ext>`.
  - Mirror Task 4's staging in a `stagePageItems` helper.
  - `pageNumberProblem` expects metadata exactly when the payload has a page-number item that is drawn: pages > 1, or `hide_single` false. The `~unnumbered` twin removes the page-number item instead of setting `page_numbers: false`.
  - `identityProblem`: the document body never prints the business address, phone or website.
  - `artworkProblem`: the image-file cases must hash differently from the same case with the image item removed.
  - Add a case for **`first` / `not_first`**: a two-page invoice with a `first`-only image and a `not_first`-only line. Assert with `typst query` on a `<sakoram-design-item>` metadata (`{id, page}`) that `design-items` emits per drawn item: the image appears only on page 1 and the line only on page 2.

- [ ] **Step 2: Run** `bun run verify:pdf`. Expected: FAIL, because the templates still read `data.page.chrome` and the other old fields.

- [ ] **Step 3: Implement in `common.typ`.**
  - **`design-items(data)`:**
    - A `context` block that reads `here().page()` and `counter(page).final().first()`.
    - For each item where `itemOnPage` holds (mirror Task 1's rule), draw `place(top + left, dx: x*1mm, dy: y*1mm, …)`:
      - **image:** `image(file, width: w*1mm, height: h*1mm, fit: "contain")`;
      - **text:** a `block(width: w*1mm, align(<align>, text(font: (font, ..fallbacks from resolve-font), size: size*1pt, weight, style, fill: rgb(color), lines.join(linebreak()))))`;
      - **page_number:** formatted text per format, skipped when `hide_single and total == 1`, with the metadata;
      - **line:** `line(length: length*1mm, angle: if vertical {90deg} else {0deg}, stroke: thickness*1pt + rgb(color))`.
    - Emit `metadata((id: item.id, page: n)) <sakoram-design-item>` per drawn item.
  - **`page-geometry` / `page-setup`:**
    - margins always come from `data.page.margins` (mm);
    - `background: design-items(data)`;
    - no footer, no `flipped`, always portrait;
    - delete `chrome`, `margin_scale`, `page_numbers`, `page_number_position` and `allow_landscape`.
  - Delete `footer-content`, `page-number`, `page-number-footer`, `page-background`, `page-header-footer`, `header-logo`, `logo-or-wordmark` and `builtin-logo`. Keep `render-blocks`, which letters use for their body, and `tapered-rule`.
  - **`doc-header(data)` becomes the Document style's title block only:**
    - classic: centred bold 14pt title, `v(14pt)`;
    - modern: left bold 16pt title, `v(6pt)`, `tapered-rule(theme, 3pt)`, `v(14pt)`;
    - minimal: the existing right-aligned upper-case title + `#number` column, `v(24pt)`;
    - compact: centred bold 12pt title, `v(10pt)`.
  - **Per template:**
    - drop the `margin:` / `footer:` arguments to `page-setup`, the inline footers (report :29-43, statement :33-47, voucher :19-31), the `builtin-logo` calls and the chrome-gated rules (letter :48-51, report :66, statement :71, voucher :44);
    - remove statement's FROM block (:106 onward), so the design is the only source of business identity;
    - `statement.typ` stops passing `flipped: true`.

- [ ] **Step 4: Run** `bun run verify:pdf --keep <scratch dir>`.
  - Look at the PNGs for each template on the invoice and statement. They should read like today's Built-in renders of the same Layout: logo top-right on Classic, footer line, page number.
  - Fix the template coordinates (Task 3) until they do. Then `bun run verify:pdf --update`, followed by `bun run verify:pdf` → PASS.

- [ ] **Step 5: Commit** — `feat(pdf): draw page design behind content; Layouts become Document style`.

---

### Task 7: Payload builders and applying a template

**Files:**
- Modify: `app/lib/page-settings.ts`
  - types :75-136, `marginsFor` :169, `headerFooterFor` :181, `backgroundFor` :187
  - `buildLayoutAndPage` :202-209, `buildPageSettings` :211-230
- Modify: `app/lib/page-settings.test.ts`, `app/lib/pdf-page-block.test.ts`, `app/lib/sample-pdf.ts` (+test)
- Modify the builders: `invoice-pdf.ts`, `quote-pdf.ts`, `bill-pdf.ts`, `payslip-pdf.ts`, `voucher-pdf.ts`, `report-pdf.ts`, `statement-pdf.ts`, `letter-pdf.ts`
- Delete: `app/lib/pdf-chrome.ts` (+test), if nothing else imports `buildHeaderBlocks` / `buildFooterBlocks`
- Create: `app/composables/usePageDesign.ts`
- Modify: `app/lib/business-assets.ts` (kinds :13-20)
- Modify: `app/pages/onboarding.vue` (~:742-769)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  ```ts
  // page-settings.ts
  export interface PageSettings { paper: PaperSize, margins: MarginsMm, items: PageItemPayload[] }
  export interface PageSettingsOverride { omitItems?: boolean }   // a letter on pre-printed paper
  export function effectiveDesign(settings: Partial<CompanySettingsRow> | null): PageDesign;
  export function buildPageSettings(settings: Partial<CompanySettingsRow> | null, override?: PageSettingsOverride): PageSettings;
  export function buildLayoutAndPage(settings, override?, layout = settings?.pdf_layout): { layout, page };
  // business-assets.ts
  export type BusinessAssetKind = "logo" | "logo-original" | `stationery-item-${string}`;
  export function itemAssetKind(id: string): BusinessAssetKind;
  // usePageDesign.ts
  export function usePageDesign(): {
    applyTemplate(key: DesignTemplateKey): Promise<void>,
    saveMargins(margins: MarginsMm): Promise<void>
  };
  ```

- [ ] **Step 1: Write the failing tests** in `page-settings.test.ts`:
  - **`effectiveDesign`:**
    - with `pdf_design: null` and `pdf_paper_size: "a5"`, it equals `designTemplate("classic","a5").design` with ids ignored (compare with ids stripped);
    - with a stored A4 design and `pdf_paper_size: "us-letter"`, it equals `scaleDesign(stored, "us-letter")`;
    - with malformed JSON, it is Classic.
  - **`buildPageSettings`:**
    - image items with `src: null` or `guide: true` are absent from `items`;
    - a `company_logo` image becomes `{ type: "image", src: "company_logo", … }`, and a file image becomes `{ src: "item", id, ext }`;
    - text items carry `lines` from `resolveDesignText` and are dropped when that returns `[]`;
    - `color: "accent"` becomes `pdfThemeHex(settings)` on text, page-number and line items;
    - `override.omitItems` gives `items: []` with the same margins.
  - **`buildLayoutAndPage`** returns the stored `pdf_layout` whatever the design. The old "forced to classic" test is deleted.
  - **`pdf-page-block.test.ts`:** for every builder, `payload.page` has exactly the keys `paper, margins, items`, and `payload.logo_path === settings.logo_path`.

- [ ] **Step 2: Run** `bun run test`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Delete the stationery types and helpers from `page-settings.ts`.
  - Every builder sets `logo_path: settings?.logo_path ?? null` (the company logo) and stops sending `logo_scale`, `header_blocks` and `footer_blocks`.
  - `letter-pdf.ts` passes `{ omitItems: row.pre_printed === 1 }`.
  - **`usePageDesign().applyTemplate`:**
    1. Builds `designTemplate(key, paper)`.
    2. Replaces the `company_logo` slot: when `settings.logo_path` is set, read the company logo (`readBusinessAsset(…, "logo")`), save it under `itemAssetKind(slot.id)` and set `src: { kind: "file", ext }`. Otherwise set `src: null`.
    3. Removes the asset files of every image item in the **previous** stored design.
    4. Saves `{ pdf_design: JSON.stringify(design) }`, plus `pdf_layout` when `documentStyle` isn't null, in one `settingsStore.save`.
  - **`saveMargins`** saves `effectiveDesign` with new margins. On a NULL design this materialises Classic through `applyTemplate("classic")` first.
  - **Onboarding:**
    - drop the separate PDF-header logo drop zone (`kind` "pdf-header");
    - after the identity logo is saved, call `applyTemplate("classic")`, so a new business's first design already holds its logo.

- [ ] **Step 4: Run** `bun run test`, `bun run verify:pdf` and `bun run lint`. Expected: PASS. Lint may still fail on `settings/pdf.vue`; that's fixed in Task 8.

- [ ] **Step 5: Commit** — `feat(page-design): payload builders + apply template`.

---

### Task 8: Temporary `/settings/pdf`, and retiring the old modes

**Files:**
- Rewrite: `app/pages/settings/pdf.vue`
- Modify: `app/lib/pdf-settings-sections.ts` (+test), `app/layouts/default.vue` (:397-401, :623, :732-735)
- Modify: `app/pages/settings/letters.vue` (the preprinted card :84-111 and editor :138-159), `app/pages/letters/[id].vue` (:80-86, :219-230)
- Modify: `app/lib/demo-seed.ts:35-37,165`
- Delete:
  - components: `StationeryBackgroundCard.vue`, `StationeryHeaderFooterCard.vue`, `StationeryEditorModal.vue`, `StationeryPage.vue`, `StationeryAdjustRow.vue`
  - composables: `usePdfSettingsMode.ts`, `useStationeryArtwork.ts`, `useRasterArtwork.ts`
  - lib: `stationery.ts`, `stationery-geometry.ts` and `demo-letterhead.ts`, with their tests and `stationery-images.test.ts` / `stationery-paper-change.test.ts`
  - assets: `app/assets/stationery/*`
  - Keep `stationery-artwork.ts` (`ImageCropModal` uses `downscaleSize`) and `StationeryMarginDiagram.vue`. Point the diagram's `formatMm` import at `page-design.ts`.

**Interfaces:**
- Consumes: `usePageDesign`, `effectiveDesign`, `DESIGN_TEMPLATES`, `PDF_SECTION_IDS`.
- Produces: the sidebar anchors **Page / Design / Font**. `pdfSettingsSections()` takes no argument; ids are `page`, `design`, `font`.

- [ ] **Step 1: Update `pdf-settings-sections.test.ts`** to expect `[["#page","Page"],["#design","Design"],["#font","Font"]]`. Delete the per-mode tests. Run it → FAIL.

- [ ] **Step 2: Implement the page.**
  - **Page card:** keep the live preview and Preview as PDF from today's Page card (`useLivePagePreview`, with `deps` now `[pdf_design, logo_path]`), plus Paper size.
  - **Design card:**
    - Seven template buttons from `DESIGN_TEMPLATES`, each with a label and description.
    - Picking one asks *"Replace your current design with <label>? Images you added to it are removed."* and then calls `applyTemplate`. With a NULL design it applies without asking.
    - A note: *"A page designer to move and add items is coming."*
  - **Safe area:** four `UInputNumber`s (mm, step 0.5, min 0) with `StationeryMarginDiagram` under them, saved through `saveMargins` on the page's save bar.
  - **Document style:** the existing Layout picker (`PDF_LAYOUTS` / `PdfLayoutThumb`), relabelled "Document style".
  - **Accent colour:** `PdfColorRow` with the hint *"The highlighted totals in statements and reports, and anything in your design set to Accent."*
  - **Font:** the Font section, as today.
  - Delete the header-logo, header/footer text and stationery-mode code.
  - **Letters:**
    - `settings/letters.vue`: remove the pre-printed bands card and editor. One line instead: *"Letters on pre-printed paper leave out everything in your design and keep its safe area."*
    - `letters/[id].vue`: the pre-printed option's description becomes *"Nothing from your design is printed — only the letter, inside the safe area."*
  - **Demo seed:** save `designTemplate("modern", paper).design`, with the logo slot set to `src: null`, in place of the demo letterhead.

- [ ] **Step 3: Run** `bun run lint`, `bun run test`, `bun run verify:sql`, `bun run verify:pdf` and `cargo test --lib`. Expected: all PASS.

- [ ] **Step 4: Check it in the running app.**
  - Run `bun run tauri:dev`. On `/settings/pdf`, apply each template and check that the preview changes.
  - Change the paper to A5 (the preview scales) and edit the safe area (the preview moves).
  - Export an invoice PDF and a statement.
  - Then switch to a business without a logo and apply Classic: the logo spot is absent from the PDF.

- [ ] **Step 5: Commit** — `feat(settings): temporary page design settings; retire Stationery modes`.

---

### Task 9: Version and hand-off notes

**Files:**
- Modify: `package.json` (line 4), `src-tauri/Cargo.toml` (line 6), `src-tauri/tauri.conf.json` (line 35), `src-tauri/Cargo.lock` (the `sakoram_billing` version line). All go to `0.170.0`.
- Create: `docs/adr/0002-page-design-replaces-stationery.md`. It supersedes `docs/adr/0001-stationery-separate-from-layout.md` and records why: one canvas, templates as starting points, Layout narrowed to Document style, a pre-printed letter omits items.

- [ ] **Step 1: Bump** the four files and commit with the ADR — `chore: bump version to 0.170.0`.
- [ ] **Step 2: Write the hand-off list for the user**, not committed. These are the edits needed in their uncommitted docs:
  - `CLAUDE.md`: Golden-rule / landmine text about Stationery, the "accent rule Built-in only" note, and the seven-places list if it mentions `pdf_header_logo_path`.
  - `docs/agents/pdf-rendering.md`: replace the Stationery section with the page design: payload `page.items`, `design-items`, `stage_page_items`, item asset kinds.
  - `docs/agents/data-model.md`: the `pdf_design` column, and the dropped columns.
  - `src-tauri/migrations/CLAUDE.md`: a `0057 page design` history line.
  - `GLOSSARY.md`: Stationery → Page design, Layout → Document style.
