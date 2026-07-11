# Revert Converted Quote to Draft — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Revert to draft" action on a converted quote's detail page that deletes the linked invoice and returns the quote to editable `draft` status, refused while the invoice has recorded payments.

**Architecture:** One compound store method `revertConversion(quoteId)` on the quotes store (inverse of the existing `markConverted`), reusing `invoicesStore.remove()` for the invoice deletion. UI is a header button + ⋯ dropdown entry + confirm modal on `app/pages/quotes/[id].vue`. No schema change, no Rust change.

**Tech Stack:** Nuxt 4 / Vue 3 / Pinia composition stores / NuxtUI 4 / SQLite via `~/lib/db`.

**Spec:** `docs/superpowers/specs/2026-07-11-quote-revert-conversion-design.md`

## Global Constraints

- Money never touched silently: revert throws while receipt vouchers are linked to the invoice.
- Sequential single-statement auto-commits only — no `BEGIN`/`COMMIT` from JS (connection-pool caveat).
- Invoice is deleted **before** the quote flips to draft; the guard treats `converted` + null link as "just flip to draft" so a crash mid-way is recoverable by re-running.
- `STATUS_TRANSITIONS.converted` stays `[]` — revert is a named compound op, not a free transition.
- No new unit tests (store logic drags in `~/lib/db`/Tauri; per project convention). Gate is `bun run lint`.
- Version bump to `0.141.0` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (+ `Cargo.lock` if cargo refreshes it).
- Project uses tabs; `bun run lint` auto-fixes.

---

### Task 1: `revertConversion` store method

**Files:**
- Modify: `app/stores/quotes.ts`

**Interfaces:**
- Consumes: `useInvoicesStore().remove(id)` (existing — nulls `quotes.converted_invoice_id`, nulls voucher links, cascades lines, purges attachments, reloads invoices), `selectOne`/`execute` from `~/lib/db`.
- Produces: `revertConversion(quoteId: number): Promise<void>` on the quotes store, throwing `Error` with a user-facing message when refused.

- [ ] **Step 1: Add the import**

`app/stores/quotes.ts` imports (after the `~/stores/business_banks` line, keeping alphabetical order). Note: `invoices.ts` only `import type`s from `quotes.ts`, so this creates no runtime cycle.

```ts
import { useInvoicesStore } from "~/stores/invoices";
```

- [ ] **Step 2: Update the lifecycle comment**

In the header comment block of `app/stores/quotes.ts`, replace:

```ts
//   converted → (terminal)
```

with:

```ts
//   converted → (terminal via transitions; revertConversion() is the
//               named escape hatch — deletes the linked invoice and
//               returns the quote to draft)
```

- [ ] **Step 3: Add the method**

Insert directly after `markConverted` (ends at line ~600):

```ts
	// Inverse of markConverted — the escape hatch for a conversion done in
	// error. Deletes the linked invoice (via the invoices store, which also
	// nulls voucher links, cascades lines, and purges attachments) and
	// returns the quote to an editable draft. Refused while the invoice has
	// recorded payments: money records are never silently touched — the
	// receipt vouchers must be deleted first (mirrors the invoice cancel
	// guard). Not a STATUS_TRANSITIONS entry: this is a compound operation
	// invoked by name, exactly like markConverted on the way in.
	//
	// Sequential auto-commits (connection-pool caveat): the invoice is
	// deleted BEFORE the quote flips, so a crash mid-way can never leave a
	// draft quote pointing at a live invoice. The worst crash window is a
	// 'converted' quote with a null link — re-running the revert recovers
	// (the null-link case skips straight to the flip).
	const revertConversion = async (quoteId: number): Promise<void> => {
		const row = await get(quoteId);
		if (!row) throw new Error("Quote not found");
		if (row.status !== "converted") {
			throw new Error("Only converted quotes can be reverted");
		}
		const invoiceId = row.converted_invoice_id;
		if (invoiceId != null) {
			// Direct SQL, not the vouchers store — it may not be loaded here.
			const receipts = await selectOne<{ n: number }>(
				`SELECT COUNT(*) AS n FROM vouchers
				 WHERE related_invoice_id = ? AND voucher_type = 'receipt'`,
				[invoiceId]
			);
			if ((receipts?.n ?? 0) > 0) {
				throw new Error("This invoice has recorded payments. Delete the receipt vouchers first, then revert.");
			}
			await useInvoicesStore().remove(invoiceId);
		}
		await execute(
			`UPDATE quotes
			 SET status = 'draft', converted_invoice_id = NULL, updated_at = datetime('now')
			 WHERE id = ?`,
			[quoteId]
		);
		await load();
	};
```

- [ ] **Step 4: Export it**

In the store's return object, after `markConverted,`:

```ts
		markConverted,
		revertConversion,
```

- [ ] **Step 5: Lint**

Run: `bun run lint`
Expected: exit 0 (auto-fixes applied if any).

- [ ] **Step 6: Commit**

```bash
git add app/stores/quotes.ts
git commit -m "feat: revertConversion store method — undo a quote→invoice conversion"
```

---

### Task 2: Detail-page UI — button, dropdown entry, confirm modal

**Files:**
- Modify: `app/pages/quotes/[id].vue`

