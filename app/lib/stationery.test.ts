import { describe, expect, it } from "vitest";
import { parseStationery, resolveStationeryMode, serializeStationery } from "./stationery";

const DEFAULT_PREPRINTED = { top: 55, right: 18, bottom: 20, left: 18 };

describe("parseStationery", () => {
	it("gives Pre-printed paper today's letter bands (55 mm top, 20 mm bottom) when nothing is stored", () => {
		expect(parseStationery(null).preprinted).toEqual(DEFAULT_PREPRINTED);
	});

	it("reads the business's stored Pre-printed paper bands", () => {
		const json = JSON.stringify({ preprinted: { top: 45, right: 15, bottom: 18, left: 15 } });
		expect(parseStationery(json).preprinted).toEqual({ top: 45, right: 15, bottom: 18, left: 15 });
	});

	it("falls back to the defaults when the stored text isn't JSON", () => {
		expect(parseStationery("{not json").preprinted).toEqual(DEFAULT_PREPRINTED);
	});

	it("falls back to the defaults when the JSON isn't an object", () => {
		expect(parseStationery("[1, 2]").preprinted).toEqual(DEFAULT_PREPRINTED);
		expect(parseStationery("42").preprinted).toEqual(DEFAULT_PREPRINTED);
	});

	it("keeps the good bands and defaults only the bad one", () => {
		const json = JSON.stringify({ preprinted: { top: "tall", right: 15, bottom: -4, left: 15 } });
		expect(parseStationery(json).preprinted).toEqual({ top: 55, right: 15, bottom: 20, left: 15 });
	});

	it("defaults a missing band", () => {
		expect(parseStationery(JSON.stringify({ preprinted: { top: 40 } })).preprinted).toEqual({ ...DEFAULT_PREPRINTED, top: 40 });
	});

	it("refuses a band too deep to leave any room on the page", () => {
		const json = JSON.stringify({ preprinted: { top: 400, right: 18, bottom: 20, left: 18 } });
		expect(parseStationery(json).preprinted.top).toBe(55);
	});

	it("round-trips through serializeStationery", () => {
		const s = parseStationery(JSON.stringify({ preprinted: { top: 61.5, right: 12, bottom: 22, left: 12 } }));
		expect(parseStationery(serializeStationery(s))).toEqual(s);
	});
});

describe("resolveStationeryMode", () => {
	it("returns the stored mode when the app can render it", () => {
		expect(resolveStationeryMode("builtin")).toBe("builtin");
		expect(resolveStationeryMode("preprinted")).toBe("preprinted");
	});

	it("falls back to Built-in for anything missing or unknown", () => {
		expect(resolveStationeryMode(null)).toBe("builtin");
		expect(resolveStationeryMode(undefined)).toBe("builtin");
		expect(resolveStationeryMode("letterhead")).toBe("builtin");
	});
});
