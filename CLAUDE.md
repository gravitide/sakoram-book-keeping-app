# Sakoram Bookkeeping — handoff notes

A single-user desktop bookkeeping app for a Sri Lankan business. Manages
quotes, invoices, bills, vouchers, employees, payslips, and renders
professional PDFs. Runs fully offline with local SQLite. Multi-tenant:
one SQLite file per business.

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
| Fonts | **Inter**, **Inter Tight**, **Stack Sans Text**, **Miriam Libre**, **Amarna** — all bundled (UI via `@font-face`, PDF via Typst `--font-path`) |
| Lang | **TypeScript** strict |
| State | **Pinia** (composition stores) |
| Validation | **Zod** |
| Package manager | **bun** (only — `preinstall` script blocks npm/yarn/pnpm) |
| DB | **SQLite** via `tauri-plugin-sql` (sqlx 0.8 underneath) |
| PDFs | **Typst** sidecar binary (`src-tauri/binaries/typst-*.exe`) |
| Window chrome | Custom — `decorations: false` in tauri.conf.json + `app/components/TitleBar.vue` |
| Testing | **Vitest** |

`bun` is **mandatory** — `bun run`, `bun add`, etc. The user runs **bash
on Windows** (Git Bash) — give shell commands accordingly.

The product is named **Sakoram Bookkeeping** (one word). Don't slip back
to "Book Keeping" — Tauri's `productName`, the README, the About modal,
window titles, and a dozen other strings are all kept in sync.

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

4. **Snapshot party info on issued documents**. `client_snapshot` /
   `vendor_snapshot` / `employee_snapshot` is a JSON-serialised copy
   of the party at issue time. Do NOT join `clients` / `vendors` /
   `employees` to render an old quote / invoice / bill / payslip.

5. **Issued documents are immutable** (sent / accepted / etc.). Only
   `notes` stays editable post-issue. Never edit historical totals.
   Payslips follow the same rule — see `app/pages/payslips/[id].vue`'s
   locked-form path.

