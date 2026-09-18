import { describe, expect, it } from "vitest";
import { queryInt, queryString, withoutQueryKeys } from "./route-query";

describe("queryString", () => {
	it("returns a plain string value", () => {
		expect(queryString("2026-06-20")).toBe("2026-06-20");
	});

	it("takes the first entry of a repeated param", () => {
		expect(queryString(["a", "b"])).toBe("a");
	});

	it("treats missing / empty / null as null", () => {
		expect(queryString(undefined)).toBeNull();
		expect(queryString(null)).toBeNull();
		expect(queryString("")).toBeNull();
		expect(queryString([])).toBeNull();
		expect(queryString([null])).toBeNull();
	});
});

describe("queryInt", () => {
	it("parses a numeric id", () => {
		expect(queryInt("7")).toBe(7);
		expect(queryInt(["12"])).toBe(12);
	});

	it("rejects anything that is not a finite integer", () => {
		expect(queryInt("abc")).toBeNull();
		expect(queryInt("1.5")).toBeNull();
		expect(queryInt("")).toBeNull();
		expect(queryInt(undefined)).toBeNull();
	});
});

describe("withoutQueryKeys", () => {
	it("drops the consumed keys and keeps the rest", () => {
		expect(withoutQueryKeys({ new: "1", issued: "2026-06-20", tab: "x" }, ["new", "issued"]))
			.toEqual({ tab: "x" });
	});

	it("does not mutate its input", () => {
		const q = { new: "1" };
		withoutQueryKeys(q, ["new"]);
		expect(q).toEqual({ new: "1" });
	});
});
