# Custom PDF Accent Colour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business set any hex as its PDF accent colour, alongside the eight presets.

**Architecture:** `pdf_theme_color` already holds a preset *name* in a `TEXT` column; a custom colour is stored as a literal hex in the same column. `themeHex()` gains a passthrough so a hex resolves to itself instead of hitting the red fallback. The settings page grows a colour well + hex field that write the same form field the presets do, so dirty tracking, save, and the live preview all work unchanged.

**Tech Stack:** Nuxt 4 / NuxtUI 4, native `<input type="color">`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-pdf-custom-accent-colour-design.md`

## Global Constraints

- **bun** only; bash on Windows. Branch `feat/pdf-custom-accent-colour` exists and is checked out. Never work on `main`.
- **No Claude Code footer in commit messages.** No push / PR without explicit confirmation.
- **No migration.** `pdf_theme_color` is already `TEXT`; `SCHEMA_VERSION` stays at 52.
- **No Typst or payload change.** Builders already emit `theme_color: pdfThemeHex(settings)`, which resolves to a hex.
- Version `0.153.0` → **`0.153.1`** across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`.
- Exported names, verbatim: **`isHexColor`**, and the existing **`themeHex`**.
- Pure logic in `app/lib/` with a sibling `*.test.ts`. Vitest runs in node — **never import a Pinia store in a test**.
- **The bug this exists to prevent:** `themeHex` currently returns `#ef4444` for any unrecognised value. Without the passthrough, storing a hex makes every PDF render red, silently and with no error.
- Browser verification: call `resize_window` first — a fresh Browser-pane tab reports `innerWidth: 0` and no breakpoint matches.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `app/lib/theme.ts` | Modify | `isHexColor` + hex passthrough in `themeHex` |
| `app/lib/theme.test.ts` | Create | First test file for the module |
| `app/lib/sample-pdf.ts` | Modify | Delete the two orphaned sample builders |
| `app/pages/settings/pdf.vue` | Modify | Custom colour row in the Colour card |
| version files | Modify | 0.153.1 |

---

### Task 1: `themeHex` hex passthrough (TDD)

**Files:**
- Create: `app/lib/theme.test.ts`
- Modify: `app/lib/theme.ts` (add `isHexColor`; extend `themeHex`)

**Interfaces:**
- Produces: `isHexColor(v: string | null | undefined): boolean` and an extended `themeHex(name: string | null | undefined): string`. Task 2 consumes both.

- [ ] **Step 1: Write the failing test**

Create `app/lib/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isHexColor, THEME_COLORS, themeHex } from "./theme";

describe("isHexColor", () => {
	it("accepts 6-digit and 3-digit hex, case-insensitively", () => {
		expect(isHexColor("#1d4ed8")).toBe(true);
		expect(isHexColor("#1D4ED8")).toBe(true);
		expect(isHexColor("#fff")).toBe(true);
	});

	it("tolerates surrounding whitespace", () => {
		expect(isHexColor("  #1d4ed8  ")).toBe(true);
	});

	it("rejects malformed values", () => {
		expect(isHexColor("#12345")).toBe(false);
		expect(isHexColor("#12")).toBe(false);
		expect(isHexColor("1d4ed8")).toBe(false);
		expect(isHexColor("#gggggg")).toBe(false);
		expect(isHexColor("blue")).toBe(false);
		expect(isHexColor("")).toBe(false);
		expect(isHexColor(null)).toBe(false);
		expect(isHexColor(undefined)).toBe(false);
	});
});

describe("themeHex", () => {
	it("resolves a preset name to its hex", () => {
		const blue = THEME_COLORS.find((c) => c.value === "blue")!;
		expect(themeHex("blue")).toBe(blue.hex);
	});

	it("passes a custom hex straight through", () => {
		expect(themeHex("#1d4ed8")).toBe("#1d4ed8");
	});

	it("normalises case and trims a custom hex", () => {
		expect(themeHex("  #AABBCC  ")).toBe("#aabbcc");
	});

	// The whole point of the passthrough: without it these would silently
	// render the red fallback on every generated PDF.
	it("does not fall back to red for a valid custom hex", () => {
		expect(themeHex("#000000")).not.toBe("#ef4444");
		expect(themeHex("#fff")).toBe("#fff");
	});

	it("falls back to red for malformed or unknown values", () => {
		expect(themeHex("#12345")).toBe("#ef4444");
		expect(themeHex("nonsense")).toBe("#ef4444");
		expect(themeHex(null)).toBe("#ef4444");
		expect(themeHex(undefined)).toBe("#ef4444");
	});
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test -- theme`
Expected: FAIL — `isHexColor` is not exported from `./theme`.