6. **Document numbering is atomic and gapless per (type, fiscal_year)**.
   Implemented as `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`
   in `app/lib/numbering.ts`. Do NOT replace this with read-then-write
   logic — see "Connection pool caveat" below. The `DocumentType`
   union covers `quote | invoice | bill | voucher | payslip`.

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
   `CalendarDate` is hidden inside `app/components/DateField.vue`
   (which now also accepts optional `min-value` / `max-value` ISO
   strings — used to constrain the period / pay-date pickers on
   payslips and the voucher date when recording a salary payment).

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
│  │  ├─ default.vue                  ← TitleBar + floating sidebar + main content
│  │  └─ welcome.vue                  ← TitleBar + minimal centered content
│  ├─ assets/
│  │  ├─ css/main.css                 ← Tailwind + @font-face for the 5 bundled fonts; chrome user-select rules; thin scrollbars
│  │  ├─ fonts/                       ← Inter, InterTight, StackSansText, MiriamLibre, Amarna (all variable .ttf)
│  │  ├─ sakoram-icon.svg             ← square mark used in the titlebar
│  │  └─ sakoram-wordmark.svg         ← wide wordmark used in the welcome screen + About modal
│  ├─ pages/
│  │  ├─ index.vue                    ← Dashboard (KPI tiles + 4 charts + recent activity)
│  │  ├─ welcome.vue                  ← business picker (landing screen)
│  │  ├─ clients/                     ← list, [id]
│  │  ├─ vendors/                     ← list, [id] (mirrors clients)
│  │  ├─ employees/                   ← list, [id] (mirrors vendors + payroll fields)
│  │  ├─ categories/                  ← list page only — modal-driven CRUD for bill categories
│  │  ├─ quotes/                      ← list, new, [id] (PDF preview, convert to invoice)
│  │  ├─ invoices/                    ← list, new, [id] (PDF preview, payment ledger)
│  │  ├─ bills/                       ← list, new, [id] (vendor-FK + snapshot)
│  │  ├─ vouchers/                    ← list, new, [id] (money in/out; read-only by default → click Edit to mutate)
│  │  ├─ payslips/                    ← list, new, [id], bulk
│  │  └─ settings/
│  │     ├─ index.vue                 ← redirect to /settings/company
│  │     ├─ company.vue               ← business info, address, bank, defaults, logo
│  │     ├─ pdf.vue                   ← PDF font + PDF header logo
│  │     ├─ appearance.vue            ← UI font, theme color (8-swatch), zoom (6 discrete steps)
│  │     └─ businesses.vue            ← tenant CRUD + Export/Import
│  ├─ components/
│  │  ├─ TitleBar.vue                 ← custom titlebar (sidebar toggle + drag region + min/max/close); pixel-pinned sizing so zoom doesn't scale it
│  │  ├─ ClientPicker.vue             ← UPopover with search
│  │  ├─ VendorPicker.vue             ← clone of ClientPicker, used by bill creation
│  │  ├─ EmployeePicker.vue           ← clone of VendorPicker, used by payslip creation
│  │  ├─ CategoryPicker.vue           ← bill-category dropdown w/ inline "+ New" modal
│  │  ├─ CategoryFormModal.vue        ← create/edit category (8-color × 16-icon picker)
│  │  ├─ SectionCard.vue              ← header-with-icon card; used on company / client / vendor / employee edit pages
│  │  ├─ DateField.vue                ← UInputDate + UCalendar wrapper; ISO-string v-model + optional min/max
│  │  ├─ DateRangeField.vue           ← same idea, range mode (v-model:from / v-model:to)
│  │  ├─ DocumentLineEditor.vue       ← bundle/itemized line-item editor for quotes/invoices/bills
│  │  ├─ PayslipLineEditor.vue        ← two-section earnings/deductions editor with live subtotals + net
│  │  ├─ ListPagination.vue           ← page-size selector + first/prev/next/last + range readout
│  │  ├─ SortableTh.vue               ← clickable header cell w/ 3-state arrow icon
│  │  ├─ MoneyInput.vue               ← integer-cents v-model
│  │  ├─ PdfPreviewModal.vue          ← embeds rendered PDF in <iframe>
│  │  ├─ StatusBadge.vue              ← color-coded status badges
│  │  ├─ MonthlyCashFlowChart.vue     ← dashboard: 12-month receipts vs payments
│  │  ├─ ReceivablesAgingChart.vue    ← dashboard: outstanding invoices by days-past-due bucket
│  │  ├─ ExpensesByCategoryChart.vue  ← dashboard: bills donut by category, last 90 days
│  │  └─ TopClientsChart.vue          ← dashboard: top clients by invoiced revenue, last 12 months
│  ├─ composables/
│  │  ├─ usePdfPreview.ts             ← preview→commit flow used by every detail page that has a PDF button
│  │  ├─ useListView.ts               ← sort + paginate any reactive array (returns reactive())
│  │  ├─ useUiState.ts                ← localStorage-backed UI prefs: sidebarCollapsed, zoomLevel
│  │  ├─ useWindowState.ts            ← reactive isMaximized; subscribes to Tauri onResized
│  │  └─ useActiveCurrency.ts         ← live ref of the active business's currency meta
│  ├─ lib/
│  │  ├─ db.ts                        ← getDb() (lazy, reads active tenant URL), select/execute
│  │  ├─ demo-seed.ts                 ← createDemoBusiness() — curated + bulk-fill (~25/section)
│  │  ├─ money.ts                     ← toCents, formatMoney/formatLKR, computeLineTotals (integer math)
│  │  ├─ numbering.ts                 ← allocateDocumentNumber (single-statement atomic)
│  │  ├─ pdf.ts                       ← preview/commit/legacy export helpers; PdfCommand union
│  │  ├─ payslip-pdf.ts               ← shared payload builder used by both payslip detail page and list-row Generate-PDF action
│  │  └─ theme.ts                     ← THEME_COLORS palette (name → hex)
│  ├─ middleware/
│  │  └─ tenant.global.ts             ← redirect to /welcome if no active tenant
│  ├─ plugins/
│  │  ├─ window-title.client.ts       ← syncs Tauri window title with active tenant
│  │  ├─ disable-context-menu.client.ts ← suppresses webview right-click on chrome (skips inputs / Shift bypass)
│  │  └─ apply-zoom.client.ts         ← writes the user's zoomLevel onto the root <html> font-size
│  └─ stores/                         ← Pinia composition stores
│     ├─ settings.ts                  ← company_settings (singleton, per-tenant)
│     ├─ clients.ts
│     ├─ vendors.ts
│     ├─ employees.ts                 ← payroll address book
│     ├─ bill_categories.ts           ← managed lookup powering CategoryPicker
│     ├─ quotes.ts                    ← quotes + quote_lines, status FSM, pricing modes, date filters
│     ├─ invoices.ts                  ← invoices + invoice_lines. Payments live on vouchers; derivedStatus/paidCentsFor sum vouchers.related_invoice_id.
│     ├─ bills.ts                     ← vendor_id FK + vendor_snapshot + category_snapshot. Payments via vouchers.related_bill_id.
│     ├─ payslips.ts                  ← payslips + payslip_lines, status FSM, derivedStatus/paidCentsFor sum vouchers.related_payslip_id.
│     ├─ vouchers.ts                  ← receipts/payments; carries related_invoice_id, related_bill_id, related_payslip_id
│     └─ tenants.ts                   ← bridges JS to Rust tenant registry
└─ src-tauri/
   ├─ Cargo.toml                      ← Rust deps (tauri 2.10, sqlx 0.8, zip 2)
   ├─ tauri.conf.json                 ← productName, identifier, sidecars, capabilities, decorations: false
   ├─ capabilities/
   │  └─ main.json                    ← fs scopes, sql, dialog, window controls, shell-execute (typst arg validators)
   ├─ binaries/
   │  └─ typst-x86_64-pc-windows-msvc.exe   (gitignored, ~48 MB, target-triple naming required)
   ├─ fonts/                          ← same 5 fonts as app/assets/fonts (Typst reads from here)
   │  ├─ InterVariable.ttf
   │  ├─ InterTight.ttf
   │  ├─ StackSansText.ttf
   │  ├─ MiriamLibre.ttf              (variable; replaced earlier static Regular/Bold pair)
   │  └─ Amarna.ttf
   ├─ migrations/                     ← see "Migrations" section below
   ├─ templates/
   │  ├─ document.typ                 ← unified Typst template for quotes/invoices/bills
   │  ├─ voucher.typ                  ← simpler one-page receipt layout
   │  └─ payslip.typ                  ← employee block + side-by-side earnings/deductions + net pay card
   └─ src/
      ├─ lib.rs                       ← entry point, plugin registration, command handler list
      ├─ tenants.rs                   ← tenant registry, per-DB migration runner, legacy migration
      ├─ pdf.rs                       ← export_*_pdf commands (quote/invoice/bill/voucher/payslip), copy_file, open_path
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

