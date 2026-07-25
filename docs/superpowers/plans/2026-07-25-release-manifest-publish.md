# Release Manifest Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually-triggered GitHub workflow that points `sakoram/releases.json` in Cloudflare R2 at a specific already-uploaded build, per platform.

**Architecture:** CI already builds installers and mirrors them to R2 at `sakoram/<version>/<filename>`. The only gap is a manifest saying which uploaded version is current. A new `workflow_dispatch` workflow lists the R2 prefix to discover the artifact (filename, size, upload date), pipes the existing manifest through a pure Node merge module, and writes the result back as a single atomic PUT. All the real logic lives in one small pure module with a vitest suite; the workflow is thin shell glue around `aws` calls.

**Tech Stack:** GitHub Actions (`ubuntu-latest`), AWS CLI v2 against the R2 S3-compatible endpoint, Node ESM (preinstalled on the runner), vitest.

**Spec:** `docs/superpowers/specs/2026-07-25-release-manifest-design.md`

## Global Constraints

- **Lint style is enforced** (`eslint.config.mjs`): **tab** indentation, **double** quotes, semicolons always, **no** trailing commas, `1tbs` brace style. `scripts/` is NOT in the ignore list, so the new module is linted. Run `bun run lint` before committing.
- **Package manager is `bun` only.** Use `bun run test`, `bun run lint`. Never `npm`/`yarn`/`pnpm` (a `preinstall` hook blocks them).
- **Vitest only picks up `tests/**/*.spec.ts` and `app/**/*.test.ts`** (`vitest.config.ts:7`). A test placed in `scripts/` would silently never run — the suite MUST go in `tests/`.
- **The module is `.mjs`, not `.ts`**, so the workflow runs it with plain `node` and needs no TypeScript toolchain in the job.
- **Never interpolate `${{ inputs.* }}` directly into a `run:` block.** Free-text inputs (`notes`) are a shell-injection vector. Pass every input through `env:` and reference it as `"$INPUT_NOTES"`.
- **Do NOT modify `release-windows.yml` or `release-macos.yml`.** They already upload correctly; a working 37-minute build path is not worth the risk.
- **Do NOT touch `sakoram/latest.json`.** It stays frozen. The website migration is separate follow-up work.
- **`released` comes from the R2 object's `LastModified`**, never from the promote date. Promoting an old build must report its real upload date.
- Use `actions/checkout@v5` (v4 runs on the deprecated Node 20).
- Manifest constants: object key `sakoram/releases.json`, public base URL `https://downloads.gravitide.dev`, `schema: 1`.

---

### Task 1: Artifact discovery — `normalizeVersion` + `pickArtifact`

Turns a raw `list-objects-v2` response into the one artifact that represents a platform. This is the piece most likely to break silently (the productName rename means historical files are `Sakoram.Bookkeeping_*` and new ones are `Sakoram_*`), so it is matched by extension and unit-tested.

**Files:**
- Create: `scripts/release-manifest.mjs`
- Create: `tests/release-manifest.spec.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `PLATFORMS: string[]` — `["windows", "mac", "linux"]`
  - `normalizeVersion(raw: string) => string` — strips a leading `v`, throws on junk
  - `pickArtifact(contents, platform) => { filename: string, size: number, released: string }` where `contents` is the `Contents` array from `aws s3api list-objects-v2` (`{ Key, Size, LastModified }`) and `released` is a `YYYY-MM-DD` date

- [ ] **Step 1: Write the failing test**

Create `tests/release-manifest.spec.ts`:

```ts
// Tests for the pure parts of the R2 release-manifest builder. The AWS calls
// and stdin/stdout glue live in the CLI entry point and the workflow, which
// are verified by a real dispatch run instead.

import { describe, expect, it } from "vitest";
import { normalizeVersion, pickArtifact } from "../scripts/release-manifest.mjs";

