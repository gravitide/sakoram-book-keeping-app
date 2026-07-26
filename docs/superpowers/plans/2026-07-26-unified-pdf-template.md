# Unified PDF Template Setting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `pdf_template_invoice` + `pdf_template_quote` into one `pdf_template` setting, and make the payslip and bill PDFs obey it.

**Architecture:** One column on `company_settings` drives every doc-family export. `common.typ` grows a `template-config(data)` (page setup dictionary) and a `doc-header(data)` (five header treatments); `payslip.typ` imports `common.typ` for the first time and consumes both. The five `doc-*.typ` files are deliberately left untouched so client-facing render paths carry zero regression risk.

**Tech Stack:** SQLite (sqlx migrations from Rust), Typst templates, Pinia settings store, Nuxt 4 / NuxtUI 4.

**Spec:** `docs/superpowers/specs/2026-07-26-unified-pdf-template-design.md`

## Global Constraints

- Package manager is **bun** only. Shell is **bash on Windows** (Git Bash).
- Branch `feat/unified-pdf-template` already exists and is checked out. Never work on `main`.
- **No Claude Code footer in commit messages.**
- Do not push or open a PR without explicit user confirmation.
- A migration file on disk does nothing until it is added to the `MIGRATIONS` array in `src-tauri/src/tenants.rs` — the SQL is `include_str!`'d.
- Every schema change bumps `SCHEMA_VERSION` in `src-tauri/src/data_io.rs`. Current is 49 → target **50**.
- New column name, verbatim: **`pdf_template`**. It replaces `pdf_template_invoice` and `pdf_template_quote`, which are dropped.
- Version bump: feature → minor. `0.149.0` → **`0.150.0`**, synced across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`.
- The five template keys, verbatim: `classic`, `modern`, `minimal`, `compact`, `letterhead`.
- **`resolveTemplateKey(stored, entitled)` returns `"classic"` whenever `entitled` is false**, and `entitledToTemplates` defaults to `false` in every payload builder. Any callsite that forgets to pass `entitledToTemplates: license.hasFeature("pdf_templates")` silently renders classic with no error.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src-tauri/migrations/0050_unified_pdf_template.sql` | Create | Collapses two columns into one |
| `src-tauri/src/tenants.rs` | Modify | Registers migration 50 |
| `src-tauri/src/data_io.rs` | Modify | `SCHEMA_VERSION` → 50 |
| `app/stores/settings.ts` | Modify | Row type + updatable allowlist |
| `app/lib/invoice-pdf.ts`, `app/lib/quote-pdf.ts` | Modify | Repoint to `pdf_template` |
| `app/pages/settings/pdf.vue` | Modify | One picker; three preview buttons |
| `app/pages/onboarding.vue` | Modify | One write instead of two |
| `src-tauri/templates/common.typ` | Modify | `template-config` + `doc-header` |
| `src-tauri/templates/payslip.typ` | Modify | Imports common; consumes both |
| `src-tauri/src/pdf.rs` | Modify | Payslip gets `common.typ`; bill honours key |
| `app/lib/payslip-pdf.ts`, `app/lib/bill-pdf.ts` | Modify | Emit `template` |
| `app/pages/payslips/*.vue`, `app/pages/bills/*.vue` | Modify | Pass entitlement flag |
| `app/lib/sample-pdf.ts` | Modify | `samplePayslipPayload` |

### Render-verification harness (used by Tasks 2 and 3)

Several steps below render a template directly with the bundled sidecar. The
recipe, used verbatim each time:

```bash
WORK="$SCRATCH/typcheck" && rm -rf "$WORK" && mkdir -p "$WORK"
cp src-tauri/templates/payslip.typ src-tauri/templates/common.typ "$WORK/"
# write $WORK/data.json (payload with a "template" key), then:
./src-tauri/binaries/typst-x86_64-pc-windows-msvc.exe \
  compile --root "$WORK" --font-path src-tauri/fonts \
  --format png --ppi 110 "$WORK/payslip.typ" "$WORK/out.png"
```

`$SCRATCH` is the session scratchpad directory. A `variable fonts are not
currently supported` warning is pre-existing and harmless. Copy `common.typ`
alongside — without it the import fails.

---

### Task 1: Collapse to one setting

Leaves the tree green with invoice/quote behaviour unchanged. Nothing about payslips or bills yet.

