-- Optional signature lines on the payslip PDF.
--
-- payslip.typ used to render an unconditional two-column sign-off
-- ("Authorised by" / "Received by (employee)") plus a 72pt lead-in at the
-- foot of every payslip. A business that pays by bank transfer and never
-- collects a physical acknowledgement got two ruled lines it never used.
--
-- Business-wide rather than per-payslip: a business either wants sign-off
-- lines or it doesn't, and a per-payslip flag would fight the
-- issued-payslips-are-immutable rule plus make bulk PDF export
-- inhomogeneous. Defaults OFF, so existing tenants stop printing the block
-- until they opt in on /settings/payroll.

ALTER TABLE company_settings
	ADD COLUMN payslip_show_signatures INTEGER NOT NULL DEFAULT 0;
