# One PDF template setting, applied to the payslip (and the bill)

**Date:** 2026-07-26
**Status:** Approved, ready for implementation

## Problem

The selectable PDF templates from migration 0037 (`classic` / `modern` /
`minimal` / `compact` / `letterhead`) only reach two document types.
Everything else ignores the user's choice:

| Export | Template used today | Honours the setting? |
|---|---|---|
| quote | `doc-*.typ` via payload `template` | yes — `pdf_template_quote` |
| invoice | `doc-*.typ` via payload `template` | yes — `pdf_template_invoice` |
| bill | hardcoded `doc-classic.typ` (`pdf.rs:315`) | **no** |
| payslip | standalone `payslip.typ` | **no** |
| voucher / report / statement / letter | own standalone templates | no |

`payslip.typ` is a 306-line standalone that imports nothing. It
hand-rolls its own header, footer, `faint`, `label`, and font
resolution — all duplicating `common.typ`.

The `letterhead` case is the sharpest edge. Picking it means "I print on
pre-printed stationery, don't draw my logo." The payslip draws the logo
anyway, so a business on letterhead paper gets a doubled logo on every
payslip. That is a defect, not just an inconsistency.

## Goal

One business-wide PDF template setting that drives quote, invoice, bill,
and payslip alike.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Setting shape | **Collapse `pdf_template_invoice` + `pdf_template_quote` into a single `pdf_template`** | User's call: one template for all, for now. Per-type divergence can be re-introduced later as a purely additive change. |
| Template coverage | **All five styles** | Consistent with what invoice and quote already offer; each maps cleanly onto the payslip header. |
| Where the shared header lives | **New `doc-header(data)` in `common.typ`, consumed by `payslip.typ` only** | `doc-*.typ` stay untouched, so there is zero regression risk on client-facing PDFs. Accepted cost: header logic exists in two places until a follow-up cleanup. |
| Bills | **In scope** | A single global "PDF template" picker that bills quietly ignore is incoherent, and `export_bill_pdf` already renders a `doc-*` template — it is a one-line change. |
| Voucher / report / statement / letter | **Out of scope** | Not in the doc family. A voucher is a receipt, statement and report are aggregates, and letters already have their own pre-printed mode. Separate, much larger job. |

### Accepted consequence

You lose the ability to give quotes a different look from invoices. The
migration carries the current **invoice** choice forward into the new
column, so the visible output for invoices, and for quotes that already
matched, does not change on upgrade. A tenant that had deliberately set
quote ≠ invoice will see quotes adopt the invoice look.

## Changes

### 1. Migration — `src-tauri/migrations/0050_unified_pdf_template.sql`

```sql
ALTER TABLE company_settings ADD COLUMN pdf_template TEXT NOT NULL DEFAULT 'classic';
UPDATE company_settings SET pdf_template = pdf_template_invoice;
ALTER TABLE company_settings DROP COLUMN pdf_template_invoice;
ALTER TABLE company_settings DROP COLUMN pdf_template_quote;
```

`ALTER … DROP COLUMN` is already proven in this codebase (migration
0043). Register in the `MIGRATIONS` array in `src-tauri/src/tenants.rs`;
bump `SCHEMA_VERSION` 49 → 50 in `src-tauri/src/data_io.rs`. No `TABLES`
change — `company_settings` is already exported and columns are
discovered via `PRAGMA table_info`.

### 2. Typst — `doc-header(data)` in `common.typ`

One function, five branches on `data.at("template", default: "classic")`,
each reproducing the corresponding `doc-*.typ` header **verbatim**:

- `classic` — logo top-right (12mm) or business-name wordmark, 2pt theme
  rule, centred title.
- `modern` — full-width theme-colour block, radius 3pt, inset (x:16pt,
  y:14pt); title 20pt + `#number` 10.5pt on the left, logo/wordmark right,
  all reversed white.
- `minimal` — business name left (14pt regular, tracking 0.06em) / title
  9pt uppercase tracked 0.2em + number 13pt semibold right. No rule, no
  logo. 24pt trailing space.
- `compact` — 9mm logo, 1.5pt rule, 12pt centred title, tighter spacing.
- `letterhead` — no logo at all; centred title then 2pt rule.

The function needs `data.title` and `data.number`.

### 3. Typst — `payslip.typ`

- `#import "common.typ": *` (it currently imports nothing).
- Replace the hand-rolled header block with `#doc-header(data)`.
- Delete the local `label(t)` and `faint(t)` definitions and use
  `common.typ`'s `lbl` and `faint`. `faint` is byte-identical; `lbl` has
  the same body as the local `label`. Dropping the local `label` also
  stops it shadowing Typst's built-in `label`, which is a latent hazard.
- Replace the inline `chosen-font` with `resolve-font(data)` and the
  inline page-footer content with `footer-content(data)`. Both were
  verified behaviourally identical to `common.typ`'s versions.
- Body density: Typst `set` rules inside a function are scoped to that
  function's content, so `doc-header` cannot carry `compact`'s tighter
  leading. `payslip.typ` sets it explicitly from the template key:

```typst
#let tpl = data.at("template", default: "classic")
#set par(leading: if tpl == "compact" { 0.5em } else { 0.55em },
         spacing: if tpl == "compact" { 0.5em } else { 0.65em })
```

`payslip.typ` must now be rendered with `common.typ` written alongside it
— see the Rust change below.

### 4. PDF payloads

- `app/lib/payslip-pdf.ts` — add an optional `entitledToTemplates?: boolean`
  arg (mirroring `InvoicePdfArgs`), plus
  `template: resolveTemplateKey(settings?.pdf_template, entitledToTemplates)`
  and `title: "PAY SLIP"` (the shared header renders the title).
- `app/lib/bill-pdf.ts` — same optional arg plus
  `template: resolveTemplateKey(settings?.pdf_template, entitledToTemplates)`.
- `app/lib/invoice-pdf.ts` and `app/lib/quote-pdf.ts` — repoint from
  `settings?.pdf_template_invoice` / `settings?.pdf_template_quote` to
  `settings?.pdf_template`. The entitlement plumbing is unchanged.

**Landmine:** `entitledToTemplates` defaults to **`false`** in the existing
builders, and `resolveTemplateKey(key, false)` returns `"classic"`. A
payslip or bill callsite that forgets to pass the flag therefore renders
classic forever and the feature looks broken with no error. All six new
callsites must pass `entitledToTemplates: license.hasFeature("pdf_templates")`,
exactly as the invoice and quote pages already do:

- `app/pages/payslips/[id].vue:713`
- `app/pages/payslips/index.vue:595` (row action) and `:797` (bulk export)
- `app/pages/bills/[id].vue:974`
- `app/pages/bills/index.vue:684` (row action) and `:818` (bulk export)

### 5. Rust — `src-tauri/src/pdf.rs`

- `export_bill_pdf` — replace the hardcoded
  `render_pdf(&app, "doc-classic.typ", DOC_CLASSIC, …)` with the same
  `document_template(data.get("template")…)` lookup that quote and
  invoice already use.
- `export_payslip_pdf` — pass `&[("common.typ", COMMON_TEMPLATE)]` as
  companion files instead of `&[]`, so the import resolves.

### 6. Settings store — `app/stores/settings.ts`

Replace `pdf_template_invoice` / `pdf_template_quote` with
`pdf_template: string` on `CompanySettingsRow`, and swap the two entries
in `UPDATABLE_COLUMNS` for the single new one.

### 7. Settings UI — `app/pages/settings/pdf.vue`

The two side-by-side pickers collapse into one **PDF template** picker
(same button list, driven by `PDF_TEMPLATES`). Beside it, three preview
buttons — **Invoice · Quote · Payslip** — each opening the existing
`PdfPreviewModal` against the currently-selected template.

`app/lib/sample-pdf.ts` gains `samplePayslipPayload(settings, currency,
templateKey)`, mirroring the shape of `sampleInvoicePayload`. The card
subtitle changes from "your client-facing PDFs" to cover payslips too.

Concretely: `PdfForm` (line 409) swaps its two template keys for one;
`form.pdf_template_invoice` / `_quote` become `form.pdf_template` at the
picker bindings (lines 238–241, 283–286), the hydrate (468–469), and the
save (488–489); and a third `usePdfPreview` is added beside the existing
invoice and quote ones (435, 441).

### 8. Onboarding — `app/pages/onboarding.vue`

Onboarding **already** models this as a single choice: `form.pdf_template`
drives one picker, and the save fans it out to both columns (lines
608–609). The collapse simplifies it rather than complicating it:

- Line 536 — hydrate from `settingsStore.settings?.pdf_template` instead
  of `?.pdf_template_invoice`.
- Lines 608–609 — the two writes become one, `pdf_template: form.pdf_template`.

No template-picker markup changes.

## Testing

`app/lib/pdf-templates.ts` already has unit tests for `resolveTemplateKey`;
its behaviour is unchanged, so no new unit tests there.

The real risk in this change is **Typst render regressions** — a mis-ported
header branch, or a broken import. Verification is therefore render-based,
using the bundled sidecar directly against a scratch work dir (the same
technique used to verify migration 0049):

1. For each of the five template keys, render the payslip and confirm the
   header matches the corresponding `doc-*.typ` header, and that the body
   (earnings / deductions / net pay / employer contributions / pay-to /
   notes) is unchanged from today's output.
2. `letterhead` renders **no logo** on the payslip.
3. `compact` visibly tightens payslip body density.
4. Render an invoice and a quote before and after the change with the same
   template key and confirm the output is unchanged — the `doc-*.typ`
   files are untouched, so any diff means the payload repoint broke.
5. Render a bill and confirm it now follows the setting instead of always
   rendering classic.

Then in-app via `bun run tauri:dev`: the single picker saves and persists,
and all three preview buttons render.

Finally `bun run lint` and `bun run test`.

## Out of scope

- Voucher, report, statement, and letter templates.
- Refactoring `doc-*.typ` to consume the new `doc-header` (deliberate —
  keeps client-facing render paths untouched). A follow-up cleanup.
- Re-introducing per-document-type template settings.
- Credit notes — they have no PDF export yet.