**Files:**
- Create: `src-tauri/migrations/0050_unified_pdf_template.sql`
- Modify: `src-tauri/src/tenants.rs`, `src-tauri/src/data_io.rs:56`
- Modify: `app/stores/settings.ts:43-44`, `:119-120`
- Modify: `app/lib/invoice-pdf.ts:62`, `app/lib/quote-pdf.ts:58`
- Modify: `app/pages/settings/pdf.vue` (lines 213–300 markup, 409, 415–416, 435, 441, 468–469, 488–489)
- Modify: `app/pages/onboarding.vue:536`, `:608-609`

**Interfaces:**
- Consumes: nothing.
- Produces: `company_settings.pdf_template` (TEXT NOT NULL DEFAULT 'classic') and `CompanySettingsRow.pdf_template: string`. Tasks 2–4 read this.

- [ ] **Step 1: Create the migration**

Create `src-tauri/migrations/0050_unified_pdf_template.sql`:

```sql
-- One PDF template for every document, replacing the per-type columns.
--
-- pdf_template_invoice / pdf_template_quote (migration 0037) only ever
-- reached quotes and invoices; bills were hardcoded to classic and payslips
-- had their own standalone template entirely. Collapsing to a single column
-- lets the payslip and bill obey the user's choice too. Per-type divergence
-- can come back later as a purely additive change.
--
-- The INVOICE choice wins the collapse: it is the document users tune first,
-- so carrying it forward keeps the most-seen output visually unchanged.

ALTER TABLE company_settings ADD COLUMN pdf_template TEXT NOT NULL DEFAULT 'classic';
UPDATE company_settings SET pdf_template = pdf_template_invoice;
ALTER TABLE company_settings DROP COLUMN pdf_template_invoice;
ALTER TABLE company_settings DROP COLUMN pdf_template_quote;
```

- [ ] **Step 2: Register it and bump SCHEMA_VERSION**

In `src-tauri/src/tenants.rs`, below the migration-49 line:

```rust
	(50, "unified pdf template", include_str!("../migrations/0050_unified_pdf_template.sql")),
```

In `src-tauri/src/data_io.rs` line 56: `pub const SCHEMA_VERSION: i32 = 50;`

- [ ] **Step 3: Update the settings store**

In `app/stores/settings.ts`, replace lines 43–44:

```ts
	pdf_template_invoice: string
	pdf_template_quote: string
```

with:

```ts
	// One selectable layout for every doc-family PDF (quote / invoice / bill /
	// payslip). One of the keys in app/lib/pdf-templates.ts; unknown values
	// fall back to "classic" in both the JS resolver and the Rust registry.
	pdf_template: string
```

Then in `UPDATABLE_COLUMNS`, replace the two entries at lines 119–120:

```ts
	"pdf_template_invoice",
	"pdf_template_quote",
```

with:

```ts
	"pdf_template",
```

- [ ] **Step 4: Repoint the invoice and quote builders**

`app/lib/invoice-pdf.ts` line 62 — change `settings?.pdf_template_invoice` to `settings?.pdf_template`:

```ts
		template: resolveTemplateKey(settings?.pdf_template, entitledToTemplates),
```

`app/lib/quote-pdf.ts` line 58 — same change:

```ts
		template: resolveTemplateKey(settings?.pdf_template, entitledToTemplates),
```

- [ ] **Step 5: Collapse the two pickers in `/settings/pdf`**

In `app/pages/settings/pdf.vue`:

Script — line 409, replace the two keys in the `PdfForm` type with one:

```ts
	type PdfForm = Pick<SettingsUpdate, "pdf_header_logo_path" | "pdf_font" | "pdf_theme_color" | "pdf_template">;
```

Lines 415–416, the reactive form defaults — replace both with:

```ts
		pdf_template: "classic"
```

Lines 435 and 441, the two `buildPayload` closures — repoint both to the single key:

```ts
		buildPayload: () => sampleInvoicePayload(store.settings, currency.value, form.pdf_template),
```
```ts
		buildPayload: () => sampleQuotePayload(store.settings, currency.value, form.pdf_template),
```

Lines 468–469, the hydrate — replace both with:

```ts
		form.pdf_template = s.pdf_template || "classic";
```

Lines 488–489, the save — replace both with:

```ts
				pdf_template: form.pdf_template
```

Template — the card currently holds two picker columns in a
`grid grid-cols-1 lg:grid-cols-2 gap-6`. Replace that whole grid with a
single picker. Keep the existing button markup; only the heading, the
bound key, and the preview cluster change:

