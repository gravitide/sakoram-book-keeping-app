# Selectable PDF Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users pick a PDF layout per document type (invoice, quote) from 5 templates — Classic (default), Modern, Minimal, Compact, Letterhead — configured in Settings → PDF with a live preview; a Plus feature.

**Architecture:** Refactor the single `document.typ` into a shared `common.typ` (items table, party/meta blocks, paid/notes/bank/sign-off blocks, text helpers) + 5 thin per-template files that `#import "common.typ": *` and own only page setup + header + arrangement. Rust `render_pdf` writes `common.typ` as an extra file; the quote/invoice commands read a `template` key from the payload and pick the `.typ` via a registry (unknown → classic). Template choice lives on `company_settings`, is Plus-gated (enforced at render → classic for non-entitled), and is chosen in Settings → PDF with a sample-data live preview.

**Tech Stack:** Typst 0.14 (sidecar), Tauri 2 / Rust (`pdf.rs`), sqlx migrations, Nuxt 4 / Vue 3 / Pinia, Vitest (node, pure modules).

## Global Constraints

- **Money is integer cents; quantities `quantity_milli`; tax basis points.** Templates only render pre-formatted strings from the payload — no math in Typst.
- **Templates are `include_str!`'d into the binary** (only `fonts/*` is a bundled resource) — a new template = a new `include_str!` const in `pdf.rs`; **no `tauri.conf.json` change**.
- Every breaking schema change bumps `SCHEMA_VERSION` in `data_io.rs` and registers in `tenants.rs` `MIGRATIONS`.
- **bun** only. User runs **bash on Windows**. No Claude footer in commits. Branch + PR per piece; bump version across `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`.
- Valid template keys: `classic | modern | minimal | compact | letterhead`. Rust registry is the validator; unknown → `classic`.
- Reference spec: `docs/superpowers/specs/2026-06-22-pdf-templates-design.md`.

---

## Task 1: Shared `common.typ` + `doc-classic.typ` + multi-file render pipeline

**Goal:** Move shared rendering into `common.typ`, reproduce today's output as `doc-classic.typ`, and teach `render_pdf` to write extra files — with **Classic output unchanged**. No new looks yet.

**Files:**
- Create: `src-tauri/templates/common.typ`, `src-tauri/templates/doc-classic.typ`
- Delete: `src-tauri/templates/document.typ`
- Modify: `src-tauri/src/pdf.rs`

**Interfaces — `common.typ` public API (every template depends on this):**
```typst
// Text helpers
#let lbl(t)               // bold 8.5pt uppercase tracked label
#let faint(t)             // grey 8.5pt text
// Content blocks — each takes the parsed `data` object and returns content
#let party-block(data)    // party_label + name + address lines + tax id
#let meta-block(data)     // right-aligned number / date / secondary / vendor-invoice grid
#let project-subtitle(data) // centered bold project title (empty if none)
#let items-table(data)    // bundle vs itemized table incl. subtotal/VAT/grand-total rows
#let paid-block(data)     // right-aligned Paid / Balance due (empty unless paid_cents > 0)
#let notes-block(data)    // NOTES: + paragraphs (empty if none)
#let bank-block(data)     // account/name/bank (empty if data.bank == none)
#let signoff-block(data)  // right-aligned Prepared by (empty if none)
#let footer-content(data) // business name | website | phone | address (for #set page footer)
#let resolve-font(data)   // returns the font tuple (chosen, "Inter", "Inter Tight", "Miriam Libre")
```

- [ ] **Step 1: Write `common.typ`** by moving the shared pieces out of `document.typ` **verbatim** (so output is identical). Each block above wraps the exact markup from `document.typ`:
  - `lbl`/`faint` ← the `label`/`faint` lets (document.typ:78-79).
  - `party-block` ← document.typ:85-97 body.
  - `meta-block` ← document.typ:108-135.
  - `project-subtitle` ← document.typ:141-144.
  - `items-table` ← document.typ:152-263 (the `header-cell`/`body-cell` lets stay inside it).
  - `paid-block` ← :268-282; `notes-block` ← :287-299; `bank-block` ← :304-319; `signoff-block` ← :324-330.
  - `footer-content` ← the footer markup (document.typ:21-31).
  - `resolve-font` ← the `chosen-font` logic (document.typ:50-53) returning the font tuple.
  - Top of file: `#let data = json("data.json")` is **not** here — each template loads its own data and passes it in (keeps `common.typ` a pure helper module).

