# Page designer, stage 2: the designer window — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A separate "Page designer" window where the user edits the business's page design on the real rendered page:
- add, drag, resize, snap and crop images;
- move, resize and delete any item;
- drag the safe area;
- pick a template, the paper, the Document style, the accent and the font;
- undo and redo;
- Preview as PDF;
- Save or Discard.

`/settings/pdf` becomes a thumbnail plus an "Open page designer" button.

**Architecture:**
- **Its own app.** The designer is a second Tauri webview (label `designer-main`, route `/designer`), built like Help. It runs its own Nuxt app and Pinia, edits a **draft** `PageDesign` in memory, and writes the database only on Save.
- **What you see.** The page is the real Typst render (`render_document_page_png`, now able to render page 2). HTML boxes for every item, and draggable safe-area guides, sit on top of it.
- **Pure logic in `app/lib`.** Draft operations, geometry, snapping, history and file bookkeeping are pure modules there; the page and canvas only wire them up.
- **Cross-window coordination:**
  - On Save, the designer tells the main window (`emitTo("main", "page-design:saved")`) and main reloads its settings.
  - Rust closes the designer whenever the business is switched, closed, locked or re-encrypted, so it can never write into the wrong (or a sealed) database.

**Tech Stack:** Nuxt 4 / Vue 3 / TypeScript strict, NuxtUI 4, Pinia, Vitest, Tauri 2 (`@tauri-apps/api/webviewWindow`, `event`), Rust, Typst sidecar.

**Spec:** `docs/superpowers/specs/2026-11-27-page-designer-design.md` (the "Delivery" stage 2, "The designer window", "Editing"). Stage 1 (`docs/superpowers/plans/2026-11-27-page-designer-stage-1.md`) is merged: `page-design.ts`, `design-templates.ts`, `page-settings.ts`, `usePageDesign.ts`, `stage_page_items` and `design-items` all exist.

## Global Constraints

- `bun` only. Gates:
  - `bun run lint` (if `.claude/**` or `.impeccable/**` trip it, use `--ignore-pattern` for each);
  - `bun run test`, `bun run verify:sql`, `bun run verify:pdf`;
  - `cargo test --lib` in `src-tauri`.
- Pure logic lives in `app/lib/*.ts` with a sibling `*.test.ts`, never in a store or component.
- Tabs and the strict eslint config apply. Modals use the `#body` / `#footer` slots, never `#content`.
- Positions and sizes are in mm from the page's top-left. Font size and line thickness are in pt.
- Item ids match `ITEM_ID_PATTERN` (`app/lib/page-design.ts`). Image files live at `stationery/item-<id>.<ext>`, written through `saveBusinessAsset(tenantId, itemAssetKind(id), …)`.
- **A file under a saved design is never overwritten before Save.** Replacing or cropping an image makes a NEW item id, and its own new file.
- Window label: `designer-main`. Route: `/designer`. Window title: "Page designer — {business name}". Size: 1400×900, minimum 1100×700, `decorations: false`, `dragDropEnabled: false`.
- Event names: `page-design:saved` (designer → main).
- Raster uploads are capped at `artworkPixelSize(paper)` (300 DPI at the page size), via `downscaleSize`.
- Editing scope, from the spec: select one item at a time; drag; resize from the handles (images keep their proportions); snap to the page edges, the centre, the safe area and other items' edges; nudge with the arrow keys (Shift for 5 mm); duplicate; delete; bring forward / send back; undo/redo for as long as the window is open; rulers and zoom. **Not in scope:** multi-select, rotation, grouping.
- **Stage 3 owns property editing** for text, page numbers and lines: their text, style, format and colour. Stage 2 can select, move, resize (text width, line length), duplicate, delete and reorder them, but not edit their properties.
- Bump the version to **0.171.0** in `package.json` (line 4), `src-tauri/Cargo.toml` (line 6), `src-tauri/tauri.conf.json` (line 35) and `src-tauri/Cargo.lock` (the `sakoram_billing` line).
- Don't commit the user's uncommitted docs: `CLAUDE.md`, `PRODUCT.md`, `docs/agents/**`, `src-tauri/migrations/CLAUDE.md`, `src-tauri/src/drive/CLAUDE.md`. Stage with explicit paths, never a bare folder.

## Review Focus

