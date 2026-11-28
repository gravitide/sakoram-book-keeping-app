# Page designer, stage 3: text, fields, page number and lines — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the page designer the user can add text boxes, a page number and lines, and edit everything about them:
- text, with company fields;
- font, size, bold and italic;
- colour (fixed or Accent) and alignment;
- the page number's format and its "hide on one-page documents" option;
- a line's direction, thickness and colour.

**Architecture:**
- **The data and the Typst drawing already exist.** Stage 1 built them: the `text` / `page_number` / `line` items in `page-design.ts`, `{field}` filling in `page-design-text.ts`, and `design-items` in `common.typ`.
- **This stage is the editing layer:**
  - pure draft operations to add and change these items;
  - undo that groups a burst of typing into one step;
  - a designer-only render mode that shows empty-field lines faded instead of dropping them;
  - canvas boxes sized from the real wrapped text;
  - the side panel editors.

**Tech Stack:** Nuxt 4 / Vue 3 / TypeScript strict, NuxtUI 4, Vitest, Typst sidecar.

**Spec:** `docs/superpowers/specs/2026-11-27-page-designer-design.md`, sections "Items" (Text box, Page number, Line) and "Delivery" item 3.

**Already merged:**
- stage 1: data model and rendering;
- stage 2: the designer window, PR #372, v0.171.0, including:
  - `app/pages/designer.vue`
  - `app/components/PageDesignerCanvas.vue`
  - `design-draft.ts`
  - `design-history.ts`
  - `designer-geometry.ts`
  - `designer-keys.ts`

## Global Constraints

- **Tooling:**
  - `bun` only.
  - Gates:
    - `bun run lint` (add `--ignore-pattern ".claude/**" --ignore-pattern ".impeccable/**"` if those trip it);
    - `bun run test`, `bun run verify:sql` and `bun run verify:pdf`;
    - `cargo test --lib` in `src-tauri`.
- **Code layout:**
  - Pure logic lives in `app/lib/*.ts` with a sibling `*.test.ts`, never in a component.
  - Tabs and the strict eslint config apply.
  - Modals use the `#body` / `#footer` slots.
- **Units:** positions and sizes are mm from the page's top-left; font size and line thickness are pt.
- **Fonts:** `DESIGN_FONTS` (`Akt`, `Inter`, `Inter Tight`, `Stack Sans Text`, `Miriam Libre`, `Amarna`), all bundled for both the UI and Typst.
- **Company fields** are the existing `PDF_TOKENS` in `app/lib/pdf-tokens.ts`, shared with Letters:
  - `{business_name}`, `{address}`, `{city}`, `{phone}`, `{email}`, `{website}`, `{tax_id}`;
  - their labels come from that list, and no new tokens are added;
  - an unknown `{token}` prints as typed.
- **The text box:**
  - Its width is fixed and the text wraps.
  - Its height grows with the text.
  - There are no line-spacing or letter-spacing controls.
- **The page number:**
  - There is **at most one** per design. Placed once, it shows on every page.
  - Formats: `page_of_total` "Page 1 of 3", `slash` "1 / 3", `number` "1".
- **The line** runs horizontal or vertical. No other shapes.
- **Colours** are either `"accent"` or `#rrggbb`.
- **No schema change:** no migration and no `SCHEMA_VERSION` bump.
- **Version:** bump to **0.172.0** in all of these:
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
- **Out of scope** (stage 4):
  - the pages-rule picker;
  - the guide-only toggle;
  - overlap warnings;
  - the paper-size check note;
  - help topics.

## Review Focus

