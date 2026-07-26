import { describe, expect, it } from "vitest";
import { FONT_LICENCES } from "./font-licences";
import { BUNDLED_FONTS } from "./fonts";

describe("font licence registry", () => {
	// The point of these two: bundling a font without its attribution is an
	// OFL compliance failure, and it's silent. Adding a row to fonts.ts and
	// forgetting font-licences.ts has to fail the build, not ship.
	it("covers every bundled family", () => {
		const licensed = new Set(FONT_LICENCES.map((f) => f.name));
		const missing = BUNDLED_FONTS.map((f) => f.name).filter((n) => !licensed.has(n));
		expect(missing).toEqual([]);
	});

	it("has no attribution for a font that isn't bundled", () => {
		const bundled = new Set(BUNDLED_FONTS.map((f) => f.name));
		const orphans = FONT_LICENCES.map((f) => f.name).filter((n) => !bundled.has(n));
		expect(orphans).toEqual([]);
	});

	it("gives every family a copyright line and a designer", () => {
		for (const f of FONT_LICENCES) {
			expect(f.copyright, f.name).toMatch(/^Copyright /);
			expect(f.designer.trim(), f.name).not.toBe("");
		}
	});

	it("has no duplicate families", () => {
		const names = FONT_LICENCES.map((f) => f.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