1. **The business is switched, closed, locked or re-encrypted from the main window while the designer is open.** The designer window closes, nothing is saved into the wrong database, and no error dialog appears. Pinned by the Rust helper's test (Task 1) plus the manual check in Task 9.
2. **Closing the designer with unsaved changes.** It asks Save / Discard / Cancel. Discard removes every file uploaded in that session that the saved design doesn't use. Save removes the files the draft dropped. Pinned by `filesToRemove` tests (Task 3).
3. **An image is uploaded, undone, then saved.** Its file is removed on Save, not left orphaned. Pinned by a `filesToRemove` test (Task 3).
4. **An item is dragged or resized past the page edge.** It stays on the page, at least 5 mm of it visible and its size at least the minimum. Pinned by geometry tests (Task 2).
5. **The main window's `/settings/pdf` is open while the designer saves.** Main's thumbnail and settings update without a reload. Pinned by the manual check in Task 9.

---

### Task 1: Rust — render page N, close the designer on business changes

**Files:**
- Modify: `src-tauri/src/pdf.rs`: `render_document_page_png` (~:554-570), which passes `--pages 1` at ~:563; tests at the bottom.
- Create: `src-tauri/src/designer.rs`
- Modify: `src-tauri/src/lib.rs` (`mod designer;`)
- Modify the commands that change which database is usable:
  - `src-tauri/src/tenants.rs`: `set_active_tenant`, `clear_active_tenant`, `delete_tenant`, `forget_tenant`;
  - `src-tauri/src/vault_fs.rs`: `lock_tenant` :273, `lock_all` :305, `enable_tenant_encryption` :249, `disable_tenant_encryption` :292;
  - `src-tauri/src/data_io.rs`: the import command that replaces a business.
- Modify: `src-tauri/capabilities/main.json` (`windows`: add `"designer-*"`)

**Interfaces:**
- Produces:
  - `render_document_page_png(app, data: Value, ppi: u32, page: Option<u32>)`. JS passes `{ data, ppi, page }`; `page` defaults to 1.
  - `pub(crate) fn designer::close(app: &AppHandle)`.
  - `pub const DESIGNER_LABEL: &str = "designer-main"`.

- [ ] **Step 1: Write the failing Rust tests** in `pdf.rs`:
  - `page_arg(None) == "1"`, `page_arg(Some(2)) == "2"`, `page_arg(Some(0)) == "1"`.
  - In `designer.rs`: `DESIGNER_LABEL == "designer-main"`, and the label matches the capability pattern (`DESIGNER_LABEL.starts_with("designer-")`).
- [ ] **Step 2: Run** `cargo test --lib`. Expected: compile FAIL (`page_arg` missing).
- [ ] **Step 3: Implement.**
  - `fn page_arg(page: Option<u32>) -> String` (0 or none → "1"), used in place of the literal `"1"` in the `--pages` argument.
  - `designer::close(app)`: `app.get_webview_window(DESIGNER_LABEL)` → `.destroy()`, ignoring a missing window or an error. Call it first thing in each command listed under **Files**.
  - Add `"designer-*"` to the capability's `windows`.
