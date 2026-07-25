# Release manifest publishing — design

**Date:** 2026-07-25
**Status:** approved, ready for planning

## Problem

Sakoram's website advertises a download URL read from
`https://downloads.gravitide.dev/sakoram/latest.json`. Nothing writes that
file. It has been hand-edited twice and has drifted badly:

| | value |
|---|---|
| `latest.json` → `version` | 0.78.3 |
| `latest.json` → `windows` | points at 0.83.0 |
| Last CI build | 0.113.2 — uploaded to R2, never linked |
| `package.json` today | 0.148.1 — never built |

CI **already** builds Windows and macOS installers and mirrors them to R2 at
`sakoram/<version>/<filename>` (`release-windows.yml`, `release-macos.yml`;
all four `R2_*` secrets are configured on the repo). The only missing link is
a manifest that says *which* uploaded version is the current one.

The original request was for a local build-and-upload script. Investigation
showed two thirds of that already exists in CI, so the scope narrowed to the
actual gap: publishing the manifest.

## Goals

- A repeatable, reviewable way to point the website at a specific build.
- Independent versions per platform — Windows, macOS, and a future Linux
  build ship on their own cadence.
- Adding Linux later must not require a schema change or a website change.
- Impossible to advertise a URL that 404s.

## Non-goals

- Building locally. CI already builds; duplicating that invites drift and
  puts R2 keys on a laptop.
- Version bumping, git tagging, or GitHub release creation. The existing
  per-PR bump convention and tag-push trigger stay exactly as they are.
- A Linux *build* workflow. Separate work, whenever it is wanted. This design
  only ensures the manifest and website are not the blocker.
- Version history / older-download listings. Only "what is current" is needed.

## Design

### 1. New manifest: `sakoram/releases.json`

A new object in the same bucket. `latest.json` is left **frozen and
untouched** — anything still pointing at it keeps its current behaviour
rather than breaking.

```json
{
  "schema": 1,
  "updated": "2026-07-25T09:14:00Z",
  "platforms": {
    "windows": {
      "version": "0.148.1",
      "released": "2026-07-25",
      "url": "https://downloads.gravitide.dev/sakoram/0.148.1/Sakoram_0.148.1_x64-setup.exe",
      "filename": "Sakoram_0.148.1_x64-setup.exe",
      "size": 64821760,
      "notes": "Copyable notes & terms on locked documents"
    },
    "mac": {
      "version": "0.78.3",
      "released": "2026-05-25",
      "url": "https://downloads.gravitide.dev/sakoram/0.78.3/Sakoram.Bookkeeping_0.78.3_aarch64.dmg",
      "filename": "Sakoram.Bookkeeping_0.78.3_aarch64.dmg",
      "size": 58236928,
      "notes": "Bug fixes and performance improvements"
    }
  }
}
```

Decisions embedded here:

- **Keyed by platform, not flat.** The old flat shape had a single `version`
  field for two independently-shipped platforms, which is why it drifted.
- **A platform key is absent until that platform ships.** `linux` simply does
  not exist yet. Consumers iterate over what is present rather than checking
  a hardcoded list, so shipping Linux is additive on every side.
- **`notes` is per-platform.** Notes describe a version, and versions differ
  per platform.
- **`size` is included** because the S3 listing returns it for free and it
  lets a download row read `0.148.1 · 62 MB`.
- **`schema: 1`** is a cheap forward-compatibility check.

### 2. `.github/workflows/publish-latest.yml`

Manual trigger only (`workflow_dispatch`), `ubuntu-latest`, roughly 20
seconds. Decoupled from the ~37-minute build, so a typo in the notes costs
seconds, and a build from weeks ago can be promoted without rebuilding.

**Inputs**

| input | type | behaviour |
|---|---|---|
| `version` | required string | `0.113.2`; a leading `v` is stripped |
| `platform` | choice | `windows` · `mac` · `linux`, default `windows` |
| `notes` | optional string | blank carries forward that platform's existing notes |

**Steps**

1. Fail hard if any `R2_*` secret is missing. Deliberately unlike the mirror
   step's soft skip — that skip exists so forks are not coupled to the
   gravitide.dev bucket, but a *manual* promote with no credentials is a
   mistake, not a fork.
