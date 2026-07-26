# Template Picker Card Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vertical five-row template list on `/settings/pdf` with a responsive card grid, matching the picker onboarding already ships.

**Architecture:** One markup block swap. The `space-y-2` stack of full-width rows becomes a `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` grid of cards with the thumbnail on top and the label beneath. The per-template description moves from visible body text to a `:title` tooltip. No logic, state, or data changes — the same `form.pdf_template` binding and `canPick` gate.

**Tech Stack:** Nuxt 4 / NuxtUI 4, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-26-template-picker-cards-design.md`

## Global Constraints

- Package manager is **bun** only. Shell is **bash on Windows** (Git Bash).
- Work continues on the existing **`feat/unified-pdf-template`** branch — this edits the same picker that branch just rewrote, the branch is unpushed, and a separate branch would conflict on the same file. Never work on `main`.
- **No Claude Code footer in commit messages.**
- Do not push or open a PR without explicit user confirmation.
- **No version bump.** This is part of the same unreleased `0.150.0` already committed on this branch.
- Grid classes, verbatim: **`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3`**.
- Do not touch `app/lib/pdf-templates.ts` — labels and descriptions are unchanged.
- Do not touch `app/pages/onboarding.vue` — its picker is already in this shape and is the reference being matched.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `app/pages/settings/pdf.vue` | Modify lines 248–274 | The template picker markup |

Nothing else. No new files, no store or schema surface.

---

### Task 1: Swap the list for a card grid

**Files:**
- Modify: `app/pages/settings/pdf.vue:248-274`

**Interfaces:**
- Consumes: `TEMPLATES` (the `PDF_TEMPLATES` array), `form.pdf_template`, `canPick(key)`, `themeColor` (computed at `pdf.vue:410`), and the `PdfTemplateThumb` component — all already in scope on this page.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Replace the markup block**

In `app/pages/settings/pdf.vue`, replace this block — the `space-y-2` wrapper and the button inside it:

```vue
							<div class="space-y-2">
								<button
									v-for="t in TEMPLATES"
									:key="t.key"
									type="button"
									:disabled="!canPick(t.key)"
									class="w-full text-left p-3 rounded-md border transition flex items-center gap-3"
									:class="[
										form.pdf_template === t.key ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border)',
										canPick(t.key) ? 'cursor-pointer hover:border-(--ui-primary)/50' : 'opacity-50 cursor-not-allowed'
									]"
									@click="form.pdf_template = t.key"
								>
									<div class="w-11 shrink-0 rounded-sm overflow-hidden ring-1 ring-(--ui-border)">
										<PdfTemplateThumb :template-key="t.key" :color="themeColor" />
									</div>
									<div class="min-w-0">
										<div class="text-sm font-medium flex items-center gap-1.5">
											{{ t.label }}
											<UIcon v-if="!canPick(t.key)" name="i-lucide-lock" class="size-3 text-(--ui-text-muted)" />
										</div>
										<div class="text-xs text-(--ui-text-muted) mt-0.5">
											{{ t.description }}
										</div>
									</div>
								</button>
							</div>
```

with:

```vue
							<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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

Four things changed, and nothing else:

1. `space-y-2` → the grid classes.
2. Button classes: dropped `w-full` / `flex items-center gap-3`, `p-3` → `p-2` (cards are narrower than full-width rows).
3. The thumbnail lost its `w-11 shrink-0` cap so it fills the card width, and gained `mb-1.5` to sit above the label rather than beside it.
4. The description `<div>` is gone; the text moved to `:title` on the button. The `min-w-0` wrapper went with it since there is no longer a flex row to constrain.

The selected/unselected `:class` expression and the `@click` handler are byte-identical to before — selection behaviour must not change.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: exits 0. It will re-indent if the tab depth is off; that is fine.

- [ ] **Step 3: Confirm nothing else drifted**

Run: `git diff --stat`
Expected: exactly one file changed — `app/pages/settings/pdf.vue`. If
`pdf-templates.ts` or `onboarding.vue` appear, revert them; they are out of
scope.

Run: `grep -n "t.description" app/pages/settings/pdf.vue`
Expected: exactly one hit, the `:title` binding. A second hit means the old
description `<div>` survived the replacement.

- [ ] **Step 4: Verify in the running app**

`bun run tauri:dev` (exit 255 on window close is normal, not an error).

Go to `/settings/pdf` and check:

1. Five cards on one row at a normal desktop width, thumbnail above label.
2. Narrowing the window reflows 5 → 3 → 2 columns; thumbnails stay legible.
3. Clicking a card selects it — primary border plus the tinted background — and deselects the previous one.
4. Hovering a card shows its description as a native tooltip after a moment.
5. Save, navigate away and back: the choice persists.
6. Side-by-side sanity check against onboarding's picker — the two should now read as the same control.

Take a screenshot of the row for the summary.

- [ ] **Step 5: Commit**

```bash
git add app/pages/settings/pdf.vue
git commit -m "feat: template picker as a card grid"
```

- [ ] **Step 6: Report and stop**

Summarise, noting that in-app verification of steps 1–6 needs the GUI if it
could not be driven here. **Do not push and do not open a PR** — the branch
carries the whole unified-template feature and needs explicit confirmation.
