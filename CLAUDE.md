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
| Fonts | **Inter**, **Inter Tight**, **Stack Sans Text**, **Miriam Libre**, **Amarna**, **Akt** — all bundled (UI via `@font-face`, PDF via Typst `--font-path`) |
| Lang | **TypeScript** strict |
| State | **Pinia** (composition stores) |
| Validation | **Zod** |
| Package manager | **bun** (only — `preinstall` script blocks npm/yarn/pnpm) |
| DB | **SQLite** via `tauri-plugin-sql` (sqlx 0.8 underneath) |
| PDFs | **Typst** sidecar binary (`src-tauri/binaries/typst-*.exe`) |
| Window chrome | Custom — `decorations: false` on Windows; macOS uses `titleBarStyle: "Overlay"` to keep OS-drawn traffic lights while our chrome paints behind. `app/components/TitleBar.vue` adapts per platform. |
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
│  ├─ app.config.ts                   ← global NuxtUI overrides: primary green / neutral zinc, uppercase + small button text, shadowed UCard, w-full inputs, cursor-pointer buttons
│  ├─ layouts/
│  │  ├─ default.vue                  ← TitleBar + floating sidebar + main content
│  │  └─ welcome.vue                  ← TitleBar + minimal centered content
│  ├─ assets/
│  │  ├─ css/main.css                 ← Tailwind + @font-face for the 6 bundled fonts; chrome user-select rules; thin scrollbars; DataTable theming tokens
│  │  ├─ fonts/                       ← static-weight TTFs per family (Regular/Medium/Bold) generated by scripts/instance-fonts.py
│  │  ├─ sakoram-icon.svg             ← square mark used in the titlebar
│  │  └─ sakoram-wordmark.svg         ← wide wordmark used in the welcome screen + About modal
│  ├─ pages/
│  │  ├─ index.vue                    ← Dashboard (KPI tiles + cashflow/expenses row + Upcoming calendar embed + receivables aging + recent activity + top clients)
│  │  ├─ welcome.vue                  ← business picker (landing screen); demo-seed overlay while building
│  │  ├─ onboarding.vue               ← 4-step wizard after creating a new tenant
│  │  ├─ calendar.vue                 ← full-page month-grid view of every upcoming due-date (invoices / bills / quote expiries / payslips), with kind filter chips
│  │  ├─ clients/                     ← list w/ row context menu (View quotes/invoices), [id]
│  │  ├─ vendors/                     ← list, [id] (mirrors clients)
│  │  ├─ employees/                   ← list w/ row context menu, [id] (mirrors vendors + payroll fields)
│  │  ├─ categories/                  ← list w/ row context menu (Show bills) + bill counts — modal-driven CRUD
│  │  ├─ quotes/                      ← list w/ row context menu, [id] (PDF, convert to invoice). "New quote" opens NewQuoteModal — no /new page.
│  │  ├─ invoices/                    ← list w/ row context menu, [id] (PDF, payment ledger). "New invoice" opens NewInvoiceModal.
│  │  ├─ bills/                       ← list, [id] (vendor-FK + snapshot). "New bill" opens NewBillModal.
│  │  ├─ vouchers/                    ← list, new, [id] (money in/out; read-only by default → click Edit to mutate). Still uses a /new page — form is too heavy for a modal (8+ fields, prefill from ?bill=/?invoice=/?payslip=, overpayment guard).
│  │  ├─ payroll/                     ← index.vue is a landing card grid (mirrors /reports); dashboard.vue holds the upcoming-cycle hero + MoM chart + recent runs + outstanding
│  │  ├─ payslips/                    ← list w/ row context menu (multi-select bulk PDF), [id], bulk (auto-issue + auto-pay). "New payslip" opens NewPayslipModal.
│  │  ├─ reports/                     ← aggregate views over the books. index.vue lists available + upcoming reports; profit-loss.vue (accrual P&L), vat.vue (output VAT vs input VAT), aged-receivables.vue (open-invoice snapshot by days past due), and aged-payables.vue (open-bill mirror) are wired up. No DB writes.
│  │  └─ settings/
│  │     ├─ index.vue                 ← redirect to /settings/company
│  │     ├─ company.vue               ← business info, address, bank, defaults, logo
│  │     ├─ pdf.vue                   ← PDF font + PDF header logo
│  │     ├─ appearance.vue            ← UI font, theme color (8-swatch), light/dark/system toggle, zoom (6 discrete steps)
│  │     ├─ payroll.vue               ← cycle template (period_start_day / period_end_day / pay_day)
│  │     └─ businesses.vue            ← tenant CRUD + Export/Import
│  ├─ components/
│  │  ├─ TitleBar.vue                 ← custom titlebar — Windows: full chrome (sidebar toggle + back + drag region + min/max/close). macOS: 78px reservation for OS traffic lights + sidebar toggle + back; OS owns close/min/max. Pixel-pinned sizing so zoom doesn't scale it.
│  │  ├─ BreakpointBadge.vue          ← dev-only floating chip at bottom-right showing current Tailwind breakpoint + viewport width
│  │  ├─ ResizableDataTable.vue       ← shared wrapper around PrimeVue DataTable: drag-pan, sort/page state in localStorage, auto-fit columns, "Fit" page-size that adapts to viewport, right-click row context menu, multi-select checkbox column
│  │  ├─ ClientPicker.vue             ← UPopover with search
│  │  ├─ VendorPicker.vue             ← clone of ClientPicker, used by bill creation
│  │  ├─ EmployeePicker.vue           ← clone of VendorPicker, used by payslip creation
│  │  ├─ CategoryPicker.vue           ← bill-category dropdown w/ inline "+ New" modal
│  │  ├─ CategoryFormModal.vue        ← create/edit category (8-color × 16-icon picker)
│  │  ├─ CurrencyPicker.vue           ← onboarding + Settings → Business details currency dropdown. Built-in CURRENCIES list plus a "Custom currency…" option that reveals Code + Symbol inputs; emits both v-models so parents just bind code + symbol-override.
│  │  ├─ BusinessBankFormModal.vue    ← create/edit modal for managed bank accounts (label + bank fields). Auto-marks the first bank as default so freshly-created accounts immediately seed new quotes / invoices.
│  │  ├─ NewQuoteModal.vue            ← "New quote" form-in-a-modal (client + project title) — replaces /quotes/new
│  │  ├─ NewInvoiceModal.vue          ← "New invoice" form-in-a-modal — replaces /invoices/new
│  │  ├─ NewBillModal.vue             ← "New bill" form-in-a-modal (vendor picker) — replaces /bills/new
│  │  ├─ NewPayslipModal.vue          ← "New payslip" form-in-a-modal (employee + 3 dates + dup-period guard) — replaces /payslips/new
│  │  ├─ SectionCard.vue              ← header-with-icon card; used on company / client / vendor / employee edit pages
│  │  ├─ DateField.vue                ← UInputDate + UCalendar wrapper; ISO-string v-model + min/max with is-date-unavailable strikethrough
│  │  ├─ DateRangeField.vue           ← same idea, range mode (v-model:from / v-model:to)
│  │  ├─ DayOfMonthField.vue          ← 1–31 integer input + "Last day of month" toggle (used on payroll settings)
│  │  ├─ DocumentLineEditor.vue       ← bundle/itemized line-item editor for quotes/invoices/bills
│  │  ├─ PayslipLineEditor.vue        ← two-section earnings/deductions editor with live subtotals + net
│  │  ├─ MoneyInput.vue               ← integer-cents v-model
│  │  ├─ PdfPreviewModal.vue          ← chromeless PDF preview (header sr-only, PDFium toolbar suppressed via #toolbar=0). iframe loads from a same-origin blob URL (built from the temp file via tauri-plugin-fs readFile) so the footer "Print" button can call contentWindow.print() without tripping same-origin policy.
│  │  ├─ PhoneUploadModal.vue         ← QR + LAN-server flow to attach a photo from a phone
│  │  ├─ AttachmentsCard.vue          ← shared attachments card (local + phone upload) for all document detail pages
│  │  ├─ StatusBadge.vue              ← color-coded status badges (no `primary` — theme-stable semantic colours only). min-w-24 + uppercase + tracking-wider so every badge sits at uniform width.
│  │  ├─ StatChip.vue                 ← joined-pill stat readout (filled label + outlined value). Used for the filtered-totals row above every list table.
│  │  ├─ LinkedBillField.vue          ← USelectMenu of open bills with status badge + remaining balance — used by the new-voucher form
│  │  ├─ LinkedInvoiceField.vue       ← same shape, open invoices
│  │  ├─ LinkedPayslipField.vue       ← same shape, unpaid payslips
│  │  ├─ UpcomingCalendar.vue         ← month-grid view of every due-date event from useCalendarEvents. Two densities: "full" for the /calendar page, "compact" for the dashboard embed. Day-detail modal footer + per-cell right-click UContextMenu both expose a quick-create flow (Quote / Invoice / Bill / Voucher) routed through one `createForDate(kind, date)` helper that threads the picked date through as the new doc's issue_date (or voucher_date).
│  │  ├─ MonthlyCashFlowChart.vue     ← dashboard: 12-month receipts vs payments (drops to 6 months at lg / xl-expanded)
│  │  ├─ MonthlySalaryPaidChart.vue   ← payroll dashboard: 12-month salary-paid bars
│  │  ├─ ReceivablesAgingChart.vue    ← dashboard: outstanding invoices by days-past-due bucket
│  │  ├─ ExpensesByCategoryChart.vue  ← dashboard: bills donut by category, last 90 days
│  │  └─ TopClientsChart.vue          ← dashboard: top clients by invoiced revenue, last 12 months
│  ├─ composables/
│  │  ├─ usePdfPreview.ts             ← preview→commit flow used by every detail page that has a PDF button
│  │  ├─ useDocumentNumber.ts         ← editable sequence + live formatted preview + uniqueness check for the New* forms
│  │  ├─ useUiState.ts                ← localStorage-backed UI prefs: sidebarCollapsed, zoomLevel
│  │  ├─ useWindowState.ts            ← reactive isMaximized; subscribes to Tauri onResized
│  │  ├─ useActiveCurrency.ts         ← live ref of the active business's currency meta
│  │  ├─ useUserPlatform.ts           ← cached host platform via @tauri-apps/plugin-os — exposes isMac / isWindows / isLinux for platform-conditional UI (e.g. macOS titlebar layout)
│  │  ├─ useDragToScroll.ts           ← left-click-drag panning for the PrimeVue DataTable body. Listens on a stable wrapper and resolves the scroller per-mousedown so it survives DataTable remounts (auto-fit-columns triggers a remount).
│  │  └─ useCalendarEvents.ts         ← aggregates due-date events from invoices / bills / quotes / payslips into a Map<YYYY-MM-DD, CalendarEvent[]>. Per-source emitters are easy to extend — just add another computed + push into the sources array.
│  ├─ lib/
│  │  ├─ db.ts                        ← getDb() (lazy, reads active tenant URL), select/execute
│  │  ├─ demo-seed.ts                 ← createDemoBusiness() — curated + bulk-fill at real-business volume: 200 clients / 150 vendors / 600 quotes / 800 invoices / 1000 bills / 400 standalone vouchers spread across ~18 months, 15 employees, 14 months of payslips, ~10 sample attachments. Takes 2-3 min; surfaces SeedProgress callback so the welcome page + Settings → Businesses can show a live stage label.
│  │  ├─ money.ts                     ← toCents, formatMoney/formatLKR, computeLineTotals (integer math). Plus the runtime currency registry: built-in CURRENCIES map + registerCurrency() / isBuiltinCurrency() helpers so user-defined currencies (slotted in by the settings store on load from company_settings.currency_symbol_override) work everywhere formatMoney does.
│  │  ├─ numbering.ts                 ← allocateDocumentNumber (single-statement atomic)
│  │  ├─ pdf.ts                       ← preview/commit/legacy export helpers; PdfCommand union
│  │  ├─ quote-pdf.ts                 ← shared payload builder; detail page + list-row Generate-PDF call this
│  │  ├─ invoice-pdf.ts               ← same shape as quote-pdf; takes paidCents for the paid/balance row
│  │  ├─ bill-pdf.ts                  ← same shape as invoice-pdf; "Bill from" party block, no bank, no prepared_by
│  │  ├─ voucher-pdf.ts               ← shared builder for the one-page voucher.typ template + resolveVoucherRelatedLabel helper for the linked-doc tag
│  │  ├─ payslip-pdf.ts               ← shared payload builder used by both payslip detail page and list-row Generate-PDF action
│  │  ├─ payroll-cycle.ts             ← resolvePayrollCycle + nextPayrollCycle: turn (year, month, settings) → ISO dates with clamping (31 = last day of month)
│  │  └─ theme.ts                     ← THEME_COLORS palette (name → hex)
│  ├─ middleware/
│  │  └─ tenant.global.ts             ← redirect to /welcome if no active tenant
│  ├─ plugins/
│  │  ├─ window-title.client.ts       ← syncs Tauri window title with active tenant
│  │  ├─ disable-context-menu.client.ts ← suppresses webview right-click on chrome (skips inputs / Shift bypass)
│  │  ├─ disable-file-drop-nav.client.ts ← preventDefaults document dragover/drop so a stray file drop can't navigate the webview
│  │  └─ apply-zoom.client.ts         ← writes the user's zoomLevel onto the root <html> font-size
│  └─ stores/                         ← Pinia composition stores
│     ├─ settings.ts                  ← company_settings (singleton, per-tenant)
│     ├─ clients.ts
│     ├─ vendors.ts
│     ├─ employees.ts                 ← payroll address book
│     ├─ bill_categories.ts           ← managed lookup powering CategoryPicker
│     ├─ business_banks.ts            ← managed list of business bank accounts (label + bank fields + is_default + archived). Atomic setDefault via single CASE-WHEN UPDATE. Quotes / invoices snapshot from here on save via buildSnapshotForId().
│     ├─ quotes.ts                    ← quotes + quote_lines, status FSM, pricing modes, date filters
│     ├─ invoices.ts                  ← invoices + invoice_lines. Payments live on vouchers; derivedStatus/paidCentsFor sum vouchers.related_invoice_id.
│     ├─ document_attachments.ts      ← scans / photos attached to any document (local file + phone upload)
│     ├─ bills.ts                     ← vendor_id FK + vendor_snapshot + category_snapshot. Payments via vouchers.related_bill_id.
│     ├─ payslips.ts                  ← payslips + payslip_lines, status FSM, derivedStatus/paidCentsFor sum vouchers.related_payslip_id.
│     ├─ vouchers.ts                  ← receipts/payments; carries related_invoice_id, related_bill_id, related_payslip_id
│     └─ tenants.ts                   ← bridges JS to Rust tenant registry
└─ src-tauri/
   ├─ Cargo.toml                      ← Rust deps (tauri 2.10, sqlx 0.8, zip 2, qpdf 0.3 vendored)
   ├─ tauri.conf.json                 ← productName, identifier, sidecars, capabilities, decorations: false (Windows-shaped)
   ├─ tauri.macos.conf.json           ← macOS overlay: decorations:true + titleBarStyle:"Overlay" so OS-drawn traffic lights stay visible while our custom titlebar paints behind them. Tauri 2 deep-merges this onto tauri.conf.json for macOS builds.
   ├─ capabilities/
   │  └─ main.json                    ← fs scopes, sql, dialog, window controls, shell-execute (typst arg validators)
   ├─ binaries/
   │  └─ typst-x86_64-pc-windows-msvc.exe   (gitignored, ~48 MB, target-triple naming required)
   ├─ fonts/                          ← same 6 families as app/assets/fonts (Typst reads from here). Statics-per-weight TTFs generated via scripts/instance-fonts.py — see "Why bundle fonts" decision below.
   │  ├─ Inter-{Regular,Medium,Bold}.ttf
   │  ├─ InterTight-{Regular,Medium,Bold}.ttf
   │  ├─ StackSansText-{Regular,Bold}.ttf
   │  ├─ MiriamLibre-{Regular,Bold}.ttf
   │  ├─ Amarna-{Regular,Bold}.ttf
   │  └─ Akt-{Regular,Medium,Bold}.ttf  ← default UI + PDF font since migration 0024
   ├─ migrations/                     ← see "Migrations" section below
   ├─ templates/
   │  ├─ document.typ                 ← unified Typst template for quotes/invoices/bills
   │  ├─ voucher.typ                  ← simpler one-page receipt layout
   │  └─ payslip.typ                  ← employee block + side-by-side earnings/deductions + net pay card
   └─ src/
      ├─ lib.rs                       ← entry point, plugin registration, command handler list
      ├─ tenants.rs                   ← tenant registry, per-DB migration runner, legacy migration
      ├─ pdf.rs                       ← export_*_pdf commands (quote/invoice/bill/voucher/payslip), copy_file, open_path
      ├─ phone_upload.rs              ← LAN HTTP server (axum) for phone→invoice photo uploads + import_invoice_attachment
      └─ data_io.rs                   ← export_tenant_data / import_tenant_data (.zip bundles)
.github/
└─ workflows/
   ├─ release-windows.yml             ← Windows MSI + NSIS build, triggered by tag push or manual dispatch. Also mirrors installers to Cloudflare R2 (when secrets configured).
   └─ release-macos.yml               ← macOS Apple Silicon DMG + .app.tar.gz build, same triggers + R2 mirror.
```

---

## How data flows (worth tracing once)

**Creating a quote**:
1. User clicks **New quote** on `/quotes` → `<NewQuoteModal>` opens.
   Pick a client + optional project title → store calls
   `allocateDocumentNumber("quote", today_iso)` (one atomic SQL).
2. Quote row inserted, modal closes, navigate to `/quotes/{id}`.
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
1. User clicks **New payslip** on `/payslips` → `<NewPayslipModal>`
   opens. Pick employee (or arrive with `?employee=ID` preselect from
   the employees list), period (auto-snaps to month bounds), pay date
   (clamped to `[period_start, period_end]`).
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

**Upcoming due-dates calendar**:
1. `useCalendarEvents` reads invoices / bills / quotes / payslips
   stores. Per-source emitters filter out paid / cancelled rows and
   shape what's left into `CalendarEvent` objects keyed by ISO date.
2. `<UpcomingCalendar>` renders a 6×7 month grid (always rectangular
   thanks to leading/trailing days from adjacent months). Two
   densities: `full` for `/calendar`, `compact` for the dashboard
   embed.
3. Click a day → modal lists every event for that day with full
   context (kind, party, balance, overdue badge). Click an event →
   navigate to its detail page.
4. Overdue events override their kind colour to error red; a `!N`
   badge on the day cell surfaces overdue counts. Adding a new
   event source = add one computed in `useCalendarEvents` and push
   it onto the `sources` array.

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

`tauri.conf.json` sets `decorations: false` on the main window
(Windows-shaped). The native chrome is replaced by
`app/components/TitleBar.vue`, which:

- Has `data-tauri-drag-region` on the bar so the OS handles dragging
  and double-click-to-maximize.
- Hosts the sidebar collapse toggle and **global back button** (left,
  back arrow uses Vue Router's `window.history.state.position`
  counter to disable cleanly at the landing entry), Sakoram mark +
  window title (centre), and minimize / restore-maximize / close
  buttons (right, **Windows only**).
- Uses `useWindowState` (subscribes to `onResized`) for the reactive
  `isMaximized` flag so the maximize icon flips to "restore" while
  maximized.
- Pixel-pinned sizing so zoom doesn't scale it (see above).

**Per-platform adaptation:** `useUserPlatform` (wraps
`@tauri-apps/plugin-os`) reports the host; the titlebar branches on
`isMac`:

- **Windows** (default): 36px tall, custom min/max/close cluster on
  the right.
- **macOS**: 28px tall (system small-toolbar convention), 78px left
  reservation strip for the OS-drawn traffic lights, no right-side
  cluster — the OS owns close/min/max. Tighter 36px button cells on
  the left so the sidebar toggle + back button fit the shorter bar.

The macOS look-and-feel is wired via `src-tauri/tauri.macos.conf.json`
— a platform overlay that flips `decorations: true` + sets
`titleBarStyle: "Overlay"`, which makes the system titlebar
transparent while keeping the traffic lights visible. Tauri
deep-merges that file onto `tauri.conf.json` for macOS builds.

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

### Why `dragDropEnabled: false` on the window

Tauri 2 windows default to `dragDropEnabled: true`, which makes the
native layer intercept OS file drops — the webview never sees an HTML5
`drop` event, so the logo upload drop zones (PDF header, company
identity logo) silently don't work. We don't use Tauri's native
drag-drop API anywhere, so the window sets `dragDropEnabled: false`
and the webview handles drops natively.

The trade-off: a webview navigates to any file dropped on the page,
so a stray miss would replace the whole UI. The
`disable-file-drop-nav.client.ts` plugin `preventDefault`s document
`dragover` / `drop` so a miss does nothing. Real drop zones register
their own `drop` handler — it runs first in the bubble chain and reads
the file; the document-level guard is a no-op afterwards.

### Why row context menus use `UContextMenu` with as-child trigger

Reka UI's `<ContextMenuTrigger as-child>` (which `UContextMenu` uses
when its default slot is populated) means the trigger element passes
through — no wrapper `<div>` between `<tbody>` and `<tr>`. Valid HTML,
no layout breakage. Wrapping each row that way gives right-click → the
same `itemsFor(row)` callback the overflow ⋯ button consumes — so any
new action lands in both menus automatically. The pattern is on the
quotes, invoices, payslips, employees, clients, and bill-categories
list pages — see `app/pages/payslips/index.vue` for a reference.

### Why no text selection on chrome

Sidebar labels, button text, the titlebar title — none of those should
be drag-selectable. `app/assets/css/main.css` applies `user-select: none`
to `button`, `a`, `[role="button"]`, `[role="tab"]`, `[role="menuitem"]`,
and anything inside an element marked `.app-chrome` (e.g. the floating
sidebar).

Beyond chrome, most **list, dashboard, and settings pages opt their
whole root out of selection** with a `select-none` class — they're
surfaces for navigating and configuring, not for copying text out of.
To keep form editing usable, `main.css` has a companion rule that
forces `input` / `textarea` / `[contenteditable]` back to
`user-select: text`, so drag-select and double-click-a-word still work
inside a `select-none` page. A leading template comment must stay
*inside* the root `<div>` — see the single-root-node landmine.

### Why the PDF preview uses a blob URL (not asset://)

We render once to `app_local_data_dir/pdf-previews/{slug}.pdf`. **The
iframe doesn't bind directly to the asset URL** — Tauri's
`convertFileSrc()` returns an `asset://` URL that's *cross-origin* to
the renderer (different origin in dev and in prod), and the modal's
**Print** button needs `iframe.contentWindow.print()` to work, which
same-origin policy blocks across origins.

Workaround: the modal reads the temp file's bytes via
`@tauri-apps/plugin-fs` `readFile`, wraps them in a `Blob` with
`type: "application/pdf"`, and creates a `URL.createObjectURL()` blob
URL. Blob URLs inherit the renderer's origin → `contentWindow.print()`
reaches into the iframe and pops the OS print dialog. The blob is
revoked on close / unmount / re-render to release memory.

The modal also drops PDFium's built-in toolbar via the
`#toolbar=0&navpanes=0` fragment, and the UModal's own title bar is
hidden via `ui.header: 'sr-only'` — the result is a chromeless
preview that fills the modal. Footer keeps **Cancel · Print · Save
as…** explicit. Save-as copies the temp via the Rust `copy_file`
command — zero re-render on save.

Detail/list pages thread `:temp-path="pdf.state.tempPath"` into
`<PdfPreviewModal>` (alongside the legacy `assetUrl` prop, kept for
back-compat / debugging but no longer consumed by the iframe).
`fs:allow-read-file` already permits `$APPLOCALDATA/**` so no
capability change is needed.

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

Six families ship in two places. Each family is **multiple static-weight
TTFs** (Regular + Bold, plus Medium for the sans-serif body fonts) rather
than a single variable file: Typst 0.14 only renders the default weight
from a variable TTF unless it has STAT-named instances at every weight
(which most Google Fonts variable files don't), so a "bold" request on
a variable-only bundled font would silently fall back. Statics fix that
— Typst indexes each `<Family>-<Style>.ttf` as a separate face of the
shared family name and selects the right one for each weight request.

| Family | Weights bundled | License |
|---|---|---|
| Akt | Regular / Medium / Bold | OFL. **Default** for both UI and PDF (since migration 0024). Geometric sans from Google Fonts. |
| Inter | Regular / Medium / Bold | OFL. Previous default, kept as the universal fallback in font cascades. |
| Inter Tight | Regular / Medium / Bold | OFL. Tighter sibling — useful for invoice headers. |
| Stack Sans Text | Regular / Bold | OFL. Extra bundled choice. |
| Miriam Libre | Regular / Bold | OFL. |
| Amarna | Regular / Bold | OFL. Decorative-leaning sans. |

The statics are generated from upstream variable files via
`scripts/instance-fonts.py` (run with `uv run scripts/instance-fonts.py`
— the script's PEP 723 header resolves fontTools into an ephemeral env,
no global install required). Add a new family by dropping the variable
TTF into `src-tauri/fonts/`, appending a `JOBS` entry, and re-running.

`app/assets/fonts/*.ttf` — referenced from `app/assets/css/main.css`
via `@font-face` (one declaration per weight, `format("truetype")`),
hashed and emitted by Vite into `_nuxt/`. `src-tauri/fonts/*.ttf` —
picked up by Typst via `--font-path` (set in `pdf.rs`), bundled into
the installer via `tauri.conf.json`'s `bundle.resources` glob
(`fonts/*` — adding a font to the directory auto-bundles it).

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

### Global UI tokens via `app/app.config.ts`

NuxtUI 4 takes a `ui.<component>.slots` config that applies classes
to every instance of a component app-wide. We use it for the
typographic and visual rhythm that would otherwise be sprinkled
across every page:

- `ui.button.slots.base: "cursor-pointer uppercase tracking-wide
  !text-xs"` — every UButton renders **uppercase**, with light
  letter-spacing, at 12px (one step below the per-size variant's
  default text-sm). Uppercase glyphs hit cap-height on every letter
  so 12px sits at roughly the optical weight of mixed-case text-sm
  body. The `!` important modifier is needed because each size
  variant (md → text-sm) would otherwise win.
- `ui.card.slots.root: "shadow-md shadow-black/10"` — every UCard
  picks up the same softened drop shadow as the floating sidebar.
  Tailwind-merge overrides UCard's default `shadow-sm`.
- `ui.formField.slots: { root: "w-full", hint: "select-none",
  description: "select-none", help: "select-none" }` — form fields
  always span their container; helper text doesn't drag-select like
  data would.
- `ui.input.slots.root` / `ui.textarea.slots.root` → `w-full`.
- `ui.modal.slots.title` / `ui.modal.slots.description` → `select-none`
  so the modal header / supporting text stops drag-selecting (matches
  the rest of the chrome). Form inputs inside the body still pick up
  `user-select:text` via the global rule in main.css.
- `ui.colors: { primary: "green", neutral: "zinc" }` — the source of
  the app's accent. Settings → Appearance writes a CSS-variable
  override on `:root` (`--ui-primary` etc.) that flows through
  every component without needing to touch this config.

`<UApp :toaster="{ position: 'top-center' }">` in `app/app.vue`
pushes every toast to top-centre — keeps them out of the way of the
sticky save bar pinned bottom-right on every detail / settings page.

When a future component-wide rule is needed (e.g. "all USelect get a
border radius nudge"), drop it here rather than chasing per-call
classes. The exception is **`StatusBadge`** — that's a thin wrapper
around UBadge with its own min-w + uppercase + tracking, kept as a
component because the colour-by-status logic doesn't belong in
config.

### Address-book detail pages share one hero pattern

Employees, clients, and vendors all use the same detail-page hero
shape (`app/pages/{employees,clients,vendors}/[id].vue`):

```
[avatar]  Name + status badge                         [View … · Archive · Delete]
          chip · chip · chip · chip                   (or ⋯ dropdown below lg)
```

- **Avatar**: 80px circle, `bg-(--ui-primary)/15`, initials in
  primary colour (`text-2xl font-semibold`). Falls back to
  `i-lucide-user` (employee), `i-lucide-user-round` (client), or
  `i-lucide-store` (vendor) when no initials are available.
- **Right cluster**: `hidden lg:flex` inline buttons at lg+, swaps
  to a `lg:hidden` `⋯` `UDropdownMenu` trigger below. Both paths
  share the same handlers via a `actionMenuItems` computed declared
  at the end of the script so its handler references are in scope.
  Items grouped so the menu draws a separator between View+Archive
  and Delete; Delete row carries
  `class: "text-(--ui-error) hover:bg-(--ui-error)/10 [&>span>span:first-child]:text-(--ui-error)"`
  to tint the icon + text in error tone.
- **Cross-doc shortcuts** — View payslips / View quotes+invoices /
  View bills — set the destination store's `…Filter` field, clear
  the other filters on that store, then `router.push`. Matches the
  same-named row actions on each list page.
- **Hard delete**: each store gained a `remove(id)` method that does
  `DELETE FROM <table> WHERE id = ?`. The FK on related rows is
  RESTRICT / NO ACTION (payslips → employees, quotes+invoices →
  clients, bills → vendors), so SQLite blocks the delete once
  history exists. The page handler catches the constraint error
  with `/foreign key|constraint|RESTRICT/i.test(raw)` and surfaces
  a friendly warning toast nudging the user toward Archive instead
  of dumping the raw SQL error.

Document detail pages (quote / invoice / bill / voucher / payslip)
don't share the avatar but follow the same right-cluster collapse
pattern: inline header buttons from lg+ that swap to a `⋯` dropdown
below. Quote and invoice headers carry an `actionMenuItems` computed
that flattens primary actions + transition actions + a destructive
Delete into the dropdown.

### Why the light theme uses a paper palette (not pure white)

Pure-white surfaces feel clinical for an app you stare at for hours
of bookkeeping. The light-mode override under `html:not(.dark)` in
`main.css` swaps `--ui-bg` and its lifted variants for a warm cream
(`#fbf7ee` page bg, `#f4efe2` cards, `#fffefa` popovers,
`#ede6d5` hover). Borders shift to a matching warm tone so they
don't fight the cream. Dark mode keeps NuxtUI's stock zinc — it
already reads well.

The picker on `/settings/appearance` uses `useColorMode()` from
`@nuxtjs/color-mode` (transitive of `@nuxt/ui`), with three values:
`system` (default — follows the OS), `light`, `dark`. Preference is
per-machine (localStorage), not per-tenant — doesn't ride the export
bundle.

---

## Schema overview

See `src-tauri/migrations/` for the source of truth. High-level:

- `company_settings` — singleton (`id=1` CHECK), per-tenant. Includes
  `ui_font`, `pdf_font`, `theme_color`, `currency_code`,
  `pdf_header_logo_path`, fiscal-year start, and the **payroll cycle
  template**: `payroll_period_start_day`, `payroll_period_end_day`,
  `payroll_pay_day` (1–31 integers, clamped to month length at
  runtime — 31 ≡ last day of month). Resolved via
  `app/lib/payroll-cycle.ts`. Also holds **PDF protection**:
  `pdf_protect_password` (owner password; null/empty = off) and five
  `pdf_protect_{quote,invoice,bill,voucher,payslip}` 0/1 flags.
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
  `derivedStatus()`, `paidCentsFor()`, `linkedPayments()`. Cancelling
  an invoice with recorded receipts is refused at the store level
  (`setStatus("cancelled")` throws); delete the receipt vouchers
  first.
- `bills` + `bill_lines` — vendor bills. `vendor_id` FK → `vendors`
  with a `vendor_snapshot` JSON copy frozen at creation time;
  `category_id` FK → `bill_categories` with a `category_snapshot` JSON
  copy. **No `paid_cents` column** — removed in migration 0013.
  Payments via `vouchers.related_bill_id`. Persisted `status` is
  `open | cancelled`; user-visible unpaid / partial / paid / overdue
  state is **derived** in JS the same way invoices work. Cancelling a
  fully-paid bill is refused at the store level — payment vouchers
  must be deleted first.
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
- `document_attachments` — scans / photos attached to any document
  (quote / invoice / bill / voucher). Polymorphic: keyed by
  `(document_type, document_id)`, **no FK** — so each document store's
  delete path calls `purgeDocumentAttachments()` to clear the rows +
  files. The file bytes live on disk under
  `app_data_dir/attachments/<tenant_id>/<document_type>/<document_id>/`;
  the row stores `file_path` + `filename` + `size_bytes` + `mime` +
  `source` (`local` = desktop file dialog, `phone` = LAN phone upload).
  Managed by `app/stores/document_attachments.ts`; the shared
  `AttachmentsCard.vue` renders it on every document detail page.

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
0019_payroll_cycle.sql                  ← payroll_period_start_day / payroll_period_end_day / payroll_pay_day on company_settings
0020_pdf_protection.sql                 ← pdf_protect_password + 5 per-type pdf_protect_* flags on company_settings
0021_invoice_attachments.sql            ← invoice_attachments table (scans / photos per invoice)
0022_document_attachments.sql           ← drop invoice_attachments; polymorphic document_attachments table
0023_business_banks.sql                 ← multi-bank business accounts: business_banks table + business_bank_id FK on quotes/invoices; bank cols dropped from company_settings
0024_default_font_akt.sql               ← flip default ui_font / pdf_font Inter → Akt
0025_currency_symbol_override.sql       ← allow custom (non-curated) currency_code by persisting a user-supplied symbol
0026_drop_attachment_path.sql           ← drop the dead bills.attachment_path / vouchers.attachment_path columns (the polymorphic document_attachments table from 0022 has owned attachments for a while)
0027_title_override.sql                 ← optional `title_override` text column on quotes / invoices / bills so the PDF big-header can be customised per document ("Development quote" instead of "QUOTATION")
0028_denormalize_list_party_names.sql   ← denormalised `client_name` / `vendor_name` / `employee_name` columns on quotes / invoices / bills / payslips (plus `category_name/color/icon` on bills) so list pages render + sort + search without parsing the snapshot JSON per row. Backfilled from existing snapshots via SQLite's `json_extract`. Stores set the column whenever the snapshot is set; detail pages still use the full snapshot.
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
                       ↘ rejected | expired
                draft → rejected (cancel)
                rejected | expired → draft (reopen — common mistake escape)

invoices:  persisted: draft ↔ sent ↔ cancelled (the only user transitions)
           derived:   draft           → draft
                      sent + payments → partial | paid
                      sent + due < today + balance > 0 → overdue
                      cancelled is sticky
           ("Record payment" creates a receipt voucher with
            related_invoice_id; partial/paid/overdue states fall
            out of that.) Cancel is refused once any receipt
            voucher is linked — vouchers must be deleted first.
            The detail page also hides "Record payment" once the
            balance hits zero.

bills:     persisted: open ↔ cancelled (the only user transitions)
           derived:   open + payments → unpaid | partial | paid
                      open + due_date < today + balance > 0 → overdue
                      cancelled is sticky
           ("Record payment" creates a voucher with related_bill_id.)
           Cancel is refused once the bill is fully paid — payment
           vouchers must be deleted first.

payslips:  persisted: draft ↔ issued ↔ cancelled
           derived:   draft           → draft
                      issued + payments → unpaid | partial | paid
                      cancelled is sticky
           ("Record payment" creates a payment voucher with
            related_payslip_id. Cancel is refused once any payment
            is linked — voucher must be deleted first. The detail
            page hides Cancel in that state.)

vouchers:  no transitions; voucher_type (receipt/payment) is locked at create

Detail-page UI for transitions: each legal next-state is rendered as an
explicit button in the header (no dropdown). On the list pages, the
row context menu and overflow ⋯ menu surface the most common ones.

Date invariants enforced via DateField's min-value + a watcher that
drags the second date forward when the first moves past it:
  - quotes:    valid_until >= issue_date
  - invoices:  due_date    >= issue_date
  - bills:     due_date    >= issue_date
  - payslips:  pay_date in [period_start, period_end]
```

---

## List view conventions

Every list page (clients, vendors, employees, bill categories, quotes,
invoices, bills, vouchers, payslips) follows the same shape so the UX
stays consistent and each page stays small:

1. **Store** owns the data and `filtered` computed (search / status /
   date filters live here as refs the page binds to in the header).
2. **Page** renders `<ResizableDataTable :rows="…" state-key="…"
   :row-actions="itemsFor" default-sort-field="…">` with PrimeVue
   `<Column>` children for each column. ResizableDataTable is a thin
   wrapper around PrimeVue DataTable that bundles every cross-list
   piece of UX: drag-pan, sort/page localStorage persistence (per
   `state-key`), auto-fit-columns, "Fit" page-size, the right-click
   row context menu, and an optional multi-select checkbox column.
3. **Row actions** are defined as a single `itemsFor(row)` callback
   that returns grouped arrays `[[…], […]]` — rendered into both
   PrimeVue's context menu and (where present) the overflow ⋯ menu.
   Group boundaries become separators. New actions land in both
   places automatically. Pattern is on the quotes, invoices,
   payslips, employees, clients, and bill-categories lists.
4. **Filter strip** is consistent across the document lists (quotes,
   invoices, bills, vouchers, payslips):
   - Row 1: search + FK pickers (client/vendor/employee) + **Advanced**
     button (a `UPopover` hosting the date-range fields, with a small
     info-dot indicating when any date filter is active) + **Reset**.
   - Row 2 + 3 share a `grid grid-cols-1 md:grid-cols-2 items-start`
     wrapper — status chips on the left, date-preset chips on the
     right at md+; stacked at sm. `items-start` keeps each column
     flush with the top of the row when one wraps to two lines.
   - **Status chips**: multi-select. Empty set = show everything.
     Each chip's active colour matches the row's `StatusBadge` for
     visual continuity. Stored as `store.statusFilters` (array)
     with `toggleStatusFilter` / `clearStatusFilters` helpers.
   - **Date-preset chips** (Today / This week / This month / This
     year): each resolves to concrete ISO bounds at click time, so
     "This month" is always the current calendar month — no
     staleness. Clicking the active preset clears the range.
     Payslips replaces this with a month picker since the common
     payroll query is "show me April 2026".
5. **Table action bar** sits just below the header divider, above the
   table proper:
   - Left: **Auto-fit columns** button — strips persisted column
     widths and remounts the table so the browser re-measures from
     content.
   - Right: **filtered-rows summary** as a `<StatChip>` showing the
     sum of currently visible rows' totals (success/error/net split
     on vouchers). `X of Y shown` appendix appears when filters are
     narrowing the list.
6. **PrimeVue paginator** at the foot of the table, with our own
   page-size picker injected into `#paginatorend`. Options are
   **Fit (N) · 10 · 15 · 25 · 50 · 100**. "Fit" is the default for
   first-visit tables — it measures available viewport height and
   computes how many rows fit (a `FIT_SAFETY_ROWS = 2` nudge keeps
   the last row off the paginator border). Re-measures on resize and
   when the user switches into Fit. A picked numeric value persists
   per `stateKey` to localStorage and opts out of auto-sizing for
   that table.

**Sort defaults that match user expectations:** declared via
`default-sort-field` / `default-sort-order` on `<ResizableDataTable>`:
- Documents (quotes / invoices / bills): `issue_date` desc — newest first.
- Vouchers: `voucher_date` desc.
- Payslips: `period_start` desc.
- Clients / vendors / employees / categories: name (or full_name) asc.

**Snapshot-derived columns** (e.g. client name on a quote, employee
name on a payslip) are surfaced as `_client` / `_employee` / `_status`
fields on the view-model row so PrimeVue's by-field sorting matches
the visible cell, not the underlying JSON blob.

**Row click — first cell only.** ResizableDataTable's `@row-click`
emits the typed row but only when the click landed on the first
non-selection cell. Two reasons: drag-to-pan would otherwise tug on
a 5px threshold and risk an accidental nav; and the leading column
(number, name) reads as "the link" the way GitHub / GitLab tables
do. Right-click still opens the context menu on the whole row.

**Frontend-only by design.** Sort, filter, and pagination happen on
the in-memory `filtered` array — the DB only sees the initial
`SELECT * FROM …`. Acceptable for a single-user desktop app at
realistic per-business volumes (low thousands of rows). If a real
tenant ever crosses ~10k in a single table, the migration is to
swap `store.load()` for paged fetches; don't pre-optimise.

**Legacy components** `ListPagination.vue`, `SortableTh.vue`, and
`useListView.ts` were removed in the post-PrimeVue cleanup — every
list page is on `ResizableDataTable` now.

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
Calendar              ← month-grid view of every upcoming due date
─── (divider)
Quotes
Invoices
Bills
Vouchers
─── (divider)
Payroll               ← /payroll — landing card grid mirroring /reports
  ├─ Dashboard       ← /payroll/dashboard — cycle / KPIs / MoM chart / recent runs
  ├─ Employees
  ├─ Payslips
  └─ Settings        ← /settings/payroll — cycle template (period_start_day / period_end_day / pay_day)
─── (divider)
Reports               ← aggregate views over the books (no editing)
  ├─ Profit & Loss   ← /reports/profit-loss — income − bills − payroll, accrual
  ├─ VAT             ← /reports/vat — output VAT − input VAT, net payable for the period
  ├─ Aged receivables ← /reports/aged-receivables — open-invoice snapshot by days past due
  └─ Aged payables    ← /reports/aged-payables    — open-bill mirror, per-vendor breakdown
─── (divider)
Lists
  ├─ Clients
  ├─ Vendors
  └─ Bill categories
─── (divider)
Settings                ← per-tenant business config (exported in backups)
  ├─ Business details
  └─ PDF
      ├─ Font                ← third-level in-page #anchors, shown only
      ├─ Header logo            while /settings/pdf is the active route
      ├─ Footer notes
      └─ Protection
─── (divider)
App                     ← UI + multi-tenant administration
  ├─ Appearance
  │   ├─ UI font             ← same in-page #anchor pattern as PDF,
  │   ├─ Theme color            shown only on /settings/appearance
  │   ├─ Theme
  │   └─ Zoom
  └─ Businesses
```

URLs all live under `/settings/*` even for the App group — only the
sidebar grouping splits them. \`Settings\` items are per-tenant data
that travels with the export bundle; \`App\` items are UI prefs and
multi-tenant admin that don't belong to any single business.

The sidebar nav supports three levels: top-level items, `children`
(always visible), and an optional third level of `sections` — in-page
`#anchor` links that appear under a child only while that child's own
route is active (currently PDF and Appearance). Section links scroll
to the matching card; the active section is matched on `route.hash`.
Each target card is wrapped in an `id`'d `<div>` with `scroll-mt-*`,
and `scrollToSection()` in `default.vue` does the scroll by hand
(the main content scrolls in its own container, so Vue Router's
window-level hash handling doesn't reach it).

The sidebar itself is a floating card (`m-2 mt-0 rounded-lg shadow-lg`)
sitting against the floor of the titlebar; main content is flush with
the right and bottom of the window. Collapsible via the toggle on the
left of the titlebar (state in `useUiState.sidebarCollapsed`,
persisted to localStorage).

---

## What's done / what's not

### Done

- ✅ DB schema + migrations 0001..0025 (`SCHEMA_VERSION` 25)
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
- ✅ **Payroll** (huge surface):
  - Employees CRUD with payroll fields (basic salary, bank, NIC, etc.)
  - Payslips lifecycle: create, edit lines, issue, cancel, pay; PDF
  - **Cycle template** on `company_settings` (period_start_day /
    period_end_day / pay_day, 1–31 with month-length clamping;
    settable at `/settings/payroll`). Resolved via
    `app/lib/payroll-cycle.ts`.
  - **Bulk payslip flow** at `/payslips/bulk` — pick a month, the
    three dates fall out of the cycle template; chain auto-issue
    and auto-record-payment in one run. Per-row payment references
    (TXN ID / cheque #); voucher defaults (method, description)
    bulk for the run.
  - **Bulk PDF export** on the payslips list — multi-select rows
    via checkbox column, pick output folder, progress modal, one
    `{number}.pdf` per row.
  - **Payroll dashboard** at `/payroll` — upcoming-cycle hero with
    urgency badge (overdue red / 7-day amber / further green), KPI
    tiles (active employees / outstanding payroll / paid this year),
    12-month salaries-paid bar chart, recent runs panel, outstanding
    list.
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
- ✅ **Document attachments** — scans / photos attached to any document
  (quote / invoice / bill / voucher). Polymorphic `document_attachments`
  table (migration 0022, supersedes the invoice-only 0021). The shared
  `AttachmentsCard.vue` is on every document detail page (voucher card
  gated to edit mode). Two upload paths: a local file picker
  (`import_document_attachment` Rust command) and **phone upload** —
  `phone_upload.rs` runs a token-gated LAN HTTP server (axum) and shows
  a QR; the user captures photos in their phone's browser and they
  attach over the network (`PhoneUploadModal.vue` + `phone-upload-received`
  event). Multi-photo per session; the LAN IP is resolved from the
  routing table.
- ✅ **Password-protected PDFs** — optional owner-password encryption
  (AES-256 / R6) applied by the `qpdf` crate as a post-process after
  Typst renders. Owner-password only: the PDF opens with no prompt but
  editing / copying / annotating are blocked, printing stays allowed.
  Configured at `/settings/pdf` — one owner password + a per-document-type
  toggle (quote / invoice / bill / voucher / payslip). `lib/pdf.ts`
  resolves the password from settings and threads it to the matching
  `export_*_pdf` command; `encrypt_pdf()` in `pdf.rs` does the work.
- ✅ Settings split into two sidebar groups: **Settings** (per-tenant
  business config — Company / PDF / Payroll cycle) and **App**
  (UI prefs + multi-tenant admin — Appearance / Businesses). URLs
  all stay at `/settings/*`.
- ✅ Appearance: independent UI/PDF font pickers (5 bundled +
  free-text), 8-color theme palette, **UI zoom** (80–150% in 6
  steps) via root-`font-size` cascade, and **light/dark/system
  theme toggle** backed by `useColorMode()` (persists to
  localStorage; flips the `.dark` class on `<html>` live).
  Light mode uses a warm paper palette (`#fbf7ee` page bg with
  matching warmer borders) under `html:not(.dark)` in `main.css`
  so it doesn't feel clinical; dark mode keeps NuxtUI's zinc
  defaults.
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
- ✅ **Row context menus** on the quotes, invoices, payslips,
  employees, clients, and bill-categories list pages — same items the
  overflow ⋯ button shows; uses `UContextMenu` with `as-child` trigger
  so the `<tr>` stays the actual DOM element. Quote / invoice row PDF
  generation calls shared payload builders in `app/lib/quote-pdf.ts`
  and `app/lib/invoice-pdf.ts`. The clients menu also offers View
  quotes / View invoices, and bill categories offers Show bills —
  each hands a filter to the target list store before navigating.
- ✅ **Chip-style multi-select filters + Advanced popover** on every
  document list page (quotes, invoices, bills, vouchers, payslips).
  Empty chip set = show everything; multiple chips = union. Date
  ranges hide in a single Advanced popover with an active-state dot.
  Quick date presets (Today / This week / This month / This year)
  live under the status row.
- ✅ **Sticky save bar** on detail pages (quote / invoice / bill /
  voucher / payslip / client / vendor / employee / settings):
  primary-coloured border at 50% opacity + shadow-2xl + backdrop
  blur. Fades in when the form is dirty; Discard / Save changes.
  Reka UI popper panels share the same border treatment globally
  via a CSS rule in `main.css`.
- ✅ **Explicit transition buttons** on detail page headers (quote /
  invoice) — replaces the opaque "Status ▾" dropdown so available
  next-states are visible at a glance. Short verb labels (Send /
  Accept / Reject / Expire / Reopen / Cancel) keep the row compact.
  A small vertical separator sits before the Delete button.
- ✅ **Reopen rejected/expired quotes back to draft** — saves the
  user from burning a quote number on a misclick or a client change
  of mind.
- ✅ **Cancel guards** on invoices and bills — refused at the store
  level once payment vouchers exist (delete vouchers first). UI
  hides the cancel button in that state.
- ✅ **Date invariants** on quote (valid >= issue), invoice / bill
  (due >= issue) via `DateField` `min-value` + an issue-date
  watcher. `is-date-unavailable` strikes through out-of-range dates
  on the calendar.
- ✅ Window title syncs with active tenant
- ✅ Sidebar grouped (Dashboard / documents / Payroll / Lists /
  Settings) with thin separators between groups
- ✅ Bill categories — managed lookup with name + color (8 swatches)
  + icon (16 Lucide options); inline "+ New" modal on the bill page
- ✅ Default bill categories seeded into every fresh tenant
- ✅ Welcome screen with the new Sakoram wordmark and side-by-side
  cards on first run. **Demo seed overlay** blocks the welcome page
  while the demo business is being built so the user can't click
  the half-seeded tenant.
- ✅ **Onboarding wizard** at `/onboarding` — 4-step flow after
  creating a new tenant (Identity / Contact / Money defaults /
  Banking). Each step saves directly so partial completion sticks.
  Step 1 has a "Skip onboarding" link for power users.
- ✅ Allow deleting the active / last business
- ✅ Pagination + click-to-sort columns on every list page
- ✅ **Demo seed at real-business volume** — `createDemoBusiness()`
  now builds ~18 months of activity at the scale a real Sri Lankan
  small business would generate: 200 clients, 150 vendors, 600
  quotes, 800 invoices, 1000 bills, 400 standalone vouchers, 15
  employees, 14 months of payslips, plus ~10 sample image
  attachments scattered across documents. Bulk loops use coprime
  date strides against a 540-day spread so issue dates land
  uniformly across the range (the P&L fiscal-year preset and the
  Last-year / This-year date chips all return meaningfully
  different slices). Seed takes 2-3 minutes; a `SeedProgressFn`
  callback feeds a live stage label ("Seeding bills · 425 / 1000")
  into the welcome page + Settings → Businesses overlay so the
  spinner has context. Original curated set (4 clients / 3
  vendors / 3 quotes / 4 invoices / 3 bills / 4 vouchers) is
  preserved as the "feature showcase" — those rows still drive the
  dashboard's recent-activity feed and the detail-page demos.
- ✅ Line-ending normalization via `.gitattributes`
- ✅ Production build pipeline (MSI + NSIS installers)
- ✅ **CI release workflows split per platform** — `release-windows.yml`
  + `release-macos.yml` (Apple Silicon). Both trigger on a `v*.*.*`
  tag push (parallel) and have their own "Run workflow" button on
  the Actions tab for one-platform rebuilds. Each handles its own
  tag resolution + published-release guard.
- ✅ **Cloudflare R2 mirror for installers** — both release workflows
  upload the produced installer files to an R2 bucket under
  `sakoram/<version>/<filename>` (with spaces in Tauri-produced
  filenames replaced by dots for clean URLs). R2 has a connected
  custom domain so installers are served at
  `https://downloads.gravitide.dev/sakoram/<version>/...` directly,
  no GitHub-Releases hop. The mirror step skips cleanly when the
  required secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_ACCOUNT_ID`, `R2_BUCKET`) aren't configured on the repo, so
  forks / contributor branches aren't coupled to the
  gravitide.dev bucket.
- ✅ **Calendar** — `/calendar` page with month-grid view of every
  upcoming due date (invoices, bills, quote expiries, payslips).
  Hand-rolled grid (no FullCalendar / VCal dep). Filter chips for
  each event kind, per-kind counts on the chips, summary line with
  visible / overdue counts. Compact density embedded on the
  dashboard between cashflow/expenses and receivables aging.
- ✅ **Global back button** in the titlebar, gated on Vue Router's
  history-state position counter so the disabled state stays in
  sync with whether there's actually somewhere to go back to.
- ✅ **Native macOS titlebar treatment** — `tauri.macos.conf.json`
  overlay flips `decorations: true` + sets `titleBarStyle: "Overlay"`
  on Mac builds so the OS-drawn traffic-light buttons stay visible
  while our custom titlebar paints behind them. `useUserPlatform`
  composable + per-platform branches in `TitleBar.vue` adapt the
  layout (28px height, 78px left reservation, no right-side cluster).
- ✅ **"New …" modals** for quotes / invoices / bills / payslips —
  small two-to-four-field forms moved off standalone `/new` pages
  into modals that open over the list. Dashboard "New" menu and
  employees' "Create payslip" row action use `?new=1` query
  shortcuts that auto-open the matching modal on mount. Vouchers
  still uses a full page (8+ fields, prefill from multiple query
  params, conditional fields).
- ✅ **`<ResizableDataTable>`** — shared wrapper around PrimeVue
  DataTable adopted across every document list page. Bundles
  drag-pan, sort/page localStorage persistence, auto-fit columns,
  "Fit" page-size, right-click row context menu, and an optional
  multi-select checkbox column.
- ✅ **"Fit" page-size** — table page size auto-adapts to viewport
  height. Default on first visit; a picked numeric value persists
  per table. Recomputes on window resize.
- ✅ **Filtered-row totals** as a joined-pill **`<StatChip>`** above
  every list table (TOTAL · Rs N for quotes/invoices/bills; IN · OUT
  · NET split for vouchers). `X of Y shown` appendix when filters
  narrow the list.
- ✅ **Chromeless PDF preview + in-line Print** — header `sr-only`,
  PDFium toolbar suppressed via `#toolbar=0`, iframe loads from a
  same-origin blob URL (built from the temp file via fs plugin) so
  `contentWindow.print()` works without tripping same-origin policy.
  Footer is Cancel · Print · Save as…. Launcher buttons relabelled
  **PDF & Print** / **Generate PDF & Print** across all detail and
  list pages.
- ✅ **Dashboard KPI strip overhaul** — 4-up at md+ (was 1/2/4 by
  breakpoint), compact money format at md+lg where tile widths are
  tightest, smaller uppercase labels at md+lg, uniform tile heights,
  tiles prefilter the destination list (Receivables → invoices with
  sent/partial/overdue chips active, etc.).
- ✅ **List filter strip 2-col grid** — status chips + date-preset
  chips share a row from md+ (stack at sm). `items-start` keeps each
  column flush with the top when one wraps. Auto-fit columns moved
  out of the filter strip into the table action bar (it's a table
  action, not a filter).
- ✅ **Uniform-width uppercase `<StatusBadge>`** — every badge sits at
  `min-w-24` with `justify-center uppercase tracking-wider`, so
  status columns read as a tidy stack of equal-width pills.
- ✅ **Global UI typography** via `app/app.config.ts` — uppercase +
  `text-xs` on every UButton, softened `shadow-md shadow-black/10`
  on every UCard, `w-full` on UFormField / UInput / UTextarea by
  default. See "Global UI tokens" decision section above.
- ✅ **Softened sidebar shadow** (`shadow-md shadow-black/10`) +
  **tighter, symmetric content padding** (`p-4 pb-2` — was
  asymmetric `pl-4 pr-8 py-6`). Bottom matches the sidebar's `m-2`
  floor gap so both surfaces line up.
- ✅ **Address-book detail-page hero pattern** — employees, clients,
  and vendors share one shape: 80px circular avatar with primary-tinted
  bg + initials, name + chip strip in the middle, and a right cluster
  with a cross-doc shortcut + Archive + Delete. Right cluster collapses
  to a `⋯` dropdown below lg. See the "Address-book detail pages share
  one hero pattern" decision section above.
- ✅ **Hard-delete for employees / clients / vendors** — each store
  gained a `remove(id)` method; the FK-constraint error
  (`payslips → employees ON DELETE RESTRICT`, `quotes`/`invoices →
  clients` and `bills → vendors` NO ACTION) is caught by a regex
  match in the page handler and translated into a friendly toast
  nudging the user toward Archive instead of dumping raw SQL.
- ✅ **Responsive header dropdowns on document detail pages** —
  quote / invoice headers swap their inline button cluster for a `⋯`
  dropdown below lg. The dropdown items computed flattens primary
  actions + transition actions + Delete (with error-tone class).
  Bill / voucher / payslip headers stay inline; payslip uses
  `flex-wrap` so it can spill onto a second row at narrow widths.
- ✅ **Detail-page button styling uniformity** — `size="sm"` on every
  header button across all 5 docs (icons no longer dominate the 12px
  uppercase text), `variant="soft"` on every destructive Delete
  button (was a mix of soft / ghost), voucher Type badge picks up
  the StatusBadge `min-w-24 + uppercase + tracking-wider` shape.
- ✅ **Payroll Outstanding payroll tile** is clickable — sets
  `payslipsStore.statusFilters = ['unpaid', 'partial']` before
  navigating to `/payslips`, matching the dashboard KPI prefilter
  pattern.
- ✅ **Appearance settings 2-col layout at lg+** — UI font card on
  the left, Theme color + Theme + Zoom stacked on the right inside
  `max-w-5xl`. Sticky save bar stays outside the grid so it spans
  both columns.
- ✅ **Toasts pop top-centre** via `<UApp :toaster="{ position:
  'top-center' }">` so they don't fight the sticky save bar pinned
  bottom-right on every detail / settings page.
- ✅ **Modal title + description `select-none`** via
  `ui.modal.slots` in app.config — modal chrome stops drag-selecting.
- ✅ **Payslips list table action bar** — Auto-fit columns moved out
  of the filter strip into the table action bar (left); StatChip
  summing `net_cents` across visible rows on the right with `X of Y
  shown` appendix when filtered.
- ✅ **KPI headline at xl now stays at `text-xl`** (was bumping back
  to text-2xl). Full money strings still wrapped to two lines at
  240-300px tile widths; text-2xl now only kicks back in at 2xl.
- ✅ **Multi-bank business accounts** (migration 0023) — the single
  bank record on `company_settings` became a managed list in
  `business_banks`. One bank is marked default and auto-applies to
  new quotes / invoices via the picker on each detail page. The
  existing `bank_details_snapshot` JSON on quote / invoice rows is
  unchanged, so Typst templates need no edit; the new
  `business_bank_id` FK is informational. Settings → Business
  details renames from "Company details" and gains a "Bank
  accounts" SectionCard + sidebar sub-link sections (#company /
  #address / #bank-accounts / #defaults).
- ✅ **Custom currencies** (migration 0025) — the currency picker on
  onboarding + Business details offers a "Custom currency…" option
  that takes a free-text code + symbol (persisted as
  `company_settings.currency_symbol_override`). On load the settings
  store calls `registerCurrency()` to slot the override into
  `money.ts`'s CURRENCIES map so `formatMoney()` works for any code.
- ✅ **Default UI / PDF font flipped to Akt** (migration 0024) —
  geometric sans replaces Inter as the default for both ui_font and
  pdf_font. Inter is still bundled as a secondary fallback in the
  CSS / Typst cascades for missing glyphs.
- ✅ **Quick-create from calendar** — every cell on `/calendar` (and
  the dashboard embed) offers two paths to spin off a new document:
  left-click for the day-detail modal's "Create on this day" footer
  buttons, right-click for a UContextMenu with the same actions.
  The picked date threads through to the New modal as the draft's
  `issue_date` (for quote / invoice / bill) or `voucher_date` (for
  voucher). Quote / invoice / bill takes
  `?new=1&issued=YYYY-MM-DD`; voucher takes `/vouchers/new?date=…`.
- ✅ **StatChip `neutral` colour variant** for informational counts
  (muted-text filled label + matching outline). Used on the
  calendar's `Shown` summary chip; available for any future
  count-with-no-semantic-tone use case.
- ✅ **Row context menu + bulk PDF on bills / vouchers / vendors** —
  brings the last three holdouts into the same shape every other
  list page uses. Bills and vouchers get the multi-select column +
  selection action bar + progress modal for bulk PDF; vendors gets
  the row-action menu with View bills / Edit / Archive (no PDF —
  vendor records don't generate documents on their own). The
  per-document detail pages now delegate their PDF payload building
  to two new shared libs: `bill-pdf.ts` and `voucher-pdf.ts`
  (matching the quote / invoice / payslip pattern).
- ✅ **Per-document PDF header override** — quotes / invoices / bills
  gain an optional `title_override` column (migration 0027). A small
  "PDF header" input on each detail page lets the user replace the
  default big header (QUOTATION / INVOICE / BILL) with anything they
  type — "Development quote", "Pro-forma invoice", "Recurring bill".
  The PDF builder upper-cases the value at render time; leaving the
  field blank falls through to the hardcoded default. Vouchers and
  payslips are left as-is — voucher meaning is Receipt/Payment, and
  PAYSLIP is legally constrained.
- ✅ **Split party-snapshot cards on quote / invoice / bill detail
  pages** — the single Client & project / Bill from card became two
  side-by-side UCards at lg+: a Reference card (form fields,
  col-span-2) and a party-snapshot card (Quote to / Bill to / Bill
  from, col-span-1, `lg:col-start-3` + `lg:row-start-1`). At md they
  stack with the snapshot on top via DOM order so the "who is this
  for / from" block leads the page when the column is single.
  Refresh-snapshot button is icon-only on all three pages so the
  narrow card title doesn't squeeze.
- ✅ **Cross-doc shortcuts on the party-snapshot card** — quote /
  invoice / bill detail pages now expose two actions on the party
  snapshot card: **Open client / Open vendor** (routes to the
  address-book detail page) and **View all quotes / View all invoices
  / View all bills** (pre-filters the destination list by the party,
  same setStore-filter + route pattern the clients / vendors detail
  pages already use). Sits below the snapshot block separated by a
  border-t so it reads as a footer action row.
- ✅ **Reports module — Profit & Loss** (Tier 1, first cut). New
  `/reports` section under its own sidebar group with a landing card
  grid. The P&L page (`/reports/profit-loss`) is accrual-basis:
  income from issued invoices, less expenses from open bills and
  issued payslips, filtered by a date range. Six preset chips (This
  month / Last month / This quarter / This year / Last year /
  Fiscal year — the last reads `company_settings.fiscal_year_start_month`
  so SL gov FY works without configuration). Amounts use
  `subtotal_cents` on invoices / bills (VAT is a pass-through, not
  revenue / expense) and `earnings_cents` (gross) on payslips. Three
  KPI tiles + breakdown table with `% of income` column + per-source
  drill-down tables (clickable rows route to the underlying document).
  All math in-memory on already-loaded stores — fine at expected
  per-tenant volumes; SQL-side aggregation is a future PR if a tenant
  ever crosses ~10k rows.
- ✅ **Reports module — VAT report** (Tier 1, second cut). New
  `/reports/vat` page mirroring the P&L's shape: same filter strip,
  same six date presets, same three-tile layout (Output VAT / Input
  VAT / Net VAT). The math is the VAT-only complement of the P&L:
  Output VAT = sum of `invoices.tax_cents` for sent invoices in
  range, Input VAT = sum of `bills.tax_cents` for non-cancelled bills
  in range, Net = Output − Input. Negative net renders as an
  Input-VAT credit carrying forward (Sri Lankan IRD treatment).
  Drill-down tabs (Invoices / Bills) include a VAT column alongside
  subtotal so users can verify line-by-line against tax-return source
  data. The roadmap landing card grid now lists both P&L and VAT
  live; aged receivables / payables / cash flow / sales-by-client /
  payroll-register remain "Coming" tiles.
- ✅ **Reports module — Aged payables** (Tier 1, fourth cut). New
  `/reports/aged-payables` page — exact mirror of aged receivables
  with bills + vendors swapped in: "who we owe money RIGHT NOW",
  same five buckets keyed off `bills.due_date`, same KPI shape, same
  per-vendor ResizableDataTable + PDF export. Only `open` bills with
  positive balance count; cancelled and fully-paid drop off
  naturally. Click a vendor row to jump to `/bills` pre-filtered by
  vendor_id. Builder is a verbatim mirror of the receivables
  payload — same `report.typ` 7-column case, same currency-stripped
  per-cell amounts, same grid lines. The only structural change
  needed across the codebase was the new page + builder + landing
  card + sidebar link.
- ✅ **Reports module — Aged receivables** (Tier 1, third cut). New
  `/reports/aged-receivables` page — a snapshot report ("who owes us
  money RIGHT NOW") rather than a date-range view. Outstanding invoice
  balances are bucketed by days past `due_date`: Current (not yet due)
  / 1-30 / 31-60 / 61-90 / 90+. Only sent invoices with a positive
  balance count — drafts and cancelled never appear, fully-paid drop
  off naturally. Balance is `invoicesStore.balanceCentsFor()` so this
  report can never disagree with the dashboard tile or P&L drill-downs.
  Three KPI tiles (Total outstanding / Overdue / Current) + a bucket
  distribution table with count + amount + % of total + a per-client
  breakdown sorted by total descending (worst-aged clients at the top).
  Click a client row to jump to `/invoices` pre-filtered by client_id.
  Same PDF export pipeline as P&L + VAT — `report.typ` learned a
  7-column case for the per-client table (Client + 5 buckets + Total)
  with the client name in a 1fr column and every amount column
  right-aligned.
- ✅ **Reports module — PDF export** for P&L + VAT. New generic Typst
  template `src-tauri/templates/report.typ` shared by both reports —
  the JSON payload drives title, period subtitle, three KPI summary
  tiles, breakdown table with totals row, and per-source detail
  sections (each on its own page so the summary is filable
  separately). Adding a new report = a new payload builder in
  `app/lib/report-pdf.ts`, no Rust change. New Rust command
  `export_report_pdf` registered alongside the existing
  `export_*_pdf` commands; reuses the shared `render_pdf()`
  plumbing for logo handling + font path + typst sidecar. PDF
  preview modal + Save-as flow uses the same `usePdfPreview`
  composable every document detail page already does. Reports
  skip the per-type owner-password protection toggle (entry in
  `PROTECT_FLAG` is null — reports always render unencrypted; the
  per-type protection is an invoice/quote/bill/voucher/payslip
  concern).

### Deferred / open items

- **Cmd/Ctrl+K command palette** — biggest "feels native" win still
  outstanding. Routes + recent docs + new-thing actions in one input.
- **Mac titlebar visual QA** — Approach A (overlay-style traffic
  lights) was committed but never hands-on tested. Need to verify the
  78px reservation, 28px height, and title alignment on real macOS
  builds.
- **Firewall rule for the phone-upload server** — the phone-upload
  feature runs a LAN HTTP server, so the OS firewall must allow inbound
  connections to the app. It works on machines where the user has
  already allowed the app; the production installer should add a
  program-scoped inbound rule so end users don't hit a silent block.
- **DB-side pagination** — see "List view conventions". Today every
  list loads all rows; sort/filter/page is in-memory. Acceptable up
  to a few thousand rows per table; revisit if a real tenant feels
  slow.
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

### Roadmap — what's missing to call this a complete bookkeeping app

Snapshot taken 2026-05-24 after the multi-bank / custom-currency /
calendar-quick-create batch landed. The app today is solidly an
**invoicing + expense + payroll tracker with PDFs**. To cross into
"real bookkeeping software" territory in the user's perception, this
is the gap list — ordered by impact, not effort.

**Tier 1 — biggest single gap: a reports module.** All the data is
already in the DB; nothing aggregates it for a date range. Build a
`/reports` section that mirrors the document-list shape (filter strip
+ printable Typst PDF) and bake in:

- **Profit & Loss** — invoice income − bill expenses − payslip net,
  by date range. Could group by month or by category.
- **VAT / tax report** — output VAT (sum of tax lines on issued
  invoices) vs input VAT (sum of tax lines on open/paid bills), net
  payable for the period. This is the one a Sri Lankan business
  *actually needs* to file VAT returns.
- **Aged receivables** — outstanding invoices bucketed by days past
  due (0–30 / 31–60 / 61–90 / 90+). Dashboard chart exists but no
  printable / per-client breakdown.
- **Aged payables** — same shape on bills.
- **Cash flow report** — receipts − payments by month for any range.
  The dashboard chart is 12-month only.
- **Sales by client** + **expenses by vendor** for a date range,
  with drill-down to underlying documents.
- **Payroll register** — every payslip in a period with employee /
  earnings / deductions / net / paid columns. Most of the data is
  already on the payroll dashboard; this just exports it.

**Tier 2 — meaningful workflow features still missing:**

- **Credit notes / refunds** — no way to issue a negative document
  today. When you over-invoice or accept a return, you can't settle
  it cleanly against the original invoice. Add a `credit_note`
  document type that references an invoice and offsets its balance.
- **Customer statements** — "everything outstanding for client X"
  as a printable PDF. Data is already there; just needs a Typst
  template + a button on the client detail page.
- **Recurring invoices / recurring bills** — for retainers,
  subscriptions, monthly rent. A template + a "due today" generator
  that runs on app open (or on a Tauri startup hook).
- **Bank reconciliation** — import a bank statement CSV and tick off
  matched vouchers. Manual today; a side-by-side reconcile screen
  would be a real productivity win for any business with > ~20
  transactions/month.

**Tier 3 — niceties, low-leverage:**

- **Products / services catalog** — reusable line items so users
  stop retyping descriptions on every invoice.
- **Year-end closing / period lock** — refuse edits to documents
  in a closed fiscal year. The immutability rules cover most of
  this already; this would just lock everything older than X.
- **Cmd/Ctrl+K command palette** — also on the Deferred list above.
- **Email invoice directly** — currently PDF + manual attach.
  Requires SMTP config + an outbox UI.

**Explicitly out of scope:**

- Full double-entry chart of accounts. Overkill for the audience;
  the immutable-document + voucher-ledger model already gives them
  what they need without making them learn debits / credits.
- Multi-currency *per document*. One currency per business is a
  golden rule (Golden rule #8).
- Inventory with stock levels. Service-business focus; only matters
  if they sell physical goods.
- Time tracking. Out of scope for the audience.

If you're planning the next iteration: **Tier 1 reports first** —
P&L + VAT + aged receivables alone close 80% of the "is this real
bookkeeping software" perception gap. Credit notes are the
next-most-impactful add after that.

**Status (2026-05-25):** P&L + VAT + aged receivables + aged payables
+ report PDF export shipped — see the Done bullets above. Next on
this track is **cash flow**, then sales-by-client / payroll register.

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
- **`tauri.conf.json` rejects unknown top-level fields.** JSON has no
  native comment syntax — don't add a `$comment` (or any other
  custom property) to `tauri.conf.json` / `tauri.<platform>.conf.json`
  to document something. Tauri's schema validator fails the build
  with `Additional properties are not allowed`. Put the explanation
  in code comments or the workflow file header instead.
- **iframe `contentWindow.print()` needs same-origin.** Binding an
  iframe directly to a Tauri `asset://` URL (from `convertFileSrc()`)
  means the iframe is cross-origin to the renderer, and any
  programmatic `print()` call is blocked by same-origin policy.
  Build a blob URL from the file's bytes (read via the fs plugin)
  and point the iframe at that — blob URLs inherit the renderer's
  origin. The `PdfPreviewModal` shows the pattern.
- **Tauri checkout actions need v5 for Node 24.** GitHub deprecated
  Node 20 on Actions in June 2026; `actions/checkout@v4` runs on
  Node 20 and will start warning. Use `@v5`. Other actions used
  here (`oven-sh/setup-bun@v2`, `Swatinem/rust-cache@v2`,
  `softprops/action-gh-release@v2`, `dtolnay/rust-toolchain@stable`)
  are already Node-24 compatible.

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
  `app/pages/payslips/index.vue` — `<ResizableDataTable>` with PrimeVue
  `<Column>` children, an `itemsFor(row)` callback feeding the row
  context menu and the optional ⋯ overflow, and synthetic `_…` fields
  on each row so by-field sorting matches the rendered cell.
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
