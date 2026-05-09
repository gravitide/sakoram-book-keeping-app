# Sakoram Bookkeeping — handoff notes

A single-user desktop bookkeeping app for a Sri Lankan business. Manages
quotes, invoices, bills, vouchers, and renders professional PDFs. Runs
fully offline with local SQLite. Multi-tenant: one SQLite file per
business.

If you're a fresh Claude session picking this up, read this whole file
before touching code. The conventions and invariants below are
load-bearing — there are landmines around money math, the connection
pool, multi-tenancy, and the Tauri capability layer.

---

## Tech stack (non-negotiable)

| Layer | Choice |
|---|---|
| Shell | **Tauri 2** (Rust) on Windows + macOS |
| Frontend | **Nuxt 4 SSG** (`ssr: false`, `nuxi generate`) |
| UI | **NuxtUI 4** (`@nuxt/ui` ^4.4) + **Tailwind v4** |
| Icons | **Lucide** via `@iconify-json/lucide`, bundled into the client (no runtime API fetches) |
| Fonts | **Inter**, **Inter Tight**, **Miriam Libre** — all bundled (UI via `@font-face`, PDF via Typst `--font-path`) |
| Lang | **TypeScript** strict |
| State | **Pinia** (composition stores) |
| Validation | **Zod** |
| Package manager | **bun** (only — `preinstall` script blocks npm/yarn/pnpm) |
| DB | **SQLite** via `tauri-plugin-sql` (sqlx 0.8 underneath) |
| PDFs | **Typst** sidecar binary (`src-tauri/binaries/typst-*.exe`) |
| Testing | **Vitest** |

`bun` is **mandatory** — `bun run`, `bun add`, etc. The user runs **bash
on Windows** (Git Bash) — give shell commands accordingly.

---

## Pre-1.0 status

**The app is pre-production.** No real users have data on this build.
That has two practical consequences:

- **Schema redesigns are fair game.** When a refactor wants different
  columns (e.g. swapping free-text vendor fields for a `vendor_id` FK
  + `vendor_snapshot` JSON), write a migration that *drops and
  recreates* the affected tables rather than ALTER-ing into a wonky
  intermediate state. Any data on dev machines is disposable.
- **No backfill / data-preservation migrations.** Don't bend over
  backwards to keep test data working — the user explicitly opted out.
  Once we ship 1.0 this rule flips and migrations must preserve data.

This applies to the `migrations/` directory and to `SCHEMA_VERSION` in
`data_io.rs`. Every breaking schema change still bumps SCHEMA_VERSION
so backups stay version-aligned.

## Golden rules

These are invariants, not guidelines. Breaking them silently corrupts
data.

1. **Money is integer cents (minor units). Never floats.** Always store
   and compute in cents. Use `formatMoney()` (or its backward-compat
   alias `formatLKR()`) and `toCents()` from `app/lib/money.ts`.
   Banker's (half-even) rounding. Only 100-minor-unit currencies are
   supported — JPY/KRW (no decimals) and Gulf 1000-mil currencies are
   deliberately out of scope.

2. **Quantities are `quantity_milli`** — qty × 1000 stored as INTEGER.
   Supports 3 decimal places. `formatQty()` for display.

3. **Tax rates are basis points** — 18% = 1800. INTEGER. `formatRate()`
   for display.

4. **Snapshot client info on issued documents**. `client_snapshot` is a
   JSON-serialised copy of the client at issue time. Do NOT join
   `clients` to render an old quote/invoice.

5. **Issued documents are immutable** (sent/accepted/etc.). Only
   `notes` stays editable post-issue. Never edit historical totals.

6. **Document numbering is atomic and gapless per (type, fiscal_year)**.
   Implemented as `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`
   in `app/lib/numbering.ts`. Do NOT replace this with read-then-write
   logic — see "Connection pool caveat" below.

7. **Status transitions live in the store, not free-form**. See
   `STATUS_TRANSITIONS` maps in each store. The DB also enforces via
   CHECK constraints. Keep them in sync.

8. **One currency per business**, picked in Company settings and stored
   on `company_settings.currency_code` as an ISO 4217 alpha code (LKR,
   USD, EUR, GBP, INR, AED, AUD, SGD — see `CURRENCIES` map in
   `app/lib/money.ts`). Symbol/locale derives from the code. No FX
   conversion, no per-document override. The settings store keeps the
   formatter cache in sync via `setActiveCurrency()` after every load.
   Fiscal year defaults to April→March (Sri Lanka government FY).

9. **Dates are ISO `YYYY-MM-DD` strings everywhere** — DB columns,
   Pinia state, PDF JSON payloads, function args. Conversion to
   `CalendarDate` is hidden inside `app/components/DateField.vue`.

---

## Connection pool caveat (READ THIS)

`tauri-plugin-sql` uses a **connection pool**. Implications:

- **You cannot run multi-statement transactions from JS.** A `BEGIN
  IMMEDIATE` on one pool connection followed by an `INSERT` on another
  yields `SQLITE_BUSY` ("database is locked").
- Every operation must be **a single SQL statement** to be atomic.
- Multi-step writes (e.g. "delete all line rows, then insert new ones")
  run as **sequential auto-commits**. Acceptable for this single-user
  app: a crash mid-write only loses unsaved edits, never issued
  documents (which are immutable).
