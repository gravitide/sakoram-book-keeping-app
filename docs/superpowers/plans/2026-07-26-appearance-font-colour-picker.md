# Appearance font dropdown + custom theme colour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring `/settings/appearance` to parity with `/settings/pdf` — a grouped font dropdown and a custom accent colour.

**Architecture:** A new pure module `app/lib/color-ramp.ts` turns one hex into the eleven-step OKLCH ramp NuxtUI consumes, plus a DOM applier that writes those steps as inline styles on `<html>` (which outrank NuxtUI's `:root` block — verified in the running app). The two existing accent call sites both route through the applier. The font picker is a straight port of the PDF page's `USelectMenu`, with `create-item` added so arbitrary installed fonts stay reachable.

**Tech Stack:** Nuxt 4, NuxtUI 4, TypeScript strict, Vitest, bun.

## Global Constraints

- Money/qty/rate conventions: not touched by this work.
- No migration — `company_settings.theme_color` is already `TEXT`.
- Tabs for indentation; `bun run lint` is the style gate.
- Version bump on the PR: minor (`0.155.0`) across `package.json`,
  `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, plus `Cargo.lock`.
- `app/plugins/window-title.client.ts` carries a temporary
  `SCRATCH-VERIFY` guard for browser testing. **It must be reverted before
  the final commit.**

---

### Task 1: The colour ramp

**Files:**
- Create: `app/lib/color-ramp.ts`
- Test: `app/lib/color-ramp.test.ts`

**Interfaces:**
- Produces: `SHADES: readonly number[]`, `buildPrimaryRamp(hex: string): Record<number, string>`, `applyPrimaryColor(appConfig, value): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildPrimaryRamp, SHADES } from "./color-ramp";