// Shaped like a real `aws s3api list-objects-v2 --output json` Contents array.
// CI uploads BOTH an .msi and an NSIS -setup.exe for Windows.
const WINDOWS_LISTING = [
	{
		Key: "sakoram/0.113.2/Sakoram_0.113.2_x64_en-US.msi",
		Size: 61000000,
		LastModified: "2026-06-07T17:36:52+00:00"
	},
	{
		Key: "sakoram/0.113.2/Sakoram_0.113.2_x64-setup.exe",
		Size: 64821760,
		LastModified: "2026-06-07T17:36:58+00:00"
	}
];

describe("normalizeVersion", () => {
	it("strips a leading v", () => {
		expect(normalizeVersion("v0.113.2")).toBe("0.113.2");
		expect(normalizeVersion("V0.113.2")).toBe("0.113.2");
	});

	it("passes a bare version through, trimming whitespace", () => {
		expect(normalizeVersion("0.148.1")).toBe("0.148.1");
		expect(normalizeVersion("  0.148.1  ")).toBe("0.148.1");
	});

	it("rejects junk", () => {
		expect(() => normalizeVersion("")).toThrow();
		expect(() => normalizeVersion("latest")).toThrow();
		expect(() => normalizeVersion("0.1")).toThrow();
	});
});

