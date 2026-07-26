# PDF Header & Footer Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business replace the hardcoded PDF header block and footer strip with its own rich text, using `{token}` fields that stay in sync with Business details.

**Architecture:** Two opt-in flags plus two TipTap-JSON columns on `company_settings`. A pure `pdf-tokens.ts` substitutes `{field}` tokens over the normalised block tree (preserving marks), and a pure `pdf-chrome.ts` turns settings into `header_blocks` / `footer_blocks` for every PDF payload. Typst renders them through the existing `render-blocks`, which gains a `spacing` parameter for the tight footer strip.

**Tech Stack:** SQLite migration, TipTap (existing `RichTextEditor`), Typst, Nuxt 4 / NuxtUI 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-pdf-header-footer-text-design.md`

## Global Constraints

- **bun** only; bash on Windows. Branch `feat/pdf-header-footer-text` exists and is checked out. Never work on `main`.
- **No Claude Code footer in commit messages.** No push / PR without explicit confirmation.
- Migration must be registered in the `MIGRATIONS` array in `src-tauri/src/tenants.rs`; `SCHEMA_VERSION` 51 → **52** in `src-tauri/src/data_io.rs`.
- Version `0.152.1` → **`0.153.0`** across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`.
- Column names, verbatim: **`pdf_header_custom`**, **`pdf_header_text`**, **`pdf_footer_custom`**, **`pdf_footer_text`**. Both flags `INTEGER NOT NULL DEFAULT 0`.
- Payload field names, verbatim: **`header_blocks`**, **`footer_blocks`** (arrays; `[]` when not customized). Typst reads them with `data.at("…", default: ())` so an unmigrated payload is safe.
- **Footer is capped at 3 blocks** in the payload builder.
- **Both flags default 0 — output for existing tenants must be byte-identical.** Task 3 proves this with sha256 over renders.
- **Typst resolves names in DEFINITION ORDER.** A `#let` can only call helpers defined above it. This is why `footer-content` must move (Task 3) — it currently sits at line ~30 and needs `render-blocks` from line ~244. Getting this wrong produces `unknown variable: render-blocks` at render time, not at compile time. See the landmine entry in CLAUDE.md.
- Pure logic in `app/lib/` with a sibling `*.test.ts`. Vitest runs in node — **never import a Pinia store in a test**.
- Browser verification: call `resize_window` first; a fresh Browser-pane tab reports `innerWidth: 0` and no breakpoint matches.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src-tauri/migrations/0052_pdf_header_footer_text.sql` | Create | Four columns |
| `src-tauri/src/tenants.rs`, `src-tauri/src/data_io.rs` | Modify | Register migration; `SCHEMA_VERSION` 52 |
| `app/stores/settings.ts` | Modify | Row type + `UPDATABLE_COLUMNS` |
| `app/lib/pdf-tokens.ts` + `.test.ts` | Create | Token registry + block-tree substitution |
| `app/lib/pdf-chrome.ts` + `.test.ts` | Create | settings → `header_blocks` / `footer_blocks` |
| `src-tauri/templates/common.typ` | Modify | `render-blocks` spacing; relocate + extend `footer-content`; header slot in `doc-header` |
| `app/lib/*-pdf.ts`, `app/lib/sample-pdf.ts` | Modify | Emit the two block arrays |
| `app/components/RichTextEditor.vue` | Modify | `minimal` prop + `insertText` expose |
| `app/pages/settings/pdf.vue` | Modify | Header & footer section, live preview |
| `app/layouts/default.vue` | Modify | `#header-footer` sidebar section |
| `CLAUDE.md`, version files | Modify | Docs + 0.153.0 |

### Render harness (Task 3)

Same recipe as PRs #318/#319. `$SCRATCH` is the session scratchpad:

```bash
WORK="$SCRATCH/chrome" && rm -rf "$WORK" && mkdir -p "$WORK/before" "$WORK/after"
cp src-tauri/templates/common.typ src-tauri/templates/doc-*.typ "$WORK/"
./src-tauri/binaries/typst-x86_64-pc-windows-msvc.exe compile --root "$WORK" \
  --font-path src-tauri/fonts --format png --ppi 80 "$WORK/doc-classic.typ" "$WORK/out.png"
```

---

### Task 1: Schema + store

**Files:**
- Create: `src-tauri/migrations/0052_pdf_header_footer_text.sql`
- Modify: `src-tauri/src/tenants.rs` (MIGRATIONS array), `src-tauri/src/data_io.rs:56`, `app/stores/settings.ts`

**Interfaces:**
- Produces: columns `pdf_header_custom` / `pdf_header_text` / `pdf_footer_custom` / `pdf_footer_text`, and the matching fields on `CompanySettingsRow`. Tasks 2, 3 and 5 consume them.

- [ ] **Step 1: Migration**

Create `src-tauri/migrations/0052_pdf_header_footer_text.sql`:

```sql
-- Customizable PDF header block + footer strip.
--
-- Both are opt-in: the *_custom flags default 0, so existing tenants keep the
-- hardcoded chrome (logo/wordmark header, "name | website | phone | address"
-- footer) and render byte-identically until they turn one on.
--
-- The flag is separate from the text on purpose: toggling custom OFF keeps
-- what the user wrote, so they can turn it back on without retyping.
--
-- *_text holds TipTap JSON, same shape as letters.body_json, and may contain
-- {business_name} / {phone} / … tokens resolved at render time by
-- app/lib/pdf-tokens.ts — so contact details never go stale in two places.

ALTER TABLE company_settings ADD COLUMN pdf_header_custom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_header_text TEXT;
ALTER TABLE company_settings ADD COLUMN pdf_footer_custom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_settings ADD COLUMN pdf_footer_text TEXT;
```

- [ ] **Step 2: Register + bump**

In `src-tauri/src/tenants.rs`, after the migration-51 entry:

```rust
	(52, "pdf header footer text", include_str!("../migrations/0052_pdf_header_footer_text.sql")),
```

In `src-tauri/src/data_io.rs` line 56: `pub const SCHEMA_VERSION: i32 = 52;`

- [ ] **Step 3: Store**

In `app/stores/settings.ts`, in `CompanySettingsRow` after `pdf_logo_crop: string | null`:

```ts
	// Customizable page chrome (migration 0052). The *_custom flags are the
	// opt-in; the *_text columns hold TipTap JSON that may contain {token}
	// fields resolved at render time. Flags default 0 = hardcoded chrome.
	pdf_header_custom: number
	pdf_header_text: string | null
	pdf_footer_custom: number
	pdf_footer_text: string | null
```

And append to `UPDATABLE_COLUMNS` after `"pdf_logo_crop"`:

```ts
	"pdf_header_custom",
	"pdf_header_text",
	"pdf_footer_custom",
	"pdf_footer_text"
```

- [ ] **Step 4: Verify + commit**

Run: `cd src-tauri && cargo check` → `Finished`.
Run: `bun run lint` → exits 0.

```bash
git add src-tauri/migrations/0052_pdf_header_footer_text.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs app/stores/settings.ts
git commit -m "feat: header/footer text columns (migration 0052)"
```

---

### Task 2: Pure libs — tokens + chrome builders (TDD)

**Files:**
- Create: `app/lib/pdf-tokens.ts`, `app/lib/pdf-tokens.test.ts`, `app/lib/pdf-chrome.ts`, `app/lib/pdf-chrome.test.ts`

**Interfaces:**
- Consumes: `CompanySettingsRow` (Task 1); existing `LetterBlock` / `LetterInline` from `~/lib/letter-body`; existing `richTextToBlocks` from `~/lib/rich-text`.
- Produces:
  - `PDF_TOKENS: PdfToken[]` where `PdfToken = { token: string, label: string }`
  - `tokenValuesFromSettings(settings: CompanySettingsRow | null): Record<string, string>`
  - `resolveTokens(blocks: LetterBlock[], values: Record<string, string>): LetterBlock[]`
  - `buildHeaderBlocks(settings: CompanySettingsRow | null): LetterBlock[]`
  - `buildFooterBlocks(settings: CompanySettingsRow | null): LetterBlock[]`
  - `FOOTER_MAX_BLOCKS = 3`

  Tasks 3 and 5 consume these.

- [ ] **Step 1: Write the failing token tests**

Create `app/lib/pdf-tokens.test.ts`:

```ts
import type { LetterBlock } from "./letter-body";
import { describe, expect, it } from "vitest";
import { PDF_TOKENS, resolveTokens, tokenValuesFromSettings } from "./pdf-tokens";

const para = (text: string, bold = false): LetterBlock =>
	({ kind: "paragraph", runs: [{ text, ...(bold ? { bold: true } : {}) }] });

const VALUES = { business_name: "Gravitide", phone: "+94 11 234 5678", email: "" };

describe("pDF_TOKENS", () => {
	it("exposes business_name and phone with human labels", () => {
		const tokens = PDF_TOKENS.map((t) => t.token);
		expect(tokens).toContain("{business_name}");
		expect(tokens).toContain("{phone}");
		expect(PDF_TOKENS.every((t) => t.label.length > 0)).toBe(true);
	});
});

describe("tokenValuesFromSettings", () => {
	it("yields empty strings, never the literal 'null', for a null row", () => {
		const v = tokenValuesFromSettings(null);
		expect(Object.values(v).every((x) => x === "")).toBe(true);
	});
});

describe("resolveTokens", () => {
	it("substitutes a token in a paragraph", () => {
		const out = resolveTokens([para("Call {phone} today")], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "Call +94 11 234 5678 today" }] });
	});

	it("keeps marks — a token inside a bold run stays bold", () => {
		const out = resolveTokens([para("{business_name}", true)], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "Gravitide", bold: true }] });
	});

	it("resolves several tokens in one run", () => {
		const out = resolveTokens([para("{business_name} · {phone}")], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "Gravitide · +94 11 234 5678" }] });
	});

	it("leaves an unknown token literal so typos are visible", () => {
		const out = resolveTokens([para("ring {phne}")], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "ring {phne}" }] });
	});

	it("substitutes an empty value to an empty string", () => {
		const out = resolveTokens([para("[{email}]")], VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "[]" }] });
	});

	it("recurses into headings, list items and table cells", () => {
		const blocks: LetterBlock[] = [
			{ kind: "heading", level: 2, runs: [{ text: "{business_name}" }] },
			{ kind: "bullet_list", items: [[para("{phone}")]] },
			{ kind: "table", rows: [[{ blocks: [para("{business_name}")] }]] }
		];
		const out = resolveTokens(blocks, VALUES);
		expect(out[0]).toMatchObject({ runs: [{ text: "Gravitide" }] });
		expect((out[1] as { items: LetterBlock[][] }).items[0]?.[0])
			.toMatchObject({ runs: [{ text: "+94 11 234 5678" }] });
		expect((out[2] as { rows: { blocks: LetterBlock[] }[][] }).rows[0]?.[0]?.blocks[0])
			.toMatchObject({ runs: [{ text: "Gravitide" }] });
	});

	it("does not mutate the input", () => {
		const input = [para("{phone}")];
		resolveTokens(input, VALUES);
		expect(input[0]).toMatchObject({ runs: [{ text: "{phone}" }] });
	});
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test -- pdf-tokens`
Expected: FAIL — cannot resolve `./pdf-tokens`.

- [ ] **Step 3: Implement `app/lib/pdf-tokens.ts`**

```ts
// {field} tokens for the customizable PDF header / footer.
//
// Substitution runs over the NORMALISED BLOCK TREE rather than the raw stored
// string, so a token sitting inside a bold run comes out bold — replacing text
// before parsing would lose that. Pure (no Vue/Tauri) so it unit-tests in node.
//
// Why tokens exist at all: without them a user's contact details would live in
// two places, and the PDF would silently go stale the day they update Business
// details. With them, Business details stays the single source of truth.

import type { LetterBlock, LetterInline } from "./letter-body";
import type { CompanySettingsRow } from "~/stores/settings";

export interface PdfToken {
	/** Literal placeholder as typed, braces included. */
	token: string
	/** Human label for the Insert-field menu. */
	label: string
}

