# Go Free + Terms Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the licensing/tier/trial gating (everything free) and add a first-run Terms & liability acceptance gate, with a Gravitide credit.

**Architecture:** Neuter `app/stores/license.ts` to report Premium · not-trial · unlimited — every gated element keys off that, so it all hides with no callsite edits. Delete the directly-reachable licensing pages/UI. Add a `/terms` gate page + a `tenant.global.ts` redirect driven by a versioned localStorage acceptance flag, with re-readable Terms in the About modal.

**Tech Stack:** Nuxt 4 SSG / Vue 3 / Pinia / TS, NuxtUI 4, Vitest. No Rust, no DB migration.

## Global Constraints

- **bun only** — `bun run lint`, `bun run test`, `bun run generate`.
- **No DB migration / no Rust changes** — `license.rs` / `mint_license` / Cargo deps stay untouched (follow-up cleanup).
- **Keep the license store's exported shape** (`tier`, `isTrial`, `trialDaysLeft`, `businessLimit`, `hasFeature`, `canCreateBusiness`, `loaded`, `load`) so the ~30 consumers keep compiling.
- **Leave dormant** (do NOT delete this pass): `FeatureLock.vue`, `UpgradeButton.vue`, `app/lib/licensing.ts` (+ its test), and the nav-item `feature` lock badges — they never render once neutered.
- **Version bump** — `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`) in lockstep. This branch: `feat/free-and-terms`. Commit messages: no Claude footer.
- **Gravitide URL:** `https://gravitide.dev` (use verbatim).

---

### Task 1: Terms version + acceptance helper (pure, TDD) + composable

**Files:**
- Create: `app/lib/terms.ts`
- Test: `app/lib/terms.test.ts`
- Create: `app/composables/useTerms.ts`

**Interfaces:**
- Produces: `TERMS_VERSION: string`; `hasAcceptedTerms(storedVersion: string | null): boolean`; and composable `useTerms()` → `{ TERMS_VERSION, accepted: Ref<boolean>, accept(): void, refresh(): void }`.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/terms.test.ts
import { describe, expect, it } from "vitest";
import { hasAcceptedTerms, TERMS_VERSION } from "./terms";