- [ ] **Step 2: Write `doc-classic.typ`** — the page+header+assembly from `document.typ`, calling `common.typ`:

```typst
// Classic — reproduces the original document.typ output exactly.
#import "common.typ": *
#let data = json("data.json")

#set document(title: data.number, author: data.business_name)
#set page(paper: "a4", margin: (x: 18mm, top: 16mm, bottom: 18mm), footer: [
  #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
  #v(4pt)
  #align(center, text(size: 8pt, fill: rgb("#6b7280"))[#footer-content(data)])
])
#set text(font: resolve-font(data), size: 9.5pt, lang: "en", number-width: "tabular")
#set par(leading: 0.55em, spacing: 0.65em)

// Header: logo top-right (or wordmark), red rule
#align(right)[ /* document.typ:54-61 logo/wordmark block verbatim */ ]
#v(-2mm)
#line(length: 100%, stroke: 2pt + rgb(data.theme_color))

// Title (centered)
#v(8pt)
#align(center, text(weight: "bold", size: 14pt, tracking: 0.04em)[#data.title])
#v(14pt)

// Party (left) + meta (right)
#grid(columns: (1fr, auto), gutter: 24pt, party-block(data), align(right, meta-block(data)))

#project-subtitle(data)
#v(12pt)
#items-table(data)
#paid-block(data)
#notes-block(data)
#bank-block(data)
#signoff-block(data)
```

> Port the logo/wordmark `#align(right)[…]` block (document.typ:54-61) verbatim. The goal is byte-identical output to today.

- [ ] **Step 3: Update `pdf.rs` — consts + `render_pdf` `extra_files` param.** Replace the `DOCUMENT_TEMPLATE` const:

```rust
const COMMON_TEMPLATE: &str = include_str!("../templates/common.typ");
const DOC_CLASSIC: &str = include_str!("../templates/doc-classic.typ");
```

Add an `extra_files: &[(&str, &str)]` parameter to `render_pdf` and, right before it writes the main template (`pdf.rs:150-152`), write each extra file into `work_dir`:

```rust
for (name, src) in extra_files {
    std::fs::write(work_dir.join(name), src)?;
}
```

- [ ] **Step 4: Update all `render_pdf` call sites.** The quote/invoice/bill commands pass classic + common:

```rust
render_pdf(&app, "doc-classic.typ", DOC_CLASSIC, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
```

Every other caller (voucher/payslip/report/statement) gets a trailing `, &[]`.

- [ ] **Step 5: Build + regression-verify.**

Run: `cd src-tauri && cargo check` (expect clean). Then `bun run tauri:dev`, generate a **Classic invoice + quote + bill** PDF and compare against a pre-change build's output — layout, items table, totals, paid/notes/bank/sign-off must be **identical**.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/templates/common.typ src-tauri/templates/doc-classic.typ src-tauri/src/pdf.rs
git rm src-tauri/templates/document.typ
git commit -m "refactor(pdf): split document.typ into common.typ + doc-classic.typ; render_pdf extra_files"
```

---

## Task 2: JS template plumbing + migration + licensing (Classic-only effective)

**Goal:** End-to-end template-key flow with only `classic` wired; selecting it works, unknown keys fall back. New looks come in Tasks 3-6.

**Files:**
- Create: `src-tauri/migrations/0037_pdf_templates.sql`, `app/lib/pdf-templates.ts`, `app/lib/pdf-templates.test.ts`
- Modify: `src-tauri/src/tenants.rs`, `src-tauri/src/data_io.rs`, `app/lib/licensing.ts`, `app/stores/settings.ts`, `app/lib/invoice-pdf.ts`, `app/lib/quote-pdf.ts`, `src-tauri/src/pdf.rs`

**Interfaces — Produces:**
```ts
// app/lib/pdf-templates.ts
export interface PdfTemplateMeta { key: string; label: string; description: string }
export const PDF_TEMPLATES: PdfTemplateMeta[]          // UI registry; starts with classic, grows in Tasks 3-6
export function resolveTemplateKey(stored: string | null | undefined, entitled: boolean): string
//   entitled && stored in keys  → stored ; else → "classic"
```

- [ ] **Step 1: Write the failing test** `app/lib/pdf-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveTemplateKey } from "./pdf-templates";

