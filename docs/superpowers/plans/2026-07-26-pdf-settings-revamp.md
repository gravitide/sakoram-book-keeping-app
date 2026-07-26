# PDF Settings Page Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PDF settings font chip-wall with a grouped dropdown, extract the duplicated bundled-font list into one shared module, and tidy four accumulated rough edges on the page.

**Architecture:** A new pure `app/lib/fonts.ts` becomes the single source of truth for bundled faces and is imported by both settings pages. The PDF page's `UInput` + nine chips collapse into one `USelectMenu` using NuxtUI's array-of-arrays grouping with `{ type: 'label' }` headers. Frontend only — no schema, no Rust, no Typst.

**Tech Stack:** Nuxt 4 / NuxtUI 4.4, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-pdf-settings-revamp-design.md`

## Global Constraints

- Package manager is **bun** only. Shell is **bash on Windows** (Git Bash).
- Branch `feat/pdf-settings-revamp` already exists and is checked out. Never work on `main`.
- **No Claude Code footer in commit messages.**
- Do not push or open a PR without explicit user confirmation.
- Version bump: feature → minor. `0.150.1` → **`0.151.0`**, synced across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`.
- **Frontend only.** No migration, no `SCHEMA_VERSION` change, no Rust, no `.typ` edits.
- Bundled font names, verbatim and in this order: `Akt`, `Inter`, `Inter Tight`, `Stack Sans Text`, `Miriam Libre`, `Amarna`, then mono: `Iosevka Charon Mono`, `Martian Mono`, `Google Sans Code`.
- **Do not move `systemFonts`** out of `app/pages/settings/appearance.vue`. That array (`system-ui`, `Georgia`, …) is UI-font-only and is not bundled with the app — it does not belong in the bundled registry.
- Pure logic lives in `app/lib/` with a sibling `*.test.ts`. Vitest runs in node, so **never import a Pinia store into a test** — it drags in `~/lib/db` (Tauri) and fails to resolve.

## Verified API facts

Checked against the installed `@nuxt/ui` 4.4 (`node_modules/@nuxt/ui/dist/runtime/components/SelectMenu.vue`) so the implementer does not have to guess:

- **Grouping works via array-of-arrays.** Line 136: `isArrayOfArray(props.items) ? props.items : [props.items]`. Each sub-array renders as a `ComboboxGroup`.
- **Group headers are items with `type: 'label'`.** Line 281 renders them as `ComboboxLabel`; lines 151 and 159 exclude them from filtering and selection, so they are inert.
- `{ type: 'separator' }` is also supported (line 285) but is not needed here — the groups already separate visually.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `app/lib/fonts.ts` | Create | Single source of truth for bundled faces |
| `app/lib/fonts.test.ts` | Create | Unit tests for the registry |
| `app/pages/settings/pdf.vue` | Modify | Dropdown, slimmed preview, subtitle, header note, protection row |
| `app/pages/settings/appearance.vue` | Modify | Import the shared list, drop its duplicate arrays |
| `app/layouts/default.vue` | Modify (653–658) | Sidebar section order |

---

### Task 1: Shared font registry

**Files:**
- Create: `app/lib/fonts.ts`, `app/lib/fonts.test.ts`
- Modify: `app/pages/settings/pdf.vue:434,437`, `app/pages/settings/appearance.vue:308-322`

**Interfaces:**
- Consumes: nothing.
- Produces: `BundledFont { name: string, mono: boolean }`, `BUNDLED_FONTS: BundledFont[]`, `isBundledFont(name: string | null | undefined): boolean`, and two convenience arrays `BUNDLED_SANS_NAMES: string[]` / `BUNDLED_MONO_NAMES: string[]` (plain names, so the existing chip markup on the Appearance page keeps working unchanged). Task 2 consumes all of these.

- [ ] **Step 1: Write the failing test**

