// Derives a filesystem-safe folder name from a business name. Identity is the
// business `id` (in the marker + registry), so this name is cosmetic — it only
// needs to be a legal, readable folder segment on Windows + macOS. Rust appends
// a " (2)" style suffix if the parent already has this folder (see create_tenant).

const RESERVED = new Set([
	"con",
	"prn",
	"aux",
	"nul",
	"com1",
	"com2",
	"com3",
	"com4",
	"com5",
	"com6",
	"com7",
	"com8",
	"com9",
	"lpt1",
	"lpt2",
	"lpt3",
	"lpt4",
	"lpt5",
	"lpt6",
	"lpt7",
	"lpt8",
	"lpt9"
]);

export function safeFolderName(name: string): string {
	let s = Array.from(name)
		// Drop control characters (char code < 32).
		.filter((c) => c.charCodeAt(0) >= 32)
		.join("")
		// Illegal path chars on Windows: \ / : * ? " < > |  → hyphen.
		.replace(/[\\/:*?"<>|]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		// Windows disallows trailing dots/spaces on a path segment.
		.replace(/[.\s]+$/, "")
		// A name made only of illegal chars becomes all hyphens — treat as empty.
		.replace(/^-+|-+$/g, "")
		.slice(0, 64)
		// Re-trim in case the length cap left a trailing dot/space/hyphen.
		.replace(/[.\s-]+$/, "");

	if (RESERVED.has(s.toLowerCase())) s = `${s}_`;
	if (s.length === 0) s = "business";
	return s;
}
