// Builds the R2 release manifest (sakoram/releases.json), which tells the
// marketing site which uploaded build is current for each platform.
//
// Platforms ship independently, so each carries its own version — see
// docs/superpowers/specs/2026-07-25-release-manifest-design.md.
//
// Everything here is pure. The CLI entry point at the bottom is the only part
// that touches the filesystem or stdio. Driven by
// .github/workflows/publish-latest.yml.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
	process.stdin.setEncoding("utf8");
	let data = "";
	for await (const chunk of process.stdin) data += chunk;
	return data.trim();
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