- [ ] **Step 3: Implement**

In `app/lib/theme.ts`, add `isHexColor` immediately above `themeHex`, and
extend `themeHex`:

```ts
/**
 * True for `#rgb` / `#rrggbb`, case-insensitive, surrounding space tolerated.
 * Exported because the settings page needs the same rule to decide whether
 * the custom-colour row is the active selection.
 */
export const isHexColor = (v: string | null | undefined): boolean =>
	typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

export const themeHex = (name: string | null | undefined): string => {
	// A custom PDF accent is stored as a literal hex in the same column that
	// otherwise holds a preset name — pass it straight through. Without this
	// the lookup below misses and EVERY generated PDF silently renders the
	// red fallback.
	if (isHexColor(name)) return name!.trim().toLowerCase();
	const found = THEME_COLORS.find((c) => c.value === name);
	return found?.hex ?? "#ef4444";
};
```

- [ ] **Step 4: Run and confirm it passes**

Run: `bun run test -- theme`
Expected: PASS, 9 tests.

- [ ] **Step 5: Confirm shared consumers are unaffected**

`themeHex` is also used by `BankColorDot.vue`, `CategoryFormModal.vue`,
`CategoryPicker.vue` and `ExpensesByCategoryChart.vue`. Those pass preset
names only, so the passthrough cannot change their output — but confirm none
of them pass something hex-like:

Run: `grep -rn "themeHex(" app/components/ app/pages/ | grep -v settings/pdf`
Expected: every call site passes a `.color` / `.value` field or a preset name,
never a literal hex.

- [ ] **Step 6: Commit**

```bash
git add app/lib/theme.ts app/lib/theme.test.ts
git commit -m "feat: resolve a custom hex accent through themeHex"
```

---

### Task 2: Custom colour row + sample cleanup

**Files:**
- Modify: `app/pages/settings/pdf.vue` (Colour card markup + script)
- Modify: `app/lib/sample-pdf.ts` (delete two exports)
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`

**Interfaces:**
- Consumes: `isHexColor`, `themeHex` (Task 1).

- [ ] **Step 1: Script — custom-colour state**

In `app/pages/settings/pdf.vue`, extend the existing theme import:

```ts
	import { isHexColor, THEME_COLORS, themeHex } from "~/lib/theme";
```

Then add, next to the existing `themeColor` computed:

```ts
	// A custom accent is stored as a literal hex in pdf_theme_color, the same
	// column the preset names use — so the preset buttons' `=== c.value`
	// comparison deselects on its own and nothing else needs to know.
	const isCustomColor = computed(() => isHexColor(form.pdf_theme_color));

	// The colour well always needs a concrete #rrggbb, even while a preset is
	// selected, so it opens the OS picker on the current colour rather than black.
	const customColorWell = computed({
		get: () => themeColor.value,
		set: (v: string) => { form.pdf_theme_color = v.toLowerCase(); }
	});

	// Free text while typing; only committed once it's a valid hex, so a
	// half-typed "#1d" never becomes the stored value.
	const customHexDraft = ref("");
	watch(() => form.pdf_theme_color, (v) => {
		if (isHexColor(v)) customHexDraft.value = String(v).toLowerCase();
	}, { immediate: true });
	const onHexInput = (v: string) => {
		customHexDraft.value = v;
		if (isHexColor(v)) form.pdf_theme_color = v.trim().toLowerCase();
	};
```

Note `themeColor` is the existing `computed(() => themeHex(form.pdf_theme_color))`,
already used by the live A4 preview and the template thumbnails — which is why
a custom hex flows into both with no further wiring.

- [ ] **Step 2: Markup — the custom row**

In the Colour card, immediately after the closing `</div>` of the
`grid grid-cols-8` block and before `</SectionCard>`, add:

```vue
							<!-- Custom accent. Writes the same form field as the presets,
								just as a literal hex — so dirty tracking, save and the
								live preview all work unchanged. The native colour input
								opens the OS picker (no dependency, works offline); the
								hex field is for pasting an exact brand colour, which is
								the more common case for an invoice accent. -->
							<div class="mt-4 pt-4 border-t border-(--ui-border) flex items-center gap-3">
								<label
									class="size-9 rounded-full border-2 shrink-0 cursor-pointer transition relative overflow-hidden"
									:class="isCustomColor ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) hover:border-(--ui-text-muted)'"
									:style="{ backgroundColor: themeColor }"
									title="Pick a custom colour"
								>
									<input
										v-model="customColorWell"
										type="color"
										class="absolute inset-0 opacity-0 cursor-pointer"
									>
								</label>
								<div class="min-w-0">
									<div class="text-sm font-medium" :class="isCustomColor ? 'text-(--ui-text)' : 'text-(--ui-text-muted)'">
										Custom
									</div>
									<div class="text-xs text-(--ui-text-muted)">
										Your exact brand colour
									</div>
								</div>
								<UInput
									:model-value="customHexDraft"
									placeholder="#1d4ed8"
									class="w-32 ml-auto"
									:ui="{ base: 'font-mono' }"
									@update:model-value="onHexInput(String($event))"
								/>
							</div>
```

The native `<input type="color">` is visually hidden inside the swatch
`<label>` (`opacity-0`, absolutely filling it) so the swatch itself is the
click target and matches the presets' shape — a bare colour input renders as
an OS-styled control that would look nothing like the eight circles above it.

- [ ] **Step 3: Delete the orphaned sample builders**

In `app/lib/sample-pdf.ts`, delete `sampleQuotePayload` and
`samplePayslipPayload` in full. They lost their only callers when the settings
page dropped to an invoice-only preview.

Confirm nothing still references them:

Run: `grep -rn "sampleQuotePayload\|samplePayslipPayload" app/`
Expected: **no matches**.

If `base()` or `SAMPLE_LINES` become unused as a result, lint will flag them —
`sampleInvoicePayload` still uses both, so it should not.

- [ ] **Step 4: Verify**

Run: `bun run lint`
Expected: exits 0.

Run: `bun run test`
Expected: all suites pass, including the 9 new theme tests.

- [ ] **Step 5: Browser-verify the row**

Scratch-route recipe (guard `window-title.client.ts`, bypass
`tenant.global.ts`, throwaway page — all tagged `SCRATCH-VERIFY` and reverted
after; **`resize_window` to 1280×800 before measuring**). The scratch page
reproduces the eight presets plus the custom row against a local
`ref("green")`, and asserts via `javascript_tool`:

1. Picking a preset leaves `isCustomColor` false and rings that preset.
2. Typing `#1d4ed8` in the hex field moves the ring to the custom swatch and no preset stays ringed.
3. Typing a partial `#1d` does **not** change the bound value.
4. The swatch's background follows the committed colour.

- [ ] **Step 6: Version bump**

`0.153.0` → `0.153.1` in `package.json` (line 4), `src-tauri/Cargo.toml`
(line 8), `src-tauri/tauri.conf.json` (line 35).

Run: `cd src-tauri && cargo check`
Then: `grep -A1 'name = "sakoram_billing"' src-tauri/Cargo.lock`
Expected: `version = "0.153.1"`.

- [ ] **Step 7: In-app verification**

`bun run tauri:dev` (exit 255 on window close is normal):

1. `/settings/pdf` → Colour card shows the custom row under the eight presets.
2. Click the swatch → OS picker opens; choosing a colour updates the live A4 preview's accent rule immediately.
3. Paste `#1d4ed8` into the hex field → ring moves to Custom, presets deselect.
4. Save, then **generate a real PDF** and confirm the header rule is that colour and **not red** — this is the check that catches the fallback bug.
5. Click a preset again → ring returns to it, custom row unrings.

- [ ] **Step 8: Commit**

```bash
git add app/pages/settings/pdf.vue app/lib/sample-pdf.ts package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "feat: custom PDF accent colour (v0.153.1)"
```

- [ ] **Step 9: Report and stop**

Summarise with evidence, and state plainly which checks needed the GUI.
**Do not push and do not open a PR** — wait for explicit confirmation.
