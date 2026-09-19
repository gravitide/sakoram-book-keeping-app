<h1 align="center">Sakoram — The desktop bookkeeper!</h1>

<p align="center">
	<img src="./docs/sakroam-text-logo.svg" alt="Sakoram brand wordmark" width="420">
</p>

<p align="center">
	A fast, offline-first desktop bookkeeping app for small Sri Lankan businesses.<br/>
	Manage clients, quotes, invoices, bills, and vouchers — and produce
	professional PDFs — all from a single local SQLite file.
</p>

<p align="center">
	<img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2" />
	<img src="https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white" alt="Nuxt 4" />
	<img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
	<img src="https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
	<img src="https://img.shields.io/badge/PDF-Typst-239DAD" alt="Typst" />
	<img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="GPL-3.0 license" />
</p>

---

## ✨ Features

- **Clients** — full CRUD with archived state, contact info, and search.
- **Quotations** — draftable line-item editor (bundle or itemized pricing),
  status FSM (`draft → sent → accepted → converted`), one-click conversion
  to invoice.
- **Invoices** — issue, track, and record payments via a full per-invoice
  payment ledger (date, method, reference, notes). Auto-overdue handling.
- **Bills** — log vendor invoices with simple paid/unpaid tracking.
- **Vouchers** — money-in (receipts) and money-out (payments), optionally
  linked to an invoice or bill.
- **Professional PDFs** — rendered with [Typst](https://typst.app) using a
  bundled sidecar binary. Ships with the **Miriam Libre** font for
  consistent typography across machines.
- **Theme & font customization** — pick from an 8-color theme palette and
  set a custom UI font; both apply to the app *and* generated PDFs.
- **Multi-tenant** — manage multiple businesses, each in its own isolated
  SQLite file. Switch between them from the header.
- **Export / Import** — one-click `.zip` backup of any business
  (database + logo + manifest), restorable on the same or another
  machine.
- **Sri Lanka–first defaults** — LKR currency, April–March fiscal year,
  integer-cents money math (no float drift, banker's rounding).
- **Offline by default** — no servers, no accounts, no telemetry. The only
  network feature is the optional Google Drive backup, which you switch on
  yourself and which writes to *your own* Drive.

## 🛠 Tech stack

| Layer            | Choice                                                      |
| ---------------- | ----------------------------------------------------------- |
| Desktop shell    | [Tauri 2](https://v2.tauri.app) (Rust)                      |
| Frontend         | [Nuxt 4](https://nuxt.com) — SSG (`ssr: false`)             |
| UI               | [NuxtUI 4](https://ui.nuxt.com) + [Tailwind CSS 4](https://tailwindcss.com) |
| Language         | TypeScript (strict)                                         |
| State management | [Pinia](https://pinia.vuejs.org) (composition stores)       |
| Validation       | [Zod](https://zod.dev)                                      |
| Database         | SQLite via `tauri-plugin-sql` (sqlx 0.8 underneath)         |
| PDF engine       | [Typst](https://typst.app) sidecar binary                   |
| Testing          | [Vitest](https://vitest.dev)                                |
| Package manager  | [Bun](https://bun.sh) (enforced via `preinstall` hook)      |

## 📁 Where your data lives

Each business is a separate SQLite file under your OS app-data directory:

```
%APPDATA%\com.sakoram.billing\        (Windows)
~/Library/Application Support/com.sakoram.billing/   (macOS)
  ├─ tenants.json          # registry of businesses
  ├─ businesses/
  │   └─ {tenant_id}.db    # one SQLite file per business
  └─ logos/
      └─ {tenant_id}.{ext} # one logo per business
```

This means **backups are file-level** — exporting a business is just
zipping its SQLite + logo. Switching businesses is a context change, not
a database query filter.

## 🚀 Getting started

### Prerequisites

- [Bun](https://bun.sh) (required — npm/yarn/pnpm are blocked)
- [Rust toolchain](https://www.rust-lang.org/tools/install) — see the
  [Tauri prerequisites](https://tauri.app/start/prerequisites/) for
  platform-specific deps (Visual Studio Build Tools on Windows, Xcode on
  macOS, etc.)

### Run in development

```bash
# install dependencies
bun install

# launch the app with hot reload (Rust + Vite + Webview)
bun run tauri:dev
```

### Build production installers

```bash
bun run tauri:build
```

Outputs Windows installers to:

```
src-tauri/target/release/bundle/
  ├─ msi/Sakoram_<version>_x64_en-US.msi
  └─ nsis/Sakoram_<version>_x64-setup.exe
```

> ⚠️ The build is currently **unsigned**, so Windows SmartScreen will
> warn on first run. Code-signing requires a CA certificate.

### Quality gates

```bash
bun run lint     # eslint --fix
bun run test     # vitest run
```

## 🧭 Architecture highlights

A few load-bearing decisions worth knowing:

- **Money is integer cents.** All money math uses integer cents of LKR
  with banker's (half-even) rounding — no floats, ever. See
  `app/lib/money.ts`.
- **Issued documents are immutable.** Once a quote/invoice is `sent`,
  totals are frozen. Client info is snapshotted as JSON at issue time
  so historical documents don't change when a client is later edited.
- **Document numbering is atomic and gapless.** Implemented as a single
  `INSERT … ON CONFLICT … DO UPDATE … RETURNING` per
  `(document_type, fiscal_year)` — see `app/lib/numbering.ts`.
- **DB-per-business.** Each tenant is a complete SQLite file rather than
  a `business_id` column. Simpler queries, cleaner backups, naturally
  isolated number sequences.

For a deeper tour of the codebase (state machines, capability layer,
PDF render pipeline, gotchas), see [`CLAUDE.md`](./CLAUDE.md) — the
project handoff doc.

## 🗺 Project layout

```
sakoram_app/
├─ app/                  # Nuxt frontend (pages, components, stores, libs)
├─ src-tauri/
│  ├─ src/               # Rust backend (commands, tenant registry, PDF)
│  ├─ migrations/        # SQL schema, applied per-DB on tenant init
│  ├─ templates/         # Typst PDF templates
│  ├─ binaries/          # Bundled Typst sidecar (gitignored, ~48 MB)
│  ├─ fonts/             # Bundled Miriam Libre fonts
│  └─ icons/             # App icons
├─ tests/                # Vitest specs (money math, numbering)
└─ CLAUDE.md             # detailed handoff / architecture notes
```

## 📜 License

Copyright © 2026 [Gravitide](https://gravitide.dev) · <hello@gravitide.com>

Sakoram is **free software** under the [GNU General Public License v3](./LICENSE)
(`GPL-3.0-only`). In short:

- **Use it for anything**, including running a business's books — free of charge.
- **Study, change and share it.** If you distribute it, changed or not, you must
  pass on the same freedoms and publish the complete source of what you ship
  under the GPL v3. A closed or proprietary version is not allowed.
- **No warranty.** It is provided "as is"; Gravitide is not liable for any loss
  arising from its use.
- **The name and logo are not part of the licence.** "Sakoram" and its logos are
  trademarks of Gravitide — a fork must use its own name and branding. See
  [`TRADEMARKS.md`](./TRADEMARKS.md).

Third-party notices — the Nuxtor project template (MIT), the bundled fonts (SIL
OFL), Typst (Apache-2.0) and the libraries — are in [`NOTICE.md`](./NOTICE.md).
