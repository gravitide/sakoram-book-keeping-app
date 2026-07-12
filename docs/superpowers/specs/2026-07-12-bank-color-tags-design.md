# Bank account colour tags — design

**Date:** 2026-07-12
**Status:** Approved

## Problem

A business with multiple bank accounts (e.g. "HNB Company A/C" and "HNB
Personal A/C") has to *read* the label everywhere a bank appears —
vouchers list, bank pickers, reconcile. A small predefined colour
marker in front of the bank identity makes the account recognisable at
a glance.

## Decision summary

- `business_banks` gains a `color` column holding one of the **same 8
  predefined swatches bill categories use** (`THEME_COLORS` in
  `app/lib/theme.ts`, resolved via `themeHex()`).
- **Auto-assign on migration**: existing banks get distinct swatches by
  id order (`CASE id % 8`), so markers are useful with zero setup. New
  banks pre-select the least-used swatch in the form.
- A tiny shared **`BankColorDot.vue`** renders the marker identically
  everywhere (coloured round dot; grey fallback for unknown/null).
- Surfaces: settings bank list, vouchers list bank line (replaces the
  landmark icon), bank pickers on quote/invoice detail + new-voucher
  form, voucher detail bank field, reconcile page bank selector.

## Schema

Migration `0048_bank_colors.sql` (register in `MIGRATIONS`,
`SCHEMA_VERSION` → 48):

```sql
ALTER TABLE business_banks ADD COLUMN color TEXT NOT NULL DEFAULT 'green';

UPDATE business_banks SET color = CASE (id % 8)
	WHEN 0 THEN 'red'
	WHEN 1 THEN 'green'
	WHEN 2 THEN 'sky'
	WHEN 3 THEN 'amber'
	WHEN 4 THEN 'violet'
	WHEN 5 THEN 'orange'
	WHEN 6 THEN 'emerald'
	WHEN 7 THEN 'blue'
END;
```

(id % 8 spreads sequentially-created banks across visually distinct
neighbours; the WHEN order interleaves hue families so banks 1 and 2 —
the common case — land on green vs sky, not two greens.)

Export/import needs no edit: `data_io.rs` discovers columns via
`PRAGMA table_info`.

## Frontend

- **Store** (`business_banks.ts`): `color: string` on `BusinessBankRow`;
  `color` added to `BusinessBankInput` + `UPSERTABLE_COLUMNS`.
- **`BankColorDot.vue`**: props `{ color?: string | null }`; renders an
  inline `size-2 rounded-full shrink-0` span with
  `background-color: themeHex(color)`; `#9ca3af` grey when the name is
  unknown. Optional `size` prop not needed (YAGNI — one size).
- **`BusinessBankFormModal.vue`**: 8-swatch click row (same markup
  pattern as `CategoryFormModal`); editing hydrates the bank's colour;
  creating pre-selects the least-used swatch across current banks.
- **Surfaces**:
  - `settings/company.vue` bank list: dot before each label.
  - `vouchers/index.vue`: the bank line under Method uses the dot
    instead of `i-lucide-landmark`.
  - Quote / invoice detail bank `USelect` + new-voucher + voucher
    detail bank selects: dot on the selected value (`#leading` slot)
    and per option (item-leading slot); option objects carry `color`.
  - `reconcile.vue` bank selector: same treatment.

## Out of scope

- Colour on the PDF bank block (screen-only affordance).
- Free-hex colour picking (predefined swatches only, like categories).

## Testing

No new unit tests — no new pure logic (`themeHex` is already covered by
usage; the auto-assign is SQL). Hands-on in `tauri:dev`: migration
assigns two different dots to the two existing HNB accounts; edit a
bank → change colour → vouchers list + pickers update; create a third
bank → distinct default colour offered.

## Versioning

Minor bump → `0.147.0`.
