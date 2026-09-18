import type { InvoiceRow } from "~/stores/invoices";
import { describe, expect, it } from "vitest";
import { buildInvoicePdfPayload } from "./invoice-pdf";

const currency = { code: "LKR", symbol: "Rs" };

const invoice = (total_cents: number): InvoiceRow => ({
	id: 1,
	number: "INV-0010",
	client_id: 1,
	client_snapshot: JSON.stringify({ name: "Client A" }),
	client_name: "Client A",
	source_quote_id: null,
	issue_date: "2026-04-01",
	due_date: "2026-05-01",
	status: "sent",
	pricing_mode: "bundle",
	project_title: "",
	vat_rate_basis_points: 0,
	subtotal_cents: total_cents,
	tax_cents: 0,
	total_cents,
	notes: null,
	terms: null,
	prepared_by: null,
	bank_details_snapshot: null,
	business_bank_id: null,
	title_override: null,
	created_at: "2026-04-01 00:00:00",
	updated_at: "2026-04-01 00:00:00"
});

const build = (total: number, paidCents: number, creditedCents?: number) =>
	buildInvoicePdfPayload({ row: invoice(total), lines: [], settings: null, currency, paidCents, creditedCents });

describe("buildInvoicePdfPayload — paid / credited / balance", () => {
	it("prints no settlement block on a freshly issued invoice", () => {
		const p = build(1_000_000, 0, 0);
		expect(p.paid_cents).toBeNull();
		expect(p.credited_cents).toBeNull();
		expect(p.balance_display).toBeNull();
	});

	it("receipts only: unchanged — balance is total minus paid, no credited row", () => {
		const p = build(1_000_000, 400_000);
		expect(p.paid_display).toBe("4,000.00");
		expect(p.credited_cents).toBeNull();
		expect(p.credited_display).toBeNull();
		expect(p.balance_display).toBe("6,000.00");
	});

	// The bug: balance was total − receipts, and the block was gated on
	// receipts > 0 — so an invoice settled entirely by an issued credit note
	// went to the client showing no settlement at all, i.e. fully due.
	it("fully credited with zero receipts prints the credit and a zero balance", () => {
		const p = build(1_000_000, 0, 1_000_000);
		expect(p.paid_cents).toBeNull();
		expect(p.credited_cents).toBe(1_000_000);
		expect(p.credited_display).toBe("10,000.00");
		expect(p.balance_display).toBe("0.00");
	});

	it("mixed cash + credit settles to zero", () => {
		const p = build(1_000_000, 400_000, 600_000);
		expect(p.paid_display).toBe("4,000.00");
		expect(p.credited_display).toBe("6,000.00");
		expect(p.balance_display).toBe("0.00");
	});

	it("floors an over-credited balance at zero", () => {
		expect(build(1_000_000, 500_000, 900_000).balance_display).toBe("0.00");
	});
});