describe("pickArtifact", () => {
	it("prefers the NSIS setup.exe over the msi for windows", () => {
		const artifact = pickArtifact(WINDOWS_LISTING, "windows");
		expect(artifact.filename).toBe("Sakoram_0.113.2_x64-setup.exe");
		expect(artifact.size).toBe(64821760);
	});

	it("reports the object's upload date, not today", () => {
		expect(pickArtifact(WINDOWS_LISTING, "windows").released).toBe("2026-06-07");
	});

	it("matches the historical productName filenames too", () => {
		const legacy = [{
			Key: "sakoram/0.78.3/Sakoram.Bookkeeping_0.78.3_aarch64.dmg",
			Size: 58236928,
			LastModified: "2026-05-25T02:59:10+00:00"
		}];
		expect(pickArtifact(legacy, "mac").filename).toBe("Sakoram.Bookkeeping_0.78.3_aarch64.dmg");
	});

	it("picks the newest upload when a version folder was re-uploaded", () => {
		const duplicated = [
			{ Key: "sakoram/1.0.0/Sakoram_1.0.0_x64-setup.exe", Size: 1, LastModified: "2026-01-01T00:00:00+00:00" },
			{ Key: "sakoram/1.0.0/Sakoram_1.0.0_x64-setup.exe", Size: 2, LastModified: "2026-02-01T00:00:00+00:00" }
		];
		expect(pickArtifact(duplicated, "windows").size).toBe(2);
	});

	it("throws when the platform has no artifact in the folder", () => {
		expect(() => pickArtifact(WINDOWS_LISTING, "mac")).toThrow(/no mac artifact/i);
	});

	it("throws on an unknown platform", () => {
		expect(() => pickArtifact(WINDOWS_LISTING, "solaris")).toThrow(/unknown platform/i);
	});

	it("tolerates an empty or missing listing", () => {
		expect(() => pickArtifact([], "windows")).toThrow(/no windows artifact/i);
		expect(() => pickArtifact(undefined, "windows")).toThrow(/no windows artifact/i);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun run test tests/release-manifest.spec.ts
```

Expected: FAIL — cannot resolve `../scripts/release-manifest.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/release-manifest.mjs`:

```js
// Builds the R2 release manifest (sakoram/releases.json), which tells the
// marketing site which uploaded build is current for each platform.
//
// Platforms ship independently, so each carries its own version — see
// docs/superpowers/specs/2026-07-25-release-manifest-design.md.
//
// Everything here is pure. The CLI entry point added in Task 3 is the only
// part that touches the filesystem or stdio. Driven by
// .github/workflows/publish-latest.yml.

export const SCHEMA_VERSION = 1;

export const PLATFORMS = ["windows", "mac", "linux"];

// Which uploaded artifact represents each platform. CI uploads BOTH an .msi
// and an NSIS -setup.exe for Windows; we advertise the -setup.exe because
// it's the friendlier double-click installer. Matching on extension rather
// than a filename template is what makes the historical
// `Sakoram.Bookkeeping_*` -> `Sakoram_*` productName rename a non-issue.
const ARTIFACT_MATCHERS = {
	windows: (filename) => filename.endsWith("-setup.exe"),
	mac: (filename) => filename.endsWith(".dmg"),
	linux: (filename) => filename.endsWith(".AppImage") || filename.endsWith(".deb")
};

export function normalizeVersion(raw) {
	const version = String(raw ?? "").trim().replace(/^v/i, "");
	if (!/^\d+\.\d+\.\d+/.test(version))
		throw new Error(`Invalid version ${JSON.stringify(raw)} — expected something like 0.148.1`);
	return version;
}

export function pickArtifact(contents, platform) {
	if (!PLATFORMS.includes(platform))
		throw new Error(`Unknown platform ${JSON.stringify(platform)} — expected one of ${PLATFORMS.join(", ")}`);

	const matches = (contents ?? [])
		.filter((object) => object && typeof object.Key === "string")
		.map((object) => ({ ...object, filename: object.Key.split("/").pop() }))
		.filter((object) => ARTIFACT_MATCHERS[platform](object.filename));

	if (matches.length === 0) {
		const seen = (contents ?? []).map((object) => object?.Key).filter(Boolean).join(", ");
		throw new Error(`No ${platform} artifact found. Saw: ${seen || "(nothing)"}`);
	}

	// Newest upload wins if a version folder was ever re-uploaded.
	matches.sort((a, b) => Date.parse(b.LastModified) - Date.parse(a.LastModified));
	const winner = matches[0];

	return {
		filename: winner.filename,
		size: winner.Size,
		released: String(winner.LastModified).slice(0, 10)
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun run test tests/release-manifest.spec.ts
```

Expected: PASS, 10 tests.

If the import of a `.mjs` module from a `.ts` test trips the TypeScript language server in your editor, ignore it — vitest does not typecheck, and `bun run lint` is the gate. Only act if `bun run lint` actually reports it.

- [ ] **Step 5: Lint**

```bash
bun run lint
```

Expected: clean. Fix any tab/quote/semicolon violations it does not auto-fix.

- [ ] **Step 6: Commit**

```bash
git add scripts/release-manifest.mjs tests/release-manifest.spec.ts
git commit -m "feat: artifact discovery for the R2 release manifest"
```

---

### Task 2: Manifest merge — `mergeRelease`

Merges one platform's entry into the existing manifest without disturbing the others. This is the function that protects the other platforms' URLs, so its failure modes are tested as carefully as its happy path.

**Files:**
- Modify: `scripts/release-manifest.mjs` (append)
- Modify: `tests/release-manifest.spec.ts` (append)

**Interfaces:**
- Consumes: `PLATFORMS`, `SCHEMA_VERSION`, `normalizeVersion` from Task 1.
- Produces:
  - `buildUrl(baseUrl: string, version: string, filename: string) => string`
  - `mergeRelease(existing: object | null, entry, now?: Date) => object` where `entry` is `{ platform, version, released, url, filename, size, notes }` and the result is `{ schema, updated, platforms }`

- [ ] **Step 1: Write the failing test**

Append to `tests/release-manifest.spec.ts` — add `buildUrl` and `mergeRelease` to the existing import from `../scripts/release-manifest.mjs`, then add:

```ts
const NOW = new Date("2026-07-25T09:14:00.000Z");

const WINDOWS_ENTRY = {
	platform: "windows",
	version: "0.113.2",
	released: "2026-06-07",
	url: "https://downloads.gravitide.dev/sakoram/0.113.2/Sakoram_0.113.2_x64-setup.exe",
	filename: "Sakoram_0.113.2_x64-setup.exe",
	size: 64821760,
	notes: "Reports module"
};

const MAC_ENTRY = {
	platform: "mac",
	version: "0.78.3",
	released: "2026-05-25",
	url: "https://downloads.gravitide.dev/sakoram/0.78.3/Sakoram.Bookkeeping_0.78.3_aarch64.dmg",
	filename: "Sakoram.Bookkeeping_0.78.3_aarch64.dmg",
	size: 58236928,
	notes: "Bug fixes"
};

describe("buildUrl", () => {
	it("joins the download base with the versioned key", () => {
		expect(buildUrl("https://downloads.gravitide.dev", "0.113.2", "a.exe"))
			.toBe("https://downloads.gravitide.dev/sakoram/0.113.2/a.exe");
	});

	it("tolerates a trailing slash on the base", () => {
		expect(buildUrl("https://downloads.gravitide.dev/", "0.113.2", "a.exe"))
			.toBe("https://downloads.gravitide.dev/sakoram/0.113.2/a.exe");
	});
});

describe("mergeRelease", () => {
	it("creates a manifest when none exists", () => {
		const manifest = mergeRelease(null, WINDOWS_ENTRY, NOW);
		expect(manifest.schema).toBe(1);
		expect(manifest.updated).toBe("2026-07-25T09:14:00.000Z");
		expect(manifest.platforms.windows.version).toBe("0.113.2");
		expect(manifest.platforms.windows.released).toBe("2026-06-07");
		expect(manifest.platforms.windows.size).toBe(64821760);
	});

	it("omits a platform that has never shipped", () => {
		const manifest = mergeRelease(null, WINDOWS_ENTRY, NOW);
		expect(Object.keys(manifest.platforms)).toEqual(["windows"]);
		expect(manifest.platforms.linux).toBeUndefined();
	});

	it("leaves other platforms byte-identical when updating one", () => {
		const first = mergeRelease(null, MAC_ENTRY, NOW);
		const second = mergeRelease(first, WINDOWS_ENTRY, NOW);
		expect(second.platforms.mac).toEqual(first.platforms.mac);
		expect(second.platforms.windows.version).toBe("0.113.2");
	});

	it("carries forward existing notes when none are supplied", () => {
		const first = mergeRelease(null, WINDOWS_ENTRY, NOW);
		const second = mergeRelease(first, { ...WINDOWS_ENTRY, version: "0.148.1", notes: "" }, NOW);
		expect(second.platforms.windows.notes).toBe("Reports module");
		expect(second.platforms.windows.version).toBe("0.148.1");
	});

	it("replaces notes when supplied, trimming whitespace", () => {
		const first = mergeRelease(null, WINDOWS_ENTRY, NOW);
		const second = mergeRelease(first, { ...WINDOWS_ENTRY, notes: "  Copyable notes  " }, NOW);
		expect(second.platforms.windows.notes).toBe("Copyable notes");
	});

	it("defaults notes to an empty string for a brand-new platform", () => {
		const manifest = mergeRelease(null, { ...WINDOWS_ENTRY, notes: "" }, NOW);
		expect(manifest.platforms.windows.notes).toBe("");
	});

	it("normalizes a v-prefixed version", () => {
		const manifest = mergeRelease(null, { ...WINDOWS_ENTRY, version: "v0.113.2" }, NOW);
		expect(manifest.platforms.windows.version).toBe("0.113.2");
	});

	it("rejects an unknown platform", () => {
		expect(() => mergeRelease(null, { ...WINDOWS_ENTRY, platform: "solaris" }, NOW))
			.toThrow(/unknown platform/i);
	});

	it("refuses to overwrite a malformed manifest", () => {
		expect(() => mergeRelease([], WINDOWS_ENTRY, NOW)).toThrow(/refusing to overwrite/i);
		expect(() => mergeRelease("nope", WINDOWS_ENTRY, NOW)).toThrow(/refusing to overwrite/i);
		expect(() => mergeRelease({ platforms: [] }, WINDOWS_ENTRY, NOW)).toThrow(/refusing to overwrite/i);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun run test tests/release-manifest.spec.ts
```

Expected: FAIL — `mergeRelease is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `scripts/release-manifest.mjs`:

```js
export function buildUrl(baseUrl, version, filename) {
	return `${String(baseUrl).replace(/\/+$/, "")}/sakoram/${version}/${filename}`;
}

// A malformed existing manifest is a hard failure rather than something we
// paper over — silently starting from scratch would drop the OTHER platforms'
// download URLs, which is exactly the data this file exists to protect.
function readExistingPlatforms(existing) {
	if (existing === null || existing === undefined) return {};
	if (typeof existing !== "object" || Array.isArray(existing))
		throw new Error("Existing manifest is not a JSON object — refusing to overwrite it.");

	const platforms = existing.platforms ?? {};
	if (typeof platforms !== "object" || Array.isArray(platforms))
		throw new Error("Existing manifest has a malformed `platforms` key — refusing to overwrite it.");

	return platforms;
}

export function mergeRelease(existing, entry, now = new Date()) {
	if (!PLATFORMS.includes(entry.platform))
		throw new Error(`Unknown platform ${JSON.stringify(entry.platform)} — expected one of ${PLATFORMS.join(", ")}`);

	const platforms = readExistingPlatforms(existing);
	const supplied = String(entry.notes ?? "").trim();
	const notes = supplied || platforms[entry.platform]?.notes || "";

	return {
		schema: SCHEMA_VERSION,
		updated: now.toISOString(),
		platforms: {
			...platforms,
			[entry.platform]: {
				version: normalizeVersion(entry.version),
				released: entry.released,
				url: entry.url,
				filename: entry.filename,
				size: entry.size,
				notes
			}
		}
	};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun run test tests/release-manifest.spec.ts
```

Expected: PASS, 20 tests total.

- [ ] **Step 5: Lint and commit**

```bash
bun run lint
git add scripts/release-manifest.mjs tests/release-manifest.spec.ts
git commit -m "feat: merge logic for the R2 release manifest"
```

---

### Task 3: CLI entry point

Thin glue so the workflow can call the module: reads the current manifest on stdin, reads the R2 listing from a file, writes the merged manifest to stdout. Kept minimal because it is the one part with no unit tests.

**Files:**
- Modify: `scripts/release-manifest.mjs` (append imports at top, CLI at bottom)

**Interfaces:**
- Consumes: `normalizeVersion`, `pickArtifact`, `buildUrl`, `mergeRelease` from Tasks 1–2.
- Produces: CLI contract used by Task 4:
  ```
  node scripts/release-manifest.mjs \
    --platform windows --version 0.113.2 \
    --listing listing.json --base-url https://downloads.gravitide.dev \
    --notes "..."            # empty string = carry forward
    < current.json > next.json
  ```
  Empty stdin means "no manifest yet". Exit code 1 with a one-line message on any failure.

- [ ] **Step 1: Add the imports at the very top of the file**

Insert above `export const SCHEMA_VERSION = 1;` (after the header comment):

```js
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
```

- [ ] **Step 2: Append the CLI to the bottom of `scripts/release-manifest.mjs`**

```js
function parseArgs(argv) {
	const args = {};
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index];
		if (!key.startsWith("--"))
			throw new Error(`Unexpected argument ${JSON.stringify(key)}`);
		args[key.slice(2)] = argv[index + 1] ?? "";
	}
	return args;
}

async function readStdin() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const version = normalizeVersion(args.version);

	const listing = JSON.parse(readFileSync(args.listing, "utf8"));
	const artifact = pickArtifact(listing.Contents, args.platform);

	// Empty stdin means the manifest doesn't exist in the bucket yet.
	const raw = await readStdin();
	const existing = raw ? JSON.parse(raw) : null;

	const next = mergeRelease(existing, {
		platform: args.platform,
		version,
		released: artifact.released,
		url: buildUrl(args["base-url"], version, artifact.filename),
		filename: artifact.filename,
		size: artifact.size,
		notes: args.notes ?? ""
	});

	process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
}

// Only runs when invoked directly, so the test suite can import the pure
// helpers above without triggering any I/O.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error.message);
		process.exit(1);
	});
}
```

- [ ] **Step 3: Verify the unit tests still pass (importing must not run the CLI)**

```bash
bun run test tests/release-manifest.spec.ts
```

Expected: PASS, 20 tests. If the suite hangs, the `import.meta.url` guard is wrong — importing the module must never call `main()`.

- [ ] **Step 4: Smoke-test the CLI end to end**

```bash
cat > /tmp/listing.json <<'JSON'
{"Contents":[{"Key":"sakoram/0.113.2/Sakoram_0.113.2_x64-setup.exe","Size":64821760,"LastModified":"2026-06-07T17:36:58+00:00"}]}
JSON
printf '' | node scripts/release-manifest.mjs --platform windows --version v0.113.2 --listing /tmp/listing.json --base-url https://downloads.gravitide.dev --notes "Reports module"
```

Expected output — confirm `released` is `2026-06-07` (the object date), NOT today:

```json
{
  "schema": 1,
  "updated": "...",
  "platforms": {
    "windows": {
      "version": "0.113.2",
      "released": "2026-06-07",
      "url": "https://downloads.gravitide.dev/sakoram/0.113.2/Sakoram_0.113.2_x64-setup.exe",
      "filename": "Sakoram_0.113.2_x64-setup.exe",
      "size": 64821760,
      "notes": "Reports module"
    }
  }
}
```

- [ ] **Step 5: Smoke-test the failure path**

```bash
printf 'not json' | node scripts/release-manifest.mjs --platform windows --version 0.113.2 --listing /tmp/listing.json --base-url https://downloads.gravitide.dev --notes ""; echo "exit=$?"
```

Expected: a one-line error and `exit=1` — not a stack trace, not `exit=0`.

- [ ] **Step 6: Lint and commit**

```bash
bun run lint
git add scripts/release-manifest.mjs
git commit -m "feat: CLI entry point for the release manifest builder"
```

---

### Task 4: The `publish-latest` workflow

**Files:**
- Create: `.github/workflows/publish-latest.yml`

**Interfaces:**
- Consumes: the Task 3 CLI contract; repo secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET` (all already configured).
- Produces: `sakoram/releases.json` in the R2 bucket.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Publish latest

# Points sakoram/releases.json at a build that is ALREADY uploaded to R2 by
# release-windows.yml / release-macos.yml. It does not build anything, so it
# finishes in seconds and an old build can be promoted without a rebuild.
#
# Deliberately manual: a successful build should not silently become the
# public download. Run this when you've decided a build is good.
#
# latest.json (the old flat manifest) is intentionally left frozen — the
# website migration to releases.json is separate work.

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Version already uploaded to R2, e.g. 0.113.2"
        required: true
        type: string
      platform:
        description: "Platform to promote"
        required: true
        default: windows
        type: choice
        options:
          - windows
          - mac
          - linux
      notes:
        description: "Release notes (leave blank to keep this platform's existing notes)"
        required: false
        type: string

# Serializes runs so two promotions can't interleave a read-modify-write and
# silently drop a platform. Concurrency groups are repo-wide by name.
concurrency:
  group: sakoram-r2-manifest
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    env:
      AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
      AWS_DEFAULT_REGION: auto
      R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
      R2_BUCKET: ${{ secrets.R2_BUCKET }}
      DOWNLOAD_BASE_URL: https://downloads.gravitide.dev
      MANIFEST_KEY: sakoram/releases.json
      # Inputs go through env, never straight into a run block — `notes` is
      # free text and would otherwise be a shell-injection vector.
      INPUT_VERSION: ${{ inputs.version }}
      INPUT_PLATFORM: ${{ inputs.platform }}
      INPUT_NOTES: ${{ inputs.notes }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v5

      - name: Check R2 credentials
        shell: bash
        run: |
          set -euo pipefail
          # Unlike the release workflows' mirror step (which skips quietly so
          # forks aren't coupled to this bucket), a MANUAL promote with no
          # credentials is a mistake, not a fork. Fail loudly.
          missing=0
          for name in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY R2_ACCOUNT_ID R2_BUCKET; do
            if [ -z "${!name:-}" ]; then
              echo "::error::$name is not configured on this repository."
              missing=1
            fi
          done
          [ "$missing" -eq 0 ]

      - name: Resolve the artifact in R2
        id: resolve
        shell: bash
        run: |
          set -euo pipefail
          version="${INPUT_VERSION#v}"
          version="${version#V}"
          endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
          echo "version=$version"     >> "$GITHUB_OUTPUT"
          echo "endpoint=$endpoint"   >> "$GITHUB_OUTPUT"

          aws s3api list-objects-v2 \
            --bucket "$R2_BUCKET" \
            --prefix "sakoram/$version/" \
            --endpoint-url "$endpoint" \
            --output json > listing.json

          count=$(node -p "(JSON.parse(require('fs').readFileSync('listing.json','utf8')).Contents||[]).length")
          if [ "$count" = "0" ]; then
            echo "::error::Nothing uploaded under sakoram/$version/ in $R2_BUCKET."
            echo "Versions that DO exist:"
            aws s3 ls "s3://$R2_BUCKET/sakoram/" --endpoint-url "$endpoint" || true
            exit 1
          fi
          echo "Found $count object(s) under sakoram/$version/"

      - name: Read the current manifest
        shell: bash
        run: |
          set -euo pipefail
          # Absent is fine — the CLI treats empty stdin as "no manifest yet".
          if aws s3 cp "s3://$R2_BUCKET/$MANIFEST_KEY" current.json \
               --endpoint-url "${{ steps.resolve.outputs.endpoint }}" 2>/dev/null; then
            echo "Existing manifest:"
            cat current.json
          else
            echo "No manifest at $MANIFEST_KEY yet — starting fresh."
            : > current.json
          fi

      - name: Merge the release into the manifest
        shell: bash
        run: |
          set -euo pipefail
          node scripts/release-manifest.mjs \
            --platform "$INPUT_PLATFORM" \
            --version "${{ steps.resolve.outputs.version }}" \
            --listing listing.json \
            --base-url "$DOWNLOAD_BASE_URL" \
            --notes "$INPUT_NOTES" \
            < current.json > next.json
          echo "Merged manifest:"
          cat next.json

      - name: Upload the manifest
        shell: bash
        run: |
          set -euo pipefail
          aws s3 cp next.json "s3://$R2_BUCKET/$MANIFEST_KEY" \
            --endpoint-url "${{ steps.resolve.outputs.endpoint }}" \
            --content-type application/json \
            --cache-control "public, max-age=60"

      - name: Summary
        if: always()
        shell: bash
        run: |
          set -euo pipefail
          {
            echo "### Promoted \`$INPUT_PLATFORM\` → \`${{ steps.resolve.outputs.version }}\`"
            echo
            echo "<details><summary>Before</summary>"
            echo
            echo '```json'
            cat current.json 2>/dev/null || echo "(no manifest)"
            echo '```'
            echo
            echo "</details>"
            echo
            echo "**After**"
            echo
            echo '```json'
            cat next.json 2>/dev/null || echo "(not written — the run failed)"
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 2: Validate the YAML parses**

```bash
node -e "const{readFileSync}=require('fs');const s=readFileSync('.github/workflows/publish-latest.yml','utf8');if(!s.includes('workflow_dispatch'))process.exit(1);console.log('read ok,',s.split('\n').length,'lines')"
```

Then confirm GitHub accepts it — after pushing the branch, `gh workflow list` should include "Publish latest". A YAML syntax error makes it silently absent.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-latest.yml
git commit -m "feat: publish-latest workflow writing releases.json to R2"
```

---

### Task 5: Version bump and handoff notes

**Files:**
- Modify: `package.json` (`version`)
- Modify: `src-tauri/Cargo.toml` (`[package].version`)
- Modify: `src-tauri/tauri.conf.json` (`version`)
- Modify: `src-tauri/Cargo.lock` (the `sakoram_billing` version line)
- Modify: `CLAUDE.md` (workflows list)

- [ ] **Step 1: Bump 0.148.1 → 0.148.2 in all three files**

Patch bump — this is tooling, not a user-facing feature. Set `"version": "0.148.2"` in `package.json` and `src-tauri/tauri.conf.json`, and `version = "0.148.2"` under `[package]` in `src-tauri/Cargo.toml`. Then update the `sakoram_billing` entry in `src-tauri/Cargo.lock` to match (edit the version line directly — `cargo` may not be able to refresh it if a build holds the lock).

- [ ] **Step 2: Verify all four agree**

```bash
grep -n '"version"' package.json src-tauri/tauri.conf.json && grep -n -m1 -A1 'name = "sakoram_billing"' src-tauri/Cargo.toml src-tauri/Cargo.lock
```

Expected: `0.148.2` in every hit.

- [ ] **Step 3: Document the workflow in CLAUDE.md**

In the project-layout tree, under the `.github/workflows/` block, add a third entry after `release-macos.yml`:

```
   └─ publish-latest.yml            ← manual workflow_dispatch that points sakoram/releases.json in R2 at an already-uploaded build, per platform (windows/mac/linux). Doesn't build anything. Merge logic is the pure, unit-tested scripts/release-manifest.mjs. latest.json (the old flat manifest the website still reads) is deliberately left frozen — migrating the site to releases.json is separate work.
```

- [ ] **Step 4: Full gate**

```bash
bun run test && bun run lint
```

Expected: all suites pass, lint clean.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "chore: bump to 0.148.2 and document the publish-latest workflow"
git push -u origin feat/release-manifest-publish
```

Do NOT open the PR — wait for the user to ask.

---

## Post-merge verification (requires the user; needs `main`)

`workflow_dispatch` only appears in the Actions UI once the workflow is on the default branch, so these steps run **after** the PR merges. They are the real test of Task 4.

- [ ] Dispatch with `version=0.113.2`, `platform=windows`, notes blank. Promotes the build sitting unreferenced in R2 since June.
- [ ] `curl https://downloads.gravitide.dev/sakoram/releases.json` — confirm `platforms.windows.version` is `0.113.2` and `released` is `2026-06-07` (the upload date, not the promote date).
- [ ] `curl -I` the `platforms.windows.url` — expect HTTP 200 and a `content-length` matching `size`.
- [ ] Dispatch again with `version=0.78.3`, `platform=mac`. Confirm the `windows` entry is unchanged and `mac` is added.
- [ ] Dispatch with `version=9.9.9`. Confirm it fails at "Resolve the artifact in R2", prints the available versions, and leaves `releases.json` untouched.

## Follow-up (not in this plan)

`sakoram_website` still reads the frozen `latest.json`, and its `#download` section is three inert placeholder rows. Rewriting it against `releases.json` — dynamic per-platform rows, Linux OS detection, deleting the dead `extractVersion` helper — is a separate session in that repo, per the spec.