2. `aws s3 ls s3://$R2_BUCKET/sakoram/$version/` to derive the filename, size
   and upload date **and** prove the artifact exists. Listing rather than
   pattern-guessing is what makes the historical `Sakoram.Bookkeeping_*` →
   `Sakoram_*` productName rename a non-issue, with no hardcoded filename
   template. Pick by extension: `-setup.exe` → windows, `.dmg` → mac,
   `.AppImage`/`.deb` → linux.

   `released` is taken from the listed object's `LastModified` date, **not**
   from the promote date. Promoting June's 0.113.2 build today must report it
   as released in June; using the run date would silently backdate-shift every
   late promotion.
3. Read the current `releases.json` (absent is fine — start from an empty
   skeleton).
4. Merge only the selected platform's entry.
5. PUT with `--content-type application/json --cache-control "public, max-age=60"`.
6. Write a before/after diff to `$GITHUB_STEP_SUMMARY` so the run page shows
   exactly what moved.

`concurrency: { group: sakoram-r2-manifest, cancel-in-progress: false }`
serializes runs. Concurrency groups are repo-wide by name, so this also holds
if the job is ever called from more than one workflow — two runs cannot
interleave a read-modify-write and silently drop a platform.

The two release workflows are **not modified**. They already upload
correctly, and a 37-minute build path that works is not worth the risk.

### 3. `scripts/release-manifest.mjs` + `tests/release-manifest.spec.ts`

The merge is the only part with real behaviour, so it is a pure function in
its own module with a vitest suite, matching the project's established
"pure logic is unit-tested, I/O is not" convention.

Two placement notes:

- **`.mjs`, not `.ts`** (unlike `scripts/tauri-dev.ts`) so the workflow can
  run it with plain `node` on `ubuntu-latest` with no TypeScript toolchain
  in the job.
- **The test goes in `tests/`**, not next to the module. `vitest.config.ts`
  includes only `tests/**/*.spec.ts` and `app/**/*.test.ts`, so a
  `scripts/*.test.ts` would silently never run. Using `tests/` needs no
  config change and matches the existing `money.spec.ts` /
  `numbering.spec.ts` / `payroll-cycle.spec.ts` suites.

```
mergeRelease(existing, { platform, version, released, url, filename, size, notes })
  → next manifest
```

Covered by tests:

- adds a platform that was absent
- updates a platform that was present, leaving other platforms byte-identical
- carries forward existing `notes` when none is supplied
- replaces `notes` when one is supplied
- strips a leading `v` from the version
- rejects an unknown platform key
- rejects a malformed / non-object existing manifest rather than overwriting
- stamps `updated` and preserves `schema`

The workflow shells JSON through this module; it contains no AWS calls.

### 4. Version bump

Per the project convention, this PR bumps the patch version across
`package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`
(plus the `Cargo.lock` refresh) — this is tooling, not a user-facing feature.

## Error handling

- **Version not present in R2** → fail, and print `aws s3 ls s3://$R2_BUCKET/sakoram/`
  so the available versions are visible in the log.
- **No artifact of the expected type in that prefix** (e.g. `platform=mac`
  but the folder holds only `.exe`) → fail before writing.
- **Existing `releases.json` is malformed** → fail rather than overwrite.
  This is what protects the other platforms' entries from being lost to a
  parse error.
- **Write is a single atomic PUT**, so there is no half-updated state.

## Verification

Workflows cannot be unit-tested, so verification is a real run:

1. `bun run test` — the `mergeRelease` suite passes.
2. Dispatch with `version=0.113.2 platform=windows`. This promotes the build
   that has been sitting unreferenced in R2 since June.
3. `curl https://downloads.gravitide.dev/sakoram/releases.json` and confirm:
   `platforms.windows.version` is `0.113.2`, the URL resolves (HTTP 200), and
   `size` matches the object.
4. Dispatch again with `platform=mac version=0.78.3` and confirm the windows
   entry is untouched.
5. Dispatch with a bad version and confirm it fails with the available-versions
   listing rather than writing anything.

## Follow-up work (out of scope here)

`sakoram_website` currently has downloads disabled: the `#download` section
is three inert placeholder rows (Windows, macOS, **and Linux** — the Linux
icon and row already exist in the markup), and only the hero button reads the
old `latest.json`. Once this design is shipped and verified, a separate
session rewrites that site against `releases.json`:

- `vite.config.js` — fetch `releases.json`, reshape the compile-time fallback.
- `Home.vue` — `platforms` replaces `downloadInfo`; `detectOS` gains a `linux`
  branch; the three download rows become data-driven, going live when their
  platform key is present and keeping the existing "soon" state when absent;
  the dead `extractVersion` helper is deleted.

Because `Home.vue` already re-fetches at runtime, once that ships **once**,
every future promote goes live with no site redeploy.