**Creating a payslip** (mirrors the quote flow):
1. `/payslips/new` — pick employee, period (auto-snaps to month
   bounds), pay date (clamped to `[period_start, period_end]`).
2. Store allocates `PSL-YYYY-NNN`, snapshots the employee, seeds a
   single "Basic" earning equal to `employee.basic_salary_cents`.
3. `/payslips/[id]` shows the editor — user adds allowances / deductions
   in `PayslipLineEditor`.
4. **Mark issued** locks the form (only `notes` stays editable).
5. **Record payment** routes to `/vouchers/new?payslip=N`. Voucher
   form is prefilled (type / party / linked-doc locked, date /
   amount editable). Date min = payslip's pay_date.
6. Multiple partial vouchers per payslip are normal — `derivedStatus`
   moves the payslip through `unpaid → partial → paid` automatically.
7. `/payslips/bulk` — pick a period, get every active employee with a
   checkbox; Create iterates `createPayslip` for each.

**PDF rendering**:
1. JS builds a JSON payload (a `buildPdfPayload` per detail page; the
   payslip builder lives in `app/lib/payslip-pdf.ts` so the list-row
   "Generate PDF" action and the detail page share one shape).
2. Invokes the matching `export_*_pdf` Rust command. document.typ
   covers quotes/invoices/bills; voucher.typ and payslip.typ have
   their own templates.
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

Installers land at `src-tauri/target/release/bundle/{msi,nsis}/`.

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
- **Page must have a single root node.** Vue/Nuxt warn loudly if a page
  has a leading template comment outside the root `<div>` — and the
  symptom on subsequent navigations is a blank/empty page after route
  transitions. Comments must live *inside* the root.

---

## Key architectural decisions and why

### Why DB-per-business (not `business_id` columns)

Single-user app. Switching is a deliberate context change. DB-per-file:
- Zero changes to existing query code (no `WHERE business_id = ?` everywhere).
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
calendar). See `app/layouts/default.vue`.

### Why root-`font-size` for UI zoom (not CSS `zoom` or `transform: scale`)

User-facing zoom levels (80, 90, 100, 110, 125, 150 %) are applied via
`document.documentElement.style.fontSize = '<level%>'`. Tailwind v4 +
NuxtUI 4 are almost entirely rem-based, so the whole interface scales
proportionally — fonts, paddings, icons, gaps, modals, teleported
overlays — in one shot. Avoids CSS `zoom` (subpixel artifacts, Firefox
quirks) and `transform: scale` (scrollbar / layout breakage).

