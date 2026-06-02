import { describe, expect, it } from "vitest";
import { resolveTenantGuard } from "./tenant-route";

describe("resolveTenantGuard", () => {
	it("sends you to /welcome when no business is active", () => {
		const s = { activeId: null, activeLocked: false, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/")).toEqual({ redirect: "/welcome" });
		expect(resolveTenantGuard(s, "/invoices")).toEqual({ redirect: "/welcome" });
	});

	it("allows /welcome itself with no active business", () => {
		const s = { activeId: null, activeLocked: false, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/welcome")).toBeNull();
	});

	it("sends you to /unlock when the active business is locked", () => {
		const s = { activeId: "acme", activeLocked: true, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/")).toEqual({ redirect: "/unlock" });
		expect(resolveTenantGuard(s, "/invoices")).toEqual({ redirect: "/unlock" });
	});

	it("allows /unlock and /welcome while locked (welcome is the escape hatch)", () => {
		const s = { activeId: "acme", activeLocked: true, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/unlock")).toBeNull();
		expect(resolveTenantGuard(s, "/welcome")).toBeNull();
	});

	it("proceeds normally when the active business is open", () => {
		const s = { activeId: "acme", activeLocked: false, hasDbUrl: true };
		expect(resolveTenantGuard(s, "/")).toBeNull();
		expect(resolveTenantGuard(s, "/invoices")).toBeNull();
	});

	it("bounces /unlock to / when already unlocked", () => {
		const s = { activeId: "acme", activeLocked: false, hasDbUrl: true };
		expect(resolveTenantGuard(s, "/unlock")).toEqual({ redirect: "/" });
	});

	it("falls back to /welcome if active but somehow no db url and not locked", () => {
		const s = { activeId: "acme", activeLocked: false, hasDbUrl: false };
		expect(resolveTenantGuard(s, "/invoices")).toEqual({ redirect: "/welcome" });
	});
});
