import type { CompanySettingsRow } from "~/stores/settings";
import { describe, expect, it } from "vitest";
import { sampleInvoicePayload, sampleStationeryPreviewPayload } from "./sample-pdf";

const currency = { code: "LKR", symbol: "Rs" };

const on = (overrides: Partial<CompanySettingsRow>) => ({ business_name: "Lanka Design Studio", ...overrides }) as CompanySettingsRow;

// "1,234.50" → 123450 cents.
const cents = (display: string) => Math.round(Number(display.replace(/,/g, "")) * 100);

describe("sampleInvoicePayload", () => {
	it("builds a well-formed invoice payload with the given Layout key", () => {
		const p = sampleInvoicePayload(null, currency, "modern");
		expect(p.layout).toBe("modern");
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

describe("sampleStationeryPreviewPayload", () => {
	it("is an invoice on the business's own Stationery", () => {
		const p = sampleStationeryPreviewPayload(on({ pdf_stationery_mode: "preprinted", pdf_paper_size: "a5" }), currency, "compact");
		expect(p.kind).toBe("invoice");
		expect(p.layout).toBe("compact");
		expect(p.page.paper).toBe("a5");
		expect(p.page.stationery).toBe("preprinted");
	});

	it("runs to about 25 lines on A4 with Built-in stationery", () => {
		const n = sampleStationeryPreviewPayload(on({}), currency, "classic").lines.length;
		expect(n).toBeGreaterThanOrEqual(20);
		expect(n).toBeLessThanOrEqual(32);
	});

	it("adds lines on a taller Safe area and drops them on a shorter one, so it stays two pages", () => {
		const lines = (overrides: Partial<CompanySettingsRow>) => sampleStationeryPreviewPayload(on(overrides), currency, "classic").lines.length;
		const a4 = lines({ pdf_paper_size: "a4" });
		expect(lines({ pdf_paper_size: "us-legal" })).toBeGreaterThan(a4);
		expect(lines({ pdf_paper_size: "a5" })).toBeLessThan(a4);
		const deepBands = JSON.stringify({ preprinted: { top: 80, right: 18, bottom: 40, left: 18 } });
		const shallowBands = JSON.stringify({ preprinted: { top: 10, right: 18, bottom: 10, left: 18 } });
		expect(lines({ pdf_stationery_mode: "preprinted", pdf_stationery: deepBands }))
			.toBeLessThan(lines({ pdf_stationery_mode: "preprinted", pdf_stationery: shallowBands }));
	});

	it("always has at least one line, however deep the bands", () => {
		const bands = JSON.stringify({ preprinted: { top: 150, right: 18, bottom: 150, left: 18 } });
		const p = sampleStationeryPreviewPayload(on({ pdf_stationery_mode: "preprinted", pdf_stationery: bands, pdf_paper_size: "a5" }), currency, "classic");
		expect(p.lines.length).toBeGreaterThanOrEqual(1);
	});

	it("adds up: subtotal + VAT = total, and the subtotal is the lines' own amounts", () => {
		const p = sampleStationeryPreviewPayload(on({}), currency, "classic");
		const lineTotals = p.lines.reduce((sum, l) => sum + cents(l.total_display), 0);
		const { subtotal_no_symbol, tax_no_symbol, total_no_symbol } = p.formatted;
		expect(cents(subtotal_no_symbol) + cents(tax_no_symbol)).toBe(cents(total_no_symbol));
		expect(cents(total_no_symbol)).toBe(lineTotals);
		expect(cents(p.balance_display)).toBe(cents(total_no_symbol) - cents(p.paid_display));
	});

	it("prints the business's currency symbol", () => {
		const p = sampleStationeryPreviewPayload(on({}), { code: "USD", symbol: "$" }, "classic");
		expect(p.currency_symbol).toBe("$");
		expect(p.formatted.total.startsWith("$ ")).toBe(true);
	});
});