The custom titlebar pins its sizing to **px arbitrary values**
(`h-[36px]`, `w-[44px]`, `text-[12px]`, `size-[16px]`) so it sits out
of the rem cascade and stays at its reference size regardless of zoom.
PDFs are unaffected — Typst is fixed-layout.

The plugin lives at `app/plugins/apply-zoom.client.ts` (not in a layout)
so it covers welcome and survives layout transitions.

### Why a custom titlebar

`tauri.conf.json` sets `decorations: false` on the main window. The
native chrome is replaced by `app/components/TitleBar.vue`, which:

- Has `data-tauri-drag-region` on the bar so the OS handles dragging
  and double-click-to-maximize.
- Hosts the sidebar collapse toggle (left), Sakoram mark + window
  title (centre), and minimize / restore-maximize / close buttons
  (right).
- Uses `useWindowState` (subscribes to `onResized`) for the reactive
  `isMaximized` flag so the maximize icon flips to "restore" while
  maximized.
- Pixel-pinned sizing so zoom doesn't scale it (see above).

Capabilities the titlebar needs: `core:window:allow-start-dragging`,
`allow-minimize`, `allow-toggle-maximize`, `allow-is-maximized`,
`allow-close` — all listed in `capabilities/main.json`.

### Why disable the webview's default context menu

A right-click anywhere outside an `<input>` / `<textarea>` /
`[contenteditable]` would show the browser's "Reload / Inspect"
context menu — instantly outs the app as a webview. The
`disable-context-menu.client.ts` plugin captures `contextmenu` at the
document level and `preventDefault`s on chrome. Inputs are skipped so
the user keeps cut / copy / paste / spellcheck. **Shift + right-click**
bypasses the suppression so 'Inspect element' is still reachable
during development without flipping a build flag.

Custom per-element context menus (e.g. row right-click) just register
their own `contextmenu` handler — it runs first via bubbling, opens
the custom menu, calls `preventDefault`. The document-level handler is
a harmless no-op afterwards.

### Why row context menus use `UContextMenu` with as-child trigger

Reka UI's `<ContextMenuTrigger as-child>` (which `UContextMenu` uses
when its default slot is populated) means the trigger element passes
through — no wrapper `<div>` between `<tbody>` and `<tr>`. Valid HTML,
no layout breakage. Wrapping each row that way gives right-click → the
same `itemsFor(row)` callback the overflow ⋯ button consumes — so any
new action lands in both menus automatically. See `app/pages/payslips/index.vue`
and `app/pages/employees/index.vue` for the pattern.

### Why no text selection on chrome

Sidebar labels, button text, the titlebar title — none of those should
be drag-selectable. `app/assets/css/main.css` applies `user-select: none`
to `button`, `a`, `[role="button"]`, `[role="tab"]`, `[role="menuitem"]`,
and anything inside an element marked `.app-chrome` (e.g. the floating
sidebar). Data surfaces (page content, tables, form inputs) stay
selectable so users can copy invoice numbers, totals, names, etc.

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
components, converts ISO ↔ `CalendarDate` in one place, and exposes
optional `min-value` / `max-value` (also ISO strings) for the
constrained date pickers on payslip period / pay date and salary-payment
voucher dates.

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

Five fonts ship in two places:

| Font | License | Notes |
|---|---|---|
| Inter | OFL | Variable, ~880 KB. **Default** for both UI and PDF. |
| Inter Tight | OFL | Variable, ~570 KB. Tighter sibling — useful for invoice headers. |
| Stack Sans Text | OFL | Variable, ~125 KB. Extra bundled choice. |
| Miriam Libre | OFL | Variable, ~125 KB. (Earlier static Regular/Bold pair was a corrupted HTML download — replaced with the upstream variable file.) |
| Amarna | OFL | Variable, ~62 KB. Decorative-leaning sans. |

`app/assets/fonts/*.ttf` — referenced from `app/assets/css/main.css`
via `@font-face` (variable: `format("truetype-variations")`,
`font-weight: 100 900`), hashed and emitted by Vite into `_nuxt/`.
`src-tauri/fonts/*.ttf` — picked up by Typst via `--font-path` (set
in `pdf.rs`), bundled into the installer via `tauri.conf.json`'s
`bundle.resources` glob (`fonts/*` — adding a font to the directory
auto-bundles it).

UI font and PDF font are independent (`company_settings.ui_font` and
`company_settings.pdf_font`). The Typst template reads
`data.font_family` from the per-render JSON payload, then falls back
through the bundled families for any missing glyph.