```vue
						<div>
							<div class="flex items-center justify-between mb-2 gap-2">
								<div class="text-sm font-medium">
									PDF template
								</div>
								<div class="flex items-center gap-2">
									<UButton
										size="xs"
										variant="soft"
										icon="i-lucide-eye"
										:loading="invoicePreview.state.rendering"
										@click="invoicePreview.open()"
									>
										Invoice
									</UButton>
									<UButton
										size="xs"
										variant="soft"
										icon="i-lucide-eye"
										:loading="quotePreview.state.rendering"
										@click="quotePreview.open()"
									>
										Quote
									</UButton>
								</div>
							</div>
							<div class="space-y-2">
								<button
									v-for="t in PDF_TEMPLATES"
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
									<div>
										<div class="text-sm font-medium">
											{{ t.label }}
										</div>
										<div class="text-xs text-(--ui-text-muted) mt-0.5">
											{{ t.description }}
										</div>
									</div>
								</button>
							</div>
						</div>
```

The payslip preview button is added in Task 4, once `samplePayslipPayload` exists.

Also update the `SectionCard` subtitle (line 205) so it no longer says the
choice is client-facing only:

```
						subtitle="Pick one layout for your quote, invoice, bill, and payslip PDFs. Your theme colour, font, and header logo apply to every template — only the layout changes."
```

- [ ] **Step 6: Simplify onboarding**

In `app/pages/onboarding.vue` line 536, hydrate from the new column:

```ts
		pdf_template: settingsStore.settings?.pdf_template || "classic",
```

Lines 608–609 currently fan one choice out to two columns:

```ts
				pdf_template_invoice: form.pdf_template,
				pdf_template_quote: form.pdf_template,
```

Replace both lines with one:

```ts
				pdf_template: form.pdf_template,
```

No markup change — onboarding's picker already binds `form.pdf_template`.

- [ ] **Step 7: Verify it compiles and lints**