describe("hasAcceptedTerms", () => {
	it("true when the stored version matches the current one", () => {
		expect(hasAcceptedTerms(TERMS_VERSION)).toBe(true);
	});
	it("false when nothing is stored", () => {
		expect(hasAcceptedTerms(null)).toBe(false);
	});
	it("false when an older version was accepted (forces re-accept)", () => {
		expect(hasAcceptedTerms("0000-00-00")).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- terms`
Expected: FAIL — cannot resolve `./terms`.

- [ ] **Step 3: Implement the pure helper**

```ts
// app/lib/terms.ts
// Bump this date whenever the Terms copy materially changes — the acceptance
// gate re-shows for everyone whose stored version no longer matches.
export const TERMS_VERSION = "2026-07-07";

export function hasAcceptedTerms(storedVersion: string | null): boolean {
	return storedVersion === TERMS_VERSION;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- terms`
Expected: PASS (3 cases).

- [ ] **Step 5: Implement the composable**

```ts
// app/composables/useTerms.ts
// First-run Terms acceptance, stored per-machine in localStorage (like the
// other UI prefs). Versioned via TERMS_VERSION so a Terms change re-gates.
import { hasAcceptedTerms, TERMS_VERSION } from "~/lib/terms";

const VERSION_KEY = "sakoram.terms.acceptedVersion";
const AT_KEY = "sakoram.terms.acceptedAt";

export function useTerms() {
	const accepted = useState<boolean>("terms-accepted", () => {
		if (typeof localStorage === "undefined") return false;
		return hasAcceptedTerms(localStorage.getItem(VERSION_KEY));
	});

	const refresh = () => {
		if (typeof localStorage === "undefined") return;
		accepted.value = hasAcceptedTerms(localStorage.getItem(VERSION_KEY));
	};

	const accept = () => {
		try {
			localStorage.setItem(VERSION_KEY, TERMS_VERSION);
			localStorage.setItem(AT_KEY, new Date().toISOString());
		} catch { /* private mode — the gate will just re-show next launch */ }
		accepted.value = true;
	};

	return { TERMS_VERSION, accepted, accept, refresh };
}
```

- [ ] **Step 6: Run lint + commit**

Run: `bun run lint`

```bash
git add app/lib/terms.ts app/lib/terms.test.ts app/composables/useTerms.ts
git commit -m "feat(terms): version + acceptance helper + useTerms composable"
```

---

### Task 2: Neuter the license store to always-free

**Files:**
- Modify: `app/stores/license.ts` (full rewrite of the setup body).

**Interfaces:**
- Produces (unchanged shape): `tier`, `isTrial`, `trialDaysLeft`, `businessLimit`, `hasFeature(key: string) => true`, `canCreateBusiness(count: number) => true`, `loaded`, `load()`.

- [ ] **Step 1: Rewrite the store body**

Replace the whole `defineStore("license", () => { … })` body with the always-free version (keep the same import for `Tier`, drop `effectiveEntitlement`/`hasFeatureFor`; drop `activate`/`deactivate`/`load`-from-Rust):

```ts
// app/stores/license.ts
// Sakoram is free — no tiers, no trial, no gating. This store is kept (with its
// original public shape) only so the ~30 existing consumers keep compiling;
// every entitlement now reports the top tier so all gated UI hides itself.
// (FeatureLock / UpgradeButton / lock badges / licensing.ts are dormant, to be
// deleted in a follow-up.)
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { Tier } from "~/lib/licensing";

export const useLicenseStore = defineStore("license", () => {
	const loaded = ref(true);

	const tier = computed(() => Tier.Premium);
	const isTrial = computed(() => false);
	const trialDaysLeft = computed(() => 0);
	const businessLimit = computed(() => Number.POSITIVE_INFINITY);

	const hasFeature = (_key: string) => true;
	const canCreateBusiness = (_currentCount: number) => true;

	// No-op: nothing to load now. Kept because tenant.global.ts calls it.
	const load = async () => { loaded.value = true; };
	const ensureLoaded = async () => { loaded.value = true; };

	return { loaded, tier, isTrial, trialDaysLeft, businessLimit, hasFeature, canCreateBusiness, load, ensureLoaded };
});
```

> If `Tier` isn't a value export you can reference as `Tier.Premium`, check `app/lib/licensing.ts`: it's a numeric enum, so `Tier.Premium` is valid. If lint flags the `_key`/`_currentCount` unused args, prefix with `_` (already done) — the repo's eslint allows leading-underscore unused args.

- [ ] **Step 2: Verify nothing else imported removed members**

Run: `grep -rn "\.activate(\|\.deactivate(\|licenseKey\|licenseName" app --include=*.vue --include=*.ts | grep -i licens`
Expected: only `app/pages/settings/license.vue` (deleted in Task 3) and `app/pages/upgrade.vue` (deleted in Task 3). If anything else shows up, note it — but those two are the only consumers of the removed methods.

- [ ] **Step 3: Lint + generate**

Run: `bun run lint` then `bun run generate`
Expected: lint clean; generate may still fail on `/upgrade` or `/settings/license` importing removed store members — that's fine, Task 3 deletes them. If lint errors on unused imports in `license.ts`, remove them.

- [ ] **Step 4: Commit**

```bash
git add app/stores/license.ts
git commit -m "feat(license): neuter entitlement store to always-free"
```

---

### Task 3: Delete the reachable licensing UI

**Files:**
- Delete: `app/pages/upgrade.vue`, `app/pages/settings/license.vue`, `app/components/TrialBanner.vue`.
- Modify: `app/layouts/default.vue` — remove the License nav entry (line ~683), the `<TrialBanner />` mount, and the About-modal tier/trial display (~223–224).
- Modify: `app/pages/welcome.vue` — remove the "limited to 2 businesses — upgrade" block (~168) and the `navigateTo("/upgrade…")` branch (~578).
- Modify: `app/pages/settings/businesses.vue` — same two removals (~31 and ~499).

- [ ] **Step 1: Delete the pages + banner**

```bash
git rm app/pages/upgrade.vue app/pages/settings/license.vue app/components/TrialBanner.vue
```

- [ ] **Step 2: default.vue — remove the License nav entry**

Delete this array element (line ~683):
```ts
{ to: "/settings/license", label: "License", icon: "i-lucide-key-round" }
```
If it's the last element in its group array, also fix the trailing comma on the line above so the array stays valid.

- [ ] **Step 3: default.vue — remove the `<TrialBanner />` mount**

Find `<TrialBanner` in the template and delete the element (it sits above the main content). Remove any `import TrialBanner` if one exists (it's auto-imported, so likely none).

- [ ] **Step 4: default.vue — remove the tier/trial line in the About modal**

Delete the About row that renders `{{ ["Basic","Plus","Premium"][license.tier] }}` + the `v-if="license.isTrial"` trial span (~223–224) and its label cell. (The About modal keeps version + description; Task 6 adds the Terms link + Gravitide credit here.)

- [ ] **Step 5: welcome.vue + businesses.vue — remove dead upgrade paths**

In both files: delete the `v-if="!license.canCreateBusiness(...)"` "limited to 2 businesses — upgrade" `<p>`/`<NuxtLink>` block, and in the create handler delete the `if (!license.canCreateBusiness(...)) { await navigateTo("/upgrade…"); return; }` guard (it can never fire now; keep the rest of the handler). Leave the `license` import if still used elsewhere in the file; remove it if now unused (lint will tell you).

- [ ] **Step 6: Lint + generate**

Run: `bun run lint` then `bun run generate`
Expected: both clean; no route references `/upgrade` or `/settings/license`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(license): remove upgrade + license pages, trial banner, and gated links"
```

---

### Task 4: Terms content component + /terms gate page

**Files:**
- Create: `app/components/TermsContent.vue`
- Create: `app/pages/terms.vue`

**Interfaces:**
- Consumes: `useTerms()` (Task 1).
- Produces: `<TermsContent />` (presentational — the copy + Gravitide credit); route `/terms`.

- [ ] **Step 1: TermsContent.vue (the copy)**

```vue
<template>
	<div class="space-y-4 text-sm leading-relaxed text-(--ui-text-muted)">
		<p>
			Sakoram is free software made by
			<a href="https://gravitide.dev" class="text-(--ui-primary) hover:underline" @click.prevent="openLink('https://gravitide.dev')">Gravitide</a>.
			By using it you agree to the following.
		</p>
		<div>
			<h3 class="font-medium text-(--ui-text) mb-1">Provided “as is”</h3>
			<p>Sakoram is provided free of charge, with no warranty of any kind. It may contain bugs and can change or stop working at any time.</p>
		</div>
		<div>
			<h3 class="font-medium text-(--ui-text) mb-1">Your data is yours — and your responsibility</h3>
			<p>Everything runs offline; your books live in folders on your own computer that you choose. You are responsible for keeping your own backups. Use the Export option regularly. We cannot recover data that is lost, corrupted, or deleted.</p>
		</div>
		<div>
			<h3 class="font-medium text-(--ui-text) mb-1">No liability</h3>
			<p>To the fullest extent allowed by law, Gravitide is not liable for any loss or damage arising from using Sakoram — including lost or corrupted data, inaccurate figures, or decisions and filings made using its output.</p>
		</div>
		<div>
			<h3 class="font-medium text-(--ui-text) mb-1">Not professional advice</h3>
			<p>Sakoram is a bookkeeping tool, not accounting, legal, or tax advice. You are responsible for the accuracy of your records and for your own compliance obligations (for example, IRD filings). When in doubt, consult a qualified professional.</p>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { open as openExternal } from "@tauri-apps/plugin-shell";

	// Open the Gravitide link in the OS browser (a plain href would navigate the
	// Tauri webview away from the app).
	const openLink = (url: string) => {
		openExternal(url).catch(() => { /* best-effort */ });
	};
</script>
```

- [ ] **Step 2: terms.vue (the first-run gate)**

```vue
<template>
	<div class="w-full max-w-2xl select-none">
		<header class="text-center mb-6">
			<img :src="sakoramLogo" alt="Sakoram" class="h-16 w-auto mx-auto mb-4 dark:invert dark:hue-rotate-180">
			<h1 class="text-2xl font-semibold">
				Before you start
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				A quick note on how Sakoram works and what it does — and doesn't — promise.
			</p>
		</header>

		<UCard>
			<div class="max-h-[50vh] overflow-y-auto pr-1">
				<TermsContent />
			</div>
			<template #footer>
				<div class="space-y-3">
					<UCheckbox v-model="agreed" label="I have read and agree to the Terms." />
					<div class="flex justify-end">
						<UButton :disabled="!agreed" icon="i-lucide-arrow-right" trailing @click="onContinue">
							Continue
						</UButton>
					</div>
				</div>
			</template>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import { useTerms } from "~/composables/useTerms";

	definePageMeta({ layout: "welcome", title: "Terms" });

	const { accept } = useTerms();
	const agreed = ref(false);

	const onContinue = async () => {
		if (!agreed.value) return;
		accept();
		await navigateTo("/welcome");
	};
</script>
```

- [ ] **Step 3: Lint + generate**

Run: `bun run lint` then `bun run generate`
Expected: clean; `/terms` prerenders.

- [ ] **Step 4: Commit**

```bash
git add app/components/TermsContent.vue app/pages/terms.vue
git commit -m "feat(terms): terms content + first-run acceptance page"
```

---

### Task 5: Wire the Terms gate into the global middleware

**Files:**
- Modify: `app/middleware/tenant.global.ts` (add the terms check at the top).

- [ ] **Step 1: Add the gate before the tenant logic**

Insert at the very start of the middleware body (before `const tenants = …`):

```ts
	// First-run Terms gate — before any tenant routing. If the current Terms
	// version hasn't been accepted, force /terms (except for /terms itself).
	const { accepted } = useTerms();
	if (!accepted.value && to.path !== "/terms") {
		return navigateTo("/terms");
	}
	// Once accepted, keep the user out of the gate.
	if (accepted.value && to.path === "/terms") {
		return navigateTo("/welcome");
	}
```

Add the import at the top: `import { useTerms } from "~/composables/useTerms";`

- [ ] **Step 2: Lint + generate**

Run: `bun run lint` then `bun run generate`
Expected: clean.

- [ ] **Step 3: Manual check (dev)**

Run `bun run tauri:dev`, clear the app's localStorage (devtools → Application), reload → lands on `/terms`, Continue disabled until the box is checked; after Continue → `/welcome`; relaunch → goes straight to welcome (no gate).

- [ ] **Step 4: Commit**

```bash
git add app/middleware/tenant.global.ts
git commit -m "feat(terms): first-run acceptance gate in the global middleware"
```

---

### Task 6: About modal — Terms link + Gravitide credit

**Files:**
- Modify: `app/layouts/default.vue` (About modal body).

- [ ] **Step 1: Add a Terms-viewer modal + a Gravitide credit to the About modal**

In `default.vue`, add state near `aboutOpen`:
```ts
const termsOpen = ref(false);
```

In the About `UModal` body (where the tier line was removed in Task 3), add a footer-ish block:
```vue
<div class="pt-2 mt-2 border-t border-(--ui-border) text-sm text-(--ui-text-muted) space-y-1">
	<div>
		Made by
		<button type="button" class="text-(--ui-primary) hover:underline" @click="openLink('https://gravitide.dev')">Gravitide</button>.
	</div>
	<button type="button" class="text-(--ui-primary) hover:underline" @click="termsOpen = true">
		Terms &amp; conditions
	</button>
</div>
```
(`openLink` already exists in default.vue.)

Add a second modal (sibling of the About `UModal`):
```vue
<UModal v-model:open="termsOpen" title="Terms &amp; conditions">
	<template #body>
		<div class="max-h-[60vh] overflow-y-auto pr-1">
			<TermsContent />
		</div>
	</template>
</UModal>
```

- [ ] **Step 2: Lint + generate**

Run: `bun run lint` then `bun run generate`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/layouts/default.vue
git commit -m "feat(about): Terms link + Gravitide credit in the About modal"
```

---

### Task 7: Version bump + final verification + docs

**Files:**
- Modify: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`), `CLAUDE.md`.

- [ ] **Step 1: Bump** minor `0.129.0 → 0.130.0` in the three version files (+ Cargo.lock version line).

- [ ] **Step 2: CLAUDE.md** — in the "Licensing & feature tiers" section, add a note at the top that the app is now **free**: the store reports Premium/no-trial/unlimited, the upgrade + license pages + trial banner are removed, and `license.rs`/`mint_license`/deps + `FeatureLock`/`UpgradeButton`/`licensing.ts` remain dormant pending a cleanup PR. Add a one-line note about the first-run Terms gate (`/terms` + `useTerms` + `tenant.global.ts`).

- [ ] **Step 3: Full gate**

Run: `bun run lint` (clean) · `bun run test` (green, incl. terms + licensing tests) · `bun run generate` (46+ routes: `/terms` present, `/upgrade` + `/settings/license` gone).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: bump to 0.130.0 + document going free + terms gate"
```

---

## Self-Review

**Spec coverage:** neuter store ✓ (T2); delete upgrade/license/trial-banner/nav-entry/About-tier/dead-links ✓ (T3); Rust untouched ✓ (constraint); terms version+storage+composable ✓ (T1); `/terms` gate page ✓ (T4); middleware gate ✓ (T5); re-readable Terms in About + Gravitide credit ✓ (T6); Terms content covers as-is / no-warranty / data-loss / backups / not-advice / compliance ✓ (T4). FeatureLock/UpgradeButton/licensing.ts left dormant ✓ (constraint).

**Placeholder scan:** none — all steps have concrete code/commands.

**Type consistency:** `useTerms()` returns `{ TERMS_VERSION, accepted, accept, refresh }` (T1) — consumed by T4 (`accept`) + T5 (`accepted`). Store keeps `hasFeature`/`canCreateBusiness`/`isTrial`/`tier`/`loaded`/`load` (T2) — matches every existing consumer. `TERMS_VERSION`/`hasAcceptedTerms` names match across T1's lib + composable.

**Note for the implementer:** verify the exact line of the About tier display + the `<TrialBanner>` mount + the License nav entry by reading `default.vue` — line numbers here (~223, ~683) are approximate and the file may have shifted.
