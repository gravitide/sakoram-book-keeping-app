# Optional signature lines on the payslip PDF

**Date:** 2026-07-25
**Status:** Approved, ready for implementation

## Problem

`src-tauri/templates/payslip.typ` unconditionally renders a two-column
sign-off block at the foot of every payslip PDF:

```typst
#v(72pt)
#grid(
  columns: (1fr, 1fr),
  column-gutter: 60pt,
  [ #line(...) #faint("Authorised by") ],
  [ #line(...) #faint("Received by (employee)") ],
)
```

There is no flag controlling it — not on `company_settings`, not on
`payslips`, not in the JSON payload. A business that pays by bank
transfer and never collects a physical acknowledgement gets 72pt of
dead space plus two ruled lines it will never use.

## Goal

Make the sign-off block opt-in, **off by default**, controlled by one
business-wide setting.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Scope of the toggle | **Business-wide** (`company_settings`) | A business either wants sign-off lines on payslips or it doesn't — it is not a per-payslip decision. Keeps bulk PDF export homogeneous, and avoids fighting the "issued payslips are immutable" rule (a per-payslip flag would have to be locked in before issue). |
| Granularity | **One flag for both lines** | The two lines are a matched pair on a printed payslip. Splitting them buys a rare workflow at the cost of a second toggle. |
| Settings page | **`/settings/payroll`** | Payslip-specific. Every card on `/settings/pdf` (font, header logo, colour, templates, protection) is cross-document; every payslip knob (cycle, EPF/ETF, PAYE) already lives on the payroll page. |
| Default for existing tenants | **Off** | Matches the stated requirement. Accepted consequence below. |

### Accepted consequence

`DEFAULT 0` means existing businesses stop printing sign-off lines the
moment they upgrade, including on re-rendered PDFs of already-issued
payslips. This is intentional — the feature was requested as
"optional, by default off" — and acceptable pre-1.0. Users who want the
lines flip one switch on `/settings/payroll`.

Note this does not mutate any stored document: payslip PDFs are
rendered on demand and never archived, so nothing historical is
rewritten. Only future renders change.

## Changes

### 1. Migration — `src-tauri/migrations/0049_payslip_signatures.sql`

```sql
ALTER TABLE company_settings
  ADD COLUMN payslip_show_signatures INTEGER NOT NULL DEFAULT 0;
```

- Register the file in the `MIGRATIONS` array in
  `src-tauri/src/tenants.rs` (the SQL is `include_str!`'d — a file on
  disk alone never runs).
- Bump `SCHEMA_VERSION` 48 → 49 in `src-tauri/src/data_io.rs`.
- No `TABLES` change: `company_settings` is already exported, and
  `data_io.rs` discovers columns via `PRAGMA table_info`, so the new
  column flows into export/import automatically.

### 2. Settings store — `app/stores/settings.ts`

- Add `payslip_show_signatures: number` to `CompanySettingsRow`.
- Append `"payslip_show_signatures"` to the updatable-column list
  (around line 122, beside `statutory_auto_compute` /
  `paye_auto_compute`).

### 3. Settings UI — `app/pages/settings/payroll.vue`

New `<UCard id="signatures" class="scroll-mt-6">` following the shape
of the existing `#cycle` / `#statutory` / `#paye` cards. One switch:

- **Label:** Signature lines on payslip PDFs
- **Help text:** Prints "Authorised by" and "Received by (employee)"
  lines at the foot of every payslip PDF.
- Default off.

Wired through the page's existing dirty-tracking + sticky save bar —
no new save plumbing.

### 4. PDF payload — `app/lib/payslip-pdf.ts`

Add one field to the returned object:

```ts
show_signatures: (settings?.payslip_show_signatures ?? 0) === 1,
```

Both callers (the payslip detail page and the list-row Generate PDF
action, including bulk export) already route through
`buildPayslipPdfPayload`, so all three paths are covered by this single
edit.

### 5. Template — `src-tauri/templates/payslip.typ`

Wrap lines 286–300 — the `#v(72pt)` lead-in **and** the grid — in:

```typst
#if data.show_signatures == true [
  ...
]
```

Mirrors the established boolean pattern at line 228
(`#if data.statutory_enabled == true and ...`). Including the `#v(72pt)`
inside the conditional is deliberate: with signatures off, the page
should end after the notes block rather than trailing an inch of
whitespace.

## Testing

No new unit tests. `buildPayslipPdfPayload` is a pure transformation
but has no existing test file, and the change is a single passthrough
field — a test asserting `show_signatures === false` when the setting
is 0 would only restate the line of code.

Verification is manual, via `bun run tauri:dev`:

1. Fresh/default settings → generate a payslip PDF → sign-off block
   absent, page ends after notes with no trailing gap.
2. Flip the switch on `/settings/payroll`, save, regenerate → both
   lines present with the 72pt lead-in, identical to today's output.
3. List-row Generate PDF and bulk PDF export honour the setting
   (same builder, so this is a smoke check).
4. `bun run lint` and `bun run test` pass.

## Out of scope

- Per-payslip override.
- Independent control of the two lines.
- Customising the signature labels ("Authorised by" / "Received by").
- Sign-off blocks on other document templates (`document.typ`,
  `voucher.typ`) — those are untouched.