```bash
cd src-tauri && cargo check
```
Expected: `Finished`. (`Blocking waiting for file lock` means `tauri:dev` is running — wait, don't kill it.)

```bash
bun run lint
```
Expected: exits 0. A leftover `pdf_template_invoice` / `pdf_template_quote` reference anywhere will surface here as a TS error.

- [ ] **Step 8: Confirm no stale references remain**

Run: `grep -rn "pdf_template_invoice\|pdf_template_quote" app/ src-tauri/ --include=*.ts --include=*.vue --include=*.rs`
Expected: **no matches** outside `src-tauri/migrations/` (the 0037 and 0050 SQL files legitimately still name them).

- [ ] **Step 9: Commit**

```bash
git add src-tauri/migrations/0050_unified_pdf_template.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs app/stores/settings.ts app/lib/invoice-pdf.ts app/lib/quote-pdf.ts app/pages/settings/pdf.vue app/pages/onboarding.vue
git commit -m "feat: collapse per-type PDF template settings into one (migration 0050)"
```

---

### Task 2: Shared template config + header, consumed by the payslip

**Files:**
- Modify: `src-tauri/templates/common.typ` (append two functions)
- Modify: `src-tauri/templates/payslip.typ` (lines 1–65 area, plus the header block)
- Modify: `src-tauri/src/pdf.rs` (`export_payslip_pdf`, ~line 319)
- Modify: `app/lib/payslip-pdf.ts`
- Modify: `app/pages/payslips/[id].vue:713`, `app/pages/payslips/index.vue:595`, `:797`

**Interfaces:**
- Consumes: `CompanySettingsRow.pdf_template` from Task 1.
- Produces: `template-config(data)` → dictionary with keys `margin`, `text-size`, `leading`, `spacing`, `footer`; and `doc-header(data)` → content. Task 3 does not use these (bills already render `doc-*.typ`), but a future cleanup will.

- [ ] **Step 1: Add `template-config` to `common.typ`**

Append to `src-tauri/templates/common.typ`. Every value is transcribed from
the corresponding `doc-*.typ`:

```typst
// --- template config ----------------------------------------------------
// Page-level settings per template key. Typst `set` rules inside a function
// are scoped to that function's content, so a header function alone can't
// carry margins / base size / footer style — the caller applies these with
// its own `set` rules. Values transcribed verbatim from each doc-*.typ.
#let template-config(data) = {
  let key = data.at("template", default: "classic")
  let ruled-footer(gap, size) = [
    #line(length: 100%, stroke: 0.5pt + rgb("#e5e7eb"))
    #v(gap)
    #align(center, text(size: size, fill: rgb("#6b7280"))[#footer-content(data)])
  ]
  if key == "minimal" {
    (
      margin: (x: 22mm, top: 22mm, bottom: 22mm),
      text-size: 9pt,
      leading: 0.62em,
      spacing: 0.72em,
      footer: align(center, text(size: 8pt, fill: rgb("#9ca3af"))[#footer-content(data)]),
    )
  } else if key == "compact" {
    (
      margin: (x: 14mm, top: 12mm, bottom: 12mm),
      text-size: 8.5pt,
      leading: 0.5em,
      spacing: 0.5em,
      footer: ruled-footer(3pt, 7.5pt),
    )
  } else if key == "letterhead" {
    // top: 45mm reserves the blank band for pre-printed stationery.
    (
      margin: (x: 18mm, top: 45mm, bottom: 18mm),
      text-size: 9.5pt,
      leading: 0.55em,
      spacing: 0.65em,
      footer: ruled-footer(4pt, 8pt),
    )
  } else {
    // classic + modern share the same page setup.
    (
      margin: (x: 18mm, top: 16mm, bottom: 18mm),
      text-size: 9.5pt,
      leading: 0.55em,
      spacing: 0.65em,
      footer: ruled-footer(4pt, 8pt),
    )
  }
}
```

- [ ] **Step 2: Add `doc-header` to `common.typ`**

Append below `template-config`. Each branch reproduces the matching
`doc-*.typ` header verbatim:

```typst
// --- shared document header --------------------------------------------
// The five selectable header treatments. Needs data.title and data.number.
// NOTE: doc-*.typ still carry their own inline copies — this function is
// consumed by payslip.typ only, so the client-facing render paths stay
// untouched. Unifying them is a follow-up cleanup.
#let doc-header(data) = {
  let key = data.at("template", default: "classic")
  let logo-or-wordmark(logo-h, name-size) = if data.logo_file != none {
    image(data.logo_file, height: logo-h)
  } else if data.business_name != none and data.business_name != "" {
    box(height: logo-h)[
      #set align(right + horizon)
      #text(weight: "bold", size: name-size, tracking: 0.02em)[#data.business_name]
    ]
  } else {
    box(height: logo-h)
  }

  if key == "modern" [
    #block(width: 100%, fill: rgb(data.theme_color), inset: (x: 16pt, y: 14pt), radius: 3pt)[
      #set text(fill: white)
      #grid(
        columns: (1fr, auto),
        align: horizon,
        gutter: 16pt,
        [
          #text(weight: "bold", size: 20pt, tracking: 0.04em)[#data.title]
          #v(2pt)
          #text(size: 10.5pt)[\##data.number]
        ],
        if data.logo_file != none {
          image(data.logo_file, height: 12mm)
        } else if data.business_name != none and data.business_name != "" {
          text(weight: "bold", size: 15pt, tracking: 0.02em)[#data.business_name]
        } else { [] },
      )
    ]
    #v(16pt)
  ] else if key == "minimal" [
    #grid(
      columns: (1fr, auto),
      align: horizon,
      gutter: 16pt,
      if data.business_name != none and data.business_name != "" {
        text(weight: "regular", size: 14pt, tracking: 0.06em)[#data.business_name]
      } else { [] },
      align(right)[
        #text(size: 9pt, tracking: 0.2em, fill: rgb("#6b7280"))[#upper(data.title)]
        #v(2pt)
        #text(weight: "semibold", size: 13pt)[\##data.number]
      ],
    )
    #v(24pt)
  ] else if key == "compact" [
    #align(right)[#logo-or-wordmark(9mm, 13pt)]
    #v(-1.5mm)
    #line(length: 100%, stroke: 1.5pt + rgb(data.theme_color))
    #v(6pt)
    #align(center, text(weight: "bold", size: 12pt, tracking: 0.04em)[#data.title])
    #v(10pt)
  ] else if key == "letterhead" [
    #align(center, text(weight: "bold", size: 14pt, tracking: 0.04em)[#data.title])
    #v(6pt)
    #line(length: 100%, stroke: 2pt + rgb(data.theme_color))
    #v(14pt)
  ] else [
    #align(right)[#logo-or-wordmark(12mm, 16pt)]
    #v(2mm)
    #line(length: 100%, stroke: 2pt + rgb(data.theme_color))
    #v(8pt)
    #align(center, text(weight: "bold", size: 14pt, tracking: 0.04em)[#data.title])
    #v(14pt)
  ]
}
```

- [ ] **Step 3: Rework the top of `payslip.typ`**

Replace lines 1–31 of `src-tauri/templates/payslip.typ` (the comment block,
`#let data`, `#set document`, `#set page`, the `chosen-font` let, `#set text`,
`#set par`) with:

```typst
// Payslip template — single-page A4 with header, employee block, two
// stacked tables (earnings, deductions), big NET PAY card, optional bank
// details and notes, and an optional two-column sign-off.
//
// Driven by data.json fields produced by app/lib/payslip-pdf.ts. Page setup
// and the header come from common.typ so the payslip honours the user's
// selected PDF template (migration 0050) exactly as quotes/invoices do.

#import "common.typ": *

#let data = json("data.json")
#let cfg = template-config(data)

#set document(title: data.number, author: data.business_name)
#set page(paper: "a4", margin: cfg.margin, footer: cfg.footer)
#set text(font: resolve-font(data), size: cfg.text-size, lang: "en", number-width: "tabular")
#set par(leading: cfg.leading, spacing: cfg.spacing)
```

- [ ] **Step 4: Replace the payslip's hand-rolled header**

Still in `payslip.typ`, replace the header block — the
`// Header: logo or business-name wordmark + theme rule` comment through the
centred `PAY SLIP` title and its trailing `#v(...)` — with:

```typst
#doc-header(data)
```

- [ ] **Step 5: Drop the payslip's duplicate helpers**

Delete these two local definitions (currently lines 64–65); `common.typ`
supplies equivalents via the wildcard import:

```typst
#let label(t) = text(weight: "bold", size: 8.5pt, tracking: 0.04em)[#upper(t)]
#let faint(t) = text(fill: rgb("#6b7280"), size: 8.5pt)[#t]
```

`faint` is byte-identical in `common.typ`. `label` becomes `lbl` — update
every `#label("…")` callsite in `payslip.typ` to `#lbl("…")`. Removing the
local `label` also stops it shadowing Typst's built-in `label`.

Run `grep -n "label(" src-tauri/templates/payslip.typ` afterwards and confirm
every remaining hit is `lbl(` or `table.cell`-unrelated.

- [ ] **Step 6: Give the payslip renderer `common.typ`**

In `src-tauri/src/pdf.rs`, `export_payslip_pdf` (~line 319) currently passes
no companion files:

```rust
	render_pdf(&app, "payslip.typ", PAYSLIP_TEMPLATE, data, PathBuf::from(output_path), protect_password, &[]).await
```

Change the last argument so the import resolves:

```rust
	render_pdf(&app, "payslip.typ", PAYSLIP_TEMPLATE, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
```

- [ ] **Step 7: Emit `template` and `title` from the payslip payload**

In `app/lib/payslip-pdf.ts`, add the import:

```ts
import { resolveTemplateKey } from "~/lib/pdf-templates";
```

Add the optional flag to `PayslipPdfPayloadArgs`:

```ts
	entitledToTemplates?: boolean
```

Destructure it with the same `= false` default the other builders use:

```ts
	const { row, lines, settings, currency, paidCents, balanceCents, entitledToTemplates = false } = args;
```

And add two fields to the returned object, beside `number`:

```ts
		template: resolveTemplateKey(settings?.pdf_template, entitledToTemplates),
		title: "PAY SLIP",
```

- [ ] **Step 8: Pass the entitlement flag at all three payslip callsites**

`resolveTemplateKey(key, false)` returns `"classic"`, so a missed callsite
renders classic forever with no error. Add this property to the
`buildPayslipPdfPayload({ … })` object at each of:

- `app/pages/payslips/[id].vue:713`
- `app/pages/payslips/index.vue:595` (row action)
- `app/pages/payslips/index.vue:797` (bulk export)

```ts
			entitledToTemplates: license.hasFeature("pdf_templates")
```

Both payslip pages already have `useLicenseStore` in scope — verified — so no
import or store instantiation is needed here.

- [ ] **Step 9: Render the payslip on all five templates**

Use the harness from the File Structure section, with this exact
`$WORK/data.json`. Note `logo_file` (not `logo_path`) is what the template
reads — Rust derives it — and `null` here exercises the wordmark fallback:

```json
{
  "template": "classic",
  "title": "PAY SLIP",
  "number": "PSL-0007",
  "theme_color": "#16a34a",
  "font_family": "Akt",
  "currency_code": "LKR",
  "currency_symbol": "Rs",
  "period_start": "2026-06-01",
  "period_end": "2026-06-30",
  "period_display": "2026-06-01 → 2026-06-30",
  "pay_date": "2026-06-30",
  "employee": {
    "full_name": "Nimal Perera",
    "employee_number": "EMP-004",
    "designation": "Senior Engineer",
    "nic": "199012345678",
    "bank_name": "Commercial Bank",
    "bank_branch": "Colombo 03",
    "bank_account_number": "1234567890",
    "bank_account_name": "N Perera"
  },
  "earnings": [
    { "label": "Basic", "amount_display": "150,000.00" },
    { "label": "Transport allowance", "amount_display": "15,000.00" }
  ],
  "deductions": [
    { "label": "EPF (employee 8%)", "amount_display": "12,000.00" }
  ],
  "formatted": { "earnings": "165,000.00", "deductions": "12,000.00", "net": "153,000.00" },
  "paid_cents": 15300000,
  "paid_display": "153,000.00",
  "balance_display": "0.00",
  "statutory_enabled": true,
  "epf_employer_display": "18,000.00",
  "etf_display": "4,500.00",
  "total_cost_display": "187,500.00",
  "show_signatures": true,
  "notes": "Paid by bank transfer.",
  "business_name": "Gravitide (Pvt) Ltd",
  "website": "gravitide.dev",
  "phone": "+94 11 234 5678",
  "address_line1": "42 Galle Road",
  "city": "Colombo",
  "logo_file": null,
  "logo_path": null
}
```

Render once per key by rewriting `"template"` between runs:

```bash
for k in classic modern minimal compact letterhead; do
  sed -i "s/\"template\": \"[a-z]*\"/\"template\": \"$k\"/" "$WORK/data.json"
  ./src-tauri/binaries/typst-x86_64-pc-windows-msvc.exe \
    compile --root "$WORK" --font-path src-tauri/fonts \
    --format png --ppi 110 "$WORK/payslip.typ" "$WORK/$k.png" || echo "FAILED: $k"
done
```

Expected: five PNGs, no failures. Inspect each and confirm:

1. `classic` — logo/wordmark top-right, 2pt theme rule, centred PAY SLIP. Body identical to the pre-change payslip.
2. `modern` — theme-coloured band with PAY SLIP + `#PSL-0007` reversed white.
3. `minimal` — business name left, tracked PAY SLIP + number right, no rule, wider 22mm margins, footer has no rule.
4. `compact` — 9mm logo, thinner rule, visibly denser body, narrower 14mm margins.
5. `letterhead` — **no logo**, and a deep blank band at the top (45mm).

In every one, the body must still show earnings, deductions, NET PAY card,
employer contributions, PAY TO, and NOTES.

- [ ] **Step 10: Lint and commit**

```bash
bun run lint
```
Expected: exits 0.

```bash
git add src-tauri/templates/common.typ src-tauri/templates/payslip.typ src-tauri/src/pdf.rs app/lib/payslip-pdf.ts app/pages/payslips/
git commit -m "feat: payslip PDF follows the selected template"
```

---

### Task 3: Bills follow the selected template

**Files:**
- Modify: `src-tauri/src/pdf.rs` (`export_bill_pdf`, ~line 309-315)
- Modify: `app/lib/bill-pdf.ts`
- Modify: `app/pages/bills/[id].vue:974`, `app/pages/bills/index.vue:684`, `:818`

**Interfaces:**
- Consumes: `CompanySettingsRow.pdf_template` from Task 1.
- Produces: nothing further.

- [ ] **Step 1: Make the Rust command honour the payload key**

In `src-tauri/src/pdf.rs`, `export_bill_pdf` currently hardcodes classic:

```rust
	render_pdf(&app, "doc-classic.typ", DOC_CLASSIC, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
```

Replace those with the same two lines quote and invoice use:

```rust
	let (name, src) = document_template(data.get("template").and_then(|v| v.as_str()));
	render_pdf(&app, name, src, data, PathBuf::from(output_path), protect_password, &[("common.typ", COMMON_TEMPLATE)]).await
```

- [ ] **Step 2: Emit `template` from the bill payload**

In `app/lib/bill-pdf.ts`, add the import:

```ts
import { resolveTemplateKey } from "~/lib/pdf-templates";
```

Add to `BillPdfArgs`:

```ts
	entitledToTemplates?: boolean
```

Update the destructure:

```ts
export const buildBillPdfPayload = ({ row: b, lines, settings, currency, paidCents, entitledToTemplates = false }: BillPdfArgs) => {
```

And add the field to the returned object, beside the other top-level keys:

```ts
		template: resolveTemplateKey(settings?.pdf_template, entitledToTemplates),
```

- [ ] **Step 3: Pass the entitlement flag at all three bill callsites**

Add to the `buildBillPdfPayload({ … })` object at each of
`app/pages/bills/[id].vue:974`, `app/pages/bills/index.vue:684`, and
`app/pages/bills/index.vue:818`:

```ts
			entitledToTemplates: license.hasFeature("pdf_templates")
```

**Neither bills page currently imports the license store** — verified, unlike
the payslip pages. Add to both `app/pages/bills/[id].vue` and
`app/pages/bills/index.vue`, alongside the other store instantiations:

```ts
	import { useLicenseStore } from "~/stores/license";
```
```ts
	const license = useLicenseStore();
```

- [ ] **Step 4: Verify**

```bash
cd src-tauri && cargo check
```
Expected: `Finished`.

```bash
bun run lint
```
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pdf.rs app/lib/bill-pdf.ts app/pages/bills/
git commit -m "feat: bill PDF follows the selected template"
```

---

### Task 4: Payslip preview, docs, version bump, full verification

**Files:**
- Modify: `app/lib/sample-pdf.ts` (append `samplePayslipPayload`)
- Modify: `app/pages/settings/pdf.vue` (third preview button + `usePdfPreview` + modal)
- Modify: `CLAUDE.md` (migration index, schema notes)
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.lock`

**Interfaces:**
- Consumes: `pdf_template` (Task 1), the payslip render path (Task 2).
- Produces: `samplePayslipPayload(settings, currency, templateKey)`.

- [ ] **Step 1: Add the sample payslip payload**

Append to `app/lib/sample-pdf.ts`. It does **not** spread `base()` — the
payslip template reads a different shape (employee / earnings / deductions)
than the doc family:

```ts
export function samplePayslipPayload(settings: CompanySettingsRow | null, currency: SampleCurrency, templateKey: string) {
	return {
		template: templateKey,
		title: "PAY SLIP",
		number: "PSL-0042",
		theme_color: pdfThemeHex(settings),
		font_family: settings?.pdf_font ?? "Akt",
		currency_code: currency.code,
		currency_symbol: currency.symbol,
		period_start: "2026-06-01",
		period_end: "2026-06-30",
		period_display: "2026-06-01 → 2026-06-30",
		pay_date: "2026-06-30",
		employee: {
			full_name: "Nimal Perera",
			employee_number: "EMP-004",
			designation: "Senior Engineer",
			nic: "199012345678",
			bank_name: "Commercial Bank",
			bank_branch: "Colombo 03",
			bank_account_number: "1234567890",
			bank_account_name: "N Perera"
		},
		earnings: [
			{ label: "Basic", amount_display: "150,000.00" },
			{ label: "Transport allowance", amount_display: "15,000.00" }
		],
		deductions: [
			{ label: "EPF (employee 8%)", amount_display: "12,000.00" }
		],
		formatted: { earnings: "165,000.00", deductions: "12,000.00", net: "153,000.00" },
		paid_cents: null,
		paid_display: null,
		balance_display: null,
		statutory_enabled: true,
		epf_employer_display: "18,000.00",
		etf_display: "4,500.00",
		total_cost_display: "187,500.00",
		show_signatures: settings?.payslip_show_signatures === 1,
		notes: "Paid by bank transfer.",
		business_name: settings?.business_name ?? "Your Business",
		website: settings?.website ?? "yourbusiness.lk",
		phone: settings?.phone ?? "+94 11 234 5678",
		address_line1: settings?.address_line1 ?? "42 Galle Road",
		city: settings?.city ?? "Colombo",
		logo_path: settings?.pdf_header_logo_path ?? null
	};
}
```

- [ ] **Step 2: Wire the payslip preview into `/settings/pdf`**

Import it alongside the existing two:

```ts
	import { samplePayslipPayload, sampleInvoicePayload, sampleQuotePayload } from "~/lib/sample-pdf";
```

Add a third `usePdfPreview` beside `invoicePreview` and `quotePreview`,
matching their shape. Copy the existing `quotePreview` declaration and change
the command, payload builder, and file name — the Rust command is
`export_payslip_pdf`:

```ts
	const payslipPreview = usePdfPreview({
		command: "export_payslip_pdf",
		buildPayload: () => samplePayslipPayload(store.settings, currency.value, form.pdf_template),
		fileName: () => "sample-payslip.pdf",
		title: "Payslip template preview"
	});
```

The option keys are `command` / `buildPayload` / `fileName` / `title` —
matching the existing `invoicePreview` and `quotePreview` declarations. Note
it is `fileName`, not `suggestedFileName`.

Add a third button to the preview cluster from Task 1 Step 5:

```vue
									<UButton
										size="xs"
										variant="soft"
										icon="i-lucide-eye"
										:loading="payslipPreview.state.rendering"
										@click="payslipPreview.open()"
									>
										Payslip
									</UButton>
```

And a third `PdfPreviewModal` beside the existing two:

```vue
		<PdfPreviewModal
			v-model:open="payslipPreview.state.open"
			:asset-url="payslipPreview.state.assetUrl"
			:temp-path="payslipPreview.state.tempPath"
			:suggested-file-name="payslipPreview.state.suggestedFileName"
			:saving="payslipPreview.state.saving"
			title="Payslip template preview"
			@save="payslipPreview.onSave"
			@cancel="payslipPreview.onCancel"
		/>
```

- [ ] **Step 3: Bump the version**

`0.149.0` → `0.150.0` in `package.json` (line 4), `src-tauri/Cargo.toml`
(line 8), `src-tauri/tauri.conf.json` (line 35).

Then `cd src-tauri && cargo check` to refresh `Cargo.lock`, and confirm:

```bash
grep -A1 'name = "sakoram_billing"' src-tauri/Cargo.lock
```
Expected: `version = "0.150.0"`.

- [ ] **Step 4: Update `CLAUDE.md`**

Append to the migrations block, after the `0049_payslip_signatures.sql` row:

```
0050_unified_pdf_template.sql           ← collapse `pdf_template_invoice` + `pdf_template_quote` into a single `company_settings.pdf_template` (TEXT NOT NULL DEFAULT 'classic'); the invoice choice wins the collapse. One picker on /settings/pdf now drives quote / invoice / bill / payslip alike. `common.typ` gained `template-config(data)` (page margins / base size / par / footer per key) + `doc-header(data)` (the 5 header treatments); `payslip.typ` imports common.typ for the first time and consumes both, so `letterhead`'s 45mm top reservation and `compact`'s density finally reach payslips. `export_bill_pdf` stopped hardcoding doc-classic. The 5 `doc-*.typ` files still carry their own inline header copies — unifying them is a follow-up. SCHEMA_VERSION → 50.
```

Also update the `company_settings` bullet in the Schema overview section: it
lists `ui_font`, `pdf_font`, `theme_color` etc. — replace any mention of the
per-type template columns with `pdf_template`.

- [ ] **Step 5: Run the automated gates**

```bash
bun run lint
```
Expected: exits 0.

```bash
bun run test
```
Expected: all suites pass. `app/lib/pdf-templates.test.ts` exercises
`resolveTemplateKey`, whose behaviour is unchanged.

- [ ] **Step 6: Confirm quotes and invoices did not regress**

The `doc-*.typ` files were never touched, so any visual change would mean the
payload repoint in Task 1 broke something. Render an invoice both ways using
the harness — copy `doc-classic.typ` + `common.typ` into `$WORK`, write a
payload from `sampleInvoicePayload`'s shape with `"template": "classic"`, and
compile. Confirm it renders a normal invoice: header, party block, items
table, totals.

- [ ] **Step 7: Manual verification in the running app**

`bun run tauri:dev` (exit 255 on window close is normal).

1. `/settings/pdf` shows **one** template picker with five options and three preview buttons.
2. All three previews render; the payslip preview reflects the selected template.
3. Pick `letterhead`, save, reload the page — the choice persists.
4. Generate a real payslip PDF from `/payslips/[id]` — no logo, deep top margin.
5. Generate a real bill PDF — follows the same template, no longer always classic.
6. Generate a quote and an invoice — unchanged from before.
7. Onboarding a new business still offers the template picker and saves it.

- [ ] **Step 8: Commit**

```bash
git add app/lib/sample-pdf.ts app/pages/settings/pdf.vue CLAUDE.md package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "feat: payslip template preview + docs (v0.150.0)"
```

- [ ] **Step 9: Report and stop**

Summarise what shipped and the verification results, including which of the
five templates were render-checked. **Do not push and do not open a PR** —
wait for explicit user confirmation.