export const PDF_TOKENS: PdfToken[] = [
	{ token: "{business_name}", label: "Business name" },
	{ token: "{address}", label: "Address line" },
	{ token: "{city}", label: "City" },
	{ token: "{phone}", label: "Phone" },
	{ token: "{email}", label: "Email" },
	{ token: "{website}", label: "Website" },
	{ token: "{tax_id}", label: "Tax ID" }
];

/** Token key (no braces) → its current value. Missing values become "". */
export function tokenValuesFromSettings(settings: CompanySettingsRow | null): Record<string, string> {
	return {
		business_name: settings?.business_name ?? "",
		address: settings?.address_line1 ?? "",
		city: settings?.city ?? "",
		phone: settings?.phone ?? "",
		email: settings?.email ?? "",
		website: settings?.website ?? "",
		tax_id: settings?.tax_id ?? ""
	};
}

// Only substitutes keys we know about: an unrecognised {token} is left exactly
// as typed, so a typo shows up in the PDF instead of silently eating text.
const substitute = (text: string, values: Record<string, string>): string =>
	text.replace(/\{([a-z_]+)\}/g, (whole, key: string) =>
		(Object.prototype.hasOwnProperty.call(values, key) ? values[key]! : whole));

const resolveRuns = (runs: LetterInline[], values: Record<string, string>): LetterInline[] =>
	runs.map((r) => (r.text ? { ...r, text: substitute(r.text, values) } : { ...r }));

