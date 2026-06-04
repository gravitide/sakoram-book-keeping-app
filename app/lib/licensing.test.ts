import { describe, expect, it } from "vitest";
import { BUSINESS_LIMITS, hasFeature, Tier } from "./licensing";

describe("hasFeature", () => {
	it("basic gets core features, not plus/premium", () => {
		expect(hasFeature(Tier.Basic, "invoices")).toBe(true);
		expect(hasFeature(Tier.Basic, "reports.profit_loss")).toBe(true);
		expect(hasFeature(Tier.Basic, "recurring")).toBe(false);
		expect(hasFeature(Tier.Basic, "payroll")).toBe(false);
	});
	it("plus gets plus features, not premium", () => {
		expect(hasFeature(Tier.Plus, "recurring")).toBe(true);
		expect(hasFeature(Tier.Plus, "encryption")).toBe(true);
		expect(hasFeature(Tier.Plus, "payroll")).toBe(false);
	});
	it("premium gets everything", () => {
		expect(hasFeature(Tier.Premium, "payroll")).toBe(true);
		expect(hasFeature(Tier.Premium, "recurring")).toBe(true);
	});
	it("unknown feature keys default to available (never accidentally lock core)", () => {
		expect(hasFeature(Tier.Basic, "totally.unknown")).toBe(true);
	});
});

describe("business limits", () => {
	it("basic caps at 2; plus/premium unlimited", () => {
		expect(BUSINESS_LIMITS[Tier.Basic]).toBe(2);
		expect(BUSINESS_LIMITS[Tier.Plus]).toBe(Number.POSITIVE_INFINITY);
		expect(BUSINESS_LIMITS[Tier.Premium]).toBe(Number.POSITIVE_INFINITY);
	});
});
