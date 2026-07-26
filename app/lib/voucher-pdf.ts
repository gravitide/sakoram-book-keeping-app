// Shared voucher-PDF payload builder.
//
// Lifted out of `app/pages/vouchers/[id].vue` so the vouchers list
// page can offer "Generate PDF" as a row action and a bulk export
// without re-deriving the same field mapping.
//
// Vouchers use a different Typst template (voucher.typ — one-page
// receipt layout with a big amount up top) so the payload shape is
// markedly smaller than quote/invoice/bill: no line items, no totals
// block. Receipts paint the amount green, payments red.

import type { CompanySettingsRow } from "~/stores/settings";
import type { VoucherMethod, VoucherRow } from "~/stores/vouchers";
import { formatLKR } from "~/lib/money";
import { buildFooterBlocks } from "~/lib/pdf-chrome";
import { pdfThemeHex } from "~/lib/theme";

export interface VoucherPdfArgs {
	row: VoucherRow
	settings: CompanySettingsRow | null
	currency: { code: string, symbol: string }
	/**
	 * Pre-resolved "Invoice INV-2026-0001" / "Bill BIL-…" /
	 * "Payslip PSL-…" label to print under the linked-document line.
	 * The detail page can look this up live from the matching store;
	 * the bulk loop on the list page does the same lookup once per
	 * voucher and threads the result through here.
	 */
	relatedLabel: string | null
}

const methodFriendlyLabel = (m: VoucherMethod | null): string | null => {
	if (!m) return null;
	return ({
		bank_transfer: "Bank transfer",
		cash: "Cash",
		cheque: "Cheque",
		card: "Card",
		other: "Other"
	} as const)[m] ?? m;
};

export const buildVoucherPdfPayload = ({ row: v, settings, currency, relatedLabel }: VoucherPdfArgs) => {
	const isReceiptDoc = v.voucher_type === "receipt";
	const partyLabel = isReceiptDoc ? "Received from" : "Paid to";
	const counterSig = isReceiptDoc ? "Received by" : "Paid to (signature)";
	// Hand-picked hex matches the StatusBadge palette (success / error)
	// without dragging Tailwind theme tokens into the Typst payload.
	const amountColor = isReceiptDoc ? "#16a34a" : "#dc2626";

	// LKR amount string. formatLKR returns "LKR 1,234.56" with the
	// symbol; the voucher template re-adds its own currency label so we
	// strip the prefix here.
	const amountDisplay = formatLKR(v.amount_cents, { withSymbol: false });

	return {
		number: v.number,
		title: isReceiptDoc ? "Receipt voucher" : "Payment voucher",
		theme_color: pdfThemeHex(settings),
		font_family: settings?.pdf_font ?? "Akt",
		currency_code: currency.code,
		currency_symbol: currency.symbol,
		voucher_date: v.voucher_date,
		amount_display: amountDisplay,
		amount_color: amountColor,
		party_label: partyLabel,
		party_name: v.party_name,
		method_display: methodFriendlyLabel(v.payment_method),
		reference: v.reference ?? null,
		description: v.description ?? null,
		related_label: relatedLabel,
		counter_signature_label: counterSig,
		business_name: settings?.business_name ?? null,
		website: settings?.website ?? null,
		phone: settings?.phone ?? null,
		logo_scale: settings?.pdf_logo_scale ?? 100,
		footer_blocks: buildFooterBlocks(settings),
		logo_path: settings?.pdf_header_logo_path ?? null
	};
};

// Resolve the "linked-document" label string for a voucher by looking
// up the linked invoice / bill / payslip in their respective stores
// (kept here so callers — both detail page and bulk loop — share one
// implementation). Returns null when no link is set or the linked row
// can't be found.
export interface RelatedLabelStores {
	invoices: { invoices: { id: number, number: string }[] }
	bills: { bills: { id: number, number: string }[] }
	payslips: { payslips: { id: number, number: string }[] }
}

export const resolveVoucherRelatedLabel = (
	v: VoucherRow,
	stores: RelatedLabelStores
): string | null => {
	if (v.voucher_type === "receipt") {
		if (v.related_invoice_id !== null) {
			const inv = stores.invoices.invoices.find((i) => i.id === v.related_invoice_id);
			if (inv) return `Invoice ${inv.number}`;
		}
		return null;
	}
	// Payment vouchers: bill wins over payslip when both are set —
	// the UI dropdowns are mutually exclusive in spirit, schema allows
	// both columns, prefer the more common case.
	if (v.related_bill_id !== null) {
		const bill = stores.bills.bills.find((b) => b.id === v.related_bill_id);
		if (bill) return `Bill ${bill.number}`;
	}
	if (v.related_payslip_id !== null) {
		const ps = stores.payslips.payslips.find((p) => p.id === v.related_payslip_id);
		if (ps) return `Payslip ${ps.number}`;
	}
	return null;
};