/** Substitute tokens throughout a block tree. Returns a new tree. */
export function resolveTokens(blocks: LetterBlock[], values: Record<string, string>): LetterBlock[] {
	return blocks.map((b) => {
		if (b.kind === "paragraph" || b.kind === "heading") {
			return { ...b, runs: resolveRuns(b.runs, values) };
		}
		if (b.kind === "bullet_list" || b.kind === "ordered_list") {
			return { ...b, items: b.items.map((item) => resolveTokens(item, values)) };
		}
		// table
		return {
			...b,
			rows: b.rows.map((row) => row.map((cell) => ({ ...cell, blocks: resolveTokens(cell.blocks, values) })))
		};
	});
}
```

- [ ] **Step 4: Run and confirm the token tests pass**

Run: `bun run test -- pdf-tokens`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing chrome tests**

Create `app/lib/pdf-chrome.test.ts`:

```ts
import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { buildFooterBlocks, buildHeaderBlocks, FOOTER_MAX_BLOCKS } from "./pdf-chrome";

const doc = (...paras: string[]) => JSON.stringify({
	type: "doc",
	content: paras.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] }))
});

const settings = (over: Partial<CompanySettingsRow>) =>
	({ business_name: "Gravitide", phone: "+94 11", ...over } as CompanySettingsRow);

describe("buildHeaderBlocks", () => {
	it("returns nothing when the custom flag is off", () => {
		expect(buildHeaderBlocks(settings({ pdf_header_custom: 0, pdf_header_text: doc("Hi") }))).toEqual([]);
	});

	it("returns nothing when the flag is on but the text is empty", () => {
		expect(buildHeaderBlocks(settings({ pdf_header_custom: 1, pdf_header_text: null }))).toEqual([]);
	});

	it("resolves tokens when enabled", () => {
		const out = buildHeaderBlocks(settings({ pdf_header_custom: 1, pdf_header_text: doc("{business_name}") }));
		expect(out[0]).toMatchObject({ runs: [{ text: "Gravitide" }] });
	});

	it("returns nothing for a null settings row", () => {
		expect(buildHeaderBlocks(null)).toEqual([]);
	});
});