- [ ] **Step 4: Run** `cargo test --lib`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(pdf): render any page of the live preview; close the designer on business changes`.

---

### Task 2: Designer geometry (pure)

**Files:**
- Create: `app/lib/designer-geometry.ts`, `app/lib/designer-geometry.test.ts`
- Port from `git show 3005ffe:app/lib/stationery-geometry.ts`:
  - constants `CSS_PX_PER_MM`, `SNAP_DISTANCE_PX` (6), `ZOOM_LEVELS` (`[0.5,0.75,1,1.25,1.5,2,3,4]`);
  - `mmToPx`, `pxToMm`, `fitScale` :77-81, `stepZoom` :84-87, `snapValue` :89-105, `rulerTicks` :273-297.
  - Bring their tests along from `git show 3005ffe:app/lib/stationery-geometry.test.ts`.

**Interfaces:**
- Consumes: `PageDesign`, `DesignItem`, `MarginsMm` (`page-design.ts`); `resolvePaperSize`.
- Produces:
  ```ts
  export interface MmRect { x: number, y: number, w: number, h: number }
  export type Handle = "nw" | "ne" | "sw" | "se" | "w" | "e" | "end";
  export const MIN_ITEM_MM = 5;       // smallest width/height/length
  export const KEEP_VISIBLE_MM = 5;   // of an item, always on the page
  export function itemBox(item: DesignItem): MmRect;            // text/page number: h = lines × size × 0.3528 × 1.25 (lines = text.split("\n").length, page number 1); line: thickness box ≥ 2 mm
  export function handlesFor(item: DesignItem): Handle[];        // image: 4 corners; text/page_number: "w","e"; line: "end"
  export function snapTargets(design: PageDesign, excludeId: string | null): { xs: number[], ys: number[] }; // page edges + centre, safe area edges, other items' edges + centres
  export function moveItem(item: DesignItem, dx: number, dy: number, design: PageDesign, thresholdMm: number): DesignItem;
  export function resizeItem(item: DesignItem, handle: Handle, dx: number, dy: number, design: PageDesign, thresholdMm: number): DesignItem;
  export function nudgeItem(item: DesignItem, dir: "up" | "down" | "left" | "right", stepMm: number, design: PageDesign): DesignItem;
  export function dragMargin(margins: MarginsMm, side: keyof MarginsMm, deltaMm: number, paper: PaperSize, thresholdMm: number): MarginsMm; // keeps ≥ 40 mm of safe area each way (stage-1 MIN_SAFE_AREA_MM)
  ```

- [ ] **Step 1: Write the failing tests**, plus the ported ones:
  - `itemBox` of a 10 pt, two-line text item `{x:18,y:13,w:140}` → `{x:18, y:13, w:140, h: 2*10*0.3528*1.25}`. Of a horizontal line `{x:18,y:40,length:174,thickness:2}` → `w:174`, `h:2`.
  - `moveItem` on an image `{x:100,y:100,w:20,h:20}` by `(+3,+0)` with a 1 mm threshold and no target near → `x:103` (rounded to the 1 mm step).
  - The same image moved so its left edge lands 0.4 mm from the safe area's left (18) → snaps to `x:18`. Moved so its centre lands within the threshold of the page centre (105) → `x: 105 - 10`.
  - **Review Focus 4:**
    - `moveItem` by `(-500,-500)` → `x = KEEP_VISIBLE_MM - w` and `y = KEEP_VISIBLE_MM - h` (just visible).
    - `resizeItem(image, "se", +1000, 0)` keeps the aspect, and `w` never exceeds the page width.
    - `resizeItem(image, "nw", +1000, +1000)` → `w === MIN_ITEM_MM` (aspect kept: `h === MIN_ITEM_MM * h0/w0` when it's the larger side, else the smaller side is clamped to `MIN_ITEM_MM`).
  - `resizeItem(text, "e", +10, 0)` → `w + 10`, with `x` unchanged. `resizeItem(line, "end", +10, 0)` → `length + 10`.
  - `nudgeItem(…, "left", 5, …)` → `x - 5`.
  - `dragMargin(m, "top", +500, "a4", 1)` → `top === 297 - m.bottom - 40`.
- [ ] **Step 2: Run** `bun run test app/lib/designer-geometry.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Snapping uses `snapValue` on each moving edge and the centre; the closest target within the threshold wins.
  - Clamping comes after snapping.
  - Image corner resize anchors the opposite corner and keeps `w/h`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat(designer): geometry, snapping, rulers`.

---

### Task 3: Draft operations and file bookkeeping (pure)

**Files:**
- Create: `app/lib/design-draft.ts`, `app/lib/design-draft.test.ts`

**Interfaces:**
- Consumes: Task 2 `MmRect`, `itemBox`; `page-design.ts` types, `imageFileIds`, `ITEM_ID_PATTERN`.
- Produces:
  ```ts
  export function addImage(design: PageDesign, id: string, ext: ImageExt, aspect: number): PageDesign; // width = min(60, safe-area width); centred on the safe area's top band
  export function replaceImage(design: PageDesign, oldId: string, newId: string, ext: ImageExt, aspect: number): PageDesign; // same x/y/w, h = w / aspect, same pages/guide, same z-order
  export function duplicateItem(design: PageDesign, id: string, newId: string): PageDesign; // +5 mm right and down, inserted right above the original
  export function deleteItem(design: PageDesign, id: string): PageDesign;
  export function reorderItem(design: PageDesign, id: string, dir: "forward" | "backward"): PageDesign; // one step in items[] (later = drawn on top)
  export function updateItem(design: PageDesign, item: DesignItem): PageDesign;
  export function setMargins(design: PageDesign, margins: MarginsMm): PageDesign;
  export function filesToRemove(input: { saved: PageDesign | null, draft: PageDesign, uploaded: readonly string[], outcome: "save" | "discard" }): string[];
  ```
  - `filesToRemove`:
    - **save** → (`imageFileIds(saved)` ∪ `uploaded`) − `imageFileIds(draft)`;
    - **discard** → `uploaded` − `imageFileIds(saved)`.
    - The result is deduped and sorted.

- [ ] **Step 1: Write the failing tests**:
  - `addImage` on an A4 Blank design (margins 20/18/20/18), aspect 2 → `{ w: 60, h: 30, x: 75, src: { kind: "file", ext } }`, appended last.
  - `replaceImage` keeps `x`, `y`, `w`, `pages` and `guide` and the index, sets `h = w / aspect`, and carries the new id.
  - `duplicateItem` → the copy is at index+1, `x + 5`, `y + 5`, with the new id.
  - `reorderItem` moves forward and backward by one step; it does nothing at either end.
  - `filesToRemove`, **Review Focus 2/3**:
    - save: saved `{a}`, draft `{b}`, uploaded `[b, c]` → `[a, c]` (c was uploaded and then undone).
    - discard: saved `{a}`, draft `{b}`, uploaded `[b, c]` → `[b, c]`.
    - discard with nothing uploaded → `[]`.
    - save with a null saved design and an uploaded image in the draft → `[]`.
- [ ] **Step 2: Run** `bun run test app/lib/design-draft.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Every function returns a new design and never mutates its input.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat(designer): draft operations and file bookkeeping`.

---

### Task 4: Undo / redo history (pure)

**Files:**
- Create: `app/lib/design-history.ts`, `app/lib/design-history.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface History<T> { past: T[], present: T, future: T[] }
  export const HISTORY_LIMIT = 100;
  export function startHistory<T>(present: T): History<T>;
  export function record<T>(h: History<T>, next: T): History<T>;   // no-op when JSON-equal to present; clears future; drops the oldest past beyond HISTORY_LIMIT
  export function undo<T>(h: History<T>): History<T>;
  export function redo<T>(h: History<T>): History<T>;
  export const canUndo: <T>(h: History<T>) => boolean;
  export const canRedo: <T>(h: History<T>) => boolean;
  ```
  - `T` is the designer's whole draft: `{ design: PageDesign, paper, layout, accent, font }`, so a paper or style change undoes too.

- [ ] **Step 1: Failing tests:**
  - `record`, then `undo`, then `redo` round-trips.
  - `record` after an `undo` clears `future`.
  - Recording an equal value adds nothing.
  - 150 records keep `HISTORY_LIMIT` past entries.
  - `undo` on an empty past returns the same history.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The page records once per gesture (on pointerup or the end of a key nudge), not per pointermove.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat(designer): undo / redo history`.