- Cascading deletes (e.g. removing a draft) rely on `ON DELETE CASCADE`
  in the schema — not on JS orchestration.

If you need atomicity across multiple tables, write it as a single
`INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` or move the logic
into a Rust `#[tauri::command]`.

---

## Multi-tenancy model

Each business is a **separate SQLite file**. The Rust side runs
migrations per DB via sqlx directly (we deliberately do NOT use
`tauri-plugin-sql`'s `add_migrations` because it can't register URLs
added at runtime).

### File layout under `app_data_dir`

```
%APPDATA%\com.sakoram.billing\
  ├─ tenants.json              ← registry: { active_tenant_id, tenants: [{ id, name, logo_file }] }
  ├─ businesses\
  │   └─ {tenant_id}.db        ← one SQLite file per business
  ├─ logos\
  │   └─ {tenant_id}.{ext}     ← square identity logo (sidebar, tenant switcher, hero)
  └─ pdf-headers\
      └─ {tenant_id}.{ext}     ← optional wide letterhead logo printed on PDFs
```

`tenant.id` doubles as the **slug** and the **filename stem** for both
the DB and both logo variants. It's stable: renaming a tenant changes
`tenant.name` only — the slug, DB filename, and logo filenames stay
put so we don't have to move files around on rename.

Two logos by design: the sidebar / tenant switcher want a square mark,
while invoice headers look better with a wide letterhead-style image.
Only the identity logo (`logos/`) is mirrored into `tenants.json` as
`logo_file` because the welcome/sidebar UI reads that file directly
without going through the DB. The PDF header logo lives only on
`company_settings.pdf_header_logo_path`.

### Tenant lifecycle

- **App startup** — `app/middleware/tenant.global.ts` redirects every
  navigation to `/welcome` unless an active tenant is set.
- **Legacy migration** — first launch after the multi-tenancy upgrade,
  Rust auto-migrates the old single `sakoram.db` into the first tenant
  (`tenants::migrate_legacy_db`).
- **Switching** — `tenants.activate(id)` then **`window.location.assign("/")`** to hard-reload. This wipes every Pinia store's in-memory state cleanly. Don't try to manually `$reset()` everything — it's bug-prone.

### Bundle identifier

`com.sakoram.billing` is the Tauri bundle identifier. **Do not change
it** — it determines `app_data_dir`. Renaming would orphan all of the
user's existing tenants.

---

## Project layout