describe("buildFooterBlocks", () => {
	it("caps at FOOTER_MAX_BLOCKS so the fixed footer region can't overflow", () => {
		const out = buildFooterBlocks(settings({
			pdf_footer_custom: 1,
			pdf_footer_text: doc("a", "b", "c", "d", "e")
		}));
		expect(out).toHaveLength(FOOTER_MAX_BLOCKS);
	});

	it("returns nothing when the custom flag is off", () => {
		expect(buildFooterBlocks(settings({ pdf_footer_custom: 0, pdf_footer_text: doc("a") }))).toEqual([]);
	});
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `bun run test -- pdf-chrome`
Expected: FAIL — cannot resolve `./pdf-chrome`.

- [ ] **Step 7: Implement `app/lib/pdf-chrome.ts`**

```ts
// settings → the header_blocks / footer_blocks arrays every PDF payload carries.
//
// One implementation for ten call sites, so "is custom chrome enabled, and what
// does it resolve to" is answered in exactly one place. Pure (no Vue/Tauri).

import type { LetterBlock } from "./letter-body";
import type { CompanySettingsRow } from "~/stores/settings";
import { resolveTokens, tokenValuesFromSettings } from "./pdf-tokens";
import { richTextToBlocks } from "./rich-text";

/**
 * The page footer is a FIXED region that repeats on every page — unbounded
 * content fights the layout of the whole document, so the payload truncates
 * rather than trusting the editor to behave.
 */
export const FOOTER_MAX_BLOCKS = 3;

const build = (settings: CompanySettingsRow | null, enabled: boolean, text: string | null | undefined): LetterBlock[] => {
	if (!settings || !enabled || !text) return [];
	const blocks = richTextToBlocks(text);
	if (blocks.length === 0) return [];
	return resolveTokens(blocks, tokenValuesFromSettings(settings));
};

/** Custom header block, or [] when not opted in. */
export function buildHeaderBlocks(settings: CompanySettingsRow | null): LetterBlock[] {
	return build(settings, settings?.pdf_header_custom === 1, settings?.pdf_header_text);
}

/** Custom footer strip, or [] when not opted in. Capped at FOOTER_MAX_BLOCKS. */
export function buildFooterBlocks(settings: CompanySettingsRow | null): LetterBlock[] {
	return build(settings, settings?.pdf_footer_custom === 1, settings?.pdf_footer_text).slice(0, FOOTER_MAX_BLOCKS);
}
```

- [ ] **Step 8: Run and confirm all pass**

Run: `bun run test -- pdf-chrome` → PASS, 6 tests.
Run: `bun run test` → all suites pass.
Run: `bun run lint` → exits 0.

- [ ] **Step 9: Commit**

```bash
git add app/lib/pdf-tokens.ts app/lib/pdf-tokens.test.ts app/lib/pdf-chrome.ts app/lib/pdf-chrome.test.ts
git commit -m "feat: PDF chrome token substitution + block builders"
```

---

### Task 3: Typst rendering + payload emission

**Files:**
- Modify: `src-tauri/templates/common.typ` (`render-blocks` signature; relocate + extend `footer-content`; `doc-header` slots)
- Modify: `app/lib/quote-pdf.ts`, `invoice-pdf.ts`, `bill-pdf.ts`, `payslip-pdf.ts`, `voucher-pdf.ts`, `letter-pdf.ts`, `report-pdf.ts`, `statement-pdf.ts`, `sample-pdf.ts`

**Interfaces:**
- Consumes: `buildHeaderBlocks` / `buildFooterBlocks` (Task 2).
- Produces: payload fields `header_blocks` / `footer_blocks`; Typst renders them.

- [ ] **Step 1: Capture the baseline BEFORE any edit**

This task's whole risk is regressing tenants who never opt in. Capture first:

```bash
WORK="$SCRATCH/chrome" && rm -rf "$WORK" && mkdir -p "$WORK/before" "$WORK/after"
cd <repo>
cp src-tauri/templates/common.typ src-tauri/templates/doc-*.typ "$WORK/"
```

Write `$WORK/data.json` as a complete invoice payload (reuse the shape from
`docs/superpowers/plans/2026-07-26-pdf-logo-cropper.md` Task 3 Step 5 — party,
lines, formatted, business_name, `"logo_file": null`, `"logo_scale": 100`) and
**omit `header_blocks` / `footer_blocks` entirely**, which is exactly what an
unmigrated payload looks like.

Render all five templates and hash:

```bash
for t in classic compact minimal modern letterhead; do
  sed -i "s/\"template\": \"[a-z]*\"/\"template\": \"$t\"/" "$WORK/data.json"
  ./src-tauri/binaries/typst-x86_64-pc-windows-msvc.exe compile --root "$WORK" \
    --font-path src-tauri/fonts --format png --ppi 80 "$WORK/doc-$t.typ" "$WORK/before/$t.png" 2>/dev/null
done
cd "$WORK/before" && sha256sum *.png | sort -k2 > ../before.txt
```

Expected: 5 hashes.

- [ ] **Step 2: Add the `spacing` parameter to `render-blocks`**

In `src-tauri/templates/common.typ`, change the signature and the two `below:`
uses. Default `8pt` keeps every existing caller byte-identical:

```typst
#let render-blocks(blocks, default-align: none, spacing: 8pt) = {
  for b in blocks {
    if b.kind == "paragraph" {
      block(width: 100%, below: spacing, apply-align(b.at("align", default: default-align), render-runs(b.runs)))
    } else if b.kind == "heading" {
      let lvl = b.at("level", default: 2)
      let hsize = if lvl == 1 { 15pt } else if lvl == 2 { 13pt } else { 11.5pt }
      block(width: 100%, above: 10pt, below: spacing * 0.75, apply-align(b.at("align", default: default-align), text(weight: "bold", size: hsize, render-runs(b.runs))))
```

Also thread `spacing` through the two recursive calls so nested lists inherit it:

```typst
    } else if b.kind == "bullet_list" {
      list(..b.items.map(items => render-blocks(items, default-align: default-align, spacing: spacing)))
    } else if b.kind == "ordered_list" {
      enum(..b.items.map(items => render-blocks(items, default-align: default-align, spacing: spacing)))
```

Note `below: spacing * 0.75` replaces the heading's hardcoded `6pt`; at the
default `8pt` that is `6pt`, i.e. unchanged.

- [ ] **Step 3: Relocate `footer-content` and add the custom branch**

**Delete** the current block at lines ~28–37 (the two comment lines plus the
whole `#let footer-content(data) = [ … ]`).

**Insert** this immediately after `render-blocks`'s closing `}` (before the
`// --- notes ---` comment):

```typst
// Footer line content. Custom rich text when the business has opted in
// (company_settings.pdf_footer_custom), otherwise the built-in
// business name | website | phone | address line. The page `footer:` in each
// template wraps this with its own rule / alignment.
//
// NOTE: this MUST stay below render-blocks — Typst resolves module names in
// definition order, and it lived above render-blocks until it needed to call
// it. Tight `spacing` because a page footer is a strip, not body copy.
#let footer-content(data) = {
  let blocks = data.at("footer_blocks", default: ())
  if blocks.len() > 0 {
    render-blocks(blocks, default-align: "center", spacing: 2pt)
  } else [
    #if data.business_name != none [#data.business_name]
    #if data.website != none [ | #data.website]
    #if data.phone != none [ | #data.phone]
    #if data.address_line1 != none [
      | #data.address_line1#if data.city != none [, #data.city]
    ]
  ]
}
```

Confirm ordering with:
`grep -n "^#let render-blocks\|^#let footer-content\|^#let template-config" src-tauri/templates/common.typ`
Expected line order: `render-blocks` < `footer-content` < `template-config`.

- [ ] **Step 4: Add the header slot to `doc-header`**

In `doc-header`, add this immediately after the `logo-or-wordmark` let-binding:

```typst
  let ht = data.at("header_blocks", default: ())
```

Then in each branch, render `ht` when non-empty. **The `else` path in every
case is the current markup verbatim** — that is what guarantees no change for
tenants who never opt in.

`modern` — insert after the `#text(size: 10.5pt)[\##data.number]` line, still
inside the band's left grid cell (white text is inherited from the enclosing
`set text(fill: white)`):