---

### Task 5: Template preparation, and the window plumbing

**Files:**
- Modify: `app/composables/usePageDesign.ts`. Split `applyTemplate` into `prepareTemplate` plus the save step. Delete `saveMargins` once Task 8 no longer uses it.
- Create:
  - `app/composables/usePageDesignerWindow.ts` (modelled on `app/composables/useHelpWindow.ts`);
  - `app/layouts/designer-window.vue` (modelled on `app/layouts/help-window.vue:14`): `<TitleBar :show-sidebar-toggle="false" :show-lock-button="false" :show-backup-button="false" />`, then a full-height slot;
  - `app/plugins/page-design-sync.client.ts`.
- Modify:
  - `app/plugins/window-title.client.ts`: only the `main` window follows the business title; other windows keep the title they were created with.
  - `app/middleware/tenant.global.ts` and `app/lib/tenant-route.ts` (+ its test, if one exists; otherwise create `app/lib/tenant-route.test.ts`): on `/designer`, a guard redirect means "close this window" instead.

**Interfaces:**
- Produces:
  ```ts
  // usePageDesign.ts
  prepareTemplate(key: DesignTemplateKey, paper: PaperSize): Promise<{ design: PageDesign, documentStyle: PdfLayoutKey | null, uploaded: string[] }>; // logo spots materialised via logoSpotPlan; files written are listed in `uploaded`
  applyTemplate(key, { keepDocumentStyle }): Promise<void>; // unchanged behaviour, now built on prepareTemplate
  // usePageDesignerWindow.ts
  export const DESIGNER_WINDOW_LABEL = "designer-main";
  export function usePageDesignerWindow(): { open: () => Promise<void> }; // focus-or-create; outside Tauri: router.push("/designer")
  // tenant-route.ts
  export function isDesignerRoute(path: string): boolean;      // "/designer" and "/designer/…"
  ```
