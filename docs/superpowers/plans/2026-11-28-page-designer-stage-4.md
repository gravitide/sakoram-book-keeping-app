# Page designer, stage 4: polish — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the page designer by adding the parts the spec still asks for:
- a "which pages" picker for every item;
- a guide-only image toggle, with guide images actually visible in the designer;
- empty image slots that say "Drop an image" and fill when a file is dropped on them;
- overlap warnings;
- the "Check your design for <paper>" note;
- a help topic.

**Architecture:**
- **Pure logic in `app/lib`:**
  - `design-draft.ts`: `setItemPages`, `setImageGuide`, `fillSlot`;
  - `designer-geometry.ts`: `overlapsSafeArea`, `slotAt`;
  - `page-settings.ts`: a `showGuides` override, so the designer's live render draws guide images. Documents never do.
- **Wiring:** the canvas, the side panel and the designer page wire these up.
- **Help:** a new `page-designer` topic in the help registry, with a `HelpButton` in the designer toolbar and on `/settings/pdf`.

**Tech Stack:** Nuxt 4 / Vue 3 / TypeScript strict, NuxtUI 4, Vitest, Typst sidecar.

**Spec:** `docs/superpowers/specs/2026-11-27-page-designer-design.md`. This stage covers:
- "Delivery" item 4;
- the `pages` rule and the Image bullets (guide only, empty slot) in "Items";
- the overlap warning in "What the canvas is";
- the paper-size note in "Document panel".