```typst
          #if ht.len() > 0 {
            v(4pt)
            render-blocks(ht, spacing: 1pt)
          }
```

`minimal` — replace the first grid cell (the wordmark) with:

```typst
      if ht.len() > 0 {
        render-blocks(ht, spacing: 2pt)
      } else if data.business_name != none and data.business_name != "" {
        text(weight: "regular", size: 14pt, tracking: 0.06em)[#data.business_name]
      } else { [] },
```

`compact` — replace `#align(right)[#logo-or-wordmark(9mm, 13pt)]` with:

```typst
    #if ht.len() > 0 {
      grid(
        columns: (1fr, auto),
        align: top,
        gutter: 16pt,
        render-blocks(ht, spacing: 1pt),
        logo-or-wordmark(9mm, 13pt),
      )
    } else {
      align(right)[#logo-or-wordmark(9mm, 13pt)]
    }
```

`classic` (the final `else` branch) — replace
`#align(right)[#logo-or-wordmark(12mm, 16pt)]` with:

```typst
    #if ht.len() > 0 {
      grid(
        columns: (1fr, auto),
        align: top,
        gutter: 16pt,
        render-blocks(ht, spacing: 2pt),
        logo-or-wordmark(12mm, 16pt),
      )
    } else {
      align(right)[#logo-or-wordmark(12mm, 16pt)]
    }
```

`letterhead` — **unchanged**. Header text is deliberately skipped: the reserved
top margin belongs to the pre-printed stationery, which already carries these
details.

- [ ] **Step 5: Emit the arrays from every payload builder**

Add the import to each file that needs it:

```ts
import { buildFooterBlocks, buildHeaderBlocks } from "~/lib/pdf-chrome";
```

**Both arrays** — beside the existing `logo_scale` line in `quote-pdf.ts`,
`invoice-pdf.ts`, `bill-pdf.ts`, `payslip-pdf.ts`, and in `sample-pdf.ts`'s
`base()` and `samplePayslipPayload`:

```ts
		header_blocks: buildHeaderBlocks(settings),
		footer_blocks: buildFooterBlocks(settings),
```

**Footer only** — `voucher-pdf.ts`, `letter-pdf.ts`, `report-pdf.ts`,
`statement-pdf.ts`. These render bespoke headers that `doc-header` does not
drive, so a `header_blocks` value would be silently ignored; emitting only what
is used keeps the payload honest:

```ts
		footer_blocks: buildFooterBlocks(settings),
```

In `statement-pdf.ts` the argument is `input.settings`. In `report-pdf.ts` also
add `footer_blocks: LetterBlock[]` to the `ReportPdfPayload` interface **and**
to the `Pick<…>` union in the `businessHeader` helper's return type — the same
step that was needed for `logo_scale`, and the compiler will flag it if missed.

Confirm coverage:
`grep -l "footer_blocks" app/lib/*-pdf.ts app/lib/sample-pdf.ts` → 9 files.

- [ ] **Step 6: Prove no-opt-in output is unchanged**

```bash
cp src-tauri/templates/common.typ src-tauri/templates/doc-*.typ "$WORK/"
for t in classic compact minimal modern letterhead; do
  sed -i "s/\"template\": \"[a-z]*\"/\"template\": \"$t\"/" "$WORK/data.json"
  ./src-tauri/binaries/typst-x86_64-pc-windows-msvc.exe compile --root "$WORK" \
    --font-path src-tauri/fonts --format png --ppi 80 "$WORK/doc-$t.typ" "$WORK/after/$t.png" 2>/dev/null
done
cd "$WORK/after" && sha256sum *.png | sort -k2 > ../after.txt
cd "$WORK" && diff before.txt after.txt && echo "IDENTICAL"
```

Expected: `IDENTICAL`. **If this differs, stop** — the `else` branches have
drifted from the original markup.

- [ ] **Step 7: Render the opt-in cases**

Add to `$WORK/data.json`:

```json
  "header_blocks": [
    { "kind": "paragraph", "runs": [{ "text": "Gravitide (Pvt) Ltd", "bold": true }] },
    { "kind": "paragraph", "runs": [{ "text": "42 Galle Road, Colombo 03" }] },
    { "kind": "paragraph", "runs": [{ "text": "+94 11 234 5678 · hello@gravitide.dev" }] }
  ],
  "footer_blocks": [
    { "kind": "paragraph", "runs": [{ "text": "Registered in Sri Lanka · PV 12345" }] }
  ],
```