```
sakoram_app/
├─ CLAUDE.md                          ← this file
├─ package.json                       ← bun deps, scripts (dev, lint, test, tauri:build)
├─ nuxt.config.ts                     ← SSR off, head title, modules
├─ app/
│  ├─ layouts/
│  │  ├─ default.vue                  ← sidebar + main content (tenant switcher in header)
│  │  └─ welcome.vue                  ← minimal centered layout for /welcome
│  ├─ assets/
│  │  ├─ css/main.css                 ← Tailwind + @font-face for the 3 bundled fonts
│  │  └─ fonts/                       ← InterVariable, InterTight, MiriamLibre-{Regular,Bold}
│  ├─ pages/
│  │  ├─ index.vue                    ← Dashboard (KPI tiles + recent activity)
│  │  ├─ welcome.vue                  ← business picker (landing screen)
│  │  ├─ clients/                     ← list, new, [id]
│  │  ├─ vendors/                     ← list, new, [id] (mirrors clients)
│  │  ├─ categories/                  ← list page only — modal-driven CRUD for bill categories
│  │  ├─ quotes/                      ← list, new, [id] (PDF preview, convert to invoice)
│  │  ├─ invoices/                    ← list, new, [id] (PDF preview, payment ledger)
│  │  ├─ bills/                       ← list, new, [id] (vendor-FK + snapshot, no draft state)
│  │  ├─ vouchers/                    ← list, new, [id] (money in/out)
│  │  └─ settings/
│  │     ├─ index.vue                 ← redirect to /settings/company
│  │     ├─ company.vue               ← business info, address, bank, defaults, logo
│  │     ├─ appearance.vue            ← UI font + PDF font (independent), theme color (8-swatch)
│  │     └─ businesses.vue            ← tenant CRUD + Export/Import
│  ├─ components/
│  │  ├─ ClientPicker.vue             ← UPopover with search
│  │  ├─ VendorPicker.vue             ← clone of ClientPicker, used by bill creation
│  │  ├─ CategoryPicker.vue           ← bill-category dropdown w/ inline "+ New" modal
│  │  ├─ CategoryFormModal.vue        ← create/edit category (8-color × 16-icon picker)
│  │  ├─ SectionCard.vue              ← header-with-icon card; used on company / client / vendor edit pages
│  │  ├─ DateField.vue                ← UInputDate + UCalendar wrapper, ISO-string v-model
│  │  ├─ DateRangeField.vue           ← same idea, range mode (v-model:from / v-model:to)
│  │  ├─ DocumentLineEditor.vue       ← bundle/itemized line-item editor
│  │  ├─ ListPagination.vue           ← page-size selector + first/prev/next/last + range readout
│  │  ├─ SortableTh.vue               ← clickable header cell w/ 3-state arrow icon
│  │  ├─ MoneyInput.vue               ← integer-cents v-model
│  │  ├─ PdfPreviewModal.vue          ← embeds rendered PDF in <iframe>
│  │  ├─ StatusBadge.vue              ← color-coded status badges
│  │  ├─ MonthlyCashFlowChart.vue     ← dashboard: 12-month receipts vs payments (SVG, no chart lib)
│  │  ├─ ReceivablesAgingChart.vue    ← dashboard: outstanding invoices by days-past-due bucket
│  │  ├─ ExpensesByCategoryChart.vue  ← dashboard: bills donut by category, last 90 days
│  │  └─ TopClientsChart.vue          ← dashboard: top clients by invoiced revenue, last 12 months
│  ├─ composables/
│  │  ├─ usePdfPreview.ts             ← preview→commit flow used by quote/invoice/bill/voucher pages
│  │  └─ useListView.ts               ← sort + paginate any reactive array (returns reactive())
│  ├─ lib/
│  │  ├─ db.ts                        ← getDb() (lazy, reads active tenant URL), select/execute
│  │  ├─ demo-seed.ts                 ← createDemoBusiness() — curated + bulk-fill (~25/section)
│  │  ├─ money.ts                     ← toCents, formatLKR, computeLineTotals (integer math)
│  │  ├─ numbering.ts                 ← allocateDocumentNumber (single-statement atomic)
│  │  ├─ pdf.ts                       ← preview/commit/legacy export helpers
│  │  └─ theme.ts                     ← THEME_COLORS palette (name → hex)
│  ├─ middleware/
│  │  └─ tenant.global.ts             ← redirect to /welcome if no active tenant
│  ├─ plugins/
│  │  └─ window-title.client.ts       ← syncs Tauri window title with active tenant
│  └─ stores/                         ← Pinia composition stores
│     ├─ settings.ts                  ← company_settings (singleton, per-tenant)
│     ├─ clients.ts
│     ├─ vendors.ts                   ← address book for the bills side of the ledger
│     ├─ bill_categories.ts           ← managed lookup powering CategoryPicker
│     ├─ quotes.ts                    ← quotes + quote_lines, status FSM, pricing modes, date filters
│     ├─ invoices.ts                  ← invoices + invoice_lines. Payments live on vouchers; derivedStatus/paidCentsFor sum vouchers.related_invoice_id (no paid_cents column, no invoice_payments table).
│     ├─ bills.ts                     ← vendor_id FK + vendor_snapshot + category_snapshot. Payments live on vouchers; derivedStatus/paidCentsFor sum vouchers.related_bill_id.
│     ├─ vouchers.ts                  ← receipts/payments
│     └─ tenants.ts                   ← bridges JS to Rust tenant registry
└─ src-tauri/
   ├─ Cargo.toml                      ← Rust deps (tauri 2.10, sqlx 0.8, zip 2)
   ├─ tauri.conf.json                 ← productName, identifier, sidecars, capabilities
   ├─ capabilities/
   │  └─ main.json                    ← fs scopes, sql, dialog, shell-execute (typst arg validators)
   ├─ binaries/
   │  └─ typst-x86_64-pc-windows-msvc.exe   (gitignored, ~48 MB, target-triple naming required)
   ├─ fonts/                          ← same 3 fonts as app/assets/fonts (Typst reads from here)
   │  ├─ InterVariable.ttf
   │  ├─ InterTight.ttf
   │  └─ MiriamLibre-{Regular,Bold}.ttf
   ├─ migrations/
   │  ├─ 0001_initial.sql             ← settings, clients, document_counters
   │  ├─ 0002_documents.sql           ← quotes, invoices, invoice_payments (latter dropped in 0014)
   │  ├─ 0003_bills_vouchers.sql      ← bills, vouchers + their line tables (original schema)
   │  ├─ 0004_appearance.sql          ← ui_font, theme_color on company_settings
   │  ├─ 0005_default_font_google_sans.sql ← flips Miriam Libre default → Google Sans Flex
   │  ├─ 0006_pdf_font.sql            ← adds pdf_font column (separate from ui_font)
   │  ├─ 0007_vendors.sql             ← vendors table (mirrors clients shape)
   │  ├─ 0008_bills_use_vendors.sql   ← drop+recreate bills with vendor_id FK + vendor_snapshot
   │  ├─ 0009_bill_categories.sql     ← bill_categories lookup; bills get category_id FK + category_snapshot
   │  ├─ 0010_default_font_inter.sql  ← drop Google Sans Flex; default ui_font/pdf_font → Inter
   │  ├─ 0011_currency.sql             ← per-business currency_code on company_settings
   │  ├─ 0012_pdf_header_logo.sql      ← pdf_header_logo_path column (wide PDF letterhead)
   │  ├─ 0013_bills_payments_via_vouchers.sql ← drop bills.paid_cents; status collapses to open|cancelled. Payments derive from vouchers.related_bill_id.
   │  └─ 0014_invoices_payments_via_vouchers.sql ← drop invoices.paid_cents + invoice_payments table; status collapses to draft|sent|cancelled. Payments derive from vouchers.related_invoice_id.
   ├─ templates/
   │  ├─ document.typ                 ← unified Typst template for quotes/invoices/bills
   │  └─ voucher.typ                  ← simpler one-page receipt layout
   └─ src/
      ├─ lib.rs                       ← entry point, plugin registration, command handler list
      ├─ tenants.rs                   ← tenant registry, per-DB migration runner, legacy migration
      ├─ pdf.rs                       ← export_*_pdf commands, copy_file, open_path
      └─ data_io.rs                   ← export_tenant_data / import_tenant_data (.zip bundles)
```