### Why icons are bundled (not fetched at runtime)

NuxtUI / `@nuxt/icon` defaults to fetching SVGs from the Iconify API.
We're a desktop app expected to work offline — that fails. Fix:
`@iconify-json/lucide` as a dev dep + `icon.clientBundle.scan: true`
in `nuxt.config.ts`. Vite scans templates and inlines only the icons
actually used (~70 icons). Zero runtime network dependency.

---

## Schema overview

See `src-tauri/migrations/` for the source of truth. High-level:

- `company_settings` — singleton (`id=1` CHECK), per-tenant. Includes
  `ui_font`, `pdf_font`, `theme_color`, `currency_code`,
  `pdf_header_logo_path`, fiscal-year start.
- `clients` — id, name, contact info, archived flag.
- `vendors` — same shape as `clients`. Address book for the bills side
  of the ledger.
- `employees` — payroll address book. Same identity / contact /
  archive shape as vendors plus payroll fields: `employee_number`
  (nullable, no UNIQUE), `nic`, `designation`, `joining_date`,
  `basic_salary_cents`, and a per-employee bank-payment block
  (`bank_name`, `bank_branch`, `bank_account_number`,
  `bank_account_name`).
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
  `derivedStatus()`, `paidCentsFor()`, `linkedPayments()`.
- `bills` + `bill_lines` — vendor bills. `vendor_id` FK → `vendors`
  with a `vendor_snapshot` JSON copy frozen at creation time;
  `category_id` FK → `bill_categories` with a `category_snapshot` JSON
  copy. **No `paid_cents` column** — removed in migration 0013.
  Payments via `vouchers.related_bill_id`. Persisted `status` is
  `open | cancelled`; user-visible unpaid / partial / paid / overdue
  state is **derived** in JS the same way invoices work.
- `payslips` + `payslip_lines` — per-employee, per-period pay records.
  `employee_id` FK + `employee_snapshot` (JSON, frozen at create).
  `UNIQUE (employee_id, period_start)` enforces "one payslip per
  period" at the DB level. Lines split by `kind` ∈ {earning, deduction}
  with a free-text label and integer amount — no per-line tax/qty.
  Net = Σ earnings − Σ deductions (computed and stored on the row).
  Persisted `status` is `draft | issued | cancelled`; the
  user-visible unpaid / partial / paid state is **derived** in JS
  from `vouchers.related_payslip_id` (added in migration 0017).
  Cancelling an issued payslip with linked payments is refused at
  the store level — vouchers must be deleted first. See
  `app/stores/payslips.ts`: `derivedStatus()`, `paidCentsFor()`,
  `linkedPayments()`, `canTransition()`, `setStatus()`.
- `vouchers` — money in (receipt) / money out (payment). Standalone or
  optionally linked to an invoice (`related_invoice_id`), bill
  (`related_bill_id`), or payslip (`related_payslip_id`). For all
  three, a voucher with the matching link is the **only** way money
  flow against the document is recorded — the document's "paid" /
  "balance" / status all derive from these voucher rows. The voucher
  detail page is **read-only by default**; the user clicks Edit to
  enter mutate-mode (Cancel re-hydrates from DB, Save persists +
  exits edit mode).

`PRAGMA table_info(...)` is used in `data_io.rs` to discover columns
dynamically — adding a column to a migration auto-flows into export.

---

## Migrations

```
0001_initial.sql                        ← settings, clients, document_counters
0002_documents.sql                      ← quotes, invoices, invoice_payments (latter dropped in 0014)
0003_bills_vouchers.sql                 ← bills, vouchers + their line tables (original schema)
0004_appearance.sql                     ← ui_font, theme_color on company_settings
0005_default_font_google_sans.sql       ← (historical) Miriam Libre default → Google Sans Flex
0006_pdf_font.sql                       ← adds pdf_font column (separate from ui_font)
0007_vendors.sql                        ← vendors table (mirrors clients shape)
0008_bills_use_vendors.sql              ← drop+recreate bills with vendor_id FK + vendor_snapshot
0009_bill_categories.sql                ← bill_categories lookup; bills get category_id + category_snapshot
0010_default_font_inter.sql             ← drop Google Sans Flex; default ui_font/pdf_font → Inter
0011_currency.sql                       ← per-business currency_code on company_settings
0012_pdf_header_logo.sql                ← pdf_header_logo_path column (wide PDF letterhead)
0013_bills_payments_via_vouchers.sql    ← drop bills.paid_cents; status collapses to open|cancelled
0014_invoices_payments_via_vouchers.sql ← drop invoices.paid_cents + invoice_payments table
0015_employees.sql                      ← employees address book (payroll)
0016_payslips.sql                       ← payslips + payslip_lines, UNIQUE (employee_id, period_start)
0017_vouchers_payslip_link.sql          ← vouchers.related_payslip_id (ON DELETE SET NULL)
0018_employee_number.sql                ← nullable text column on employees, indexed
```