**Interfaces:**
- Consumes: `quotesStore.revertConversion(quoteId)` from Task 1; existing refs `quote`, `status`, `convertedInvoice`, `toast`, existing modal pattern (`showConvertDialog` / `confirmConvert`).
- Produces: user-visible "Revert to draft" action when `status === 'converted'`.

- [ ] **Step 1: Script — state + handlers**

Insert after the `confirmConvert` block (ends ~line 1133):

```ts
	// Revert-conversion. The escape hatch for a conversion done in error —
	// deletes the linked invoice and returns this quote to draft. Offered
	// only in the converted state; the store refuses while the invoice has
	// recorded payments (owner must delete the receipt vouchers first).
	const canRevert = computed(() => status.value === "converted");
	const showRevertDialog = ref(false);
	const reverting = ref(false);
	const askRevert = () => {
		showRevertDialog.value = true;
	};
	const confirmRevert = async () => {
		if (!quote.value || !canRevert.value) return;
		reverting.value = true;
		try {
			await quotesStore.revertConversion(quoteId);
			// Patch the keep-alive local refs — same reason confirmConvert
			// does: returning to this cached page must not show a stale
			// CONVERTED header.
			const current = quote.value;
			if (current) {
				quote.value = { ...current, status: "draft", converted_invoice_id: null };
			}
			convertedInvoice.value = null;
			showRevertDialog.value = false;
			toast.add({
				title: "Conversion reverted",
				description: "The linked invoice was deleted and this quote is a draft again.",
				color: "success",
				icon: "i-lucide-undo-2"
			});
		} catch (err) {
			toast.add({
				title: "Revert failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			reverting.value = false;
		}
	};
```

- [ ] **Step 2: Header button (md+ inline cluster)**

In the template, directly after the `v-if="canConvert"` Convert-to-invoice `<UButton>` (ends ~line 37):

```html
				<UButton
					v-if="canRevert"
					size="sm"
					color="warning"
					variant="outline"
					icon="i-lucide-undo-2"
					@click="askRevert"
				>
					Revert to draft
				</UButton>
```

- [ ] **Step 3: Dropdown entry**

In `actionMenuItems`, inside the `if (quote.value?.converted_invoice_id)` block after the "View linked invoice" push — but gate on `canRevert` so the degenerate null-link case still offers it. Simplest correct shape: add a separate block after the linked-invoice block:

```ts
		if (canRevert.value) {
			primary.push({
				label: "Revert to draft",
				icon: "i-lucide-undo-2",
				onSelect: askRevert
			});
		}
```

- [ ] **Step 4: Confirm modal**

In the template, directly after the Convert `UModal` (`</UModal>` ~line 505):

```html
		<UModal v-model:open="showRevertDialog" title="Revert to draft?">
			<template #body>
				<div class="space-y-3 text-sm">
					<p class="text-(--ui-text-muted)">
						Invoice
						<span class="font-medium text-(--ui-text)">{{ convertedInvoice?.number ?? "linked to this quote" }}</span>
						and its attachments will be <span class="font-medium text-(--ui-text)">permanently deleted</span>,
						and this quote returns to an editable draft.
					</p>
					<p class="text-(--ui-text-muted)">
						The invoice number won't be reused automatically — it'll show as
						a gap you can fill from the next convert or New-invoice dialog.
						If the invoice has recorded payments the revert is refused —
						delete those receipt vouchers first.
					</p>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showRevertDialog = false">
						Cancel
					</UButton>
					<UButton
						color="error"
						:loading="reverting"
						icon="i-lucide-undo-2"
						@click="confirmRevert"
					>
						Revert to draft
					</UButton>
				</div>
			</template>
		</UModal>
```

- [ ] **Step 5: Lint**

Run: `bun run lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/pages/quotes/[id].vue
git commit -m "feat: Revert-to-draft action on converted quote detail page"
```

---

### Task 3: Version bump + hands-on verification

**Files:**
- Modify: `package.json` (`"version": "0.141.0"`)
- Modify: `src-tauri/Cargo.toml` (`version = "0.141.0"` under `[package]`)
- Modify: `src-tauri/tauri.conf.json` (`"version": "0.141.0"`)
- Modify: `src-tauri/Cargo.lock` (the `sakoram_billing` version line, if cargo doesn't refresh it)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: release-ready version metadata.

- [ ] **Step 1: Bump the three version fields to `0.141.0`** (current is `0.140.0`); update `Cargo.lock`'s `sakoram_billing` entry to match if cargo isn't running.

- [ ] **Step 2: Run the gates**

Run: `bun run lint && bun run test`
Expected: both exit 0 (no new tests, existing suite must stay green).

- [ ] **Step 3: Hands-on verify via `bun run tauri:dev`**

1. Convert an accepted quote → confirm invoice created, quote shows CONVERTED with the banner.
2. Click **Revert to draft** → confirm modal → confirm: invoice gone from /invoices, quote is an editable DRAFT, banner gone, Convert available again after re-Send/Accept.
3. Convert another quote, record a payment on its invoice, then attempt revert → refused with the "recorded payments" message; invoice untouched.

- [ ] **Step 4: Commit**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
git commit -m "chore: bump version to 0.141.0"
```
