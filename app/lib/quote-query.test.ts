import { describe, expect, it } from "vitest";
import { buildQuoteWhere, resolveQuoteSortColumn } from "./quote-query";

const empty = {
	search: "",
	statusFilters: [] as string[],
	clientFilter: "all" as const,
	issuedFrom: null,
	issuedTo: null,
	validFrom: null,
	validTo: null
};

describe("buildQuoteWhere", () => {
	it("returns an empty clause when no filters are set", () => {
		expect(buildQuoteWhere(empty)).toEqual({ sql: "", params: [] });
	});

	it("builds a status IN clause with one param per status", () => {
		const r = buildQuoteWhere({ ...empty, statusFilters: ["draft", "sent"] });
		expect(r.sql).toBe("status IN (?, ?)");
		expect(r.params).toEqual(["draft", "sent"]);
	});

	it("filters by client_id only when not 'all'", () => {
		expect(buildQuoteWhere({ ...empty, clientFilter: 7 })).toEqual({
			sql: "client_id = ?",
			params: [7]
		});
	});

	it("builds inclusive date bounds for issue + valid", () => {
		const r = buildQuoteWhere({
			...empty,
			issuedFrom: "2026-01-01",
			issuedTo: "2026-03-31",
			validFrom: "2026-02-01",
			validTo: "2026-04-30"
		});
		expect(r.sql).toBe("issue_date >= ? AND issue_date <= ? AND valid_until >= ? AND valid_until <= ?");
		expect(r.params).toEqual(["2026-01-01", "2026-03-31", "2026-02-01", "2026-04-30"]);
	});

	it("builds a 3-column LIKE for search with %q% params", () => {
		const r = buildQuoteWhere({ ...empty, search: "  Acme  " });
		expect(r.sql).toBe("(LOWER(number) LIKE ? OR LOWER(project_title) LIKE ? OR LOWER(client_name) LIKE ?)");
		expect(r.params).toEqual(["%acme%", "%acme%", "%acme%"]);
	});

	it("combines multiple predicates with AND, params in order", () => {
		const r = buildQuoteWhere({ ...empty, statusFilters: ["sent"], clientFilter: 3, search: "x" });
		expect(r.sql).toBe("status IN (?) AND client_id = ? AND (LOWER(number) LIKE ? OR LOWER(project_title) LIKE ? OR LOWER(client_name) LIKE ?)");
		expect(r.params).toEqual(["sent", 3, "%x%", "%x%", "%x%"]);
	});
});

describe("resolveQuoteSortColumn", () => {
	it("maps synthetic fields to real columns", () => {
		expect(resolveQuoteSortColumn("_client")).toBe("client_name");
		expect(resolveQuoteSortColumn("_status")).toBe("status");
	});
	it("passes real columns through", () => {
		expect(resolveQuoteSortColumn("issue_date")).toBe("issue_date");
		expect(resolveQuoteSortColumn("total_cents")).toBe("total_cents");
	});
	it("returns null for unknown / null fields", () => {
		expect(resolveQuoteSortColumn("hacky; DROP TABLE")).toBeNull();
		expect(resolveQuoteSortColumn(null)).toBeNull();
	});
});
