# Optional Payslip PDF Signature Lines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two-column sign-off block on the payslip PDF opt-in via one business-wide setting, off by default.

**Architecture:** A single `INTEGER NOT NULL DEFAULT 0` column on `company_settings`, surfaced as one switch on `/settings/payroll`, threaded into the payslip PDF JSON payload by the shared builder, and read by a `#if` in the Typst template. No per-payslip state, no new tables, no new Tauri command.

**Tech Stack:** SQLite (sqlx migrations run from Rust), Pinia settings store, Nuxt 4 / NuxtUI 4 (`USwitch`, `UCard`), Typst template.

**Spec:** `docs/superpowers/specs/2026-07-25-payslip-pdf-optional-signatures-design.md`

## Global Constraints

- Package manager is **bun** only (`bun run lint`, `bun run test`). npm/yarn/pnpm are blocked by a `preinstall` hook.
- Shell is **bash on Windows** (Git Bash).
- Branch is already created: `feat/payslip-optional-signatures`. Do not work on `main`.
- **Do not add a Claude Code footer to commit messages.**
- Do not push or open a PR without explicit user confirmation.
- A migration file on disk does nothing until it is added to the `MIGRATIONS` array in `src-tauri/src/tenants.rs` — the SQL is `include_str!`'d.
- Every schema change bumps `SCHEMA_VERSION` in `src-tauri/src/data_io.rs`.
- Version bump on every PR; pre-1.0 a feature is a **minor** bump. Current version is `0.148.2` → target `0.149.0`, kept in sync across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.lock`.
- New setting column name, used verbatim everywhere: **`payslip_show_signatures`**.
- New PDF payload field name, used verbatim: **`show_signatures`**.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src-tauri/migrations/0049_payslip_signatures.sql` | Create | Adds the column |
| `src-tauri/src/tenants.rs` | Modify (~line 105) | Registers the migration so it actually runs |
| `src-tauri/src/data_io.rs` | Modify (line 56) | `SCHEMA_VERSION` 48 → 49 so backups stay version-aligned |
| `app/stores/settings.ts` | Modify (~line 85 and ~line 130) | Row type + updatable-column allowlist |
| `app/pages/settings/payroll.vue` | Modify | The switch, plus its dirty/save/reset wiring |
| `app/lib/payslip-pdf.ts` | Modify (~line 92) | Threads the setting into the PDF payload |
| `src-tauri/templates/payslip.typ` | Modify (lines 281–301) | Conditionally renders the sign-off block |
| `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` | Modify | Version bump |

**No new test files.** Per the approved spec: `buildPayslipPdfPayload` has no existing test file, and this change is a single passthrough field — a unit test would restate the line of code. Verification is manual and specified in Task 4.

---

### Task 1: Schema — add the column

**Files:**
- Create: `src-tauri/migrations/0049_payslip_signatures.sql`
- Modify: `src-tauri/src/tenants.rs:105` (append to `MIGRATIONS`)
- Modify: `src-tauri/src/data_io.rs:56` (`SCHEMA_VERSION`)

**Interfaces:**
- Consumes: nothing.
- Produces: `company_settings.payslip_show_signatures` — `INTEGER NOT NULL DEFAULT 0`. Task 2 reads this column name.

- [ ] **Step 1: Create the migration file**

Create `src-tauri/migrations/0049_payslip_signatures.sql`:

```sql
-- Optional signature lines on the payslip PDF.
--
-- payslip.typ used to render an unconditional two-column sign-off
-- ("Authorised by" / "Received by (employee)") plus a 72pt lead-in at the
-- foot of every payslip. A business that pays by bank transfer and never
-- collects a physical acknowledgement got two ruled lines it never used.
--
-- Business-wide rather than per-payslip: a business either wants sign-off
-- lines or it doesn't, and a per-payslip flag would fight the
-- issued-payslips-are-immutable rule plus make bulk PDF export
-- inhomogeneous. Defaults OFF, so existing tenants stop printing the block
-- until they opt in on /settings/payroll.

ALTER TABLE company_settings
	ADD COLUMN payslip_show_signatures INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Register the migration**

In `src-tauri/src/tenants.rs`, find the `MIGRATIONS` array entry for 48:

```rust
	(48, "bank colors", include_str!("../migrations/0048_bank_colors.sql")),