Create `app/lib/fonts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS, BUNDLED_MONO_NAMES, BUNDLED_SANS_NAMES, isBundledFont } from "./fonts";

describe("BUNDLED_FONTS", () => {
	it("leads with Akt, the default since migration 0024", () => {
		expect(BUNDLED_FONTS[0]?.name).toBe("Akt");
	});

	it("has no duplicate names", () => {
		const names = BUNDLED_FONTS.map((f) => f.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("splits into the six sans and three monospaced faces that ship in src-tauri/fonts", () => {
		expect(BUNDLED_SANS_NAMES).toEqual([
			"Akt", "Inter", "Inter Tight", "Stack Sans Text", "Miriam Libre", "Amarna"
		]);
		expect(BUNDLED_MONO_NAMES).toEqual([
			"Iosevka Charon Mono", "Martian Mono", "Google Sans Code"
		]);
	});
});

describe("isBundledFont", () => {
	it("accepts an exact bundled name", () => {
		expect(isBundledFont("Martian Mono")).toBe(true);
	});

	it("is case-sensitive, because Typst resolves family names exactly", () => {
		expect(isBundledFont("akt")).toBe(false);
	});

	it("rejects unknown, empty, null and undefined", () => {
		expect(isBundledFont("Comic Sans MS")).toBe(false);
		expect(isBundledFont("")).toBe(false);
		expect(isBundledFont(null)).toBe(false);
		expect(isBundledFont(undefined)).toBe(false);
	});
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test -- fonts`
Expected: FAIL — cannot resolve `./fonts`.

- [ ] **Step 3: Create the module**

Create `app/lib/fonts.ts`:

```ts
// The faces bundled with the app, in two places: app/assets/fonts (UI, via
// @font-face in main.css) and src-tauri/fonts (PDF, via Typst --font-path).
//
// Single source of truth. This list used to be duplicated in
// settings/pdf.vue and settings/appearance.vue, which meant adding a font
// was a two-file edit that could silently drift.
//
// Adding a font: drop the static TTFs into BOTH directories (see the "Why
// bundle fonts" section in CLAUDE.md — Typst needs per-weight statics, not a
// variable file), then append one row here.
//
// NOTE: the system-font list on the Appearance page is deliberately NOT here.
// Those are UI-only suggestions that may or may not exist on the machine;
// everything in this file is guaranteed present.

export interface BundledFont {
	/** Family name exactly as Typst and CSS resolve it. Case-sensitive. */
	name: string
	/** Monospaced faces are grouped separately in the pickers. */
	mono: boolean
}

export const BUNDLED_FONTS: BundledFont[] = [
	{ name: "Akt", mono: false },
	{ name: "Inter", mono: false },
	{ name: "Inter Tight", mono: false },
	{ name: "Stack Sans Text", mono: false },
	{ name: "Miriam Libre", mono: false },
	{ name: "Amarna", mono: false },
	{ name: "Iosevka Charon Mono", mono: true },
	{ name: "Martian Mono", mono: true },
	{ name: "Google Sans Code", mono: true }
];

export const BUNDLED_SANS_NAMES: string[] = BUNDLED_FONTS.filter((f) => !f.mono).map((f) => f.name);
export const BUNDLED_MONO_NAMES: string[] = BUNDLED_FONTS.filter((f) => f.mono).map((f) => f.name);

const NAMES = new Set(BUNDLED_FONTS.map((f) => f.name));

/** True when `name` is an exact bundled family name. */
export function isBundledFont(name: string | null | undefined): boolean {
	return !!name && NAMES.has(name);
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run test -- fonts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Repoint the Appearance page**

In `app/pages/settings/appearance.vue`, delete the two local arrays (the
`const bundledFonts = [ … ];` block and the `const bundledMonoFonts = [ … ];`
block, roughly lines 308–322, along with their now-orphaned comments) and add
aliases backed by the shared module so the existing chip markup keeps working:

```ts
	const bundledFonts = BUNDLED_SANS_NAMES;
	const bundledMonoFonts = BUNDLED_MONO_NAMES;
```

Add the import alongside the file's other `~/lib` imports:

```ts
	import { BUNDLED_MONO_NAMES, BUNDLED_SANS_NAMES } from "~/lib/fonts";
```

**Leave `const systemFonts = [ … ]` exactly where it is.** Those are UI-only
suggestions that are not bundled with the app.

- [ ] **Step 6: Repoint the PDF page**

In `app/pages/settings/pdf.vue`, delete the two local arrays at lines 434 and
437 (and their comments) and add the same aliases plus import. The chip markup
is removed entirely in Task 2, but keeping the aliases now means the page still
compiles between tasks:

```ts
	import { BUNDLED_MONO_NAMES, BUNDLED_SANS_NAMES } from "~/lib/fonts";