1. **Typing in the text editor.** Backspace, Delete, the arrow keys and Ctrl+Z inside the textarea edit the text. They must not delete or nudge the item or undo the design. Pinned by a `designerShortcutsAllowed` test for a `TEXTAREA` target (Task 1).
2. **Undo after typing a sentence** undoes the whole burst, not one character, and Redo brings it back. Typing in a different item, or any other change, starts a new step. Pinned by history tests (Task 1).
3. **A text box whose fields are all empty for this business** (say `{website}` with no website). PDFs leave it out. The designer shows it faded with the field's label ("Website"), so it can still be seen and selected. Pinned by `buildPageSettings` tests in both modes (Task 3).
4. **Turning a long horizontal line near the bottom of the page into a vertical one.** It stays on the page: the length is clamped to the space below its start. Pinned by a `setLineVertical` test (Task 2).
5. **Adding a page number when there already is one.** Nothing is added, and the button says why. Pinned by an `addPageNumber` test (Task 2) and the disabled button in Task 6.

---

### Task 1: Undo groups typing; shortcuts stay out of the textarea

**Files:**
- Modify: `app/lib/design-history.ts`, `app/lib/design-history.test.ts`
- Modify: `app/lib/designer-keys.test.ts` (add the textarea case)
- Modify: `app/pages/designer.vue`: `apply` (~:461)

**Interfaces:**
- Produces:
  - `History<T>` gains an optional `merge?: string`.
  - `record<T>(h: History<T>, next: T, opts?: { merge?: string }): History<T>`
  - `apply(fn, rest = {}, opts?: { merge?: string })` in designer.vue.

- [ ] **Step 1: Write the failing tests** in `design-history.test.ts`:

```ts
it("merges consecutive records with the same merge key into one step", () => {
	let h = startHistory("a");
	h = record(h, "ab", { merge: "text:x" });
	h = record(h, "abc", { merge: "text:x" });
	expect(h.past).toEqual(["a"]);
	expect(undo(h).present).toBe("a");
	expect(redo(undo(h)).present).toBe("abc");
});
it("starts a new step for a different key, no key, or after undo", () => {
	let h = record(startHistory("a"), "ab", { merge: "text:x" });
	h = record(h, "abY", { merge: "text:y" });
	expect(h.past).toEqual(["a", "ab"]);
	h = record(h, "abYZ");
	h = record(h, "abYZ!", { merge: "text:y" });
	expect(h.past).toEqual(["a", "ab", "abY", "abYZ"]);
	const u = record(undo(h), "q", { merge: "text:y" });
	expect(u.past).toEqual(["a", "ab", "abY", "abYZ"]);
});
```

In `designer-keys.test.ts`: `designerShortcutsAllowed({ tagName: "TEXTAREA" })` is `false`. Shape the target object the way the file's existing cases do.

- [ ] **Step 2: Run** `bun run test app/lib/design-history app/lib/designer-keys`. Expected: the merge tests FAIL. The textarea case may already pass; keep it as a pin.

- [ ] **Step 3: Implement `record` with `opts.merge`.**
  - When `opts.merge` equals `h.merge`, replace `present`, keep `past`, and clear `future`.
  - Otherwise push as today.
  - Store `merge: opts?.merge` on the result.
  - `undo` and `redo` return a history with `merge` unset.
  - An equal `next` still returns `h` unchanged.

- [ ] **Step 4: Thread it through the page.** `apply(fn, rest, opts)` passes `opts` to `record`. Nothing else in `designer.vue` changes yet.