```

Add directly below it:

```rust
	(49, "payslip signatures", include_str!("../migrations/0049_payslip_signatures.sql")),
```

- [ ] **Step 3: Bump SCHEMA_VERSION**

In `src-tauri/src/data_io.rs` line 56, change:

```rust
pub const SCHEMA_VERSION: i32 = 48;
```

to:

```rust
pub const SCHEMA_VERSION: i32 = 49;
```

Do **not** touch the `TABLES` list — `company_settings` is already exported and `data_io.rs` discovers columns via `PRAGMA table_info`, so the new column flows into export/import automatically.

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: `Finished` with no errors.

If you see `Blocking waiting for file lock on build directory`, a `tauri:dev` session is already running — wait for it, don't kill it.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/migrations/0049_payslip_signatures.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs
git commit -m "feat: add payslip_show_signatures column (migration 0049)"
```

---

### Task 2: Settings store + settings UI

**Files:**
- Modify: `app/stores/settings.ts` (`CompanySettingsRow` type, `UPDATABLE_COLUMNS`)
- Modify: `app/pages/settings/payroll.vue` (new card + state + dirty + save + reset)

**Interfaces:**
- Consumes: `company_settings.payslip_show_signatures` from Task 1.
- Produces: `CompanySettingsRow.payslip_show_signatures: number` — 0 or 1. Task 3 reads this property off the settings row.

- [ ] **Step 1: Add the field to the row type**

In `app/stores/settings.ts`, find the letter-margin fields near the end of `CompanySettingsRow`:

```ts
	letter_preprinted_top_margin_mm: number
	letter_preprinted_bottom_margin_mm: number
	updated_at: string
}
```

Insert the new field with its comment before `updated_at`:

```ts
	letter_preprinted_top_margin_mm: number
	letter_preprinted_bottom_margin_mm: number
	// Opt-in sign-off block on the payslip PDF ("Authorised by" / "Received
	// by (employee)"). 0/1, defaults 0. Read by app/lib/payslip-pdf.ts and
	// rendered by src-tauri/templates/payslip.typ.
	payslip_show_signatures: number
	updated_at: string
}
```

- [ ] **Step 2: Add it to the updatable-column allowlist**

Still in `app/stores/settings.ts`, find the tail of `UPDATABLE_COLUMNS` (around line 136):

```ts
	"letter_preprinted_top_margin_mm",
	"letter_preprinted_bottom_margin_mm"
];
```

Replace with — note the last entry currently has **no trailing comma**, so you must add one:

```ts
	"letter_preprinted_top_margin_mm",
	"letter_preprinted_bottom_margin_mm",
	"payslip_show_signatures"
];
```

A column missing from this list is silently dropped on save — this step is what makes the switch persist.

- [ ] **Step 3: Add the card to the payroll settings page**

In `app/pages/settings/payroll.vue`, after the closing `</UCard>` of the `id="paye"` card, add:

```vue
			<UCard id="signatures" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Payslip PDF signatures
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Controls the sign-off block at the foot of every payslip PDF.
					</div>
				</template>

				<div class="flex items-start justify-between gap-4">
					<div class="text-sm">
						<div class="font-medium">
							Print signature lines
						</div>
						<div class="text-xs text-(--ui-text-muted) mt-1">
							Adds "Authorised by" and "Received by (employee)" ruled lines at
							the foot of the page. Leave off if you pay by bank transfer and
							don't collect a signed acknowledgement.
						</div>
					</div>
					<USwitch v-model="signaturesOn" />
				</div>
			</UCard>
```

- [ ] **Step 4: Add the reactive state**

