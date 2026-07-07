import { describe, expect, it } from "vitest";
import { hasAcceptedTerms, TERMS_VERSION } from "./terms";

describe("hasAcceptedTerms", () => {
	it("true when the stored version matches the current one", () => {
		expect(hasAcceptedTerms(TERMS_VERSION)).toBe(true);
	});
	it("false when nothing is stored", () => {
		expect(hasAcceptedTerms(null)).toBe(false);
	});
	it("false when an older version was accepted (forces re-accept)", () => {
		expect(hasAcceptedTerms("0000-00-00")).toBe(false);
	});
});
