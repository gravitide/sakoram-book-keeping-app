import { describe, expect, it } from "vitest";
import { sampleInvoicePayload } from "./sample-pdf";

const currency = { code: "LKR", symbol: "Rs" };

describe("sampleInvoicePayload", () => {
	it("builds a well-formed invoice payload with the given template key", () => {
		const p = sampleInvoicePayload(null, currency, "modern");
		expect(p.template).toBe("modern");
		expect(p.primary_label).toBe("Invoice");
		expect(p.kind).toBe("invoice");
		expect(Array.isArray(p.lines)).toBe(true);
		expect((p.lines as unknown[]).length).toBeGreaterThan(0);
		expect(p.number).toBeTruthy();
		expect(p.party).toBeTruthy();
		expect(p.formatted).toBeTruthy();
		expect(p.currency_symbol).toBe("Rs");
	});
});