In the same file's `<script setup>`, after the statutory refs (around line 241, following `const etfPct = ...`), add:

```ts
	// Sign-off block on the payslip PDF. Off by default — see
	// migration 0049 and src-tauri/templates/payslip.typ.
	const signaturesOn = ref<boolean>((store.settings?.payslip_show_signatures ?? 0) === 1);
```

Note the `?? 0` default — unlike `statutoryOn`, which defaults on with `?? 1`.

- [ ] **Step 5: Wire it into initial / dirty / save / reset**

Four edits in the same file. All four are required — miss one and the switch either never enables the save button or silently reverts.

In the `const initial = ref({` object (around line 313), add a `signatures` key:

```ts
		payeBrackets: payeBracketsJson(),
		signatures: signaturesOn.value
	});
```

In the `dirty` computed (around line 327), add a final clause:

```ts
		|| payeBracketsJson() !== initial.value.payeBrackets
		|| signaturesOn.value !== initial.value.signatures
	);
```

In `onSave`'s `store.save({ … })` call, add the column:

```ts
				paye_brackets: payeBracketsJson(),
				payslip_show_signatures: signaturesOn.value ? 1 : 0
			});
```

...and in the `initial.value = { … }` reassignment immediately after it:

```ts
				payeBrackets: payeBracketsJson(),
				signatures: signaturesOn.value
			};
```

In `reset`, add the restore line:

```ts
		payeBands.value = parsePayeBands(initial.value.payeBrackets);
		signaturesOn.value = initial.value.signatures;
	};
```

- [ ] **Step 6: Lint**

Run: `bun run lint`
Expected: exits 0. This project uses tabs and a strict eslint config; `lint` auto-fixes most formatting.

- [ ] **Step 7: Commit**

```bash
git add app/stores/settings.ts app/pages/settings/payroll.vue
git commit -m "feat: payslip signature toggle on payroll settings"
```

---

### Task 3: PDF payload + Typst template

**Files:**
- Modify: `app/lib/payslip-pdf.ts` (~line 92, inside the returned object)
- Modify: `src-tauri/templates/payslip.typ:281-301`

**Interfaces:**
- Consumes: `CompanySettingsRow.payslip_show_signatures` from Task 2.
- Produces: `show_signatures: boolean` on the payslip PDF payload, read as `data.show_signatures` by the template.

- [ ] **Step 1: Add the payload field**

In `app/lib/payslip-pdf.ts`, in the returned object, find:

```ts
		notes: row.notes,
		business_name: settings?.business_name ?? null,
```

Insert the new field before `notes`:

```ts
		show_signatures: (settings?.payslip_show_signatures ?? 0) === 1,
		notes: row.notes,
		business_name: settings?.business_name ?? null,
```

Both the payslip detail page and the list-row / bulk Generate-PDF actions route through `buildPayslipPdfPayload`, so this one edit covers every render path.

- [ ] **Step 2: Make the template block conditional**

In `src-tauri/templates/payslip.typ`, replace the whole tail of the file (lines 281–301) — currently:

```typst
// ============================================================
// Sign-off (two columns)
// ============================================================
// Generous lead-in so the signature lines have actual writing room
// above them on a printed copy.
#v(72pt)
#grid(
  columns: (1fr, 1fr),
  column-gutter: 60pt,
  [
    #line(length: 80%, stroke: 0.5pt + rgb("#9ca3af"))
    #v(2pt)
    #faint("Authorised by")
  ],
  [
    #line(length: 80%, stroke: 0.5pt + rgb("#9ca3af"))
    #v(2pt)
    #faint("Received by (employee)")
  ],
)
```

...with:

