import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDF_LAYOUTS, resolveLayoutKey } from "./pdf-layouts";

describe("resolveLayoutKey", () => {
	it("returns the stored key when it is a known Layout", () => {
		expect(resolveLayoutKey("modern")).toBe("modern");
		expect(resolveLayoutKey("classic")).toBe("classic");
		expect(resolveLayoutKey("compact")).toBe("compact");
	});

	it("falls back to classic for unknown / null stored keys", () => {
		expect(resolveLayoutKey("bogus")).toBe("classic");
		expect(resolveLayoutKey(null)).toBe("classic");
		expect(resolveLayoutKey(undefined)).toBe("classic");
	});

	it("reads the retired Letterhead template as Classic", () => {
		expect(resolveLayoutKey("letterhead")).toBe("classic");
	});
});

describe("the Layout registry", () => {
	it("offers exactly the four Layouts, Classic first — no Letterhead", () => {
		expect(PDF_LAYOUTS.map((l) => l.key)).toEqual(["classic", "modern", "minimal", "compact"]);
	});

	// The Rust render-time validator (document_template in src-tauri/src/pdf.rs)
	// maps each key to its doc-*.typ, and everything else to Classic. The two
	// registries must name the same Layouts or a picked Layout silently renders
	// as Classic.
	it("agrees with the Rust render-time validator", () => {
		const rust = readFileSync(join(__dirname, "../../src-tauri/src/pdf.rs"), "utf8");
		const fn = rust.slice(rust.indexOf("fn document_template"));
		const body = fn.slice(0, fn.indexOf("\n}\n"));
		const arms = [...body.matchAll(/Some\("([a-z]+)"\) => \("doc-([a-z]+)\.typ"/g)].map((m) => [m[1], m[2]]);
		for (const [key, file] of arms) expect(file).toBe(key);
		const rustKeys = arms.map(([key]) => key);
		expect(["classic", ...rustKeys].sort()).toEqual(PDF_LAYOUTS.map((l) => l.key).sort());
		expect(body).toContain("_ => (\"doc-classic.typ\"");
	});
});
