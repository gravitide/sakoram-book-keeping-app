# Selectable PDF Templates (invoices + quotes) — Design

**Date**: 2026-06-22
**Branch**: `feat/pdf-templates`
**Tier**: Tier 3 niceties → product differentiator. Client-facing PDFs only.

---

## Goal

Let the user choose among several **layouts** for their client-facing PDFs, picked **per document type** in Settings → PDF. Ship 5 templates: **Classic** (current output, default) + **Modern**, **Minimal**, **Compact**, **Letterhead**. Invoices and quotes each get their own template choice; a live preview renders a sample doc with the selected template. Template choice is a **Plus** feature.

"Template" means **layout** — color and font are already user-customizable (`theme_color`, `pdf_font`) and every template honours them. Reports are explicitly out of scope (this is client-facing docs). Bills aren't sent to customers → they stay on Classic.

## Non-goals

- Per-document template overrides (it's a per-business, per-type setting).
- Templates for reports / vouchers / payslips / statements / credit-notes.
- A WYSIWYG template editor or user-authored templates.
- New colors/fonts — templates reuse the existing `theme_color` + `font_family` + logo + bank/sign-off toggles.

---

## Architecture

### Typst: shared module + thin per-template files

The current single `src-tauri/templates/document.typ` (330 lines, serves quote/invoice/bill) is refactored into:

- **`common.typ`** — the load-bearing, shared content: `json("data.json")` loading; money / qty / date / rate formatters; the **items table** renderer; the party block, project subtitle, notes block, bank-details block, sign-off, and footer. Exposed as functions (`#import "common.typ": *`).
- **Five template files**, each `#import "common.typ": *` and owning only its distinctive **page setup + header + assembly order**:
  - `doc-classic.typ` — reproduces today's `document.typ` output exactly (default).
  - `doc-modern.typ` — full-width theme-colour header band; logo + title reversed white; left-aligned party/meta below.
  - `doc-minimal.typ` — no rules/fills; airy whitespace; light type; small uppercase labels; B&W-clean.
  - `doc-compact.typ` — tighter margins + smaller type + condensed rows for long itemised docs.
  - `doc-letterhead.typ` — ~40 mm blank top for pre-printed stationery; no logo block; content starts lower.

This avoids duplicating the items table 5× (option "5 independent files") and a 1000-line branching `document.typ` (option "one parameterized file"). `document.typ` is deleted once `doc-classic.typ` replaces it.

> **The shared items-table / formatters move verbatim into `common.typ`**, so any template using them renders identically to today. `doc-classic.typ`'s page/header/order is copied from `document.typ`. Net: Classic output is unchanged (verified by before/after compare — see Testing).

### Rust: template registry + multi-file work dir

`src-tauri/src/pdf.rs`:

- `include_str!` each template + `common.typ`. A registry maps a key → template source:
  ```rust
  fn document_template(key: &str) -> (&'static str, &'static str) {
      // returns (filename, source); unknown / missing → classic
      match key {
          "modern"     => ("doc-modern.typ", DOC_MODERN),
          "minimal"    => ("doc-minimal.typ", DOC_MINIMAL),
          "compact"    => ("doc-compact.typ", DOC_COMPACT),
          "letterhead" => ("doc-letterhead.typ", DOC_LETTERHEAD),
          _            => ("doc-classic.typ", DOC_CLASSIC),
      }
  }
  ```
- `render_pdf` gains an `extra_files: &[(&str, &str)]` param (written into the work dir before compiling), so `common.typ` lands alongside the chosen template. All other callers (voucher/payslip/report/statement) pass `&[]` — unchanged.
- `export_quote_pdf` / `export_invoice_pdf` read `data.get("template")` (a string key), resolve via `document_template`, and call `render_pdf(chosen_filename, chosen_src, data, …, &[("common.typ", COMMON)])`. `export_bill_pdf` always uses Classic.
- typst CLI args remain fully Rust-controlled (`compile --root <dir> --font-path <dir> <chosen>.typ <out>.pdf`) → the shell-execute capability is unaffected (no JS-supplied filename).

### Data flow

`company_settings.pdf_template_{invoice,quote}` → settings store → `invoice-pdf.ts` / `quote-pdf.ts` payload `template:` field → `export_*_pdf` reads it → registry picks the `.typ`.

---

## Schema

### Migration 0037: `company_settings` template columns

```sql
ALTER TABLE company_settings ADD COLUMN pdf_template_invoice TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE company_settings ADD COLUMN pdf_template_quote   TEXT NOT NULL DEFAULT 'classic';
```

Bump `SCHEMA_VERSION` in `data_io.rs`. `company_settings` is already in the export `TABLES` list (`PRAGMA table_info` discovers the new columns automatically). No bill column — bills are never templated.

Valid keys: `classic | modern | minimal | compact | letterhead`. The DB stores a free-text key; Rust's registry is the validator (unknown → classic).

---

## Licensing

- Add `pdf_templates: Tier.Plus` to the `FEATURES` registry in `app/lib/licensing.ts`.
- **Enforced at render, not just in the UI:** `invoice-pdf.ts` / `quote-pdf.ts` set `template` to the stored key **only when** `licenseStore.hasFeature('pdf_templates')`; otherwise `'classic'`. So a Basic user (or a downgraded ex-Plus user) always gets Classic PDFs regardless of a stored non-classic setting — matching the "view-only on downgrade, data preserved" model (their choice stays in settings, just doesn't render until they re-upgrade).
- **Settings UI:** Basic users see the pickers with non-Classic options wearing a lock badge + a `FeatureLock` / `UpgradeButton` banner (existing pattern); they can still preview Classic.

---

## Settings UI + live preview

`app/pages/settings/pdf.vue` gains a **Templates** section (above or beside the existing Font / Header logo / Footer notes), with two pickers:

- **Invoice template** and **Quote template** — each a card/radio list of the 5 templates (label + one-line description + a small style hint). Selecting writes `settings.pdf_template_invoice` / `_quote`.
- Each picker has a **Preview** button → renders a **static sample** document with the *currently-selected* template via the existing `usePdfPreview` → `export_{invoice,quote}_pdf` → `PdfPreviewModal` flow.

**Sample payload:** a new `app/lib/sample-pdf.ts` `sampleInvoicePayload(settings, currency, templateKey)` / `sampleQuotePayload(...)` builds a realistic fake doc (a sample client, 3–4 line items, VAT, totals, a bank block) with no DB access — reuses the same payload shape the real builders emit, so the preview is faithful. The preview always uses the real Typst pipeline.

The sidebar's PDF sub-anchors (`#font`, `#header-logo`, `#footer-notes`) gain a `#templates` entry (same in-page anchor pattern already used on `/settings/pdf`).

---

## Files

- `src-tauri/templates/common.typ` (new), `doc-classic.typ` / `doc-modern.typ` / `doc-minimal.typ` / `doc-compact.typ` / `doc-letterhead.typ` (new); delete `document.typ`.
- `src-tauri/src/pdf.rs` — registry + `render_pdf` `extra_files` param + template selection in the quote/invoice commands.
- `src-tauri/migrations/0037_pdf_templates.sql` (new) + register in `tenants.rs` `MIGRATIONS` + bump `SCHEMA_VERSION` in `data_io.rs`.
- `app/lib/licensing.ts` — `pdf_templates: Tier.Plus`.
- `app/lib/invoice-pdf.ts` / `app/lib/quote-pdf.ts` — `template` field (entitlement-gated).
- `app/lib/sample-pdf.ts` (new) + `app/lib/sample-pdf.test.ts` — sample payload builders.
- `app/lib/pdf-templates.ts` (new) — the template registry for the UI (key, label, description) + a pure `resolveTemplateKey(stored, entitled)` helper (unit-tested).
- `app/stores/settings.ts` — surface the two new columns.
- `app/pages/settings/pdf.vue` — Templates section + pickers + preview.
- `app/components/default.vue` (sidebar) — `#templates` sub-anchor under PDF.

## Testing

- **Classic regression (the #1 risk):** generate a Classic invoice + quote before and after the `common.typ` refactor; confirm byte-for-byte-ish identical output (same layout, table, totals).
- **Unit (pure):** `resolveTemplateKey(stored, entitled)` (entitled → stored key; not entitled → always `classic`; unknown stored key → `classic`); `sample-pdf` builders produce a well-formed payload with the expected fields + the threaded template key.
- **Manual visual QA:** render each of the 5 templates for an invoice + a quote at realistic data (long item list for Compact; logo vs no-logo for Letterhead; theme-colour band for Modern; B&W print for Minimal). Confirm theme colour + font + logo + bank/sign-off toggles all still apply.
- Build gate: `bun run generate` (JS) + `bun run tauri:build:debug` only if touching Rust signatures is risky — but `cargo check` suffices for the `pdf.rs` change.

## Risks / call-outs

- **Classic must not regress** — mitigated by moving shared helpers verbatim + before/after compare.
- **Typst imports need `common.typ` in the work dir** — handled by `render_pdf`'s `extra_files`; a missing common.typ would fail every templated render, so it's caught immediately in QA.
- **Capability scope** — unaffected; Rust owns all typst args, the template key is data, not a filename.
- **Bundling — no `tauri.conf.json` change needed.** Templates are **`include_str!`'d into the binary at compile time** (only `fonts/*` is a bundled resource); `render_pdf` writes the embedded source into the per-render work dir. So a new template = a new `include_str!` const in `pdf.rs` + writing `common.typ` as an extra file. Nothing to add to `bundle.resources`.
- **`pdf_protect_*` flags** (owner-password) operate per-command, independent of template — no interaction.
