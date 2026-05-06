# Sakoram Book Keeping — handoff notes

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

## Golden rules

These are invariants, not guidelines. Breaking them silently corrupts
data.

1. **Money is integer cents of LKR. Never floats.** Always store and
   compute in cents. Use `formatLKR()` and `toCents()` from
   `app/lib/money.ts`. Banker's (half-even) rounding.

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

8. **Currency is LKR-only.** No multi-currency support. Fiscal year
   defaults to April→March (Sri Lanka government FY).

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
  └─ logos\
      └─ {tenant_id}.{ext}     ← one logo file per business
```

`tenant.id` doubles as the **slug** and the **filename stem** for both
the DB and the logo. It's stable: renaming a tenant changes
`tenant.name` only — the slug, DB filename, and logo filename stay put
so we don't have to move files around on rename.

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
│  ├─ pages/
│  │  ├─ index.vue                    ← Dashboard (KPI tiles + recent activity)
│  │  ├─ welcome.vue                  ← business picker (landing screen)
│  │  ├─ clients/                     ← list, new, [id]
│  │  ├─ quotes/                      ← list, new, [id] (PDF preview, convert to invoice)
│  │  ├─ invoices/                    ← list, new, [id] (PDF preview, payment ledger)
│  │  ├─ bills/                       ← list, new, [id] (vendor bills, no draft state)
│  │  ├─ vouchers/                    ← list, new, [id] (money in/out)
│  │  └─ settings/
│  │     ├─ index.vue                 ← redirect to /settings/company
│  │     ├─ company.vue               ← business info, address, bank, defaults, logo
│  │     ├─ appearance.vue            ← UI font (free-text), theme color (8-swatch)
│  │     └─ businesses.vue            ← tenant CRUD + Export/Import
│  ├─ components/
│  │  ├─ ClientPicker.vue             ← UPopover with search
│  │  ├─ DateField.vue                ← UInputDate + UCalendar wrapper, ISO-string v-model
│  │  ├─ DocumentLineEditor.vue       ← bundle/itemized line-item editor
│  │  ├─ MoneyInput.vue               ← integer-cents v-model
│  │  ├─ PaymentRecorder.vue          ← invoice payment modal
│  │  ├─ PdfPreviewModal.vue          ← embeds rendered PDF in <iframe>
│  │  └─ StatusBadge.vue              ← color-coded status badges
│  ├─ composables/
│  │  └─ usePdfPreview.ts             ← preview→commit flow used by quote/invoice/bill/voucher pages
│  ├─ lib/
│  │  ├─ db.ts                        ← getDb() (lazy, reads active tenant URL), select/execute
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
│     ├─ quotes.ts                    ← quotes + quote_lines, status FSM, pricing modes
│     ├─ invoices.ts                  ← invoices + invoice_lines + invoice_payments (ledger)
│     ├─ bills.ts                     ← vendor bills, no per-payment ledger (just paid_cents)
│     ├─ vouchers.ts                  ← receipts/payments
│     └─ tenants.ts                   ← bridges JS to Rust tenant registry
└─ src-tauri/
   ├─ Cargo.toml                      ← Rust deps (tauri 2.10, sqlx 0.8, zip 2)
   ├─ tauri.conf.json                 ← productName, identifier, sidecars, capabilities
   ├─ capabilities/
   │  └─ main.json                    ← fs scopes, sql, dialog, shell-execute (typst arg validators)
   ├─ binaries/
   │  └─ typst-x86_64-pc-windows-msvc.exe   (gitignored, ~48 MB, target-triple naming required)
   ├─ fonts/
   │  └─ MiriamLibre-{Regular,Bold}.ttf     (bundled into installer)
   ├─ migrations/
   │  ├─ 0001_initial.sql             ← settings, clients, document_counters
   │  ├─ 0002_documents.sql           ← quotes, invoices, payments
   │  ├─ 0003_bills_vouchers.sql      ← bills, vouchers + their line tables
   │  └─ 0004_appearance.sql          ← ui_font, theme_color on company_settings
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
  ├─ msi/Sakoram Book Keeping_0.9.0_x64_en-US.msi
  └─ nsis/Sakoram Book Keeping_0.9.0_x64-setup.exe
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

---

## Schema overview

See `src-tauri/migrations/` for the source of truth. High-level:

- `company_settings` — singleton (`id=1` CHECK), per-tenant. Includes
  `ui_font` and `theme_color` for the appearance settings.
- `clients` — id, name, contact info, archived flag.
- `document_counters` — `(document_type, fiscal_year)` → `last_number`,
  for atomic gapless allocation.
- `quotes` + `quote_lines` — `pricing_mode` ∈ {bundle, itemized},
  `status` FSM, `client_snapshot` (JSON), `bank_details_snapshot`
  (JSON, frozen at issue), `converted_invoice_id` link.
- `invoices` + `invoice_lines` + `invoice_payments` — full payment
  ledger (Date, method, amount, reference, notes).
- `bills` + `bill_lines` — vendor bills. NO ledger; just `paid_cents`
  on the row. If user wants per-payment trail, they create a voucher.
- `vouchers` — money in (receipt) / money out (payment). Standalone or
  optionally linked to an invoice/bill.

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

invoices:  draft → sent → partial | paid | overdue | cancelled
           overdue ↔ partial → paid

bills:     unpaid → partial | paid | overdue | cancelled
           (no draft — bills come from outside)

vouchers:  no transitions; voucher_type (receipt/payment) is locked at create
```

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

### Phases 1–7 — DONE

- ✅ DB schema, migrations, foundations
- ✅ Clients CRUD
- ✅ Quotes (full lifecycle, PDF, convert-to-invoice)
- ✅ Invoices (lifecycle, payment ledger, auto-overdue, PDF)
- ✅ Bills (vendor invoices, payments, PDF)
- ✅ Vouchers (money in/out, PDF, big amount card layout)
- ✅ Dashboard (KPI tiles, recent activity, overdue list, quick actions)
- ✅ PDF generation via bundled Typst sidecar (Miriam Libre font,
  Gravitide-style layout, theme color from settings)
- ✅ PDF preview modal (iframe-embedded, save-as via temp file copy)
- ✅ Settings split: `/settings/company`, `/settings/appearance`,
  `/settings/businesses`
- ✅ Appearance: free-text font picker, 8-color theme palette (drives
  both UI and PDFs)
- ✅ DateField (UInputDate + UCalendar wrapper, ISO v-model)
- ✅ Multi-tenancy (DB-per-business, welcome screen, tenant switcher)
- ✅ Export/Import (.zip bundles with manifest, schema-version gate)
- ✅ Window title syncs with active tenant
- ✅ Production build pipeline (MSI + NSIS installers via
  `bun run tauri:build`)

### Deferred / open items

- **Bill/voucher attachment upload UI** — `attachment_path` columns
  exist on the schema; no UI yet. Intent: drop a PDF/image of the
  vendor's bill onto the bill page → stored in app data → openable
  from the detail page.
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
- User email: `saravanamuthaly@gmail.com`.
- Today's date as of writing: 2026-05-06.

The project itself doesn't enforce a commit-message format — match the
existing `git log` style if making commits.
