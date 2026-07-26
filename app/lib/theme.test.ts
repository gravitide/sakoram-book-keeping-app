import { describe, expect, it } from "vitest";
import { isHexColor, THEME_COLORS, themeHex } from "./theme";

describe("isHexColor", () => {
	it("accepts 6-digit and 3-digit hex, case-insensitively", () => {
		expect(isHexColor("#1d4ed8")).toBe(true);
		expect(isHexColor("#1D4ED8")).toBe(true);
		expect(isHexColor("#fff")).toBe(true);
	});

	it("tolerates surrounding whitespace", () => {
		expect(isHexColor("  #1d4ed8  ")).toBe(true);
	});

	it("rejects malformed values", () => {
		expect(isHexColor("#12345")).toBe(false);
		expect(isHexColor("#12")).toBe(false);
		expect(isHexColor("1d4ed8")).toBe(false);
		expect(isHexColor("#gggggg")).toBe(false);
		expect(isHexColor("blue")).toBe(false);
		expect(isHexColor("")).toBe(false);
		expect(isHexColor(null)).toBe(false);
		expect(isHexColor(undefined)).toBe(false);
	});
});

describe("themeHex", () => {
	it("resolves a preset name to its hex", () => {
		const blue = THEME_COLORS.find((c) => c.value === "blue")!;
		expect(themeHex("blue")).toBe(blue.hex);
	});

	it("passes a custom hex straight through", () => {
		expect(themeHex("#1d4ed8")).toBe("#1d4ed8");
	});

	it("normalises case and trims a custom hex", () => {
		expect(themeHex("  #AABBCC  ")).toBe("#aabbcc");
	});

	// The whole point of the passthrough: without it these would silently
	// render the red fallback on every generated PDF.
	it("does not fall back to red for a valid custom hex", () => {
		expect(themeHex("#000000")).not.toBe("#ef4444");
		expect(themeHex("#fff")).toBe("#fff");
	});

	it("falls back to red for malformed or unknown values", () => {
		expect(themeHex("#12345")).toBe("#ef4444");
		expect(themeHex("nonsense")).toBe("#ef4444");
		expect(themeHex(null)).toBe("#ef4444");
		expect(themeHex(undefined)).toBe("#ef4444");
	});
});