**Adding a migration**: drop the SQL into `src-tauri/migrations/`,
register it in the `MIGRATIONS` array in `src-tauri/src/tenants.rs`,
bump `SCHEMA_VERSION` in `src-tauri/src/data_io.rs`, and (if a new
table) add it to the `TABLES` list in the same file so export/import
covers it.

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
            related_invoice_id; partial/paid/overdue states fall
            out of that.)

bills:     persisted: open ↔ cancelled (the only user transitions)
           derived:   open + payments → unpaid | partial | paid
                      open + due_date < today + balance > 0 → overdue
                      cancelled is sticky
           ("Record payment" creates a voucher with related_bill_id.)

payslips:  persisted: draft ↔ issued ↔ cancelled
           derived:   draft           → draft
                      issued + payments → unpaid | partial | paid
                      cancelled is sticky
           ("Record payment" creates a payment voucher with
            related_payslip_id. Cancel is refused once any payment
            is linked — voucher must be deleted first. The detail
            page hides Cancel in that state.)

vouchers:  no transitions; voucher_type (receipt/payment) is locked at create
```

---

## List view conventions

Every list page (clients, vendors, employees, bill categories, quotes,
invoices, bills, vouchers, payslips) follows the same shape so the UX
stays consistent and each page stays small:

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
5. **Row actions** are defined as a single `itemsFor(row)` callback
   consumed by both the overflow `UDropdownMenu` and the right-click
   `UContextMenu`. New actions land in both places automatically.
   Group items into sub-arrays to render a divider (e.g. `[lifecycle, exports]`
   on the payslips list separates Open / Mark issued from Generate PDF).

`useListView` returns a `reactive()` object so consumers do
`list.sortKey` / `list.page = 2` (no `.value` noise) and templates
auto-unwrap. It snaps page back into range when filters shrink the
list, and resets to page 1 on sort change. Default page size is 10
(options: 10 / 25 / 50 / 100).

**Sort defaults that match user expectations:**
- Documents (quotes / invoices / bills): `issue_date` desc — newest first.
- Vouchers: `voucher_date` desc.
- Payslips: `period_start` desc.
- Clients / vendors / employees / categories: name (or full_name) asc.

**Snapshot-derived columns** (e.g. client name on a quote, employee
name on a payslip) sort by re-parsing the snapshot in `getValue` so
the sort matches the visible cell, not the row's underlying FK or
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
- `core:window:allow-start-dragging`, `allow-minimize`,
  `allow-toggle-maximize`, `allow-is-maximized`, `allow-close` —
  all needed by the custom titlebar.
- `dialog:allow-{open,save}` for file pickers.
- **`shell:allow-open` does NOT support raw file paths** — its scope
  validator hard-codes URL schemes. We bypass it with our own
  `open_path` Rust command (`pdf.rs`).

---

## Sidebar grouping

```
Dashboard
─── (divider)
Quotes
Invoices
Bills
Vouchers
─── (divider)
Payroll
  ├─ Employees
  └─ Payslips
─── (divider)
Lists
  ├─ Clients
  ├─ Vendors
  └─ Bill categories
─── (divider)
Settings
  ├─ Company details
  ├─ PDF
  ├─ Appearance
  └─ Businesses