describe("resolveTemplateKey", () => {
	it("returns the stored key when entitled and known", () => {
		expect(resolveTemplateKey("modern", true)).toBe("modern");
		expect(resolveTemplateKey("classic", true)).toBe("classic");
	});
	it("forces classic when not entitled (downgrade-safe)", () => {
		expect(resolveTemplateKey("modern", false)).toBe("classic");
	});
	it("falls back to classic for unknown / null stored keys", () => {
		expect(resolveTemplateKey("bogus", true)).toBe("classic");
		expect(resolveTemplateKey(null, true)).toBe("classic");
		expect(resolveTemplateKey(undefined, true)).toBe("classic");
	});
});
```

- [ ] **Step 2: Run to verify it fails** — `bun run test -- pdf-templates` → module not found.

- [ ] **Step 3: Write `app/lib/pdf-templates.ts`:**

```ts
// Registry of client-facing PDF templates + the entitlement-aware key resolver.
// Pure (no Vue/Tauri) so it's unit-testable in node. New templates append a
// PDF_TEMPLATES entry as they land (Tasks 3-6); the Rust registry in pdf.rs is
// the actual render-time validator (unknown key → classic).

export interface PdfTemplateMeta {
	key: string
	label: string
	description: string
}

export const PDF_TEMPLATES: PdfTemplateMeta[] = [
	{ key: "classic", label: "Classic", description: "Logo top-right, accent rule, centred title. The default." },
];

const KEYS = new Set(PDF_TEMPLATES.map(t => t.key));

export function resolveTemplateKey(stored: string | null | undefined, entitled: boolean): string {
	if (!entitled) return "classic";
	if (stored && KEYS.has(stored)) return stored;
	return "classic";
}
```

> As Tasks 3-6 land, they append their `{ key, label, description }` to `PDF_TEMPLATES` (which also expands `KEYS`, so `resolveTemplateKey` accepts them).

- [ ] **Step 4: Run to verify pass** — `bun run test -- pdf-templates` → 3 pass.

- [ ] **Step 5: Migration** `src-tauri/migrations/0037_pdf_templates.sql`:

```sql
ALTER TABLE company_settings ADD COLUMN pdf_template_invoice TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE company_settings ADD COLUMN pdf_template_quote   TEXT NOT NULL DEFAULT 'classic';
```

Register in `src-tauri/src/tenants.rs` `MIGRATIONS` array (add the `include_str!("../migrations/0037_pdf_templates.sql")` line in order). Bump `SCHEMA_VERSION` in `src-tauri/src/data_io.rs` (35 → 37 if currently 35; set to whatever current+? — match the existing value + this migration number; current head is 0036, so SCHEMA_VERSION becomes 37). `company_settings` is already in `TABLES` — no change.

- [ ] **Step 6: Settings store** — surface the columns. In `app/stores/settings.ts`, add `pdf_template_invoice` + `pdf_template_quote` to the `CompanySettingsRow` interface (`string`, default `'classic'`) and ensure they're included wherever the settings row is loaded/saved (the store does a `SELECT *` + an UPDATE of a column allowlist — add both columns to the updatable set).

- [ ] **Step 7: Licensing** — `app/lib/licensing.ts`, add to `FEATURES`:

```ts
	pdf_templates: Tier.Plus,
```

- [ ] **Step 8: Payload builders** — thread the gated key. In `app/lib/invoice-pdf.ts`, add to the returned payload object:

```ts
	template: resolveTemplateKey(settings?.pdf_template_invoice, entitledToTemplates),