- [ ] **Step 5: Run** `bun run test`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(designer): undo groups a burst of typing into one step`

---

### Task 2: Draft operations for text, page numbers and lines

**Files:**
- Modify: `app/lib/design-templates.ts`: export the colour constants and the style helper (`INK`, `BODY`, `MUTED`, `HAIRLINE`, `style` ~:38-44, renamed `textStyle`).
- Modify: `app/lib/design-draft.ts`, `app/lib/design-draft.test.ts`

**Interfaces:**
- Consumes: `clampItem(item, design)` and `itemBox(item)` from `designer-geometry.ts`; `newItemId()`.
- Produces:
  - `export const INK = "#111827", BODY = "#4b5563", MUTED = "#6b7280", HAIRLINE = "#e5e7eb"`
  - `export function textStyle(size: number, color: DesignColor, align?: TextAlign, bold?: boolean, font?: DesignFont): TextStyle`. `font` defaults to `"Akt"`; the templates keep calling it without `font`.
  - `addText(design: PageDesign, id: string, font: DesignFont): PageDesign`
  - `addPageNumber(design: PageDesign, id: string, font: DesignFont): PageDesign`
  - `addLine(design: PageDesign, id: string): PageDesign`
  - `setLineVertical(design: PageDesign, id: string, vertical: boolean): PageDesign`
  - `hasPageNumber(design: PageDesign): boolean`
  - `NEW_TEXT = "New text"`

**Defaults** ("safe area" means the design's own margins on its own paper):

| Item | Position and size | Style |
|---|---|---|
| Text | `x = left margin`, `y = top margin`, `w = min(80, safe width)` | `text: NEW_TEXT`, `textStyle(10, INK, "left", false, font)`, `pages: "every"` |
| Page number | `w = 40`, `x = paper width − right margin − 40`, `y = paper height − 9` (below the safe area, above the 5 mm printer band) | `format: "page_of_total"`, `hide_single: true`, `textStyle(7, MUTED, "right", false, font)` |
| Line | `x = left margin`, `y = top margin`, `length = safe width`, `vertical: false` | `thickness: 0.75`, `color: "accent"` |

- **Cascading:** while another item already sits at exactly the new item's `x`, `y`, both shift +5 mm.
- **Clamping:** every new item passes through `clampItem`.
- **Order:** new items are appended, so they sit on top.

- [ ] **Step 1: Write the failing tests** in `design-draft.test.ts`, on an A4 design with margins `{ top: 40, right: 18, bottom: 25, left: 18 }`:
  - `addText` appends `{ type: "text", x: 18, y: 40, w: 80, text: "New text" }` with the given font.
  - A second `addText` lands at `x: 23, y: 45`.
  - `addPageNumber` appends `{ x: 152, y: 288, w: 40, format: "page_of_total", hide_single: true }`.
  - **Review Focus 5:** `addPageNumber` on a design that already has a page number returns the same design (`toBe`).
  - `hasPageNumber` is true after it and false before.
  - `addLine` appends `{ x: 18, y: 40, length: 174, vertical: false, thickness: 0.75, color: "accent" }`.
  - **Review Focus 4:** given a line at `x: 18, y: 280, length: 174`, `setLineVertical(…, true)` gives `vertical: true` with `length ≤ 297 − 280`.
  - `setLineVertical` back to `false` keeps `x`/`y`.
  - `design-templates.test.ts` still passes unchanged (the `textStyle` rename must not change any template).

- [ ] **Step 2: Run** `bun run test app/lib/design-draft`. Expected: FAIL, functions not defined.

- [ ] **Step 3: Implement** the exports above in `design-templates.ts` and the operations in `design-draft.ts`. `setLineVertical` updates the line and then applies `clampItem`.

- [ ] **Step 4: Run** `bun run test`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(designer): add text, page number and line items`

---

### Task 3: The designer render shows empty-field lines, faded

**Files:**
- Modify: `app/lib/page-design-text.ts` (+ test)
- Modify: `app/lib/page-settings.ts`:
  - `PageSettingsOverride` (~:55-61);
  - the `text` arm of the payload union (~:45);
  - `payloadFor` (~:83);
  - `buildPageSettings` (~:104).
- Modify: `app/lib/page-settings.test.ts`
- Modify: `app/lib/sample-pdf.ts`: `base` (~:35) and `sampleStationeryPreviewPayload` (~:145)
- Modify: `src-tauri/templates/common.typ`: the `text` arm of `design-items` (~:348-349)
- Modify: `app/pages/designer.vue`: `samplePayload` (~:646)