```
```ts
	const bundledFonts = BUNDLED_SANS_NAMES;
	const bundledMonoFonts = BUNDLED_MONO_NAMES;
```

- [ ] **Step 7: Verify**

Run: `bun run lint`
Expected: exits 0.

Run: `bun run test`
Expected: all suites pass, including the new `fonts` file.

Run: `grep -rn "\"Miriam Libre\"" app/ --include=*.vue`
Expected: **no matches** — the only remaining literal lives in `app/lib/fonts.ts`. A hit means a duplicate array survived.

- [ ] **Step 8: Commit**

```bash
git add app/lib/fonts.ts app/lib/fonts.test.ts app/pages/settings/appearance.vue app/pages/settings/pdf.vue
git commit -m "refactor: single source of truth for bundled fonts"
```

---

### Task 2: Font dropdown

**Files:**
- Modify: `app/pages/settings/pdf.vue` — template lines 33–72 (the `UFormField` + both chip blocks) and 73–85 (the preview), plus script additions

**Interfaces:**
- Consumes: `BUNDLED_FONTS`, `isBundledFont` from Task 1.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add the options computed**

In `app/pages/settings/pdf.vue`'s `<script setup>`, extend the import from Task 1 to bring in what this task needs:

```ts
	import { BUNDLED_FONTS, BUNDLED_MONO_NAMES, BUNDLED_SANS_NAMES, isBundledFont } from "~/lib/fonts";
```

Then add, near `pdfPreviewFontStack`:

```ts
	// Grouped options for the font dropdown. NuxtUI 4 renders an array of
	// arrays as separate ComboboxGroups, and `type: "label"` rows as inert
	// group headings (they're excluded from filtering and selection).
	//
	// A stored pdf_font that isn't bundled — from back when this was a
	// free-text field — is preserved as its own "(custom)" group so that
	// opening this page never silently rewrites someone's PDF typeface.
	// Once they pick a bundled face, the custom row disappears.
	const fontOptions = computed(() => {
		const groups: Array<Array<Record<string, unknown>>> = [
			[
				{ type: "label", label: "Bundled" },
				...BUNDLED_FONTS.filter((f) => !f.mono).map((f) => ({ label: f.name, value: f.name, mono: false }))
			],
			[
				{ type: "label", label: "Monospaced" },
				...BUNDLED_FONTS.filter((f) => f.mono).map((f) => ({ label: f.name, value: f.name, mono: true }))
			]
		];
		const current = form.pdf_font;
		if (current && !isBundledFont(current)) {
			groups.push([
				{ type: "label", label: "Not bundled" },
				{ label: `${current} (custom)`, value: current, mono: false }
			]);
		}
		return groups;
	});
```

- [ ] **Step 2: Replace the input and chips with the dropdown**

In the template, replace everything from `<UFormField label="Font family" name="pdf_font">` through the closing `</div>` of the monospaced chip block — that is, the `UFormField` wrapper plus the entire `<div>` holding "Bundled fonts:" and "Monospaced:" — with:

```vue
							<UFormField label="Font family" name="pdf_font">
								<USelectMenu
									v-model="form.pdf_font"
									:items="fontOptions"
									value-key="value"
									label-key="label"
									icon="i-lucide-type"
									:search-input="{ placeholder: 'Search fonts…' }"
								>
									<template #item-label="{ item }">
										<span :style="{ fontFamily: `'${item.value}', ${item.mono ? 'monospace' : 'sans-serif'}` }">
											{{ item.label }}
										</span>
									</template>
								</USelectMenu>
							</UFormField>
