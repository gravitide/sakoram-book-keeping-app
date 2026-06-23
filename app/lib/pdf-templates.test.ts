import { describe, expect, it } from "vitest";
import { resolveTemplateKey } from "./pdf-templates";

describe("resolveTemplateKey", () => {
	it("returns the stored key when entitled and known", () => {
		expect(resolveTemplateKey("modern", true)).toBe("modern");
		expect(resolveTemplateKey("classic", true)).toBe("classic");
	});
	it("forces classic when not entitled (downgrade-safe)", () => {
		expect(resolveTemplateKey("modern", false)).toBe("classic");
	});
	it("falls back to classic for unknown / null stored keys", () => {
		expect(resolveTemplateKey("bogus", true)).toBe("classic");
		expect(resolveTemplateKey(null, true)).toBe("classic");
		expect(resolveTemplateKey(undefined, true)).toBe("classic");
	});
});