**Already merged:** stages 1–3 (v0.172.0, PR #373).

**Gaps from earlier stages, fixed here:**
- The designer's live render drops guide images (`page-settings.ts` `payloadFor`: `if (item.guide || !item.src) return null`), so a scanned pre-printed sheet is invisible while you design over it.
- Empty slots never show "Drop an image".

## Global Constraints

- **Gates:**
  - `bun` only;
  - `bun run lint` (add `--ignore-pattern ".claude/**" --ignore-pattern ".impeccable/**" --ignore-pattern ".superpowers/**"` if those trip it);
  - `bun run test`, `bun run verify:sql`, `bun run verify:pdf`;
  - `cargo test --lib`.
- **Code layout:**
  - Pure logic goes in `app/lib/*.ts` with a sibling `*.test.ts`.
  - Tabs, strict eslint.
  - Modals use `#body` / `#footer`.
  - A page has a single root node.
- **Units:** mm from the page's top-left.
- **Pages rule values** (unchanged): `every` (default), `first` (first page only), `not_first` (every page except the first). Picker labels: **Every page**, **First page**, **After the first**.
- **Guide-only:** spec wording "Guide only — not printed".
  - Guides show in the designer and are never printed: not in documents, Preview as PDF, or template thumbnails.
- **Empty slot:** an image item with `src: null`.
  - It shows "Drop an image" in the designer and prints nothing.
  - Filling it keeps its `x`, `y`, `w`, `h`, `pages` and `guide`. Typst draws images with `fit: "contain"`.
- **Overlap:** an item that overlaps the safe area gets a warning in the designer but is allowed ("watermarks overlap on purpose").
  - Guide images never warn.
  - Touching an edge is not overlapping.
- **Paper change:** the design scales as it does today (`scaleDesign`). Then the designer shows "Check your design for <paper label>" until you dismiss it, Save, or undo back to the old paper.
- **No schema change:** no migration and no `SCHEMA_VERSION` bump.
- **Version:** bump to **0.173.0** in all of these:
  - `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - the `sakoram_billing` line of `src-tauri/Cargo.lock`
- **Don't commit the user's uncommitted docs:**
  - `CLAUDE.md`
  - `PRODUCT.md`
  - `docs/agents/**`
  - `src-tauri/migrations/CLAUDE.md`
  - `src-tauri/src/drive/CLAUDE.md`

  Stage files by explicit path.

## Review Focus

1. **A guide image is never printed.** Real PDFs, Preview as PDF and the template thumbnails leave it out. The designer's page view draws it. Pinned by `buildPageSettings` tests with and without `showGuides` (Task 1).
2. **Dropping a file on an empty slot fills that slot.** It doesn't ask "image or background?". The slot keeps its box, pages rule and guide flag, so a pre-printed scan stays guide-only. Dropping anywhere else still asks. Pinned by `slotAt` and `fillSlot` tests (Task 2) and the manual check (Task 4).
3. **Changing an item to "First page" while viewing Page 2.** The item leaves the canvas, but it stays selected and the panel says why ("Not on page 2"), so it isn't lost. Manual check (Task 4).
4. **The overlap warning.** It flags only a real overlap: an item whose edge lies exactly on a margin doesn't warn, and neither does a guide image. Pinned by `overlapsSafeArea` tests (Task 2).
5. **Undo back to the old paper hides the "Check your design" note,** and so does Save. Manual check (Task 4).

---

### Task 1: The designer's render draws guide images

**Files:**
- Modify: `app/lib/page-settings.ts`:
  - `PageSettingsOverride` (~:55);
  - `payloadFor` (~:83, the `image` arm);
  - `buildPageSettings` (~:107).
- Modify: `app/lib/page-settings.test.ts`
- Modify: `app/lib/sample-pdf.ts`: the `sampleStationeryPreviewPayload` opts (~:145)
- Modify: `app/pages/designer.vue`: `designerPayload`
- Modify: `scripts/verify-pdf-render.ts` + `scripts/pdf-render-baselines.json`

**Interfaces:**
- Produces:
  - `PageSettingsOverride.showGuides?: boolean`
  - `sampleStationeryPreviewPayload(…, opts: { showEmptyFields?: boolean, showGuides?: boolean })`

- [ ] **Step 1: Write the failing tests** in `page-settings.test.ts`, on the existing `STORED` fixture (it has `guidescan001`, a `guide: true` PNG, and `emptyslot001`, `src: null`):
  - `buildPageSettings(settings()).items` has no `guidescan001`. This already passes; keep it as the pin.
  - `buildPageSettings(settings(), { showGuides: true }).items` contains `{ type: "image", id: "guidescan001", src: "item", ext: "png" }`.
  - It still has no `emptyslot001`.

- [ ] **Step 2: Run** `bun run test app/lib/page-settings`. Expected: the `showGuides` case FAILS.

- [ ] **Step 3: Implement.**
  - `payloadFor` drops a guide image only when `showGuides` is false. Empty slots are always dropped.
  - Thread the flag the same way `showEmptyFields` is threaded.
  - `designerPayload` passes `{ showEmptyFields: true, showGuides: true }`.

- [ ] **Step 4: Add a render case.** Add `designer-guide-scan`: `sampleStationeryPreviewPayload` on the Pre-printed paper template, with its guide slot filled by the fixture artwork (`ARTWORK_ID`, `png`, `guide` kept `true`, as `withArtwork` does for the background slot), with `{ showGuides: true }`, `multipage: true, pages: 2`.
  - Run `bun run verify:pdf --only designer-guide-scan --keep <scratch dir>`. Look at page 1: the artwork is drawn.
  - Then `--update`, and a plain run. Expected: all pass, with only the new case added.

- [ ] **Step 5: Commit** `feat(designer): guide images show in the designer, never in documents`

---

### Task 2: Pure helpers: pages rule, guide flag, filling a slot, overlap, slot hit-test

**Files:**
- Modify: `app/lib/design-draft.ts`, `app/lib/design-draft.test.ts`
- Modify: `app/lib/designer-geometry.ts`, `app/lib/designer-geometry.test.ts`

**Interfaces:**
- Consumes: `itemBox(item, measuredH?)`, `itemOnPage(rule, page)`.
- Produces:
  - `setItemPages(design: PageDesign, id: string, pages: PagesRule): PageDesign`
  - `setImageGuide(design: PageDesign, id: string, guide: boolean): PageDesign`, for images only
  - `fillSlot(design: PageDesign, slotId: string, newId: string, ext: ImageExt): PageDesign`. The slot becomes `{ ...slot, id: newId, src: { kind: "file", ext } }`, keeping its box, `pages`, `guide` and stacking position. A non-slot `slotId` returns the design unchanged.
  - `overlapsSafeArea(box: MmRect, design: PageDesign): boolean`. The safe area is `{ x: left, y: top, w: W − left − right, h: H − top − bottom }` on the design's paper. It returns true only for a positive-area intersection.
  - `slotAt(design: PageDesign, page: 1 | 2, xMm: number, yMm: number): string | null`. It returns the topmost item (last in `items`) that is an empty image slot drawn on `page` and contains the point (edges inclusive), else `null`.

- [ ] **Step 1: Write the failing tests.**
  - `design-draft.test.ts`:
    - `setItemPages(withItems(rule), "rule00000001", "first").items[0].pages === "first"`.
    - `setImageGuide` sets `guide` on an image and leaves a line unchanged (`toBe` the same design when the id is the line's).
    - `fillSlot`: a slot `{ x: 0, y: 0, w: 210, h: 297, pages: "every", src: null, guide: true }` becomes `{ id: newId, x: 0, y: 0, w: 210, h: 297, pages: "every", guide: true, src: { kind: "file", ext: "png" } }`, at the same index.
    - `fillSlot` on an image that already has a file returns the design unchanged.
  - `designer-geometry.test.ts` (**Review Focus 4**), A4 with margins `{ top: 40, right: 18, bottom: 25, left: 18 }`:
    - `overlapsSafeArea({ x: 18, y: 10, w: 100, h: 30 }, d)` is false (its bottom edge is exactly on the top margin);
    - `{ x: 18, y: 10, w: 100, h: 31 }` is true;
    - `{ x: 0, y: 0, w: 210, h: 297 }` is true;
    - `{ x: 0, y: 280, w: 210, h: 10 }` is false.
  - **Review Focus 2:** on a design whose items are `[emptyPageSlot (0,0,210,297, src null), logo with a file at (168,12,24,24)]`:
    - `slotAt(d, 1, 100, 100)` is the slot's id;
    - `slotAt(d, 1, 170, 20)` is the slot's id (the logo has a file and is not a slot);
    - with the slot's `pages: "not_first"`, `slotAt(d, 1, 100, 100)` is `null`.

- [ ] **Step 2: Run** `bun run test app/lib/design-draft app/lib/designer-geometry`. Expected: FAIL, functions not defined.

- [ ] **Step 3: Implement** the five functions in the files named above.

- [ ] **Step 4: Run** `bun run test`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(designer): pages rule, guide flag, slot filling and overlap helpers`

---

### Task 3: The canvas: empty slots, guide and overlap badges, drops onto slots

**Files:**
- Modify: `app/components/PageDesignerCanvas.vue`
- Modify: `app/pages/designer.vue`: the `@drop` handler and `addFile`

**Interfaces:**
- Consumes: `overlapsSafeArea`, `slotAt`, `fillSlot` (Task 2); `uploader.upload(file, paper, { background })`.
- Produces: the canvas emits `drop: [file: File, slotId: string | null]`.

- [ ] **Step 1: Empty slot.** An image box with `src: null` draws:
  - a dashed `border-(--ui-border-accented)` outline;
  - inside it, a centred `i-lucide-image-plus` icon and "Drop an image", or "Drop a scan of your paper" when it's a guide slot;
  - all of it `pointer-events-none`, so the box still selects and drags.

- [ ] **Step 2: Badges.** In the box's top-left corner:
  - A guide image's badge reads "Guide · not printed" (replacing "Guide").
  - A non-guide item where `overlapsSafeArea(itemBox(item, measured), design)` is true gets a small amber `i-lucide-triangle-alert` badge in its top-right corner, `title="Overlaps the safe area: the document prints on top of it"`.
  - Badges never take the pointer.

- [ ] **Step 3: Drop onto a slot.** `onDrop` turns the drop point into mm, from the page element's `getBoundingClientRect()` and `scale`, then emits `drop` with `slotAt(design, page, x, y)`. In `designer.vue`:
  - **On a slot:** upload the file with `{ background: slot covers the page }` and `apply(d => fillSlot(d, slotId, added.id, added.ext))`. Track the upload in `uploaded` as `addFile` does, then select the filled item.
  - **Elsewhere:** set `pendingDrop` (the existing "Add this file as…" question).

- [ ] **Step 4: The panel's Replace… on an empty slot.** It reads "Choose image…" and fills through `fillSlot`, not `replaceImage`, so the box is kept.

- [ ] **Step 5: Run** lint and `bun run test`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(designer): empty slots invite a drop; guide and overlap badges`

---

### Task 4: The panel: pages picker, guide toggle, overlap note, paper note

**Files:**
- Modify: `app/pages/designer.vue`: the selected-item panel, the Paper section, `setPaper` (~:638), `save`, and the area above the canvas

**Interfaces:**
- Consumes: `setItemPages`, `setImageGuide`, `overlapsSafeArea` (Task 2); `itemOnPage`.

- [ ] **Step 1: Pages, for every item kind,** placed above Layer.
  - A "Pages" label and a three-segment `.segmented` toggle: **Every page** / **First page** / **After the first**. `apply(d => setItemPages(d, id, rule))`.
  - When `!itemOnPage(selected.pages, page)`, add a muted line under it: "Not on page {page}. Switch to Page {other} to see it on the page." Selection is kept.

- [ ] **Step 2: Guide only, for images.** Add a `USwitch` "Guide only — not printed" to the Image file group, with the hint "For lining things up with pre-printed paper: shown here, never printed." It calls `apply(d => setImageGuide(d, id, value))`.

- [ ] **Step 3: Overlap note.** When the selected item overlaps (the same rule as the badge), add a soft `UAlert` with `color="warning"`, `variant="subtle"`, `size="sm"` and `icon="i-lucide-triangle-alert"`: "Overlaps the safe area. The document prints on top of it, which is fine for a watermark."

- [ ] **Step 4: Paper note.**
  - `setPaper` records `paperNote = paper` (a `ref<PaperSize | null>`) after scaling.
  - A thin `UAlert` with `color="warning"` and `variant="subtle"` appears above the canvas, between the toolbar and `PageDesignerCanvas`: "Check your design for {label}. Everything was scaled to fit the new paper." Use `PAPER_SIZES` for the label. It has a close button.
  - It hides when dismissed, after `save` succeeds, or when `draft.design.paper !== paperNote` (undo).

- [ ] **Step 5: Run** lint and `bun run test`. Expected: PASS.

- [ ] **Step 6: Check by hand in `bun run tauri:dev`:**
  - **Review Focus 2:** pick Pre-printed paper and drop a PNG on its slot. It fills without asking, keeps the "Guide · not printed" badge, shows on the page, and Preview as PDF leaves it out.
  - **Review Focus 3:** on Page 2, set a text box to First page. It disappears from the canvas, and the panel says "Not on page 2".
  - **Review Focus 5:** switch A4 → A5. The note shows; Ctrl+Z hides it; switch again and Save hides it.
  - Drag a text box into the safe area: the amber badge and the panel note appear.

- [ ] **Step 7: Commit** `feat(designer): pages picker, guide toggle, overlap and paper notes`

---

### Task 5: Help topic

**Files:**
- Create: `app/help/topics/page-designer.vue`
- Modify: `app/help/index.ts`: a new entry in the `general` group, after `backup-google-drive`
- Modify: `app/pages/designer.vue`: a `<HelpButton slug="page-designer" size="sm" />` at the right end of the toolbar, before Discard
- Modify: `app/pages/settings/pdf.vue`: a `HelpButton` beside the "Open page designer" button

**Registry entry:**
- `slug: "page-designer"`
- `title: "Designing your page"`
- `summary: "Lay out your letterhead, footer and page numbers once, for every document: templates, images and backgrounds, text with company fields, the safe area, which pages things appear on, guide-only scans of pre-printed paper, and keyboard shortcuts."`
- `category: "general"`
- `icon: "i-lucide-layout-template"`
- `relatedSlugs: ["invoices", "letters"]` when a `letters` topic exists, else `["invoices", "bookkeeping-basics"]`

**Topic content:** written in the shape `security.vue` uses (`HelpSection` blocks, plain sentences, no marketing). The sections:
1. **What the page design is:** one design for every document; the app lays out the document inside the safe area; items sit behind it.
2. **Start from a template:** the seven, and that it replaces the design (undo works).
3. **Adding things:**
   - Image, Background;
   - Text: the fields table from `PDF_TOKENS`, and how empty fields drop out of PDFs but show faded here;
   - Page number: one per design, three formats, hide on one-page documents;
   - Line.
4. **Moving and sizing:**
   - drag, handles, snapping (hold Alt to turn it off);
   - arrows nudge 1 mm, Shift + arrow 5 mm;
   - Ctrl+D duplicate, Delete;
   - Ctrl+Z / Ctrl+Y;
   - H or hold Space to pan;
   - zoom;
   - Ctrl+S save.
5. **The safe area and the printer margin:** the dashed box, dragging guides, the 5 mm printer band, and overlap warnings.
6. **Which pages:** Every page / First page / After the first, and the Page 1 / Page 2 switch.
7. **Pre-printed paper:** put a scan in the guide slot (Guide only — not printed), then line things up against it.
8. **Saving:** Save / Discard; closing asks; switching or locking the business closes the designer.

- [ ] **Step 1: Write the topic, the entry and the two buttons.**

- [ ] **Step 2: Run** lint. Expected: clean. Then open `/help` in `tauri:dev`: the topic is listed, its page renders, and both `?` buttons open it.

- [ ] **Step 3: Commit** `docs(help): designing your page`

---

### Task 6: Version bump and gates

**Files:** `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`

- [ ] **Step 1: Bump to 0.173.0** in all four.

- [ ] **Step 2: Run** all gates. Expected:
  - lint clean;
  - tests pass;
  - `verify:sql` ALL CHECKS PASSED;
  - `verify:pdf` ALL RENDERS MATCH;
  - `cargo test --lib` ok.

- [ ] **Step 3: Commit** `chore: bump version to 0.173.0`
