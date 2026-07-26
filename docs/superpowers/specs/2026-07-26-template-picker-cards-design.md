# Template picker as a card grid

**Date:** 2026-07-26
**Status:** Approved, ready for implementation

## Problem

After collapsing to one PDF template setting, `/settings/pdf` renders the
five templates as a full-width vertical list: five stacked rows, each with
a 44px thumbnail beside a label and a one-to-two-line description. It eats
roughly 600px of vertical space to present five mutually-exclusive choices,
and the thumbnails — the thing that actually communicates the difference —
are the smallest element on screen.

## Goal

Show the five templates as small cards in a single row, with the thumbnail
as the primary signal.

## Key finding

**Onboarding already does this.** `app/pages/onboarding.vue:305` renders the
same `PDF_TEMPLATES` list as:

```
grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2
```

— thumbnail above, label below, no description. That is exactly the layout
and exactly the breakpoints chosen here.

So this is not a new design. It is porting a pattern that already ships, and
it resolves an inconsistency: the same picker currently looks like two
different controls depending on where you meet it.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Card content | **Thumbnail + name only** | The thumbnail conveys the layout better than the prose does — that is what it is for. Matches onboarding. |
| Description | **Native tooltip via `:title`** | Nothing is lost, nothing is truncated, and `PDF_TEMPLATES` needs no rewrite. Fitting the text into a ~120px card would have meant shortening all five entries. |
| Narrow windows | **`grid-cols-5` at every width** | Revised after seeing it render. The original `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` was chosen on a bad estimate — I guessed five across a narrow pane would give ~70px cards. Measured, a 1030px window gives **126px** cards (108×153 thumbnails), and the reflow to three columns instead produced oversized ~265px cards. Five across holds up: 157px at 1280, 126px at 1030, 74px at 768, with no horizontal overflow at any width. |
| Label alignment | **Left, matching onboarding** | Consistency with the shipped picker beats the mockup's centred symmetry. |
| Gap | **`gap-3`** (onboarding uses `gap-2`) | Deliberate: the settings card is roomier than the onboarding step. |

## Changes

One markup block in `app/pages/settings/pdf.vue` — the `space-y-2` list
inside the `#templates` `SectionCard` becomes:

```vue
<div class="grid grid-cols-5 gap-3">
	<button
		v-for="t in TEMPLATES"
		:key="t.key"
		type="button"
		:disabled="!canPick(t.key)"
		:title="t.description"
		class="p-2 rounded-md border text-left transition"
		:class="[
			form.pdf_template === t.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)',
			canPick(t.key) ? 'cursor-pointer hover:border-(--ui-primary)/50' : 'opacity-50 cursor-not-allowed'
		]"
		@click="form.pdf_template = t.key"
	>
		<div class="rounded-sm overflow-hidden ring-1 ring-(--ui-border) mb-1.5">
			<PdfTemplateThumb :template-key="t.key" :color="themeColor" />
		</div>
		<div class="text-xs font-medium flex items-center gap-1">
			{{ t.label }}
			<UIcon v-if="!canPick(t.key)" name="i-lucide-lock" class="size-3 text-(--ui-text-muted)" />
		</div>
	</button>
</div>
```

The lock-icon path is preserved. `themeColor` is the existing computed on
the page; onboarding's equivalent is `themeHex(form.pdf_theme_color)`.

Nothing else moves: the "PDF template" heading and the three preview
buttons (Invoice / Quote / Payslip) stay in the header row above the grid.

## Out of scope

- `app/lib/pdf-templates.ts` — labels and descriptions are unchanged.
- Onboarding's picker — it is already in this shape.
- Schema, stores, Rust, and Typst — untouched.
- Version bump. This lands on the unpushed `feat/unified-pdf-template`
  branch and is part of the same unreleased `0.150.0`.

## Testing

Purely presentational, with no logic change — the same `form.pdf_template`
binding, the same `canPick` gate. No unit tests.

Verified in the running app via `bun run tauri:dev`:

1. `/settings/pdf` shows five cards on one row at a normal desktop width.
2. Narrowing the window keeps them on one row — cards shrink rather than wrap.
3. Clicking a card selects it; the primary border and tint follow.
4. Hovering a card surfaces its description as a tooltip.
5. Saving persists the choice, and the picker matches onboarding's.