```

The sidebar itself is a floating card (`m-2 mt-0 rounded-lg shadow-lg`)
sitting against the floor of the titlebar; main content is flush with
the right and bottom of the window. Collapsible via the toggle on the
left of the titlebar (state in `useUiState.sidebarCollapsed`,
persisted to localStorage).

---

## What's done / what's not

### Done

- ✅ DB schema + migrations 0001..0018 (`SCHEMA_VERSION` 18)
- ✅ Clients / Vendors / Employees CRUD (hero + SectionCard layout)
- ✅ Quotes (full lifecycle, PDF, convert-to-invoice; default VAT seeded
  from settings on draft creation)
- ✅ Invoices (lifecycle, PDF; payments via receipt vouchers, status
  derived from voucher sums + due date)
- ✅ Bills (vendor FK + snapshot + category FK + snapshot; payments via
  payment vouchers, status derived)
- ✅ Vouchers (money in/out, PDF, big amount card layout; "Record
  payment" prefill + bounce-back; voucher detail page is read-only
  by default with explicit Edit toggle)
- ✅ **Payroll**: Employees, Payslips (single create + bulk create
  for all employees, period auto-snap, pay-date constrained,
  duplicate-period guard with link to existing), PDF, status FSM,
  payments via vouchers with `related_payslip_id`
- ✅ Universal delete on quotes/invoices/bills/payslips. Linked
  vouchers stay intact (their `related_*_id` is nulled on delete).
- ✅ Dashboard (KPI tiles, monthly cash-flow chart, receivables aging,
  expenses by category donut, top clients horizontal bars, recent
  activity, overdue list, quick actions). Hand-rolled SVG charts —
  no Chart.js / D3 — theme-aware via CSS variables.
- ✅ PDF generation via bundled Typst sidecar (5 bundled fonts, theme
  color from settings, user-chosen `pdf_font`, business-name
  wordmark fallback when no PDF logo uploaded)
- ✅ PDF preview modal (iframe-embedded, save-as via temp file copy)
- ✅ Settings split: `/settings/company`, `/settings/pdf`,
  `/settings/appearance`, `/settings/businesses`
- ✅ Appearance: independent UI/PDF font pickers (5 bundled +
  free-text), 8-color theme palette, **UI zoom** (80–150% in 6
  steps) via root-`font-size` cascade
- ✅ Bundled fonts (Inter / Inter Tight / Stack Sans Text / Miriam
  Libre / Amarna) — UI via `@font-face`, PDF via Typst `--font-path`
- ✅ Bundled icons (Lucide) — zero runtime network dependency
- ✅ DateField (single date) and DateRangeField with optional
  min/max constraints — used to keep payslip dates / salary-payment
  dates inside their valid windows
- ✅ Multi-tenancy (DB-per-business, welcome screen, tenant switcher)
- ✅ Export/Import (.zip bundles with manifest, schema-version gate)
- ✅ **Custom titlebar** — `decorations: false`, drag region,
  collapse-sidebar toggle, sidebar floating-card design, slim
  scrollbars, native window controls. Pixel-pinned so it doesn't
  scale with UI zoom.
- ✅ **Disabled defaults**: webview right-click context menu (except
  on inputs), text selection on UI chrome (sidebar, buttons, etc.)
- ✅ **Row context menus** on the payslips and employees list pages —
  same items the overflow ⋯ button shows; uses `UContextMenu` with
  `as-child` trigger so the `<tr>` stays the actual DOM element
- ✅ Window title syncs with active tenant
- ✅ Sidebar grouped (Dashboard / documents / Payroll / Lists /
  Settings) with thin separators between groups
- ✅ Bill categories — managed lookup with name + color (8 swatches)
  + icon (16 Lucide options); inline "+ New" modal on the bill page
- ✅ Default bill categories seeded into every fresh tenant
- ✅ Welcome screen with the new Sakoram wordmark and side-by-side
  cards on first run
- ✅ Allow deleting the active / last business
- ✅ Pagination + click-to-sort columns on every list page
- ✅ Demo seed bulk-fills ~22 extra rows of each entity
- ✅ Line-ending normalization via `.gitattributes`
- ✅ Production build pipeline (MSI + NSIS installers)
- ✅ CI release workflow (Windows + macOS Apple Silicon installers)

### Deferred / open items

- **Cmd/Ctrl+K command palette** — biggest "feels native" win still
  outstanding. Routes + recent docs + new-thing actions in one input.
- **Bill/voucher attachment upload UI** — `attachment_path` columns
  exist on the schema; no UI yet.
- **DB-side pagination** — see "List view conventions". Today every
  list loads all rows; sort/filter/page is in-memory. Acceptable up
  to a few thousand rows per table; revisit if a real tenant feels
  slow.
- **Per-document custom title** (e.g. "DEVELOPMENT QUOTE" instead of
  "QUOTATION") — currently `data.title` is hardcoded per doc type.
- **Drag-drop reorder for line items** — currently up/down arrow
  buttons in `DocumentLineEditor` / `PayslipLineEditor`.
- **Localised dates in list pages** — list tables show raw
  `2026-05-05` strings. Could use `Intl.DateTimeFormat`.
- **Soften schema-version gate on import** — currently refuses if
  bundle's `schema_version != current`. Future: per-version restore
  adapters.
- **Statutory auto-compute** — EPF (8% employee), ETF (3% employer),
  PAYE on payslips. Currently manual line entry.
- **Per-tenant default payslip lines** — settings panel that seeds
  every new payslip with a configurable list (Basic, EPF, etc.).
- **Code-signing the installers** — currently unsigned; SmartScreen
  warns on first run.

---

## Known landmines

- **Don't `await` Pinia state assignments inside the store's setup** —
  the store hasn't returned yet, so dependent stores see undefined.
  Use `onMounted` or method calls.
- **Don't add `BEGIN`/`COMMIT` from JS.** See "Connection pool caveat".
- **Don't change `com.sakoram.billing` bundle identifier** — orphans
  user data.
- **Don't change `productName`** lightly — installer filenames change
  + a Windows-installed previous version won't auto-replace.
- **Don't rename `_sqlx_migrations`** — would fail to detect already-
  applied migrations on legacy DBs.
- **Don't `Database.load()` a tenant URL before
  `ensure_tenant_db(id)`** — migrations need to run first.
- **Don't hand-build Windows paths with `${a}\\${b}`** for fs commands.
  Tauri's scope matcher is picky. Use `join()` from
  `@tauri-apps/api/path`.
- **Don't put `font-family` on a layout `<div>`** — overlays teleport
  to `<body>` and miss it. Set `--font-sans` on `:root` instead.
- **Pages must have a single root node.** A leading template comment
  outside the root `<div>` makes Nuxt route transitions render blank.
  Comments live *inside* the root.
- **A new migration file isn't enough** — the SQL is `include_str!`'d
  into the `MIGRATIONS` array in `src-tauri/src/tenants.rs`. Drop a new
  `0019_*.sql` into `migrations/` and forget to add it to that array
  and the migration silently never runs. Bump `SCHEMA_VERSION` in
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
- **UModal slot is `#body`, not `#content`.** Putting body content in
  a `#content` slot eats the sibling `#footer` and the dialog renders
  with no buttons — confusing failure mode.
