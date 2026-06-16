import { describe, expect, it } from "vitest";
import {
	buildBillEvent,
	buildInvoiceEvent,
	buildPayslipEvent,
	buildQuoteEvent,
	computeGridWindow,
} from "./calendar-events";

describe("computeGridWindow", () => {
	it("spans the 42-cell grid from the Sunday on/before the 1st", () => {
		// June 2026: the 1st is a Monday, so the grid starts on Sun May 31.
		expect(computeGridWindow(2026, 5)).toEqual({ from: "2026-05-31", to: "2026-07-11" });
	});

	it("starts on the 1st when the month begins on a Sunday", () => {
		// Feb 2026: the 1st is a Sunday.
		expect(computeGridWindow(2026, 1)).toEqual({ from: "2026-02-01", to: "2026-03-14" });
	});
});

describe("buildInvoiceEvent", () => {
	const row = {
		id: 7,
		number: "INV-2026-0007",
		due_date: "2026-06-20",
		client_name: "Acme",
		total_cents: 10000,
		paid_cents: 4000,
	};

	it("builds an event for a partially-paid invoice", () => {
		const e = buildInvoiceEvent(row, "2026-06-16");
		expect(e).toMatchObject({
			id: "invoice:7",
			date: "2026-06-20",
			kind: "invoice",
			title: "INV-2026-0007",
			party: "Acme",
			amountCents: 10000,
			balanceCents: 6000,
			href: "/invoices/7",
			overdue: false,
		});
	});

	it("drops a fully-paid invoice", () => {
		expect(buildInvoiceEvent({ ...row, paid_cents: 10000 }, "2026-06-16")).toBeNull();
	});

	it("flags overdue when due_date is before today and a balance remains", () => {
		expect(buildInvoiceEvent({ ...row, due_date: "2026-06-10" }, "2026-06-16")?.overdue).toBe(true);
	});

	it("falls back to an em dash when client_name is null", () => {
		expect(buildInvoiceEvent({ ...row, client_name: null }, "2026-06-16")?.party).toBe("—");
	});
});

describe("buildBillEvent", () => {
	it("drops a fully-paid bill and builds an open one", () => {
		const row = { id: 3, number: "BILL-1", due_date: "2026-06-20", vendor_name: "V", total_cents: 5000, paid_cents: 0 };
		expect(buildBillEvent(row, "2026-06-16")).toMatchObject({ id: "bill:3", kind: "bill", balanceCents: 5000, href: "/bills/3" });
		expect(buildBillEvent({ ...row, paid_cents: 5000 }, "2026-06-16")).toBeNull();
	});
});

describe("buildQuoteEvent", () => {
	it("always builds (no balance gate) and flags expiry", () => {
		const row = { id: 9, number: "QUO-9", valid_until: "2026-06-10", client_name: "C", total_cents: 8000 };
		const e = buildQuoteEvent(row, "2026-06-16");
		expect(e).toMatchObject({ id: "quote:9", kind: "quote", balanceCents: 8000, amountCents: 8000, href: "/quotes/9", overdue: true });
	});
});

describe("buildPayslipEvent", () => {
	it("uses net_cents and drops fully-paid", () => {
		const row = { id: 4, number: "PSL-4", pay_date: "2026-06-25", employee_name: "E", net_cents: 12000, paid_cents: 0 };
		expect(buildPayslipEvent(row, "2026-06-16")).toMatchObject({ id: "payslip:4", kind: "payslip", amountCents: 12000, balanceCents: 12000, href: "/payslips/4" });
		expect(buildPayslipEvent({ ...row, paid_cents: 12000 }, "2026-06-16")).toBeNull();
	});
});