- `page-design-sync.client.ts`: when `getCurrentWindow().label === "main"`, `listen("page-design:saved", () => useSettingsStore().load())`.
- `/settings/pdf` (the stage-1 page) gets a temporary **Open page designer** button in its Design card, so Task 8 can be checked. Task 9 reshapes the page around it.
- If `emitTo` is refused at runtime, add `core:event:allow-emit-to` to `capabilities/main.json` alongside `core:event:default`. A capability change needs a Rust rebuild.

- [ ] **Step 1: Failing test** in `app/lib/tenant-route.test.ts`: `isDesignerRoute("/designer") === true`, `isDesignerRoute("/designer?x=1")`'s path form `"/designer"` → true, `isDesignerRoute("/settings/pdf") === false`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The middleware: when `isDesignerRoute(to.path)` and `resolveTenantGuard` would redirect, call `getCurrentWindow().destroy()` and abort navigation, instead of redirecting into `/welcome` or `/unlock`.
  - Window options (Global Constraints) plus `url: "/designer"`.
  - `open()` re-focuses an existing window (show / unminimize / setFocus, each `.catch`).
- [ ] **Step 4: Run** `bun run test` and `bun run lint`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(designer): window plumbing, settings sync, template preparation`.

---

### Task 6: The canvas component

**Files:**
- Create: `app/components/PageDesignerCanvas.vue`
- Modify: `app/composables/useLivePagePreview.ts`. Add option `page?: () => number` and pass `page` to `render_document_page_png`. Include it in the debounce key.
- Port from `git show 3005ffe:app/components/StationeryEditorModal.vue`:
  - the rulers :10-51 (`RULER_PX=22`, `GUTTER_PX=24`);
  - zoom :194-205 and :384-416 (ResizeObserver + `fitScale`);
  - guide drag :105-130 and :421-446;
  - box pointer-capture drag :67-103 and :475-503.

**Interfaces:**
- Props:
  ```ts
  design: PageDesign, paper: PaperSize, selectedId: string | null,
  renderUrl: string | null, rendering: boolean, page: 1 | 2
  ```
- Emits:
  ```ts
  select: [id: string | null]
  change: [design: PageDesign]   // live, every pointermove
  commit: []                      // gesture finished — the page records history
  drop: [file: File]              // a file dropped on the page
  zoom: [scale: number]           // px per mm, so the page can pick the render ppi
  ```
- Draws:
  - the render (`<img>` stretched to the page box);
  - a dashed safe-area box with four draggable guides (`dragMargin`);
  - one absolutely positioned box per **printed-on-this-page** item (`itemOnPage(item.pages, page)`), with a hover outline, a selected outline and the handles from `handlesFor`;
  - guide-only images shown at 40 % opacity with a "Guide" tag.
- Keyboard on the selected box:
  - arrows nudge 1 mm (Shift: 5 mm) and `commit`;
  - Delete / Backspace are handled by the page, not here.
- Snapping threshold: `SNAP_DISTANCE_PX / scale` mm. Holding Alt disables snapping.

- [ ] **Step 1:** Build the component against Tasks 2–3's functions. It holds no business logic of its own.
- [ ] **Step 2:** `bun run lint` → clean, and `bun run test` → PASS (the composable change keeps the existing tests green).
- [ ] **Step 3: Commit** — `feat(designer): page canvas with rulers, zoom, guides and item handles`.

---

### Task 7: Image upload pipeline

**Files:**
- Create: `app/lib/design-image.ts` + test (pure), `app/composables/useDesignImageUpload.ts`

**Interfaces:**
- Pure:
  ```ts
  export function uploadPlan(fileName: string, mime: string): { ext: ImageExt, raster: boolean } | { error: string };
  // PNG/JPEG/SVG/PDF accepted; anything else → { error: "Use a PNG, JPEG, SVG or PDF image." }
  export function rasterTarget(natural: { w: number, h: number }, paper: PaperSize): { w: number, h: number }; // downscaleSize(natural, artworkPixelSize(paper))
  ```
- Composable:
  ```ts
  useDesignImageUpload(): { upload(file: File, paper: PaperSize): Promise<{ id: string, ext: ImageExt, aspect: number } | null>, cropOpen, cropBlob, onCropped, onCropCancel }
  ```
  - **Raster:** decode, then open `ImageCropModal` (free aspect, `maxOutput: artworkPixelSize(paper)`, output PNG for PNG and JPEG for JPEG). Applying writes the cropped blob; cancelling uploads nothing.
  - **SVG:** written as-is. If `svgHasLiveText`, warn with the stage-1 card copy: "This SVG still contains live text … convert text to outlines". Aspect from `svgAspect`, or 1.
  - **PDF:** written as-is. Aspect from `render_stationery_artwork_png({ ppi: 20, artwork: "item-<id>" })`'s PNG natural size.
  - Every write gets a fresh `newItemId()`, and the caller adds that id to its `uploaded` list.

- [ ] **Step 1: Failing tests:**
  - `uploadPlan("a.JPG", "image/jpeg")` → `{ ext: "jpg", raster: true }`; `"b.svg"` → `{ ext: "svg", raster: false }`; `"c.webp"` → the error.
  - **Review Focus "huge photo":** `rasterTarget({ w: 6000, h: 8000 }, "a4")` → fits inside 2480×3508 with the aspect kept (3508 high).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(designer): image upload pipeline`.

