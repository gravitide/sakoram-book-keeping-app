# Letter Signature Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Save multiple named rich-text signature templates, reuse one on a letter (insert a copy), and mark one default that pre-fills new letters.

**Architecture:** New `letter_signatures` table + Pinia store (CRUD + atomic `setDefault`). Managed on `/settings/letters` via a modal (name + shared `RichTextEditor`). On a letter, a dropdown replaces `signature_json` with a copy of the chosen template. `letters.create` seeds `signature_json` from the default. PDF pipeline unchanged (it already renders `signature_json`).

**Tech Stack:** Tauri 2 (Rust), Nuxt 4 + Vue 3 + Pinia + NuxtUI 4, TS strict, SQLite, TipTap, Vitest, **bun**.

## Global Constraints

- **bun only.** Branch `feat/letter-signature-templates` (already checked out).
- **Single-statement SQL** (connection-pool caveat) — `setDefault` is one `UPDATE ... CASE WHEN`.
- **New migration = three edits:** the `.sql`, an entry in `MIGRATIONS` in `src-tauri/src/tenants.rs`, and `SCHEMA_VERSION` bump in `src-tauri/src/data_io.rs` (+ add the table to `TABLES`). Current latest = 0044, `SCHEMA_VERSION = 44`. Signatures = **0045 / 45**.
- **Dates ISO strings.** Pages need a single root node.
- **Pure logic → `app/lib/` with a `.test.ts`** (vitest can't import Pinia/Tauri).
- **UModal body slot is `#body`.**
- **Version bump on the PR:** minor. Bump `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`) to the next minor over current `main`.
- **No Claude Code footer in commits.**

---

### Task 1: Migration 0045 + Rust plumbing

**Files:**
- Create: `src-tauri/migrations/0045_letter_signatures.sql`
- Modify: `src-tauri/src/tenants.rs`, `src-tauri/src/data_io.rs`

- [ ] **Step 1: Migration**

Create `src-tauri/migrations/0045_letter_signatures.sql`:

```sql
-- Reusable letter signature templates.
--
-- A saved sign-off (rich text) the user can insert into any letter. Applying
-- one copies its body_json into the letter's own signature_json (letters stay
-- self-contained), so this table is only a template source — no FK from
-- letters. At most one row is the default (enforced by the store's setDefault,
-- which is a single atomic CASE-WHEN update); the default pre-fills new letters.

CREATE TABLE letter_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body_json TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_letter_signatures_default ON letter_signatures(is_default);
```

- [ ] **Step 2: Register migration** — in `src-tauri/src/tenants.rs`, append to the `MIGRATIONS` array after the `(44, …)` line:

```rust
	(45, "letter signatures", include_str!("../migrations/0045_letter_signatures.sql")),
```

- [ ] **Step 3: Bump SCHEMA_VERSION + TABLES** — in `src-tauri/src/data_io.rs` change `pub const SCHEMA_VERSION: i32 = 44;` to `45`, and add `"letter_signatures"` to the `TABLES` array right after `"letters"`:

```rust
	"letters",
	"letter_categories",
	"letter_signatures",
```

Wait — verify the exact current line. In `data_io.rs` the letters tables appear as `"letters", "letter_categories",` (added by earlier migrations). Add `"letter_signatures"` after `"letter_categories"`.

- [ ] **Step 4: Verify** — `cd src-tauri && cargo check` → `Finished`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/migrations/0045_letter_signatures.sql src-tauri/src/tenants.rs src-tauri/src/data_io.rs
git commit -m "feat(letters): schema 0045 — letter_signatures table"
```

---

### Task 2: `signature-preview.ts` (pure, TDD)

**Files:**
- Create: `app/lib/signature-preview.ts`, `app/lib/signature-preview.test.ts`

**Interfaces:** Produces `signaturePreview(bodyJson: string): string` — the first non-empty line of text in the signature (for the list preview).

- [ ] **Step 1: Failing test** — `app/lib/signature-preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signaturePreview } from "./signature-preview";