```

Both chip `v-for` blocks are gone, so `bundledFonts` / `bundledMonoFonts` are
now unused on this page — delete those two aliases from the script (the import
of `BUNDLED_SANS_NAMES` / `BUNDLED_MONO_NAMES` goes with them; keep
`BUNDLED_FONTS` and `isBundledFont`). `bun run lint` will flag them if missed.

- [ ] **Step 3: Slim the preview**

Replace the preview block's inner content — the caption and both sample lines —
so only one sample line remains:

```vue
							<div class="p-4 border border-(--ui-border) rounded-md bg-(--ui-bg-muted)">
								<div class="text-xs text-(--ui-text-muted) uppercase tracking-wide mb-2">
									Preview
								</div>
								<div :style="{ fontFamily: pdfPreviewFontStack }">
									<div class="text-2xl font-semibold">
										INVOICE INV-2026-0042
									</div>
								</div>
							</div>
```

The `Total: 12,345.00 — due 2026-06-15` line and the "(the PDF pulls the same
TTF…)" parenthetical are dropped. `pdfPreviewFontStack` is unchanged.

- [ ] **Step 4: Verify**

Run: `bun run lint`
Expected: exits 0. Any leftover reference to the deleted aliases surfaces here.

Run: `grep -n "bundledFonts\|bundledMonoFonts" app/pages/settings/pdf.vue`
Expected: **no matches**.

- [ ] **Step 5: Verify visually**

The picker is DB-free, so render it on a scratch route rather than booting the
whole app. Recipe from CLAUDE.md, all three steps must be reverted afterwards:

1. In `app/plugins/window-title.client.ts`, add as the first line inside `defineNuxtPlugin(() => {`:
   `if (!("__TAURI_INTERNALS__" in window)) return; // SCRATCH-VERIFY: revert`
2. In `app/middleware/tenant.global.ts`, add as the first line of the middleware body:
   `if (to.path === "/scratch-font") return; // SCRATCH-VERIFY: revert`
3. Create `app/pages/scratch-font.vue`:

```vue
<template>
	<!-- SCRATCH-VERIFY: throwaway. Delete after checking the font dropdown. -->
	<div class="p-8 max-w-md">
		<USelectMenu
			v-model="picked"
			:items="fontOptions"
			value-key="value"
			label-key="label"
			icon="i-lucide-type"
			:search-input="{ placeholder: 'Search fonts…' }"
		>
			<template #item-label="{ item }">
				<span :style="{ fontFamily: `'${item.value}', ${item.mono ? 'monospace' : 'sans-serif'}` }">
					{{ item.label }}
				</span>
			</template>
		</USelectMenu>
		<div class="mt-4 text-2xl" :style="{ fontFamily: `'${picked}', 'Akt', serif` }">
			INVOICE INV-2026-0042
		</div>
	</div>
</template>

<script setup lang="ts">
	import { BUNDLED_FONTS, isBundledFont } from "~/lib/fonts";

	const picked = ref("Akt");

	const fontOptions = computed(() => {
		const groups: Array<Array<Record<string, unknown>>> = [
			[
				{ type: "label", label: "Bundled" },
				...BUNDLED_FONTS.filter((f) => !f.mono).map((f) => ({ label: f.name, value: f.name, mono: false }))
			],
			[
				{ type: "label", label: "Monospaced" },
				...BUNDLED_FONTS.filter((f) => f.mono).map((f) => ({ label: f.name, value: f.name, mono: true }))
			]
		];
		if (picked.value && !isBundledFont(picked.value)) {
			groups.push([
				{ type: "label", label: "Not bundled" },
				{ label: `${picked.value} (custom)`, value: picked.value, mono: false }
			]);
		}
		return groups;
	});
</script>
```

Then `preview_start` the `nuxt-dev` config (it has `autoPort: true`, so it will
pick a free port if `tauri:dev` holds 4004), navigate to `/scratch-font`, and
confirm:

- The dropdown opens with two group headings, Bundled and Monospaced.
- All nine faces are listed, each rendered in its own typeface.
- Typing in the search box filters; the group headings are not selectable.
- Selecting a face updates the trigger.

Then set the local ref's initial value to `"Comic Sans MS"` and confirm a third
group, "Not bundled", appears with `Comic Sans MS (custom)` pre-selected.

Revert all three scratch changes and confirm with:
`grep -rn "SCRATCH-VERIFY" app/` → no matches, and `app/pages/scratch-font.vue` deleted.

- [ ] **Step 6: Commit**

```bash
git add app/pages/settings/pdf.vue
git commit -m "feat: PDF font picker as a grouped dropdown"
```

---

### Task 3: Cleanups, version bump, verification

**Files:**
- Modify: `app/layouts/default.vue:653-658`, `app/pages/settings/pdf.vue` (header + subtitle + protection card)
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: nothing.

- [ ] **Step 1: Reorder the sidebar sections**

In `app/layouts/default.vue`, replace the `sections` array for `/settings/pdf`
so it matches the page's rendered order:

```ts
					sections: [
						{ hash: "#font", label: "Font", icon: "i-lucide-type" },
						{ hash: "#header-logo", label: "Header logo", icon: "i-lucide-image" },
						{ hash: "#color", label: "Colour", icon: "i-lucide-palette" },
						{ hash: "#templates", label: "Templates", icon: "i-lucide-layout-template" }
					]
```

- [ ] **Step 2: Fix the Font subtitle**

In `app/pages/settings/pdf.vue`, replace the Font `SectionCard`'s `subtitle`
with copy that cannot go stale as document types are added:

```
							subtitle="Used for every PDF this app generates. All fonts here are bundled with the app, so your documents look identical on any machine."
```

- [ ] **Step 3: Drop the migration note from the page header**

The header paragraph currently reads:

```
				Font, colour, header logo, and templates for your generated PDFs. Footer notes moved to Quotes &amp; invoices.
```

Replace with:

```
				Font, colour, header logo, and templates for your generated PDFs.
```

- [ ] **Step 4: Slim the Document protection card**

Replace this entire block:

```vue
				<div class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-shield-check"
						title="Document protection"
						subtitle="Password-protect generated PDFs against editing and copying."
					>
						<UButton
							to="/settings/security#pdf-protection"
							variant="outline"
							trailing-icon="i-lucide-arrow-right"
							size="sm"
						>
							Go to PDF protection
						</UButton>
					</SectionCard>
				</div>
```

with a compact bordered row carrying the same link:

```vue
				<div class="flex items-center gap-3 rounded-md border border-(--ui-border) bg-(--ui-bg-muted) px-4 py-3">
					<UIcon name="i-lucide-shield-check" class="size-5 text-(--ui-text-muted) shrink-0" />
					<div class="text-sm min-w-0 flex-1">
						<span class="font-medium">Document protection</span>
						<span class="text-(--ui-text-muted)"> — password-protect generated PDFs against editing and copying.</span>
					</div>
					<UButton
						to="/settings/security#pdf-protection"
						variant="soft"
						trailing-icon="i-lucide-arrow-right"
						size="xs"
						class="shrink-0"
					>
						Open
					</UButton>
				</div>
```

Note the prop is `trailing-icon`, not `icon` + `trailing` — matching the button
being replaced. The `to` target is unchanged.

- [ ] **Step 5: Bump the version**

`0.150.1` → `0.151.0` in `package.json` (line 4), `src-tauri/Cargo.toml`
(line 8), `src-tauri/tauri.conf.json` (line 35).

Run: `cd src-tauri && cargo check`
Then: `grep -A1 'name = "sakoram_billing"' src-tauri/Cargo.lock`
Expected: `version = "0.151.0"`.

- [ ] **Step 6: Run the gates**

```bash
bun run lint
```
Expected: exits 0.

```bash
bun run test
```
Expected: all suites pass.

- [ ] **Step 7: Verify in the running app**

`bun run tauri:dev` (exit 255 on window close is normal).

1. `/settings/pdf` — the Font card shows a dropdown, no chips, one preview line.
2. Picking a font updates the preview and marks the form dirty; Save persists it.
3. Generate any PDF and confirm it renders in the selected face.
4. The sidebar's PDF sub-links read Font / Header logo / Colour / Templates and each scrolls to the right card.
5. The Document protection row links through to `/settings/security#pdf-protection`.
6. `/settings/appearance` still lists its UI-font chips, including the system fonts.

- [ ] **Step 8: Commit**

```bash
git add app/layouts/default.vue app/pages/settings/pdf.vue package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "chore: tidy the PDF settings page (v0.151.0)"
```

- [ ] **Step 9: Report and stop**

Summarise what shipped and which checks actually ran. **Do not push and do not
open a PR** — wait for explicit confirmation.