Render all five again into `$WORK/opt/` and inspect each PNG:

1. `classic` / `compact` — header text on the left, logo/wordmark right, above the rule.
2. `minimal` — header text in place of the wordmark.
3. `modern` — header text under the title inside the coloured band, in white.
4. `letterhead` — **no header text**, layout unchanged from `before/letterhead.png` (hash may be compared directly).
5. All five — the footer strip shows "Registered in Sri Lanka · PV 12345" instead of the default line, on one line, not overflowing the page region.

- [ ] **Step 8: Smoke the standalone templates**

`voucher` / `report` / `statement` / `letter` use selective `common.typ`
imports. Confirm each still compiles (they will fail on missing `data.json`,
which is fine — the failure must not mention `unknown variable` or `common.typ`):

```bash
mkdir -p "$WORK/smoke" && cp src-tauri/templates/{report,statement,voucher,letter,common}.typ "$WORK/smoke/"
for t in report statement voucher letter; do
  ERR=$(./src-tauri/binaries/typst-x86_64-pc-windows-msvc.exe compile --root "$WORK/smoke" \
    --font-path src-tauri/fonts "$WORK/smoke/$t.typ" "$WORK/smoke/$t.pdf" 2>&1 || true)
  echo "$ERR" | grep -qi "unknown variable\|common.typ" && echo "PROBLEM $t" || echo "OK $t"
done
```

- [ ] **Step 9: Gates + commit**

Run: `bun run lint` → 0. `bun run test` → all pass.

```bash
git add src-tauri/templates/common.typ app/lib/
git commit -m "feat: render custom header/footer chrome in every PDF template"
```

---

### Task 4: Editor — `minimal` mode + `insertText`

**Files:**
- Modify: `app/components/RichTextEditor.vue`

**Interfaces:**
- Produces: prop `minimal?: boolean` (default `false`); exposed `insertText(text: string): void`. Task 5 consumes both.

- [ ] **Step 1: Add the prop**

Extend the existing `withDefaults(defineProps<…>())` (currently
`{ editable?: boolean, minHeight?: number, tables?: boolean }`):

```ts
	const props = withDefaults(defineProps<{ editable?: boolean, minHeight?: number, tables?: boolean, minimal?: boolean }>(), {
		editable: true,
		minHeight: 240,
		tables: false,
		minimal: false
	});
```

- [ ] **Step 2: Trim the toolbar when minimal**

In the `toolbarGroups` computed, the three groups are `[marks, lists, align]`.
Drop the lists group in minimal mode — a footer strip has no business
containing a bulleted list:

```ts
		const marks = [
			{ name: "Bold", icon: "i-lucide-bold", active: e.isActive("bold"), run: () => e.chain().focus().toggleBold().run() },
			{ name: "Italic", icon: "i-lucide-italic", active: e.isActive("italic"), run: () => e.chain().focus().toggleItalic().run() },
			{ name: "Underline", icon: "i-lucide-underline", active: e.isActive("underline"), run: () => e.chain().focus().toggleUnderline().run() }
		];
		const lists = [
			{ name: "Bullet list", icon: "i-lucide-list", active: e.isActive("bulletList"), run: () => e.chain().focus().toggleBulletList().run() },
			{ name: "Numbered list", icon: "i-lucide-list-ordered", active: e.isActive("orderedList"), run: () => e.chain().focus().toggleOrderedList().run() }
		];
		const align = [
			{ name: "Align left", icon: "i-lucide-align-left", active: e.isActive({ textAlign: "left" }), run: () => e.chain().focus().setTextAlign("left").run() },
			{ name: "Align center", icon: "i-lucide-align-center", active: e.isActive({ textAlign: "center" }), run: () => e.chain().focus().setTextAlign("center").run() },
			{ name: "Align right", icon: "i-lucide-align-right", active: e.isActive({ textAlign: "right" }), run: () => e.chain().focus().setTextAlign("right").run() },
			{ name: "Justify", icon: "i-lucide-align-justify", active: e.isActive({ textAlign: "justify" }), run: () => e.chain().focus().setTextAlign("justify").run() }
		];
		return props.minimal ? [marks, align] : [marks, lists, align];
```

- [ ] **Step 3: Hide the heading dropdown when minimal**

In the template, the block-type `UDropdownMenu` and its trailing divider sit at
the top of the toolbar. Gate both with a wrapper:

```vue
			<template v-if="!minimal">
				<UDropdownMenu :items="headingItems">
					<UButton size="xs" variant="ghost" color="neutral" aria-label="Text style" trailing-icon="i-lucide-chevron-down" :ui="{ trailingIcon: 'size-3' }" class="min-w-16 justify-between">
						{{ currentBlockLabel }}
					</UButton>
				</UDropdownMenu>

				<div class="w-px h-4 bg-(--ui-border) mx-0.5" />
			</template>
```

- [ ] **Step 4: Expose `insertText`**

Add at the end of `<script setup>`:

```ts
	// Lets a parent drop text at the cursor — used by the PDF header/footer
	// "Insert field" menu. Note the v-model can't be used for this: the editor
	// parses that prop only on mount, so rewriting the string would not show up.
	const insertText = (text: string) => {
		editor.value?.chain().focus().insertContent(text).run();
	};

	defineExpose({ insertText });
```

- [ ] **Step 5: Verify + commit**

Run: `bun run lint` → exits 0.
Run: `grep -n "minimal" app/components/RichTextEditor.vue` → prop, toolbarGroups branch, and the template guard all present.

```bash
git add app/components/RichTextEditor.vue
git commit -m "feat: minimal toolbar mode + insertText on RichTextEditor"
```

---

### Task 5: Settings UI, live preview, docs, version