```typst
// ============================================================
// Sign-off (two columns) — opt-in
// ============================================================
// Off by default, driven by company_settings.payslip_show_signatures
// (migration 0049). The 72pt lead-in sits INSIDE the conditional on
// purpose: with signatures off the page should end after the notes
// block rather than trailing an inch of whitespace.
#if data.show_signatures == true [
  // Generous lead-in so the signature lines have actual writing room
  // above them on a printed copy.
  #v(72pt)
  #grid(
    columns: (1fr, 1fr),
    column-gutter: 60pt,
    [
      #line(length: 80%, stroke: 0.5pt + rgb("#9ca3af"))
      #v(2pt)
      #faint("Authorised by")
    ],
    [
      #line(length: 80%, stroke: 0.5pt + rgb("#9ca3af"))
      #v(2pt)
      #faint("Received by (employee)")
    ],
  )
]
```

The `== true` comparison mirrors the existing boolean pattern at line 228 (`#if data.statutory_enabled == true and ...`). Note the template uses **2-space indentation**, unlike the tab-indented TypeScript.

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add app/lib/payslip-pdf.ts src-tauri/templates/payslip.typ
git commit -m "feat: render payslip PDF sign-off block only when enabled"
```

---

### Task 4: Version bump + end-to-end verification

**Files:**
- Modify: `package.json:4`, `src-tauri/Cargo.toml:8`, `src-tauri/tauri.conf.json:35`
- Modify: `src-tauri/Cargo.lock` (picked up automatically by cargo)

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: nothing — this is the verification gate.

- [ ] **Step 1: Bump the version in all three files**

`0.148.2` → `0.149.0` (minor: this is a feature).

- `package.json` line 4: `"version": "0.149.0",`
- `src-tauri/Cargo.toml` line 8: `version = "0.149.0"`
- `src-tauri/tauri.conf.json` line 35: `"version": "0.149.0",`

- [ ] **Step 2: Refresh Cargo.lock**

Run: `cd src-tauri && cargo check`
Expected: `Finished`. This rewrites the `sakoram_billing` version line in `Cargo.lock`.

Confirm with: `grep -A1 'name = "sakoram_billing"' src-tauri/Cargo.lock`
Expected: `version = "0.149.0"`.

- [ ] **Step 3: Run the automated gates**

```bash
bun run lint
```
Expected: exits 0.

```bash
bun run test
```
Expected: all vitest suites pass. No new tests were added; this confirms nothing regressed.

- [ ] **Step 4: Manual verification in the running app**

Start the app: `bun run tauri:dev` (exit code 255 on window close is normal, not an error).

Check each of these against a business that has at least one payslip:

1. **Default is off.** Open any payslip → **PDF & Print**. The sign-off block is absent and the page ends after the notes block with no trailing whitespace gap.
2. **The switch persists.** Go to `/settings/payroll` → the new **Payslip PDF signatures** card → turn *Print signature lines* on → Save. Navigate away and back; the switch is still on.
3. **On restores the old output.** Regenerate the same payslip PDF. Both ruled lines are present with the 72pt lead-in — visually identical to the pre-change output.
4. **List row honours it.** From `/payslips`, right-click a row → Generate PDF. Matches the current setting.
5. **Bulk export honours it.** Multi-select two payslips → bulk PDF export → both files match the current setting.
6. **Reset works.** Toggle the switch, then click Discard on the sticky save bar. The switch snaps back and the save bar fades.

- [ ] **Step 5: Commit**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "chore: bump version to 0.149.0"
```

- [ ] **Step 6: Report and stop**

Summarise what shipped and the verification results. **Do not push and do not open a PR** — wait for explicit user confirmation.

---

## Documentation follow-up

`CLAUDE.md` carries a migrations table that lists every migration with a one-line summary. After Task 1 lands, add a row to it:

```
0049_payslip_signatures.sql             ← `company_settings.payslip_show_signatures` (INTEGER, default 0) — opt-in two-column sign-off block ("Authorised by" / "Received by (employee)") at the foot of the payslip PDF. Off by default; the 72pt lead-in is inside the conditional so the page ends cleanly after notes when disabled. Toggle on /settings/payroll. SCHEMA_VERSION → 49.
```

Fold this into the Task 3 commit or make it a separate `docs:` commit — either is fine, but do not skip it. The table is the authoritative human-readable migration index.