---

### Task 8: The designer page

**Files:**
- Create: `app/pages/designer.vue` (`definePageMeta({ layout: "designer-window", title: "Page designer" })`)

**Interfaces:**
- Consumes: Tasks 2–7, `effectiveDesign`, `parsePageDesign`, `sampleStationeryPreviewPayload`, `usePdfPreview`, `useLivePagePreview`, `DESIGN_TEMPLATES`, `PDF_LAYOUTS`, `PAPER_SIZES`, `BUNDLED_FONTS`, `PdfColorRow`, `ImageCropModal`, `PdfPreviewModal`.

- **State:**
  - `history: History<Draft>` (Task 4), where `Draft = { design, paper, layout, accent, font }`;
  - `saved: Draft` (from settings on load);
  - `uploaded: string[]`, `selectedId`, `page: 1 | 2`, `scale`;
  - `savedDesign: PageDesign | null`, the stored design, used for file bookkeeping (`filesToRemove`'s `saved`);
  - `baseline: Draft`, used for the dirty check.
  - On load:
    - with a stored design: `design = effectiveDesign(settings)`, and `baseline` = the draft.
    - with a NULL stored design: the draft starts as `prepareTemplate("classic", paper).design`, so the logo becomes a copied file as the spec says. Its file ids go into `uploaded`, `savedDesign` stays null, and `baseline` = that draft. Opening the designer alone doesn't show the save bar, and closing without saving removes the copy (discard).
- **Layout:** a full-height column of three bands.
  1. **Toolbar:**
     - Undo / Redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y);
     - zoom out / Fit / zoom in, plus the "% of actual size";
     - a `Page 1 | Page 2` segmented switch;
     - Preview as PDF;
     - on the right, Discard and Save. Save is primary and is disabled while clean.
  2. **Canvas:** Task 6, fed `useLivePagePreview(payload, { ppi: clamp(round(scale × 25.4 × devicePixelRatio), 20, 150), page: () => page })`. The payload is `sampleStationeryPreviewPayload(draftSettings)`, where `draftSettings` is the saved settings row with the draft's paper, layout, accent, font and `pdf_design` on top.
  3. **Side panel** (`w-80`, scrolls), in this order:
     - **Selected item**, when one is selected:
       - its kind, and X / Y / W (H for images, length for lines) as `UInputNumber` in mm, step 0.5;
       - Bring forward, Send back, Duplicate, Delete;
       - images also get Replace…, and Crop… for raster images only (both make a new id);
       - text, page-number and line items show "Editing text and style comes with the next update." (stage 3).
     - **Add:** an "Add image" button (a file picker), plus the hint "or drop an image on the page".
     - **Page:**
       - the Paper size buttons. Changing paper `scaleDesign`s the draft and records history.
       - Safe area: four `UInputNumber`s plus `StationeryMarginDiagram`.
     - **Document:** Document style (the `PDF_LAYOUTS` buttons), `PdfColorRow`, the Font `USelectMenu` (the stage-1 `fontOptions` grouping).
     - **Templates:** the seven buttons. Picking one asks "Replace your design with {label}? You can undo this." and, on confirm, puts `prepareTemplate`'s design into the draft (recording history and appending its `uploaded` ids). If it sets a Document style, that goes into the draft too.
