import { describe, expect, it } from "vitest";
import { safeFolderName } from "./safe-folder-name";

describe("safeFolderName", () => {
	it("keeps a clean name", () => {
		expect(safeFolderName("Acme Trading")).toBe("Acme Trading");
	});
	it("strips illegal characters", () => {
		expect(safeFolderName("A/B:C*D?\"E<F>G|H\\I")).toBe("A-B-C-D--E-F-G-H-I");
	});
	it("removes control chars", () => {
		expect(safeFolderName(`Ac${String.fromCharCode(1)}me Co`)).toBe("Acme Co");
	});
	it("trims trailing dots and spaces (Windows)", () => {
		expect(safeFolderName("  Acme.  ")).toBe("Acme");
	});
	it("collapses whitespace", () => {
		expect(safeFolderName("Acme    Trading")).toBe("Acme Trading");
	});
	it("guards Windows reserved device names", () => {
		expect(safeFolderName("CON")).toBe("CON_");
		expect(safeFolderName("com1")).toBe("com1_");
		expect(safeFolderName("LPT9")).toBe("LPT9_");
		expect(safeFolderName("NUL")).toBe("NUL_");
	});
	it("does not treat CONsulting as reserved", () => {
		expect(safeFolderName("CONsulting")).toBe("CONsulting");
	});
	it("caps length at 64", () => {
		expect(safeFolderName("x".repeat(200))).toHaveLength(64);
	});
	it("falls back to 'business' when empty after sanitizing", () => {
		expect(safeFolderName("...")).toBe("business");
		expect(safeFolderName("///")).toBe("business");
		expect(safeFolderName("   ")).toBe("business");
	});
});
