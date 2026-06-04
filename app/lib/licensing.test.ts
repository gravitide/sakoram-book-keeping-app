import { describe, expect, it } from "vitest";
import { BUSINESS_LIMITS, effectiveEntitlement, hasFeature, Tier, TRIAL_DAYS, trialDaysRemaining } from "./licensing";

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

describe("trialDaysRemaining", () => {
	it("counts down from TRIAL_DAYS", () => {
		expect(trialDaysRemaining("2026-06-01", "2026-06-01", "2026-06-01")).toBe(TRIAL_DAYS);
		expect(trialDaysRemaining("2026-06-01", "2026-06-11", "2026-06-11")).toBe(TRIAL_DAYS - 10);
	});
	it("never extends when the clock is rolled back (uses last_seen)", () => {
		expect(trialDaysRemaining("2026-06-01", "2026-06-02", "2026-06-20"))
			.toBe(trialDaysRemaining("2026-06-01", "2026-06-20", "2026-06-20"));
	});
	it("clamps at 0", () => {
		expect(trialDaysRemaining("2026-06-01", "2026-09-01", "2026-09-01")).toBe(0);
	});
});

describe("effectiveEntitlement", () => {
	const trialActive = { trialStart: "2026-06-01", lastSeen: "2026-06-05" };
	const trialExpired = { trialStart: "2026-06-01", lastSeen: "2026-09-01" };

	it("trial active -> Premium, isTrial true", () => {
		const e = effectiveEntitlement(null, trialActive, "2026-06-05");
		expect(e.tier).toBe(Tier.Premium);
		expect(e.isTrial).toBe(true);
		expect(e.trialDaysLeft).toBeGreaterThan(0);
	});
	it("trial expired, no key -> Basic", () => {
		const e = effectiveEntitlement(null, trialExpired, "2026-09-01");
		expect(e.tier).toBe(Tier.Basic);
		expect(e.isTrial).toBe(false);
	});
	it("a Plus key beats an expired trial", () => {
		const e = effectiveEntitlement(Tier.Plus, trialExpired, "2026-09-01");
		expect(e.tier).toBe(Tier.Plus);
		expect(e.isTrial).toBe(false);
	});
	it("a valid key during trial uses the higher of key/Premium-trial", () => {
		const e = effectiveEntitlement(Tier.Plus, trialActive, "2026-06-05");
		expect(e.tier).toBe(Tier.Premium);
	});
	it("exposes businessLimit for the effective tier", () => {
		expect(effectiveEntitlement(null, trialExpired, "2026-09-01").businessLimit).toBe(2);
	});
});