---

## How data flows (worth tracing once)

**Creating a quote**:
1. User on `/quotes/new` picks a client → store calls
   `allocateDocumentNumber("quote", today_iso)` (one atomic SQL).
2. Quote row inserted, redirect to `/quotes/{id}`.
3. User edits items; `DocumentLineEditor` emits `LineDraft[]`.
4. On save: `replaceLines()` does DELETE + INSERTs (sequential
   auto-commits — see Connection pool caveat).
5. Marking sent: `setStatus("sent")` validates against
   `STATUS_TRANSITIONS` map and updates the DB. After this point the
   editor is mostly read-only.
6. PDF: `usePdfPreview` composable renders to a temp file under
   `app_local_data_dir/pdf-previews/`, shows in `PdfPreviewModal`,
   user clicks Save as → Rust `copy_file` to chosen path.

**PDF rendering**:
1. JS builds a JSON payload (`buildPdfPayload(lines)`) with
   pre-formatted strings.
2. Invokes `export_quote_pdf` (Rust). All four document types use
   `document.typ`; voucher uses `voucher.typ`.
3. Rust writes `data.json` + (optionally) `logo.{ext}` into a per-render
   work dir under `app_local_data_dir/pdf-work/`.
4. Spawns the typst sidecar:
   `typst compile --root <work_dir> --font-path <fonts_dir> <template> <output>`.
5. Sidecar arg validators in `capabilities/main.json` enforce shape.

---

## Setup, build, and dev commands

```bash
# First-time setup
bun install                              # bun is required (preinstall hook blocks others)

# Dev (Rust + Vite + Webview, hot reload)
bun run tauri:dev                        # background process; closes the window → exits

# Frontend-only
bun run dev                              # nuxt dev (no Tauri shell)

# Quality gates
bun run lint                             # eslint --fix
bun run test                             # vitest run

# Production build
bun run tauri:build                      # outputs MSI + NSIS installers under
                                         # src-tauri/target/release/bundle/
bun run tauri:build:debug                # faster, with debug symbols
```

After `tauri:build` finishes you'll find:

```
src-tauri/target/release/bundle/
  ├─ msi/Sakoram Bookkeeping_0.9.0_x64_en-US.msi
  └─ nsis/Sakoram Bookkeeping_0.9.0_x64-setup.exe
```

The build is **unsigned** — Windows SmartScreen will warn on first run.
Code-signing requires a CA cert (~$200–400/year), out of scope.

### Common gotchas

- **`.nuxt` directory missing or stale**: `rm -rf .nuxt && bunx nuxi prepare`.
- **Tauri capability changes** require a Rust rebuild (capabilities are
  baked in at compile time).
- **Tauri/JS plugin version mismatch** errors on `tauri:build`: the
  Rust crate and JS package must match on **major.minor**. If `tauri`
  bumps, `@tauri-apps/api` must follow.
- **Background dev server exit code 255** = user closed the window. Not
  an error.

---

## Key architectural decisions and why

### Why DB-per-business (not `business_id` columns)

Single-user app. Switching is a deliberate context change. DB-per-file:
- Zero changes to existing query code (no `WHERE business_id = ?`
  everywhere).
- Document number sequences naturally isolated.
- Backups are file-level (export = copy the SQLite + assets to a zip).
- Migrations apply per-DB cleanly.

### Why hard-reload on tenant switch

`window.location.assign("/")` wipes every Pinia store's in-memory state.
Manually `$reset`-ing each store is bug-prone (forget one, and stale
data leaks across tenants). The reload takes ~200ms in a webview —
imperceptible.

### Why we run our own migrations (not plugin-sql's)

`tauri-plugin-sql`'s `add_migrations(url, ...)` registers migrations at
build time keyed by URL. New tenants created at runtime get URLs the
plugin doesn't know about. We use sqlx directly in
`tenants::run_migrations()`, matching plugin-sql's `_sqlx_migrations`
table format so legacy DBs still work.

### Why the `--font-sans` CSS variable trick

NuxtUI / Tailwind v4 preflight sets `body { font-family: var(--font-sans) }`.
Setting `font-family` on `<html>` doesn't reach `<body>` (specificity).
Overriding `--font-sans` at `:root` cascades through the variable into
every element — including teleported overlays (popovers, modals,
calendar). See `app/layouts/default.vue` and `app/pages/settings/appearance.vue`.

### Why the PDF preview re-renders to a temp file

We render once to `app_local_data_dir/pdf-previews/{slug}.pdf` and embed
it in an `<iframe>` via `convertFileSrc()` (asset protocol). Save-as
copies the temp via the Rust `copy_file` command — zero re-render on
save. The asset URL is cache-busted with `?t={ms}` so re-previewing
the same doc after edits forces a re-fetch.

