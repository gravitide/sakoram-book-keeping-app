-- Phase: payroll — link payment vouchers back to a payslip.
--
-- Same pattern as related_bill_id / related_invoice_id. A payment
-- voucher with related_payslip_id set is the *only* way money flow
-- against a payslip is recorded. The payslip's persisted status
-- stays draft|issued|cancelled — the unpaid / partial / paid view
-- in the UI is derived from the sum of linked payment vouchers,
-- mirroring how bills work.
--
-- ON DELETE SET NULL: if a payslip is deleted, the voucher row
-- stays (it represents real cash that left the bank) but loses its
-- payslip link. Same trade-off bills made.

ALTER TABLE vouchers ADD COLUMN related_payslip_id INTEGER REFERENCES payslips(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vouchers_related_payslip ON vouchers(related_payslip_id);