**Interfaces:**
- Produces:
  - `export interface DesignLine { text: string, faded: boolean }`
  - `resolveDesignLines(text: string, values: Record<string, string>, opts?: { keepEmpty?: boolean }): DesignLine[]`.
    - Without `keepEmpty` it equals today's `resolveDesignText` mapped to `{ text, faded: false }`.
    - With `keepEmpty`, a line that would be dropped is kept with `faded: true`. Its empty fields are replaced by their `PDF_TOKENS` label, and it is not separator-collapsed.
    - `resolveDesignText` stays, as a wrapper, for any other caller.
  - `PageSettingsOverride.showEmptyFields?: boolean`
  - The payload's text item has `lines: DesignLine[]`.
  - `sampleStationeryPreviewPayload(settings, currency, layoutKey, opts?: { showEmptyFields?: boolean })`

- [ ] **Step 1: Write the failing tests.**
  - `page-design-text.test.ts`, with `values` having `website: ""` and `phone: "011 234"`:
    - `resolveDesignLines("{phone}\n{website}", values)` → `[{ text: "011 234", faded: false }]`;
    - with `{ keepEmpty: true }` → `[{ text: "011 234", faded: false }, { text: "Website", faded: true }]`.
  - `page-settings.test.ts` (**Review Focus 3**), for a design whose only text is `"{website}"` and a business with no website:
    - `buildPageSettings(s).items` has no text item;
    - `buildPageSettings(s, { showEmptyFields: true }).items` has one, with `lines: [{ text: "Website", faded: true }]`.
  - Update the existing assertions on `lines` to the new `{ text, faded }` shape.

- [ ] **Step 2: Run** `bun run test app/lib/page-design-text app/lib/page-settings`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **TS:** `payloadFor` takes the `showEmptyFields` flag and uses `resolveDesignLines(…, { keepEmpty })`. The "no lines → null" rule stays.
  - **Typst:** the text arm draws each line as `l.text`. A faded line is drawn with `fill: rgb(item.color).transparentize(65%)`.
  - **Designer:** `samplePayload` passes `{ showEmptyFields: true }`. The template previews (`useTemplatePreviews`) and Preview as PDF don't pass it, so they match real PDFs.

- [ ] **Step 4: Run** `bun run test`, then `bun run verify:pdf`. Expected: PASS, with every sha256 unchanged. Faded lines only exist in the designer, and the text lines draw the same.

- [ ] **Step 5: Commit** `feat(designer): empty company fields show faded in the designer`

---

### Task 4: The canvas sizes text from the real wrapped text; vertical line handle; double-click to edit

**Files:**
- Modify: `app/components/PageDesignerCanvas.vue`
- Modify: `app/lib/designer-geometry.ts`, `app/lib/designer-geometry.test.ts`
- Modify: `app/pages/designer.vue`: canvas props and events (~:56-70)

**Interfaces:**
- Consumes: `resolveDesignLines` (Task 3); `tokenValuesFromSettings`.
- Produces:
  - `itemBox(item: DesignItem, measuredH?: number): MmRect`. For `text` and `page_number` items, a positive `measuredH` replaces the estimate.
  - Canvas prop `fieldValues: Record<string, string>`.
  - Canvas emit `edit: [id: string]` (double-click on a text or page-number box).
  - `HANDLE_CLASS` gains an `endVertical` entry.

- [ ] **Step 1: Write the failing test** in `designer-geometry.test.ts`:
  - `itemBox(textItem, 30).h === 30`;
  - `itemBox(textItem).h` equals today's estimate;
  - `itemBox(lineItem, 30)` ignores `measuredH`.

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement the measurement in the canvas.**
  - Draw a hidden, `aria-hidden` measuring layer: one absolutely positioned `div` per text / page-number item. Each div has:
    - width `item.w` mm at 1 px per mm × 10;
    - the item's font, weight, style and alignment;
    - font size `size × 0.3528 × 10` px (pt → mm, at the same ×10);
    - `line-height: 1.25`;
    - `white-space: pre-wrap`;
    - content: `resolveDesignLines(text, fieldValues, { keepEmpty: true })` joined by `\n`, or for a page number, its "Page 1 of 3" / "1 / 3" / "1" label.
  - After each change (a `watch` on the items and fields, then `nextTick`), read each div's `offsetHeight / 10` into a `measured: Record<id, mm>` ref.
  - `boxes` uses `itemBox(item, measured[item.id])`.
  - Snapping keeps using the estimate.