### Why `DateField.vue` exists

`UInputDate` + `UCalendar` v-model on `CalendarDate` from
`@internationalized/date`. The whole codebase stores dates as ISO
strings (DB, store types, PDF payloads). `DateField` wraps both
components and converts ISO ↔ `CalendarDate` in one place — every
caller stays string-based.

### Why `tenants.json` instead of a tenants DB

The registry is small (~10 entries max in practice). JSON avoids:
- a separate migration system for the registry itself
- a chicken-and-egg "which DB do we open to read the tenants?" problem

### Why bundle the Typst binary instead of generating PDFs in JS

Deterministic typography across machines, far higher quality than
`window.print()`, font-path control, native PDF output. ~48 MB sidecar
is acceptable for a desktop app.

### Why bundle fonts (and which ones)

The app must work offline and look the same on every machine. Naming
a font in CSS that isn't installed locally silently falls back to
system-ui — defeats the point of having a chosen font. Same hazard
for Typst's font-path lookup.

Three fonts ship in two places:

| Font | License | Notes |
|---|---|---|
| Inter | OFL | Variable, ~880 KB. **Default** for both UI and PDF. |
| Inter Tight | OFL | Variable, ~570 KB. Tighter sibling of Inter — useful when titles or invoice headers feel airy. |
| Miriam Libre | OFL | Static Regular + Bold, ~600 KB combined. Original default; kept around as a third bundled choice. |

`app/assets/fonts/*.ttf` — referenced from `app/assets/css/main.css`
via `@font-face`, hashed and emitted by Vite into `_nuxt/`.
`src-tauri/fonts/*.ttf` — picked up by Typst via `--font-path` (set
in `pdf.rs`), bundled into the installer via `tauri.conf.json`'s
`bundle.resources` list.

UI font and PDF font are independent (`company_settings.ui_font` and
`company_settings.pdf_font`). The Typst template reads
`data.font_family` from the per-render JSON payload, then falls back
through the three bundled families for any missing glyph.

### Why icons are bundled (not fetched at runtime)

NuxtUI / `@nuxt/icon` defaults to fetching SVGs from the Iconify API.
We're a desktop app expected to work offline — that fails. Fix:
`@iconify-json/lucide` as a dev dep + `icon.clientBundle.scan: true`
in `nuxt.config.ts`. Vite scans templates and inlines only the icons
actually used (~50 icons, ~14 KB). Zero runtime network dependency.

---

## Schema overview

See `src-tauri/migrations/` for the source of truth. High-level:

- `company_settings` — singleton (`id=1` CHECK), per-tenant. Includes
  `ui_font`, `pdf_font` (independent picks), and `theme_color`.
- `clients` — id, name, contact info, archived flag.
- `vendors` — same shape as `clients`. Address book for the bills side
  of the ledger.
- `bill_categories` — small managed lookup (`name` UNIQUE, `color`
  swatch name, `icon` Lucide name, archived flag). Powers
  `CategoryPicker` on the bill page.
- `document_counters` — `(document_type, fiscal_year)` → `last_number`,
  for atomic gapless allocation.
- `quotes` + `quote_lines` — `pricing_mode` ∈ {bundle, itemized},
  `status` FSM, `client_snapshot` (JSON), `bank_details_snapshot`
  (JSON, frozen at issue), `converted_invoice_id` link.
- `invoices` + `invoice_lines` — clients we've billed. **No
  `paid_cents` column** — removed in migration 0014. **No
  `invoice_payments` table** — also dropped in 0014. Payments live on
  the voucher ledger; `vouchers.related_invoice_id` links each
  receipt voucher back to its invoice. The persisted `status` only
  stores the user's explicit decision (`draft` | `sent` | `cancelled`);
  the user-visible draft / sent / partial / paid / overdue state is
  **derived** in JS from the sum of linked receipt vouchers +
  `total_cents` + today vs `due_date`. See `app/stores/invoices.ts`:
  `derivedStatus()`, `paidCentsFor()`, `linkedPayments()`. Same
  pattern as bills — see migration 0013 for the bills equivalent.
- `bills` + `bill_lines` — vendor bills. `vendor_id` FK → `vendors`
  with a `vendor_snapshot` JSON copy frozen at creation time;
  `category_id` FK → `bill_categories` with a `category_snapshot` JSON
  copy ({name, color, icon}) so renames/recolors don't rewrite history
  (mirrors `client_snapshot` on quotes/invoices). **No `paid_cents`
  column** — removed in migration 0013. Payments live on the voucher
  ledger; `vouchers.related_bill_id` links each payment voucher
  back to its bill. The persisted `status` only stores the user's
  explicit decision (`open` | `cancelled`); the user-visible
  unpaid / partial / paid / overdue state is **derived** in JS from
  the sum of linked payment vouchers + `total_cents` + today vs
  `due_date`. See `app/stores/bills.ts`: `derivedStatus()`,
  `paidCentsFor()`, `linkedPayments()`.
- `vouchers` — money in (receipt) / money out (payment). Standalone or
  optionally linked to an invoice (`related_invoice_id`) or bill
  (`related_bill_id`). For both invoices and bills, a voucher with
  the matching link is the **only** way money flow against the
  document is recorded — the document's "paid" / "balance" /
  status all derive from these voucher rows.