const doc = (content: unknown[]) => JSON.stringify({ type: "doc", content });

describe("signaturePreview", () => {
	it("returns the first non-empty line of text", () => {
		const json = doc([
			{ type: "paragraph" },
			{ type: "paragraph", content: [{ type: "text", text: "M Srisaravana" }] },
			{ type: "paragraph", content: [{ type: "text", text: "Director" }] }
		]);
		expect(signaturePreview(json)).toBe("M Srisaravana");
	});

	it("joins runs within the first line", () => {
		const json = doc([{ type: "paragraph", content: [{ type: "text", text: "Yours, " }, { type: "text", text: "Jane", marks: [{ type: "bold" }] }] }]);
		expect(signaturePreview(json)).toBe("Yours, Jane");
	});

	it("digs into list items", () => {
		const json = doc([{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Point" }] }] }] }]);
		expect(signaturePreview(json)).toBe("Point");
	});

	it("returns empty string for empty / malformed input", () => {
		expect(signaturePreview("")).toBe("");
		expect(signaturePreview("not json")).toBe("");
	});
});
```

- [ ] **Step 2: Run → fail** — `bun run test -- signature-preview` → "Cannot find module".

- [ ] **Step 3: Implement** — `app/lib/signature-preview.ts`:

```ts
// First non-empty line of text from a signature's rich-text JSON — used as the
// preview in the signatures manager. Reuses the shared block normalizer so the
// same bold/list handling applies.
import type { LetterBlock } from "./letter-body";
import { letterBodyToBlocks } from "./letter-body";

const firstText = (blocks: LetterBlock[]): string => {
	for (const b of blocks) {
		if (b.kind === "paragraph" || b.kind === "heading") {
			const t = b.runs.map((r) => r.text).join("").trim();
			if (t) return t;
		} else {
			for (const item of b.items) {
				const t = firstText(item);
				if (t) return t;
			}
		}
	}
	return "";
};

export const signaturePreview = (bodyJson: string): string => firstText(letterBodyToBlocks(bodyJson));
```

- [ ] **Step 4: Run → pass** — `bun run test -- signature-preview` (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/signature-preview.ts app/lib/signature-preview.test.ts
git commit -m "feat(letters): signature-preview helper (first line of a signature)"
```

---

### Task 3: `letter_signatures` store + default seeding in `letters.create`

**Files:**
- Create: `app/stores/letter_signatures.ts`
- Modify: `app/stores/letters.ts`

**Interfaces:**
- `useLetterSignaturesStore` → `signatures` (ref), `defaultSignature` (computed), `load` / `ensureLoaded` / `get(id)`, `create({ name, body_json, isDefault })`, `update(id, { name, body_json })`, `setDefault(id)`, `remove(id)`.
- `LetterSignatureRow = { id, name, body_json, is_default, created_at, updated_at }`.

- [ ] **Step 1: Create the store** — `app/stores/letter_signatures.ts`:

```ts
// Reusable letter signature templates. Mirrors letter_categories plus a default
// flag. Applying a signature to a letter copies its body_json into the letter
// (letters stay self-contained), so there's no FK from letters to here.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { execute, select, selectOne } from "~/lib/db";

export interface LetterSignatureRow {
	id: number
	name: string
	body_json: string
	is_default: number
	created_at: string
	updated_at: string
}

export const useLetterSignaturesStore = defineStore("letter_signatures", () => {
	const signatures = ref<LetterSignatureRow[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// The current default (pre-filled into new letters), or null.
	const defaultSignature = computed(() => signatures.value.find((s) => s.is_default === 1) ?? null);

	const loaded = ref(false);
	let pendingLoad: Promise<void> | null = null;

	const load = async () => {
		loading.value = true;
		error.value = null;
		try {
			signatures.value = await select<LetterSignatureRow>(
				"SELECT * FROM letter_signatures ORDER BY name COLLATE NOCASE ASC"
			);
			loaded.value = true;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const ensureLoaded = async () => {
		if (loaded.value) return;
		if (!pendingLoad) {
			pendingLoad = load().finally(() => {
				pendingLoad = null;
			});
		}
		await pendingLoad;
	};

	const get = async (id: number): Promise<LetterSignatureRow | null> =>
		selectOne<LetterSignatureRow>("SELECT * FROM letter_signatures WHERE id = ?", [id]);

	// Exactly one default at a time — single atomic statement (mirrors
	// business_banks.setDefault). No `archived` scope here (signatures aren't
	// archivable), so the CASE-WHEN covers every row.
	const setDefault = async (id: number): Promise<void> => {
		await execute(
			`UPDATE letter_signatures
			 SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END, updated_at = datetime('now')`,
			[id]
		);
		await load();
	};

	const create = async (input: { name: string, body_json: string, isDefault?: boolean }): Promise<number> => {
		const result = await execute(
			"INSERT INTO letter_signatures (name, body_json, is_default) VALUES (?, ?, 0)",
			[input.name.trim(), input.body_json]
		);
		if (result.lastInsertId === undefined) throw new Error("create: no lastInsertId");
		if (input.isDefault) await setDefault(result.lastInsertId);
		else await load();
		return result.lastInsertId;
	};

	const update = async (id: number, patch: { name: string, body_json: string }): Promise<void> => {
		await execute(
			"UPDATE letter_signatures SET name = ?, body_json = ?, updated_at = datetime('now') WHERE id = ?",
			[patch.name.trim(), patch.body_json, id]
		);
		await load();
	};

	const remove = async (id: number): Promise<void> => {
		await execute("DELETE FROM letter_signatures WHERE id = ?", [id]);
		await load();
	};

	return {
		signatures,
		loading,
		error,
		defaultSignature,
		loaded,
		load,
		ensureLoaded,
		get,
		create,
		update,
		setDefault,
		remove
	};
});
```

- [ ] **Step 2: Seed the default into new letters** — in `app/stores/letters.ts`, update `create` to look up the default signature and store it. Replace the `create` body's INSERT:

```ts
	const create = async (input: {
		number: string
		letter_date: string
		category: string
		recipient_name: string
		subject: string
	}): Promise<number> => {
		await bumpCounterIfSuggested(input.number, input.letter_date);
		// Pre-fill the sign-off from the default signature template, if one is set.
		const def = await selectOne<{ body_json: string }>(
			"SELECT body_json FROM letter_signatures WHERE is_default = 1 LIMIT 1"
		);
		const result = await execute(
			`INSERT INTO letters (number, letter_date, category, recipient_name, subject, signature_json)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[
				input.number.trim(),
				input.letter_date,
				input.category.trim(),
				input.recipient_name.trim(),
				input.subject.trim(),
				def?.body_json ?? ""
			]
		);
		if (result.lastInsertId === undefined) throw new Error("create: no lastInsertId");
		await load();
		return result.lastInsertId;
	};
```

(`selectOne` is already imported in letters.ts.)

- [ ] **Step 3: Lint** — `bun run lint` (clean).

- [ ] **Step 4: Commit**

```bash
git add app/stores/letter_signatures.ts app/stores/letters.ts
git commit -m "feat(letters): letter_signatures store + default seeds new letters"
```

---

### Task 4: `LetterSignatureFormModal.vue`

**Files:**
- Create: `app/components/LetterSignatureFormModal.vue`

**Interfaces:** `<LetterSignatureFormModal v-model:open="…" :signature="row | null" />` — `signature` null = create, else edit. Emits nothing extra (writes via the store); parent refetches on close. Consumes `useLetterSignaturesStore`.

- [ ] **Step 1: Create the modal**

```vue
<template>
	<UModal v-model:open="openModel" :title="signature ? 'Edit signature' : 'New signature'">
		<template #body>
			<form id="letter-signature-form" class="space-y-4" @submit.prevent="save">
				<UFormField label="Name" required>
					<UInput v-model="name" placeholder="e.g. Director sign-off" autofocus />
				</UFormField>
				<UFormField label="Signature">
					<RichTextEditor v-model="bodyJson" />
				</UFormField>
				<UFormField>
					<UCheckbox v-model="isDefault" label="Use as the default signature for new letters" />
				</UFormField>
			</form>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="openModel = false">
					Cancel
				</UButton>
				<UButton type="submit" form="letter-signature-form" :loading="saving" :disabled="!name.trim()" icon="i-lucide-check">
					{{ signature ? "Save" : "Create" }}
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import type { LetterSignatureRow } from "~/stores/letter_signatures";
	import { useLetterSignaturesStore } from "~/stores/letter_signatures";

	const props = defineProps<{ signature: LetterSignatureRow | null }>();
	const openModel = defineModel<boolean>("open", { default: false });

	const store = useLetterSignaturesStore();
	const toast = useToast();

	const name = ref("");
	const bodyJson = ref("");
	const isDefault = ref(false);
	const saving = ref(false);

	// Seed the form each time the modal opens.
	watch(openModel, (open) => {
		if (!open) return;
		name.value = props.signature?.name ?? "";
		bodyJson.value = props.signature?.body_json ?? "";
		isDefault.value = props.signature?.is_default === 1;
		saving.value = false;
	});

	const save = async () => {
		if (!name.value.trim() || saving.value) return;
		saving.value = true;
		try {
			if (props.signature) {
				await store.update(props.signature.id, { name: name.value, body_json: bodyJson.value });
				if (isDefault.value && props.signature.is_default !== 1) await store.setDefault(props.signature.id);
			} else {
				await store.create({ name: name.value, body_json: bodyJson.value, isDefault: isDefault.value });
			}
			toast.add({ title: "Signature saved", color: "success", icon: "i-lucide-check" });
			openModel.value = false;
		} catch (err) {
			toast.add({ title: "Could not save", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			saving.value = false;
		}
	};
</script>
```

- [ ] **Step 2: Lint + generate** — `bun run lint`, `bun run generate` (clean).

- [ ] **Step 3: Commit**

```bash
git add app/components/LetterSignatureFormModal.vue
git commit -m "feat(letters): signature create/edit modal"
```

---

### Task 5: Signatures section on `/settings/letters` + sidebar anchor

**Files:**
- Modify: `app/pages/settings/letters.vue`, `app/layouts/default.vue`

- [ ] **Step 1: Add the Signatures card** — in `app/pages/settings/letters.vue`, insert a new `UCard` **after** the categories card (`</UCard>` closing the `id="categories"` card) and **before** the `id="preprinted"` card:

```vue
				<!-- Signatures -->
				<UCard id="signatures" class="scroll-mt-6">
					<template #header>
						<div class="flex items-center justify-between gap-2">
							<div class="font-medium">
								Signatures
							</div>
							<UButton size="xs" icon="i-lucide-plus" @click="openSignature(null)">
								New signature
							</UButton>
						</div>
						<div class="text-xs text-(--ui-text-muted) mt-1">
							Reusable sign-offs. Pick one when composing a letter (it's copied in
							and stays editable). The default is pre-filled into every new letter.
						</div>
					</template>

					<div v-if="sigStore.signatures.length === 0" class="text-sm text-(--ui-text-muted) py-4 text-center">
						No signatures yet. Add one to reuse across letters.
					</div>
					<ul v-else class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md">
						<li v-for="s in sigStore.signatures" :key="s.id" class="flex items-center gap-2 px-3 py-2">
							<div class="min-w-0 flex-1">
								<div class="text-sm font-medium truncate flex items-center gap-2">
									{{ s.name }}
									<UBadge v-if="s.is_default === 1" size="xs" color="primary" variant="subtle">
										Default
									</UBadge>
								</div>
								<div class="text-xs text-(--ui-text-muted) truncate">
									{{ signaturePreview(s.body_json) || "Empty" }}
								</div>
							</div>
							<UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openSignature(s)" />
							<UButton
								v-if="s.is_default !== 1"
								size="xs"
								color="neutral"
								variant="ghost"
								icon="i-lucide-star"
								aria-label="Set default"
								:disabled="sigBusy"
								@click="setSignatureDefault(s)"
							/>
							<UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Delete" :disabled="sigBusy" @click="removeSignature(s)" />
						</li>
					</ul>
				</UCard>
```

- [ ] **Step 2: Wire the modal + script** — add near the other cards in the template (e.g. just before the closing `</div>` of the `space-y-6` wrapper):

```vue
				<LetterSignatureFormModal v-model:open="signatureModalOpen" :signature="editingSignature" />
```

And in the `<script setup>` (after the existing category logic), add:

```ts
	import type { LetterSignatureRow } from "~/stores/letter_signatures";
	import { signaturePreview } from "~/lib/signature-preview";
	import { useLetterSignaturesStore } from "~/stores/letter_signatures";

	const sigStore = useLetterSignaturesStore();
	const sigBusy = ref(false);
	const signatureModalOpen = ref(false);
	const editingSignature = ref<LetterSignatureRow | null>(null);

	const openSignature = (s: LetterSignatureRow | null) => {
		editingSignature.value = s;
		signatureModalOpen.value = true;
	};
	// Refetch when the modal closes (create/edit/set-default all write via the store).
	watch(signatureModalOpen, (open) => {
		if (!open) void sigStore.load();
	});
	const setSignatureDefault = async (s: LetterSignatureRow) => {
		sigBusy.value = true;
		try {
			await sigStore.setDefault(s.id);
		} catch (err) {
			toast.add({ title: "Could not update", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			sigBusy.value = false;
		}
	};
	const removeSignature = async (s: LetterSignatureRow) => {
		sigBusy.value = true;
		try {
			await sigStore.remove(s.id);
			toast.add({ title: `Deleted "${s.name}"`, color: "success", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({ title: "Could not delete", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			sigBusy.value = false;
		}
	};
```

And add `sigStore.load()` to the top-level `await Promise.all([...])`:

```ts
	await Promise.all([catStore.load(), sigStore.load(), settings.ensureLoaded()]);
```

(`toast` and `msg` already exist in this file.)

- [ ] **Step 3: Sidebar anchor** — in `app/layouts/default.vue`, in the `/settings/letters` nav entry's `sections`, add `#signatures` after `#categories`:

```ts
					sections: [
						{ hash: "#categories", label: "Categories", icon: "i-lucide-tags" },
						{ hash: "#signatures", label: "Signatures", icon: "i-lucide-pen-line" },
						{ hash: "#preprinted", label: "Pre-printed", icon: "i-lucide-file-text" },
						{ hash: "#templates", label: "Templates", icon: "i-lucide-layout-template" }
					]
```

- [ ] **Step 4: Lint + generate** — clean; `/settings/letters` prerenders.

- [ ] **Step 5: Commit**

```bash
git add app/pages/settings/letters.vue app/layouts/default.vue
git commit -m "feat(letters): manage signatures on /settings/letters"
```

---

### Task 6: "Use a saved signature" dropdown on the letter

**Files:**
- Modify: `app/pages/letters/[id].vue`

- [ ] **Step 1: Update the Signature SectionCard** — replace the current Signature section body so a dropdown sits above the editor:

```vue
				<SectionCard title="Signature" subtitle="The sign-off printed below a signature line at the bottom of the letter." icon="i-lucide-pen-line">
					<div class="space-y-2">
						<div v-if="sigStore.signatures.length > 0" class="flex justify-end">
							<UDropdownMenu :items="savedSignatureItems">
								<UButton size="xs" color="neutral" variant="soft" icon="i-lucide-signature" trailing-icon="i-lucide-chevron-down" :ui="{ trailingIcon: 'size-3' }">
									Use a saved signature
								</UButton>
							</UDropdownMenu>
						</div>
						<RichTextEditor v-model="form.signature_json" />
					</div>
				</SectionCard>
```

- [ ] **Step 2: Script wiring** — add to `<script setup>` of `app/pages/letters/[id].vue`:

```ts
	import { useLetterSignaturesStore } from "~/stores/letter_signatures";

	const sigStore = useLetterSignaturesStore();

	// Applying a saved signature REPLACES the letter's sign-off with a copy
	// (then editable). Dropdown is hidden when there are no saved signatures.
	const savedSignatureItems = computed(() => [
		sigStore.signatures.map((s) => ({
			label: s.name,
			onSelect: () => { form.signature_json = s.body_json; }
		}))
	]);
```

And load the signatures alongside the existing setup loads. Find the `await Promise.all([load(), settings.ensureLoaded(), store.ensureLoaded()]);` line and add `sigStore.ensureLoaded()`:

```ts
	await Promise.all([load(), settings.ensureLoaded(), store.ensureLoaded(), sigStore.ensureLoaded()]);
```

- [ ] **Step 3: Lint + generate** — clean.

- [ ] **Step 4: Manual smoke (dev)** — `bun run tauri:dev`: `/settings/letters` → New signature (name + rich body + default) → save. Create a NEW letter → its signature is pre-filled with the default. On a letter, "Use a saved signature ▾" → pick one → signature editor replaces with that content, editable. Set a different default, create another letter → new default applied.

- [ ] **Step 5: Commit**

```bash
git add app/pages/letters/\[id\].vue
git commit -m "feat(letters): apply a saved signature on the letter detail page"
```

---

### Task 7: Version bump + docs + final gate

**Files:** `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`), `CLAUDE.md`

- [ ] **Step 1: Version bump** — read the current `version` in `package.json` and bump the **minor** (e.g. `0.131.0 → 0.132.0`) across `package.json`, `src-tauri/tauri.conf.json` (`"version"` under `productName`), and `src-tauri/Cargo.toml` (`[package].version`). `Cargo.lock` updates on the next cargo run.

- [ ] **Step 2: CLAUDE.md** — add to the **Migrations** list:

```
0045_letter_signatures.sql              ← `letter_signatures` table (reusable rich-text sign-offs). Applying one COPIES its body_json into the letter's own signature_json (no FK — letters stay self-contained); at most one is_default (atomic CASE-WHEN in the store) pre-fills new letters. Managed on /settings/letters. SCHEMA_VERSION → 45.
```

Update the `settings/letters.vue` line in the project layout to mention signatures, and add a bullet under the Letters "What's done" note.

- [ ] **Step 3: Full gate** — `bun run lint` · `bun run test` (green, incl. signature-preview) · `bun run generate` (`/settings/letters` present) · `cd src-tauri && cargo check`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: bump version + document letter signatures"
```

---

## Self-Review

**Spec coverage:** table + store CRUD + atomic setDefault ✓ (T1, T3); default seeds new letters ✓ (T3); manage on /settings/letters via modal ✓ (T4, T5); apply-a-copy dropdown on the letter ✓ (T6); preview helper tested ✓ (T2); sidebar anchor ✓ (T5); PDF unchanged (insert-a-copy) ✓ (no PDF task needed). Out-of-scope items (merge fields, images, linking) not implemented ✓.

**Placeholder scan:** none — every step has concrete code. The Step-3 note in T1 ("verify the exact current line") is a reminder to read, not a placeholder.

**Type consistency:** `LetterSignatureRow` (T3) is consumed by the modal (T4), settings page (T5), and the letter dropdown reads `s.body_json`/`s.name` (T6). `signaturePreview(string): string` (T2) → used in T5. Store methods `create({name,body_json,isDefault})` / `update(id,{name,body_json})` / `setDefault(id)` / `remove(id)` / `defaultSignature` match every callsite. `letters.create` gains no new params (signature seeding is internal).

**Note for the implementer:** read the exact anchor lines before editing `settings/letters.vue` (card boundaries), `default.vue` (the `/settings/letters` sections array), and `letters/[id].vue` (the Signature `SectionCard` + the `Promise.all` setup line) — line numbers drift.