**Files:**
- Modify: `app/pages/settings/pdf.vue`, `app/layouts/default.vue`, `CLAUDE.md`, version files

**Interfaces:**
- Consumes: everything from Tasks 1–4.

- [ ] **Step 1: Form wiring**

In `app/pages/settings/pdf.vue`, extend the `PdfForm` Pick type with the four
new keys, add defaults to the reactive form, hydrate them, and include them in
`onSubmit`'s `store.save({…})` — following exactly how `pdf_logo_scale` flows:

```ts
	type PdfForm = Pick<SettingsUpdate, "pdf_header_logo_path" | "pdf_font" | "pdf_theme_color" | "pdf_template" | "pdf_logo_scale" | "pdf_header_custom" | "pdf_header_text" | "pdf_footer_custom" | "pdf_footer_text">;
```
```ts
		pdf_logo_scale: 100,
		pdf_header_custom: 0,
		pdf_header_text: null,
		pdf_footer_custom: 0,
		pdf_footer_text: null
```
```ts
		form.pdf_header_custom = s.pdf_header_custom ?? 0;
		form.pdf_header_text = s.pdf_header_text ?? null;
		form.pdf_footer_custom = s.pdf_footer_custom ?? 0;
		form.pdf_footer_text = s.pdf_footer_text ?? null;
```
```ts
				pdf_logo_scale: form.pdf_logo_scale,
				pdf_header_custom: form.pdf_header_custom,
				pdf_header_text: form.pdf_header_text,
				pdf_footer_custom: form.pdf_footer_custom,
				pdf_footer_text: form.pdf_footer_text
```

The switches bind to booleans, so add two computed proxies:

```ts
	// USwitch wants a boolean; the column is 0/1 like every other flag here.
	const headerCustom = computed({
		get: () => form.pdf_header_custom === 1,
		set: (v: boolean) => { form.pdf_header_custom = v ? 1 : 0; }
	});
	const footerCustom = computed({
		get: () => form.pdf_footer_custom === 1,
		set: (v: boolean) => { form.pdf_footer_custom = v ? 1 : 0; }
	});
```

- [ ] **Step 2: Preview overlay must carry the new fields**

`previewSettings` already overlays live form values so previews reflect unsaved
edits. Extend it, or the Preview-on-PDF buttons will show stale chrome:

```ts
				pdf_logo_scale: form.pdf_logo_scale,
				pdf_header_custom: form.pdf_header_custom,
				pdf_header_text: form.pdf_header_text,
				pdf_footer_custom: form.pdf_footer_custom,
				pdf_footer_text: form.pdf_footer_text
```

- [ ] **Step 3: Insert-field wiring**

```ts
	import { PDF_TOKENS } from "~/lib/pdf-tokens";
	import { buildHeaderBlocks } from "~/lib/pdf-chrome";

	const headerEditor = ref<{ insertText: (t: string) => void } | null>(null);
	const footerEditor = ref<{ insertText: (t: string) => void } | null>(null);

	const tokenItems = (target: "header" | "footer") => [PDF_TOKENS.map((t) => ({
		label: t.label,
		onSelect: () => (target === "header" ? headerEditor : footerEditor).value?.insertText(t.token)
	}))];
```

- [ ] **Step 4: The section markup**

Insert a new `#header-footer` block between the Header logo card and the
Templates card:

```vue
				<div id="header-footer" class="scroll-mt-6">
					<SectionCard
						icon="i-lucide-panel-top"
						title="Header &amp; footer text"
						subtitle="Print your own details instead of the built-in header block and footer line. Use fields like {business_name} so the text follows Business details instead of going stale."
					>
						<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
							<div>
								<div class="flex items-center justify-between gap-2 mb-2">
									<div class="text-sm font-medium">
										Header text
									</div>
									<div class="flex items-center gap-2">
										<UDropdownMenu :items="tokenItems('header')">
											<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-braces" :disabled="!headerCustom">
												Insert field
											</UButton>
										</UDropdownMenu>
										<USwitch v-model="headerCustom" />
									</div>
								</div>
								<div :class="headerCustom ? '' : 'opacity-50 pointer-events-none'">
									<RichTextEditor ref="headerEditor" v-model="headerTextModel" minimal :min-height="120" />
								</div>
								<p class="text-xs text-(--ui-text-muted) mt-2">
									Prints opposite the logo. Skipped on the Letterhead template, which leaves the top of the page for your pre-printed stationery.
								</p>
							</div>

							<div>
								<div class="flex items-center justify-between gap-2 mb-2">
									<div class="text-sm font-medium">
										Footer text
									</div>
									<div class="flex items-center gap-2">
										<UDropdownMenu :items="tokenItems('footer')">
											<UButton size="xs" variant="soft" color="neutral" icon="i-lucide-braces" :disabled="!footerCustom">
												Insert field
											</UButton>
										</UDropdownMenu>
										<USwitch v-model="footerCustom" />
									</div>
								</div>
								<div :class="footerCustom ? '' : 'opacity-50 pointer-events-none'">
									<RichTextEditor ref="footerEditor" v-model="footerTextModel" minimal :min-height="120" />
								</div>
								<p class="text-xs text-(--ui-text-muted) mt-2">
									Replaces the business name · website · phone line at the bottom of every page. Limited to 3 paragraphs so it can't crowd the page.
								</p>
							</div>
						</div>
					</SectionCard>
				</div>
```

`RichTextEditor`'s `v-model` is a `string`, but the columns are nullable, so add
two string proxies next to the switch computeds:

```ts
	const headerTextModel = computed({
		get: () => form.pdf_header_text ?? "",
		set: (v: string) => { form.pdf_header_text = v || null; }
	});
	const footerTextModel = computed({
		get: () => form.pdf_footer_text ?? "",
		set: (v: string) => { form.pdf_footer_text = v || null; }
	});
```