`PRAGMA table_info(...)` is used in `data_io.rs` to discover columns
dynamically — adding a column to a migration auto-flows into export.

---

## Status state machines

Each store has a `STATUS_TRANSITIONS` map and a `canTransition()`
predicate. The UI offers only legal transitions in dropdowns; the DB
also enforces via CHECK constraints. **If you add a state, update both
sides.**

```
quotes:    draft → sent → accepted → converted (terminal)
                       ↘ rejected | expired (terminal)
                draft → rejected (cancel)

invoices:  persisted: draft ↔ sent ↔ cancelled (the only user transitions)
           derived:   draft           → draft
                      sent + payments → partial | paid
                      sent + due < today + balance > 0 → overdue
                      cancelled is sticky
           ("Record payment" creates a receipt voucher with
            related_invoice_id; the partial/paid/overdue states fall
            out of that.)

bills:     persisted: open ↔ cancelled (the only user transitions)
           derived:   open + payments → unpaid | partial | paid
                      open + due_date < today + balance > 0 → overdue
                      cancelled is sticky
           (no draft — bills come from outside; "Record payment"
            now creates a voucher with related_bill_id)

vouchers:  no transitions; voucher_type (receipt/payment) is locked at create
```

---

## List view conventions

Every list page (clients, vendors, bill categories, quotes, invoices,
bills, vouchers) follows the same shape so the UX stays consistent and
each page stays small:

1. **Store** owns the data and `filtered` computed (search / status /
   date filters live here as refs the page binds to in the header).
2. **Page** instantiates `useListView(() => store.filtered, columns,
   { defaultSortKey, defaultDir })` and iterates `list.paged` instead
   of `store.filtered`.
3. **Headers** use `<SortableTh>` per column, passing `:active`,
   `:dir`, and `@sort` wired to `list.toggleSort('key')`.
4. **Footer** is `<ListPagination v-model:page="list.page"
   v-model:page-size="list.pageSize" :total :total-pages :range-start
   :range-end />`.

`useListView` returns a `reactive()` object so consumers do
`list.sortKey` / `list.page = 2` (no `.value` noise) and templates
auto-unwrap. It snaps page back into range when filters shrink the
list, and resets to page 1 on sort change. Default page size is 10
(options: 10 / 25 / 50 / 100).

**Sort defaults that match user expectations:**
- Documents (quotes / invoices / bills): `issue_date` desc — newest first.
- Vouchers: `voucher_date` desc.
- Clients / vendors / categories: `name` asc.

**Snapshot-derived columns** (e.g. client name on a quote, vendor /
category name on a bill) sort by re-parsing the snapshot in `getValue`
so the sort matches the visible cell, not the row's underlying FK or
JSON blob.

**Frontend-only by design.** Sort, filter, and pagination all happen on
the in-memory `filtered` array — the DB only sees the initial
`SELECT * FROM …`. Acceptable for a single-user desktop app at
realistic per-business volumes (low thousands of rows). If a real
tenant ever crosses ~10k in a single table, the migration is:
- replace `store.load()` with `fetchPage(offset, limit, sort, dir, filters)`
- swap `useListView`'s in-memory `paged` for "ask the store for this page"
Don't pre-optimize — wait for actual slowness.

**Helpers used in column getValues need to hoist.** If a page declares
`function clientName(...)` as a `const` arrow it lands in the
temporal-dead-zone when `useListView`'s column descriptors close over
it. Convert those to `function` declarations (which hoist) or move
them above the `useListView` call.

---

## Capabilities (Tauri permissions)

Edit `src-tauri/capabilities/main.json`. Hot reload doesn't catch this
— restart `tauri:dev`.

Notable allowances:
- `fs:allow-{read,write}-file` scoped to `$APPDATA/**`,
  `$APPLOCALDATA/**`, plus user-document/download/desktop dirs.
- `shell:allow-execute` for the `binaries/typst` sidecar with
  arg validators ensuring `.typ` and `.pdf` extensions.
- `core:window:allow-set-title` for the dynamic window title plugin.
- `dialog:allow-{open,save}` for file pickers.
- **`shell:allow-open` does NOT support raw file paths** — its scope
  validator hard-codes URL schemes. We bypass it with our own
  `open_path` Rust command (`pdf.rs`).

---

## What's done / what's not

### Done

- ✅ DB schema, migrations, foundations (14 migrations, SCHEMA_VERSION 14)
- ✅ Clients CRUD (hero + SectionCard layout, mirrors Settings → Company)
- ✅ Vendors CRUD (mirrors clients)
- ✅ Quotes (full lifecycle, PDF, convert-to-invoice; default VAT seeded
  from settings on draft creation)
- ✅ Invoices (lifecycle, PDF; payments via receipt vouchers, status
  derived from voucher sums + due date — no paid_cents column or
  invoice_payments table; default VAT seeded from settings on draft)
- ✅ Bills with vendor FK + snapshot + category FK + snapshot. Payments
  via payment vouchers, status derived from voucher sums + due date
  (no paid_cents column).
