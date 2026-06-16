import { describe, expect, it } from "vitest";
import { andClauses, likeClause, makeSortResolver } from "./list-query";

describe("likeClause", () => {
	it("returns an empty fragment for blank search", () => {
		expect(likeClause("   ", ["name"])).toEqual({ sql: "", params: [] });
	});

	it("returns an empty fragment when no columns are given", () => {
		expect(likeClause("acme", [])).toEqual({ sql: "", params: [] });
	});

	it("oRs lowercased LIKE across each column with one %q% param each", () => {
		const r = likeClause("  AcMe  ", ["name", "email"]);
		expect(r.sql).toBe("(LOWER(name) LIKE ? OR LOWER(email) LIKE ?)");
		expect(r.params).toEqual(["%acme%", "%acme%"]);
	});
});

describe("andClauses", () => {
	it("drops empty fragments and ANDs the rest, params in order", () => {
		const r = andClauses([
			{ sql: "is_archived = ?", params: [0] },
			{ sql: "", params: [] },
			{ sql: "(LOWER(name) LIKE ?)", params: ["%x%"] }
		]);
		expect(r.sql).toBe("is_archived = ? AND (LOWER(name) LIKE ?)");
		expect(r.params).toEqual([0, "%x%"]);
	});

	it("yields an empty fragment when everything is empty", () => {
		expect(andClauses([{ sql: "", params: [] }])).toEqual({ sql: "", params: [] });
	});
});

describe("makeSortResolver", () => {
	const resolve = makeSortResolver(["name", "created_at"]);
	it("allows listed columns", () => {
		expect(resolve("name")).toBe("name");
		expect(resolve("created_at")).toBe("created_at");
	});
	it("rejects unlisted / null fields (injection guard)", () => {
		expect(resolve("name; DROP TABLE")).toBeNull();
		expect(resolve(null)).toBeNull();
	});

	it("maps fields to custom expressions when given a record", () => {
		const r = makeSortResolver({ name: "name COLLATE NOCASE", total_cents: "total_cents" });
		expect(r("name")).toBe("name COLLATE NOCASE");
		expect(r("total_cents")).toBe("total_cents");
		expect(r("nope")).toBeNull();
		expect(r(null)).toBeNull();
	});
});