describe("buildPrimaryRamp", () => {
	it("returns one entry per Tailwind shade", () => {
		const ramp = buildPrimaryRamp("#1d4ed8");
		expect(Object.keys(ramp)).toHaveLength(SHADES.length);
		for (const s of SHADES) expect(ramp[s]).toMatch(/^oklch\(/);
	});

	it("descends in lightness from 50 to 950", () => {
		const ramp = buildPrimaryRamp("#1d4ed8");
		const l = SHADES.map((s) => Number(/oklch\(([\d.]+)/.exec(ramp[s]!)![1]));
		for (let i = 1; i < l.length; i++) expect(l[i]!).toBeLessThan(l[i - 1]!);
	});

	it("forces a usable lightness even for a near-white pick", () => {
		// The whole point of taking only hue+chroma: an unusable input still
		// yields an accent at the standard 500 lightness.
		const l = Number(/oklch\(([\d.]+)/.exec(buildPrimaryRamp("#fffef8")[500]!)![1]);
		expect(l).toBeCloseTo(0.637, 3);
	});

	it("yields a grey ramp for a colourless input", () => {
		const c = Number(/oklch\([\d.]+ ([\d.]+)/.exec(buildPrimaryRamp("#808080")[500]!)![1]);
		expect(c).toBeLessThan(0.01);
	});

	it("preserves the input hue at shade 500", () => {
		// #1d4ed8 is blue — hue lands in the 250-275 range in OKLCH.
		const h = Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)/.exec(buildPrimaryRamp("#1d4ed8")[500]!)![1]);
		expect(h).toBeGreaterThan(250);
		expect(h).toBeLessThan(275);
	});

	it("accepts shorthand hex and a missing leading hash", () => {
		expect(buildPrimaryRamp("#f00")[500]).toBe(buildPrimaryRamp("ff0000")[500]);
	});
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test -- color-ramp`
Expected: FAIL — cannot resolve `./color-ramp`.

- [ ] **Step 3: Implement**

```ts
// One hex -> the eleven-step OKLCH ramp NuxtUI 4 consumes.
//
// NuxtUI reads --ui-color-primary-{50..950} and derives --ui-primary from
// shade 500 (light) / 400 (dark). A named Tailwind palette supplies all
// eleven; a custom hex is only one, so we synthesise the rest.
//
// We take only the HUE and CHROMA from the input and force a fixed lightness
// curve lifted from Tailwind v4's own palettes. That is deliberate: it means
// a near-white or near-black pick still lands at the standard 500 lightness,
// so filled buttons keep their contrast and there is no way to choose an
// unreadable theme. Chroma is clamped; zero is a legitimate grey accent.
//
// Maths is hand-rolled (sRGB -> linear -> OKLab -> OKLCH). A colour library
// would be ~15 kB for one conversion in an app that ships offline.

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Tailwind v4's lightness curve, averaged across its palettes. */
const LIGHTNESS: Record<number, number> = {
	50: 0.971, 100: 0.936, 200: 0.885, 300: 0.808, 400: 0.704, 500: 0.637,
	600: 0.577, 700: 0.505, 800: 0.444, 900: 0.396, 950: 0.258
};

/** Chroma at each shade, relative to shade 500. */
const CHROMA_SCALE: Record<number, number> = {
	50: 0.055, 100: 0.131, 200: 0.262, 300: 0.481, 400: 0.806, 500: 1,
	600: 1.034, 700: 0.899, 800: 0.810, 900: 0.743, 950: 0.388
};

/** Beyond this the colour leaves sRGB and the browser clips it anyway. */
const MAX_CHROMA = 0.30;

const srgbToLinear = (c: number): number =>
	c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/** #rgb / #rrggbb / bare hex -> [r, g, b] in 0..1. Null when unparseable. */
function parseHex(hex: string): [number, number, number] | null {
	let h = hex.trim().toLowerCase().replace(/^#/, "");
	if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
	if (!/^[0-9a-f]{6}$/.test(h)) return null;
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** sRGB -> OKLCH. Returns chroma and hue only; lightness is discarded. */
function hexToChromaHue(hex: string): { chroma: number, hue: number } {
	const rgb = parseHex(hex);
	if (!rgb) return { chroma: 0, hue: 0 };
	const [r, g, b] = rgb.map(srgbToLinear) as [number, number, number];

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

	const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
	const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

	const chroma = Math.min(Math.hypot(a, bb), MAX_CHROMA);
	const hue = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
	return { chroma, hue };
}

const round = (n: number, dp: number): number => Number(n.toFixed(dp));

/** The eleven `oklch(...)` strings for a custom accent hex. */
export function buildPrimaryRamp(hex: string): Record<number, string> {
	const { chroma, hue } = hexToChromaHue(hex);
	const ramp: Record<number, string> = {};
	for (const shade of SHADES) {
		const c = round(chroma * CHROMA_SCALE[shade]!, 4);
		ramp[shade] = `oklch(${round(LIGHTNESS[shade]!, 3)} ${c} ${round(hue, 2)})`;
	}
	return ramp;
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Apply the accent app-wide.
 *
 * A named preset goes through `appConfig.ui.colors.primary`, which is what
 * NuxtUI is designed for. A hex instead writes the synthesised ramp as inline
 * styles on <html> — inline beats NuxtUI's `:root` block, and `--ui-primary`
 * re-derives from it automatically, so light and dark both work with no
 * extra branch. Switching back to a preset must clear the overrides or they
 * would keep winning.
 */
export function applyPrimaryColor(
	appConfig: { ui: { colors: { primary: string } } },
	value: string | null | undefined
): void {
	const root = document.documentElement;
	if (typeof value === "string" && HEX_RE.test(value.trim())) {
		const ramp = buildPrimaryRamp(value);
		for (const shade of SHADES) root.style.setProperty(`--ui-color-primary-${shade}`, ramp[shade]!);
		return;
	}
	for (const shade of SHADES) root.style.removeProperty(`--ui-color-primary-${shade}`);
	if (value) appConfig.ui.colors.primary = value;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun run test -- color-ramp`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/color-ramp.ts app/lib/color-ramp.test.ts
git commit -m "feat: OKLCH ramp generator for a custom UI accent colour"
```

---

### Task 2: Route both accent call sites through the applier

**Files:**
- Modify: `app/layouts/default.vue` (the `settings.settings?.theme_color` watcher)
- Modify: `app/pages/settings/appearance.vue` (the live-preview watcher)

**Interfaces:**
- Consumes: `applyPrimaryColor` from Task 1.

- [ ] **Step 1: Update the layout watcher**

Replace the `isValidThemeColor` guard — it silently ignores a hex — with the
applier. Drop the now-unused `isValidThemeColor` import if nothing else in
the file uses it (check first; `themeHex` may also be imported).

```ts
	// Apply the theme color whenever settings load or change. A named preset
	// flips NuxtUI's palette; a custom hex injects a generated ramp. Both are
	// handled by applyPrimaryColor.
	watch(
		() => settings.settings?.theme_color,
		(value) => applyPrimaryColor(appConfig, value),
		{ immediate: true }
	);
```

- [ ] **Step 2: Update the appearance live-preview watcher**

```ts
	watch([uiFont, themeColor], () => {
		document.documentElement.style.setProperty("--font-sans", previewFontStack.value);
		applyPrimaryColor(appConfig, themeColor.value);
	}, { immediate: true });
```

- [ ] **Step 3: Loosen the ref type**

In `appearance.vue`, `themeColor` is `ref<ThemeColor>` and `initialColor` is
`ref<ThemeColor>`; both become `ref<string>` so a hex can be held. Seed from
the stored value when it is either a valid preset **or** a hex:

```ts
	const storedColor = store.settings?.theme_color;
	const themeColor = ref<string>(
		isValidThemeColor(storedColor) || isHexColor(storedColor) ? String(storedColor) : "red"
	);
	const initialColor = ref<string>(themeColor.value);
```

Import `isHexColor` alongside `isValidThemeColor`. Drop the now-unused
`import type { ThemeColor }` if nothing else references it.

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: clean (no unused imports).

- [ ] **Step 5: Commit**

```bash
git add app/layouts/default.vue app/pages/settings/appearance.vue
git commit -m "feat: accept a hex theme colour at both accent call sites"
```

---

### Task 3: The custom colour row

**Files:**
- Modify: `app/pages/settings/appearance.vue`

- [ ] **Step 1: Add the script state**

Mirrors `/settings/pdf`. `themeHex` resolves a preset name or a hex to a
literal colour for the swatch fill.

```ts
	const isCustomColor = computed(() => isHexColor(themeColor.value));
	const currentHex = computed(() => themeHex(themeColor.value));
	// The native colour well always holds a literal hex; writing to it makes
	// the selection custom.
	const customColorWell = computed({
		get: () => currentHex.value,
		set: (v: string) => { themeColor.value = v.toLowerCase(); }
	});
	// The text field keeps its own draft so a half-typed hex doesn't blow away
	// the applied colour on every keystroke.
	const customHexDraft = ref("");
	watch(themeColor, (v) => {
		if (isHexColor(v)) customHexDraft.value = v.toLowerCase();
	}, { immediate: true });
	const onHexInput = (v: string) => {
		customHexDraft.value = v;
		if (isHexColor(v)) themeColor.value = v.trim().toLowerCase();
	};
```

Add `themeHex` to the `~/lib/theme` import.

- [ ] **Step 2: Add the markup below the preset swatch grid**

Insert directly after the closing `</div>` of the `grid grid-cols-4
sm:grid-cols-8` swatch grid, still inside the Theme color `UCard`:

```vue
					<!-- Custom accent. Writes the same field as the presets, just as
						a literal hex, so dirty tracking, save and the live preview all
						work unchanged. The native colour input opens the OS picker (no
						dependency, works offline); the hex field is for pasting an
						exact brand colour. The input hides inside the swatch label so
						the click target matches the eight circles above. -->
					<div class="mt-4 pt-4 border-t border-(--ui-border) flex items-center gap-3">
						<label
							class="size-9 rounded-full border-2 shrink-0 cursor-pointer transition relative overflow-hidden"
							:class="isCustomColor ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) hover:border-(--ui-text-muted)'"
							:style="{ backgroundColor: currentHex }"
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
							@update:model-value="onHexInput(String($event))"
						/>
					</div>
```

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/pages/settings/appearance.vue
git commit -m "feat: custom accent colour picker on Appearance settings"
```

---

### Task 4: The font dropdown

**Files:**
- Modify: `app/pages/settings/appearance.vue`

- [ ] **Step 1: Add `fontOptions`**

Four groups. Unlike the PDF page, System fonts are included (they render in
the webview even though Typst can't see them) and the list is open via
`create-item`, because the field it replaces was free text.

```ts
	const fontOptions = computed(() => {
		const groups: Array<Array<Record<string, unknown>>> = [
			[
				{ type: "label", label: "Bundled" },
				...BUNDLED_FONTS.filter((f) => !f.mono).map((f) => ({ label: f.name, value: f.name, mono: false }))
			],
			[
				{ type: "label", label: "Monospaced" },
				...BUNDLED_FONTS.filter((f) => f.mono).map((f) => ({ label: f.name, value: f.name, mono: true }))
			],
			[
				{ type: "label", label: "System fonts (only if installed)" },
				...systemFonts.map((name) => ({ label: name, value: name, mono: false }))
			]
		];
		const current = uiFont.value;
		if (current && !isBundledFont(current) && !systemFonts.includes(current)) {
			groups.push([
				{ type: "label", label: "Not listed" },
				{ label: `${current} (custom)`, value: current, mono: false }
			]);
		}
		return groups;
	});
```

Update the import to `import { BUNDLED_FONTS, isBundledFont } from "~/lib/fonts";`
and delete the now-unused `BUNDLED_MONO_NAMES` / `BUNDLED_SANS_NAMES` import
plus the `bundledFonts` / `bundledMonoFonts` aliases. Keep `systemFonts`.

- [ ] **Step 2: Replace the input + three chip rows with the dropdown**

Delete the `UFormField label="Font family"` containing the `UInput`, and the
entire `<div class="mt-4">` block holding the three chip rows. In their place:

```vue
						<UFormField label="Font family">
							<USelectMenu
								v-model="uiFont"
								:items="fontOptions"
								value-key="value"
								label-key="label"
								icon="i-lucide-type"
								class="w-full"
								create-item
								:search-input="{ placeholder: 'Search or type a font name…' }"
								@create="uiFont = String($event)"
							>
								<template #item-label="{ item }">
									<span :style="{ fontFamily: `'${item.value}', ${item.mono ? 'monospace' : 'sans-serif'}` }">
										{{ item.label }}
									</span>
								</template>
							</USelectMenu>
						</UFormField>
```

- [ ] **Step 3: Update the card subtitle**

The old copy described chips. Replace with:

```vue
							<div class="text-xs text-(--ui-text-muted) mt-1">
								Used across the app interface. Bundled fonts ship with Sakoram
								and always render; system fonts only work if they're installed
								on this machine. You can also type any other font name.
							</div>
```

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/pages/settings/appearance.vue
git commit -m "feat: grouped font dropdown on Appearance settings"
```

---

### Task 5: Verify in the browser, then clean up

**Files:**
- Modify: `app/plugins/window-title.client.ts` (revert the SCRATCH-VERIFY guard)
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`

- [ ] **Step 1: Drive the page**

With the dev server up, navigate to `/settings/appearance`. Call
`resize_window` first (viewport is 0 wide until then). Verify:
  - the font dropdown opens, shows four groups, items render in their own face
  - picking a preset swatch still recolours the UI (no regression)
  - typing a hex recolours buttons, the sidebar active state and hover tints
  - `--ui-primary` on `<html>` follows the custom ramp
  - switching back to a preset clears the inline overrides

Assert on `getBoundingClientRect`, attributes and classes — `getComputedStyle`
returns stale values after a DOM mutation in this pane, and reading it right
after a change has produced two false alarms before.

- [ ] **Step 2: Revert the scratch guard**

```bash
git checkout -- app/plugins/window-title.client.ts
git diff --stat   # must show no plugin change
```

Then `grep -rn "SCRATCH-VERIFY" app/` — expected: no matches.

- [ ] **Step 3: Bump the version to 0.155.0**

`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and let
`Cargo.lock` pick it up.

- [ ] **Step 4: Full gate**

Run: `bun run lint && bun run test`
Expected: clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: bump to v0.155.0"
```

---

## Self-review

- **Spec coverage:** font dropdown (Task 4), custom colour (Tasks 1+3),
  both call sites (Task 2), no migration (nothing to do), tests (Task 1),
  manual verification (Task 5). The spec's "verify the assumption first"
  gate was discharged before this plan was written — the override works.
- **Placeholders:** none; every code step carries real content.
- **Type consistency:** `buildPrimaryRamp` / `applyPrimaryColor` / `SHADES`
  are named identically in Tasks 1 and 2. `themeColor` is `ref<string>`
  from Task 2 onward, which Task 3's `customColorWell` setter relies on.
  `systemFonts` survives Task 4 and is referenced by `fontOptions`.