- [ ] **Step 4: Fix the vertical line handle.** A vertical line's `end` handle sits bottom-centre with `cursor-ns-resize` (`"left-1/2 -translate-x-1/2 -bottom-1.5 cursor-ns-resize"`). Pick it by `item.vertical`.

- [ ] **Step 5: Add double-click to edit.** `@dblclick` on a text / page-number box emits `edit`. In the page:
  - pass `:field-values="tokenValuesFromSettings(settings.settings)"`;
  - handle `@edit` by selecting the item and focusing its editor (Task 6 adds the ref).

- [ ] **Step 6: Run** `bun run test` and lint. Expected: PASS.

- [ ] **Step 7: Commit** `feat(designer): text boxes sized from their wrapped text; vertical line handle`

---

### Task 5: Style editor components

**Files:**
- Create: `app/components/DesignColorField.vue`
- Create: `app/components/DesignTextStyleFields.vue`

**Interfaces:**
- Consumes: `DESIGN_FONTS`, `TextStyle`, `DesignColor`; `INK`, `BODY`, `MUTED`, `HAIRLINE` (Task 2).
- Produces:
  - `<DesignColorField v-model="color: DesignColor" :accent-hex="string" />`
  - `<DesignTextStyleFields :model-value="TextStyle" :accent-hex="string" @update:model-value="(s: TextStyle, merge?: string) => …" />`. `merge` is set for the size input, so stepping it is one undo step.

**DesignColorField:** one row of swatches:
- **Accent:** a swatch filled with `accentHex`, labelled "Accent", selected when the value is `"accent"`;
- `INK`, `BODY`, `MUTED`, `HAIRLINE` and `#ffffff`;
- **a custom swatch:** a `UPopover` with `UColorPicker`, showing the current hex when it's none of the presets.

Each swatch is a `button` with `aria-pressed` and a `title` naming it. The custom colour is lower-cased `#rrggbb`.

**DesignTextStyleFields** (labels `text-[11px]` muted, as in the item panel):
- **Font:** a `USelectMenu` of `DESIGN_FONTS`, each option drawn in its own font.
- **Size (pt):** a `UInputNumber`, min 4, max 96, step 0.5.
- **Style:** a two-segment toggle with B and I icons (`i-lucide-bold`, `i-lucide-italic`), `aria-pressed`.
- **Align:** a three-segment toggle (`i-lucide-align-left`, `i-lucide-align-center`, `i-lucide-align-right`).
- **Colour:** a `DesignColorField`.

Reuse the `.segmented` style from `designer.vue`. Move it to a global utility in `app/assets/css/main.css`, scoped under a `.segmented` class name, so both use it. Selected segments are tinted `bg-(--ui-primary)/10 text-(--ui-primary)`.

- [ ] **Step 1: Build both components.** No unit tests: they hold no logic beyond emitting `{ ...style, [key]: value }`.

- [ ] **Step 2: Run** lint. Expected: clean.

- [ ] **Step 3: Commit** `feat(designer): text style and colour fields`

---

### Task 6: The side panel: add tiles and per-item editors

**Files:**
- Modify: `app/pages/designer.vue`: the Start section (Add image / Add background) and the selected-item panel (~:140-215)

**Interfaces:**
- Consumes:
  - Tasks 1, 2 and 5;
  - `PDF_TOKENS`;
  - `pdfThemeHex(draftSettings)` for `accentHex`.

**Add to the page.** The Add image / Add background buttons become a tile grid, `grid-cols-3 gap-1.5`. Each tile is a bordered button with an icon over a `text-[11px]` label:

| Tile | Icon |
|---|---|
| Image | `i-lucide-image-plus` |
| Background | `i-lucide-wallpaper` |
| Text | `i-lucide-type` |
| Page number | `i-lucide-hash` |
| Line | `i-lucide-minus` |