- [ ] **Step 5: Header text in the live A4 preview**

In the paper preview's header row, put the resolved text left of the logo. It
renders plain text — a faithful rich-text mock is not worth the complexity, and
Preview on PDF is the source of truth:

```ts
	// Plain-text projection of the custom header for the paper mock.
	const previewHeaderLines = computed(() =>
		buildHeaderBlocks(previewSettings.value)
			.map((b) => ("runs" in b ? b.runs.map((r) => r.text).join("") : ""))
			.filter((s) => s.length > 0));
```

Replace the preview's header `<div class="flex justify-end items-end" …>` with:

```vue
									<div class="flex justify-between items-end gap-2" :style="{ minHeight: `${mmPx(18)}px` }">
										<div v-if="previewHeaderLines.length" class="text-left leading-tight" :style="{ fontSize: `${mmPx(2.6)}px` }">
											<div v-for="(l, i) in previewHeaderLines" :key="i" class="text-zinc-700 truncate">
												{{ l }}
											</div>
										</div>
										<div v-else />
										<img
											v-if="store.pdfHeaderLogoSrc"
											:src="store.pdfHeaderLogoSrc"
											alt=""
											:style="previewLogoStyle"
											class="object-contain shrink-0"
											@load="onPreviewLogoLoad"
										>
										<span
											v-else
											class="font-bold text-zinc-800 leading-none shrink-0"
											:style="{ fontSize: `${mmPx(5)}px` }"
										>
											{{ store.settings?.business_name || "Your business" }}
										</span>
									</div>
```

- [ ] **Step 6: Sidebar section**

In `app/layouts/default.vue`, the `/settings/pdf` `sections` array becomes
(DOM order — Font, Colour, Header logo, Header & footer, Templates):

```ts
					sections: [
						{ hash: "#font", label: "Font", icon: "i-lucide-type" },
						{ hash: "#color", label: "Colour", icon: "i-lucide-palette" },
						{ hash: "#header-logo", label: "Header logo", icon: "i-lucide-image" },
						{ hash: "#header-footer", label: "Header & footer", icon: "i-lucide-panel-top" },
						{ hash: "#templates", label: "Templates", icon: "i-lucide-layout-template" }
					]
```

- [ ] **Step 7: Version + CLAUDE.md**

Bump `0.152.1` → `0.153.0` in `package.json`, `src-tauri/Cargo.toml:8`,
`src-tauri/tauri.conf.json:35`; run `cd src-tauri && cargo check`; confirm
`grep -A1 'name = "sakoram_billing"' src-tauri/Cargo.lock` shows `0.153.0`.

Append to the CLAUDE.md migrations block, after the 0051 row:

```
0052_pdf_header_footer_text.sql         ← `company_settings.pdf_header_custom` / `pdf_header_text` / `pdf_footer_custom` / `pdf_footer_text`. Opt-in rich-text page chrome: when a flag is on, the stored TipTap JSON replaces the built-in header block (opposite the logo) or the footer line. Flags default 0 so existing tenants render byte-identically. `{business_name}` / `{address}` / `{city}` / `{phone}` / `{email}` / `{website}` / `{tax_id}` tokens are substituted over the BLOCK TREE by `app/lib/pdf-tokens.ts` (so a token inside a bold run stays bold); unknown tokens render literally so typos are visible. `app/lib/pdf-chrome.ts` turns settings into the `header_blocks` / `footer_blocks` payload arrays for all 9 builders and caps the footer at 3 blocks — the page footer is a fixed region that repeats on every page. `render-blocks` gained a `spacing` param (default 8pt = unchanged) and `footer-content` MOVED below it in common.typ (definition-order rule). Header text reaches the 5 doc-* templates + payslip via `doc-header`; voucher/report/statement/letter get the footer only. Letterhead skips header text by design. SCHEMA_VERSION → 52.
```

- [ ] **Step 8: Browser verification**

Scratch-route recipe (guard `window-title.client.ts`, bypass
`tenant.global.ts`, throwaway page — all tagged `SCRATCH-VERIFY` and reverted
after; **`resize_window` to 1280×800 before measuring**). The scratch page
mounts two `RichTextEditor`s with `minimal` and an Insert-field dropdown, then
assert via `javascript_tool`:

1. The minimal toolbar shows no heading dropdown and no list buttons (count toolbar buttons; expect marks + align only).
2. `insertText("{phone}")` puts the literal at the cursor — read the editor's text content back.
3. A non-minimal editor still shows the heading dropdown (no regression).

- [ ] **Step 9: Gates**

`bun run lint` → 0. `bun run test` → all pass (15 new across the two lib
test files). `cd src-tauri && cargo check` → clean.

- [ ] **Step 10: In-app verification**

`bun run tauri:dev` (exit 255 on window close is normal):

1. Migration applies; `/settings/pdf` shows the new section.
2. Toggle Header text on, type `{business_name}` + an address line, Insert field → `{phone}`; the live A4 preview shows the resolved text left of the logo.
3. Preview on PDF renders the custom header **without saving first**.
4. Save; generate a real invoice — header and footer carry the custom text.
5. Toggle Header text **off**, save, regenerate → built-in chrome returns **and the text is still in the editor** when toggled back on.
6. Switch to Letterhead → header text absent, footer text still present.

- [ ] **Step 11: Commit**

```bash
git add app/pages/settings/pdf.vue app/layouts/default.vue CLAUDE.md package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "feat: header & footer text settings UI (v0.153.0)"
```

- [ ] **Step 12: Report and stop**

Summarise with evidence — especially the byte-identical no-opt-in proof from
Task 3 Step 6. **Do not push, do not open a PR.**
