import { describe, expect, it } from "vitest";
import { parseCsv } from "./useCsvParser";

describe("parseCsv", () => {
	it("parses a simple CSV with a header row", () => {
		const csv = "Date,Amount,Description\n2026-05-01,1000,RENT\n2026-05-02,-50,FEE";
		const result = parseCsv(csv);
		expect(result.headers).toEqual(["Date", "Amount", "Description"]);
		expect(result.rows).toEqual([
			["2026-05-01", "1000", "RENT"],
			["2026-05-02", "-50", "FEE"]
		]);
	});

	it("handles quoted fields containing commas", () => {
		const csv = "A,B\n\"hello, world\",2";
		const result = parseCsv(csv);
		expect(result.rows).toEqual([["hello, world", "2"]]);
	});

	it("handles escaped quotes (\"\")", () => {
		const csv = "A\n\"she said \"\"hi\"\"\"";
		const result = parseCsv(csv);
		expect(result.rows).toEqual([["she said \"hi\""]]);
	});

	it("handles CRLF line endings", () => {
		const csv = "A,B\r\n1,2\r\n3,4";
		const result = parseCsv(csv);
		expect(result.rows).toEqual([["1", "2"], ["3", "4"]]);
	});

	it("handles trailing newline", () => {
		const csv = "A,B\n1,2\n";
		const result = parseCsv(csv);
		expect(result.rows).toEqual([["1", "2"]]);
	});

	it("handles empty fields", () => {
		const csv = "A,B,C\n1,,3";
		const result = parseCsv(csv);
		expect(result.rows).toEqual([["1", "", "3"]]);
	});

	it("strips UTF-8 BOM", () => {
		const csv = "﻿A,B\n1,2";
		const result = parseCsv(csv);
		expect(result.headers).toEqual(["A", "B"]);
	});

	it("returns empty rows for header-only input", () => {
		const csv = "A,B,C";
		const result = parseCsv(csv);
		expect(result.headers).toEqual(["A", "B", "C"]);
		expect(result.rows).toEqual([]);
	});
});
