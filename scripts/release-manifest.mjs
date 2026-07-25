// Builds the R2 release manifest (sakoram/releases.json), which tells the
// marketing site which uploaded build is current for each platform.
//
// Platforms ship independently, so each carries its own version — see
// docs/superpowers/specs/2026-07-25-release-manifest-design.md.
//
// Everything here is pure. The CLI entry point at the bottom is the only part
// that touches the filesystem or stdio. Driven by
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
