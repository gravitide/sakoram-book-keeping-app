import { describe, expect, it } from "vitest";
import { buildPrimaryRamp, resolvePrimary, SHADES } from "./color-ramp";

const lightnessOf = (s: string): number => Number(/oklch\(([\d.]+)/.exec(s)![1]);
const chromaOf = (s: string): number => Number(/oklch\([\d.]+ ([\d.]+)/.exec(s)![1]);
const hueOf = (s: string): number => Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)/.exec(s)![1]);

describe("buildPrimaryRamp", () => {
	it("returns one entry per Tailwind shade", () => {
		const ramp = buildPrimaryRamp("#1d4ed8");
		expect(Object.keys(ramp)).toHaveLength(SHADES.length);
		for (const s of SHADES) expect(ramp[s]).toMatch(/^oklch\(/);
	});

	it("descends in lightness from 50 to 950", () => {
		const ramp = buildPrimaryRamp("#1d4ed8");
		const l = SHADES.map((s) => lightnessOf(ramp[s]!));
		for (let i = 1; i < l.length; i++) expect(l[i]!).toBeLessThan(l[i - 1]!);
	});

	it("forces a usable lightness even for a near-white pick", () => {
		// The whole point of taking only hue+chroma: an unusable input still
		// yields an accent at the standard 500 lightness.
		expect(lightnessOf(buildPrimaryRamp("#fffef8")[500]!)).toBeCloseTo(0.637, 3);
	});

	it("yields a grey ramp for a colourless input", () => {
		expect(chromaOf(buildPrimaryRamp("#808080")[500]!)).toBeLessThan(0.01);
	});

	it("preserves the input hue at shade 500", () => {
		// #1d4ed8 is blue — hue lands in the 250-275 range in OKLCH.
		const h = hueOf(buildPrimaryRamp("#1d4ed8")[500]!);
		expect(h).toBeGreaterThan(250);
		expect(h).toBeLessThan(275);
	});

	it("accepts shorthand hex and a missing leading hash", () => {
		expect(buildPrimaryRamp("#f00")[500]).toBe(buildPrimaryRamp("ff0000")[500]);
	});

	it("clamps the base chroma so an out-of-gamut pick can't blow past sRGB", () => {
		// The clamp caps shade 500 (the base). Shade 600 sits slightly above it
		// on purpose — Tailwind's 600 is more saturated than its 500.
		expect(chromaOf(buildPrimaryRamp("#ff00ff")[500]!)).toBeLessThanOrEqual(0.30);
		for (const s of SHADES) expect(chromaOf(buildPrimaryRamp("#ff00ff")[s]!)).toBeLessThanOrEqual(0.32);
	});

	it("falls back to a neutral ramp for unparseable input", () => {
		expect(chromaOf(buildPrimaryRamp("not-a-colour")[500]!)).toBe(0);
	});
});

describe("resolvePrimary", () => {
	it("builds a ramp for a hex", () => {
		const plan = resolvePrimary("#1d4ed8");
		expect(plan.kind).toBe("custom");
		if (plan.kind !== "custom") return;
		expect(Object.keys(plan.ramp)).toHaveLength(SHADES.length);
	});

	it("passes a known palette name through", () => {
		expect(resolvePrimary("violet")).toEqual({ kind: "named", name: "violet" });
	});

	it("falls back for an unknown name rather than trusting it", () => {
		// NuxtUI would turn an unrecognised name into var(--color-<name>-500),
		// which resolves to nothing and strips every accent in the app. A
		// legacy or hand-edited theme_color must not be able to do that.
		expect(resolvePrimary("purple")).toEqual({ kind: "named", name: "red" });
		expect(resolvePrimary("chartreuse; --evil: 1")).toEqual({ kind: "named", name: "red" });
		expect(resolvePrimary("#nothex")).toEqual({ kind: "named", name: "red" });
	});

	it("leaves the accent alone when nothing is stored yet", () => {
		// Settings load async; forcing a fallback here would flash the seeded
		// app.config colour to red and back on every boot.
		expect(resolvePrimary(null)).toEqual({ kind: "unset" });
		expect(resolvePrimary(undefined)).toEqual({ kind: "unset" });
		expect(resolvePrimary("   ")).toEqual({ kind: "unset" });
	});
});
