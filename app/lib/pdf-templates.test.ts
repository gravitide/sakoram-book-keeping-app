import { describe, expect, it } from "vitest";
import { resolveTemplateKey } from "./pdf-templates";

describe("resolveTemplateKey", () => {
	it("returns the stored key when it is a known template", () => {
		expect(resolveTemplateKey("modern")).toBe("modern");
		expect(resolveTemplateKey("classic")).toBe("classic");
		expect(resolveTemplateKey("letterhead")).toBe("letterhead");
	});
	it("falls back to classic for unknown / null stored keys", () => {
		expect(resolveTemplateKey("bogus")).toBe("classic");
		expect(resolveTemplateKey(null)).toBe("classic");
		expect(resolveTemplateKey(undefined)).toBe("classic");
	});
});