```

`buildInvoicePdfPayload` takes a new arg `entitledToTemplates: boolean` (default `false`); the caller passes `licenseStore.hasFeature("pdf_templates")`. Import `resolveTemplateKey` from `~/lib/pdf-templates`. Do the same in `app/lib/quote-pdf.ts` with `pdf_template_quote`. Update the call sites (`pages/invoices/index.vue`, `pages/invoices/[id].vue`, `pages/quotes/index.vue`, `pages/quotes/[id].vue`, and anywhere `buildInvoicePdfPayload`/`buildQuotePdfPayload` is invoked) to pass the entitlement flag — grep: `grep -rn "buildInvoicePdfPayload\|buildQuotePdfPayload" app/`.

- [ ] **Step 9: Rust registry + read `template`** — `src-tauri/src/pdf.rs`. Add the selector (classic-only arm for now; Tasks 3-6 add arms):

```rust
fn document_template(key: Option<&str>) -> (&'static str, &'static str) {
	match key {
		// new arms added in Tasks 3-6
		_ => ("doc-classic.typ", DOC_CLASSIC),
	}
}
```

Change `export_quote_pdf` / `export_invoice_pdf` to:

```rust
let (name, src) = document_template(data.get("template").and_then(|v| v.as_str()));
render_pdf(&app, name, src, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
```

`export_bill_pdf` stays hardcoded to `doc-classic.typ` (bills aren't templated).

- [ ] **Step 10: Build + verify + commit.** `bun run test && bun run lint`; `cd src-tauri && cargo check`. Manual: an invoice/quote PDF still renders (template defaults to classic). Commit:

```bash
git add src-tauri/migrations/0037_pdf_templates.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs src-tauri/src/pdf.rs app/lib/pdf-templates.ts app/lib/pdf-templates.test.ts app/lib/licensing.ts app/stores/settings.ts app/lib/invoice-pdf.ts app/lib/quote-pdf.ts app/pages/invoices/index.vue app/pages/invoices/[id].vue app/pages/quotes/index.vue app/pages/quotes/[id].vue
git commit -m "feat(pdf): template-key plumbing — migration, settings, licensing, payload (classic-only)"
```

---

## Tasks 3–6: the four new templates (one task each)

Each task: author `src-tauri/templates/doc-<key>.typ` (`#import "common.typ": *`, `#let data = json("data.json")`, set page/text/par, render the distinctive header, compose the shared blocks), add the `include_str!` const + `document_template` arm in `pdf.rs`, append the `PDF_TEMPLATES` entry in `app/lib/pdf-templates.ts`, and visually QA an invoice + quote. Common skeleton (the **body** is identical to Classic — only page setup + header + the party/meta arrangement differ):

```typst
#import "common.typ": *
#let data = json("data.json")
#set document(title: data.number, author: data.business_name)
#set page(paper: "a4", margin: <PER-TEMPLATE>, footer: [ #align(center, text(size: 8pt, fill: rgb("#6b7280"))[#footer-content(data)]) ])
#set text(font: resolve-font(data), size: <PER-TEMPLATE>, lang: "en", number-width: "tabular")
#set par(leading: 0.55em, spacing: 0.65em)

<PER-TEMPLATE HEADER>            // logo/title/band — the distinctive part
<PER-TEMPLATE party + meta>      // grid(party-block(data), meta-block(data)) arranged per template
#project-subtitle(data)
#v(12pt)
#items-table(data)
#paid-block(data)
#notes-block(data)
#bank-block(data)
#signoff-block(data)
```

Per-task `pdf.rs` additions (example for modern):
```rust
const DOC_MODERN: &str = include_str!("../templates/doc-modern.typ");
// in document_template: "modern" => ("doc-modern.typ", DOC_MODERN),
```
Per-task `pdf-templates.ts` append: `{ key: "modern", label: "Modern", description: "Full-width coloured header band." }`.

### Task 3: `doc-modern.typ`
- **Page:** margins `(x: 0mm, top: 0mm, bottom: 18mm)` so the band reaches the page edges; content uses an inner `#pad(x: 18mm)`. **Header:** a full-width `#block(fill: rgb(data.theme_color), inset: (x: 18mm, y: 14mm))` containing the logo (or wordmark) on the right and the document title + number reversed in white on the left. **Below:** `#pad(x: 18mm)` wrapping party-block (left) + meta-block (right) + the shared body. No accent rule (the band is the accent).
- QA: theme colour drives the band; white text legible; logo-and-no-logo both look right; totals/table unchanged.
- Commit: `feat(pdf): Modern template (coloured header band)`.

### Task 4: `doc-minimal.typ`
- **Page:** generous margins `(x: 22mm, top: 22mm, bottom: 22mm)`. **Header:** no logo block by default — a small left-aligned wordmark (business name, light weight) + the title as small uppercase tracked text on the right; **no rules, no fills.** Override the table look: pass through `items-table` but the spec keeps fills — acceptable for v1 (Minimal still uses the shared table). **Type:** `size: 9pt`, rely on whitespace (`#v` between blocks bumped up). Airy, monochrome.
- QA: prints clean in B&W (no reliance on colour); reads as understated/premium.
- Commit: `feat(pdf): Minimal template (monochrome, airy)`.

### Task 5: `doc-compact.typ`
- **Page:** tight margins `(x: 14mm, top: 12mm, bottom: 12mm)`. **Type:** `size: 8.5pt`, `#set par(leading: 0.5em, spacing: 0.5em)`. **Header:** same shape as Classic but smaller (logo height 9mm, title 12pt, thinner rule). Body identical (the shared `items-table` already condenses with the smaller base font).
- QA: a long itemised invoice (15+ lines) fits on noticeably fewer pages than Classic; nothing clips.
- Commit: `feat(pdf): Compact template (dense)`.

### Task 6: `doc-letterhead.typ`
- **Page:** `margin: (x: 18mm, top: 45mm, bottom: 18mm)` — the top ~45mm is left blank for pre-printed stationery. **Header:** **no logo block and no wordmark** (the user's letterhead occupies that space); start with the centred title + accent rule, then the shared party/meta/body. Footer still renders business contact line (or could be omitted — keep it; it's at the page bottom, not the letterhead zone).
- QA: top band is empty; content starts ~45mm down; with a logo *uploaded* it is intentionally ignored (letterhead users print their own).
- Commit: `feat(pdf): Letterhead template (blank top for pre-printed paper)`.

---

## Task 7: Settings UI — pickers + live preview + sample data

**Files:**
- Create: `app/lib/sample-pdf.ts`, `app/lib/sample-pdf.test.ts`
- Modify: `app/pages/settings/pdf.vue`, `app/layouts/default.vue` (sidebar PDF sub-anchors)

**Interfaces — Produces:**
```ts
// app/lib/sample-pdf.ts
export function sampleInvoicePayload(settings: CompanySettingsRow | null, currency: CurrencyMeta, templateKey: string): Record<string, unknown>
export function sampleQuotePayload(settings: CompanySettingsRow | null, currency: CurrencyMeta, templateKey: string): Record<string, unknown>
```

- [ ] **Step 1: Failing test** `app/lib/sample-pdf.test.ts` — assert the payload has the fields the template needs and threads the key:

```ts
import { describe, expect, it } from "vitest";
import { sampleInvoicePayload } from "./sample-pdf";

describe("sampleInvoicePayload", () => {
	it("builds a well-formed payload with the given template key", () => {
		const p = sampleInvoicePayload(null, { code: "LKR", symbol: "Rs", locale: "en-LK", decimals: 2 }, "modern");
		expect(p.template).toBe("modern");
		expect(p.primary_label).toBe("Invoice");
		expect(Array.isArray(p.lines)).toBe(true);
		expect((p.lines as unknown[]).length).toBeGreaterThan(0);
		expect(p.number).toBeTruthy();
		expect(p.party).toBeTruthy();
		expect(p.formatted).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run → fail.** `bun run test -- sample-pdf`.

- [ ] **Step 3: Write `app/lib/sample-pdf.ts`.** Build a realistic fake payload mirroring the real `buildInvoicePdfPayload` / `buildQuotePdfPayload` output shape (see those files for the exact keys: `number`, `title`, `primary_label`, `party_label`, `party {name, address_lines, tax_id}`, `date_label/date_value`, `secondary_label/secondary_value`, `pricing_mode: "itemized"`, `has_vat: true`, `lines[{item_label, description, qty_display, unit_price_display, vat_display, total_display}]`, `formatted{subtotal,tax,total,*_no_symbol}`, `currency_symbol`, `theme_color`, `font_family`, `logo_file: none`-equivalent, `bank`, `notes`, `paid_cents`, etc.). Hardcode a sample client (“Acme (Pvt) Ltd”, an address, a tax id), 3 line items, 18% VAT, sensible totals, a notes line, a bank block. Pull `theme_color` / `font_family` from `settings` (fall back to defaults). Set `template: templateKey`. `sampleQuotePayload` is the same with quote labels (`primary_label: "Quote"`, secondary = "Valid until", no paid block).

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Settings UI.** In `app/pages/settings/pdf.vue` add a **Templates** `SectionCard` (id `templates`, `scroll-mt-*` like the others) with two pickers: **Invoice template** and **Quote template**. Each renders `PDF_TEMPLATES` as a radio/card list bound to `settings.pdf_template_invoice` / `_quote`. Each picker has a **Preview** button → `usePdfPreview` configured with `command: "export_invoice_pdf"` (or quote) + `buildPayload: () => sampleInvoicePayload(settings, currency, selectedKey)`, opening `PdfPreviewModal` (mirror the per-page preview pattern, e.g. `pages/invoices/[id].vue`). **Gating:** wrap the non-`classic` options / the section in `FeatureLock feature="pdf_templates"` so Basic users see the lock + can't select (Classic stays selectable); use `useLicenseStore().hasFeature("pdf_templates")`.

- [ ] **Step 6: Sidebar anchor.** In `app/layouts/default.vue`, add a `#templates` entry to the PDF child's `sections` array (next to `#font`, `#header-logo`, `#footer-notes`).

- [ ] **Step 7: Lint + manual QA + commit.** `bun run lint && bun run test`. `bun run tauri:dev`: pick each template for invoice + quote, hit Preview, confirm the sample renders in the right look; confirm Basic (no license) sees the lock and renders Classic. Commit:

```bash
git add app/lib/sample-pdf.ts app/lib/sample-pdf.test.ts app/pages/settings/pdf.vue app/layouts/default.vue
git commit -m "feat(pdf): Settings template pickers + live sample preview (Plus-gated)"
```

---

## Task 8: Verify, version bump, finalize

- [ ] **Step 1:** `bun run test && bun run lint` (all green; new `pdf-templates` + `sample-pdf` suites pass).
- [ ] **Step 2:** `cd src-tauri && cargo check` clean.
- [ ] **Step 3:** `bun run generate` exits 0.
- [ ] **Step 4: Full visual QA matrix** — for invoice **and** quote, render all 5 templates against realistic data; confirm `theme_color` + `pdf_font` + uploaded logo + bank/sign-off toggles all still apply in each; Compact fits a long list; Letterhead leaves the top blank; Modern band uses the theme colour; Minimal prints clean B&W; **Classic unchanged**.
- [ ] **Step 5:** Bump version minor `0.119.0 → 0.120.0` across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`; refresh `Cargo.lock` (`cd src-tauri && cargo update -p sakoram_billing --precise 0.120.0`).
- [ ] **Step 6:** Commit the bump + this plan/spec. Push `feat/pdf-templates`; summarise; **wait for explicit "open the PR"**.

---

## Self-review notes
- **Spec coverage:** Architecture (common.typ + 5 files) → Tasks 1, 3-6; Rust registry + extra_files → Tasks 1-2; schema → Task 2; licensing (Plus, render-enforced) → Task 2; settings UI + live preview + sample data → Task 7; 5 templates → Tasks 1 (classic) + 3-6. All covered.
- **Classic-regression gate** front-loaded in Task 1 (before any new look exists).
- **Type consistency:** `resolveTemplateKey(stored, entitled)` signature identical in Task 2 def + payload-builder use; `document_template(key: Option<&str>)` returns `(&'static str, &'static str)` consistently; `sampleInvoicePayload(settings, currency, templateKey)` matches Task 7 test + UI call.
- **Visual templates (Tasks 3-6)** are spec'd as page+header+arrangement requirements + a shared skeleton (the body composes `common.typ` identically) + QA criteria — the layout authoring is design work, not deterministic code, so per-line code isn't pre-written; the `common.typ` API contract they consume *is* fully specified (Task 1).