- **Page number:** disabled when `hasPageNumber(draft.design)`, with the title "There's already a page number. It shows on every page."
- **Text, Page number and Line:** `apply` the add op with a fresh `newItemId()`, then select the new item.
- **Font:** the design font passed in is `draft.font` when it is one of `DESIGN_FONTS`, else `"Akt"`.
- **New text box:** after adding, focus its textarea and select its text, so typing replaces "New text".

**The selected-item panel**, below X / Y / Width and above Layer. The "Editing its text and style comes with the next update." note goes.

- **Text:**
  - A "Text" label over a `UTextarea` (`autoresize`, rows 3, `ref` for focusing). On input it calls `apply(d => updateItem(d, clampItem({ ...item, text }, d)), {}, { merge: "text:" + id })`.
  - An "Insert field" `UDropdownMenu` (icon `i-lucide-braces`, `size="xs"`) listing `PDF_TOKENS` by label. It inserts the token at the textarea's caret, or replaces the selection, then restores focus and the caret after the token.
  - A hint: "Fields fill in from Company settings. A line whose fields are all empty is left out of PDFs."
  - Then `DesignTextStyleFields`.
- **Page number:**
  - **Format:** a three-segment toggle reading "Page 1 of 3", "1 / 3" and "1".
  - **Hide on one-page documents:** a `USwitch`.
  - Then `DesignTextStyleFields`.
- **Line:**
  - **Direction:** a two-segment toggle, Horizontal | Vertical, via `setLineVertical`.
  - **Thickness (pt):** a `UInputNumber`, min 0.25, max 12, step 0.25, with merge key `"thickness:" + id`.
  - **Colour:** a `DesignColorField`.
- **Merging:** every style change goes through `apply` with `clampItem`. The size and thickness inputs pass a merge key; the toggles don't.

- [ ] **Step 1: Build the tiles and editors as above.**

- [ ] **Step 2: Run** lint and `bun run test`. Expected: PASS.

- [ ] **Step 3: Check by hand in `bun run tauri:dev`** (start it in a Terminal tab if it isn't running):
  - Add each kind. A second page number is refused, with the title.
  - Type in a text box. The render follows within about a second, and one Ctrl+Z (focus outside the textarea) undoes the burst. This is **Review Focus 1–2**.
  - Insert `{website}` for a business without a website. The designer shows "Website" faded, and Preview as PDF leaves it out (**Review Focus 3**).
  - Change the font, size, B/I, alignment and colour (including Accent), and the page-number formats.
  - Flip a line near the bottom to vertical (**Review Focus 4**).
  - Double-click a text box: its editor gets focus.

- [ ] **Step 4: Commit** `feat(designer): edit text, page numbers and lines in the side panel`

---

### Task 7: Render baselines for the new styles; version bump

**Files:**
- Modify: `scripts/verify-pdf-render.ts`: the design cases (~:220-240)
- Modify: `scripts/pdf-render-baselines.json` (via `--update`)
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`

- [ ] **Step 1: Add a `design-styles` invoice case** to the existing design cases, with:
  - a text box per font in `DESIGN_FONTS` (one italic, one bold, one centred, one right-aligned, one in `"accent"`);
  - a vertical line;
  - a page number with `format: "slash"`, plus a second invoice case with `format: "number"` (separate cases, since a design holds only one).

- [ ] **Step 2: Render and look.** Run `bun run verify:pdf --only design-styles --keep <scratch dir>`, then open the PNGs. Every font is distinct, the vertical line runs down from its start, the accent text uses the business colour, and the page numbers read "1 / 2" and "1".

- [ ] **Step 3: Capture.** Run `bun run verify:pdf --update`, then `bun run verify:pdf`. Expected: PASS, with only the new cases added to the baselines.

- [ ] **Step 4: Bump to 0.172.0** in the four version files, then run all the gates. Expected: all pass.

- [ ] **Step 5: Commit** `chore: render checks for design text styles; bump version to 0.172.0`
