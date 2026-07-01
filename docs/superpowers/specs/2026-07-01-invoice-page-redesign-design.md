# Invoice detail page redesign — design

_2026-07-01_

## Problem

The invoice detail page (`app/pages/invoices/[id].vue`) is a long vertical
stack of ~7 cards (Bill to, Reference, Items, Totals & payments, Notes &
sign-off, Payments, Attachments). For a non-technical user it reads as
**clumsy**: the layout is **scattered** — the facts that matter (who, how
much, paid, balance, when due) are spread across several cards — and the
**money is hard to read** — totals/paid/balance are small text tucked in the
corner of the Totals card.

The same page serves two modes: an **editor** for drafts and a **read-only
view** once the invoice is issued.

Scope: **pure UI / layout. No data-model, store, or business-logic changes.**
The VAT-entry and bundle/itemized controls are NOT a pain point and keep
working exactly as they do today.

## Goals

1. **Group the scattered layout** into a clear "read this first" zone so the
   eye lands on the key facts immediately.
2. **Make the money legible** — Total / Paid / Balance shown big and clear.
3. Read well in **both** modes (draft editing and issued viewing) and at
   narrow widths.

## Approach (chosen: "summary hero on top")

Add a prominent summary hero at the top of the page and move the totals
*result* into it, leaving the amount *entry* controls where the user edits.

### 1. Summary hero (new)

A full-width band directly under the existing action toolbar, replacing
today's bare number/status header.

- **Left — identity:** invoice number (large) + `StatusBadge` + the existing
  "read-only after issue" hint when not editable; the **client name** (pulled
  up from the Bill-to snapshot); an "Issued `{issue_date}` · Due `{due_date}`"
  line. The due date renders in error tone when the invoice is overdue.
- **Right — money tiles:** big, legible readouts.
  - **Total** — always shown.
  - **Paid** — shown when `paidCents > 0`; success-green.
  - **Balance** — shown when `paidCents > 0`; emphasized, error tone when
    overdue.
  - **Overpaid by …** — shown instead of Balance when receipts exceed the
    total (mirrors today's warning state).
  - A draft with nothing paid shows just Total.

The tiles read from the **existing** computed values, so on a draft they
update live as the user edits the body below.

### 2. Body reorganization (below the hero)

- The **Totals & payments card's result readout moves into the hero.** What
  remains of that card — the amount *entry* block (subtotal `MoneyInput`,
  Before-VAT / VAT-inclusive switch, Charge VAT checkbox, VAT rate) — folds
  into the **Items** card as a compact footer, so "Items" owns amount entry
  end-to-end and the hero owns amount display. The standalone Totals card is
  removed (one fewer card).
- Everything else keeps its content, tidier: **Bill to + Reference**
  two-column row, **Notes & sign-off**, **Payments** (issued only),
  **Attachments**.
- Final order: toolbar → **summary hero** → conversion banner (if any) →
  Bill to + Reference → Items (+ amount-entry footer) → Notes & sign-off →
  Payments → Attachments.

### 3. Draft vs issued behaviour

- **Issued (read-only):** the hero is the star; body controls stay disabled
  as they already are; the amount-entry footer is hidden (nothing to edit) —
  the hero shows the frozen figures.
- **Draft (editable):** the user edits in the body; the hero totals update
  live from the reactive computeds.

## Components

- **`app/components/InvoiceSummaryHero.vue`** (new, presentational). Props:
  `number`, `status`, `clientName`, `issueDate`, `dueDate`, `totalCents`,
  `paidCents`, `balanceCents`, `overpaidCents`, `overdue: boolean`,
  `editable: boolean`. Renders the identity block + money tiles. No store
  access, no logic — the page feeds it display values. Keeps `[id].vue` from
  growing and is understandable in isolation.
- **`app/pages/invoices/[id].vue`** (restructured template only). The
  `<script>` is unchanged except for passing existing computeds to the hero;
  the VAT-entry markup moves from the Totals card into the Items card footer.

## Data flow

All hero inputs already exist on the page as computed refs — no new queries,
store methods, or columns:

- `invoice.number`, `status` (`derivedStatus`), `clientSnapshot?.name`
- `formIssueDate` / `formDueDate` (or `invoice.due_date`)
- `computedTotals.total`, `paidCents`, `balanceCents`, `overpaid` /
  `overpaymentCents`
- `overdue` derives from the existing `status === 'overdue'`.

## Testing

The hero is presentational (no pure logic), consistent with the codebase's
other display components (StatChip, StatusBadge, ConversionBanner) which are
not unit-tested — vitest runs in node and importing Vue UI adds no value here.
Verification is `bun run lint` + `bun run test` (existing suite stays green) +
`bun run generate` (full build) + manual QA of both modes and narrow widths.

## Out of scope

- No changes to totals math, VAT logic, pricing modes, payments/voucher flow,
  attachments, or any store/DB.
- The document-type color system (captured separately) is not part of this.
- Bills / quotes / other detail pages are untouched; if the hero proves out we
  can generalize it later, but this spec covers invoices only.
