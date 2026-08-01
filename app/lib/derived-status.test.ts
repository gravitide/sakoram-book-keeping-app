import { describe, expect, it } from "vitest";
import {
	billDerivedFrom,
	clientDerivedFrom,
	deriveBillStatus,
	deriveInvoiceStatus,
	derivePayslipStatus,
	invoiceDerivedFrom,
	payslipDerivedFrom
} from "./derived-status";

const TODAY = "2026-06-16";

// Signature is (persisted, paid, credited, total, dueDate, today). These
// pre-credit cases pass 0 credit, which is the faithful translation of what
// they asserted before credit notes entered the derivation.
describe("deriveInvoiceStatus", () => {
	it("honours persisted draft/cancelled first", () => {
		expect(deriveInvoiceStatus("draft", 0, 0, 1000, "2020-01-01", TODAY)).toBe("draft");
		expect(deriveInvoiceStatus("cancelled", 0, 0, 1000, "2020-01-01", TODAY)).toBe("cancelled");
	});
	it("paid beats overdue beats partial beats sent (precedence)", () => {
		expect(deriveInvoiceStatus("sent", 1000, 0, 1000, "2020-01-01", TODAY)).toBe("paid"); // fully paid even if past due
		expect(deriveInvoiceStatus("sent", 400, 0, 1000, "2020-01-01", TODAY)).toBe("overdue"); // partly paid + past due
		expect(deriveInvoiceStatus("sent", 400, 0, 1000, "2030-01-01", TODAY)).toBe("partial"); // partly paid, not due
		expect(deriveInvoiceStatus("sent", 0, 0, 1000, "2020-01-01", TODAY)).toBe("overdue"); // unpaid + past due
		expect(deriveInvoiceStatus("sent", 0, 0, 1000, "2030-01-01", TODAY)).toBe("sent"); // unpaid, not due
	});
	it("zero-total never reads as paid", () => {
		expect(deriveInvoiceStatus("sent", 0, 0, 0, "2030-01-01", TODAY)).toBe("sent");
	});
});

describe("deriveInvoiceStatus with credit notes", () => {
	it("still reports paid when cash alone covers the total", () => {
		expect(deriveInvoiceStatus("sent", 1000, 0, 1000, "2026-07-01", TODAY)).toBe("paid");
		// Credit on top of full cash payment doesn't downgrade it.
		expect(deriveInvoiceStatus("sent", 1000, 500, 1000, "2026-07-01", TODAY)).toBe("paid");
	});

	it("reports credited when credit alone closes the invoice", () => {
		expect(deriveInvoiceStatus("sent", 0, 1000, 1000, "2026-07-01", TODAY)).toBe("credited");
	});

	it("reports credited when cash plus credit close the invoice", () => {
		expect(deriveInvoiceStatus("sent", 400, 600, 1000, "2026-07-01", TODAY)).toBe("credited");
	});

	it("reports credited even when the invoice is past due", () => {
		expect(deriveInvoiceStatus("sent", 0, 1000, 1000, "2020-01-01", TODAY)).toBe("credited");
	});

	it("reports partial when credit only covers part of the total", () => {
		expect(deriveInvoiceStatus("sent", 0, 400, 1000, "2030-01-01", TODAY)).toBe("partial");
	});

	it("still reports overdue when a part-credited invoice is past due", () => {
		expect(deriveInvoiceStatus("sent", 0, 400, 1000, "2020-01-01", TODAY)).toBe("overdue");
	});

	it("keeps draft and cancelled sticky regardless of credit", () => {
		expect(deriveInvoiceStatus("draft", 0, 5000, 1000, "2020-01-01", TODAY)).toBe("draft");
		expect(deriveInvoiceStatus("cancelled", 0, 5000, 1000, "2020-01-01", TODAY)).toBe("cancelled");
	});

	it("handles over-crediting without breaking", () => {
		expect(deriveInvoiceStatus("sent", 0, 5000, 1000, "2026-07-01", TODAY)).toBe("credited");
	});

	it("zero-total never reads as credited", () => {
		expect(deriveInvoiceStatus("sent", 0, 500, 0, "2030-01-01", TODAY)).toBe("partial");
	});
});

describe("invoiceDerivedFrom credit join", () => {
	it("joins issued credit notes and floors the balance at zero", () => {
		const sql = invoiceDerivedFrom(TODAY);
		expect(sql).toContain("credit_notes");
		expect(sql).toContain("status = 'issued'");
		expect(sql).toContain("source_invoice_id");
		expect(sql).toContain("_credited");
		expect(sql).toContain("MAX(0,");
		expect(sql).toContain("'credited'");
	});
});

describe("clientDerivedFrom credit netting", () => {
	it("nets linked credits and subtracts unapplied client-level credits", () => {
		const sql = clientDerivedFrom();
		expect(sql).toContain("credit_notes");
		expect(sql).toContain("source_invoice_id IS NULL");
		expect(sql).toContain("MAX(0,");
	});
});

describe("deriveBillStatus", () => {
	it("mirrors invoices minus the draft state", () => {
		expect(deriveBillStatus("cancelled", 0, 1000, "2020-01-01", TODAY)).toBe("cancelled");
		expect(deriveBillStatus("open", 1000, 1000, "2020-01-01", TODAY)).toBe("paid");
		expect(deriveBillStatus("open", 400, 1000, "2020-01-01", TODAY)).toBe("overdue");
		expect(deriveBillStatus("open", 400, 1000, "2030-01-01", TODAY)).toBe("partial");
		expect(deriveBillStatus("open", 0, 1000, "2030-01-01", TODAY)).toBe("unpaid");
	});
});

describe("derivePayslipStatus", () => {
	it("has no overdue concept", () => {
		expect(derivePayslipStatus("cancelled", 0, 1000)).toBe("cancelled");
		expect(derivePayslipStatus("draft", 0, 1000)).toBe("draft");
		expect(derivePayslipStatus("issued", 1000, 1000)).toBe("paid");
		expect(derivePayslipStatus("issued", 400, 1000)).toBe("partial");
		expect(derivePayslipStatus("issued", 0, 1000)).toBe("unpaid");
	});
});

describe("fROM builders", () => {
	it("invoice FROM exposes _paid/_balance/_status and inlines today", () => {
		const sql = invoiceDerivedFrom(TODAY);
		expect(sql).toContain("AS _paid");
		expect(sql).toContain("AS _balance");
		expect(sql).toContain("AS _status");
		expect(sql).toContain(`i.due_date < '${TODAY}'`);
		expect(sql).toContain("FROM invoices i");
		expect(sql).toContain("voucher_type = 'receipt'");
		expect(sql.trim().endsWith(") sub")).toBe(true);
	});
	it("bill FROM uses payment vouchers and has no draft branch", () => {
		const sql = billDerivedFrom(TODAY);
		expect(sql).toContain("FROM bills b");
		expect(sql).toContain("voucher_type = 'payment'");
		expect(sql).not.toContain("'draft'");
	});
	it("payslip FROM has no overdue/due_date branch", () => {
		const sql = payslipDerivedFrom(TODAY);
		expect(sql).toContain("FROM payslips p");
		expect(sql).not.toContain("overdue");
		expect(sql).not.toContain("due_date");
	});

	it("client FROM exposes _outstanding over open ('sent', balance>0) invoices", () => {
		const sql = clientDerivedFrom();
		expect(sql).toContain("AS _outstanding");
		expect(sql).toContain("FROM clients c");
		expect(sql).toContain("i.status = 'sent'");
		expect(sql).toContain("voucher_type = 'receipt'");
		expect(sql.trim().endsWith(") sub")).toBe(true);
	});
});