- ✅ Vouchers (money in/out, PDF, big amount card layout). "Record
  payment" on a bill or invoice routes to /vouchers/new?bill=N or
  ?invoice=N with the voucher form prefilled, and bounces back to
  the document on save.
- ✅ Universal delete on quotes/invoices/bills (typed-name confirm gate
  for issued docs / docs with payments). Linked vouchers stay intact
  on delete; their related_*_id is nulled out so the cash flow
  history isn't lost.
- ✅ Dashboard (KPI tiles, monthly cash-flow chart, receivables aging,
  expenses by category donut, top clients horizontal bars, recent
  activity, overdue list, quick actions). All charts hand-rolled SVG
  — no Chart.js / D3 — and theme-aware via CSS variables.
- ✅ PDF generation via bundled Typst sidecar (3 bundled fonts, theme
  color from settings, user-chosen `pdf_font`)
- ✅ PDF preview modal (iframe-embedded, save-as via temp file copy)
- ✅ Settings split: `/settings/company`, `/settings/appearance`,
  `/settings/businesses`
- ✅ Appearance: independent UI/PDF font pickers (3 bundled +
  free-text), 8-color theme palette (drives UI and PDFs)
- ✅ Bundled fonts (Inter / Inter Tight / Miriam Libre) — UI
  via `@font-face`, PDF via Typst `--font-path`
- ✅ Bundled icons (Lucide via `@iconify-json/lucide` +
  `icon.clientBundle.scan`) — zero runtime network dependency
- ✅ DateField (single date) and DateRangeField (range, v-model:from/to)
  — both ISO-string adapters over `UInputDate`. DateRangeField bumps a
  `:key` when both refs go null because UInputDate range mode doesn't
  visually reset on a `{start: null, end: null}` prop change.
- ✅ Multi-tenancy (DB-per-business, welcome screen, tenant switcher)
- ✅ Export/Import (.zip bundles with manifest, schema-version gate)
- ✅ Window title syncs with active tenant
- ✅ Sidebar grouped (Dashboard / documents / Lists / Settings) with
  thin separators between groups. "Lists" houses Clients, Vendors,
  and Bill categories.
- ✅ Bill categories — managed lookup with name + color (8 swatches)
  + icon (16 Lucide options). `CategoryPicker` on the bill detail
  page has an inline "+ New" modal so the user stays on the bill
  while creating one. Bills carry a frozen `category_snapshot` so
  renames/recolors don't rewrite history (same pattern as
  client/vendor snapshots).
- ✅ Unified filter strip across every list page (quotes / invoices /
  bills / vouchers): two-row layout with a search input + FK pickers
  (USelectMenu, searchable for clients/vendors/categories) + status
  enum (USelect) on row 1, compact inline date-range fields on row
  2, and a single "Reset filters" pill that surfaces whenever any
  filter is active. All filters live as refs on the relevant store's
  `filtered` computed.
- ✅ Default bill categories (Utilities, Supplies, Fees, Rent,
  Salaries, Marketing, Software, Travel, Insurance) seeded into
  every fresh tenant by the Rust `create_tenant` flow — no longer a
  demo-only thing.
- ✅ Welcome screen redesigned with the Sakoram wordmark and two
  side-by-side cards on first run ("Create your business" /
  "Try a demo business"). Multi-tenant case still uses the compact
  list + "Add another business" affordance.
- ✅ Allow deleting the active / last business — clears
  active_tenant_id, closes the open DB pool first to release the
  Windows file lock, hard-reloads to /welcome.
- ✅ Main content cap widened from `max-w-7xl` (1280px) to
  `max-w-[96rem]` (1536px) in `app/layouts/default.vue` to give
  data-heavy list pages more room. Narrow forms (Settings →
  Appearance / PDF, both voucher pages) are explicitly
  `max-w-2xl mx-auto` so they centre under the wider cap.
- ✅ Pagination + click-to-sort columns on every list page via
  `useListView` composable + `<SortableTh>` + `<ListPagination>`.
  Default 10 per page, options 10/25/50/100. Frontend-only — store
  loads all rows once, composable does sort + slice in memory.
  Documents the migration path to DB-side pagination if a tenant
  ever crosses ~10k rows in one table (see "List view conventions"
  below).
- ✅ Demo seed bulk-fills ~22 extra rows of each entity so list
  pages, filters, and pagination have realistic volume from the
  first launch.
- ✅ Line-ending normalization — `.gitattributes` pins text files to
  LF in the repo regardless of OS. Without this, Windows checkouts
  with `core.autocrlf=true` keep showing files as "modified" with
  no real diff.
- ✅ Production build pipeline (MSI + NSIS installers via
  `bun run tauri:build`)
- ✅ CI release workflow (`.github/workflows/release.yml`) building
  Windows installers per version tag

### Deferred / open items

- **Native-feel polish pass** — the app still feels webby in places.
  Top three: (1) `user-select: none` on UI chrome (sidebar, headers,
  buttons), keep selection on data; (2) custom thin scrollbars via
  `::-webkit-scrollbar`; (3) disable the production webview
  context-menu. After that: a Cmd/Ctrl+K command palette would be
  the single biggest "feels native" win.
- **Bill/voucher attachment upload UI** — `attachment_path` columns
  exist on the schema; no UI yet. Intent: drop a PDF/image of the
  vendor's bill onto the bill page → stored in app data → openable
  from the detail page.
