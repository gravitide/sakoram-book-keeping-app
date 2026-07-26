import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS, BUNDLED_MONO_NAMES, BUNDLED_SANS_NAMES, isBundledFont } from "./fonts";

describe("bundled font registry", () => {
	it("leads with Akt, the default since migration 0024", () => {
		expect(BUNDLED_FONTS[0]?.name).toBe("Akt");
	});

	it("has no duplicate names", () => {
		const names = BUNDLED_FONTS.map((f) => f.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("splits into the six sans and three monospaced faces that ship in src-tauri/fonts", () => {
		expect(BUNDLED_SANS_NAMES).toEqual([
			"Akt",
			"Inter",
			"Inter Tight",
			"Stack Sans Text",
			"Miriam Libre",
			"Amarna"
		]);
		expect(BUNDLED_MONO_NAMES).toEqual([
			"Iosevka Charon Mono",
			"Martian Mono",
			"Google Sans Code"
		]);
	});
});

describe("isBundledFont", () => {
	it("accepts an exact bundled name", () => {
		expect(isBundledFont("Martian Mono")).toBe(true);
	});

	it("is case-sensitive, because Typst resolves family names exactly", () => {
		expect(isBundledFont("akt")).toBe(false);
	});

	it("rejects unknown, empty, null and undefined", () => {
		expect(isBundledFont("Comic Sans MS")).toBe(false);
		expect(isBundledFont("")).toBe(false);
		expect(isBundledFont(null)).toBe(false);
		expect(isBundledFont(undefined)).toBe(false);
	});
});