- **Typst markup quirks** — bare `#` in markup starts an expression;
  `#:` inside a string is fine, but `Account #:` outside a string
  trips the parser. Same for `.map().flatten()` style — use
  `..for x in arr { ( a, b, ) }` to produce table rows.
- **Bundled `.ttf` files must be real fonts.** A saved GitHub HTML
  preview page renamed to `.ttf` will silently fall through the
  `@font-face` parser to system-ui (this happened with Miriam Libre
  before — replaced with the upstream variable file). Verify with
  `strings <file>.ttf | head` — a real TTF starts with binary table
  names like `GPOS`, `GSUB`, `OS/2`, `cmap`.

---

## When in doubt

- Check the comment block at the top of any source file — they explain
  the *why* of decisions that aren't obvious from the code.
- For DB queries, mirror what existing stores do (`select`, `selectOne`,
  `execute` from `app/lib/db.ts`).
- For new Tauri commands, follow the pattern in `src/pdf.rs` —
  `#[tauri::command]`, `Result<T, String>`, register in `lib.rs`.
- For new stores, follow the pattern of `app/stores/clients.ts` (simple
  CRUD) or `app/stores/payslips.ts` (FSM + derived-from-vouchers).
- For new list pages, copy the shape from
  `app/pages/payslips/index.vue` — `useListView` + `<SortableTh>` +
  `<ListPagination>` + `UContextMenu`-wrapped rows + `itemsFor(row)`.
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
3. Do the work, lint, commit. Bump the version (rules below).
4. `git push -u origin <branch>` then `gh pr create …`.
5. After review, `gh pr merge <num> --squash --delete-branch`.
6. Back to step 1 for the next task — pull main again before branching.

Never start work directly on `main`, never branch off another feature
branch, and don't reuse a branch after its PR was merged (the squash
commit on remote has different content than the local branch tip).

**Don't auto-open PRs.** The user prefers to confirm before `gh pr create`
fires. Push the branch, summarise what shipped, then wait for "open the
PR" or "make a pr" before opening.

**Bump the version on every PR.** Pre-1.0, use a minor bump (`0.X.0`)
for new features and a patch bump (`0.X.Y`) for fixes / chores. Three
files must stay in sync:

- `package.json` → `version`
- `src-tauri/Cargo.toml` → `[package].version`
- `src-tauri/tauri.conf.json` → `version`

`src-tauri/Cargo.lock` picks up the new version automatically the next
time cargo runs (rust-analyzer in the editor usually does it for you);
commit it alongside the other three.
