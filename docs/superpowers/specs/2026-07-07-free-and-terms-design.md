# Go free — remove licensing + Terms acceptance gate

**Date:** 2026-07-07
**Status:** Approved design, pending spec review → plan

## Goal

Sakoram is no longer a commercial product — it's given away free to build
visibility for **Gravitide**. Remove the licensing / tier / trial system so
every feature is available to everyone, and add a first-run **Terms &
conditions** acceptance gate that disclaims liability (as-is, no warranty, not
responsible for data loss).

Two parts, one branch (`feat/free-and-terms`).

## Non-goals

- No DB migration (license state is a per-install `license.json`, not a tenant
  DB column).
- Not deleting the Rust `license.rs` / `mint_license` / crypto deps
  (ed25519-dalek, keyring, machine-uid) this pass — they're not user-visible.
  Tracked as a follow-up cleanup.

## Part 1 — Remove licensing (neuter to free)

### Mechanism
Every gated element in the app renders on `!hasFeature(…)` / `isTrial` /
`!canCreateBusiness(…)` from `app/stores/license.ts`. So making the store
report **Premium · not-trial · unlimited** hides all of it with no per-callsite
edits.

### Changes
1. **`app/stores/license.ts`** — hardcode the always-free entitlement:
   - `tier` → `Tier.Premium`; `isTrial` → `false`; `trialDaysLeft` → `0`;
     `businessLimit` → `Number.POSITIVE_INFINITY`.
   - `hasFeature = () => true`; `canCreateBusiness = () => true`.
   - `load()` → no-op (stop calling the Rust license commands / reading
     `license.json`). Keep `loaded` = true so the middleware warm-up is happy.
   - Remove `activate`/`deactivate` (only the deleted license page used them)
     and the now-unused `effectiveEntitlement`/`hasFeatureFor` imports. Keep
     `Tier` import (used for the constant).
   - Keep the exported shape (`tier`, `isTrial`, `trialDaysLeft`,
     `businessLimit`, `hasFeature`, `canCreateBusiness`, `loaded`, `load`) so
     all ~30 consumers keep compiling; their gated branches simply never fire.
2. **Delete directly-reachable licensing UI** (these are navigable, so they must
   go, not just hide):
   - `app/pages/upgrade.vue` (route `/upgrade`).
   - `app/pages/settings/license.vue` (route `/settings/license`).
   - The sidebar nav "License" entry in `app/layouts/default.vue`.
   - The `<TrialBanner />` mount in `app/layouts/default.vue`; delete
     `app/components/TrialBanner.vue`.
   - Any remaining hardcoded `/upgrade` links that could 404 (e.g. the
     "limited to 2 businesses — upgrade" `NuxtLink` in `welcome.vue` /
     `settings/businesses.vue`) — those live inside `v-if="!canCreateBusiness"`
     so never render, but remove the dead `NuxtLink` to keep things tidy.
3. **Keep but leave dormant** (never render once neutered; flagged for a later
   cleanup PR): `app/components/FeatureLock.vue`, `app/components/UpgradeButton.vue`,
   the nav-item `feature` lock-badge markup, and `app/lib/licensing.ts` (+ its
   passing unit test). No behavioural effect.
4. **Rust** untouched (`license.rs`, `mint_license`, deps). `license.json` may
   still be written by the untouched `read/write_license_state` commands but is
   never read for gating.

### Verification
`bun run lint` clean; `bun run test` still green (licensing.test.ts unchanged);
`bun run generate` succeeds; manual: every feature reachable, no lock badges /
trial banner / upgrade prompts / business cap anywhere.

## Part 2 — Terms acceptance gate

### Flow
- New route **`/terms`**. `app/middleware/tenant.global.ts` gains a FIRST check:
  if the current Terms version hasn't been accepted, redirect any route (except
  `/terms` itself) to `/terms`, before the existing no-active-tenant → `/welcome`
  redirect.
- The `/terms` page (uses the `welcome` layout — titlebar + centered card, no
  app chrome): Sakoram wordmark, the Terms body, a **"I have read and agree to
  the Terms"** `UCheckbox`, and a **Continue** button disabled until checked. On
  Continue → record acceptance → `router.replace("/welcome")` (the tenant
  middleware then routes onward).

### Acceptance storage
- `localStorage` key `sakoram.terms.acceptedVersion` = the accepted
  `TERMS_VERSION` string. Plus `sakoram.terms.acceptedAt` (ISO) for the record.
- A composable **`app/composables/useTerms.ts`**: `TERMS_VERSION` const,
  `accepted` (computed: stored version === current), `accept()` (writes both
  keys). Per-machine (localStorage) — matches the app's other per-machine prefs.
  Bumping `TERMS_VERSION` re-shows the gate.

### Re-readable later
- The Terms body lives in a shared component **`app/components/TermsContent.vue`**
  (presentational — just the copy). Used by both the `/terms` gate page and a new
  **"Terms & conditions"** link in the About modal that opens the same content in
  its own read-only `UModal` (no route change, no agree checkbox). The `/terms`
  route is purely the first-run gate.

### Content (plain English; final copy in the plan)
Covers: free software provided **"as is"** with **no warranty**; **not liable
for any data loss, inaccuracies, or decisions/filings made using the output**;
**you own your data and are responsible for your own backups**; not a substitute
for professional accounting / legal / tax advice; you are responsible for your
own regulatory compliance (e.g. IRD filings); it runs fully offline and stores
data locally in folders you choose. A short, human tone — not a wall of legalese.

## Gravitide visibility

A subtle **"Made by Gravitide"** line + link (to the Gravitide site) on the
Terms screen and in the About modal. Non-intrusive; serves the visibility goal
without nagging. (Welcome-footer credit optional — decide in the plan.)

## Testing

- `useTerms` acceptance logic is pure enough to unit-test (accepted computed vs
  stored version; version bump re-gates). 
- Manual: fresh machine (clear localStorage) → app opens on `/terms`, can't
  proceed until checked; after accept → welcome flow; About → Terms re-opens;
  no licensing UI anywhere; unlimited businesses.

## Open decisions (defaults chosen; flag to change)
- Acceptance in **localStorage**, versioned. ✅
- Gravitide credit on **About + Terms**. ✅
- FeatureLock/UpgradeButton/licensing.ts kept dormant (deleted in a follow-up). ✅