- **DB-side pagination** — see "List view conventions" below. Today
  every list loads all rows; sort/filter/page is in-memory. Acceptable
  up to a few thousand rows per table; revisit if a real tenant feels
  slow.
- **Per-document custom title** (e.g. "DEVELOPMENT QUOTE" instead of
  the generic "QUOTATION") — currently `data.title` is hardcoded per
  doc type in the Pdf payload builders.
- **Drag-drop reorder for line items** — currently up/down arrow
  buttons in `DocumentLineEditor`.
- **Localised dates in list pages** — list tables show raw
  `2026-05-05` strings. Could use `Intl.DateTimeFormat`.
- **Soften schema-version gate on import** — currently refuses if
  bundle's `schema_version != current`. Future: per-version restore
  adapters that upgrade older bundles into the current schema.
- **Code-signing the installers** — currently unsigned, SmartScreen
  warns on first run.

---

## Known landmines

- **Don't `await` Pinia state assignments inside the store's setup** —
  the store hasn't returned yet, so dependent stores see undefined.
  Use `onMounted` or method calls.
- **Don't add `BEGIN`/`COMMIT` from JS.** See "Connection pool caveat".
- **Don't change `com.sakoram.billing` bundle identifier** — orphans
  user data.
- **Don't rename `_sqlx_migrations`** — would fail to detect already-
  applied migrations on legacy DBs.
- **Don't `Database.load()` a tenant URL before
  `ensure_tenant_db(id)`** — migrations need to run first.
- **Don't hand-build Windows paths with `${a}\\${b}`** for fs commands.
  Tauri's scope matcher is picky. Use `join()` from
  `@tauri-apps/api/path`.
- **Don't put `font-family` on a layout `<div>`** — overlays teleport
  to `<body>` and miss it. Set `--font-sans` on `:root` instead.
- **A new migration file isn't enough** — the SQL is `include_str!`'d
  into the `MIGRATIONS` array in `src-tauri/src/tenants.rs`. Drop a new
  `0009_*.sql` into `migrations/` and forget to add it to that array
  and the migration silently never runs (queries against the new
  tables explode at first call). Bump `SCHEMA_VERSION` in
  `src-tauri/src/data_io.rs` too — and if the migration adds a table
  the user will want exported, append it to the `TABLES` list in the
  same file.
- **Don't expose new Tauri commands without registering them** in
  `src-tauri/src/lib.rs` `invoke_handler!`. The error message ("command X
  not allowed") looks like a permissions issue but is just a missing
  registration.
- **The `bun run dev` script** runs Nuxt only — no Tauri shell, so
  Tauri-specific APIs (fs, dialog, invoke) will fail. Always use
  `tauri:dev` for full app testing.

---

## When in doubt

- Check the comment block at the top of any source file — they explain
  the *why* of decisions that aren't obvious from the code.
- For DB queries, mirror what existing stores do (`select`, `selectOne`,
  `execute` from `app/lib/db.ts`).
- For new Tauri commands, follow the pattern in `src/pdf.rs` —
  `#[tauri::command]`, `Result<T, String>`, register in `lib.rs`.
- For new stores, follow the pattern of `app/stores/clients.ts` —
  composition-API setup store, ref-based reactive state, async methods.
- For lint conformance, the project uses tabs and a fairly strict
  eslint config. `bun run lint` auto-fixes most issues.

---

## Conventions for AI-authored code

The user's `~/.claude/CLAUDE.md` says:
- Use **bash on Windows 11** (Git Bash). Frame shell commands accordingly.
- **Don't add Claude Code footer** to git commit messages.
- Never push directly to `main` — always branch and open a PR.

The project itself doesn't enforce a commit-message format — match the
existing `git log` style if making commits.

**Branch workflow — every new piece of work follows this.** No
exceptions, even for one-line fixes:

1. **Sync main first.** `git checkout main && git fetch origin && git pull --ff-only`. If the pull refuses because of leftover edits from a prior merged PR (typical after `gh pr merge --squash`), stash or `git checkout --` the offending file and pull again.
2. **Branch from main.** `git checkout -b <type>/<short-slug>` (e.g. `feat/quote-date-filters`, `fix/save-button-disabled`, `chore/gitignore-tsbuildinfo`).
3. Do the work, lint, commit. Bump the version (rules above).
4. `git push -u origin <branch>` then `gh pr create …`.
5. After review, `gh pr merge <num> --squash --delete-branch`.
6. Back to step 1 for the next task — pull main again before branching.

Never start work directly on `main`, never branch off another feature
branch, and don't reuse a branch after its PR was merged (the squash
commit on remote has different content than the local branch tip).

**Bump the version on every PR.** Pre-1.0, use a minor bump (`0.X.0`)
for new features and a patch bump (`0.X.Y`) for fixes / chores. Three
files must stay in sync:

- `package.json` → `version`
- `src-tauri/Cargo.toml` → `[package].version`
- `src-tauri/tauri.conf.json` → `version`

`src-tauri/Cargo.lock` picks up the new version automatically the next
time cargo runs (rust-analyzer in the editor usually does it for you);
commit it alongside the other three.