- **Save:**
  1. `settings.save({ pdf_design, pdf_paper_size, pdf_layout, pdf_theme_color, pdf_font })`;
  2. remove `filesToRemove({ outcome: "save" })`, best effort;
  3. `uploaded = []`, `saved = draft`;
  4. `emitTo("main", "page-design:saved")`;
  5. toast "Page design saved".
- **Discard:** remove `filesToRemove({ outcome: "discard" })`, reset the history to `saved`, and clear `uploaded`.
- **Close request** (`getCurrentWindow().onCloseRequested`): when dirty, `preventDefault`, then a modal: "Save changes before closing?" with Save / Discard / Cancel. Save or Discard then `destroy()` the window.
- **Keys:**
  - Delete / Backspace remove the selected item, unless focus is in an input;
  - Escape clears the selection;
  - Ctrl+D duplicates;
  - Ctrl+S saves.

- [ ] **Step 1:** Build the page. `bun run lint` → clean, `bun run test` → PASS.
- [ ] **Step 2: Manual check** in `bun run tauri:dev`. Open the designer with the temporary "Open page designer" button Task 5 put on `/settings/pdf`. Then:
  - add a PNG and an SVG;
  - drag one to the page centre and check the snap;
  - resize from a corner;
  - undo twice, redo once;
  - switch to page 2;
  - Preview as PDF;
  - Save, then close and reopen: the design persists.
- [ ] **Step 3: Commit** — `feat(designer): the page designer`.

---

### Task 9: `/settings/pdf` becomes the launcher; Letters links; final checks

**Files:**
- Rewrite: `app/pages/settings/pdf.vue`. Keep:
  - the live preview of the **saved** design (no form; `useLivePagePreview` on `sampleStationeryPreviewPayload(store.settings)`, `deps: () => [store.settings?.pdf_design, store.logoSrc]`);
  - Preview as PDF.
  Add:
  - an **Open page designer** button (primary, `i-lucide-pencil-ruler`);
  - a one-line summary: "{paper label} · {Document style label} · {font}";
  - the Document protection signpost.
  Remove the template picker, safe area, Document style, accent and Font cards: they now live in the designer.
- Modify:
  - `app/lib/pdf-settings-sections.ts` (+ test): sections become **Page** and **Design** only. Font now lives in the designer.
  - `app/pages/settings/letters.vue`: the "Page design" card gets an "Open page designer" button.
  - `app/pages/letters/[id].vue`: its PDF-settings link text stays, and the link now points to `/settings/pdf`.
- Version bump to **0.171.0** (Global Constraints).

- [ ] **Step 1: Update** `pdf-settings-sections.test.ts` to expect `[["#page","Page"],["#design","Design"]]`, then run it → FAIL.
- [ ] **Step 2: Implement** the page and sections. `bun run lint`, `bun run test`, `bun run verify:sql`, `bun run verify:pdf`, `cargo test --lib` → all PASS. `verify:pdf` should be unchanged: no template or builder change.
- [ ] **Step 3: Manual check** in `bun run tauri:dev` (**Review Focus 1, 2, 5**):
  - with `/settings/pdf` visible in main, save in the designer → main's preview updates;
  - with the designer open and dirty, switch business from main → the designer closes, and main shows the other business;
  - lock an encrypted business from the title bar → the designer closes;
  - add an image, close the designer, choose Discard → no `item-*` file is left in `stationery/` for it.
- [ ] **Step 4: Commit** — `feat(settings): PDF settings open the page designer` and `chore: bump version to 0.171.0`.
- [ ] **Step 5: Hand-off list** for the user's uncommitted docs, not committed: `docs/agents/architecture.md` (the designer window, the event and the Rust close hook) and `docs/agents/pdf-rendering.md` (`render_document_page_png` `page`).
